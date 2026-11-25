import sharp from "sharp";
import { ProcessingError } from "./provider.mjs";
import { validateCutout } from "./images.mjs";

const id = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
export function photoPrefix(owner, item, revision) {
  if (
    !id.test(owner) ||
    !id.test(item) ||
    !Number.isSafeInteger(revision) ||
    revision < 1
  )
    throw new Error("invalid_identity");
  return owner + "/" + item + "/" + revision + "/";
}

async function getStored(bucket, path) {
  const response = await bucket.download(path);
  if (response.error) {
    const code = String(
      response.error.statusCode ?? response.error.status ?? "",
    );
    if (
      code === "404" ||
      /not found|does not exist/i.test(response.error.message)
    )
      return null;
    throw new ProcessingError("storage_unavailable", 20);
  }
  return Buffer.from(await response.data.arrayBuffer());
}

async function putImmutable(bucket, path, bytes, contentType) {
  const response = await bucket.upload(path, bytes, {
    contentType,
    upsert: false,
  });
  if (
    response.error &&
    !/already exists|duplicate/i.test(response.error.message)
  )
    throw new ProcessingError("storage_unavailable", 20);
}

export async function runOne(db, provider) {
  const { data, error } = await db.rpc("photo_claim");
  if (error) throw new Error("queue_unavailable");
  const job = data?.[0];
  if (!job) return false;
  let code = null,
    delay = null,
    reference = null;
  try {
    const prefix = photoPrefix(job.owner_id, job.item_id, job.revision);
    const bucket = db.storage.from("wardrobe");
    const current = await db
      .from("items")
      .select("original_path")
      .eq("owner_id", job.owner_id)
      .eq("id", job.item_id)
      .eq("revision", job.revision)
      .is("deleted_at", null)
      .eq("status", "running")
      .maybeSingle();
    if (current.error) throw new ProcessingError("database_unavailable", 15);
    if (current.data?.original_path !== prefix + "original")
      throw new ProcessingError("stale_revision");
    // A previous attempt may have stored the costly result before the DB acknowledged it.
    let cutout = await getStored(bucket, prefix + "cutout.png");
    if (!cutout) {
      const input = await getStored(bucket, prefix + "input.png");
      if (!input) throw new ProcessingError("missing_input");
      const { width, height } = await sharp(input).metadata();
      const output = await provider.remove(input, { width, height });
      cutout = output.bytes;
      reference = output.reference;
      await putImmutable(bucket, prefix + "cutout.png", cutout, "image/png");
    } else {
      cutout = await validateCutout(cutout);
    }
    const thumb = await sharp(cutout)
      .trim({ background: "#0000", threshold: 1, margin: 8 })
      .resize({
        width: 420,
        height: 500,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();
    await putImmutable(bucket, prefix + "thumb.webp", thumb, "image/webp");
  } catch (e) {
    code = e instanceof ProcessingError ? e.message : "processing_failed";
    if (e instanceof ProcessingError && e.delay !== null)
      delay = Math.max(e.delay, 10 * 2 ** (job.attempts - 1));
  }
  const complete = await db.rpc("photo_finish", {
    p_job: job.id,
    p_lease: job.lease,
    p_error: code,
    p_delay: delay,
    p_ref: reference,
  });
  if (complete.error) throw new Error("job_commit_failed");
  console.info(
    JSON.stringify({
      job: job.id,
      attempt: job.attempts,
      outcome: code ?? "succeeded",
    }),
  );
  return true;
}

export async function cleanOrphans(db) {
  const { data, error } = await db.rpc("photo_orphans");
  if (error) throw new Error("cleanup_query_failed");
  if (data.length) {
    const result = await db.storage
      .from("wardrobe")
      .remove(data.map((row) => row.path));
    if (result.error) throw new Error("cleanup_storage_failed");
  }
}

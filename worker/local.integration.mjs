import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { runOne, photoPrefix } from "./queue.mjs";
import { ProcessingError } from "./provider.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("Run only against a dedicated local Supabase stack.");
const client = (key) =>
  createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const admin = client(process.env.SUPABASE_SERVICE_ROLE_KEY);
function value(response) {
  if (response.error) throw new Error(response.error.message);
  return response.data;
}
const rpc = async (name, args) => value(await admin.rpc(name, args));
const users = [],
  objects = [];
async function user() {
  const email = randomUUID() + "@drapedeck.invalid",
    password = randomUUID() + "Aa!";
  const { user } = value(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
  );
  users.push(user.id);
  const db = client(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  value(await db.auth.signInWithPassword({ email, password }));
  return { id: user.id, db };
}
try {
  const pending = value(
    await admin
      .from("processing_jobs")
      .select("id")
      .in("state", ["running", "queued", "retry_wait"])
      .limit(1),
  );
  if (pending.length)
    throw new Error(
      "Stop other consumers and finish pending work before this local test.",
    );
  const a = await user(),
    b = await user();
  const request = {
    p_owner: a.id,
    p_request: randomUUID(),
    p_item: null,
    p_name: "Test shirt",
    p_transform: { rotation: 0, crop: null },
    p_day_limit: 50,
    p_item_limit: 500,
  };
  const item = await rpc("photo_begin", request);
  assert.equal((await rpc("photo_begin", request)).id, item.id);
  const prefix = photoPrefix(a.id, item.id, 1);
  const png = await sharp({
    create: { width: 64, height: 64, channels: 3, background: "olive" },
  })
    .png()
    .toBuffer();
  const bytes = await sharp(png)
    .extend({ top: 1, bottom: 1, left: 1, right: 1, background: "#0000" })
    .resize(64, 64)
    .png()
    .toBuffer();
  const bucket = admin.storage.from("wardrobe");
  for (const kind of ["original", "input.png"]) {
    value(
      await bucket.upload(prefix + kind, png, { contentType: "image/png" }),
    );
    objects.push(prefix + kind);
  }
  assert.equal(
    value(await b.db.from("items").select("id").eq("id", item.id)).length,
    0,
  );
  assert.ok(
    (await b.db.storage.from("wardrobe").download(prefix + "original")).error,
  );
  assert.ok(
    (await a.db.storage.from("wardrobe").download(prefix + "original")).data,
  );
  assert.ok(
    (await a.db.from("items").update({ status: "ready" }).eq("id", item.id))
      .error,
  );
  const collection = value(
    await b.db
      .from("collections")
      .insert({ name: "Private collection" })
      .select("id")
      .single(),
  );
  assert.ok(
    (
      await b.db
        .from("collection_items")
        .insert({ collection_id: collection.id, item_id: item.id })
    ).error,
  );
  const enqueue = {
    p_owner: a.id,
    p_item: item.id,
    p_rev: 1,
    p_available: true,
    p_retry: false,
  };
  await rpc("photo_enqueue", enqueue);
  await rpc("photo_enqueue", enqueue);
  const jq = () =>
    admin
      .from("processing_jobs")
      .select("*")
      .eq("item_id", item.id)
      .eq("revision", 1)
      .single();
  let calls = 0;
  await runOne(admin, {
    async remove() {
      calls++;
      throw new ProcessingError("provider_transient_test", 60);
    },
  });
  assert.equal(value(await jq()).state, "retry_wait");
  value(
    await admin
      .from("processing_jobs")
      .update({ due_at: new Date(0).toISOString() })
      .eq("item_id", item.id),
  );
  await runOne(admin, {
    async remove() {
      calls++;
      return { bytes, reference: "mocked-reference" };
    },
  });
  objects.push(prefix + "cutout.png", prefix + "thumb.webp");
  assert.equal(value(await jq()).provider_ref, "mocked-reference");
  assert.equal(value(await jq()).attempts, 2);
  let row = value(
    await a.db.from("items").select("*").eq("id", item.id).single(),
  );
  assert.equal(row.status, "needs_review");
  await rpc("photo_manage", {
    p_owner: a.id,
    p_item: item.id,
    p_rev: 1,
    p_action: "save",
    p_name: "My shirt",
    p_category: "Tops",
  });
  assert.equal(
    value(await a.db.from("items").select("*").eq("id", item.id).single())
      .status,
    "ready",
  );
  assert.ok(
    (
      await b.db.rpc("save_outfit", {
        p_id: randomUUID(),
        p_version: 0,
        p_name: "Cross account",
        p_status: "saved",
        p_notes: "",
        p_favorite: false,
        p_occasion: "",
        p_slots: [{ slot: "Top", item_id: item.id, locked: false }],
      })
    ).error,
  );
  const newer = await rpc("photo_begin", {
    ...request,
    p_request: randomUUID(),
    p_item: item.id,
  });
  assert.equal(newer.revision, 2);
  await rpc("photo_enqueue", { ...enqueue, p_rev: 2 });
  const stale = (await rpc("photo_claim", {}))[0];
  await rpc("photo_manage", {
    p_owner: a.id,
    p_item: item.id,
    p_rev: 2,
    p_action: "trash",
    p_name: null,
    p_category: null,
  });
  const finish = {
    p_job: stale.id,
    p_lease: stale.lease,
    p_error: null,
    p_delay: null,
    p_ref: null,
  };
  await rpc("photo_finish", finish);
  row = value(await a.db.from("items").select("*").eq("id", item.id).single());
  assert.ok(row.deleted_at);
  assert.equal(row.cutout_path, null);
  await rpc("photo_manage", {
    p_owner: a.id,
    p_item: item.id,
    p_rev: 2,
    p_action: "restore",
    p_name: null,
    p_category: null,
  });
  await rpc("photo_begin", {
    ...request,
    p_request: randomUUID(),
    p_item: item.id,
  });
  await rpc("photo_finish", finish);
  row = value(await a.db.from("items").select("*").eq("id", item.id).single());
  assert.equal(row.revision, 3);
  assert.equal(row.status, "draft");
  assert.equal(row.cutout_path, null);
  assert.equal(calls, 2);
  console.info(
    "Passed local Auth, private storage, row ownership, relationship isolation, durable retries, review, trash, and stale-result checks. Provider calls mocked.",
  );
} finally {
  if (objects.length)
    value(await admin.storage.from("wardrobe").remove(objects));
  for (const id of users) value(await admin.auth.admin.deleteUser(id));
}

import { createClient } from "@supabase/supabase-js";
import { limit, prepareInput, transformFor } from "../../../worker/images.mjs";
import { configuredProvider } from "../../../worker/provider.mjs";
import { photoPrefix } from "../../../worker/queue.mjs";

export const runtime = "nodejs";
export async function GET() {
  return Response.json(
    {
      storageConfigured: Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      ),
      providerConfigured: Boolean(configuredProvider()),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const kinds = [
  "Tops",
  "Bottoms",
  "Outerwear",
  "One-piece",
  "Footwear",
  "Accessories",
];
const problem = (error: string, status = 400) =>
  Response.json({ error }, { status });
function describe(error: { message: string }) {
  if (/daily_limit|item_limit|retry_limit/.test(error.message))
    return problem("Your upload or retry limit has been reached.", 429);
  if (/no rows|invalid_state|constraint/.test(error.message))
    return problem("The item has changed. Refresh and try again.", 409);
  return problem("The wardrobe service is unavailable. Please retry.", 503);
}
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service)
    return problem(
      "Photo storage is unavailable. Configure the Supabase server settings.",
      503,
    );
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return problem("Please sign in to manage photos.", 401);
  const db = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const auth = await db.auth.getUser(token);
  if (auth.error || !auth.data.user)
    return problem("Your session has expired. Sign in again.", 401);
  const owner = auth.data.user.id;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return problem("Request too large.", 413);
    const b = JSON.parse(raw);
    if (!b || typeof b !== "object") return problem("Invalid photo request.");
    const name = typeof b.name === "string" ? b.name.trim() : undefined;
    if (name !== undefined && (!name || name.length > 160))
      return problem("Use a name between 1 and 160 characters.");
    const bucket = db.storage.from("wardrobe");
    if (b.action === "begin") {
      if (!uuid.test(b.requestId) || (b.itemId && !uuid.test(b.itemId)))
        return problem("Invalid upload request.");
      const transform = transformFor(b.rotation, b.crop);
      const draft = await db.rpc("photo_begin", {
        p_owner: owner,
        p_request: b.requestId,
        p_item: b.itemId || null,
        p_name: name ?? "Untitled item",
        p_transform: transform,
        p_day_limit: limit("MAX_PHOTOS_PER_DAY", 50),
        p_item_limit: limit("MAX_ITEMS_PER_ACCOUNT", 500),
      });
      if (draft.error) return describe(draft.error);
      const i = draft.data;
      const path = photoPrefix(owner, i.id, i.revision) + "original";
      const signed = await bucket.createSignedUploadUrl(path);
      if (signed.error)
        return problem("Upload could not start. Your draft is saved.", 503);
      return Response.json({
        itemId: i.id,
        revision: i.revision,
        path,
        token: signed.data.token,
      });
    }
    if (
      !uuid.test(b.itemId) ||
      !Number.isSafeInteger(b.revision) ||
      b.revision < 1
    )
      return problem("Invalid item or photo revision.");
    if (["save", "trash", "restore", "purge"].includes(b.action)) {
      if (b.category !== undefined && !kinds.includes(b.category))
        return problem("Choose a wardrobe category.");
      const result = await db.rpc("photo_manage", {
        p_owner: owner,
        p_item: b.itemId,
        p_rev: b.revision,
        p_action: b.action,
        p_name: name ?? null,
        p_category: b.category ?? null,
      });
      return result.error
        ? describe(result.error)
        : Response.json({ ok: true });
    }
    if (!["finalize", "retry"].includes(b.action))
      return problem("Unknown photo action.");
    const { data: item, error } = await db
      .from("items")
      .select("id,status,original_path,error_code")
      .eq("owner_id", owner)
      .eq("id", b.itemId)
      .eq("revision", b.revision)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return describe(error);
    if (!item) return problem("This version of the photo is unavailable.", 404);
    if (["queued", "running", "ready", "needs_review"].includes(item.status))
      return Response.json({ status: item.status });
    const prefix = photoPrefix(owner, b.itemId, b.revision);
    if (!item.original_path) {
      const { data: source } = await db
        .from("photo_requests")
        .select("transform")
        .eq("owner_id", owner)
        .eq("item_id", b.itemId)
        .eq("revision", b.revision)
        .single();
      if (!source) return problem("This upload request has expired.", 409);
      const original = await bucket.download(prefix + "original");
      if (original.error || !original.data)
        return problem(
          "Photo upload is incomplete. Retry or replace the photo.",
          409,
        );
      if (original.data.size > limit("MAX_UPLOAD_BYTES", 10485760))
        return problem("This photo exceeds the upload limit.", 413);
      const input = await prepareInput(
        Buffer.from(await original.data.arrayBuffer()),
        source.transform,
      );
      const saved = await bucket.upload(prefix + "input.png", input, {
        contentType: "image/png",
        upsert: false,
      });
      if (saved.error && !/already exists|duplicate/i.test(saved.error.message))
        return problem("The processing input could not be stored. Retry.", 503);
    }
    const result = await db.rpc("photo_enqueue", {
      p_owner: owner,
      p_item: b.itemId,
      p_rev: b.revision,
      p_available: Boolean(configuredProvider()),
      p_retry: b.action === "retry",
    });
    if (result.error) return describe(result.error);
    return Response.json({
      status: result.data.status,
      errorCode: result.data.error_code,
    });
  } catch (e) {
    if (e instanceof SyntaxError) return problem("Invalid request.");
    if (e instanceof Error && e.message === "invalid_transform")
      return problem("The crop or rotation is invalid.");
    if (e instanceof Error && e.message === "invalid_image")
      return problem(
        "Use a decodable JPEG, PNG, or WebP within the pixel limit. Animated images and HEIC are unsupported.",
      );
    return problem(
      "Photo processing could not continue. Your draft is available to retry.",
      503,
    );
  }
}

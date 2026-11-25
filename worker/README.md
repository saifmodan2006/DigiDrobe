# Photo processing

Run `npm run worker` from the repository root alongside the Next.js server. Deploy one or more copies as a continuously running Node 24 service with automatic process restarts. The worker polls Postgres every 1.5 seconds when idle. Serverless request handlers alone cannot run this consumer.

## Provider setup

The web server and worker need the same Supabase project URL, service-role key, and provider configuration. Keep their environment files private. The original file is uploaded directly to a single private object using a two-hour signed upload token. Normal authenticated clients have read access only within their own account prefix.

- With `BACKGROUND_PROVIDER=photoroom`, set `PHOTOROOM_API_KEY` on both services. The worker posts a processed PNG in the `image_file` field to the Basic Remove Background API and validates the returned alpha channel, dimensions, and image format. Use a provider account authorized for this project. [Photoroom quickstart](https://docs.photoroom.com/remove-background-api-basic-plan/quickstart-guide)
- With `BACKGROUND_PROVIDER=local`, run the project's model service on the worker host. The worker posts the PNG body to the fixed loopback endpoint `http://127.0.0.1:7179/remove`. This mode does not use a Photoroom credential.
- With the default provider and no API key, finalized originals and processing inputs persist. The item records `provider_unconfigured`. After configuring the web server and worker and restarting them, use **Retry** on the item.

## Images and limits

The API fully decodes JPEG, PNG, and WebP, rejects animated or malformed images, normalizes EXIF orientation, applies the selected rotation and crop, and strips metadata from the processing copy. It fits this copy inside 1536 × 1536 pixels. The private original preserves the source for review. The compact thumbnail fits inside 420 × 500 pixels.

Defaults are 10 MiB per upload, 24 million decoded pixels, 50 source revisions per rolling 24 hours and 500 wardrobe records per account, including Trash. Adjust `MAX_UPLOAD_BYTES`, `MAX_IMAGE_PIXELS`, `MAX_PHOTOS_PER_DAY`, and `MAX_ITEMS_PER_ACCOUNT` as required. Set the browser limit `NEXT_PUBLIC_MAX_UPLOAD_BYTES` to match the server. Raising the file size limit above 10 MiB also requires updating the private bucket limit in a new migration and checking the project's global storage limit.

## Recovery

A request UUID identifies an upload. Each revision has immutable approved paths for the original, normalized input, PNG cutout, and WebP thumbnail. An item, owner, revision and pipeline version identify one job. The worker claims jobs transactionally using row locks, a four-minute lease, and a unique lease token. Replaced and trashed items reject stale completions. Postgres publishes the review status only after the worker stores both derivative files.

Transient failures retry up to four attempts with exponential backoff and the provider's rate-limit delay. Explicit retry starts a new bounded attempt sequence after failure, up to five manual retries per revision. Permanent failures remain visible. A repeated request reuses the stored cutout when possible. A crash between a provider accepting a request and private storage committing the response can still cause a repeated external charge. Repeated page visits and metadata edits never enqueue processing.

Trash is reversible. Permanent deletion removes the database item. The worker's minute-based cleanup deletes up to 100 orphaned storage objects per pass after a three-hour grace period, allowing issued upload tokens and outstanding worker leases to expire. Cleanup uses the Storage API, retries on later passes, also sweeps superseded revisions, and keeps the current revision of recoverable drafts. An unfinished draft can be discarded through Trash.

## Operator checks

- `node --test worker/images.test.mjs` checks crop/rotation, invalid bytes, alpha validation and mocked provider behavior.
- Stop other consumers before running `node --env-file=.env.local worker/local.integration.mjs` against a dedicated idle local Supabase stack. This test creates and cleans up two real temporary accounts and private objects. It checks row and storage isolation, membership and outfit write isolation, retry/review/save, Trash and stale results. Provider responses in this test are mocked.
- Monitor the worker process, its job outcome/error codes, and whether queued jobs become overdue. It logs job IDs and attempt counts. The service-role-only `processing_jobs` table records attempts, lease expiry, provider reference and safe error codes.
- For a live check, upload a photograph with a visible subject and background through the signed-in application, leave the page, reopen the draft after processing, and inspect the transparent cutout. This can consume provider quota when using Photoroom.

# DigiDrobe — Digital Wardrobe

Your wardrobe. New possibilities.

[Open DigiDrobe](https://digidrobe-app.vercel.app)

<!-- brand-end -->

A private digital wardrobe built with Next.js, TypeScript, Supabase Auth, Postgres and private object storage. Photograph one piece, crop and rotate it, review its transparent cutout, then style it with pieces you own. The outfit board arranges garments for visual comparison. Physical fit is outside its scope.

## Run locally

Install Node.js 24, Docker with its engine running, and Python 3.12 for the local background-removal model. From the checkout, run:

```sh
npm ci
npx supabase start
npm run local:env
```

The first start applies the tracked migrations and creates the private wardrobe bucket. For an existing local stack, apply new migrations with `npx supabase migration up --local`. The settings generator reads the local stack’s credentials directly into an ignored `.env.local` and preserves existing files. Choose the local provider or configure the hosted provider below.

On Windows, install the model runtime with:

```powershell
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r local-provider/requirements.txt
```

On macOS or Linux, use:

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r local-provider/requirements.txt
```

Start the app, job worker and local model together:

```sh
npm run dev:local
```

Open [the local app](http://127.0.0.1:3000) and create an account. New accounts start empty. The model service downloads a checksum-verified model on its first start, binds to loopback, and keeps image inference on the worker host. It uses the compact U²-Net foreground segmentation model. Fine edges and busy backgrounds can require recapture. [Model authors](https://github.com/xuebinqin/U-2-Net) · [ONNX weight distribution](https://github.com/danielgatis/rembg/releases/tag/v0.0.0)

To manage processes separately, run `npm run dev` and `npm run worker` in separate terminals. For local removal, also run `.venv\Scripts\python.exe local-provider/server.py` on Windows or `.venv/bin/python local-provider/server.py` on Unix. Supabase’s local email inbox is at [Mailpit](http://127.0.0.1:54324).

## Using the wardrobe

- **Add item** accepts one garment, accessory or pair of shoes per photo. Upload JPEG, PNG or WebP, drop a file, or choose Take photo. Review the crop and orientation before submitting. HEIC and HEIF require conversion.
- **Needs review** restores unfinished items. The worker continues after the browser closes. Review the Original and Cutout, choose the category, and save. Add optional tags and metadata in item details.
- **Wardrobe** supports search, category and availability filters, sorting, favorites and incremental display. Collections group the same item in several places. Trash supports restoration and confirmed permanent removal.
- **Outfits** lets you build a partial look, lock garments, replace a slot, compare alternatives and explicitly save a look. Suggestions use eligible wardrobe items, confirmed metadata, preferences and feedback. Start from an individual garment with **Style this item**.

## Production services

1. Configure an authorized Supabase project with email authentication and SMTP. Set the site URL and allow `/account` and `/account?recovery=1` on the deployed origin. Apply the versioned schema using `npx supabase link --project-ref YOUR_PROJECT_REF` followed by `npx supabase db push`. Review migrations before applying them to an existing database. Ownership rules protect items, collections, outfit slots and private image paths. [Supabase Auth](https://supabase.com/docs/guides/auth) · [Storage access](https://supabase.com/docs/guides/storage/security/access-control)
2. Set the values listed in `.env.example` in the app and worker environments. The public project URL and publishable key must be available at build time. The service-role credential and Photoroom key belong only in server environments. [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables)
3. Select `BACKGROUND_PROVIDER=photoroom` with a valid Basic Remove Background API key, or select `local` and run the Python model on the same host as the worker. The default Photoroom configuration keeps drafts recoverable when its key is missing. The garment suggestions operate without AI service credentials.
4. Run `npm ci && npm run build` on a Node-capable host, then `npm start` behind HTTPS. HTTPS or loopback is required for browser camera capture. Run `npm run worker` as a separate continuously supervised service with automatic restart. Supervise the local model as well if selected. The worker acquires jobs from Postgres. Static-only hosting cannot run the API or consumer.
5. Check `GET /api/photos` for configuration flags. Run a signed-in upload after deployment and confirm the item reaches review, saves and reopens. Monitor the worker and failed jobs separately from web health.

Defaults are 10 MiB per original, 24 megapixels per decoded image, 500 items per account and 50 photo requests per day. Keep the client limit, storage bucket policy and server setting aligned when changing limits. See [worker operations](worker/README.md) for leases, retries, cleanup, duplicate-call risks, image validation and restoring failed drafts.

## Verification

For Google sign-in, create a web OAuth client in Google Auth Platform with the deployed origin and the callback URL shown in the Google provider settings in Supabase Auth. Save the Google client ID and secret in that Supabase provider, and add `https://digidrobe-app.vercel.app/account?provider=google` to the Supabase redirect allow list. Set `NEXT_PUBLIC_GOOGLE_SIGN_IN=true` in Vercel Production and redeploy. [Supabase Google sign-in setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)

The Vercel production deployment runs a read-only Supabase database check three times a day using the schedules in `vercel.json`. Set a secret named `CRON_SECRET` in the Vercel production environment before deploying those schedules on another Vercel project.

```sh
npm run typecheck
npm test
npm run build
npm run e2e
```

Browser tests use installed Chrome on Windows or Playwright Chromium elsewhere. Install the latter with `npx playwright install chromium` when required. The account, persistence and cross-account tests require a local Supabase stack and `.env.local`. Test accounts are temporary. Isolated provider tests deliberately inject test responses. See the [worker tests and operational notes](worker/README.md) for the dedicated idle-stack integration run. Browser camera controls can be exercised through automation; physical capture requires a device check.

## Branding

Signup and password-reset email designs are in `supabase/templates/`. Apply the HTML and matching subjects under Authentication → Emails in the hosted Supabase dashboard when updating production. [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates)

The interface uses Bodoni Moda for headlines, Instrument Serif Italic for emphasis, and Satoshi for UI text. Satoshi loads from the official Fontshare CDN, with system fallbacks. The photographed fabric letters are decorative WebP assets and sit alongside selectable text. [Satoshi](https://www.fontshare.com/fonts/satoshi)

Edit `lib/brand.json` to change the name, tagline, descriptor, package slug, GitHub repository or public site URL. The header, authentication, page titles and metadata use the brand configuration. Run `npm run brand` to update the package, lockfile and README heading and link. When changing the public domain, update the site URL and account callback URLs in Supabase Auth.

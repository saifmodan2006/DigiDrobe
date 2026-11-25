import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const binary = "node_modules/supabase/dist/supabase.js";
const result = JSON.parse(
  execFileSync(process.execPath, [binary, "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }),
);
const url = result.API_URL,
  publicKey = result.PUBLISHABLE_KEY || result.ANON_KEY,
  privateKey = result.SECRET_KEY || result.SERVICE_ROLE_KEY;
if (!url || !publicKey || !privateKey)
  throw new Error("Local Supabase must be running before generating settings.");
writeFileSync(
  ".env.local",
  `NEXT_PUBLIC_SUPABASE_URL=${url}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publicKey}\nSUPABASE_SERVICE_ROLE_KEY=${privateKey}\nBACKGROUND_PROVIDER=local\n`,
  { flag: "wx", mode: 0o600 },
);
console.log("Created local settings for the self-hosted model.");

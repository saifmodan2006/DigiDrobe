import { setTimeout as pause } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { configuredProvider, ProcessingError } from "./provider.mjs";
import { cleanOrphans, runOne } from "./queue.mjs";
import { suggestGarment, warmVision } from "./garment-metadata.mjs";
import { isolateClothing, warmClothing } from "./clothing.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service)
  throw new Error(
    "Configure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before starting the worker.",
  );
const db = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const provider = configuredProvider();
void warmClothing().catch(() =>
  console.warn("Clothing analysis is unavailable. The worker will retry on demand."),
);
if (process.env.PHOTO_AUTO_CLASSIFY === "1") {
  void warmVision()?.catch(() =>
    console.warn(
      "Photo category model is unavailable. Manual selection remains available.",
    ),
  );
}
let running = true,
  nextCleanup = 0;
process.once("SIGINT", () => {
  running = false;
});
process.once("SIGTERM", () => {
  running = false;
});
console.info(
  "Photo worker started. Provider " +
    (provider ? "configured." : "unavailable."),
);
while (running) {
  try {
    if (Date.now() >= nextCleanup) {
      nextCleanup = Date.now() + 60000;
      await cleanOrphans(db);
    }
    if (
      !(await runOne(
        db,
        provider ?? {
          remove() {
            throw new ProcessingError("provider_unconfigured");
          },
        },
        suggestGarment,
        isolateClothing,
      ))
    )
      await pause(1500);
  } catch {
    console.error(
      "Photo worker could not access the queue or storage. Retrying.",
    );
    await pause(5000);
  }
}

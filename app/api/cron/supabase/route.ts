import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response(null, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return new Response(null, { status: 503 });

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Exercise the database with an indexed read without fetching any wardrobe data.
  const { error } = await supabase
    .from("items")
    .select("id", { head: true })
    .eq("id", "00000000-0000-0000-0000-000000000000")
    .abortSignal(AbortSignal.timeout(8000));

  return new Response(null, {
    status: error ? 503 : 204,
    headers: { "Cache-Control": "no-store" },
  });
}

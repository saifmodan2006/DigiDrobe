import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const db = url && key ? createClient(url, key) : null;
export async function photo(payload: Record<string, unknown>) {
  const token = (await db?.auth.getSession())?.data.session?.access_token;
  const response = await fetch("/api/photos", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Photo request failed. Please retry.");
  return result;
}
export function checked<T>(response: {
  data: T;
  error: { message: string } | null;
}): T {
  if (response.error) throw new Error(response.error.message);
  return response.data;
}
export const message = (e: unknown) =>
  e instanceof Error
    ? e.message
    : "The change could not be saved. Please retry.";

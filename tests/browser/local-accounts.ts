import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const endpoint = process.env.NEXT_PUBLIC_SUPABASE_URL;
const adminKey =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const isLocal = (url: string) =>
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
const appOrigin = process.env.E2E_BASE_URL || "http://127.0.0.1:3117";
export const localAdmin =
  endpoint && isLocal(endpoint) && isLocal(appOrigin) && adminKey
    ? createClient(endpoint, adminKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : undefined;

export async function makeAccount() {
  const email = `drape-${randomUUID()}@example.test`;
  const password = randomUUID();
  const { data, error } = await localAdmin!.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  return { id: data.user.id, email, password };
}

export async function signIn(
  page: Page,
  account: { email: string; password: string },
) {
  await page.goto("/account");
  await page.getByLabel("Email address").fill(account.email);
  await page.locator("input[name=password]").fill(account.password);
  await page
    .locator("form")
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "My wardrobe" }),
  ).toBeVisible();
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account settings" }).click();
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/account" && !url.hash, {
      waitUntil: "load",
    }),
    page.getByRole("button", { name: "Sign out" }).click(),
  ]);
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
}

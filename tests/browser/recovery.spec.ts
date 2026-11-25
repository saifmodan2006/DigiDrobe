import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { localAdmin, signIn, signOut } from "./local-accounts";

test("create an account, follow the local recovery email, and sign in with a new password", async ({
  page,
  request,
  baseURL,
}, info) => {
  // Supabase's checked-in development redirect allowlist uses this origin.
  test.skip(
    !localAdmin ||
      baseURL !== "http://127.0.0.1:3000" ||
      info.project.name !== "desktop",
    "Requires the default local app origin and Mailpit.",
  );
  const email = "recovery-" + randomUUID() + "@example.test",
    password = randomUUID(),
    replacement = randomUUID();
  let owner: string | undefined;
  try {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Create an account", exact: true })
      .click();
    await page.getByLabel("Email address").fill(email);
    await page.locator("input[name=password]").fill(password);
    const sessionRequest = page.waitForResponse(
      (r) =>
        r.url().includes("/auth/v1/signup") && r.request().method() === "POST",
    );
    await page.locator("form button.primary").click();
    owner = (await (await sessionRequest).json()).user?.id;
    await expect(
      page.getByRole("heading", { name: "My wardrobe" }),
    ).toBeVisible();
    await signOut(page);
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("button", { name: "Send recovery link" }).click();
    await expect(
      page.getByText("Check your email for a link to continue."),
    ).toBeVisible();
    const inbox = "http://127.0.0.1:54324/api/v1";
    let mail = "";
    await expect
      .poll(async () => {
        const response = await request.get(inbox + "/search", {
          params: { query: "to:" + email },
        });
        const data = await response.json();
        mail = data.messages?.[0]?.ID;
        return Boolean(mail);
      })
      .toBe(true);
    const body = await (await request.get(inbox + "/message/" + mail)).json();
    const link = body.HTML.match(
      /href="([^"]+\/auth\/v1\/verify[^"]+)"/i,
    )?.[1]?.replaceAll("&amp;", "&");
    if (!link || new URL(link).hostname !== "127.0.0.1")
      throw Error(
        "Local recovery email did not contain a local verification link.",
      );
    await page.goto(link);
    await expect(
      page.getByRole("heading", { name: "Choose a new password" }),
    ).toBeVisible();
    await page.locator("input[name=password]").fill(replacement);
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(
      page.getByRole("heading", { name: "My wardrobe" }),
    ).toBeVisible();
    await signOut(page);
    await signIn(page, { email, password: replacement });
  } finally {
    if (owner) await localAdmin!.auth.admin.deleteUser(owner);
  }
});

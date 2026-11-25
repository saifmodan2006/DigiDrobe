import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { localAdmin, makeAccount, signIn, signOut } from "./local-accounts";

test("a new account signs up, sees an empty wardrobe, and can sign in again", async ({
  page,
}, info) => {
  test.skip(
    !localAdmin || info.project.name !== "desktop",
    "Requires local Supabase with email confirmation disabled.",
  );
  const account = {
    email: `drape-${randomUUID()}@example.test`,
    password: randomUUID().slice(0, 6),
  };
  let id: string | undefined;
  try {
    await page.goto("/#Account");
    await expect(
      page.getByRole("heading", { name: "Welcome back." }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
    ).toHaveCount(0);
    let signupRequests = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.endsWith("/auth/v1/signup")) {
        signupRequests++;
      }
    });
    await page.getByLabel("Email address").fill(account.email);
    await page.locator("input[name=password]").fill(account.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Create an account",
    );
    expect(signupRequests).toBe(0);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Welcome back." }),
    ).toBeVisible();
    await page.goto("/");
    await page
      .getByRole("button", { name: "Create an account", exact: true })
      .click();
    await expect(page.locator("input[name=password]")).toHaveValue("");
    await page.getByLabel("Email address").fill(account.email);
    await page.locator("input[name=password]").fill(account.password);
    const completed = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/auth/v1/signup") &&
        response.request().method() === "POST",
    );
    await page
      .locator("form")
      .getByRole("button", { name: "Create account" })
      .click();
    const response = await completed;
    expect(response.ok()).toBe(true);
    const { user } = await response.json();
    expect(user.email).toBe(account.email);
    id = user.id;
    await expect(
      page.getByRole("heading", { name: "Your wardrobe starts here" }),
    ).toBeVisible();
    await signOut(page);
    await signIn(page, account);
    await expect(
      page.getByRole("heading", { name: "Your wardrobe starts here" }),
    ).toBeVisible();
  } finally {
    if (id) {
      const { error } = await localAdmin!.auth.admin.deleteUser(id);
      if (error) throw error;
    }
  }
});

test("private collections and appearance survive refresh and account switching", async ({
  page,
}) => {
  test.skip(
    !localAdmin,
    "Requires a local Supabase stack and its server key in .env.local.",
  );
  test.setTimeout(100_000);
  const accounts: Awaited<ReturnType<typeof makeAccount>>[] = [];
  const collection =
    "Weekend travel wardrobe with a deliberately long collection name";
  try {
    accounts.push(await makeAccount());
    accounts.push(await makeAccount());
    await signIn(page, accounts[0]);
    await page
      .getByRole("button", { name: "Collections", exact: true })
      .click();
    await page.getByLabel("Collection name").fill(collection);
    await page.getByRole("button", { name: "Create collection" }).click();
    await expect(page.getByText("Collection created.")).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: new RegExp(collection) }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Account settings" }).click();
    await page.getByLabel("Appearance").selectOption("dark");
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(page.getByText("Preferences saved.")).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByLabel("Appearance")).toHaveValue("dark");
    await signOut(page);
    await signIn(page, accounts[1]);
    await page
      .getByRole("button", { name: "Collections", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "No collections yet" }),
    ).toBeVisible();
    await expect(page.getByText(collection)).toHaveCount(0);
    await page.getByRole("button", { name: "Account settings" }).click();
    await expect(page.getByLabel("Appearance")).toHaveValue("system");
  } finally {
    for (const account of accounts) {
      const { error } = await localAdmin!.auth.admin.deleteUser(account.id);
      if (error) throw error;
    }
  }
});

import { expect, test } from "@playwright/test";
import brand from "../../lib/brand.json" with { type: "json" };

test("sign in, account creation and password recovery remain keyboard accessible", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await expect(page).toHaveTitle(new RegExp(brand.name));
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    brand.tagline,
  );

  const email = page.getByLabel("Email address");
  await email.focus();
  await page.keyboard.type("wardrobe@example.test");
  await page.keyboard.press("Tab");
  const password = page.locator("input[name=password]");
  await expect(password).toBeFocused();
  await password.fill("test-password");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Show password" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(password).toHaveAttribute("type", "text");
  await page.keyboard.press("Enter");
  await expect(password).toHaveAttribute("type", "password");

  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Create your wardrobe." }),
  ).toBeVisible();
  await expect(password).toHaveAttribute("autocomplete", "new-password");
  await page
    .getByRole("button", { name: "Back to sign in", exact: true })
    .click();
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(
    page.getByRole("heading", { name: "Reset your password." }),
  ).toBeVisible();
  await expect(password).toHaveCount(0);
  await page.getByRole("button", { name: "Back to sign in" }).click();

  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  const viewport = page.viewportSize()!;
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(viewport.width);
  const photo = page.locator('img[src="/editorial.webp"]');
  if (await photo.isVisible()) {
    await expect
      .poll(() =>
        photo.evaluate((element: HTMLImageElement) => element.naturalWidth),
      )
      .toBeGreaterThan(0);
    await expect(photo).toHaveAttribute("alt", /.+/);
  }
  await email.fill("");
  await password.fill("");
  await page.screenshot({ path: info.outputPath("auth.png"), fullPage: true });
});

test("an unconfigured deployment explains why sign-in is unavailable", async ({
  page,
}) => {
  await page.goto("/");
  const submit = page
    .locator("form")
    .getByRole("button", { name: "Sign in", exact: true });
  await expect(submit).toBeVisible();
  test.skip(
    await submit.isEnabled(),
    "A Supabase connection is configured on this deployment.",
  );
  await expect(page.getByText("Account setup required")).toBeVisible();
  await expect(page.getByText(/\.env\.example/)).toBeVisible();
  await expect(submit).toBeDisabled();
});

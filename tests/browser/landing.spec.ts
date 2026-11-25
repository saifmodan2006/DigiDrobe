import { expect, test } from "@playwright/test";

test("visitors can explore the homepage and choose either account form", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /Your wardrobe\.\s*New possibilities\./,
  );
  await expect(
    page.getByRole("heading", { name: "From camera roll to outfit." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Wear what you already own in more ways.",
    }),
  ).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(page.viewportSize()!.width);
  const header = page.getByRole("banner");
  await page.getByRole("link", { name: "How it works" }).last().click();
  await expect(page).toHaveURL(/#how-it-works$/);
  await page.screenshot({
    path: info.outputPath("landing.png"),
    fullPage: true,
  });
  await header.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "DrapeDeck home" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your wardrobe.",
  );
  await header.getByRole("link", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account\/create$/);
  await expect(
    page.getByRole("heading", { name: "Create your wardrobe." }),
  ).toBeVisible();
  await expect(page.locator("input[name=password]")).toHaveAttribute(
    "autocomplete",
    "new-password",
  );
});

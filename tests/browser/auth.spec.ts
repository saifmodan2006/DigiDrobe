import { expect, test } from "@playwright/test";
import brand from "../../lib/brand.json" with { type: "json" };

test("Google sign-in uses the account callback and shows a retry message on cancellation", async ({
  page,
}) => {
  test.skip(process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN !== "true", "Google sign-in is disabled.");
  await page.goto("/account/create");
  const callback = new URL("/account?provider=google", page.url());
  await page.route("**/auth/v1/authorize?**", async (route) => {
    const request = new URL(route.request().url());
    expect(request.searchParams.get("provider")).toBe("google");
    expect(request.searchParams.get("redirect_to")).toBe(callback.href);
    await route.fulfill({
      status: 302,
      headers: { location: `${callback.href}&error=access_denied` },
    });
  });
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Google sign-in didn’t finish. Please try again.",
  );
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
});

test("sign in, account creation and password recovery remain keyboard accessible", async ({
  page,
}, info) => {
  await page.goto("/account");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await expect(page).toHaveTitle(new RegExp(brand.name));
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "Sign in to your private DigiDrobe wardrobe.",
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
  await page.goto("/account");
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

test("signup guidance does not claim an email was sent to a returning user", async ({
  page,
}) => {
  await page.goto("/account/create");
  const submit = page.getByRole("button", { name: "Create account", exact: true });
  await expect(submit).toBeVisible();
  test.skip(!(await submit.isEnabled()), "Supabase is unconfigured.");

  const email = "returning@example.test";
  const signupEndpoint = "**/auth/v1/signup*";
  const responses = [
    {
      json: { id: "64349aa5-366b-4383-b952-316e2d8cf4a7", email, identities: [] },
    },
    {
      status: 422,
      json: { error_code: "user_already_exists", msg: "User already registered" },
    },
  ];
  await page.getByLabel("Email address").fill(email);
  const password = page.locator("input[name=password]");
  await password.fill("test-password");
  for (const response of responses) {
    await page.route(signupEndpoint, (route) => route.fulfill(response), {
      times: 1,
    });
    const completed = page.waitForResponse(signupEndpoint);
    await submit.click();
    await completed;
    await expect(page.locator("main").getByRole("status")).toHaveText(
      "If this is a new account, check your inbox for a confirmation link.",
    );
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveValue(email);
  await expect(password).toHaveValue("");
});

import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { localAdmin, makeAccount, signIn } from "./local-accounts";

test("choose and swap a garment, restore a locked draft, and compare saved looks", async ({
  page,
}, info) => {
  test.skip(!localAdmin, "Requires local Supabase.");
  const a = await makeAccount();
  const paths: string[] = [];
  try {
    for (const [name, category] of [
      ["Cotton tee", "Tops"],
      ["Linen shirt", "Tops"],
      ["Wide-leg trousers", "Bottoms"],
    ]) {
      const id = randomUUID();
      const path = a.id + "/" + id + "/1/cutout.png";
      paths.push(path);
      const png = await sharp({
        create: { width: 15, height: 24, channels: 4, background: "#74835b" },
      })
        .png()
        .toBuffer();
      expect(
        (
          await localAdmin!.storage
            .from("wardrobe")
            .upload(path, png, { contentType: "image/png" })
        ).error,
      ).toBeNull();
      expect(
        (
          await localAdmin!.from("items").insert({
            id,
            owner_id: a.id,
            name,
            category,
            status: "ready",
            cutout_path: path,
            thumbnail_path: path,
          })
        ).error,
      ).toBeNull();
    }
    await signIn(page, a);
    await page.getByRole("button", { name: "Outfits", exact: true }).click();
    await page.getByRole("button", { name: "Create outfit" }).click();
    const chooseTop = page.getByRole("button", {
      name: "Choose Top",
      exact: true,
    });
    await chooseTop.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(chooseTop).toBeFocused();
    await chooseTop.click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cotton tee" })
      .click();
    const top = page.locator(".look-slot").filter({
      has: page.getByRole("button", { name: "Replace Top", exact: true }),
    });
    await top.getByRole("button", { name: "Swap" }).click();
    await expect(top).toContainText("Linen shirt");
    await page.getByRole("button", { name: "Lock Top", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Draft saved.");
    await page.reload();
    await page
      .getByRole("button", { name: "Outfit builder", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Unlock Top", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Suggest outfits" }).click();
    await page.getByRole("button", { name: "Use on board" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Olive edit");
    await page.getByRole("button", { name: "Save look", exact: true }).click();
    const saved = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: "Olive edit", exact: true }),
    });
    await expect(saved).toBeVisible();
    await saved.getByRole("button", { name: "Duplicate" }).click();
    await page.getByRole("button", { name: "Unlock Top", exact: true }).click();
    await page
      .getByRole("button", { name: "Replace Top", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cotton tee" })
      .click();
    await page.getByRole("button", { name: "Save look", exact: true }).click();
    const copy = page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: "Olive edit copy" }) });
    await saved.getByRole("button", { name: "Compare", exact: true }).click();
    await copy.getByRole("button", { name: "Compare", exact: true }).click();
    await page.getByRole("button", { name: "Compare (2)" }).click();
    await expect(
      page.getByText("1 changed slot", { exact: false }),
    ).toBeVisible();
    await expect(page.getByText("Shared", { exact: true })).toHaveCount(2);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: info.outputPath("outfit-comparison.png"),
      fullPage: true,
    });
  } finally {
    await localAdmin!.storage.from("wardrobe").remove(paths);
    expect((await localAdmin!.auth.admin.deleteUser(a.id)).error).toBeNull();
  }
});

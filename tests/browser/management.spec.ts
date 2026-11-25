import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { localAdmin, makeAccount, signIn } from "./local-accounts";

test("organize, edit, favorite, trash and restore an owned item", async ({
  page,
}, info) => {
  test.skip(
    !localAdmin || info.project.name !== "desktop",
    "Uses a temporary account on local Supabase.",
  );
  const account = await makeAccount(),
    id = randomUUID(),
    path = account.id + "/" + id + "/1/cutout.png";
  try {
    const fixture = await sharp({
      create: { width: 12, height: 12, channels: 4, background: "#5b6149" },
    })
      .png()
      .toBuffer();
    expect(
      (
        await localAdmin!.storage
          .from("wardrobe")
          .upload(path, fixture, { contentType: "image/png" })
      ).error,
    ).toBeNull();
    const { error } = await localAdmin!
      .from("items")
      .insert({
        id,
        owner_id: account.id,
        name: "Test blazer",
        category: "Tops",
        status: "ready",
        cutout_path: path,
        thumbnail_path: path,
      });
    expect(error).toBeNull();
    await signIn(page, account);
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await nav.getByRole("button", { name: "Collections" }).click();
    await page.getByLabel("Collection name").fill("Office");
    await page.getByRole("button", { name: "Create collection" }).click();
    await expect(page.getByText("Collection created.")).toBeVisible();
    await nav.getByRole("button", { name: "Wardrobe" }).click();
    const fav = page.getByRole("button", {
      name: "Favorite Test blazer",
      exact: true,
    });
    await fav.click();
    await expect(fav).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /^Test blazer/ }).click();
    await page.getByLabel("Category").selectOption("Outerwear");
    await page.getByLabel("Availability").selectOption("Packed");
    await page.getByLabel("Office").click();
    await expect(page.getByText("Collection updated.")).toBeVisible();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved to your wardrobe.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Availability")).toHaveValue("Packed");
    await expect(page.getByLabel("Category")).toHaveValue("Outerwear");
    await expect(page.getByLabel("Office")).toBeChecked();
    await nav.getByRole("button", { name: "Collections" }).click();
    await page.getByRole("button", { name: /Office/ }).click();
    await page.getByRole("button", { name: /^Test blazer/ }).click();
    await page.getByRole("button", { name: "Move to Trash" }).click();
    await expect(
      page.getByRole("heading", { name: "Trash", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: /^Test blazer/ }).click();
    await page.getByRole("button", { name: "Restore item" }).click();
    await expect(page.getByText("Item restored.")).toBeVisible();
    await page
      .getByRole("navigation", { name: "Wardrobe views" })
      .getByRole("button", { name: "Favorites" })
      .click();
    await expect(
      page.getByRole("button", { name: /^Test blazer/ }),
    ).toBeVisible();
  } finally {
    await localAdmin!.storage.from("wardrobe").remove([path]);
    await localAdmin!.auth.admin.deleteUser(account.id);
  }
});

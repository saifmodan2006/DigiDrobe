import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import sharp from "sharp";
import { runOne } from "../../worker/queue.mjs";
import { localAdmin, makeAccount, signIn } from "./local-accounts";

// Synthetic garment shapes and a color-key provider exist only inside this test.
async function imageFixture(color: string, trousers: boolean) {
  const path = trousers
    ? "M41 23 H119 L124 161 H91 L78 82 L68 161 H37 Z"
    : "M58 30 L41 35 L13 64 L34 83 L48 70 L45 143 H115 L112 70 L126 83 L147 64 L119 35 L102 30 Q80 55 58 30 Z";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="180"><rect width="160" height="180" fill="white"/><path d="${path}" fill="${color}"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const mockedRemoval = {
  async remove(input: Buffer) {
    const { data, info } = await sharp(input)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 250 && data[i + 1] > 250 && data[i + 2] > 250)
        data[i + 3] = 0;
    }
    return {
      bytes: await sharp(data, { raw: info }).png().toBuffer(),
      reference: "mocked-browser-test",
    };
  },
};

async function chooseFile(page: Page, name: string, data: Buffer) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload photo" }).click();
  await (
    await chooser
  ).setFiles({ name: name + ".png", mimeType: "image/png", buffer: data });
}

const photoDirectory = process.env.E2E_GARMENT_DIR;
const providerLabel = photoDirectory ? "live removal" : "mocked removal";
test(`upload three garments, recover a pending job, compare two looks and reopen the saved look (${providerLabel})`, async ({
  page,
  browser,
  baseURL,
}, info) => {
  test.skip(
    !localAdmin ||
      (!photoDirectory && process.env.E2E_MOCK_REMOVAL !== "1") ||
      info.project.name !== "desktop",
    "Provide E2E_GARMENT_DIR with top-1.jpg, top-2.jpg and pants.jpg for live removal, or explicitly enable the mock worker on a disposable local stack.",
  );
  test.setTimeout(240_000);
  const account = await makeAccount();
  let active = page;
  const paths: string[] = [];
  const names = [
    "First top with a deliberately long wardrobe label for narrow screens",
    "Second top",
    "Weekend trousers",
  ];
  try {
    await signIn(active, account);
    await expect(
      active.getByRole("heading", { name: "Your wardrobe starts here" }),
    ).toBeVisible();
    for (let i = 0; i < names.length; i++) {
      await active
        .getByRole("button", {
          name: i ? "Add another" : "Add item",
          exact: true,
        })
        .click();
      if (i === 0) {
        // Emulate denied camera permission while keeping the browser's real file chooser.
        await active.evaluate(() => {
          Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
            value: async () => {
              throw new DOMException("Permission denied", "NotAllowedError");
            },
          });
        });
        await active.getByRole("button", { name: "Take photo" }).click();
        await expect(
          active.getByRole("alert").filter({ hasText: "Camera unavailable" }),
        ).toBeVisible();
      }
      const input = photoDirectory
        ? await sharp(
            join(photoDirectory, ["top-1.jpg", "top-2.jpg", "pants.jpg"][i]),
          )
            .autoOrient()
            .resize({
              width: 1100,
              height: 1100,
              fit: "inside",
              withoutEnlargement: true,
            })
            .png()
            .toBuffer()
        : await imageFixture(["#526142", "#ac6045", "#43443e"][i], i === 2);
      await chooseFile(active, names[i], input);
      await active.getByRole("button", { name: "Remove background" }).click();
      await expect(
        active.getByRole("heading", { name: names[i], exact: true }),
      ).toBeVisible();
      if (!photoDirectory || i === 0) {
        await expect(
          active.getByText(
            /Queued for background removal|Removing background…/,
          ),
        ).toBeVisible();
      }
      const itemId = decodeURIComponent(
        new URL(active.url()).hash.slice(1),
      ).split("/")[1];
      const prefix = `${account.id}/${itemId}/1/`;
      paths.push(
        ...["original", "input.png", "cutout.png", "thumb.webp"].map(
          (p) => prefix + p,
        ),
      );
      let reopen = "";
      let session;
      if (i === 0) {
        reopen = active.url();
        session = await active.context().storageState();
        await active.context().close();
      }
      if (!photoDirectory) {
        // Refuse to claim work belonging to anyone outside the test account.
        const queue = await localAdmin!
          .from("processing_jobs")
          .select("owner_id")
          .in("state", ["queued", "running", "retry_wait"]);
        expect(queue.error).toBeNull();
        expect(queue.data?.map((job) => job.owner_id)).toEqual([account.id]);
        expect(await runOne(localAdmin, mockedRemoval)).toBe(true);
      }
      if (session) {
        const reopened = await browser.newContext({
          storageState: session,
          baseURL,
          viewport: { width: 1440, height: 900 },
        });
        active = await reopened.newPage();
        await active.goto(reopen);
      } else await active.reload();
      await expect(
        active.getByRole("button", { name: "Cutout", exact: true }),
      ).toBeEnabled({ timeout: 60_000 });
      await active
        .getByRole("combobox", { name: /^Category/ })
        .selectOption(i === 2 ? "Bottoms" : "Tops");
      await active.getByRole("button", { name: "Save to wardrobe" }).click();
      await expect(active.getByText("Saved to your wardrobe.")).toBeVisible();
    }
    await active.getByRole("button", { name: "Back to wardrobe" }).click();
    await active.reload();
    await active.getByRole("button", { name: "Tops", exact: true }).click();
    await expect(active.locator("article")).toHaveCount(2);
    await active.getByRole("button", { name: "Filters" }).click();
    await active.getByLabel("Sort by").selectOption("Name A–Z");
    await active.screenshot({
      path: info.outputPath("wardrobe-desktop.png"),
      fullPage: true,
    });
    await active.setViewportSize({ width: 320, height: 800 });
    await expect
      .poll(() => active.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(320);
    await active.screenshot({
      path: info.outputPath("wardrobe-mobile.png"),
      fullPage: true,
    });

    await active.getByRole("button", { name: "Outfits", exact: true }).click();
    await active.getByRole("button", { name: "Create outfit" }).click();
    const chooseBottom = active.getByRole("button", {
      name: "Choose Bottom",
      exact: true,
    });
    await chooseBottom.click();
    await active.keyboard.press("Escape");
    await expect(chooseBottom).toBeFocused();
    await chooseBottom.click();
    await active
      .getByRole("dialog")
      .getByRole("button", { name: names[2] })
      .click();
    await active
      .getByRole("button", { name: "Lock Bottom", exact: true })
      .click();
    await active.getByRole("button", { name: "Suggest outfits" }).click();
    const suggestion = active
      .locator("article")
      .filter({ has: active.getByRole("button", { name: "Next" }) });
    await expect(suggestion).toContainText("1 of 2");
    await suggestion
      .getByRole("button", { name: "Compare", exact: true })
      .click();
    await suggestion.getByRole("button", { name: "Next" }).click();
    await suggestion
      .getByRole("button", { name: "Compare", exact: true })
      .click();
    await active
      .getByRole("button", { name: "Compare (2)", exact: true })
      .click();
    await expect(active.getByText(/1 changed slot/)).toBeVisible();
    await expect(active.getByText("Shared", { exact: true })).toHaveCount(2);
    await active
      .getByRole("button", { name: "Choose this look" })
      .first()
      .click();
    await expect(
      active.getByRole("button", { name: "Unlock Bottom", exact: true }),
    ).toBeVisible();
    await active.getByLabel("Name", { exact: true }).fill("Weekend layers");
    await active
      .getByRole("button", { name: "Save look", exact: true })
      .click();
    await expect(
      active.getByRole("heading", { name: "Weekend layers" }),
    ).toBeVisible();
    await active.reload();
    await active
      .getByRole("article")
      .filter({ has: active.getByRole("heading", { name: "Weekend layers" }) })
      .getByRole("button", { name: "Edit" })
      .click();
    await expect(active.getByLabel("Name", { exact: true })).toHaveValue(
      "Weekend layers",
    );
    await expect(
      active.getByRole("button", { name: "Unlock Bottom", exact: true }),
    ).toBeVisible();
  } catch (error) {
    if (!active.isClosed()) {
      await active.screenshot({
        path: info.outputPath("acceptance-failure.png"),
        fullPage: true,
      });
      await info.attach("visible interface", {
        body: await active.locator("main").innerText(),
        contentType: "text/plain",
      });
    }
    throw error;
  } finally {
    if (active !== page) await active.context().close();
    if (paths.length) {
      const { error } = await localAdmin!.storage
        .from("wardrobe")
        .remove(paths);
      if (error) throw error;
    }
    const { error } = await localAdmin!.auth.admin.deleteUser(account.id);
    if (error) throw error;
  }
});

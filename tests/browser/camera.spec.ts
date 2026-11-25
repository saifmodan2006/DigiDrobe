import { expect, test } from "@playwright/test";
import { localAdmin, makeAccount, signIn } from "./local-accounts";

test("mobile preview, capture and dismissal release the camera (simulated device)", async ({
  page,
}, info) => {
  test.skip(
    !localAdmin || info.project.name !== "narrow",
    "Requires local Supabase and the mobile viewport.",
  );
  const account = await makeAccount();
  try {
    await signIn(page, account);
    await page.getByRole("button", { name: "Add item" }).click();
    await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 180;
      canvas.height = 240;
      const context = canvas.getContext("2d")!;
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        value: async () => {
          const stream = canvas.captureStream(5);
          const track = stream.getVideoTracks()[0];
          document.documentElement.dataset.cameraOpened = "yes";
          const stop = track.stop.bind(track);
          track.stop = () => {
            stop();
            document.documentElement.dataset.cameraState = track.readyState;
          };
          requestAnimationFrame(() => {
            context.fillStyle = "#54634b";
            context.fillRect(0, 0, 180, 240);
          });
          return stream;
        },
      });
    });
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-camera-opened",
      "yes",
    );
    await page.getByRole("button", { name: "Take photo" }).click();
    await expect(
      page.getByRole("button", { name: "Capture photo" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Close camera" }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-camera-state",
      "ended",
    );
    await page.getByRole("button", { name: "Take photo" }).click();
    await page.getByRole("button", { name: "Capture photo" }).click();
    await expect(page.getByRole("button", { name: "Retake" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Remove background" }),
    ).toBeEnabled();
    await expect(page.locator("video")).toHaveCount(0);
    await expect
      .poll(() =>
        page
          .locator("canvas")
          .evaluate((canvas: HTMLCanvasElement) => canvas.width),
      )
      .toBe(180);
    await page.getByRole("button", { name: /Rotate 90/ }).click();
    await expect
      .poll(() =>
        page
          .locator("canvas")
          .evaluate((canvas: HTMLCanvasElement) => canvas.width),
      )
      .toBe(240);
    await page.getByRole("slider", { name: /^Crop/ }).focus();
    await page.keyboard.press("Home");
    await expect
      .poll(() =>
        page
          .locator("canvas")
          .evaluate((canvas: HTMLCanvasElement) => canvas.width),
      )
      .toBe(48);
    await expect(
      page.getByRole("slider", { name: "Horizontal position" }),
    ).toBeVisible();
  } finally {
    const { error } = await localAdmin!.auth.admin.deleteUser(account.id);
    if (error) throw error;
  }
});

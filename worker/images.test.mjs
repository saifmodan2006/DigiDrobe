import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { prepareInput, transformFor, validateCutout } from "./images.mjs";
import { PhotoroomProvider } from "./provider.mjs";

const original = await sharp({
  create: { width: 60, height: 20, channels: 3, background: "#843" },
})
  .jpeg()
  .toBuffer();
const transparent = await sharp(original)
  .extend({ left: 2, right: 2, top: 2, bottom: 2, background: "#0000" })
  .png()
  .toBuffer();

test("rotated normalized crop is decoded and strips EXIF", async () => {
  const image = await prepareInput(
    original,
    transformFor(90, { x: 0, y: 0.5, width: 1, height: 0.5 }),
  );
  const m = await sharp(image).metadata();
  assert.equal(m.width, 20);
  assert.equal(m.height, 30);
  assert.equal(m.exif, undefined);
  await assert.rejects(
    prepareInput(Buffer.from("wrong bytes"), transformFor()),
  );
  assert.throws(() => transformFor(90, { x: 0.9, y: 0, width: 1, height: 1 }));
});
test("rejects a flat alpha layer or completely transparent cutout", async () => {
  await assert.rejects(
    validateCutout(await sharp(original).ensureAlpha().png().toBuffer()),
  );
  await assert.rejects(
    validateCutout(
      await sharp({
        create: { width: 10, height: 10, channels: 4, background: "#0000" },
      })
        .png()
        .toBuffer(),
    ),
  );
});
test("mocked Photoroom handles valid transparent output, content-type, and retry timing", async () => {
  const dimensions = { width: 64, height: 24 };
  const call = async (url, options) => {
    assert.equal(url, "https://sdk.photoroom.com/v1/segment");
    assert.equal(options.headers["x-api-key"], "unit-test");
    assert.ok(options.body.get("image_file") instanceof Blob);
    return new Response(transparent, {
      headers: {
        "content-type": "image/png",
        "x-request-id": "test-reference",
      },
    });
  };
  const result = await new PhotoroomProvider("unit-test", call).remove(
    original,
    dimensions,
  );
  assert.equal(result.reference, "test-reference");
  assert.equal((await sharp(result.bytes).metadata()).hasAlpha, true);
  await assert.rejects(
    new PhotoroomProvider("fake", async () => new Response(original)).remove(
      original,
      dimensions,
    ),
    /invalid_cutout/,
  );
  await assert.rejects(
    new PhotoroomProvider(
      "fake",
      async () =>
        new Response("", { status: 429, headers: { "retry-after": "75" } }),
    ).remove(original, dimensions),
    (e) => e.delay === 75,
  );
});

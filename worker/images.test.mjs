import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { cropCutout, prepareInput, transformFor, validateCutout } from "./images.mjs";
import { PhotoroomProvider } from "./provider.mjs";
import { garmentMask } from "./clothing.mjs";

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
test("clothing mask keeps confident garments and removes skin and hair", () => {
  const size = 512;
  const pixels = size ** 2;
  const scores = new Float32Array(18 * pixels);
  for (let y = 50; y < 300; y++) {
    for (let x = 50; x < 300; x++) {
      const i = y * size + x;
      const label = y < 80 ? 2 : y < 110 ? 11 : x < 90 ? 14 : 4;
      scores[label * pixels + i] = 4;
    }
  }
  const { mask, person, enoughClothing } = garmentMask(scores);
  assert.equal(person, true);
  assert.equal(enoughClothing, true);
  assert.equal(mask[60 * size + 150], 0);
  assert.equal(mask[90 * size + 150], 0);
  assert.equal(mask[180 * size + 70], 0);
  assert.equal(mask[180 * size + 90], 0);
  assert.equal(mask[180 * size + 150], 255);
});

test("cutout crop follows the visible bounds and adds transparent padding", async () => {
  const surrounded = await sharp(original)
    .extend({ left: 30, right: 9, top: 22, bottom: 77, background: "#0000" })
    .png()
    .toBuffer();
  const cropped = await cropCutout(surrounded);
  const { width, height } = await sharp(await validateCutout(cropped)).metadata();
  assert.deepEqual([width, height], [64, 24]);
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

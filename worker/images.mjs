import sharp from "sharp";

export function limit(name, fallback) {
  const n = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(n) || n < 1)
    throw new Error("invalid_server_limit");
  return n;
}

export function transformFor(rotation = 0, crop = null) {
  if (![0, 90, 180, 270].includes(rotation))
    throw new Error("invalid_transform");
  if (crop !== null) {
    const { x, y, width, height } = crop;
    if (
      ![x, y, width, height].every(Number.isFinite) ||
      x < 0 ||
      y < 0 ||
      width <= 0 ||
      height <= 0 ||
      x + width > 1.000001 ||
      y + height > 1.000001
    )
      throw new Error("invalid_transform");
    crop = { x, y, width, height };
  }
  return { rotation, crop };
}

export async function prepareInput(bytes, transform) {
  if (bytes.length > limit("MAX_UPLOAD_BYTES", 10485760))
    throw new Error("file_too_large");
  const options = {
    limitInputPixels: limit("MAX_IMAGE_PIXELS", 24000000),
    failOn: "warning",
  };
  try {
    const metadata = await sharp(bytes, options).metadata();
    if (
      !["png", "webp", "jpeg"].includes(metadata.format) ||
      (metadata.pages ?? 1) !== 1
    )
      throw new Error("invalid_image");
    // Separate orientation from the user's rotation: sharp permits one rotation per pipeline.
    const oriented = await sharp(bytes, options)
      .autoOrient()
      .toColourspace("srgb")
      .png()
      .toBuffer();
    const { data, info } = await sharp(oriented, options)
      .rotate(transform.rotation)
      .png()
      .toBuffer({ resolveWithObject: true });
    let image = sharp(data, options);
    if (transform.crop) {
      const { x, y, width, height } = transform.crop;
      const left = Math.min(info.width - 1, Math.floor(x * info.width));
      const top = Math.min(info.height - 1, Math.floor(y * info.height));
      image = image.extract({
        left,
        top,
        width: Math.min(
          info.width - left,
          Math.max(1, Math.round(width * info.width)),
        ),
        height: Math.min(
          info.height - top,
          Math.max(1, Math.round(height * info.height)),
        ),
      });
    }
    return await image
      .resize({
        width: 1536,
        height: 1536,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
  } catch {
    throw new Error("invalid_image");
  }
}

export async function validateCutout(bytes, sourceDimensions) {
  const options = {
    limitInputPixels: limit("MAX_IMAGE_PIXELS", 24000000),
    failOn: "warning",
  };
  const info = await sharp(bytes, options).metadata();
  if (
    !["png", "webp"].includes(info.format) ||
    !info.hasAlpha ||
    !info.width ||
    !info.height ||
    (info.pages ?? 1) > 1
  )
    throw new Error("invalid_cutout");
  if (
    sourceDimensions &&
    Math.abs(
      info.width / info.height -
        sourceDimensions.width / sourceDimensions.height,
    ) >
      (0.025 * sourceDimensions.width) / sourceDimensions.height +
        1 / info.height
  )
    throw new Error("invalid_cutout");
  const alpha = await sharp(bytes, options)
    .extractChannel("alpha")
    .raw()
    .toBuffer();
  let transparent = false,
    visible = false;
  for (const value of alpha) {
    transparent ||= value < 24;
    visible ||= value > 100;
    if (transparent && visible) break;
  }
  if (!transparent || !visible) throw new Error("invalid_cutout");
  return sharp(bytes, options).png().toBuffer();
}

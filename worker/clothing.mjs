import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { InferenceSession, Tensor } from "onnxruntime-node";
import sharp from "sharp";
import { ProcessingError } from "./provider.mjs";

const size = 512;
const pixels = size * size;
const labels = 18;
const filename = "schp-atr-18-int8-static.onnx";
const modelUrl =
  "https://huggingface.co/pirocheto/schp-atr-18/resolve/61f4ff3c508b899904e495cefbbaff9cacadeb45/onnx/" +
  filename;
const checksum = "4420d8db8c1f266967c89485786b01209f6d405f320fc0f87e8ced49392cefb5";
// ATR upper clothes, skirt, pants, dress, belt, shoes and scarf.
const garments = new Set([4, 5, 6, 7, 8, 9, 10, 17]);
const mean = [0.406, 0.456, 0.485];
const deviation = [0.225, 0.224, 0.229];
let model;

function verified(bytes) {
  return createHash("sha256").update(bytes).digest("hex") === checksum;
}

async function loadModel() {
  const folder = ".model-cache";
  const path = join(folder, filename);
  let bytes = await readFile(path).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!bytes || !verified(bytes)) {
    const response = await fetch(modelUrl, { signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error("clothing_model_download_failed");
    bytes = Buffer.from(await response.arrayBuffer());
    if (!verified(bytes)) throw new Error("clothing_model_checksum_failed");
    await mkdir(folder, { recursive: true });
    const temp = path + "." + randomUUID();
    try {
      await writeFile(temp, bytes, { flag: "wx" });
      await rename(temp, path);
    } finally {
      await rm(temp, { force: true });
    }
  }
  return InferenceSession.create(bytes, { intraOpNumThreads: 4 });
}

export function warmClothing() {
  model ??= loadModel().catch((error) => {
    model = undefined;
    throw error;
  });
  return model;
}

export function garmentMask(scores) {
  const mask = Buffer.alloc(pixels);
  let face = 0;
  let skin = 0;
  let clothing = 0;
  for (let i = 0; i < pixels; i++) {
    let label = 0;
    let best = -Infinity;
    let excluded = -Infinity;
    for (let c = 0; c < labels; c++) {
      const score = scores[c * pixels + i];
      if (score > best) {
        label = c;
        best = score;
      }
      if (!garments.has(c)) excluded = Math.max(score, excluded);
    }
    if (label === 11) face++;
    if (label >= 12 && label <= 15) skin++;
    if (garments.has(label) && best - excluded >= 0.65) {
      mask[i] = 255;
      clothing++;
    }
  }
  // Pull the mask inward at class boundaries to avoid retaining skin at cuffs and necklines.
  const edge = 2;
  const refined = Buffer.alloc(pixels);
  for (let y = 0; y < size; y++) {
    const above = Math.max(0, y - edge) * size;
    const below = Math.min(size - 1, y + edge) * size;
    for (let x = 0; x < size; x++) {
      const left = Math.max(0, x - edge);
      const right = Math.min(size - 1, x + edge);
      const i = y * size + x;
      refined[i] = mask[i] & mask[above + left] & mask[above + right] &
        mask[below + left] & mask[below + right];
    }
  }
  return {
    mask: refined,
    person: face >= pixels * 0.002 || skin >= pixels * 0.025,
    enoughClothing: clothing >= pixels * 0.008,
  };
}

export async function isolateClothing(input, { width, height }, required) {
  let session;
  try {
    session = await warmClothing();
  } catch {
    throw new ProcessingError("clothing_analysis_unavailable", 30);
  }

  // The checkpoint's image processor expects stretched RGB with BGR-indexed statistics.
  const rgb = await sharp(input)
    .flatten({ background: "#eeeeee" })
    .resize(size, size, { fit: "fill", kernel: "linear" })
    .toColourspace("srgb")
    .raw()
    .toBuffer();
  const normalized = new Float32Array(3 * pixels);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < pixels; i++) {
      normalized[c * pixels + i] = (rgb[3 * i + c] / 255 - mean[c]) / deviation[c];
    }
  }
  const tensor = new Tensor("float32", normalized, [1, 3, size, size]);
  const { logits } = await session.run({ pixel_values: tensor }, ["logits"]).catch(() => {
    throw new ProcessingError("clothing_analysis_unavailable", 30);
  });
  const { mask, person, enoughClothing } = garmentMask(logits.data);
  if (!required && !person) return null;
  if (!enoughClothing) throw new ProcessingError("clothing_not_found");

  const alpha = await sharp(mask, { raw: { width: size, height: size, channels: 1 } })
    .resize(width, height, { fit: "fill", kernel: "linear" })
    .toColourspace("b-w")
    .raw()
    .toBuffer();
  const overlay = Buffer.alloc(width * height * 4);
  for (let i = 0; i < alpha.length; i++) overlay[i * 4 + 3] = alpha[i];
  return sharp(input)
    .ensureAlpha()
    .composite([{ input: overlay, raw: { width, height, channels: 4 }, blend: "dest-in" }])
    .png()
    .toBuffer();
}

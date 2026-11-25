import { resolve } from "node:path";
import sharp from "sharp";

const revision = "6b7c523703ae26e39be4b03774966f8571c7f523";
const labels = {
  "button-up collared shirt": ["Tops", "Shirts"],
  "t-shirt": ["Tops", "T-shirts"],
  "polo shirt": ["Tops", "Polos"],
  "knitted sweater or cardigan": ["Tops", "Sweaters"],
  "tailored trousers": ["Bottoms", "Trousers"],
  "denim jeans": ["Bottoms", "Jeans"],
  shorts: ["Bottoms", "Shorts"],
  skirt: ["Bottoms", "Skirts"],
  "jacket or blazer": ["Outerwear", "Jackets"],
  "long coat": ["Outerwear", "Coats"],
  dress: ["One-piece", "Dresses"],
  jumpsuit: ["One-piece", "Jumpsuits"],
  shoes: ["Footwear", ""],
  eyeglasses: ["Accessories", "Glasses"],
  handbag: ["Accessories", "Bags"],
  watch: ["Accessories", "Watches"],
  "another object": [],
};
let vision;
let retryAfter = 0;

export function warmVision() {
  if (!vision && Date.now() >= retryAfter) {
    vision = import("@huggingface/transformers")
      .then(async ({ pipeline, env, RawImage }) => {
        env.cacheDir = resolve(".model-cache", "transformers");
        const detect = await pipeline(
          "zero-shot-image-classification",
          "Xenova/clip-vit-base-patch32",
          {
            revision,
            dtype: "q8",
            device: "cpu",
            session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 },
          },
        );
        return { detect, RawImage };
      })
      .catch(() => {
        vision = undefined;
        retryAfter = Date.now() + 60_000;
        throw Error("photo_category_model_unavailable");
      });
  }
  return vision;
}

function colorName(red, green, blue) {
  const max = Math.max(red, green, blue),
    min = Math.min(red, green, blue);
  const chroma = max - min;
  if (max < 59) return "Black";
  if (chroma < 25) return min > 199 ? "White" : "Gray";
  const hue =
    ((max === red
      ? (green - blue) / chroma
      : max === green
        ? (blue - red) / chroma + 2
        : (red - green) / chroma + 4) *
      60 +
      360) %
    360;
  if (hue >= 195 && hue < 255) return max < 108 ? "Navy" : "Blue";
  if (hue >= 255 && hue < 330) return "Purple";
  if (hue >= 330) return max >= 152 && chroma < 100 ? "Pink" : "Red";
  if (hue < 14) return "Red";
  if (hue < 60 && (max < 155 || min > 126))
    return max < 155 ? "Brown" : "Beige";
  if (hue < 42) return "Orange";
  if (hue < 67) return "Yellow";
  if (hue < 167) return "Green";
  return "Teal";
}

export async function detectColor(cutout) {
  const pixels = await sharp(cutout)
    .resize(96, 96, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const counts = new Map();
  let total = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 188) continue;
    const color = colorName(pixels[i], pixels[i + 1], pixels[i + 2]);
    counts.set(color, (counts.get(color) || 0) + 1);
    total++;
  }
  const [first, second] = [...counts].sort((a, b) => b[1] - a[1]);
  if (total < 24 || !first || first[1] < total * 0.38) return "";
  if (
    second &&
    first[1] < second[1] * 1.25 &&
    !["Black", "Gray"].every((color) => [first[0], second[0]].includes(color))
  )
    return "";
  return first[0];
}

export async function detectCategory(cutout, model) {
  const bytes = await sharp(cutout)
    .trim({ background: "#0000", threshold: 3, margin: 4 })
    .resize(224, 224, { fit: "contain", background: "#eeeae1" })
    .flatten({ background: "#eeeae1" })
    .jpeg()
    .toBuffer();
  const image = await model.RawImage.fromBlob(
    new Blob([bytes], { type: "image/jpeg" }),
  );
  const results = await model.detect(image, Object.keys(labels), {
    hypothesis_template: "A product photo of a {}.",
  });
  const [first, second] = results;
  if (!first || first.score < 0.33 || first.score < (second?.score || 0) * 1.45)
    return {};
  const [category, subtype] = labels[first.label] || [];
  return category ? { category, subtype } : {};
}

export async function suggestGarment(cutout) {
  const color = await detectColor(cutout);
  if (process.env.PHOTO_AUTO_CLASSIFY !== "1") return { color };
  let timeout;
  try {
    const classification = await Promise.race([
      Promise.resolve(warmVision()).then((model) =>
        model ? detectCategory(cutout, model) : {},
      ),
      new Promise((resolve) => {
        timeout = setTimeout(() => resolve({}), 10_000);
        timeout.unref();
      }),
    ]);
    return { color, ...classification };
  } catch {
    return { color };
  } finally {
    clearTimeout(timeout);
  }
}

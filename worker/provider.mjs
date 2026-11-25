import { validateCutout } from "./images.mjs";

/** @typedef {{remove(input: Buffer, dimensions: {width:number,height:number}): Promise<{bytes:Buffer,reference:string|null}>}} BackgroundRemovalProvider */
export class ProcessingError extends Error {
  constructor(code, delay = null) {
    super(code);
    this.delay = delay;
  }
}

function waitSeconds(header) {
  if (!header) return 30;
  const seconds = /^\d+$/.test(header)
    ? Number(header)
    : (Date.parse(header) - Date.now()) / 1000;
  return Number.isFinite(seconds) ? Math.max(1, Math.ceil(seconds)) : 30;
}

/** @implements {BackgroundRemovalProvider} */
export class PhotoroomProvider {
  constructor(key, transport = fetch) {
    this.key = key;
    this.transport = transport;
  }
  async remove(input, dimensions) {
    if (!this.key) throw new ProcessingError("provider_unconfigured");
    const body = new FormData();
    body.set(
      "image_file",
      new Blob([new Uint8Array(input)], { type: "image/png" }),
      "garment.png",
    );
    body.set("format", "png");
    let response;
    try {
      response = await this.transport("https://sdk.photoroom.com/v1/segment", {
        method: "POST",
        redirect: "error",
        headers: { "x-api-key": this.key },
        body,
        signal: AbortSignal.timeout(60000),
      });
    } catch {
      throw new ProcessingError("provider_network", 30);
    }
    return readCutout(response, dimensions);
  }
}

async function readCutout(response, dimensions) {
  if (response.status === 429)
    throw new ProcessingError(
      "provider_rate_limit",
      waitSeconds(response.headers.get("retry-after")),
    );
  if (response.status >= 500)
    throw new ProcessingError("provider_temporary", 30);
  if (!response.ok) throw new ProcessingError("provider_rejected");
  if (
    !/^image\/(png|webp)(;|$)/i.test(
      response.headers.get("content-type") ?? "",
    ) ||
    !response.body
  )
    throw new ProcessingError("invalid_cutout");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 32 * 1024 * 1024) {
        await reader.cancel();
        throw new ProcessingError("invalid_cutout");
      }
      chunks.push(part.value);
    }
  } catch (e) {
    if (e instanceof ProcessingError) throw e;
    throw new ProcessingError("provider_network", 30);
  }
  let bytes;
  try {
    bytes = await validateCutout(Buffer.concat(chunks), dimensions);
  } catch {
    throw new ProcessingError("invalid_cutout");
  }
  return {
    bytes,
    reference: response.headers.get("x-request-id")?.slice(0, 160) ?? null,
  };
}

/** @implements {BackgroundRemovalProvider} */
export class LocalProvider {
  async remove(input, dimensions) {
    let response;
    try {
      response = await fetch("http://127.0.0.1:7179/remove", {
        method: "POST",
        redirect: "error",
        headers: { "content-type": "image/png" },
        body: new Uint8Array(input),
        signal: AbortSignal.timeout(90000),
      });
    } catch {
      throw new ProcessingError("local_provider_unreachable", 30);
    }
    return readCutout(response, dimensions);
  }
}

export function configuredProvider() {
  const name = process.env.BACKGROUND_PROVIDER || "photoroom";
  if (name === "local") return new LocalProvider();
  if (name === "photoroom" && process.env.PHOTOROOM_API_KEY)
    return new PhotoroomProvider(process.env.PHOTOROOM_API_KEY);
  return null;
}

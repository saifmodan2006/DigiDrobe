import { useEffect, useRef, useState } from "react";
import { Camera, Upload, RotateCw, ImagePlus } from "lucide-react";
import { db, photo, message } from "../lib/client";
import type { Item } from "../lib/model";
const maximum = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_BYTES || 10485760);
export default function Capture({
  item,
  go,
  refresh,
}: {
  item?: Item;
  go: (s: string) => void;
  refresh: () => Promise<void>;
}) {
  const [file, setFile] = useState<File>(),
    [src, url] = useState(""),
    [rotation, rotate] = useState(0),
    [crop, trim] = useState(100),
    [x, moveX] = useState(50),
    [y, moveY] = useState(50),
    [clothesOnly, setClothesOnly] = useState(false),
    [error, tell] = useState(""),
    [busy, status] = useState(""),
    [camera, preview] = useState(false),
    [cameraReady, setReady] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    native = useRef<HTMLInputElement>(null),
    video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    request = useRef(""),
    draftId = useRef(item?.id),
    mounted = useRef(true),
    cameraRequest = useRef(0),
    canvas = useRef<HTMLCanvasElement>(null);
  const fraction = crop / 100,
    left = ((1 - fraction) * x) / 100,
    top = ((1 - fraction) * y) / 100;
  function stop() {
    cameraRequest.current++;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    preview(false);
    setReady(false);
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  useEffect(() => {
    if (!file) return;
    const u = URL.createObjectURL(file);
    url(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  useEffect(() => {
    if (!src) return;
    let live = true;
    const img = new Image();
    img.onload = () => {
      const c = canvas.current;
      if (!live || !c) return;
      const sideways = rotation % 180 !== 0;
      const w = sideways ? img.height : img.width,
        h = sideways ? img.width : img.height,
        scale = Math.min(1, 800 / Math.max(w, h));
      c.width = Math.max(1, Math.round(w * scale * fraction));
      c.height = Math.max(1, Math.round(h * scale * fraction));
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.scale(scale, scale);
      ctx.translate(w * (0.5 - left), h * (0.5 - top));
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
    };
    img.onerror = () => {
      if (live)
        tell(
          "This image could not be decoded. Choose a JPEG, PNG or WebP file.",
        );
    };
    img.src = src;
    return () => {
      live = false;
    };
  }, [src, rotation, fraction, left, top]);
  function select(f?: File) {
    if (!f) return;
    if (
      f.size > maximum ||
      !["image/jpeg", "image/png", "image/webp"].includes(f.type)
    ) {
      tell(
        "Choose a JPEG, PNG or WebP within the size limit. Convert HEIC or HEIF before uploading.",
      );
      return;
    }
    stop();
    tell("");
    request.current = crypto.randomUUID();
    setFile(f);
    rotate(0);
    trim(100);
    moveX(50);
    moveY(50);
    setClothesOnly(false);
  }
  async function openCamera() {
    tell("");
    if (!navigator.mediaDevices?.getUserMedia) {
      native.current?.click();
      tell("If your device has no camera, use Upload photo.");
      return;
    }
    const id = ++cameraRequest.current;
    try {
      const tracks = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (!mounted.current || id !== cameraRequest.current) {
        tracks.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = tracks;
      preview(true);
    } catch {
      tell(
        "Camera unavailable. Allow camera access, use your device camera, or upload a photo.",
      );
    }
  }
  useEffect(() => {
    if (camera && video.current) video.current.srcObject = stream.current;
  }, [camera]);
  async function submit() {
    if (!file || busy) return;
    status("Preparing draft…");
    tell("");
    try {
      const draft = await photo({
        action: "begin",
        requestId: request.current,
        itemId: draftId.current,
        name:
          item?.name ||
          file.name.replace(/\.[^.]+$/, "").slice(0, 100) ||
          "New item",
        rotation,
        clothesOnly,
        crop: { x: left, y: top, width: fraction, height: fraction },
      });
      draftId.current = draft.itemId;
      status("Uploading photo…");
      const result = await db!.storage
        .from("wardrobe")
        .uploadToSignedUrl(draft.path, draft.token, file, {
          contentType: file.type,
        });
      if (
        result.error &&
        !/already exists|duplicate/i.test(result.error.message)
      )
        throw result.error;
      status("Checking image…");
      await photo({
        action: "finalize",
        itemId: draft.itemId,
        revision: draft.revision,
      });
      await refresh();
      go("Item/" + draft.itemId);
    } catch (e) {
      tell(message(e));
      await refresh();
    } finally {
      status("");
    }
  }
  return (
    <>
      <button className="text-button" onClick={() => go("Wardrobe")}>
        Back to wardrobe
      </button>
      <h1>{item ? "Replace photo" : "Add item"}</h1>
      <p className="intro">
        Photograph one garment or accessory at a time. A pair of shoes counts as
        one item.
      </p>
      <section
        className="panel capture"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!busy) select(e.dataTransfer.files[0]);
        }}
      >
        <p>
          JPEG, PNG or WebP · Up to {Math.floor(maximum / 1048576)} MB. Convert
          HEIC or HEIF first.
        </p>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => select(e.target.files?.[0])}
        />
        <input
          ref={native}
          type="file"
          capture="environment"
          accept="image/*"
          hidden
          onChange={(e) => select(e.target.files?.[0])}
        />
        {camera ? (
          <>
            <video
              ref={video}
              autoPlay
              playsInline
              muted
              onLoadedData={() => setReady(true)}
              aria-label="Live camera preview"
            />
            <div className="actions">
              <button
                disabled={!cameraReady}
                onClick={() => {
                  const v = video.current!;
                  const c = document.createElement("canvas");
                  c.width = v.videoWidth;
                  c.height = v.videoHeight;
                  c.getContext("2d")?.drawImage(v, 0, 0);
                  c.toBlob(
                    (b) =>
                      b &&
                      select(
                        new File([b], "Camera item.jpg", {
                          type: "image/jpeg",
                        }),
                      ),
                    "image/jpeg",
                    0.92,
                  );
                }}
              >
                Capture photo
              </button>
              <button onClick={stop}>Close camera</button>
            </div>
          </>
        ) : (
          <>
            {file ? (
              <div className="preview">
                <canvas
                  ref={canvas}
                  aria-label="Cropped and rotated image preview"
                />
              </div>
            ) : (
              <div className="drop">
                <ImagePlus size={38} />
                <h2>Drop your photo here</h2>
              </div>
            )}
            <div className="actions">
              <button disabled={!!busy} onClick={() => input.current?.click()}>
                <Upload size={18} />
                {file ? "Replace photo" : "Upload photo"}
              </button>
              <button disabled={!!busy} onClick={openCamera}>
                <Camera size={18} />
                {file ? "Retake" : "Take photo"}
              </button>
            </div>
          </>
        )}
        {error.includes("Camera unavailable") && (
          <button onClick={() => native.current?.click()}>
            Use device camera
          </button>
        )}
        {file && !camera && (
          <fieldset
            disabled={!!busy}
            onChange={() => {
              request.current = crypto.randomUUID();
            }}
          >
            <legend>Crop and rotation</legend>
            <button
              onClick={() => {
                rotate((rotation + 90) % 360);
                request.current = crypto.randomUUID();
              }}
            >
              <RotateCw size={16} />
              Rotate 90°
            </button>
            <label>
              Crop · {crop}% retained
              <input
                type="range"
                min="20"
                max="100"
                value={crop}
                onChange={(e) => trim(+e.target.value)}
              />
            </label>
            {crop < 100 && (
              <>
                <label>
                  Horizontal position
                  <input
                    type="range"
                    value={x}
                    onChange={(e) => moveX(+e.target.value)}
                  />
                </label>
                <label>
                  Vertical position
                  <input
                    type="range"
                    value={y}
                    onChange={(e) => moveY(+e.target.value)}
                  />
                </label>
              </>
            )}
            <label className="worn-photo-option">
              <input
                type="checkbox"
                checked={clothesOnly}
                onChange={(e) => setClothesOnly(e.target.checked)}
                aria-describedby="clothes-only-help"
              />
              Someone is wearing the clothes
            </label>
            <p id="clothes-only-help">
              Select this to keep only the visible garments and remove the
              person along with the background.
            </p>
            <button className="primary" onClick={submit}>
              {clothesOnly ? "Extract clothes" : "Remove background"}
            </button>
          </fieldset>
        )}
        <p role="status">{busy}</p>
        {error && (
          <div role="alert" className="notice">
            {error}{" "}
            <button onClick={() => go("Needs review")}>Open drafts</button>
          </div>
        )}
      </section>
    </>
  );
}

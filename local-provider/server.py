"""Run the compact U²-Net segmentation model on loopback, on the worker host."""
import hashlib
import io
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import urllib.request

import numpy as np
import onnxruntime as ort
from PIL import Image

MODEL = Path(__file__).resolve().parents[1] / ".model-cache" / "u2netp.onnx"
URL = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx"
DIGEST = "309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8"


def load_model():
    if not MODEL.exists():
        MODEL.parent.mkdir(exist_ok=True)
        temporary = MODEL.with_suffix(".download")
        urllib.request.urlretrieve(URL, temporary)
        if hashlib.sha256(temporary.read_bytes()).hexdigest() != DIGEST:
            raise RuntimeError("Model download failed integrity check")
        temporary.replace(MODEL)
    if hashlib.sha256(MODEL.read_bytes()).hexdigest() != DIGEST:
        raise RuntimeError("Model failed integrity check")
    settings = ort.SessionOptions()
    settings.intra_op_num_threads = 2
    return ort.InferenceSession(str(MODEL), settings, providers=["CPUExecutionProvider"])


def segment(session, source):
    rgb = source.convert("RGB")
    samples = np.asarray(rgb.resize((320, 320), Image.Resampling.LANCZOS), dtype=np.float32)
    samples /= max(float(samples.max()), 1.0)
    samples -= np.array([0.485, 0.456, 0.406], dtype=np.float32)
    samples /= np.array([0.229, 0.224, 0.225], dtype=np.float32)
    tensor = samples.transpose(2, 0, 1)[None, ...]
    mask = session.run([session.get_outputs()[0].name], {session.get_inputs()[0].name: tensor})[0].squeeze()
    span = float(np.ptp(mask))
    if span < 1e-6:
        raise ValueError("No foreground found")
    mask = np.uint8(255 * ((mask - mask.min()) / span))
    alpha = Image.fromarray(mask).resize(rgb.size, Image.Resampling.LANCZOS)
    rgb.putalpha(alpha)
    return rgb


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/remove" or self.headers.get("Content-Type") != "image/png":
            self.send_error(400)
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            if not 0 < length <= 32 * 1024 * 1024:
                self.send_error(413)
                return
            with Image.open(io.BytesIO(self.rfile.read(length)), formats=["PNG"]) as source:
                if source.width * source.height > 2400 * 2400:
                    self.send_error(413)
                    return
                result = segment(self.server.model, source)
            output = io.BytesIO()
            result.save(output, format="PNG")
            payload = output.getvalue()
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except (OSError, ValueError):
            self.send_error(422)

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    with HTTPServer(("127.0.0.1", 7179), Handler) as server:
        server.model = load_model()
        print("Local segmentation ready on 127.0.0.1:7179", flush=True)
        server.serve_forever()

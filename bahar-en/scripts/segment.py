"""Per-frame character matte with rembg's ISNet / U2Net ONNX models (no rembg install needed)."""
import sys
import numpy as np
import onnxruntime as ort
from PIL import Image

CFG = {
    "isnet-general-use": (1024, (0.5, 0.5, 0.5), (1.0, 1.0, 1.0)),
    "u2net_human_seg": (320, (0.485, 0.456, 0.406), (0.229, 0.224, 0.225)),
}


class Matte:
    def __init__(self, path, kind):
        self.sess = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
        self.size, self.mean, self.std = CFG[kind]
        self.name = self.sess.get_inputs()[0].name

    def __call__(self, rgb):
        h, w = rgb.shape[:2]
        im = np.asarray(Image.fromarray(rgb).resize((self.size, self.size), Image.LANCZOS), np.float32)
        im = im / max(im.max(), 1e-6)
        im = (im - np.array(self.mean)) / np.array(self.std)
        out = self.sess.run(None, {self.name: im.transpose(2, 0, 1)[None].astype(np.float32)})[0][0, 0]
        out = (out - out.min()) / (out.max() - out.min() + 1e-8)
        return np.asarray(Image.fromarray((out * 255).astype(np.uint8)).resize((w, h), Image.LANCZOS), np.float32) / 255

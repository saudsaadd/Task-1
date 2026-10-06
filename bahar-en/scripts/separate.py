"""Split the original soundtrack into voice and background (MDX-Net, UVR models).

Usage: python3 scripts/separate.py in.wav out_dir [model.onnx n_fft primary]
Writes out_dir/vocals.wav and out_dir/background.wav at 44.1 kHz stereo.
"""
import os
import subprocess
import sys

import numpy as np
import onnxruntime as ort
import soundfile as sf

SR = 44100
HOP = 1024
DIM_T = 256
DIM_F = 3072


def stft(x, n_fft):
    """torch.stft(center=True, reflect pad, periodic Hann) for x: [C, N] -> [C, bins, frames]."""
    w = 0.5 - 0.5 * np.cos(2 * np.pi * np.arange(n_fft) / n_fft)
    xp = np.pad(x, ((0, 0), (n_fft // 2, n_fft // 2)), mode="reflect")
    frames = 1 + (xp.shape[1] - n_fft) // HOP
    idx = np.arange(n_fft)[None, :] + HOP * np.arange(frames)[:, None]
    return np.fft.rfft(xp[:, idx] * w, axis=-1).transpose(0, 2, 1)


def istft(X, n_fft, length):
    w = 0.5 - 0.5 * np.cos(2 * np.pi * np.arange(n_fft) / n_fft)
    frames = X.shape[2]
    sig = np.fft.irfft(X.transpose(0, 2, 1), n=n_fft, axis=-1) * w
    out = np.zeros((X.shape[0], n_fft + HOP * (frames - 1)))
    env = np.zeros(n_fft + HOP * (frames - 1))
    for t in range(frames):
        out[:, t * HOP: t * HOP + n_fft] += sig[:, t]
        env[t * HOP: t * HOP + n_fft] += w ** 2
    out = out / np.maximum(env, 1e-8)
    return out[:, n_fft // 2: n_fft // 2 + length]


def run(mix, model_path, n_fft):
    sess = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    n_bins = n_fft // 2 + 1
    chunk = HOP * (DIM_T - 1)
    trim = n_fft // 2
    gen = chunk - 2 * trim
    n = mix.shape[1]
    pad = gen - n % gen
    mix_p = np.concatenate([np.zeros((2, trim)), mix, np.zeros((2, pad)), np.zeros((2, trim))], 1)
    outs = []
    for i in range(0, n + pad, gen):
        part = mix_p[:, i:i + chunk]
        S = stft(part, n_fft)                                  # [2, bins, 256]
        spec = np.stack([S.real, S.imag], 1).reshape(4, n_bins, DIM_T)[None, :, :DIM_F].astype(np.float32)
        pred = 0.5 * sess.run(None, {"input": spec})[0] - 0.5 * sess.run(None, {"input": -spec})[0]
        full = np.zeros((1, 4, n_bins, DIM_T), np.float32)
        full[:, :, :DIM_F] = pred
        full = full.reshape(2, 2, n_bins, DIM_T)
        wave = istft(full[:, 0] + 1j * full[:, 1], n_fft, chunk)
        outs.append(wave[:, trim:-trim])
    return np.concatenate(outs, 1)[:, :n]


def main():
    src, out_dir = sys.argv[1], sys.argv[2]
    model = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.environ.get("UVR_DIR", "models"), "Kim_Vocal_2.onnx")
    n_fft = int(sys.argv[4]) if len(sys.argv) > 4 else 7680
    primary = sys.argv[5] if len(sys.argv) > 5 else "vocals"
    os.makedirs(out_dir, exist_ok=True)
    tmp = os.path.join(out_dir, "mix44k.wav")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-ar", str(SR), "-ac", "2", tmp], check=True)
    mix, _ = sf.read(tmp)
    mix = mix.T
    est = run(mix, model, n_fft)
    vocals, background = (est, mix - est) if primary == "vocals" else (mix - est, est)
    sf.write(os.path.join(out_dir, "vocals.wav"), vocals.T, SR)
    sf.write(os.path.join(out_dir, "background.wav"), background.T, SR)
    print("wrote", out_dir)


if __name__ == "__main__":
    main()

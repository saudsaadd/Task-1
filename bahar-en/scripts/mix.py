"""Original background bed + English voice, at the original voice level."""
import subprocess

import numpy as np
import soundfile as sf

SR = 44100


def lowpass(x, fc):
    X = np.fft.rfft(x, axis=0)
    f = np.fft.rfftfreq(x.shape[0], 1 / SR)
    return np.fft.irfft(X * (1 / (1 + (f / fc) ** 8))[:, None], x.shape[0], axis=0)


bg, _ = sf.read("build/sep_kim/background.wav")            # [N, 2]
orig_voice, _ = sf.read("build/sep_kim/vocals.wav")
# the bed is a low drone; damp everything above it so no Arabic syllables leak through
low = lowpass(bg, 260)
bg_clean = low + (bg - low) * 0.3

subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", "build/voice_en.wav", "-ar", str(SR), "-ac", "1",
                "build/voice_en44.wav"], check=True)
vo, _ = sf.read("build/voice_en44.wav")
vo = np.pad(vo, (0, max(0, len(bg) - len(vo))))[: len(bg)]


def speech_rms(x):
    x = x if x.ndim == 1 else x.mean(1)
    frames = x[: len(x) // 4410 * 4410].reshape(-1, 4410)
    r = np.sqrt((frames ** 2).mean(1))
    return np.sqrt((r[r > r.max() * 0.15] ** 2).mean())


vo *= speech_rms(orig_voice) / speech_rms(vo)
mix = bg_clean + vo[:, None]
peak = np.abs(mix).max()
if peak > 0.97:
    mix *= 0.97 / peak
sf.write("build/mix_en.wav", mix.astype(np.float32), SR)
print("voice gain matched; peak", round(float(np.abs(mix).max()), 3))

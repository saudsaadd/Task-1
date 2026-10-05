"""Synthesize the music bed and sound effects, then mix them under the voiceover.

Inputs : build/voiceover.wav (scripts/voiceover.py), build/sfx.json (scripts/render.mjs)
Output : build/mix.wav (44.1 kHz stereo, 60 s)

Everything is generated with numpy so the soundtrack is royalty free.
"""
import json
import os
import subprocess

import numpy as np
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "build")
SR = 44100
DUR = 60.0
N = int(SR * DUR)
rng = np.random.default_rng(11)


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tvec(d):
    return np.arange(int(d * SR)) / SR


def place(buf, sig, t, gain=1.0):
    a = int(t * SR)
    if a >= len(buf):
        return
    b = min(len(buf), a + len(sig))
    buf[a:b] += sig[: b - a] * gain


def fft_filter(x, lo=None, hi=None):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    m = np.ones_like(f)
    if lo:
        m *= 1 / (1 + (lo / np.maximum(f, 1)) ** 4)
    if hi:
        m *= 1 / (1 + (f / hi) ** 4)
    return np.fft.irfft(X * m, len(x))


def reverb(x, seconds=1.6, mix=0.22):
    n = int(seconds * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / (SR * seconds / 6.5))
    ir = fft_filter(ir, hi=6000)
    ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    wet = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return x + wet * mix


# ---------------------------------------------------------------- instruments
def pluck(f, d=0.45, bright=1.0):
    t = tvec(d)
    env = np.exp(-t / 0.16) * (1 - np.exp(-t / 0.002))
    sig = (np.sin(2 * np.pi * f * t) + 0.45 * bright * np.sin(4 * np.pi * f * t) * np.exp(-t / 0.06)
           + 0.2 * bright * np.sin(6 * np.pi * f * t) * np.exp(-t / 0.04))
    return sig * env


def pad(freqs, d):
    t = tvec(d)
    sig = np.zeros_like(t)
    for f in freqs:
        for det in (-0.12, 0.12):
            ff = f * 2 ** (det / 12)
            for h in range(1, 6):
                sig += np.sin(2 * np.pi * ff * h * t + h) / h ** 1.6
    att = np.minimum(1, t / 0.35)
    rel = np.minimum(1, (d - t) / 0.4)
    return sig * att * rel / (len(freqs) * 4)


def bass(f, d):
    t = tvec(d)
    env = (1 - np.exp(-t / 0.004)) * (0.6 + 0.4 * np.exp(-t / 0.12)) * np.minimum(1, (d - t) / 0.03)
    return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)) * env


def kick():
    t = tvec(0.35)
    f = 45 + 95 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t / 0.11) + 0.3 * rng.standard_normal(len(t)) * np.exp(-t / 0.003)


def clap():
    t = tvec(0.25)
    n = fft_filter(rng.standard_normal(len(t)), lo=900, hi=5000)
    env = np.exp(-t / 0.07) * (1 + 0.6 * np.exp(-((t - 0.012) ** 2) / 0.00002))
    return n * env / np.max(np.abs(n))


def hat(d=0.06):
    t = tvec(d)
    n = fft_filter(rng.standard_normal(len(t)), lo=7000)
    return n * np.exp(-t / 0.018) / np.max(np.abs(n))


# ---------------------------------------------------------------- music
def music():
    L = np.zeros(N)
    bpm = 120
    beat = 60 / bpm
    bar = 4 * beat
    # C - G - Am - F, voiced around middle C
    chords = [(48, [60, 64, 67, 72]), (43, [59, 62, 67, 71]), (45, [60, 64, 69, 72]), (41, [60, 65, 69, 72])]
    K, C, H = kick(), clap(), hat()
    nbars = int(DUR / bar)
    for b in range(nbars):
        t0 = b * bar
        root, notes = chords[b % 4]
        intro = t0 < 2.0
        brk = 45.0 <= t0 < 49.0          # quieter switch moment before the end card
        finale = t0 >= 50.0
        outro = t0 >= 58.0
        if outro:
            place(L, pad([midi(n) for n in [48, 55, 60, 64, 67, 72]], 2.0) * 1.4, t0, 0.5)
            place(L, kick(), t0, 0.8)
            continue
        place(L, pad([midi(n) for n in notes], bar), t0, 0.32 if finale else 0.26)
        # arpeggio on 8ths
        pattern = [0, 1, 2, 3, 2, 1, 2, 3]
        for i, p in enumerate(pattern):
            n = notes[p] + (12 if finale and i % 2 else 0)
            place(L, pluck(midi(n + 12), bright=1.2 if finale else 1.0), t0 + i * beat / 2, 0.16)
        if intro:
            continue
        for i in range(8):                       # bass 8ths
            place(L, bass(midi(root - 12 + (12 if i % 4 == 3 else 0)), beat / 2 * 0.9), t0 + i * beat / 2, 0.30)
        if brk:
            continue
        for i in range(4):
            place(L, K, t0 + i * beat, 0.55)
            if i % 2 == 1:
                place(L, C, t0 + i * beat, 0.18)
        for i in range(8):
            place(L, H, t0 + i * beat / 2 + beat / 2 * 0, 0.06 if i % 2 == 0 else 0.11)
    L = reverb(L, 1.4, 0.18)
    fade = np.ones(N)
    fade[-int(1.2 * SR):] = np.linspace(1, 0, int(1.2 * SR)) ** 2
    fade[: int(0.05 * SR)] = np.linspace(0, 1, int(0.05 * SR))
    return L * fade


# ---------------------------------------------------------------- sound effects
def sweep_noise(d, f0, f1, q=0.25):
    """Noise through a band-pass whose centre glides from f0 to f1."""
    t = tvec(d)
    noise = rng.standard_normal(len(t))
    fc = f0 * (f1 / f0) ** (t / d)
    # state-variable filter, sample by sample
    low = band = 0.0
    out = np.empty_like(noise)
    for i, x in enumerate(noise):
        f = 2 * np.sin(np.pi * fc[i] / SR)
        low += f * band
        high = x - low - q * band
        band += f * high
        out[i] = band
    return out / (np.max(np.abs(out)) + 1e-9)


def fx_whoosh(d=0.75):
    t = tvec(d)
    env = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.6
    return sweep_noise(d, 300, 3500, 0.5) * env * 0.9


def fx_swish():
    d = 0.35
    t = tvec(d)
    return sweep_noise(d, 1500, 6000, 0.6) * np.sin(np.pi * t / d) ** 2 * 0.5


def fx_pop():
    t = tvec(0.12)
    f = 420 + 700 * (t / 0.12)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t / 0.035) * 0.6


def fx_land():
    t = tvec(0.2)
    f = 50 + 70 * np.exp(-t / 0.03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.06) * 0.7


def bell(f, d=1.4, decay=0.5):
    t = tvec(d)
    sig = np.zeros_like(t)
    for ratio, amp, dec in ((1, 1, 1), (2.76, 0.4, 0.5), (5.4, 0.2, 0.3), (8.9, 0.1, 0.2)):
        sig += amp * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t / (decay * dec))
    return sig * (1 - np.exp(-t / 0.002)) * 0.35


def fx_chime():
    out = np.zeros(int(1.8 * SR))
    for i, m in enumerate([84, 88, 91, 96]):
        place(out, bell(midi(m)), i * 0.07)
    return out


def fx_sparkle():
    out = np.zeros(int(1.4 * SR))
    for i, m in enumerate([91, 95, 98, 100, 103, 98, 103, 107]):
        place(out, bell(midi(m), 0.6, 0.15) * 0.7, i * 0.045)
    return out


def fx_ding():
    return bell(midi(96), 0.9, 0.3)


def fx_shield():
    d = 0.7
    t = tvec(d)
    f = 260 * (4 ** (t / 0.45)).clip(max=4.0)
    ph = 2 * np.pi * np.cumsum(f) / SR
    sig = (np.sin(ph) + 0.4 * np.sin(2 * ph) + 0.2 * np.sin(3 * ph)) * np.minimum(1, t / 0.05) * np.exp(-t / 0.35)
    return sig * 0.35 + fx_chime()[: len(t)] * 0.6


def fx_zap():
    d = 0.45
    t = tvec(d)
    buzz = np.sign(np.sin(2 * np.pi * 110 * t)) * 0.3 + rng.standard_normal(len(t)) * 0.4
    crackle = (rng.random(len(t)) > 0.985) * rng.standard_normal(len(t)) * 2.0
    sig = fft_filter(buzz + crackle, lo=200, hi=7000)
    return sig / np.max(np.abs(sig)) * np.exp(-t / 0.15) * 0.45


def fx_thunder():
    d = 3.0
    t = tvec(d)
    crack = fft_filter(rng.standard_normal(len(t)), lo=1200) * np.exp(-t / 0.05)
    rumble = fft_filter(rng.standard_normal(len(t)), hi=180)
    rumble /= np.max(np.abs(rumble))
    rumble *= np.minimum(1, t / 0.08) * np.exp(-t / 0.9) * (1 + 0.4 * np.sin(2 * np.pi * 2.3 * t))
    crack /= np.max(np.abs(crack))
    return crack * 0.55 + rumble * 0.9


def fx_stamp():
    t = tvec(0.3)
    thump = np.sin(2 * np.pi * np.cumsum(60 + 90 * np.exp(-t / 0.02)) / SR) * np.exp(-t / 0.07)
    slap = fft_filter(rng.standard_normal(len(t)), lo=600, hi=4000) * np.exp(-t / 0.025)
    return thump * 0.8 + slap / np.max(np.abs(slap)) * 0.4


def fx_click():
    out = np.zeros(int(0.15 * SR))
    for k, t0 in enumerate((0.0, 0.035)):
        t = tvec(0.03)
        c = fft_filter(rng.standard_normal(len(t)), lo=2500) * np.exp(-t / 0.004)
        place(out, c / np.max(np.abs(c)) * (0.7 if k == 0 else 0.4), t0)
    return out


def fx_shimmer():
    d = 1.2
    t = tvec(d)
    sig = np.zeros_like(t)
    for i, m in enumerate([72, 76, 79, 84, 88]):
        sig += np.sin(2 * np.pi * midi(m) * t) * np.clip((t - i * 0.06) / 0.05, 0, 1) * np.exp(-np.maximum(0, t - i * 0.06) / 0.5)
    return sig * 0.12 + fx_sparkle()[: len(t)] * 0.5


FX = {
    "whoosh": fx_whoosh, "swish": fx_swish, "pop": fx_pop, "land": fx_land, "chime": fx_chime,
    "sparkle": fx_sparkle, "ding": fx_ding, "shield": fx_shield, "zap": fx_zap, "thunder": fx_thunder,
    "stamp": fx_stamp, "click": fx_click, "shimmer": fx_shimmer,
}
FX_LEVEL = {"whoosh": 0.5, "swish": 0.35, "pop": 0.32, "land": 0.4, "chime": 0.4, "sparkle": 0.35,
            "ding": 0.3, "shield": 0.45, "zap": 0.35, "thunder": 0.7, "stamp": 0.55, "click": 0.6,
            "shimmer": 0.45}


def main():
    vo_path = os.path.join(BUILD, "voiceover_44k.wav")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", os.path.join(BUILD, "voiceover.wav"),
                    "-ar", str(SR), "-ac", "1", vo_path], check=True)
    vo, _ = sf.read(vo_path)
    vo = np.pad(vo, (0, max(0, N - len(vo))))[:N]

    mus = music()
    mus /= np.max(np.abs(mus))

    fx = np.zeros(N)
    cache = {}
    for cue in json.load(open(os.path.join(BUILD, "sfx.json"))):
        kind = cue["type"]
        if kind not in cache:
            s = FX[kind]()
            cache[kind] = s / (np.max(np.abs(s)) + 1e-9)
        place(fx, cache[kind], cue["t"], FX_LEVEL[kind] * cue.get("gain", 1))

    # duck the music under the voice: 100 Hz envelope, fast attack, slow release
    hop = SR // 100
    frames = np.abs(vo[: len(vo) // hop * hop]).reshape(-1, hop).max(axis=1)
    level = np.minimum(1, frames / 0.12)
    env, g = np.zeros_like(level), 0.0
    for i, v in enumerate(level):
        g = v if v > g else g * 0.93
        env[i] = g
    duck = 1 - 0.5 * np.interp(np.arange(N) / hop, np.arange(len(env)), env)

    mix = vo * 1.0 + mus * 0.30 * duck + fx * 0.9
    # gentle stereo: music/fx slightly wider than the centred voice
    left = mix + 0.04 * np.roll(mus * duck + fx, 220)
    right = mix + 0.04 * np.roll(mus * duck + fx, -220)
    st = np.stack([left, right], axis=1)
    st = np.tanh(st * 1.1) / np.tanh(1.1)
    st /= np.max(np.abs(st)) / 0.95
    sf.write(os.path.join(BUILD, "mix.wav"), st.astype(np.float32), SR)
    print("wrote build/mix.wav")


if __name__ == "__main__":
    main()

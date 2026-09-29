#!/usr/bin/env python3
"""PAGAR — original score + sound design for the 60-second motion film (driven by ../src/timeline.json).

Everything is synthesized here with numpy + scipy, deterministically (seeded RNG):
  * music — minimal industrial techno in A minor at 120 BPM, arranged per the timeline's `music`
    sections; hard stops are true digital silence;
  * sfx   — one designed sound per timeline event, its transient on the exact frame
    (frame f → sample f × 1600 at 48 kHz / 30 fps). `freeze` is the one sound that ENDS on its frame.

Outputs (48 kHz, stereo, 16-bit, exactly 60.000 s):
  public/audio/score_raw.wav — the mix, sample peak -1 dBFS
  public/audio/score.wav     — ffmpeg two-pass loudnorm → -14 LUFS integrated, true peak ≤ -1.5 dBTP

Run from video/:  npm run score   (python3 scripts/score.py)
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile
from scipy.ndimage import minimum_filter1d

ROOT = Path(__file__).resolve().parent.parent
TIMELINE = json.loads((ROOT / "src" / "timeline.json").read_text())
OUT_DIR = ROOT / "public" / "audio"
RAW_WAV = OUT_DIR / "score_raw.wav"
FINAL_WAV = OUT_DIR / "score.wav"
FFMPEG = shutil.which("ffmpeg") or str(Path.home() / ".local/bin/ffmpeg")

SR = 48_000
FPS = TIMELINE["fps"]
SPF = SR // FPS                          # 1600 samples per frame
N = TIMELINE["durationInFrames"] * SPF   # 2,880,000 samples = 60.000 s
BEAT = TIMELINE["framesPerBeat"]         # 15 frames = 0.5 s at 120 BPM
SIXTEENTH = BEAT / 4                     # 3.75 frames
BAR = BEAT * 4                           # 60 frames
TARGET_I, TARGET_TP, TARGET_LRA = -14.0, -1.5, 11.0

rng = np.random.default_rng(8004)  # fixed seed → identical file on every run

# Hard stops: true digital silence (frames, end-exclusive).
SILENCE = [(270, 300), (500, 510), (1650, 1658), (1795, 1800)]

A1, C2, E1, F1, G1 = 55.0, 65.41, 41.20, 43.65, 49.00
PENTA = [880.00, 1046.50, 1174.66, 1318.51, 1567.98, 1760.00]  # tick: A5 C6 D6 E6 G6 A6
PICKET = [220.00, 261.63, 329.63, 440.00]                       # picket: A3 C4 E4 A4


# ------------------------------------------------------------------ primitives

def smp(frame: float) -> int:
    return int(round(frame * SPF))


def db(v: float) -> float:
    return 10.0 ** (v / 20.0)


def tt(seconds: float) -> np.ndarray:
    return np.arange(int(round(seconds * SR))) / SR


def noise(n: int) -> np.ndarray:
    return rng.standard_normal(n)


def norm(x: np.ndarray) -> np.ndarray:
    peak = np.max(np.abs(x))
    return x / peak if peak > 0 else x


def filt(x: np.ndarray, kind: str, freq, order: int = 2) -> np.ndarray:
    sos = signal.butter(order, freq, btype=kind, fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)


def fade_in(x: np.ndarray, ms: float = 0.4) -> np.ndarray:
    """Click-free start that keeps the onset on sample 0."""
    n = min(len(x), max(1, int(SR * ms / 1000)))
    ramp = np.linspace(0.0, 1.0, n, endpoint=False)
    x[:n] *= ramp[:, None] if x.ndim == 2 else ramp
    return x


def fade_out(x: np.ndarray, ms: float = 3.0) -> np.ndarray:
    n = min(len(x), max(1, int(SR * ms / 1000)))
    ramp = np.linspace(1.0, 0.0, n)
    x[-n:] *= ramp[:, None] if x.ndim == 2 else ramp
    return x


def sine(freq, n: int, phase: float = 0.0) -> np.ndarray:
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    return np.sin(2 * np.pi * np.cumsum(f) / SR + phase)


def saw(freq, n: int, phase: float = 0.0) -> np.ndarray:
    """Band-limited (polyBLEP) sawtooth; freq may be a per-sample array."""
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    dt = f / SR
    p = (phase + np.cumsum(dt)) % 1.0
    y = 2.0 * p - 1.0
    m = p < dt
    u = p[m] / dt[m]
    y[m] -= u + u - u * u - 1.0
    m = p > 1.0 - dt
    u = (p[m] - 1.0) / dt[m]
    y[m] -= u * u + u + u + 1.0
    return y


def pan(x: np.ndarray, p: float | np.ndarray = 0.0) -> np.ndarray:
    """Mono → stereo, equal-power, unity per channel at centre. p may vary per sample."""
    a = (np.asarray(p) + 1.0) * np.pi / 4.0
    return np.stack([x * np.cos(a), x * np.sin(a)], axis=1) * np.sqrt(2.0)


def place(bus: np.ndarray, x: np.ndarray, start: int, gain: float = 1.0) -> None:
    if x.ndim == 1:
        x = pan(x)
    s0, e = max(start, 0), min(start + len(x), len(bus))
    if e > s0:
        bus[s0:e] += gain * x[s0 - start:e - start]


def spectral(x: np.ndarray, mask, nper: int = 1024) -> np.ndarray:
    """Time-varying filter by STFT masking: mask(f[F,1], t[1,T]) → gain, t in seconds from x[0]."""
    f, t, Z = signal.stft(x, fs=SR, nperseg=nper, noverlap=nper * 3 // 4)
    _, y = signal.istft(Z * mask(f[:, None], t[None, :]), fs=SR, nperseg=nper, noverlap=nper * 3 // 4)
    out = np.zeros_like(x)
    m = min(len(x), len(y))
    out[:m] = y[:m]
    return out


def band(fc, width_oct: float):
    return lambda f, t: np.exp(-0.5 * (np.log2(np.maximum(f, 20.0) / fc(t)) / width_oct) ** 2)


def lowpass_mask(fc, order: int = 2):
    return lambda f, t: 1.0 / np.sqrt(1.0 + (f / fc(t)) ** (2 * order))


def grid(a: float, b: float, step: float):
    return np.arange(a, b - 1e-9, step)


# ------------------------------------------------------------------ sound design (one per timeline sfx)

def sfx_slam() -> np.ndarray:
    """The hazard-stripe boom gate hitting its stop: metal clack, one bounce (the visual overshoot), low thud."""
    t = tt(0.95)
    n = len(t)
    parts = [(902, 1.0, 0.085), (1373, 0.8, 0.065), (2147, 0.6, 0.048), (3296, 0.42, 0.034), (4871, 0.22, 0.02)]
    clack = norm(sum(a * np.sin(2 * np.pi * f * t + rng.uniform(0, 2 * np.pi)) * np.exp(-t / tau) for f, a, tau in parts))
    bounce = np.zeros(n)
    bi = int(0.042 * SR)
    bounce[bi:] = clack[: n - bi]
    crack = norm(filt(noise(n), "highpass", 1800)) * np.exp(-t / 0.005)
    thud = np.sin(2 * np.pi * np.cumsum(58 + 45 * np.exp(-t / 0.025)) / SR) * np.exp(-t / 0.16)
    x = 0.55 * clack + 0.18 * bounce + 0.45 * crack + 0.95 * thud
    x = np.tanh(1.4 * x) / np.tanh(1.4)
    st = pan(x)
    st += 0.05 * np.stack([norm(filt(noise(n), "highpass", 2500)) for _ in (0, 1)], axis=1) * np.exp(-t / 0.012)[:, None]
    return fade_in(st, 0.3)


def sfx_hit() -> np.ndarray:
    t = tt(0.45)
    n = len(t)
    body = np.sin(2 * np.pi * np.cumsum(52 + 128 * np.exp(-t / 0.02)) / SR) * np.exp(-t / 0.1)
    snap = norm(filt(noise(n), "bandpass", [1500, 6500])) * np.exp(-t / 0.011)
    click = norm(filt(noise(n), "highpass", 5000)) * np.exp(-t / 0.0012)
    x = 0.95 * body + 0.5 * snap + 0.25 * click
    return fade_in(pan(np.tanh(1.6 * x)))


def sfx_boom() -> np.ndarray:
    t = tt(2.4)
    n = len(t)
    low = np.sin(2 * np.pi * np.cumsum(33 + 72 * np.exp(-t / 0.11)) / SR) * np.exp(-t / 0.5)
    sub = np.sin(2 * np.pi * 41.2 * t) * np.exp(-t / 0.9) * (1 - np.exp(-t / 0.01))
    crack = norm(filt(noise(n), "bandpass", [700, 5200])) * np.exp(-t / 0.018)
    tail = np.stack(
        [spectral(noise(n), lowpass_mask(lambda T: 250 + 2800 * np.exp(-T / 0.35), 2)) for _ in (0, 1)], axis=1
    )
    tail = norm(tail) * np.exp(-t / 0.42)[:, None]
    x = pan(0.9 * low + 0.35 * sub + 0.45 * crack) + 0.35 * tail
    return fade_in(np.tanh(1.3 * x))


def sfx_thud(soft: bool = False) -> np.ndarray:
    t = tt(0.55)
    n = len(t)
    sub = np.sin(2 * np.pi * np.cumsum(46 + 34 * np.exp(-t / 0.02)) / SR) * np.exp(-t / 0.12)
    knock = norm(filt(noise(n), "lowpass", 1100)) * np.exp(-t / 0.009)
    return fade_in(pan(np.tanh(1.2 * (0.9 * sub + 0.4 * knock))))


def sfx_type() -> np.ndarray:
    t = tt(0.03)
    fc = rng.uniform(2000, 4000)
    x = norm(filt(noise(len(t)), "bandpass", [fc * 0.7, fc * 1.4])) * np.exp(-t / 0.0022)
    x += 0.5 * np.sin(2 * np.pi * fc * 1.5 * t) * np.exp(-t / 0.0015)
    return fade_in(pan(norm(x) * db(rng.uniform(-2, 2)), rng.uniform(-0.25, 0.25)), 0.1)


def sfx_roll() -> np.ndarray:
    t = tt(0.025)
    x = np.sin(2 * np.pi * 5200 * t) * np.exp(-t / 0.0025)
    x += 0.3 * norm(filt(noise(len(t)), "highpass", 6000)) * np.exp(-t / 0.001)
    return fade_in(pan(norm(x)), 0.1)


def sfx_tick(note: int) -> np.ndarray:
    """Gate passed: rising pentatonic ping, panned left→right like the packet crossing the fence."""
    f = PENTA[note % len(PENTA)]
    t = tt(0.16)
    x = (np.sin(2 * np.pi * f * t) + 0.14 * np.sin(2 * np.pi * 3 * f * t) + 0.05 * np.sin(2 * np.pi * 5 * f * t)) * np.exp(-t / 0.026)
    x += 0.25 * norm(filt(noise(len(t)), "highpass", 4000)) * np.exp(-t / 0.001)
    return fade_in(pan(norm(x), -0.35 + 0.14 * (note % len(PENTA))))


def sfx_pop() -> np.ndarray:
    t = tt(0.09)
    f = 620 + 520 * (1 - np.exp(-t / 0.012))
    return fade_in(pan(norm(sine(f, len(t)) * np.exp(-t / 0.02))))


def sfx_blip() -> np.ndarray:
    t = tt(0.12)
    n = len(t)
    f = 360 + 280 * (1 - np.exp(-t / 0.02))
    x = (sine(f, n) + 0.2 * saw(f, n)) * np.exp(-t / 0.028)
    return fade_in(pan(norm(filt(x, "lowpass", 2800))))


def sfx_chime() -> np.ndarray:
    t = tt(1.0)

    def bell(f: float, t0: float) -> np.ndarray:
        u = np.maximum(t - t0, 0.0)
        partials = [(1.0, 1.0), (2.0, 0.32), (3.01, 0.14), (4.07, 0.07)]
        return (t >= t0) * sum(a * np.sin(2 * np.pi * f * r * u) * np.exp(-u / (0.28 / r ** 0.7)) for r, a in partials)

    return fade_in(pan(norm(bell(1318.51, 0.0) + 0.85 * bell(1760.0, 0.06))))


def sfx_coin() -> np.ndarray:
    t = tt(0.16)

    def ping(f: float, t0: float, tau: float) -> np.ndarray:
        u = np.maximum(t - t0, 0.0)
        return (t >= t0) * np.sin(2 * np.pi * f * u) * np.exp(-u / tau)

    x = ping(2637.0, 0.0, 0.03) + 0.9 * ping(3520.0, 0.024, 0.04) + 0.25 * ping(5274.0, 0.024, 0.02)
    return fade_in(pan(norm(x)))


def sfx_air(frames: float, lo: float, hi: float, end: float, peak_at: float, width: float, pan_from: float, pan_to: float) -> np.ndarray:
    """Whoosh family: band-passed noise with a swept centre, fast onset, stereo movement."""
    n = smp(frames)
    T = n / SR
    tp = peak_at * T

    def fc(tm):
        up = lo * (hi / lo) ** (np.minimum(tm, tp) / tp)
        down = hi * (end / hi) ** (np.maximum(tm - tp, 0.0) / (T - tp))
        return np.where(tm < tp, up, down)

    x = np.stack([spectral(noise(n), band(fc, width)) for _ in (0, 1)], axis=1)
    u = np.arange(n) / n
    env = np.where(u < peak_at, 0.25 + 0.75 * (u / peak_at) ** 1.5, np.cos(0.5 * np.pi * (u - peak_at) / (1 - peak_at)) ** 2)
    a = (pan_from + (pan_to - pan_from) * u + 1.0) * np.pi / 4.0
    x[:, 0] *= env * np.cos(a) * np.sqrt(2.0)
    x[:, 1] *= env * np.sin(a) * np.sqrt(2.0)
    return fade_out(fade_in(norm(x), 2.0), 2.0)


def sfx_whoosh(frames: float) -> np.ndarray:
    return sfx_air(frames, lo=650, hi=3400, end=1100, peak_at=0.32, width=0.75, pan_from=-0.6, pan_to=0.6)


def sfx_slide(frames: float) -> np.ndarray:
    # the key pill sliding right toward the AI cursor; ends exactly on the freeze frame
    return sfx_air(frames, lo=380, hi=1700, end=900, peak_at=0.62, width=0.9, pan_from=-0.5, pan_to=0.55)


def sfx_freeze() -> np.ndarray:
    """Tape machine winding down. This sound ENDS on its frame — silence follows."""
    n = int(0.15 * SR)
    u = np.arange(n) / n
    f = 220 * (1 - u) ** 1.8 + 8
    x = 0.6 * saw(f, n) + 0.4 * sine(f / 2, n)
    return fade_out(pan(norm(filt(x, "lowpass", 1600) * (1 - u) ** 0.6)), 1.5)


def sfx_drain(frames: float) -> np.ndarray:
    n = smp(frames)
    u = np.arange(n) / n
    f = 820 * (80 / 820) ** u
    x = filt(0.7 * sine(f, n) + 0.3 * saw(f, n), "lowpass", 1800)
    env = (0.55 + 0.45 * np.sin(np.pi * u)) * (1 - u) ** 0.35
    return fade_out(fade_in(pan(norm(x * env)), 2.0), 6.0)


def sfx_rewind(frames: float) -> np.ndarray:
    """Tape rewind: accelerating chirps rising in pitch, stops dead at its end."""
    n = smp(frames)
    T = n / SR
    u = np.arange(n) / n
    frac = (np.cumsum(14 + 30 * u) / SR) % 1.0
    f = 260 * (5200 / 260) ** u * (1 + 0.9 * frac)
    tone = filt(saw(f, n) * (0.35 + 0.65 * (1 - frac) ** 0.5), "bandpass", [300, 9000])
    hiss = spectral(noise(n), band(lambda tm: 500 * (6500 / 500) ** (tm / T), 0.8))
    x = (0.6 * norm(tone) + 0.5 * norm(hiss)) * (0.35 + 0.65 * u ** 1.3)
    return fade_out(fade_in(pan(norm(x)), 2.0), 2.0)


def sfx_glitch() -> np.ndarray:
    """3-frame bit-crushed stutter — the film's only glitch."""
    n = smp(3)
    seg = int(0.0125 * SR)
    x = np.zeros(n)
    for i, s in enumerate(range(0, n, seg)):
        if i % 3 == 2:
            continue  # gaps make it stutter
        m = min(n, s + seg) - s
        f = rng.choice([420.0, 840.0, 1260.0, 1680.0, 2520.0])
        chunk = 0.7 * np.sign(np.sin(2 * np.pi * f * np.arange(m) / SR)) + 0.5 * rng.standard_normal(m)
        chunk = np.repeat(chunk[::10], 10)[:m]          # sample-and-hold decimation
        x[s:s + m] = np.round(chunk * 3) / 3            # bit-crush
    x = norm(filt(x, "lowpass", 9000))
    st = pan(x)
    st[24:, 1] = st[:-24, 1].copy()                     # 0.5 ms channel skew, left keeps the onset
    st[:24, 1] = 0.0
    return fade_out(fade_in(st, 0.2), 2.0)


def sfx_card() -> np.ndarray:
    t = tt(0.08)
    x = 0.6 * norm(filt(noise(len(t)), "highpass", 4000)) * np.exp(-t / 0.0012)
    x += np.sin(2 * np.pi * 1900 * t) * np.exp(-t / 0.012) + 0.5 * np.sin(2 * np.pi * 2850 * t) * np.exp(-t / 0.008)
    return fade_in(pan(norm(x)))


def sfx_picket(note: int) -> np.ndarray:
    """Tuned wood/metal bar for the logo pickets rising left → right."""
    f = PICKET[note % len(PICKET)]
    t = tt(0.7)
    modes = [(1.0, 1.0, 0.30), (2.76, 0.45, 0.12), (3.9, 0.12, 0.15), (5.40, 0.22, 0.055), (8.93, 0.08, 0.025)]
    x = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / tau) for r, a, tau in modes)
    x += 0.35 * norm(filt(noise(len(t)), "bandpass", [1500, 7000])) * np.exp(-t / 0.0015)
    return fade_in(pan(norm(x), [-0.45, -0.15, 0.15, 0.45][note % 4]))


# level in dB (slam = 0 dB is the loudest thing in the film), reverb send in dB (None = dry)
SFX = {
    "slam": (0.0, -16), "boom": (-1.0, -6), "hit": (-3.0, None), "thud": (-4.0, None),
    "picket": (-7.0, -14), "glitch": (-9.0, None), "rewind": (-9.0, None), "freeze": (-8.0, None),
    "whoosh": (-10.0, -20), "chime": (-9.0, -8), "slide": (-11.0, None), "pop": (-12.0, None),
    "tick": (-12.0, -22), "card": (-12.0, None), "coin": (-12.0, -18), "drain": (-13.0, None),
    "blip": (-14.0, None), "type": (-18.0, None), "roll": (-21.0, None),
}
SWELL = {"whoosh", "slide", "drain", "rewind"}   # onset = first audible sample, not an energy spike


def render_event(e: dict) -> np.ndarray:
    s = e["sfx"]
    if s == "slam":
        return sfx_slam()
    if s == "boom":
        return sfx_boom()
    if s == "hit":
        return sfx_hit()
    if s == "thud":
        return sfx_thud(e.get("soft", False)) * (db(-8) if e.get("soft") else 1.0)
    if s == "type":
        return sfx_type()
    if s == "roll":
        return sfx_roll()
    if s == "tick":
        return sfx_tick(e.get("note", 0))
    if s == "pop":
        return sfx_pop()
    if s == "blip":
        return sfx_blip()
    if s == "chime":
        return sfx_chime()
    if s == "coin":
        return sfx_coin()
    if s == "whoosh":
        return sfx_whoosh(e.get("len", 12))
    if s == "slide":
        return sfx_slide(e.get("len", 30))
    if s == "freeze":
        return sfx_freeze()
    if s == "drain":
        return sfx_drain(e.get("len", 28))
    if s == "rewind":
        return sfx_rewind(e.get("len", 35))
    if s == "glitch":
        return sfx_glitch()
    if s == "card":
        return sfx_card()
    if s == "picket":
        return sfx_picket(e.get("note", 0))
    raise ValueError(f"unknown sfx {s!r}")


def expand_events(events: list[dict]) -> list[dict]:
    out = []
    for e in events:
        if "to" in e:
            for f in range(e["f"], e["to"] + 1, e.get("every", 1)):
                out.append({**{k: v for k, v in e.items() if k not in ("to", "every")}, "f": f})
        else:
            out.append(e)
    return sorted(out, key=lambda e: e["f"])


# ------------------------------------------------------------------ music instruments

def synth_kick() -> np.ndarray:
    t = tt(0.42)
    body = np.sin(2 * np.pi * np.cumsum(45 + 95 * np.exp(-t / 0.03)) / SR) * np.exp(-t / 0.11)  # 140 → 45 Hz
    click = norm(filt(noise(len(t)), "highpass", 3000)) * np.exp(-t / 0.0009)
    return fade_in(np.tanh(1.8 * (body + 0.18 * click)) / np.tanh(1.8), 0.3)


def synth_hat(tau: float, seconds: float) -> np.ndarray:
    t = tt(seconds)
    x = np.stack([filt(noise(len(t)), "highpass", 7200, 4) for _ in (0, 1)], axis=1) * np.exp(-t / tau)[:, None]
    return fade_in(norm(x), 0.2)


def synth_clap() -> np.ndarray:
    t = tt(0.3)
    n = len(t)
    x = np.zeros((n, 2))
    for k, off in enumerate((0.0, 0.009, 0.018)):
        i = int(off * SR)
        for c in (0, 1):
            x[i:, c] += filt(noise(n - i), "bandpass", [950, 2600]) * np.exp(-t[: n - i] / 0.0045) * (1.0 if k == 2 else 0.8)
    tail = np.stack([filt(noise(n), "bandpass", [900, 2800]) for _ in (0, 1)], axis=1) * np.exp(-t / 0.05)[:, None]
    i = int(0.018 * SR)
    x[i:] += 0.6 * tail[: n - i]
    return norm(x)


def bass_note(freq: float, seconds: float, cutoff: float, bright: float = 0.55) -> np.ndarray:
    n = int(seconds * SR)
    t = np.arange(n) / SR
    x = filt(bright * saw(freq, n) + (1 - bright) * 1.2 * np.sin(2 * np.pi * freq * t), "lowpass", cutoff)
    env = (1 - np.exp(-t / 0.002)) * (0.45 + 0.55 * np.exp(-t / 0.09))
    return fade_out(np.tanh(1.5 * x * env), 6.0)


def pad(freqs: list[float], n: int, detune_cents: float = 7.0, voices: int = 3) -> np.ndarray:
    x = np.zeros((n, 2))
    for fr in freqs:
        for v in range(voices):
            d = (v - (voices - 1) / 2) * detune_cents
            x += pan(saw(fr * 2 ** (d / 1200), n, rng.uniform()), -0.6 + 1.2 * v / (voices - 1))
    return norm(x)


def pluck(freq: float, seconds: float = 0.22) -> np.ndarray:
    n = int(seconds * SR)
    t = np.arange(n) / SR
    x = filt(saw(freq, n) + 0.6 * saw(freq * 1.004, n, 0.3), "lowpass", 2600)
    return x * np.exp(-t / 0.07) * (1 - np.exp(-t / 0.0015))


# ------------------------------------------------------------------ arrangement

def build_music() -> tuple[np.ndarray, np.ndarray, list[int]]:
    drums, bass, pads, fx, send = (np.zeros((N, 2)) for _ in range(5))
    kicks: list[int] = []
    KICK, HAT_C, HAT_O, CLAP = synth_kick(), synth_hat(0.011, 0.12), synth_hat(0.042, 0.35), synth_clap()

    def kick(f: float, g: float = 1.0) -> None:
        place(drums, KICK, smp(f), db(-2) * g)
        kicks.append(smp(f))

    def hat(sample: np.ndarray, f: float, g: float, width: float = 0.12) -> None:
        place(drums, sample * np.array([1 - width, 1 + width]), smp(f), g)

    def clap(f: float, g: float = 1.0) -> None:
        place(drums, CLAP, smp(f), db(-9) * g)
        place(send, CLAP, smp(f), db(-20) * g)

    def stab(f: float) -> None:
        n = int(0.14 * SR)
        s = filt(pad([220.0, 261.63, 329.63], n, 6.0), "lowpass", 1700) * np.exp(-np.arange(n) / SR / 0.05)[:, None]
        place(pads, fade_in(s, 1.0), smp(f), db(-22))
        place(send, s, smp(f), db(-24))

    def groove(a, b, roots, cutoff, claps_from=None, hats16=(1, 3), open_hats=True, stabs=True,
               bass_pos=(1, 2, 3), octave_pos=None, kick_gain=1.0, bass_gain=db(-7)):
        for f in grid(a, b, BEAT):
            beat_in_bar = int(round((f % BAR) / BEAT)) % 4
            kick(f, kick_gain)
            if open_hats:
                hat(HAT_O, f + BEAT / 2, db(-17))
            for k in hats16:
                if not (open_hats and k == 2):
                    hat(HAT_C, f + k * SIXTEENTH, db(-21) if k % 2 else db(-24))
            root = roots[(int(f // BAR) * 4 + beat_in_bar) % len(roots)]
            for k in bass_pos:
                fr = root * 2 if octave_pos == k else root
                place(bass, bass_note(fr, 0.105, cutoff), smp(f + k * SIXTEENTH), bass_gain)
            if claps_from is not None and f >= claps_from and beat_in_bar in (1, 3):
                clap(f)
            if stabs and beat_in_bar == 3:
                stab(f + BEAT / 2)

    def riser(a, b, chord=None, lo=400.0, hi=7000.0, pad_lo=250.0, pad_hi=3000.0, noise_gain=db(-10), pad_gain=db(-12)):
        n = smp(b) - smp(a)
        T = n / SR
        u = np.arange(n) / n
        nz = np.stack([spectral(noise(n), band(lambda tm: lo * (hi / lo) ** (tm / T), 0.6)) for _ in (0, 1)], axis=1)
        place(fx, fade_out(norm(nz) * (u ** 2)[:, None], 3.0), smp(a), noise_gain)
        if chord:
            p = pad(chord, n)
            p = np.stack([spectral(p[:, c], lowpass_mask(lambda tm: pad_lo * (pad_hi / pad_lo) ** (tm / T))) for c in (0, 1)], axis=1)
            place(pads, fade_out(norm(p) * (0.15 + 0.85 * u ** 1.5)[:, None], 3.0), smp(a), pad_gain)

    # 0–120 intro: low A-minor drone (fades out under the hook), sub hit under the first gate slam
    n = smp(180)
    drone = filt(pad([A1, 82.41, 110.0], n, 9.0), "lowpass", 300)
    env = np.ones(n)
    env[: smp(6)] = np.linspace(0, 1, smp(6))
    env[smp(120):] = np.cos(np.linspace(0, np.pi / 2, n - smp(120))) ** 2
    place(pads, drone * env[:, None], 0, db(-13))
    ts = tt(2.0)
    place(pads, np.sin(2 * np.pi * 36 * ts) * np.exp(-ts / 0.7) * (1 - np.exp(-ts / 0.004)), smp(16), db(-8))

    # 120–270 hook: a kick per word, bass from 180, offbeat hats from 225
    for f in grid(120, 270, BEAT):
        kick(f)
    for f in grid(180, 270, BEAT):
        place(bass, bass_note(A1, 0.2, 380), smp(f + BEAT / 2), db(-7))
    for f in grid(225, 270, BEAT):
        hat(HAT_O, f + BEAT / 2, db(-17))

    # 300–465 groove (the problem)
    groove(300, 465, [A1, A1, F1, G1], cutoff=450, claps_from=360, stabs=False)

    # 510–600 riser into the reveal
    riser(510, 600, chord=[110.0, 130.81, 164.81, 220.0])

    # 600–1080 groove (reveal + mechanism + first attack), fill 900–915, riser 1040–1080
    groove(600, 1080, [A1, A1, F1, G1, A1, A1, C2, G1], cutoff=480, claps_from=600)
    for i, f in enumerate(grid(900, 915, SIXTEENTH)):
        clap(f, db(-6 + 2 * i))
    riser(1040, 1080, lo=500.0, hi=6500.0, noise_gain=db(-11))

    # 1110–1260 heavy half-time (music drops at 1080, the slam at 1085 plays alone)
    for f in (1110, 1140, 1162.5, 1200):
        kick(f, db(1))
    for f in (1110, 1170, 1230):
        clap(f, db(2))
    for f in grid(1110, 1260, BEAT):
        hat(HAT_C, f, db(-24))
    for f, fr, dur in ((1110, A1, 30), (1140, F1, 30), (1170, G1, 30), (1200, A1, 30), (1230, E1, 30)):
        place(bass, bass_note(fr, dur / FPS, 260, bright=0.7), smp(f), db(-5))
    n = smp(1260) - smp(1110)
    dark = filt(pad([A1, 82.41], n, 10.0), "lowpass", 220)
    place(pads, fade_out(fade_in(dark, 20.0), 20.0), smp(1110), db(-15))

    # 1260–1410 drive: 16th hats, pumping bass with an octave on the last 16th
    groove(1260, 1410, [A1] * 4, cutoff=650, claps_from=1260, hats16=(0, 1, 2, 3), stabs=False, octave_pos=3, bass_gain=db(-6))

    # 1410–1530 bright: lighter groove + Am → C arpeggio lift
    groove(1410, 1530, [A1] * 4 + [C2] * 4, cutoff=500, hats16=(), stabs=False, bass_pos=(2,), kick_gain=db(-2))
    delay = smp(11.25)  # dotted-eighth ping-pong
    for f in grid(1410, 1530, SIXTEENTH):
        chord = [220.0, 261.63, 329.63, 440.0] if f < 1470 else [261.63, 329.63, 392.0, 523.25]
        i = int(round((f - 1410) / SIXTEENTH))
        p = pluck(chord[i % 4])
        place(pads, pan(p, -0.2 if i % 2 else 0.2), smp(f), db(-15))
        for k in range(1, 5):
            place(pads, pan(p, 0.7 if k % 2 else -0.7), smp(f) + k * delay, db(-15) * 0.4 ** k)

    # 1530–1650 groove, dead stop at 1650
    groove(1530, 1650, [A1, A1, F1, G1], cutoff=520, claps_from=1530)

    # 1658–1795 outro: A-minor add9 pad under the punchline booms, gone by 1795
    n = smp(1795) - smp(1658)
    out = filt(pad([110.0, 130.81, 164.81, 246.94], n, 8.0), "lowpass", 1500) + 0.35 * pan(sine(A1, n))
    env = np.ones(n)
    env[: int(0.04 * SR)] = np.linspace(0, 1, int(0.04 * SR))
    k0 = smp(1700) - smp(1658)
    env[k0:] = np.cos(np.linspace(0, np.pi / 2, n - k0)) ** 2
    out = norm(out) * env[:, None]
    place(pads, out, smp(1658), db(-11))
    place(send, out, smp(1658), db(-13))

    # sidechain: bass and pads pump against the kick
    imp = np.zeros(N)
    imp[[k for k in kicks if k < N]] = 1.0
    kern = np.exp(-np.arange(int(0.35 * SR)) / SR / 0.075)
    pump = 1.0 - 0.72 * np.clip(signal.fftconvolve(imp, kern)[:N], 0, 1)
    music = drums + bass * pump[:, None] + pads * (1 - 0.45 * (1 - pump))[:, None] + fx

    # hard edits: tape-stop into the freeze (ends on 270), tape-stop at 465, drop at 1080, dead stop at 1650
    tape_stop(music, smp(270) - int(0.15 * SR), 0.15)
    mute(music, smp(270), smp(300))
    tape_stop(music, smp(465), 0.2)
    mute(music, smp(465) + int(0.2 * SR), smp(510))
    mute(music, smp(1080), smp(1110), fade_ms=3.0)
    mute(music, smp(1650), smp(1658), fade_ms=3.0)
    return music, send, kicks


def tape_stop(bus: np.ndarray, s0: int, seconds: float) -> None:
    """Replace bus[s0:s0+n] with the same audio decelerating to a halt."""
    n = int(seconds * SR)
    u = np.arange(n) / n
    pos = s0 + np.cumsum((1 - u) ** 1.6)
    src = np.arange(s0, s0 + n + 2)
    for c in (0, 1):
        bus[s0:s0 + n, c] = np.interp(pos, src, bus[s0:s0 + n + 2, c]) * (1 - u) ** 0.5


def mute(bus: np.ndarray, a: int, b: int, fade_ms: float = 0.0) -> None:
    if fade_ms > 0:
        k = int(SR * fade_ms / 1000)
        bus[a - k:a] *= np.linspace(1, 0, k)[:, None]
    bus[a:b] = 0.0


def duck_curve(frames: list[float], depth_db: float, hold_s: float, release_s: float) -> np.ndarray:
    g = np.ones(N)
    atk, hold, rel = int(0.005 * SR), int(hold_s * SR), int(release_s * SR)
    shape = np.concatenate([np.linspace(1, db(depth_db), atk), np.full(hold, db(depth_db)), np.linspace(db(depth_db), 1, rel)])
    for f in frames:
        s = smp(f)
        e = min(N, s + len(shape))
        g[s:e] = np.minimum(g[s:e], shape[: e - s])
    return g


def make_ir(rt60: float = 1.4, seconds: float = 2.0, predelay_ms: float = 14.0) -> np.ndarray:
    t = tt(seconds)
    ir = rng.standard_normal((len(t), 2)) * np.exp(-6.9078 * t / rt60)[:, None]
    ir = filt(filt(ir, "lowpass", 5500), "highpass", 180)
    ir = np.concatenate([np.zeros((int(SR * predelay_ms / 1000), 2)), ir])
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


def limiter(x: np.ndarray, thr: float, look_ms: float = 1.5, release_ms: float = 90.0) -> np.ndarray:
    """Look-ahead peak limiter (offline): reduce L samples early, release exponentially."""
    need = np.minimum(1.0, thr / np.maximum(np.max(np.abs(x), axis=1), 1e-9))
    L = max(1, int(SR * look_ms / 1000))
    gr = (1.0 - minimum_filter1d(need, size=2 * L + 1)).tolist()
    k = float(np.exp(-1.0 / (SR * release_ms / 1000)))
    out = [0.0] * len(gr)
    y = 0.0
    for i, v in enumerate(gr):
        y = v if v > y else y * k
        out[i] = y
    return x * (1.0 - np.asarray(out))[:, None]


# ------------------------------------------------------------------ measurement + io

def write_wav(path: Path, x: np.ndarray) -> None:
    wavfile.write(path, SR, np.round(np.clip(x, -1, 1) * 32767).astype(np.int16))


def ebur128(path: Path) -> tuple[float, float, float]:
    p = subprocess.run([FFMPEG, "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True)
    s = p.stderr.split("Summary:")[-1]
    i = float(re.search(r"I:\s*(-?[\d.]+) LUFS", s).group(1))
    lra = float(re.search(r"LRA:\s*(-?[\d.]+) LU", s).group(1))
    tp = float(re.search(r"Peak:\s*(-?[\d.]+) dBFS", s).group(1))
    return i, tp, lra


def loudnorm_json(stderr: str) -> dict:
    return json.loads(re.findall(r"\{[^{}]*\}", stderr, re.S)[-1])


def onset_ms(x: np.ndarray, kind: str) -> float:
    a = np.max(np.abs(x), axis=1)
    if kind == "swell":
        return float(np.argmax(a >= np.max(a) * db(-50))) / SR * 1000
    w = a[: int(0.025 * SR)]
    return float(np.argmax(w >= 0.5 * np.max(w))) / SR * 1000


def main() -> None:
    t0 = time.time()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    music, send, _ = build_music()

    sfx = np.zeros((N, 2))
    report = []
    for e in expand_events(TIMELINE["events"]):
        x = render_event(e)
        level, send_db = SFX[e["sfx"]]
        start = smp(e["f"]) - len(x) if e["sfx"] == "freeze" else smp(e["f"])
        place(sfx, x, start, db(level))
        if send_db is not None:
            place(send, x, start, db(level + send_db))
        if e["sfx"] == "freeze":
            last = int(np.nonzero(np.max(np.abs(x), axis=1) > 1e-9)[0][-1])
            report.append((e["f"], "freeze(end)", (start + last + 1 - smp(e["f"])) / SR * 1000))
        else:
            report.append((e["f"], e["sfx"], onset_ms(x, "swell" if e["sfx"] in SWELL else "hit")))

    # music sits ~6 dB under the SFX peaks and gets out of the way of the impacts: the master is
    # peak-limited for -14 LUFS / -1.5 dBTP, so slams read as the biggest thing by ducking, not by peak
    impacts = [e["f"] for e in TIMELINE["events"] if e["sfx"] in ("slam", "boom")]
    accents = [e["f"] for e in TIMELINE["events"] if e["sfx"] in ("hit", "thud")]
    music *= (db(-6) * np.max(np.abs(sfx)) / np.max(np.abs(music)))
    music *= (duck_curve(impacts, -8.0, 0.12, 0.35) * duck_curve(accents, -3.0, 0.04, 0.12))[:, None]

    ir = make_ir()
    wet = np.stack([signal.fftconvolve(send[:, c], ir[:, c])[:N] for c in (0, 1)], axis=1)
    mix = music + sfx + db(-10) * wet

    # master: a little air, soft clip, then a limiter until peak-to-loudness fits -14 LUFS / -1.5 dBTP linearly
    mix = mix + (db(1.5) - 1.0) * filt(mix, "highpass", 8500)
    mix = np.tanh(1.25 * norm(mix)) / np.tanh(1.25)
    for a, b in SILENCE:
        mute(mix, smp(a), smp(b), fade_ms=0.0 if a in (270, 500) else 3.0)

    with tempfile.TemporaryDirectory() as td:
        probe = Path(td) / "probe.wav"
        for it in range(8):
            mix = norm(mix) * db(-1.0)
            write_wav(probe, mix)
            i_raw, tp_raw, lra_raw = ebur128(probe)
            plr = tp_raw - i_raw
            print(f"  master pass {it}: I {i_raw:.1f} LUFS, TP {tp_raw:.1f} dBTP, PLR {plr:.1f} dB, LRA {lra_raw:.1f} LU")
            if plr <= 12.0:
                break
            mix = limiter(mix, np.max(np.abs(mix)) * db(-(plr - 11.6)))

        for a, b in SILENCE:
            mix[smp(a):smp(b)] = 0.0
        mix = norm(mix) * db(-1.0)
        write_wav(RAW_WAV, mix)

        # ffmpeg two-pass loudnorm (linear) → -14 LUFS, TP -1.5
        base = f"loudnorm=I={TARGET_I}:TP={TARGET_TP}:LRA={TARGET_LRA}"
        p1 = subprocess.run([FFMPEG, "-hide_banner", "-nostats", "-i", str(RAW_WAV), "-af", base + ":print_format=json", "-f", "null", "-"],
                            capture_output=True, text=True, check=True)
        m = loudnorm_json(p1.stderr)
        lra = max(TARGET_LRA, float(m["input_lra"]) + 0.5)  # keep linear mode even if the film's range is wider
        second = (f"loudnorm=I={TARGET_I}:TP={TARGET_TP}:LRA={lra}:measured_I={m['input_i']}:measured_TP={m['input_tp']}"
                  f":measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}"
                  ":linear=true:print_format=json")
        tmp = Path(td) / "norm.wav"
        p2 = subprocess.run([FFMPEG, "-y", "-hide_banner", "-nostats", "-i", str(RAW_WAV), "-af", second,
                             "-ar", str(SR), "-ac", "2", "-c:a", "pcm_s16le", str(tmp)], capture_output=True, text=True, check=True)
        mode = loudnorm_json(p2.stderr).get("normalization_type", "?")

        sr2, y = wavfile.read(tmp)
        y = y.astype(np.float64) / 32767.0
        # keep sample alignment with the raw mix (resampling must not shift the transients)
        ref = mix[: 10 * SR].mean(axis=1)
        got = y[: 10 * SR].mean(axis=1)
        xc = signal.correlate(got, ref, mode="full", method="fft")
        lag = int(np.argmax(xc[len(ref) - 1 - 200:len(ref) - 1 + 201])) - 200
        if lag > 0:
            y = y[lag:]
        elif lag < 0:
            y = np.concatenate([np.zeros((-lag, 2)), y])
        y = np.concatenate([y, np.zeros((max(0, N - len(y)), 2))])[:N]
        for a, b in SILENCE:
            y[smp(a):smp(b)] = 0.0
        write_wav(FINAL_WAV, y)

    i_fin, tp_fin, lra_fin = ebur128(FINAL_WAV)
    worst = max(report, key=lambda r: abs(r[2]))
    print(f"wrote {RAW_WAV.relative_to(ROOT)} and {FINAL_WAV.relative_to(ROOT)} in {time.time() - t0:.1f}s")
    print(f"  loudnorm mode: {mode}, resample lag corrected: {lag} samples")
    print(f"  final: I {i_fin:.1f} LUFS, TP {tp_fin:.1f} dBTP, LRA {lra_fin:.1f} LU")
    print(f"  events: {len(report)}, worst onset offset {abs(worst[2]):.2f} ms ({worst[1]} @ frame {worst[0]})")
    fz = [r for r in report if r[1] == "freeze(end)"]
    if fz:
        print(f"  freeze ends {fz[0][2]:+.2f} ms from frame {fz[0][0]} (silence follows)")
    for a, b in SILENCE:
        seg = y[smp(a):smp(b)]
        rms = np.sqrt(np.mean(seg ** 2)) if seg.size else 0.0
        print(f"  silence {a}-{b}: {20 * np.log10(rms) if rms > 0 else float('-inf'):.1f} dBFS RMS")
    if abs(worst[2]) > 3.0:
        sys.exit("onset alignment check failed")

    if "--plot" in sys.argv:  # optional: --plot out/score.png (waveform + spectrogram)
        i = sys.argv.index("--plot")
        plot(y, report, Path(sys.argv[i + 1]) if i + 1 < len(sys.argv) else ROOT / "out" / "score.png")


def plot(y: np.ndarray, report: list, path: Path) -> None:
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return
    mono = y.mean(axis=1)
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(22, 8), sharex=True, gridspec_kw={"height_ratios": [1, 2]})
    tsec = np.arange(N) / SR
    a1.plot(tsec[::40], mono[::40], lw=0.4, color="#f0b90b")
    for f, name, _ in report:
        if name in ("slam", "boom"):
            a1.axvline(f / FPS, color="#ff2d48", lw=0.6)
    a1.set_ylim(-1, 1)
    a1.set_title("PAGAR score — waveform (red: slam/boom cues)")
    a2.specgram(mono, NFFT=2048, Fs=SR, noverlap=1024, cmap="magma", vmin=-140)
    a2.set_ylim(20, 16000)
    a2.set_yscale("symlog", linthresh=200)
    for a, b in SILENCE:
        a2.axvspan(a / FPS, b / FPS, color="cyan", alpha=0.15)
    a2.set_xlabel("seconds")
    fig.tight_layout()
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=70)
    print(f"  plot: {path}")


if __name__ == "__main__":
    main()

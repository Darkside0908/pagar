#!/usr/bin/env python3
"""Audio for the live-demo segment of the Submission cut (title card + screen recording).
Reuses the film's instruments from score.py so both halves sound like one piece: a quiet 120 BPM
pulse under the recording, UI clicks on the presenter's actions, and the film's gate slam on the
exact frames where each blocked row lands (detected from the recording's pixels, src/demo-marks.json).
Run from video/:  python3 scripts/demo_score.py   → public/audio/demo.wav (-16 LUFS)
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import score as S  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
D = json.loads((ROOT / "src" / "demo-marks.json").read_text())
FPS = 30
TITLE_S = D["titleFrames"] / FPS
N = int((D["titleFrames"] + D["recFrames"]) * S.SR / FPS)
m, rows = D["marks"], D["rows"]


def at(rec_seconds: float) -> int:
    """Sample index of a moment in the recording (the recording starts after the title card)."""
    return int(round((TITLE_S + rec_seconds) * S.SR))


music = np.zeros((N, 2))
sfx = np.zeros((N, 2))

# quiet pulse: kick on the beat, offbeat hats, a low A-minor pad under everything
beat = S.SR // 2
kick, hat = S.synth_kick(), S.synth_hat(0.035, 0.08)
for i, s0 in enumerate(range(at(0), N - beat, beat)):
    S.place(music, kick, s0, 0.32)
    S.place(music, hat, s0 + beat // 2, 0.10)
pad = S.pad([110.0, 130.81, 164.81, 246.94], N) * 0.12
fade = np.minimum(1, np.arange(N) / (S.SR * 2.0))[:, None] * np.minimum(1, (N - np.arange(N)) / (S.SR * 0.6))[:, None]
music += S.filt(pad, "lowpass", 900) * fade

# title card + presenter actions
S.place(sfx, S.sfx_hit(), 0, 0.9)
for k in range(len("c05e460c980b54f6")):
    S.place(sfx, S.sfx_type(), at(m["key"] + 0.12 + k * 0.07), 0.45)
for key in ("unlocked", "swap_click", "moon_click", "approve_click"):
    S.place(sfx, S.sfx_pop(), at(m[key]), 0.6)

# outcomes, synced to what lands on screen
S.place(sfx, S.sfx_chime(), at(rows["swap"]), 0.7)
S.place(sfx, S.sfx_coin(), at(rows["swap"] + 0.35), 0.6)
for key in ("moon", "approve"):
    S.place(sfx, S.sfx_slam(), at(rows[key]), 1.0)
    S.place(sfx, S.sfx_thud(), at(rows[key] + 0.25), 0.6)
for k in range(8):
    S.place(sfx, S.sfx_roll(), at(m["final"] + k * 0.066), 0.5)

# duck the bed under the slams, then mix and normalise
duck = np.ones(N)
for key in ("moon", "approve"):
    s0 = at(rows[key])
    duck[s0 : s0 + S.SR // 2] = np.linspace(0.35, 1.0, S.SR // 2)
mix = music * duck[:, None] + sfx
mix = mix / max(1e-9, np.abs(mix).max()) * 10 ** (-1 / 20)

raw = ROOT / "public" / "audio" / "demo_raw.wav"
out = ROOT / "public" / "audio" / "demo.wav"
S.write_wav(raw, mix)
subprocess.run([S.FFMPEG, "-y", "-loglevel", "error", "-i", str(raw), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", str(out)], check=True)
print(f"wrote {out} ({N / S.SR:.3f} s)")

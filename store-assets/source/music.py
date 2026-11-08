"""Original music bed for the showcase video, synthesized from code (nothing
sampled or downloaded): warm pads, a plucked arpeggio, bass and soft drums in
D major at 104 BPM, with a gentle intro and outro.

Usage: python3 music.py [seconds] [output.wav]   (defaults: 46, tmp/music.wav)
"""
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100
BPM = 104
BEAT = 60 / BPM
BAR = 4 * BEAT
rng = np.random.default_rng(7)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


# I - vi - IV - V with colour tones: Dmaj9, Bm7, Gmaj7, A6
CHORDS = [
    [50, 57, 61, 64, 66],  # D3 A3 C#4 E4 F#4
    [47, 54, 57, 62, 66],  # B2 F#3 A3 D4 F#4
    [43, 50, 54, 59, 62],  # G2 D3 F#3 B3 D4
    [45, 52, 57, 61, 66],  # A2 E3 A3 C#4 F#4
]
ARP = [
    [62, 66, 69, 73, 76, 73, 69, 66],
    [59, 62, 66, 69, 74, 69, 66, 62],
    [55, 59, 62, 66, 71, 66, 62, 59],
    [57, 61, 64, 69, 73, 69, 64, 61],
]


def env(n, attack, release, sustain_level=1.0):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    r = np.clip((n / SR - t) / max(release, 1e-4), 0, 1)
    return a * r * sustain_level


def tone(freq, seconds, harmonics, detune=0.0, phase=0.0):
    t = np.arange(int(seconds * SR)) / SR
    out = np.zeros_like(t)
    for k, amp in harmonics:
        out += amp * np.sin(2 * np.pi * freq * k * (1 + detune) * t + phase * k)
    return out


def add(track, start, signal):
    i = int(start * SR)
    end = min(len(track), i + len(signal))
    if end > i:
        track[i:end] += signal[: end - i]


def main():
    seconds = float(sys.argv[1]) if len(sys.argv) > 1 else 46.0
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).with_name('tmp') / 'music.wav'
    n = int(seconds * SR) + SR
    pad_l, pad_r = np.zeros(n), np.zeros(n)
    pluck_l, pluck_r = np.zeros(n), np.zeros(n)
    bass, kick, hat = np.zeros(n), np.zeros(n), np.zeros(n)
    pad_h = [(1, 1.0), (2, 0.42), (3, 0.22), (4, 0.12), (5, 0.07), (6, 0.04)]

    bars = int(np.ceil(seconds / BAR)) + 1
    drums_from = 2 * BAR  # drums enter after two bars
    drums_until = seconds - 2 * BAR  # and leave for the last two
    for b in range(bars):
        start = b * BAR
        chord = CHORDS[b % 4]
        # Pads: slow attack, overlapping release, slightly detuned left/right.
        length = BAR + 1.2
        for note in chord:
            f = midi(note + 12 if note < 52 else note)
            e = env(int(length * SR), 0.6, 1.2) * 0.055
            add(pad_l, start, tone(f, length, pad_h, detune=-0.0016) * e)
            add(pad_r, start, tone(f, length, pad_h, detune=0.0016, phase=0.7) * e)
        # Arpeggio: eighth notes, plucked envelope, alternating pan.
        for i, note in enumerate(ARP[b % 4]):
            t0 = start + i * BEAT / 2
            if t0 > seconds:
                break
            f = midi(note + 12)
            dur = 0.9
            tt = np.arange(int(dur * SR)) / SR
            e = np.exp(-tt * 6.5) * np.clip(tt / 0.004, 0, 1)
            sig = (np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(2 * np.pi * 2 * f * tt) + 0.12 * np.sin(2 * np.pi * 3 * f * tt)) * e * 0.06
            lr = 0.35 if i % 2 else 0.65
            add(pluck_l, t0, sig * (1 - lr) * 1.6)
            add(pluck_r, t0, sig * lr * 1.6)
        # Bass on beats 1 and 3 (from bar 2).
        if b >= 1:
            root = midi(chord[0] - 12 if chord[0] >= 47 else chord[0])
            for beat in (0, 2):
                t0 = start + beat * BEAT
                dur = BEAT * 1.9
                tt = np.arange(int(dur * SR)) / SR
                e = np.clip(tt / 0.01, 0, 1) * np.exp(-tt * 1.6)
                sig = np.tanh(1.6 * (np.sin(2 * np.pi * root * tt) + 0.25 * np.sin(2 * np.pi * 2 * root * tt))) * e * 0.12
                add(bass, t0, sig)
        # Soft drums.
        for beat in range(4):
            t0 = start + beat * BEAT
            if drums_from <= t0 < drums_until:
                tt = np.arange(int(0.35 * SR)) / SR
                f = 45 + 75 * np.exp(-tt * 28)
                ph = 2 * np.pi * np.cumsum(f) / SR
                add(kick, t0, np.sin(ph) * np.exp(-tt * 9) * 0.38)
                th = t0 + BEAT / 2
                hn = rng.standard_normal(int(0.06 * SR))
                hn = np.diff(hn, prepend=0)  # brighter
                add(hat, th, hn * np.exp(-np.arange(len(hn)) / SR * 70) * 0.035)

    # Kick-driven ducking on pads and bass (gentle "pump").
    duck = np.ones(n)
    for b in range(bars):
        for beat in range(4):
            t0 = b * BAR + beat * BEAT
            if drums_from <= t0 < drums_until:
                i = int(t0 * SR)
                m = int(0.28 * SR)
                curve = 1 - 0.32 * np.exp(-np.arange(m) / SR * 12)
                end = min(n, i + m)
                duck[i:end] = np.minimum(duck[i:end], curve[: end - i])

    # Simple room: a few delayed, softened taps.
    def room(x):
        y = x.copy()
        for ms, g in ((23, 0.32), (41, 0.24), (67, 0.18), (97, 0.12), (131, 0.08)):
            d = int(SR * ms / 1000)
            y[d:] += x[:-d] * g
        return y

    # Dotted-eighth echo on the arpeggio.
    def echo(x, other):
        d = int(SR * BEAT * 0.75)
        y = x.copy()
        y[d:] += other[:-d] * 0.28
        y[2 * d :] += x[: -2 * d] * 0.12
        return y

    left = room(pad_l * duck) + echo(pluck_l, pluck_r) + bass * duck + kick + hat * 0.8
    right = room(pad_r * duck) + echo(pluck_r, pluck_l) + bass * duck + kick + hat * 1.2

    # Fades, trim, level.
    total = int(seconds * SR)
    left, right = left[:total], right[:total]
    fade_in = np.clip(np.arange(total) / (SR * 1.5), 0, 1)
    fade_out = np.clip((total - np.arange(total)) / (SR * 3.0), 0, 1)
    left *= fade_in * fade_out
    right *= fade_in * fade_out
    stereo = np.stack([left, right], axis=1)
    rms = np.sqrt(np.mean(stereo**2))
    stereo *= 10 ** (-17 / 20) / max(rms, 1e-9)
    stereo = np.tanh(stereo * 1.1) / np.tanh(1.1)
    stereo *= 10 ** (-1 / 20) / max(np.max(np.abs(stereo)), 1e-9) if np.max(np.abs(stereo)) > 10 ** (-1 / 20) else 1

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out_path), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(stereo, -1, 1) * 32767).astype('<i2').tobytes())
    print(f'wrote {out_path} ({seconds:.1f} s)')


if __name__ == '__main__':
    main()

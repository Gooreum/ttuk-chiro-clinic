# 배경음 빌드: song.py 악보 -> 칩튠 합성(밴드리밋 펄스·삼각, 노이즈 드럼) -> 에코·리버브 -> -15 LUFS(예전 bgm.m4a와 같은 크기, 재생 gain 그대로) -> 자동 검사 -> m4a
# 오디오 생성 모델·샘플 음원 없이 파형을 직접 계산한다(합성 방식은 2026-11 조달청 AI 게임 배경음 v4와 같다).
# 실행: <venv>/bin/python -I scripts/audio/bgm.py [--out public/audio/bgm.m4a] [--wav 미리듣기.wav]
#   venv: python3 -m venv .venv && .venv/bin/pip install numpy scipy pedalboard pyloudnorm  (ffmpeg 필요)
# 검사(실패하면 exit 1): 길이 100~150초, 클리핑 0, 클릭 ≤1, 루프 이음매 점프 ≤ 곡 안 샘플 차이 99퍼센타일, 피크 ≤ 0.92
import argparse, os, random, subprocess, sys, tempfile
import numpy as np
import pyloudnorm
from pedalboard import Pedalboard, Reverb, HighpassFilter, Delay
from pedalboard.io import AudioFile
from scipy.signal import butter, sosfiltfilt

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from song import BPM, SECTIONS

SR = 48000
NOTE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
QUAL = {"": [0, 4, 7], "m": [0, 3, 7], "7": [0, 4, 7, 10], "maj7": [0, 4, 7, 11], "m7": [0, 3, 7, 10]}


# ---- 악보 읽기 ----
def midi(name):
    v = NOTE[name[0]]; i = 1
    while name[i] in "#b": v += 1 if name[i] == "#" else -1; i += 1
    return v + 12 * (int(name[i:]) + 1)


def parse_lead(txt):
    out, t = [], 0.0
    for bi, bar in enumerate(txt.replace("\n", " ").split("|")):
        tok = bar.split(); s = t
        for i in range(0, len(tok), 2):
            p, d = tok[i], float(tok[i + 1])
            if p != "r": out.append((t, d, midi(p)))
            t += d
        assert abs(t - s - 4) < 1e-6, f"{bi + 1}마디가 {t - s}박"
    return out


def parse_chords(txt):
    seq = []
    for bi, bar in enumerate(txt.split("|")):
        cs = bar.split(); d = 4 / len(cs)
        for j, c in enumerate(cs):
            k = 2 if len(c) > 1 and c[1] in "#b" else 1
            root = (NOTE[c[0]] + (1 if c[1:k] == "#" else -1 if c[1:k] == "b" else 0)) % 12
            seq.append(dict(t=bi * 4 + j * d, d=d, root=root, ivs=QUAL[c[k:]]))
    return seq


def chord_at(seq, t):
    return next(c for c in seq if c["t"] <= t + 1e-6 < c["t"] + c["d"])


# ---- 구간 -> 성부별 음표 (박, 길이, midi, 세기) ----
def arrange(sec, rng):
    lead = parse_lead(sec["lead"]); ch = parse_chords(sec["chords"]); bars = len(sec["chords"].split("|"))
    tr = {k: [] for k in ("lead", "double", "counter", "bass", "comp")}
    pcs = lambda c: [(c["root"] + i) % 12 for i in c["ivs"]]
    near = lambda pc, lo: lo + (pc - lo) % 12            # lo 이상 가장 가까운 그 음
    for (t, d, p) in lead:
        if "turns" in sec["extra"] and d >= 2:          # 긴 음 끝 1박을 '위 반음 반박 + 제자리 반박' 꾸밈으로
            tr["lead"] += [(t, d - 1, p, 92), (t + d - 1, .5, p + 2, 80), (t + d - .5, .5, p, 84)]
        else:
            tr["lead"].append((t, d, p, 92 if (t % 1) == 0 else 84))
    if "double" in sec["extra"]:                          # 두 마디마다 한 옥타브 아래 채널이 이어받는다
        tr["double"] = [(t, d, p - 12, v) for (t, d, p, v) in tr["lead"] if int(t // 8) % 2 == 1]
        tr["lead"] = [n for n in tr["lead"] if int(n[0] // 8) % 2 == 0]
    if "third" in sec["extra"]:                           # 같은 리듬으로 3~9반음 아래 코드 음
        for (t, d, p, v) in tr["lead"]:
            c = pcs(chord_at(ch, t)); cand = [p - k for k in range(3, 10) if (p - k) % 12 in c]
            if cand: tr["double"].append((t, d, cand[0], v - 26))
    if "counter" in sec["extra"]:                         # 코드마다 3음을 길게(G4~F5)
        for c in ch:
            tr["counter"].append((c["t"], c["d"], near((c["root"] + c["ivs"][1]) % 12, 67), 60))
    for c in ch:
        r = near(c["root"], 36); fifth = r + 7; t0, d = c["t"], c["d"]
        if sec["bass"] == "whole":
            tr["bass"].append((t0, d, r, 80))
        elif sec["bass"] == "oompah":
            for k in range(int(d)):
                tr["bass"].append((t0 + k, .45, r if k % 2 == 0 else fifth, 92 if k % 2 == 0 else 78))
        else:  # walk: 근음 -> 3음 -> 5음 -> 다음 코드로 반음 접근
            nxt = next((x for x in ch if x["t"] >= t0 + d - 1e-6), ch[0])
            nr = near(nxt["root"], 36)
            steps = [r, r + c["ivs"][1], fifth, nr + (1 if nr < fifth else -1)]
            for k in range(int(d)):
                tr["bass"].append((t0 + k, .9, steps[k if d == 4 else (0 if k == 0 else 3)], 88))
        voic = sorted(near(pc, 60) for pc in pcs(c))[:3]
        if sec["comp"] == "offbeat":
            for k in range(int(d)):
                for p in voic: tr["comp"].append((t0 + k + .5, .22, p, 62))
        elif sec["comp"] == "arp":
            seq = voic + [voic[0] + 12]
            for k in range(int(d * 2)):
                tr["comp"].append((t0 + k * .5, .45, seq[k % 4], 54))
    # 사람 연주 흔들림: 박 ±6ms, 세기 ±6
    for k, notes in tr.items():
        tr[k] = [(t + rng.uniform(-.01, .01) * BPM / 60, d, p, v + rng.randint(-6, 6)) for (t, d, p, v) in notes]
    return tr, bars


def drums(style, bars):
    ev = []
    for b in range(bars):
        o = b * 4
        if style == "hats":
            ev += [(o + i + .5, "hat", .45) for i in range(4)]; continue
        if style == "half":
            ev += [(o, "kick", 1.0), (o + 2, "snare", .8)] + [(o + i, "hat", .5) for i in range(4)]
        else:
            ev += [(o, "kick", 1.0), (o + 2, "kick", .8), (o + 1, "snare", .6 if style == "light" else .85),
                   (o + 3, "snare", .6 if style == "light" else .85)]
            ev += [(o + i * .5, "hat", .7 if i % 2 else .45) for i in range(8)]
        if b == bars - 1 and style != "light": ev += [(o + 3.5, "snare", .55), (o + 3.75, "snare", .5)]
    return ev


# ---- 합성 ----
def m2f(p): return 440.0 * 2 ** ((p - 69) / 12)


def adsr(n, a, d, s, rel):
    na, nd, nr = max(1, int(a * SR)), max(1, int(d * SR)), max(1, int(rel * SR))
    e = np.full(n + nr, s, np.float64)
    k = min(na, n); e[:k] = np.linspace(0, 1, na, endpoint=False)[:k] ** 1.5
    if n > na:
        k2 = min(nd, n - na); e[na:na + k2] = 1 - (1 - s) * (1 - np.exp(-np.arange(k2) / (nd / 3)))
    e[n:] = (e[n - 1] if n else 0) * np.exp(-np.arange(nr) / (nr / 5))
    return e


def phase(f0, n, vib=0.0):
    t = np.arange(n) / SR
    f = f0 * 2 ** (vib / 1200 * np.clip((t - .2) / .3, 0, 1) * np.sin(2 * np.pi * 5.5 * t)) if vib else np.full(n, f0)
    return np.cumsum(f) / SR


def additive(ph, f0, coef, soft, fmax=11000):
    """밴드리밋: 배음을 직접 더해 앨리어싱이 없다. soft로 고역을 둥글게 깎는다."""
    out = np.zeros(len(ph))
    for k in range(1, max(1, int(fmax / (f0 * 1.02))) + 1):
        c = coef(k)
        if c: out += c / (1 + (k * f0 / soft) ** 2) * np.cos(2 * np.pi * k * ph)
    return out


pulse = lambda duty: (lambda k: 2 / (k * np.pi) * np.sin(k * np.pi * duty))
tri = lambda k: 0 if k % 2 == 0 else 8 / np.pi ** 2 / k ** 2 * (1 if (k // 2) % 2 == 0 else -1)

VOICE = {   # 파형, 엔벨로프(a, d, s, rel), 비브라토, 음량, 팬
    "lead": (pulse(.25), (.004, .3, .7, .08), 14, .50, 70),
    "double": (pulse(.125), (.004, .25, .6, .08), 8, .36, 54),
    "counter": (tri, (.06, .5, .8, .2), 6, .32, 40),
    "bass": (tri, (.005, .15, .85, .05), 0, 1.0, 64),
    "comp": (pulse(.5), (.003, .08, .45, .04), 0, .17, 88),
}
SOFT = 4200


def note(role, p, dur, vel):
    coef, env, vib, _, _ = VOICE[role]
    e = adsr(int(dur * SR), *env); f0 = m2f(p)
    y = additive(phase(f0, len(e), vib), f0, coef, SOFT * (1.5 if coef is tri else 1))
    if coef is tri:                                       # 4비트 계단 느낌을 20%만
        y = .8 * y + .2 * np.round(y * 7.5) / 7.5
    return y * e * (vel / 100)


def drum(kind, rng):
    if kind == "kick":
        n = int(.12 * SR); t = np.arange(n) / SR
        ph = np.cumsum(45 + 110 * np.exp(-t / .025)) / SR
        return 2 / np.pi * np.arcsin(np.sin(2 * np.pi * ph)) * np.exp(-t / .05) * np.minimum(1, t / .002) * .9
    hold, ln, tau, g = {"snare": (4, .14, .045, .42), "hat": (2, .035, .012, .16)}[kind]
    n = int(ln * SR); t = np.arange(n) / SR
    y = np.repeat(rng.choice([-1.0, 1.0], n // hold + 1), hold)[:n] * np.exp(-t / tau) * np.minimum(1, t / .003)
    if kind == "snare": y = .75 * y + .35 * np.sin(2 * np.pi * 190 * t) * np.exp(-t / .03)
    return y * g


def place(buf, y, s, pan):
    if s >= len(buf): return
    s = max(0, s); y = y[:len(buf) - s]; th = (.5 + (pan / 127 - .5) * .5) * np.pi / 2
    buf[s:s + len(y), 0] += y * np.cos(th); buf[s:s + len(y), 1] += y * np.sin(th)


def lowpass(y, fc): return sosfiltfilt(butter(4, fc, fs=SR, output="sos"), y, axis=0)


def render(cycles=3):
    rng = random.Random(20261021); nrng = np.random.default_rng(20261021); spb = 60 / BPM
    parts, at = [], 0
    for sec in SECTIONS:
        tr, bars = arrange(sec, rng); parts.append((at, tr, drums(sec["drums"], bars))); at += bars * 4
    L = at * spb; N = int((L * cycles + 2) * SR)
    lead, bus, dr = np.zeros((N, 2)), np.zeros((N, 2)), np.zeros((N, 2))
    hits = {k: drum(k, nrng) for k in ("kick", "snare", "hat")}
    cache = {}
    for c in range(cycles):
        for (o, tr, ev) in parts:
            for role, notes in tr.items():
                *_, gain, pan = VOICE[role]
                for (t, d, p, v) in notes:
                    key = (role, p, round(d * spb, 3), v)
                    if key not in cache: cache[key] = note(role, p, d * spb, v)
                    place(lead if role in ("lead", "double") else bus, cache[key] * gain, int((c * L + (o + t) * spb) * SR), pan)
            for (t, k, v) in ev:
                place(dr, hits[k] * v * .5, int((c * L + (o + t) * spb) * SR), 74 if k == "hat" else 64)
    lead = Pedalboard([Delay(delay_seconds=spb * .75, feedback=.25, mix=.16)])(lead.T.astype(np.float32), SR).T
    y = lowpass(lead + bus + lowpass(dr, 6000), 7800).astype(np.float32)
    y = Pedalboard([HighpassFilter(40), Reverb(room_size=.45, damping=.75, wet_level=.14, dry_level=.86, width=.8)])(y.T, SR).T
    a, b = int(round(L * SR)), int(round(2 * L * SR))     # 가운데 바퀴만(앞 바퀴 잔향 포함) -> 끝이 처음으로 이어진다
    return y[a:b].astype(np.float64), L


def check(y):
    mono = y.mean(1); d = np.abs(np.diff(mono)); p99 = float(np.percentile(d, 99))
    # 클릭: 이웃보다 튀는 1샘플 점프(주변 5ms 평균의 8배 넘게, 절대 0.05 넘게)
    win = int(.005 * SR); local = np.convolve(d, np.ones(win) / win, mode="same")
    clicks = int(np.sum((d > 8 * local + 1e-9) & (d > .05)))
    seam = abs(float(mono[0] - mono[-1]))
    r = dict(dur=len(y) / SR, peak=float(np.abs(y).max()), clip=int(np.sum(np.abs(y) >= .999)), clicks=clicks,
             seam=seam, seam_p99=p99)
    r["ok"] = dict(length=100 <= r["dur"] <= 150, clip=r["clip"] == 0, clicks=clicks <= 1, seam=seam <= p99, peak=r["peak"] <= .92)
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(HERE, "..", "..", "public", "audio", "bgm.m4a"))
    ap.add_argument("--wav", default="")
    a = ap.parse_args()
    y, L = render()
    meter = pyloudnorm.Meter(SR); lufs = meter.integrated_loudness(y)
    y = y * 10 ** ((-15 - lufs) / 20)
    pk = max(np.abs(y).max(), np.abs((y[:, 0] + y[:, 1]) * .7071).max())
    if pk > .92: y *= .92 / pk
    r = check(y); r["lufs"] = meter.integrated_loudness(y)
    print(f"{r['dur']:.1f}s LUFS {r['lufs']:.1f} peak {r['peak']:.3f} clip {r['clip']} click {r['clicks']} "
          f"seam {r['seam']:.4f}<={r['seam_p99']:.4f}  " + ("통과" if all(r["ok"].values()) else f"실패 {[k for k, v in r['ok'].items() if not v]}"))
    wav = a.wav or tempfile.mktemp(suffix=".wav")
    with AudioFile(wav, "w", SR, 2) as f: f.write(y.T.astype(np.float32))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-c:a", "aac", "-b:a", "112k", "-movflags", "+faststart", a.out], check=True)
    if not a.wav: os.remove(wav)
    print("->", os.path.relpath(a.out), f"{os.path.getsize(a.out) / 1e6:.2f}MB")
    sys.exit(0 if all(r["ok"].values()) else 1)


if __name__ == "__main__":
    main()

// 케이스 영상 녹화: 헤드리스 크로미움이 게임을 직접 조작하고, 화면(Playwright 영상)과 게임 소리(Web Audio 탭)를 합쳐 mp4로 만든다.
// 다시 녹화: node scripts/cases/run.mjs --out <폴더> [--only id,id] [--resume]   (먼저 vite 두 개: `npx vite --port 5181` 과 `npx vite --mode shot --port 5182`)
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CASES, MODES, RESULTS } from "./cases.mjs";

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i < 0 ? d : (process.argv[i + 1]?.startsWith("--") || process.argv[i + 1] === undefined ? true : process.argv[i + 1]); };
const OUT = path.resolve(arg("out", "cases-out"));
const DEV = arg("dev", "http://127.0.0.1:5181");     // 일반 개발 서버(실제 판정): 목꺾기, 목뽑기
const SHOT = arg("shot", "http://127.0.0.1:5182");   // --mode shot 서버(__backShot/__sideShot 프로브): 허리펴기, 허리비틀기
const ONLY = arg("only", "") && String(arg("only", "")).split(",");
const RESUME = !!arg("resume", false);
const VIDEO_OFFSET = Number(arg("voffset", 0));       // 영상 시계가 벽시계보다 늦게 시작하는 초
const W = 844, H = 390;
fs.mkdirSync(path.join(OUT, "videos"), { recursive: true });
fs.mkdirSync(path.join(OUT, "tmp"), { recursive: true });
const RES_FILE = path.join(OUT, "results.json");
const results = fs.existsSync(RES_FILE) ? JSON.parse(fs.readFileSync(RES_FILE, "utf8")) : {};
const save = () => fs.writeFileSync(RES_FILE, JSON.stringify(results, null, 1));

// ── 소리 탭: AudioDestinationNode로 가는 모든 연결을 ScriptProcessor로도 보낸다 ──
const AUDIO_TAP = () => {
  const taps = new WeakMap();
  const orig = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    try {
      if (dest instanceof AudioDestinationNode && this.context === dest.context) {
        let tap = taps.get(this.context);
        if (!tap) {
          const ctx = this.context;
          const sp = ctx.createScriptProcessor(4096, 2, 2);
          const mute = ctx.createGain(); mute.gain.value = 0;
          sp.onaudioprocess = e => {
            const ch = e.inputBuffer, a = ch.getChannelData(0), b = ch.numberOfChannels > 1 ? ch.getChannelData(1) : a;
            const out = new Int16Array(a.length);
            let peak = 0;
            for (let i = 0; i < a.length; i++) { let v = (a[i] + b[i]) * 0.5; v = v > 1 ? 1 : v < -1 ? -1 : v; out[i] = v * 32767; if (v > peak || -v > peak) peak = Math.abs(v); }
            const u8 = new Uint8Array(out.buffer); let bin = ""; for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
            // 귀에 들리는 시각: 출력 타임스탬프로 컨텍스트 시간을 벽시계로 바꾼다(버퍼·장치 지연 포함)
            const ts = ctx.getOutputTimestamp ? ctx.getOutputTimestamp() : null;
            const when = ts && ts.performanceTime > 0 ? performance.timeOrigin + ts.performanceTime + (e.playbackTime - ts.contextTime) * 1000 : Date.now() - a.length / ctx.sampleRate * 1000;
            window.__audioChunk && window.__audioChunk(when, ctx.sampleRate, a.length, btoa(bin));
          };
          orig.call(sp, mute); orig.call(mute, ctx.destination);
          taps.set(ctx, sp); tap = sp;
        }
        orig.call(this, tap);
      }
    } catch (e) { /* 탭이 실패해도 게임 소리는 그대로 */ }
    return orig.call(this, dest, ...rest);
  };
};

function wav(chunks, t0, tEnd) {
  const rate = chunks.length ? chunks[0].rate : 44100;
  const n = Math.max(1, Math.ceil((tEnd - t0) / 1000 * rate));
  const pcm = new Int16Array(n);
  let nextExpected = null;
  for (const c of chunks) {
    let start = c.t;
    if (nextExpected !== null && Math.abs(start - nextExpected) < 120) start = nextExpected;
    nextExpected = start + c.len / c.rate * 1000;
    const idx = Math.round((start - t0) / 1000 * rate);
    const buf = Buffer.from(c.b64, "base64");
    const s16 = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);
    for (let i = 0; i < s16.length; i++) { const j = idx + i; if (j >= 0 && j < n) pcm[j] = s16[i]; }
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + n * 2, 4); head.write("WAVEfmt ", 8); head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write("data", 36); head.writeUInt32LE(n * 2, 40);
  return Buffer.concat([head, Buffer.from(pcm.buffer)]);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ff = (args) => { const r = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], { encoding: "utf8" }); if (r.status !== 0) throw new Error("ffmpeg: " + r.stderr.slice(0, 400)); };

// ── 모드별 조작 ──
async function setupNeck(page, towel) {
  await page.waitForFunction(() => document.documentElement.dataset.head && document.documentElement.dataset.hands, null, { timeout: 150_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    const { S } = await import("/src/game/state.js");
    const flow = await import("/src/game/flow.js");
    const feel = await import("/src/game/feel.js");
    const tw = await import("/src/core/towel.js");
    window.__cs = { S, adjust: flow.adjust, feel, tw };
  });
}
async function startNeck(page, towel, patient) {
  await page.evaluate(async ({ towel, patient }) => {
    const { makePatients } = await import("/src/patient/roster.js");
    const { S } = window.__cs;
    document.getElementById(towel ? "startTowel" : "start").click();
    if (patient) {
      const i = S.patients.findIndex(p => p.name === patient);
      if (i > 0) { const [p] = S.patients.splice(i, 1); S.patients.unshift(p); }
      else if (i < 0) { const all = makePatients(); const p = all.find(q => q.name === patient); if (p) S.patients.splice(0, 1, p); }
    }
  }, { towel, patient });
}
async function actNeck(page, step, towel) {
  return page.evaluate(async ({ step, towel }) => {
    const { S, adjust, feel, tw } = window.__cs;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const now = () => performance.now();
    const dl = now() + 60000;
    while (!(S.phase === "play" && !S.busy && S.target)) { if (now() > dl) throw new Error("준비 안 됨: " + JSON.stringify({ phase: S.phase, busy: S.busy })); await sleep(16); }
    if (step.hold !== 0) while (now() - S.patientStart < 800) await sleep(16);
    const hold = towel && step.tow?.startsWith("hold-");
    if (step.exhale !== undefined && !hold) { const end = now() + 12000; while (feel.breath(now()).exhale !== step.exhale && now() < end) await sleep(8); }
    const set = (rot, bend) => { S.input.rot = S.cur.rot = rot; S.input.bend = S.cur.bend = bend; };
    const before = { idx: S.idx, sideIdx: S.sideIdx, results: S.results.length, name: S.target.name };
    if (!towel) {
      const t = S.target, sgn = t.rot >= 0 ? 1 : -1, p = step.pos;
      if (p === "target") set(t.rot, t.bend);
      else if (p.d !== undefined) { let lo = 0, hi = 300; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; set(t.rot - sgn * m, t.bend); if (feel.distNorm() < p.d) lo = m; else hi = m; } set(t.rot - sgn * lo, t.bend); }
      else if (p.over) set(sgn * (t.limR + 4), t.bend);
    } else {
      const g = S.towel, F = tw.TOWEL_FULL, k = step.tow;
      if (k === "perfect") set(g.aim, g.mid * F);
      else if (k === "good") set(g.aim + 0.5 * g.aimTol, (g.mid + 0.8 * g.half) * F);
      else if (k === "slip") set(g.aim, Math.max(0, g.mid - 2 * g.half) * F);
      else if (k === "taut") set(g.aim, (g.mid + g.half + (g.limit - g.mid - g.half) * 0.5) * F);
      else if (k === "over" || k === "hold-over") set(g.aim, Math.min(1, g.limit + 0.03) * F);
      else if (k === "skew1") set(g.aim + 1.5 * g.aimTol, g.mid * F);
      else if (k === "skew2") set(g.aim + 3 * g.aimTol, g.mid * F);
      else if (k === "zero") set(g.aim, 0);
      else if (k === "hold-ok") set(g.aim, g.mid * F);
    }
    const tAct = Date.now();
    window.__markAct();
    if (!hold) adjust(step.src || "key", step.force || 0);
    return { tAct, before };
  }, { step, towel });
}
async function waitNeck(page, after, before, towel, c) {
  const to = (c.timeout || 90) * 1000;
  if (after.startsWith("ms:")) return sleep(Number(after.slice(3)));
  if (after === "result") return page.waitForFunction(() => !document.getElementById("result").hidden, null, { timeout: to, polling: 100 });
  if (after === "retry") { await sleep(5200); return page.waitForFunction(() => { const { S } = window.__cs; return !S.busy && S.phase === "play" || !document.getElementById("result").hidden; }, null, { timeout: to, polling: 100 }); }
  if (after === "next") return page.waitForFunction(b => { const { S } = window.__cs; return S.idx !== b.idx || S.sideIdx !== b.sideIdx || !document.getElementById("result").hidden; }, before, { timeout: to, polling: 100 });
  throw new Error("after?");
}

async function stepBack(page, step, probe, goalMode) {
  return page.evaluate(async ({ step, probe, goalMode }) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const B = window[probe], now = () => performance.now(), dl = now() + 60000;
    for (;;) { const s = B.snapshot(); if (s.phase === "play" && now() >= s.prepUntil + 100) break; if (now() > dl) throw new Error("준비 안 됨: " + s.phase); await sleep(30); }
    await sleep(700);
    const s = B.snapshot();
    const hT = goalMode ? B.goal().height : s.heights[s.step], sT = goalMode ? B.goal().roll : s.targets[s.step];
    const val = (spec, tgt) => { if (spec === "target" || spec === "goal") return tgt; if (spec.abs !== undefined) return spec.abs; const d = spec.off ?? spec.goalOff; let v = tgt + d; if (v > 0.97 || v < 0.03) v = tgt - d; return Math.min(1, Math.max(0, v)); };
    const h = val(step.h, hT);
    B.aim(h); await sleep(500);
    let pos = h;
    if (step.s !== null) { B.lock(true); await sleep(500); pos = val(step.s, sT); }
    B.aim(pos); await sleep(300);
    const tAct = Date.now();
    window.__markAct();
    B.press(pos, step.pressure, step.force);
    return { tAct, before: { step: s.step, mistakes: s.mistakes, results: s.results.length, sideIdx: s.sideIdx } };
  }, { step, probe, goalMode });
}

// 영상 하나 녹화
async function record(browser, c) {
  const isNeck = c.mode === "clinic" || c.mode === "towel";
  const towel = c.mode === "towel";
  const base = isNeck ? DEV : SHOT;
  const url = c.mode === "clinic" ? `${base}/index.html` : c.mode === "towel" ? `${base}/index.html?mode=towel` : c.mode === "back" ? `${base}/back.html` : `${base}/side.html`;
  const tmp = path.join(OUT, "tmp", c.id);
  fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, recordVideo: { dir: tmp, size: { width: W, height: H } } });
  const t0 = Date.now();
  const page = await ctx.newPage();
  const chunks = []; const errors = [];
  await page.exposeFunction("__audioChunk", (t, rate, len, b64) => chunks.push({ t, rate, len, b64 }));
  await page.addInitScript(AUDIO_TAP);
  // 첫 동작 표식: 왼쪽 위 모서리의 4px 점(0.3초). 동작 순간 화면이 영상에 찍히는 시각을 재서 소리를 맞춘다.
  await page.addInitScript(() => { window.__markAct = () => { const d = document.createElement("div"); d.style.cssText = "position:fixed;left:0;top:0;width:4px;height:4px;background:#f0f;z-index:2147483647"; document.body.appendChild(d); setTimeout(() => d.remove(), 300); }; });
  page.on("pageerror", e => errors.push(String(e).slice(0, 200)));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  let tStart = 0, tEnd = 0, tFirst = 0, tMark = 0, err = null;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    if (isNeck) await setupNeck(page, towel);
    else await page.waitForFunction(k => document.documentElement.dataset[k] === "true", c.mode === "back" ? "backReady" : "sideReady", { timeout: 150_000 });
    await page.evaluate(() => document.fonts.ready);
    await sleep(400);
    // 동기 표식: 흰 화면을 잠깐 번쩍여 Playwright 영상의 지연(약 0.4초)을 케이스마다 잰다
    tMark = Date.now();
    await page.evaluate(() => { const d = document.createElement("div"); d.style.cssText = "position:fixed;inset:0;background:#fff;z-index:2147483647"; document.body.appendChild(d); setTimeout(() => d.remove(), 160); });
    await sleep(800);
    tStart = Date.now();
    if (isNeck) await startNeck(page, towel, c.patient);
    else await page.click(c.mode === "back" ? "#backTouchStart" : "#sideTouchStart");
    const steps = c.steps;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i], last = i === steps.length - 1;
      if (isNeck) {
        const r = await actNeck(page, step, towel);
        if (!tFirst) tFirst = r.tAct;
        await waitNeck(page, step.after || "next", r.before, towel, c);
      } else if (step.flip) {
        await page.waitForFunction(p => window[p].snapshot().phase === "turn", c.mode === "back" ? "__backShot" : "__sideShot", { timeout: 60_000, polling: 100 });
        await sleep(1300);
        await page.evaluate(() => window.__sideShot.flip());
      } else {
        const probe = c.mode === "back" ? "__backShot" : "__sideShot";
        const r = await stepBack(page, step, probe, c.mode === "side");
        if (!tFirst) tFirst = r.tAct;
        const to = (c.timeout || 120) * 1000;
        if (c.mode === "back") {
          await page.waitForFunction(b => { const s = window.__backShot.snapshot(); return !document.getElementById("backResult").hidden || (s.phase === "play" && (s.step !== b.step || s.mistakes !== b.mistakes)); }, r.before, { timeout: to, polling: 100 });
        } else {
          await page.waitForFunction(() => window.__sideShot.snapshot().phase !== "anim", null, { timeout: to, polling: 100 });
          if (last) {
            const end = c.end || "play";
            await page.waitForFunction(e => { const s = window.__sideShot.snapshot(); return e === "result" ? !document.getElementById("sideResult").hidden : s.phase === e; }, end, { timeout: to, polling: 100 });
          }
        }
      }
    }
    await sleep((c.tail ?? 2) * 1000);
    tEnd = Date.now();
  } catch (e) { err = String(e.message || e).split("\n")[0]; tEnd = Date.now(); }
  const shotNow = await page.screenshot({ type: "jpeg", quality: 60 }).catch(() => null);
  await page.close();
  await ctx.close();
  const vid = fs.readdirSync(tmp).find(f => f.endsWith(".webm"));
  return { err, tStart, tEnd, tFirst, tMark, t0, chunks, errors, vid: vid && path.join(tmp, vid), tmp, shotNow };
}

// 영상 안에서 흰 표식 프레임이 나온 시각을 찾아, 벽시계와의 차이(영상이 늦은 초)를 돌려준다
function videoLag(rec) {
  const expect = (rec.tMark - rec.t0) / 1000, from = Math.max(0, expect - 1);
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", from.toFixed(2), "-t", "6", "-i", rec.vid, "-vf", "fps=50,scale=16:9,format=gray", "-f", "rawvideo", "-"], { maxBuffer: 1 << 26 });
  const fr = r.stdout, size = 16 * 9;
  for (let i = 0; i * size < fr.length; i++) { let sum = 0; for (let j = 0; j < size; j++) sum += fr[i * size + j]; if (sum / size > 170) return from + i / 50 - expect; }
  return null;
}
// 영상 안에서 동작 표식(마젠타 점)이 처음 찍힌 영상 시각
function actMarker(rec, off) {
  const from = Math.max(0, (rec.tFirst - rec.t0) / 1000 + off - 1);
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", from.toFixed(2), "-t", "6", "-i", rec.vid, "-vf", "fps=50,crop=4:4:0:0,format=rgb24", "-f", "rawvideo", "-"], { maxBuffer: 1 << 26 });
  const fr = r.stdout, size = 48;
  for (let i = 0; i * size < fr.length; i++) { let R = 0, G = 0; for (let j = 0; j < 16; j++) { R += fr[i * size + j * 3]; G += fr[i * size + j * 3 + 1]; } if (R / 16 > 180 && G / 16 < 90) return from + i / 50; }
  return null;
}
// 소리 첫 타격의 벽시계 시각(tFirst 이후 처음 진폭이 큰 샘플)
function audioOnset(rec) {
  for (const c of rec.chunks) {
    if (c.t + c.len / c.rate * 1000 < rec.tFirst - 100) continue;
    const buf = Buffer.from(c.b64, "base64"), s16 = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);
    for (let i = 0; i < s16.length; i++) if (Math.abs(s16[i]) > 1500) return c.t + i / c.rate * 1000;
  }
  return null;
}
function mux(c, rec) {
  const lag = videoLag(rec);
  const off = lag === null ? VIDEO_OFFSET : lag;         // 영상 시각 = 벽시계 + off
  rec.lag = off;
  // 동작 순간은 화면이 잠깐 멈춰(셰이더 컴파일) 영상에 늦게 찍힌다: 첫 동작의 소리를 그 화면 시각에 맞춘다
  const vm = actMarker(rec, off), ao = audioOnset(rec);
  let shift = 0;
  if (vm !== null && ao !== null) shift = Math.min(1.2, Math.max(-0.6, vm + 0.03 - ((ao - rec.t0) / 1000 + off)));
  rec.shift = shift;
  const A = Math.max(0, (rec.tStart - rec.t0) / 1000 + off - 0.4), B = (rec.tEnd - rec.t0) / 1000 + off;
  const wavPath = path.join(rec.tmp, "audio.wav");
  fs.writeFileSync(wavPath, wav(rec.chunks, rec.t0 - (off + shift) * 1000, rec.tEnd + 1500));
  const mp4 = path.join(OUT, "videos", c.id + ".mp4");
  ff(["-ss", A.toFixed(3), "-to", B.toFixed(3), "-i", rec.vid, "-ss", A.toFixed(3), "-to", B.toFixed(3), "-i", wavPath,
    "-map", "0:v:0", "-map", "1:a:0", "-vf", "fps=25", "-c:v", "libx264", "-preset", "veryfast", "-crf", "30", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "64k", "-ar", "44100", "-movflags", "+faststart", "-shortest", mp4]);
  const poster = path.join(OUT, "videos", c.id + ".jpg");
  const pt = Math.max(0, ((rec.tFirst || rec.tStart) - rec.tStart) / 1000 + 0.4 + 1.0);
  ff(["-ss", pt.toFixed(2), "-i", mp4, "-frames:v", "1", "-vf", "scale=480:-2,format=yuvj420p", "-q:v", "4", poster]);
  const vd = spawnSync("ffmpeg", ["-hide_banner", "-i", mp4, "-af", "volumedetect", "-vn", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const mean = /mean_volume: (-?[\d.]+|-inf) dB/.exec(vd)?.[1], max = /max_volume: (-?[\d.]+|-inf) dB/.exec(vd)?.[1];
  const dur = Number(/Duration: (\d+):(\d+):([\d.]+)/.exec(vd)?.slice(1).reduce((a, v, i) => a + Number(v) * [3600, 60, 1][i], 0) || 0);
  return { mp4, poster, mean, max, dur, size: fs.statSync(mp4).size, actAt: (rec.tFirst - rec.tStart) / 1000 + 0.4, lag: off, shift: rec.shift };
}

// swiftshader(소프트웨어)는 4fps라 게임이 슬로모션이 된다. 맥 GPU(Metal)를 쓰는 새 헤드리스(channel chromium)로 약 57fps.
const browserArgs = ["--use-angle=metal", "--enable-gpu", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"];
let browser = null, n = 0;
const list = CASES.filter(c => !ONLY || ONLY.includes(c.id));
for (const c of list) {
  if (RESUME && results[c.id]?.status === "ok") continue;
  if (c.skip) { results[c.id] = { status: "skip", reason: c.skip }; save(); console.log("SKIP", c.id); continue; }
  if (!browser || n++ % 8 === 0) { await browser?.close(); browser = await chromium.launch({ channel: "chromium", args: browserArgs }); }
  const t = Date.now();
  let rec;
  try {
    rec = await record(browser, c);
    if (rec.err) { results[c.id] = { status: "fail", reason: rec.err, errors: rec.errors.slice(0, 3) }; console.log("FAIL", c.id, rec.err); }
    else {
      const m = mux(c, rec);
      const silent = !m.max || m.max === "-inf" || Number(m.max) < -50;
      results[c.id] = { status: silent ? "silent" : "ok", video: path.basename(m.mp4), poster: path.basename(m.poster), duration: m.dur, size: m.size, meanVolume: m.mean, maxVolume: m.max, actAt: m.actAt, lag: m.lag, shift: m.shift, errors: rec.errors.slice(0, 3) };
      console.log(silent ? "SILENT" : "OK", c.id, `${m.dur.toFixed(1)}s ${(m.size / 1e6).toFixed(2)}MB max ${m.max}dB act@${m.actAt.toFixed(1)}s`, `(${((Date.now() - t) / 1000).toFixed(0)}s)`);
    }
  } catch (e) { results[c.id] = { status: "fail", reason: String(e.message || e).split("\n")[0] }; console.log("FAIL", c.id, results[c.id].reason); }
  save();
  if (rec?.tmp) fs.rmSync(rec.tmp, { recursive: true, force: true });
}
await browser?.close();
// 케이스 메타 + 결과를 cases.json 으로
const meta = CASES.map(c => ({ id: c.id, mode: c.mode, modeName: MODES[c.mode], result: c.result, resultName: RESULTS[c.result], title: c.title, repro: c.repro, expect: c.expect, tags: c.tags, patient: c.patient || null, ...(results[c.id] || { status: "todo" }) }));
fs.writeFileSync(path.join(OUT, "cases.json"), JSON.stringify(meta, null, 1));
console.log("done", Object.values(results).reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {}));

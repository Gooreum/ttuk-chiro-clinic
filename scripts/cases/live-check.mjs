// 케이스 실시간 재생 점검: cases 빌드(`npm run build:cases`)를 띄운 주소에서 케이스마다 ?case=id 를 열어 탭 → 끝까지 재생되는지 본다.
// node scripts/cases/live-check.mjs [--base http://localhost:5195] [--only id,id] [--jobs 2] [--shots dir]
// --shots: 재생 중 2초마다 찍어 중간 컷을 <dir>/<id>.jpg(사이트 썸네일)로, 재생 시간을 <dir>/durations.json 에 남긴다.
import { chromium } from "playwright";
import { CASES } from "./cases.mjs";

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i < 0 ? d : process.argv[i + 1]; };
const BASE = arg("base", "http://localhost:5195"), ONLY = arg("only", "") && arg("only").split(","), JOBS = Number(arg("jobs", 2)), SHOTS = arg("shots", "");
const fs = await import("node:fs"), durs = {};
const page = c => c.mode === "back" ? "back.html?" + (c.query ? c.query + "&" : "") : c.mode === "side" ? "side.html?" + (c.query ? c.query + "&" : "") : c.mode === "towel" ? "index.html?mode=towel&" : "index.html?";
const list = CASES.filter(c => !c.skip && (!ONLY || ONLY.includes(c.id)));
const browser = await chromium.launch({ channel: "chromium", args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
let bad = 0;
async function one(c){
  const p = await browser.newPage({ viewport: { width: 844, height: 390 }, locale: "ko-KR" });
  const errs = []; p.on("pageerror", e => errs.push(String(e).slice(0, 160)));
  const t = Date.now();
  try{
    await p.goto(`${BASE}/${page(c)}case=${c.id}`);
    await p.waitForSelector("#caseCover button:not([disabled])", { timeout: 180_000 });
    await p.click("#caseCover button");
    const t0 = Date.now(), cuts = [];
    const tick = SHOTS && setInterval(() => p.screenshot({ type: "jpeg", quality: 70 }).then(b => cuts.push(b), () => {}), 2000);
    await p.waitForSelector("#caseCover button:not([disabled])", { timeout: (c.timeout || 120) * 1000 + 60_000 });
    if (tick) { clearInterval(tick); durs[c.id] = (Date.now() - t0) / 1000; if (cuts.length) fs.writeFileSync(`${SHOTS}/${c.id}.jpg`, cuts[Math.floor(cuts.length * .55)]); }
    const msg = await p.textContent("#caseCover p");
    const ok = msg.startsWith("끝") && !errs.length;
    if(!ok) bad++;
    console.log(ok ? "OK  " : "FAIL", c.id, `${((Date.now() - t) / 1000).toFixed(0)}s`, ok ? "" : msg, errs.slice(0, 2).join(" | "));
  }catch(e){ bad++; console.log("FAIL", c.id, String(e.message || e).split("\n")[0], errs.slice(0, 2).join(" | ")); }
  await p.close();
}
const queue = [...list];
await Promise.all(Array.from({ length: JOBS }, async () => { while(queue.length) await one(queue.shift()); }));
await browser.close();
if (SHOTS) fs.writeFileSync(`${SHOTS}/durations.json`, JSON.stringify(durs, null, 1));
console.log(`${list.length - bad}/${list.length} 통과`);
process.exit(bad ? 1 : 0);

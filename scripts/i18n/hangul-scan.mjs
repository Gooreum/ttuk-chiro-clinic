// 영어 화면 한글 점검: cases 빌드를 ?lang=en 으로 케이스마다 끝까지 재생하며, 화면에 보이는 글자 중 한글이 든 것을 모은다.
// 캔버스 글자는 보지 못한다(그건 npm run i18n:check 가 원문 기준으로 막는다). 케이스 덮개(#caseCover, 개발용)는 뺀다.
// node scripts/i18n/hangul-scan.mjs [--base http://localhost:5195] [--only id,id] [--jobs 2]
import { chromium } from "playwright";
import { CASES } from "../cases/cases.mjs";

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i < 0 ? d : process.argv[i + 1]; };
const BASE = arg("base", "http://localhost:5195"), ONLY = arg("only", "") && arg("only").split(","), JOBS = Number(arg("jobs", 2));
const page = c => c.mode === "back" ? "back.html?" + (c.query ? c.query + "&" : "") : c.mode === "side" ? "side.html?" + (c.query ? c.query + "&" : "") : c.mode === "towel" ? "index.html?mode=towel&" : "index.html?";
const list = CASES.filter(c => !c.skip && (!ONLY || ONLY.includes(c.id)));
const browser = await chromium.launch({ channel: "chromium", args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });

/* visible text nodes / placeholders with Hangul, outside the dev case cover */
const grab = () => {
  const out = new Set(), H = /[가-힣]/;
  const shown = el => { for(let e = el; e; e = e.parentElement){ if(e.id === "caseCover" || e.id === "caseBadge" || e.lang === "ko") return false; const s = getComputedStyle(e); if(s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false; } return true; };
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for(let n = w.nextNode(); n; n = w.nextNode()) if(H.test(n.nodeValue) && n.parentElement && shown(n.parentElement)) out.add(n.nodeValue.trim().slice(0, 80));
  for(const el of document.querySelectorAll("[placeholder],[aria-label],[title]")) for(const a of ["placeholder", "aria-label", "title"]){ const v = el.getAttribute(a); if(v && H.test(v) && shown(el)) out.add(v.slice(0, 80)); }
  if(H.test(document.title)) out.add("<title> " + document.title);
  return [...out];
};

const found = new Map();
let bad = 0;
async function one(c){
  const p = await browser.newPage({ viewport: { width: 844, height: 390 }, locale: "en-US" });
  const errs = []; p.on("pageerror", e => errs.push(String(e).slice(0, 160)));
  const mine = new Set();
  const poll = async () => { try{ for(const s of await p.evaluate(grab)) mine.add(s); }catch(e){} };
  try{
    await p.goto(`${BASE}/${page(c)}case=${c.id}&lang=en`);
    await p.waitForSelector("#caseCover button:not([disabled])", { timeout: 180_000 });
    await poll();
    await p.click("#caseCover button");
    const end = Date.now() + (c.timeout || 120) * 1000 + 60_000;
    while(Date.now() < end){
      await poll();
      if(await p.$("#caseCover button:not([disabled])")) break;
      await p.waitForTimeout(400);
    }
    await poll();
  }catch(e){ errs.push(String(e.message || e).split("\n")[0]); }
  if(mine.size || errs.length) bad++;
  for(const s of mine){ if(!found.has(s)) found.set(s, []); found.get(s).push(c.id); }
  console.log(mine.size || errs.length ? "HANGUL" : "OK    ", c.id, mine.size ? [...mine].slice(0, 3).join(" | ") : "", errs.slice(0, 1).join(""));
  await p.close();
}
const queue = [...list];
await Promise.all(Array.from({ length: JOBS }, async () => { while(queue.length) await one(queue.shift()); }));
await browser.close();
console.log(`\n${found.size} distinct Hangul strings on screen:`);
for(const [s, ids] of found) console.log(`  ${s}   [${ids.slice(0, 3).join(",")}${ids.length > 3 ? ` +${ids.length - 3}` : ""}]`);
console.log(`${list.length - bad}/${list.length} cases clean`);
process.exit(bad ? 1 : 0);

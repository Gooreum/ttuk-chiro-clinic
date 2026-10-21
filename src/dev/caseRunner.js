/* Case build only (`npm run build:cases`, __CASES__): `?case=<id>` replays one scenario of scripts/cases/cases.mjs live
   in the real game (real judging, no forced hits), the same moves scripts/cases/run.mjs records. The case site opens it
   in an iframe. One tap starts it (sound and the start buttons need a user gesture); 다시 보기 reloads the page. */
import { CASES } from "../../scripts/cases/cases.mjs";

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const waitFor = async (ok, ms = 60000, what = "대기") => {
  const end = performance.now() + ms;
  while(!ok()){ if(performance.now() > end) throw new Error(what + " 시간 초과"); await sleep(50); }
};

const id = new URLSearchParams(location.search).get("case");
export const theCase = CASES.find(c => c.id === id) || null;

const css = `#caseCover{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;background:#0f201dcc;color:#f4efe4;font:15px/1.5 "IBM Plex Sans KR",sans-serif;text-align:center;padding:16px}
#caseCover b{display:block;font:400 22px/1.25 "Black Han Sans",sans-serif;margin-bottom:6px}
#caseCover p{margin:0 0 14px;color:#b9c9c2;font-size:13px}
#caseCover button{font:600 16px "IBM Plex Sans KR",sans-serif;padding:12px 26px;border-radius:99px;border:0;background:#8adfbf;color:#0f201d;cursor:pointer}
#caseCover button:disabled{background:#2b4a43;color:#9db3ac;cursor:default}
#caseBadge{position:fixed;left:50%;bottom:6px;transform:translateX(-50%);z-index:2147483646;background:#000a;color:#f4efe4;font:12px "IBM Plex Sans KR",sans-serif;padding:3px 10px;border-radius:99px;pointer-events:none;white-space:nowrap;max-width:90%;overflow:hidden;text-overflow:ellipsis}`;

function cover(title, sub, label, onTap){
  let el = document.getElementById("caseCover");
  if(!el){
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    el = document.createElement("div"); el.id = "caseCover"; document.body.appendChild(el);
  }
  el.innerHTML = "<div><b></b><p></p><button type=button></button></div>";
  el.querySelector("b").textContent = title;
  el.querySelector("p").textContent = sub;
  const b = el.querySelector("button");
  b.textContent = label; b.disabled = !onTap;
  el.onclick = onTap ? () => { el.remove(); onTap(); } : null;
  el.hidden = false;
  return el;
}
function badge(text){
  let el = document.getElementById("caseBadge");
  if(!el){ el = document.createElement("div"); el.id = "caseBadge"; document.body.appendChild(el); }
  el.textContent = text;
}

/* ready(): resolves when the scene can start. begin(): synchronous part inside the tap (clicks the start button).
   play(): the scripted steps. */
export function runCase({ ready, begin, play }){
  if(!theCase){ cover("케이스를 찾을 수 없어요", id || "case 값 없음", "닫기", null); return; }
  const c = theCase;
  cover(c.title, "진료실 불러오는 중…", "잠시만요", null);
  ready().then(() => {
    cover(c.title, "실제 게임이 이 장면을 자동으로 재생해요. 소리 있음.", "탭해서 재생", async () => {
      badge("자동 재생 · " + c.title);
      let err = null;
      try{ begin(c); await play(c); await sleep((c.tail ?? 2) * 1000); }
      catch(e){ err = String(e && e.message || e); }
      cover(c.title, err ? "재생이 멈췄어요: " + err : "끝. 같은 장면을 다시 볼 수 있어요.", "다시 보기", () => location.reload());
    });
  }, e => cover(c.title, "진료실을 못 불러왔어요: " + (e && e.message || e), "다시 시도", () => location.reload()));
}

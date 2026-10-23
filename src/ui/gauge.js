import { t as tr } from "../i18n/index.js";
import { clamp } from "../lib/math.js";

// Pure canvas instruments shared by neck traction and back pressing. All values are normalized by the caller.
const DEFAULT_COLORS = {bone:"#f1eadc", coral:"#ff7a59", mint:"#8adfbf"};

// x of a gauge on the left edge (back / side modes): its card (x-35 .. x+55) stays clear of the notch / Dynamic Island.
// gl is the app's --gl (16px + the left safe-area inset, the top / bottom one when self-rotated); 43 when there is none
// (2026-10-22 "왼쪽에 게이지바가 아이폰 아일랜드 영역에 걸려서 짤린다")
export const gaugeX = gl => Math.max(43, gl + 27);
const probes = new WeakMap();
export function leftGaugeX(app){
  let p = probes.get(app);
  if(!p){
    p = document.createElement("div");
    p.style.cssText = "position:absolute;left:0;top:0;width:var(--gl,16px);height:0;visibility:hidden;pointer-events:none";
    app.appendChild(p); probes.set(app, p);
  }
  return gaugeX(p.offsetWidth);
}
export function drawVGauge(ctx,{x,top,h,value,band=null,limit,title,hot=false,fill=true,colors={}}){
  const {bone:C_BONE,coral:C_CORAL,mint:C_MINT}={...DEFAULT_COLORS,...colors};
  const [lo,hi]=band||[0,0],t=clamp(value,0,1),w=16,bot=top+h,yAt=v=>bot-v*h;
  ctx.save();
  ctx.lineJoin = "round";
  // Both instruments use the room / paper card, with the same mint target brackets.
  ctx.fillStyle = "rgba(23,49,44,.94)"; ctx.strokeStyle = "rgba(244,239,228,.3)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x-35,top-34,90,h+53,12); ctx.fill(); ctx.stroke();
  // the tube
  ctx.fillStyle = "rgba(15,35,31,.72)"; ctx.strokeStyle = "rgba(241,234,220,.35)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(x - w/2 - 3, top - 3, w + 6, h + 6, 10); ctx.fill(); ctx.stroke();
  // the band to hit
  if(band){
    ctx.fillStyle = "rgba(138,223,191,.28)"; ctx.fillRect(x - w/2 - 3, yAt(hi), w + 6, (hi-lo)*h);
    ctx.strokeStyle = C_MINT; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
    ctx.strokeRect(x - w/2 - 3, yAt(hi), w + 6, (hi-lo)*h); ctx.setLineDash([]);
  }
  // over the band up to the limit: the crack zone (core/towel.js towelKind "taut")
  // limit omitted: a position gauge (back height) with no crack zone.
  if(limit!==undefined){ ctx.fillStyle = "rgba(255,122,89,.2)"; ctx.fillRect(x - w/2 - 3, yAt(limit), w + 6, yAt(hi) - yAt(limit)); }
  // the fill
  const grd = ctx.createLinearGradient(0, bot, 0, top);
  grd.addColorStop(0, C_MINT); grd.addColorStop(1, C_CORAL);
  ctx.fillStyle = grd;
  if(fill && t > 0.005){ ctx.beginPath(); ctx.roundRect(x - w/2, yAt(t), w, t*h, 6); ctx.fill(); }
  // the limit
  if(limit!==undefined){ ctx.strokeStyle = C_CORAL; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - w/2 - 8, yAt(limit)); ctx.lineTo(x + w/2 + 8, yAt(limit)); ctx.stroke(); }
  // the level knob
  ctx.beginPath(); ctx.arc(x, yAt(t), 8, 0, Math.PI*2);
  ctx.fillStyle = hot ? C_CORAL : C_BONE; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(15,35,31,.85)"; ctx.stroke();
  // labels
  ctx.font = "13px 'Black Han Sans', sans-serif"; ctx.textAlign = "center";
  ctx.lineWidth = 3.5; ctx.strokeStyle = "rgba(15,35,31,.9)"; ctx.strokeText(tr(title), x, top - 10);
  ctx.fillStyle = C_BONE; ctx.fillText(tr(title), x, top - 10);
  ctx.textAlign = "left"; ctx.font = "600 11px 'IBM Plex Sans KR', sans-serif";
  if(limit!==undefined){ ctx.strokeText(tr("과해요"), x + w/2 + 10, yAt(limit) + 4); ctx.fillStyle = C_CORAL; ctx.fillText(tr("과해요"), x + w/2 + 10, yAt(limit) + 4); }
  ctx.restore();
}

// span {pos,target,tol}: the bar spans the whole travel (0..1) instead of the offset from the target, so its ends
// are the ends you can actually reach (back mode, user 2026-10-17). Without it, the neck offset bar as before.
export function drawHBar(ctx,{bx,by,bw,off,span=null,ok=Math.abs(off)<=1,title,okText="맞아요",offText="중심 밖",showBand=true,colors={}}){
  const {bone:C_BONE,coral:C_CORAL,mint:C_MINT}={...DEFAULT_COLORS,...colors};
  const mx=bx+bw/2,lin=v=>bx+12+clamp(v,0,1)*(bw-24);
  const xAt=span?o=>lin(span.target+o*span.tol):o=>mx+clamp(o/3,-1,1)*(bw/2-12);
  ctx.save();
  ctx.lineJoin="round";
  ctx.fillStyle = "rgba(23,49,44,.94)"; ctx.strokeStyle = "rgba(244,239,228,.3)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(bx-10,by-29,bw+20,48,12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(15,35,31,.72)"; ctx.strokeStyle = "rgba(241,234,220,.35)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(bx + 5, by - 7, bw - 10, 14, 7); ctx.fill(); ctx.stroke();
  if(showBand){
    ctx.fillStyle = "rgba(138,223,191,.28)"; ctx.fillRect(xAt(-1), by - 7, xAt(1) - xAt(-1), 14);
    ctx.strokeStyle = C_MINT; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.strokeRect(xAt(-1), by - 7, xAt(1) - xAt(-1), 14); ctx.setLineDash([]);
  }
  ctx.beginPath(); ctx.arc(span?lin(span.pos):xAt(off), by, 7, 0, Math.PI*2);
  ctx.fillStyle = !ok ? C_CORAL : C_BONE; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = "rgba(15,35,31,.85)"; ctx.stroke();
  ctx.textAlign = "left"; ctx.font = "12px 'Black Han Sans', sans-serif";
  ctx.fillStyle = C_BONE; ctx.fillText(tr(title), bx+2, by-14);
  ctx.textAlign = "right"; ctx.font = "600 10px 'IBM Plex Sans KR', sans-serif"; ctx.fillStyle = !ok ? C_CORAL : C_MINT;
  ctx.fillText(tr(!ok ? offText : okText), bx+bw-2, by-14);
  ctx.restore();
}

export function drawHint(ctx,{x,y,text,hot=false,colors={}}){
  if(!text)return;
  text=tr(text);
  const {bone,coral}={...DEFAULT_COLORS,...colors};
  ctx.save();
  ctx.textAlign="center";ctx.font="15px 'Black Han Sans', sans-serif";ctx.lineJoin="round";
  // dark pill behind the words: the white sheet and the pale floor swallowed the outlined text (10차 P2)
  const tw=ctx.measureText(text).width;
  ctx.fillStyle="rgba(15,35,31,.78)";ctx.beginPath();ctx.roundRect(x-tw/2-10,y-17,tw+20,24,12);ctx.fill();
  ctx.lineWidth=3.5;ctx.strokeStyle="rgba(15,35,31,.9)";ctx.strokeText(text,x,y);
  ctx.fillStyle=hot?coral:bone;ctx.fillText(text,x,y);
  ctx.restore();
}

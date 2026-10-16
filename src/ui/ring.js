import { $, css } from "../lib/dom.js";
import { clamp } from "../lib/math.js";
import { T } from "../tuning.js";
import { S } from "../game/state.js";
import { curTolMul } from "../game/feel.js";
import { SHOW_ZONE_UNTIL } from "../patient/roster.js";
import { headScreen } from "./hud.js";
import { aimHist } from "../input/motion.js";
import { towelTension } from "../core/towel.js";

/* Aim ring drawn around the patient's head on the #hud 2D canvas (AGENTS.md 3-6).
   Aim dot: x = rotation ±70°, y = side bend ±30°. Red = danger limits, green dashed = target (first 2 patients),
   outer arc = tension (closeness), small top arc = breathing, mint ghost ring = the right spot after a wrong crack (coral X = where it was aimed). */
const hud = $("#hud"), hctx = hud.getContext("2d");
let hudDpr = 1;
export function sizeHud(w, h){
  hudDpr = Math.min(window.devicePixelRatio||1, 2);
  hud.width = Math.round(w*hudDpr); hud.height = Math.round(h*hudDpr);
}
let C_BONE, C_CORAL, C_MINT;
// read once the stylesheet is applied (the prototype read them at the same point, after the inline <style>)
export function readColors(){
  C_BONE = css("--bone") || "#f1eadc"; C_CORAL = css("--coral") || "#ff7a59"; C_MINT = css("--mint") || "#8adfbf";
}
export function drawRing(now, c, zone, br){
  const ctx = hctx;
  const target = S.target;
  ctx.setTransform(hudDpr,0,0,hudDpr,0,0);
  ctx.clearRect(0,0,hud.width,hud.height);
  if(S.phase !== "play" || !target || S.ambulance) return;   // the ambulance is coming: no more aiming
  const fade = 1 - clamp(Math.max(S.zoom, S.xray)*1.6, 0, 1);   // off while the camera is in on an x-ray
  if(fade <= 0.02) return;
  ctx.globalAlpha = fade;
  const cx = headScreen.x, cy = headScreen.y;
  const R = clamp(headScreen.r * 1.65, 62, Math.min(hud.width, hud.height)/hudDpr * 0.25);
  const ax = R*0.78/70, ay = R*0.62/30;
  const T0 = -Math.PI/2;
  if(S.game === "towel" && S.towel){ drawTowel(ctx, now, zone, br, fade, cx, cy, R); return; }

  // field
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(241,234,220,.28)";
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2); ctx.stroke();
  ctx.strokeStyle = "rgba(241,234,220,.16)";
  ctx.setLineDash([3,5]);
  ctx.beginPath(); ctx.moveTo(cx - R*0.82, cy); ctx.lineTo(cx + R*0.82, cy); ctx.moveTo(cx, cy - R*0.7); ctx.lineTo(cx, cy + R*0.7); ctx.stroke();
  ctx.setLineDash([]);
  // degree ticks every 15°
  ctx.strokeStyle = "rgba(241,234,220,.35)";
  for(let d=-60; d<=60; d+=15){ const x = cx + d*ax; ctx.beginPath(); ctx.moveTo(x, cy-3); ctx.lineTo(x, cy+3); ctx.stroke(); }
  // danger limits
  ctx.strokeStyle = "rgba(255,122,89,.55)"; ctx.lineWidth = 2;
  [-1,1].forEach(s => { const x = cx + s*target.limR*ax; ctx.beginPath(); ctx.moveTo(x, cy - R*0.45); ctx.lineTo(x, cy + R*0.45); ctx.stroke(); });
  [-1,1].forEach(s => { const y = cy - s*target.limB*ay; ctx.beginPath(); ctx.moveTo(cx - R*0.3, y); ctx.lineTo(cx + R*0.3, y); ctx.stroke(); });
  // side labels
  ctx.fillStyle = "rgba(241,234,220,.55)"; ctx.font = "600 10px 'IBM Plex Sans KR', sans-serif"; ctx.textAlign = "center";
  ctx.fillText("왼쪽", cx - R*0.82, cy - 8); ctx.fillText("오른쪽", cx + R*0.82, cy - 8);

  // target zone (first patients)
  if(S.idx < SHOW_ZONE_UNTIL){
    const m = T.tol * curTolMul(now);
    ctx.beginPath();
    ctx.ellipse(cx + target.rot*ax, cy - target.bend*ay, target.tolR*m*ax, target.tolB*m*ay, 0, 0, Math.PI*2);
    ctx.fillStyle = "rgba(138,223,191,.18)"; ctx.fill();
    ctx.strokeStyle = C_MINT; ctx.lineWidth = 2; ctx.setLineDash([5,4]); ctx.stroke(); ctx.setLineDash([]);
  }

  // tension arc
  ctx.lineCap = "round";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(241,234,220,.12)";
  ctx.beginPath(); ctx.arc(cx, cy, R + 9, 0, Math.PI*2); ctx.stroke();
  if(zone){
    ctx.strokeStyle = C_CORAL; ctx.globalAlpha = fade * (0.75 + Math.sin(now*0.012)*0.25);
    ctx.beginPath(); ctx.arc(cx, cy, R + 9, 0, Math.PI*2); ctx.stroke();
    ctx.globalAlpha = fade;
  }else if(c > 0.01){
    const grd = ctx.createLinearGradient(cx - R, cy, cx + R, cy);
    grd.addColorStop(0, C_MINT); grd.addColorStop(1, C_CORAL);
    ctx.strokeStyle = grd;
    ctx.beginPath(); ctx.arc(cx, cy, R + 9, T0, T0 + c*0.92*Math.PI*2); ctx.stroke();
  }
  breathArc(ctx, now, br, fade, cx, cy, R);
  breathLabel(ctx, br, cx, cy, R, "꺾으면");

  // after a wrong crack (game/flow.js hurt): a coral X where it was aimed, the right spot as a pulsing mint ring with a
  // ripple and a dashed line between them, ~2.5 s
  if(now > S.ghostFrom && now < S.ghostUntil){
    const u = (now - S.ghostFrom)/(S.ghostUntil - S.ghostFrom);
    const a = Math.min(1, Math.sin(Math.PI*u)*1.6)*(0.8 + 0.2*Math.sin(now*0.02));
    const gx = cx + clamp(target.rot,-75,75)*ax, gy = cy - clamp(target.bend,-32,32)*ay;
    const mx = cx + clamp(S.missRot,-75,75)*ax, my = cy - clamp(S.missBend,-32,32)*ay;
    ctx.globalAlpha = fade*a;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(15,35,31,.85)"; ctx.lineWidth = 7;          // dark under-stroke: readable on the coral x-ray
    ctx.beginPath(); ctx.moveTo(mx-8, my-8); ctx.lineTo(mx+8, my+8); ctx.moveTo(mx+8, my-8); ctx.lineTo(mx-8, my+8); ctx.stroke();
    ctx.strokeStyle = C_CORAL; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(mx-8, my-8); ctx.lineTo(mx+8, my+8); ctx.moveTo(mx+8, my-8); ctx.lineTo(mx-8, my+8); ctx.stroke();
    ctx.strokeStyle = C_MINT; ctx.lineWidth = 2.5; ctx.setLineDash([5,5]);
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(gx, gy); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "rgba(138,223,191,.28)";
    ctx.beginPath(); ctx.arc(gx, gy, 14 + 4*Math.sin(now*0.012), 0, Math.PI*2); ctx.fill();
    ctx.lineWidth = 4; ctx.stroke();
    ctx.globalAlpha = fade*a*(1 - (u*2.5 % 1));                          // ripple, three rings over the run
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(gx, gy, 16 + 22*(u*2.5 % 1), 0, Math.PI*2); ctx.stroke();
    ctx.globalAlpha = fade*a;
    ctx.lineCap = "butt";
    ctx.font = "17px 'Black Han Sans', sans-serif"; ctx.textAlign = "center";
    ctx.lineWidth = 5; ctx.strokeStyle = "rgba(15,35,31,.9)"; ctx.strokeText("여기였어요", gx, gy - 26);
    ctx.fillStyle = C_MINT; ctx.fillText("여기였어요", gx, gy - 26);
    ctx.globalAlpha = fade;
  }

  // aim dot with short trail
  for(let i=Math.max(0, aimHist.length-8); i<aimHist.length; i++){
    const p = aimHist[i], a = (i - (aimHist.length-8))/8;
    ctx.fillStyle = `rgba(241,234,220,${0.12*a})`;
    ctx.beginPath(); ctx.arc(cx + clamp(p.rot,-75,75)*ax, cy - clamp(p.bend,-32,32)*ay, 5, 0, Math.PI*2); ctx.fill();
  }
  const px = cx + clamp(S.cur.rot,-75,75)*ax, py = cy - clamp(S.cur.bend,-32,32)*ay;
  ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI*2);
  ctx.fillStyle = zone ? C_CORAL : c > 0.66 ? "#ffc1ad" : C_BONE; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(15,35,31,.85)"; ctx.stroke();

  // labels under the ring
  ctx.textAlign = "center";
  ctx.font = "15px 'Black Han Sans', sans-serif";
  ctx.fillStyle = zone ? C_CORAL : C_BONE;
  const H = hud.height/hudDpr;
  ctx.fillText(zone ? "지금! 툭 꺾어요" : c > 0.66 ? "걸리기 시작해요" : c > 0.3 ? "조금 더" : "", cx, Math.min(cy + R + 44, H - 52));
  ctx.globalAlpha = 1;
}

// breath arc (top: the head sits low in the head-side view, so the bottom of the ring runs off screen): how full the
// lungs are; on the out-breath it pulses mint. With the breath bonus on, a line over it says what it means (user:
// "들숨 날숨 게이지가… 뭘 뜻하는지 파악이 안됨", 2026-10-15): a crack on the out-breath scores +15 (core/scoring.js)
function breathArc(ctx, now, br, fade, cx, cy, R){
  ctx.lineCap = "round";
  ctx.lineWidth = 7;
  ctx.strokeStyle = "rgba(241,234,220,.12)";
  ctx.beginPath(); ctx.arc(cx, cy, R + 22, Math.PI*1.3, Math.PI*1.7); ctx.stroke();
  ctx.strokeStyle = br.exhale ? C_MINT : "rgba(241,234,220,.5)";
  if(br.exhale) ctx.globalAlpha = fade*(0.75 + 0.25*Math.sin(now*0.008));
  ctx.beginPath(); ctx.arc(cx, cy, R + 22, Math.PI*1.3, Math.PI*1.3 + br.fill*Math.PI*0.4); ctx.stroke();
  ctx.globalAlpha = fade;
  ctx.lineCap = "butt";
}
function breathLabel(ctx, br, cx, cy, R, verb){
  if(!T.breath) return;
  const label = br.exhale ? `내쉬는 중 · 지금 ${verb} +15` : "숨 들이쉬는 중…";
  ctx.font = "15px 'Black Han Sans', sans-serif"; ctx.textAlign = "center"; ctx.lineJoin = "round";
  // just inside the ring's top, under the arc: above it is where the speech / coach bubbles sit
  ctx.lineWidth = 3.5; ctx.strokeStyle = "rgba(15,35,31,.9)"; ctx.strokeText(label, cx, cy - R + 20);
  ctx.fillStyle = br.exhale ? C_MINT : "rgba(241,234,220,.85)"; ctx.fillText(label, cx, cy - R + 20);
}
/* Towel mode (core/towel.js): no aim dot, a tall tension gauge right of the head instead. Filled from the bottom by
   the towel's tension (mint -> coral), the band to hit in mint, the limit as a coral line; the breath arc as usual. */
function drawTowel(ctx, now, zone, br, fade, cx, cy, R){
  const tg = S.towel, t = towelTension(S.cur.bend), H = hud.height/hudDpr, Wd = hud.width/hudDpr;
  const h = clamp(R*1.5, 104, H*0.42), w = 12;
  const x = Math.min(cx + R*1.65, Wd - 96), top = clamp(cy - h*0.62, 102, H - h - 58), bot = top + h;
  const yAt = v => bot - v*h, over = t > tg.limit;
  const color = over ? C_CORAL : zone ? C_MINT : C_BONE;
  const tugAge = S.stretchAt ? (now - S.stretchAt)/1000 : -1;
  if(tugAge >= 0 && tugAge < 0.42){
    // Short ink strokes catch the yank without obscuring the neck or moving the camera.
    const u = tugAge/0.42;
    ctx.globalAlpha = fade*(1 - u)*0.7; ctx.strokeStyle = S.overAt ? C_CORAL : C_MINT; ctx.lineWidth = 2;
    for(let i = 0; i < 6; i++){
      const a = Math.PI*(0.2 + i*0.32), d = R*(1.05 + 0.45*u);
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a)*d, cy + Math.sin(a)*d*0.65);
      ctx.lineTo(cx + Math.cos(a)*(d + 8 + 11*u), cy + Math.sin(a)*(d + 8 + 11*u)*0.65); ctx.stroke();
    }
    ctx.globalAlpha = fade;
  }
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  // A compact instrument card keeps the anatomy free of floating labels.
  ctx.fillStyle = "rgba(23,49,44,.92)"; ctx.strokeStyle = "rgba(244,239,228,.22)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x - 24, top - 37, 104, h + 83, 12); ctx.fill(); ctx.stroke();
  ctx.font = "700 11px 'IBM Plex Sans KR', sans-serif"; ctx.textAlign = "left";
  ctx.fillStyle = C_BONE; ctx.fillText("수건 장력", x - 12, top - 18);
  ctx.textAlign = "right"; ctx.font = "700 11px 'IBM Plex Sans KR', sans-serif";
  ctx.fillStyle = color; ctx.fillText(Math.round(t*100) + "%", x + 65, top - 18);
  // Fixed scale, mint target bracket and a crisp coral maximum.
  ctx.fillStyle = "rgba(244,239,228,.08)";
  ctx.beginPath(); ctx.roundRect(x - w/2, top, w, h, 6); ctx.fill();
  for(let i = 0; i <= 10; i++){
    ctx.strokeStyle = "rgba(244,239,228,.22)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 12, yAt(i/10)); ctx.lineTo(x + (i%5 ? 16 : 20), yAt(i/10)); ctx.stroke();
  }
  ctx.fillStyle = "rgba(138,223,191,.14)";
  ctx.fillRect(x - 12, yAt(tg.mid + tg.half), 39, tg.half*2*h);
  ctx.strokeStyle = C_MINT; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x + 20, yAt(tg.mid + tg.half)); ctx.lineTo(x + 26, yAt(tg.mid + tg.half));
  ctx.lineTo(x + 26, yAt(tg.mid - tg.half)); ctx.lineTo(x + 20, yAt(tg.mid - tg.half)); ctx.stroke();
  ctx.font = "600 10px 'IBM Plex Sans KR', sans-serif"; ctx.textAlign = "left"; ctx.fillStyle = C_MINT;
  ctx.fillText("목표", x + 32, yAt(tg.mid) + 3);
  if(t > 0.005){
    const grd = ctx.createLinearGradient(x, bot, x + 8, top);
    grd.addColorStop(0, "#17312c"); grd.addColorStop(0.2, color); grd.addColorStop(1, color);
    ctx.fillStyle = grd; ctx.beginPath(); ctx.roundRect(x - w/2, yAt(t), w, t*h, 5); ctx.fill();
  }
  ctx.strokeStyle = C_CORAL; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - 12, yAt(tg.limit)); ctx.lineTo(x + 26, yAt(tg.limit)); ctx.stroke();
  ctx.fillStyle = C_CORAL; ctx.fillText("한계", x + 32, yAt(tg.limit) + 3);
  ctx.strokeStyle = color; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(x - 13, yAt(t)); ctx.lineTo(x + 10, yAt(t)); ctx.stroke();
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x - 15, yAt(t)); ctx.lineTo(x - 20, yAt(t) - 4); ctx.lineTo(x - 20, yAt(t) + 4); ctx.closePath(); ctx.fill();
  // The breath bonus still shows phase and lung fill, now below the scale.
  {
    ctx.strokeStyle = "rgba(244,239,228,.16)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - 10, bot + 16); ctx.lineTo(x + 62, bot + 16); ctx.stroke();
    ctx.strokeStyle = br.exhale ? C_MINT : C_BONE;
    ctx.beginPath(); ctx.moveTo(x - 10, bot + 16); ctx.lineTo(x - 10 + 72*br.fill, bot + 16); ctx.stroke();
    ctx.fillStyle = br.exhale ? C_MINT : C_BONE; ctx.font = "600 10px 'IBM Plex Sans KR', sans-serif";
    ctx.fillText(br.exhale ? `내쉬는 중${T.breath ? " · +15" : ""}` : "숨 들이쉬는 중…", x - 10, bot + 34);
  }
  const msg = zone ? "지금! 툭 당겨요" : over ? "너무 팽팽해요!" : t > tg.mid - tg.half - 0.2 ? "조금 더" : "";
  if(msg){
    const y = Math.min(cy + R + 44, H - 52);
    ctx.font = "15px 'Black Han Sans', sans-serif"; ctx.textAlign = "center";
    const mw = ctx.measureText(msg).width + 26;
    ctx.fillStyle = "rgba(23,49,44,.94)"; ctx.beginPath(); ctx.roundRect(cx - mw/2, y - 19, mw, 29, 14); ctx.fill();
    ctx.fillStyle = over ? C_CORAL : zone ? C_MINT : C_BONE; ctx.fillText(msg, cx, y);
  }
  ctx.globalAlpha = 1;
}

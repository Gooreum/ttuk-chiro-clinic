import { $, css } from "../lib/dom.js";
import { clamp } from "../lib/math.js";
import { T } from "../tuning.js";
import { S } from "../game/state.js";
import { curTolMul } from "../game/feel.js";
import { SHOW_ZONE_UNTIL } from "../patient/roster.js";
import { headScreen } from "./hud.js";
import { aimHist } from "../input/motion.js";

/* Aim ring drawn around the patient's head on the #hud 2D canvas (AGENTS.md 3-6).
   Aim dot: x = rotation ±70°, y = side bend ±30°. Red = danger limits, green dashed = target (first 2 patients),
   outer arc = tension (closeness), small top arc = breathing. */
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
  if(S.phase !== "play" || !target) return;
  const fade = 1 - clamp(S.zoom*1.6, 0, 1);
  if(fade <= 0.02) return;
  ctx.globalAlpha = fade;
  const cx = headScreen.x, cy = headScreen.y;
  const R = clamp(headScreen.r * 1.65, 62, Math.min(hud.width, hud.height)/hudDpr * 0.25);
  const ax = R*0.78/70, ay = R*0.62/30;
  const T0 = -Math.PI/2;

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
  // breath arc (top: the head sits low in the head-side view, so the bottom of the ring runs off screen)
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(241,234,220,.12)";
  ctx.beginPath(); ctx.arc(cx, cy, R + 22, Math.PI*1.3, Math.PI*1.7); ctx.stroke();
  ctx.strokeStyle = br.exhale ? C_MINT : "rgba(241,234,220,.5)";
  ctx.beginPath(); ctx.arc(cx, cy, R + 22, Math.PI*1.3, Math.PI*1.3 + br.fill*Math.PI*0.4); ctx.stroke();
  ctx.lineCap = "butt";

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
  ctx.font = "600 10px 'IBM Plex Sans KR', sans-serif";
  ctx.fillStyle = br.exhale ? C_MINT : "rgba(241,234,220,.6)";
  ctx.textAlign = "right";
  ctx.fillText(br.exhale ? "날숨" : "들숨", cx + Math.cos(Math.PI*1.3)*(R+22) - 6, cy + Math.sin(Math.PI*1.3)*(R+22) + 4);
  ctx.globalAlpha = 1;
}

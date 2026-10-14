import * as THREE from "three";
import { $ } from "../lib/dom.js";
import { DEG, clamp, lerp, ease } from "../lib/math.js";
import { T } from "../tuning.js";
import { S } from "./state.js";
import { distNorm, closeness, breath } from "./feel.js";
import { setFace } from "./flow.js";
import { renderer, scene, camera, camBase, camLook } from "../scene/renderer.js";
import { mats } from "../scene/materials.js";
import {
  torso, collar, pivot, lids, eyesOpen, brows, mouthFlat, mouthSmile, mouthO, hands, forearms,
  UP, tmpA, tmpB, xrayMats, crackFadeMats, ringMat, waveMat, waveRing, sparks
} from "../scene/patientModel.js";
import { updateXray, XRAY_LEVEL } from "../scene/xray.js";
import { tone, vib } from "../audio/audio.js";
import { say, headScreen, projectHead } from "../ui/hud.js";
import { drawRing } from "../ui/ring.js";
import { live, aimHist } from "../input/motion.js";
import { realHeadActive, updateRealFace } from "../scene/realAssets.js";

/* Frame loop: slow motion (slow), dolly zoom (zoom), x-ray (xray, crackT), face, camera. */
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const elAdj = $("#adjust"), elPeak = $("#peak"), elJpeak = $("#jpeak"), elSensor = $("#sensor"), elBubble = $("#bubble");
let last = performance.now(), blinkAt = 0, zs = 0;
const EXPOSURE = renderer.toneMappingExposure, ROOM_BG = scene.background.clone(), XRAY_BG = new THREE.Color(0x0f231f);
// opaque materials turn transparent only while they are being faded
function fadeMats(list, opacity, depthWrite){
  const on = opacity < 0.999;
  list.forEach(m => {
    if(m.transparent !== on){ m.transparent = on; m.needsUpdate = true; }
    m.opacity = on ? opacity : 1; m.depthWrite = on ? depthWrite : true;
  });
}
const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), neckW = new THREE.Vector3();
export function frame(now){
  const target = S.target, cur = S.cur, input = S.input, face = () => S.face;
  const rdt = Math.min(0.05, (now - last)/1000); last = now;
  const ts = 1 - 0.72*clamp(S.slow, 0, 1);       // slow-motion during the crack
  const dt = rdt * ts;
  S.slow = Math.max(0, S.slow - rdt*2.2);

  const k = 1 - Math.exp(-dt*9);
  cur.rot += (input.rot - cur.rot)*k;
  cur.bend += (input.bend - cur.bend)*k;

  S.thrust = Math.max(0, S.thrust - dt*4);
  S.shake = Math.max(0, S.shake - rdt*3.5);
  S.jitter = Math.max(0, S.jitter - dt*2.2);
  S.peakRate *= Math.pow(0.5, rdt/1.5);
  S.jerkPeak *= Math.pow(0.5, rdt/1.5);
  aimHist.push({t:now, rot:cur.rot, bend:cur.bend});
  while(aimHist.length && aimHist[0].t < now - 800) aimHist.shift();

  const thrustDeg = Math.sin(S.thrust*Math.PI) * 7 * Math.sign(cur.rot || 1);
  const jit = S.jitter > 0 ? Math.sin(now*0.06)*S.jitter*3 : 0;
  pivot.rotation.set(0, cur.bend*DEG, (cur.rot + thrustDeg + jit)*DEG);

  // breathing
  const br = breath(now);
  torso.scale.z = 0.7 + 0.05*br.fill;
  collar.position.y = 1.05 + 0.012*br.fill;

  // feel feedback
  const playing = S.phase === "play" && !S.busy;
  const d = distNorm();
  const c = playing ? closeness(cur.rot, cur.bend) : 0;
  const zone = playing && d <= 1;
  if(zone && !S.inZone){ tone(880, 1320, 0.06, "sine", 0.05); vib(14); }
  if(zone && !S.saidNear && target){ S.saidNear = true; say(target.lines.near, 1400); }
  S.inZone = zone;
  if(c > 0.05 && now > S.nextPulse){
    vib(8);
    if(T.tick) tone(520 + 520*c, 480 + 480*c, 0.03, "sine", 0.015 + 0.03*c);
    S.nextPulse = now + lerp(560, 110, c);
  }
  if(playing && target && !S.saidIdle && now - S.patientStart > 16000){ S.saidIdle = true; say(target.lines.idle, 1800); }
  if(playing && target && target.trait === "nervous" && face() !== "ouch") setFace(now - S.patientStart > 9000 ? "tense" : "worried");
  ringMat.opacity = zone ? 0.55 + Math.sin(now*0.012)*0.25 : c*0.2;
  mats.headSkin.emissiveIntensity = zone ? 0.14 : c*0.05;
  elAdj.classList.toggle("ready", zone);

  // face
  const f = face();
  const eyesOpenNow = f === "worried" || f === "tense";
  if(now > blinkAt){ blinkAt = now + 2500 + Math.random()*2500; }
  const blinking = eyesOpenNow && blinkAt - now > 2350 && blinkAt - now < 2500;
  if(realHeadActive()) updateRealFace(f, blinking, k, mats.headSkin.emissiveIntensity);
  else{
  lids.forEach(l => { l.visible = !eyesOpenNow || blinking; const sq = f === "ouch" ? 1.7 : 1; l.scale.x += (sq - l.scale.x)*k; });
  eyesOpen.forEach(e => { e.visible = eyesOpenNow && !blinking; });
  const browAng = f === "worried" || f === "tense" ? -0.38 : f === "ouch" ? 0.42 : f === "relief" ? -0.12 : 0;
  const browZ = f === "relief" ? -0.058 : f === "ouch" ? -0.047 : -0.052;
  brows.forEach((b, i) => { const s = i ? 1 : -1; b.rotation.y += (browAng*s - b.rotation.y)*k; b.position.z += (browZ - b.position.z)*k; });
  mouthFlat.visible = f === "rest" || f === "worried" || f === "tense";
  mouthFlat.scale.y = f === "tense" ? 0.7 : 1;
  mouthSmile.visible = f === "relief";
  mouthO.visible = f === "ouch";
  }

  // x-ray: hidden while aiming so the face and neck stay readable. It opens a beat after the crack
  // (snap back, flash, pulse down the cord) and as a coral throb after a wrong crack. See scene/xray.js.
  if(S.xrayIn > 0){
    S.xrayIn -= rdt;
    if(S.xrayIn <= 0){ S.xrayIn = 0; S.xray = 0.001; S.xrayHold = 1.5; S.crackT = 0; S.wave = 1; }
  }
  if(S.xrayHold > 0){ S.xrayHold -= rdt; S.xray = Math.min(1, S.xray + rdt*5); } else S.xray = Math.max(0, S.xray - rdt*2.5);
  if(S.crackT >= 0) S.crackT += rdt;
  S.hurtX = Math.max(0, S.hurtX - rdt*1.4);
  const xray = Math.max(S.xray, S.hurtX*0.55);
  updateXray(now, xray, S.xray > 0.001 ? S.crackT : -1, S.hurtX, target);
  fadeMats(xrayMats, xray > 0.001 ? 1 - 0.78*xray : 1, xray < 0.5);
  fadeMats(crackFadeMats, S.xray > 0.001 ? 1 - 0.8*S.xray : 1, S.xray < 0.5);
  renderer.toneMappingExposure = EXPOSURE*(1 - 0.35*xray);
  scene.background.copy(ROOM_BG).lerp(XRAY_BG, xray*0.8);

  // release wave + sparks
  if(S.wave > 0){
    S.wave = Math.max(0, S.wave - dt*1.6);
    const s = 1 + (1 - S.wave)*3.2;
    waveRing.scale.set(s, s, s); waveMat.opacity = S.wave*0.8;
    waveRing.position.set(0, -0.014, XRAY_LEVEL(target ? target.seg - 1 : 3) + 0.0335/2);
  }else waveMat.opacity = 0;
  sparks.forEach(s => {
    if(s.life <= 0){ s.m.material.opacity = 0; return; }
    s.life -= dt*1.7;
    s.m.position.addScaledVector(s.v, dt);
    s.v.y -= dt*0.9;
    s.m.material.opacity = Math.max(0, s.life);
  });

  // therapist forearms follow the hands
  forearms.forEach((f,i)=>{
    hands[i].getWorldPosition(tmpA);
    tmpB.copy(f.elbow).sub(tmpA);
    const len = tmpB.length();
    tmpB.normalize();
    f.m.position.copy(tmpA).addScaledVector(tmpB, len*0.5);
    f.m.quaternion.setFromUnitVectors(UP, tmpB);
    f.m.scale.set(1, len/0.52, 1);
    f.cuff.position.copy(tmpA).addScaledVector(tmpB, 0.1);
    f.cuff.quaternion.copy(f.m.quaternion);
  });

  // camera: gentle sway, dolly in on the crack
  S.zoom = Math.max(0, S.zoom - rdt*0.6);         // ~0.5 s fully in (the x-ray story), then eases out
  // eased toward, not snapped: the dolly takes ~0.3 s, so the turn of the head is seen on the way in
  // only a slight push while the head turns (face and neck stay in frame), the full dolly once the x-ray opens
  const zt = S.xrayIn > 0 ? 0.12 : ease(clamp(S.zoom*1.4, 0, 1));
  zs += (zt - zs)*(1 - Math.exp(-rdt*7));
  const z = zs;
  pivot.localToWorld(neckW.set(0, 0, -0.03));
  camPos.copy(camBase);
  if(!reduce){ camPos.x += Math.sin(now*0.0004)*0.012; camPos.y += Math.sin(now*0.00053)*0.008; }
  // orbit a little to the stuck side so the x-ray reads in depth (bodies, arches, cord between them)
  const orbitX = (target ? -target.side : 1)*0.07;
  camPos.lerp(tmpA.copy(neckW).add(tmpB.set(orbitX, 0.26, -0.12)), z*0.9);
  camTgt.copy(camLook).lerp(neckW, z*0.92);
  camera.position.copy(camPos);
  if(!reduce && S.shake > 0){
    camera.position.x += (Math.random()-0.5)*0.03*S.shake;
    camera.position.y += (Math.random()-0.5)*0.03*S.shake;
  }
  camera.lookAt(camTgt);
  camera.updateMatrixWorld();

  projectHead();
  elBubble.style.left = headScreen.x + "px";
  elBubble.style.top = (headScreen.y - headScreen.r*2.0 - 34) + "px";

  if(!$("#tune").hidden){
    elPeak.textContent = Math.round(S.peakRate);
    elJpeak.textContent = S.jerkPeak.toFixed(1);
    elSensor.textContent = S.sensorSeen ? `켜짐 · 방향 ${live.sign > 0 ? "+" : live.sign < 0 ? "−" : "?"} (${live.signSrc || "대기"})` : "없음 (드래그 모드)";
    $("#tlr").textContent = Math.round(live.lr);
    $("#tpt").textContent = Math.round(live.pt);
  }

  renderer.render(scene, camera);
  drawRing(now, c, zone, br);
  requestAnimationFrame(frame);
}

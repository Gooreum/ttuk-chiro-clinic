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
  UP, tmpA, tmpB, boneMat, hitMat, discMat, vert, xrayMats, ringMat, waveMat, waveRing, sparks
} from "../scene/patientModel.js";
import { tone, vib } from "../audio/audio.js";
import { say, headScreen, projectHead } from "../ui/hud.js";
import { drawRing } from "../ui/ring.js";
import { live, aimHist } from "../input/motion.js";

/* Frame loop: slow motion (slow), dolly zoom (zoom), x-ray (xray/align), face, camera. */
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const elAdj = $("#adjust"), elPeak = $("#peak"), elJpeak = $("#jpeak"), elSensor = $("#sensor"), elBubble = $("#bubble");
let last = performance.now(), blinkAt = 0;
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
  lids.forEach(l => { l.visible = !eyesOpenNow || blinking; const sq = f === "ouch" ? 1.7 : 1; l.scale.x += (sq - l.scale.x)*k; });
  eyesOpen.forEach(e => { e.visible = eyesOpenNow && !blinking; });
  const browAng = f === "worried" || f === "tense" ? -0.38 : f === "ouch" ? 0.42 : f === "relief" ? -0.12 : 0;
  const browZ = f === "relief" ? -0.058 : f === "ouch" ? -0.047 : -0.052;
  brows.forEach((b, i) => { const s = i ? 1 : -1; b.rotation.y += (browAng*s - b.rotation.y)*k; b.position.z += (browZ - b.position.z)*k; });
  mouthFlat.visible = f === "rest" || f === "worried" || f === "tense";
  mouthFlat.scale.y = f === "tense" ? 0.7 : 1;
  mouthSmile.visible = f === "relief";
  mouthO.visible = f === "ouch";

  // x-ray: skin goes see-through, the stuck pair slides back into line
  if(S.xrayHold > 0){ S.xrayHold -= rdt; S.xray = Math.min(1, S.xray + rdt*5); } else S.xray = Math.max(0, S.xray - rdt*2.5);
  const xray = S.xray;
  if(xray > 0.001 && target){
    S.align = Math.min(1, S.align + dt*3.2);
    const align = S.align;
    const n = target.seg;
    vert.forEach((v, i) => {
      v.g.visible = true;
      const hit = i+1 === n || i+1 === n+1;
      v.parts.forEach(p => p.material = hit ? hitMat : boneMat);
      const off = i+1 === n ? (1 - ease(align)) : 0;
      v.g.position.x = 0.007*off*target.side;
      v.g.rotation.z = 0.18*off*target.side;
    });
    boneMat.opacity = xray*0.95; hitMat.opacity = xray; discMat.opacity = xray*0.6;
    hitMat.emissive.setHex(align > 0.95 ? 0x8adfbf : 0xff7a59); hitMat.color.setHex(align > 0.95 ? 0x8adfbf : 0xff7a59);
    xrayMats.forEach(m => { if(!m.transparent){ m.transparent = true; m.needsUpdate = true; } m.opacity = 1 - 0.78*xray; m.depthWrite = xray < 0.5; });
  }else{
    vert.forEach(v => v.g.visible = false);
    xrayMats.forEach(m => { if(m.transparent){ m.transparent = false; m.opacity = 1; m.depthWrite = true; m.needsUpdate = true; } });
  }

  // release wave + sparks
  if(S.wave > 0){
    S.wave = Math.max(0, S.wave - dt*1.6);
    const s = 1 + (1 - S.wave)*3.2;
    waveRing.scale.set(s, s, s); waveMat.opacity = S.wave*0.8;
    waveRing.position.set(0, 0, -0.118 + (target ? target.seg : 4)*0.0335);
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
  S.zoom = Math.max(0, S.zoom - rdt*0.9);
  const z = ease(clamp(S.zoom*1.4, 0, 1));
  pivot.localToWorld(neckW.set(0, 0.02, -0.08));
  camPos.copy(camBase);
  if(!reduce){ camPos.x += Math.sin(now*0.0004)*0.012; camPos.y += Math.sin(now*0.00053)*0.008; }
  camPos.lerp(tmpA.copy(neckW).add(tmpB.set(0, 0.42, -0.36)), z*0.5);
  camTgt.copy(camLook).lerp(neckW, z*0.65);
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
    elSensor.textContent = S.sensorSeen ? "켜짐" : "없음 (드래그 모드)";
    $("#tlr").textContent = Math.round(live.lr);
    $("#tpt").textContent = Math.round(live.pt);
  }

  renderer.render(scene, camera);
  drawRing(now, c, zone, br);
  requestAnimationFrame(frame);
}

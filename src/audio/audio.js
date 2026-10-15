import { T } from "../tuning.js";
import { S } from "../game/state.js";
import { crackPattern } from "../core/crackPattern.js";

/* WebAudio synthesis only (no sample files): 3-layer crack, chime, tick, siren, room tone. */
let ac = null, noiseBuf = null, master = null, ambGain = null;
/* stale: the page was hidden. iOS Safari leaves the context "interrupted" (not "suspended") after a trip to
   another app, and sometimes "running" but silent, so the first tap after coming back rebuilds it. */
let stale = false;
export function ensureAudio(){
  try{
    if(!ac){
      ac = new (window.AudioContext || window.webkitAudioContext)();
      ac.onstatechange = () => { if(ac && ac.state === "interrupted") stale = true; };
      master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate*0.08), ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for(let i=0;i<d.length;i++) d[i] = (Math.random()*2-1) * Math.pow(1 - i/d.length, 6);
      // room tone: soft filtered noise loop + a faint low hum
      const len = ac.sampleRate*2, nb = ac.createBuffer(1, len, ac.sampleRate), nd = nb.getChannelData(0);
      let last = 0; for(let i=0;i<len;i++){ last = last*0.985 + (Math.random()*2-1)*0.015; nd[i] = last*6; }
      const src = ac.createBufferSource(); src.buffer = nb; src.loop = true;
      const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 520;
      ambGain = ac.createGain(); ambGain.gain.value = 0;
      src.connect(lp); lp.connect(ambGain); ambGain.connect(master); src.start();
      const hum = ac.createOscillator(); hum.frequency.value = 60; const hg = ac.createGain(); hg.gain.value = 0.006;
      hum.connect(hg); hg.connect(ambGain); hum.start();
    }
    if(ac.state !== "running") ac.resume().catch(() => {});
    setAmbient();
  }catch(e){ ac = null; }
}
function rebuild(){
  const old = ac; ac = null; stale = false;
  try{ old && old.close().catch(() => {}); }catch(e){}
  ensureAudio();
}
// leaving: suspend it ourselves so coming back is a plain resume
function sleep(){ stale = true; try{ ac && ac.state === "running" && ac.suspend().catch(() => {}); }catch(e){} }
// back (no tap yet): try a resume; it may need the tap below on iOS
function wake(){ if(ac && document.visibilityState === "visible" && ac.state !== "running") ac.resume().catch(() => {}); }
// any tap: rebuild a context that went through a hide, or one that still isn't running
function tapWake(){ if(ac && (stale || ac.state !== "running")) rebuild(); }
document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" ? sleep() : wake());
window.addEventListener("pagehide", sleep);
window.addEventListener("pageshow", wake);
for(const ev of ["pointerdown", "touchend", "click", "keydown"]) document.addEventListener(ev, tapWake, true);
export function setAmbient(){ if(ac && ambGain) ambGain.gain.setTargetAtTime(T.sound && S.phase === "play" ? 0.05 : 0, ac.currentTime, 0.4); }
function pop(t, f, vol){
  // transient click
  const src = ac.createBufferSource(); src.buffer = noiseBuf;
  const hp = ac.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 2200;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol*0.7, t+0.001); g.gain.exponentialRampToValueAtTime(0.0001, t+0.025);
  src.connect(hp); hp.connect(g); g.connect(master); src.start(t); src.stop(t+0.05);
  // knuckle body
  const s2 = ac.createBufferSource(); s2.buffer = noiseBuf;
  const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 6;
  bp.frequency.setValueAtTime(f, t); bp.frequency.exponentialRampToValueAtTime(f*0.55, t+0.04);
  const g2 = ac.createGain();
  g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(vol, t+0.002); g2.gain.exponentialRampToValueAtTime(0.0001, t+0.06);
  s2.connect(bp); bp.connect(g2); g2.connect(master); s2.start(t); s2.stop(t+0.08);
  // low thump
  const o = ac.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(65, t+0.06);
  const og = ac.createGain(); og.gain.setValueAtTime(vol*0.6, t); og.gain.exponentialRampToValueAtTime(0.0001, t+0.08);
  o.connect(og); og.connect(master); o.start(t); o.stop(t+0.1);
}
/* n: 3 on a PERFECT (always 우두둑), else 2. The pattern (뚝 / 두둑 / 우두둑) and spacing change every time
   (core/crackPattern.js); each hit is the same pop as before. A click-cluster rewrite of pop sounded less natural
   (user: "원래 소리가 제일 자연스럽다", 2026-10-15), so pop stays. */
export function crackSound(n){
  if(!ac) return;
  let t = ac.currentTime + 0.01;
  for(const h of crackPattern(Math.random, n >= 3).hits){ t += h.dt; pop(t, h.freq, h.gain*0.85); }
}
/* Wrong cracks (core/fail.js kinds). dud: one weak low pop that fizzles out ("뚜…륵?").
   finger: a high, dry double click (the therapist's own knuckle). over: a rubber-band "boing" with a wobble. */
export function fizzle(){
  if(!ac) return;
  const t = ac.currentTime + 0.01;
  pop(t, 520, 0.28);
  tone(260, 110, 0.35, "triangle", 0.05, 0.08);
}
export function knuckle(){
  if(!ac) return;
  const t = ac.currentTime + 0.01;
  pop(t, 2600, 0.7); pop(t + 0.035, 3100, 0.45);
}
export function boing(){
  if(!ac) return;
  const t = ac.currentTime + 0.01, o = ac.createOscillator(), g = ac.createGain();
  const lfo = ac.createOscillator(), lg = ac.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(230, t); o.frequency.exponentialRampToValueAtTime(720, t+0.07); o.frequency.exponentialRampToValueAtTime(170, t+0.55);
  lfo.frequency.value = 18; lg.gain.value = 40; lfo.connect(lg); lg.connect(o.frequency);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t+0.02); g.gain.exponentialRampToValueAtTime(0.0001, t+0.6);
  o.connect(g); g.connect(master); o.start(t); o.stop(t+0.62); lfo.start(t); lfo.stop(t+0.62);
}
/* A hard wrong crack (core/fail.js forceTier): tier 1 "으그적" = four gritty low pops over a dull thud; tier 2
   "아그작" = seven louder ones, a sharp snap at the end, a deeper thud. vol scales the whole (the x-ray replay is softer). */
export function crunch(tier, vol = 1){
  if(!ac) return;
  let t = ac.currentTime + 0.01;
  tone(tier > 1 ? 95 : 120, 38, tier > 1 ? 0.32 : 0.24, "sine", 0.2*vol);
  const n = tier > 1 ? 7 : 4;
  for(let i = 0; i < n; i++){ pop(t, 350 + Math.random()*700*tier, (0.55 + 0.25*tier)*vol*(1 - i*0.06)); t += 0.02 + Math.random()*0.03; }
  if(tier > 1) pop(t + 0.015, 2600, 0.85*vol);
}
/* Ambulance (a crack / break ends the day, game/flow.js hurt): the Korean two-tone "삐-용" (960 Hz held, sliding down to
   700), 0.55 s a cycle, coming in from afar and fading out at the end. A saw + square through a low-pass, a little
   vibrato. stopSiren() cuts it short (a new day). */
let sirenOut = null;
export function siren(dur = 3.4){
  if(!ac) return;
  stopSiren();
  const t = ac.currentTime + 0.02, end = t + dur;
  const out = ac.createGain(); out.connect(master);
  out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.4, t + 0.9);
  out.gain.setValueAtTime(0.4, end - 0.8); out.gain.exponentialRampToValueAtTime(0.0001, end);
  const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2400; lp.connect(out);
  const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 6; lg.gain.value = 7; lfo.connect(lg);
  for(const [type, v] of [["sawtooth", 0.5], ["square", 0.3]]){
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; g.gain.value = v;
    for(let c = t; c < end; c += 0.55){
      o.frequency.setValueAtTime(960, c);
      o.frequency.setValueAtTime(960, c + 0.26);
      o.frequency.exponentialRampToValueAtTime(700, c + 0.48);
    }
    lg.connect(o.frequency); o.connect(g); g.connect(lp); o.start(t); o.stop(end + 0.05);
  }
  lfo.start(t); lfo.stop(end + 0.05);
  sirenOut = out;
}
export function stopSiren(){
  if(!ac || !sirenOut) return;
  try{ sirenOut.gain.cancelScheduledValues(ac.currentTime); sirenOut.gain.setTargetAtTime(0, ac.currentTime, 0.08); }catch(e){}
  sirenOut = null;
}
export function tone(f1, f2, dur, type, vol, delay=0){
  if(!ac) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t+dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t+0.01); g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t+dur+0.02);
}
export const chime = big => { tone(1046, 1046, 0.5, "sine", 0.06, 0.25); tone(1318, 1318, 0.6, "sine", 0.05, 0.36); if(big) tone(1568, 1568, 0.8, "sine", 0.05, 0.48); };
export const vib = p => { try{ navigator.vibrate && navigator.vibrate(p); }catch(e){} };

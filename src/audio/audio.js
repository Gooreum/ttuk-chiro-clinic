import { T } from "../tuning.js";
import { S } from "../game/state.js";
import { crackPattern, crunchPattern } from "../core/crackPattern.js";

/* WebAudio synthesis only (no sample files): bone cracks, chime, tick, siren, room tone. */
let ac = null, master = null, ambGain = null, grains = [], thudBuf = null, roomIn = null;
/* stale: the page was hidden. iOS Safari leaves the context "interrupted" (not "suspended") after a trip to
   another app, and sometimes "running" but silent, so the first tap after coming back rebuilds it. */
let stale = false;
export function ensureAudio(){
  try{
    if(!ac){
      ac = new (window.AudioContext || window.webkitAudioContext)();
      ac.onstatechange = () => { if(ac && ac.state === "interrupted") stale = true; };
      master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
      // crack grains: six different noise bursts, each its own decay and grit (sparse spikes), picked at random per click
      grains = [];
      for(let k=0;k<6;k++){
        const b = ac.createBuffer(1, Math.floor(ac.sampleRate*0.03), ac.sampleRate), g = b.getChannelData(0), ex = 3 + k*1.2;
        for(let i=0;i<g.length;i++) g[i] = ((Math.random()*2-1) + (Math.random() < 0.04 ? (Math.random()*2-1)*3 : 0)) * Math.pow(1 - i/g.length, ex);
        grains.push(b);
      }
      thudBuf = ac.createBuffer(1, Math.floor(ac.sampleRate*0.3), ac.sampleRate);
      { const t = thudBuf.getChannelData(0); for(let i=0;i<t.length;i++) t[i] = (Math.random()*2-1) * Math.pow(1 - i/t.length, 3); }
      // a short wet early reflection (two taps, 13 / 21 ms) so a crack isn't bone-dry and synthetic
      roomIn = ac.createGain(); roomIn.gain.value = 0.16;
      for(const [dl, gv] of [[0.013, 1], [0.021, 0.6]]){ const dn = ac.createDelay(0.05); dn.delayTime.value = dl; const lp2 = ac.createBiquadFilter(); lp2.type = "lowpass"; lp2.frequency.value = 3000; const g2 = ac.createGain(); g2.gain.value = gv; roomIn.connect(dn); dn.connect(lp2); lp2.connect(g2); g2.connect(master); }
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
/* One bone crack at t (user: "너무 기계음 같아", 2026-10-15). Was one fixed noise burst through a Q 6 band-pass (a
   pitched "beep") over a sine sweep (a synth "boop"). Now: a cluster of 2-5 tiny clicks 1-6 ms apart, each from a
   random grain through a wide band (Q 0.7-1.5) so nothing rings at a pitch, over a low-passed noise knock, with a
   faint early reflection. f: the clicks' centre (Hz), vol: 0..1. */
function bone(t, f, vol){
  const out = ac.createGain(); out.gain.value = 1; out.connect(master); out.connect(roomIn);
  const n = 2 + Math.floor(Math.random()*4);
  let ct = t;
  for(let i=0;i<n;i++){
    const src = ac.createBufferSource(); src.buffer = grains[Math.floor(Math.random()*grains.length)];
    src.playbackRate.value = 0.8 + Math.random()*0.5;
    const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 0.7 + Math.random()*0.8;
    bp.frequency.value = f*(0.7 + Math.random()*0.7);
    const g = ac.createGain(), a = vol*(i ? 0.35 + Math.random()*0.5 : 1)*1.3, dur = 0.008 + Math.random()*0.014;
    g.gain.setValueAtTime(0.0001, ct); g.gain.exponentialRampToValueAtTime(a, ct + 0.0005); g.gain.exponentialRampToValueAtTime(0.0001, ct + dur);
    src.connect(bp); bp.connect(g); g.connect(out); src.start(ct); src.stop(ct + 0.035);
    ct += 0.001 + Math.random()*0.005;
  }
  // knock: low-passed noise, not a sine
  const k = ac.createBufferSource(); k.buffer = thudBuf; k.playbackRate.value = 0.9 + Math.random()*0.3;
  const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 180 + Math.random()*240; lp.Q.value = 0.9;
  const kg = ac.createGain(), kd = 0.04 + Math.random()*0.03;
  kg.gain.setValueAtTime(0.0001, t); kg.gain.exponentialRampToValueAtTime(vol*1.6, t + 0.002); kg.gain.exponentialRampToValueAtTime(0.0001, t + kd);
  k.connect(lp); lp.connect(kg); kg.connect(out); k.start(t); k.stop(t + kd + 0.02);
}
function playHits(hits, vol = 1, pitch = 1){
  let t = ac.currentTime + 0.01;
  for(const h of hits){ t += h.dt; bone(t, h.freq*pitch, h.gain*vol); }
  return t;
}
/* n: 3 on a PERFECT (only the three-plus patterns), else 2. A different pattern and jitter every time (core/crackPattern.js). */
export function crackSound(n){
  if(!ac) return;
  playHits(crackPattern(Math.random, n >= 3).hits, 0.9);
}
/* Wrong cracks (core/fail.js kinds). dud: one weak low pop that fizzles out ("뚜…륵?").
   finger: a high, dry double click (the therapist's own knuckle). over: a rubber-band "boing" with a wobble. */
export function fizzle(){
  if(!ac) return;
  const t = ac.currentTime + 0.01;
  bone(t, 520, 0.28);
  tone(260, 110, 0.35, "triangle", 0.05, 0.08);
}
export function knuckle(){
  if(!ac) return;
  const t = ac.currentTime + 0.01;
  bone(t, 2600, 0.7); bone(t + 0.035, 3100, 0.45);
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
/* A hard wrong crack (core/fail.js forceTier): tier 1 "으그적" = a grinding run of 10-12 low bone clicks over a dull
   knock; tier 2 "아그작" = 14-16 louder ones ending on a sharp snap, a deeper knock. Pitched down (0.6) from a joint
   crack. vol scales the whole (the x-ray replay is softer). */
export function crunch(tier, vol = 1){
  if(!ac) return;
  const t = ac.currentTime + 0.01;
  const k = ac.createBufferSource(); k.buffer = thudBuf; k.playbackRate.value = tier > 1 ? 0.6 : 0.75;
  const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = tier > 1 ? 140 : 190;
  const kg = ac.createGain(), kd = tier > 1 ? 0.32 : 0.24;
  kg.gain.setValueAtTime(0.0001, t); kg.gain.exponentialRampToValueAtTime(0.9*vol, t + 0.004); kg.gain.exponentialRampToValueAtTime(0.0001, t + kd);
  k.connect(lp); lp.connect(kg); kg.connect(master); k.start(t); k.stop(t + kd + 0.02);
  playHits(crunchPattern(Math.random, tier).hits, vol, 0.6);
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
  out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.24, t + 0.9);
  out.gain.setValueAtTime(0.24, end - 0.8); out.gain.exponentialRampToValueAtTime(0.0001, end);
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

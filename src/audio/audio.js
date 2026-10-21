import { T } from "../tuning.js";
import { S } from "../game/state.js";
import { crackPattern } from "../core/crackPattern.js";
import { zzfxSamples } from "./zzfx.js";

/* Bone sounds are recorded samples the user picked (public/audio, CREDITS.md; 2026-10-15). The synth pop stays as the
   fallback until they decode. Chime, tick, siren, boing, knuckle and the room tone are synthesis (the comic ones are
   ZzFX, ./zzfx.js); the background music is public/audio/bgm.m4a, a chiptune rendered from a score
   (scripts/audio/bgm.py, 2026-10-21). */
let ac = null, noiseBuf = null, master = null, ambGain = null;
const AUDIO = import.meta.env.BASE_URL + "audio/";
const SAMPLES = { crack: "crack.wav", crackHard: "crack-hard.wav", break: "break.wav" };
const sbuf = {};                                       // decoded AudioBuffers, kept across a context rebuild
function loadSamples(){
  for(const [k, f] of Object.entries(SAMPLES)) if(!sbuf[k])
    fetch(AUDIO + f).then(r => r.arrayBuffer()).then(a => new Promise((ok, no) => ac.decodeAudioData(a, ok, no))).then(b => { sbuf[k] = b; }).catch(() => {});
}
// false when not decoded yet: the caller plays the synth instead
function sample(key, vol, rate = 1, delay = 0){
  if(!sbuf[key]) return false;
  const s = ac.createBufferSource(), g = ac.createGain();
  s.buffer = sbuf[key]; s.playbackRate.value = rate; g.gain.value = vol;
  s.connect(g); g.connect(master); s.start(ac.currentTime + 0.005 + delay);
  return true;
}
/* ZzFX sounds (./zzfx.js parameter lists, randomness 0 so a list builds once and is cached). rate: playback rate
   (pitch), delay: seconds. */
const zzBuf = new Map();
function zz(params, vol = 1, delay = 0, rate = 1){
  if(!ac) return;
  const key = params.join();
  let b = zzBuf.get(key);
  if(!b){ const d = zzfxSamples(ac.sampleRate, params); b = ac.createBuffer(1, d.length, ac.sampleRate); b.getChannelData(0).set(d); zzBuf.set(key, b); }
  const s = ac.createBufferSource(), g = ac.createGain();
  s.buffer = b; s.playbackRate.value = rate; g.gain.value = vol;
  s.connect(g); g.connect(master); s.start(ac.currentTime + 0.005 + delay);
}
/* Background music: streamed through an <audio> element (a 3-minute track decoded whole would be tens of MB on a
   phone) into a gain node (iOS ignores audio.volume). An element binds to one context for good, so a rebuilt context
   gets a new element that picks up where the old one was. */
let music = null, musicGain = null, musicAt = 0;
const MUSIC_PLAY = 0.22, MUSIC_REST = 0.14, MUSIC_DUCK = 0.06;
function ensureMusic(){
  if(music || !ac) return;
  try{
    music = new Audio(AUDIO + "bgm.m4a"); music.loop = true; music.preload = "auto";
    if(musicAt) music.currentTime = musicAt;
    musicGain = ac.createGain(); musicGain.gain.value = 0;
    ac.createMediaElementSource(music).connect(musicGain); musicGain.connect(master);
  }catch(e){ music = null; musicGain = null; }
}
const wantMusic = () => T.music && document.visibilityState === "visible";   // its own switch (T.sound is the room tone)
function playMusic(){ if(music && music.paused && wantMusic()) music.play().catch(() => {}); }
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
      loadSamples(); ensureMusic();
    }
    if(ac.state !== "running") ac.resume().catch(() => {});
    setAmbient();
  }catch(e){ ac = null; }
}
function rebuild(){
  const old = ac; ac = null; stale = false;
  if(music){ musicAt = music.currentTime || 0; music.pause(); music = null; musicGain = null; }
  try{ old && old.close().catch(() => {}); }catch(e){}
  ensureAudio();
}
// leaving: suspend it ourselves so coming back is a plain resume
function sleep(){ stale = true; if(music) music.pause(); try{ ac && ac.state === "running" && ac.suspend().catch(() => {}); }catch(e){} }
// back (no tap yet): try a resume; it may need the tap below on iOS
function wake(){ if(ac && document.visibilityState === "visible"){ if(ac.state !== "running") ac.resume().catch(() => {}); playMusic(); } }
// any tap: rebuild a context that went through a hide, or one that still isn't running
// (and retry the music: iOS may refuse play() outside some of these events)
function tapWake(){ if(ac && (stale || ac.state !== "running")) rebuild(); playMusic(); }
document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" ? sleep() : wake());
window.addEventListener("pagehide", sleep);
window.addEventListener("pageshow", wake);
for(const ev of ["pointerdown", "touchend", "click", "keydown"]) document.addEventListener(ev, tapWake, true);
export function setAmbient(){
  if(!ac) return;
  if(ambGain) ambGain.gain.setTargetAtTime(T.sound && S.phase === "play" ? 0.05 : 0, ac.currentTime, 0.4);
  if(musicGain) musicGain.gain.setTargetAtTime(T.music ? (S.phase === "play" ? MUSIC_PLAY : MUSIC_REST) : 0, ac.currentTime, 0.6);
  if(music && !T.music) music.pause(); else playMusic();
}
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
/* The main crack is "Breaking Bones" (user's pick, 2026-10-15), its pitch shaken ±8% each time; a PERFECT is a touch
   lower and louder with the small neck crack as a tail 0.09 s on. Before the samples decode: the synth pattern below. */
export function crackSound(n){
  if(!ac) return;
  const perfect = n >= 3;
  if(sample("crackHard", perfect ? 1 : 0.9, (perfect ? 0.94 : 1)*(0.92 + Math.random()*0.16))){
    if(perfect) sample("crack", 0.4, 1.05 + Math.random()*0.1, 0.09);
    return;
  }
  let t = ac.currentTime + 0.01;
  for(const h of crackPattern(Math.random, n >= 3).hits){ t += h.dt; pop(t, h.freq, h.gain*0.85); }
}
/* Wrong cracks (core/fail.js kinds). dud: one weak low pop that deflates with a "뿌우우" wah-wah (ZzFX saw, falling,
   tremolo). finger: a high, dry double click (the therapist's own knuckle) and a cartoon "틱" blip. over: a rubber-band
   "boing" with a wobble and a ZzFX spring "보잉잉잉" (the pitch resets every 70 ms). */
const ZZ_DEFLATE = [1, 0, 330, .01, .18, .3, 2, 1, -.5, 0, 0, 0, .09, 0, 0, 0, 0, 1, 0, .5, 1200];
const ZZ_BLIP = [1, 0, 2400, 0, 0, .04, 0, 1, -20];
const ZZ_SPRING = [1, 0, 220, .01, .22, .3, 1, 1, 5, 0, 0, 0, .07, 0, 0, 0, 0, 1, 0, .3];
export function fizzle(){
  if(!ac) return;
  const t = ac.currentTime + 0.01;
  pop(t, 520, 0.28);
  zz(ZZ_DEFLATE, 0.06, 0.08);
}
export function knuckle(){
  if(!ac) return;
  const t = ac.currentTime + 0.01;
  pop(t, 2600, 0.7); pop(t + 0.035, 3100, 0.45);
  zz(ZZ_BLIP, 0.08, 0.005);
}
export function boing(){
  if(!ac) return;
  zz(ZZ_SPRING, 0.07, 0.04);
  const t = ac.currentTime + 0.01, o = ac.createOscillator(), g = ac.createGain();
  const lfo = ac.createOscillator(), lg = ac.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(230, t); o.frequency.exponentialRampToValueAtTime(720, t+0.07); o.frequency.exponentialRampToValueAtTime(170, t+0.55);
  lfo.frequency.value = 18; lg.gain.value = 40; lfo.connect(lg); lg.connect(o.frequency);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t+0.02); g.gain.exponentialRampToValueAtTime(0.0001, t+0.6);
  o.connect(g); g.connect(master); o.start(t); o.stop(t+0.62); lfo.start(t); lfo.stop(t+0.62);
}
/* Towel traction (core/towel.js). stretchSound: a soft rising, wobbly "쭈우욱" as the neck shoots out with a slide
   whistle on top (ZzFX, 140 -> 670 Hz; the snap back is the recorded bone crack, crackSound); whoosh: the towel slipping
   off ("쏙"). */
const ZZ_WHISTLE = [1, 0, 140, .04, .45, .2, 0, 1, 1.7];
export function stretchSound(){
  if(!ac) return;
  zz(ZZ_WHISTLE, 0.045);
  const t = ac.currentTime + 0.01, o = ac.createOscillator(), g = ac.createGain();
  const lfo = ac.createOscillator(), lg = ac.createGain();
  o.type = "triangle";
  o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(560, t+0.55);
  lfo.frequency.value = 11; lg.gain.value = 25; lfo.connect(lg); lg.connect(o.frequency);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.02, t+0.05); g.gain.exponentialRampToValueAtTime(0.0001, t+0.7);
  o.connect(g); g.connect(master); o.start(t); o.stop(t+0.72); lfo.start(t); lfo.stop(t+0.72);
}
/* The therapist landing flat on his back with his stool (towel over-pull, game/flow.js): a deep body thump, a dull
   knock of the stool's base a beat later, a little rattle of the casters. */
const ZZ_THUMP = [1, 0, 80, 0, .05, .35, 1, 1, -1.5, 0, 0, 0, 0, .3, 0, 0, 0, 1, 0, 0, 500];
export function thud(){
  if(!ac) return;
  zz(ZZ_THUMP, 0.35);
  tone(110, 38, 0.38, "sine", 0.22);
  tone(70, 30, 0.5, "triangle", 0.12, 0.01);
  const t = ac.currentTime + 0.01;
  pop(t + 0.09, 260, 0.5); pop(t + 0.16, 900, 0.25); pop(t + 0.2, 1400, 0.18);
}
const ZZ_SWISH = [1, 0, 900, .05, .08, .22, 0, 1, -4, 0, 0, 0, 0, 3, 0, 0, 0, 1, 0, 0, 1200];
export function whoosh(){
  if(!ac) return;
  if(S.game !== "towel"){
    tone(900, 120, 0.35, "triangle", 0.05);
    zz(ZZ_SWISH, 0.12, 0.02);
    return;
  }
  const t=ac.currentTime+0.01, duration=0.48;
  const buffer=ac.createBuffer(1,Math.ceil(ac.sampleRate*duration),ac.sampleRate), data=buffer.getChannelData(0);
  // Local noise seed: sound detail must not consume the next patient's target / reaction draws.
  let seed=0x74746b;
  for(let i=0;i<data.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;data[i]=(seed>>>0)/2147483648-1;}
  const src=ac.createBufferSource(), band=ac.createBiquadFilter(), low=ac.createBiquadFilter(), gain=ac.createGain();
  src.buffer=buffer;band.type="bandpass";band.Q.value=0.7;low.type="lowpass";low.Q.value=0.35;
  band.frequency.setValueAtTime(850,t);band.frequency.exponentialRampToValueAtTime(4200,t+0.08);band.frequency.exponentialRampToValueAtTime(240,t+duration);
  low.frequency.setValueAtTime(6500,t);low.frequency.exponentialRampToValueAtTime(700,t+duration);
  gain.gain.setValueAtTime(0.0001,t);gain.gain.exponentialRampToValueAtTime(0.24,t+0.065);gain.gain.exponentialRampToValueAtTime(0.06,t+0.20);gain.gain.exponentialRampToValueAtTime(0.0001,t+duration);
  src.connect(band);band.connect(low);low.connect(gain);gain.connect(master);src.start(t);src.stop(t+duration);
  src.onended=()=>{src.disconnect();band.disconnect();low.disconnect();gain.disconnect();};
}
/* A hard wrong crack (core/fail.js forceTier): tier 1 "으그적" = four gritty low pops over a dull thud; tier 2
   "아그작" = seven louder ones, a sharp snap at the end, a deeper thud. vol scales the whole (the x-ray replay is softer). */
export function crunch(tier, vol = 1){
  if(!ac) return;
  // recorded (synth below until decoded): a crack is the neck break pitched up and softer; a break is it at pitch with
  // the main crack stacked on for more splinter
  if(tier > 1){ if(sample("break", vol, 0.95 + Math.random()*0.1)){ sample("crackHard", vol*0.8, 0.85); return; } }
  else if(sample("break", vol*0.8, 1.1 + Math.random()*0.1)) return;
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
  if(musicGain && T.music) musicGain.gain.setTargetAtTime(MUSIC_DUCK, ac.currentTime, 0.3);   // the day log's setAmbient brings it back
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
/* Success jingle "띠-링(-링)": C6 E6 (G6, C7 on a PERFECT) triangle blips with a short echo (ZzFX), from 0.25 s. */
const zzBell = f => [1, 0, f, .005, .05, .35, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, .07];
export const chime = big => {
  zz(zzBell(1046), 0.1, 0.25); zz(zzBell(1318), 0.09, 0.36);
  if(big){ zz(zzBell(1568), 0.09, 0.47); zz(zzBell(2093), 0.07, 0.58); }
};
// true if the browser took the pattern (false: no API, blocked, an in-app browser). Pulses under ~30ms barely register
// on many Android motors (user: "우두둑 할땐 안옴", 2026-10-15)
export const vib = p => { try{ return !!(navigator.vibrate && navigator.vibrate(p)); }catch(e){ return false; } };

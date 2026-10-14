import { T } from "../tuning.js";
import { S } from "../game/state.js";

/* WebAudio synthesis only (no sample files): 3-layer crack, chime, tick, room tone. */
let ac = null, noiseBuf = null, master = null, ambGain = null;
export function ensureAudio(){
  try{
    if(!ac){
      ac = new (window.AudioContext || window.webkitAudioContext)();
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
    if(ac.state === "suspended") ac.resume();
    setAmbient();
  }catch(e){ ac = null; }
}
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
export function crackSound(n){
  if(!ac) return;
  let t = ac.currentTime + 0.01;
  for(let i=0;i<n;i++){ pop(t, 900 + Math.random()*1400, 0.85 - i*0.12); t += 0.045 + Math.random()*0.05; }
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

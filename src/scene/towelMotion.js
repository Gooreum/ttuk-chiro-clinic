// Presentation curves only. Judging and the game's tug / hold timers live in core/towel.js.
const smooth = x => { x = Math.max(0, Math.min(1, x)); return x*x*(3 - 2*x); };
export function slipPose(t){
  if(t < 0 || t >= 1.3) return {clear: 0, out: 0, hand: 0};
  const release = 1 - smooth((t - 0.65)/0.65);
  const out = smooth((t - 0.08)/0.24)*(1 - smooth((t - 0.65)/0.48));
  return {
    clear: smooth(t/0.10)*release,
    out,
    hand: out
  };
}

export function tractionPose(x, back){
  const open = smooth((x - 0.6)/0.5);
  const settle = back < 0 ? 0 : smooth(back);
  return {open, settle, height: (0.55 + 0.75*open)*(1 - settle) + settle};
}

// Advance only after a frame was presented. A first-use compile cannot consume the red phase.
export class PresentedClock {
  constructor(){ this.reset(); }
  reset(){ this.time = 0; this.presented = null; }
  read(){ return this.time; }
  present(now){
    if(this.presented !== null) this.time += Math.max(0, Math.min(0.05, (now - this.presented)/1000));
    this.presented = now;
  }
}

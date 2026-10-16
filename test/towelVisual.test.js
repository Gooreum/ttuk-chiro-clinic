import {describe,it,expect} from 'vitest';
import {slipPose,tractionPose,PresentedClock} from '../src/scene/towelMotion.js';

describe('towel presentation',()=>{
  it('clears the occiput before withdrawing, hangs, and is wrapped again by 1.3 seconds',()=>{
    expect(slipPose(-1)).toEqual({clear:0,out:0,hand:0});
    expect(slipPose(0.08).clear).toBeGreaterThan(0.8);
    expect(slipPose(0.08).out).toBe(0);
    expect(slipPose(0.4)).toEqual({clear:1,out:1,hand:1});
    expect(slipPose(1.3)).toEqual({clear:0,out:0,hand:0});
    for(let t=0;t<1.3;t+=0.01){const p=slipPose(t);expect(p.out).toBeLessThanOrEqual(p.clear+1e-10);}
  });
  it('keeps the disc red and squashed for 0.6 s, opens before the 2.7 s neck return, and settles with it',()=>{
    expect(tractionPose(0.59,-1)).toEqual({open:0,settle:0,height:0.55});
    expect(tractionPose(1.1,-1).open).toBe(1);
    expect(tractionPose(1.1,-1).height).toBe(1.3);
    expect(tractionPose(2.1,1).height).toBe(1);
    let previous=1.3;
    for(let back=0;back<=1;back+=0.01){const h=tractionPose(1.1+back,back).height;expect(h).toBeLessThanOrEqual(previous+1e-10);previous=h;}
  });
  it('a stalled first compile or missing model never consumes the red interval',()=>{
    const clock=new PresentedClock();
    expect(clock.read(1000)).toBe(0);
    expect(clock.read(5000)).toBe(0);
    clock.present(5000);
    expect(clock.read(5016)).toBe(0);
    clock.present(5016);
    expect(clock.read()).toBeCloseTo(0.016);
    clock.present(8016);
    expect(clock.read()).toBeCloseTo(0.066);
    clock.reset();expect(clock.read(9000)).toBe(0);
  });
  it('counts presentation intervals without subtracting each frame’s render cost',()=>{
    const clock=new PresentedClock();
    clock.present(1000);
    for(let i=1;i<=36;i++){
      // RAF begins 8 ms before the draw finishes. Reading it must not lose 8 ms every frame.
      clock.read(1000+i*1000/60-8);
      clock.present(1000+i*1000/60);
    }
    expect(clock.read()).toBeCloseTo(0.6);
  });
});

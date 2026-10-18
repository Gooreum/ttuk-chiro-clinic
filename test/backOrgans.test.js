import {describe,it,expect} from 'vitest';
import {ORGANS,organsAt,organHit,organLabel,organTagName,subject} from '../src/back/organs.js';
import {TARGETS,POSITION_TOL,makeSideTargets,pressedSide,judgeAim,judgePress} from '../src/back/core.js';

describe('back organ map',()=>{
  it('puts lungs and heart high, liver/spleen/stomach mid, kidneys low',()=>{
    expect(organsAt(.3)).toEqual(expect.arrayContaining(['lungL','lungR','heart']));
    expect(organsAt(.6)).toEqual(expect.arrayContaining(['liver','spleen','stomach']));
    expect(organsAt(.8)).toEqual(expect.arrayContaining(['kidneyL','kidneyR']));
    expect(organsAt(.95)).toEqual(['bowel']);
  });
  it('covers the whole back with at least one organ',()=>{
    for(let p=0;p<=1;p+=.01)expect(organsAt(p).length).toBeGreaterThan(0);
    expect(new Set(ORGANS.map(o=>o.id)).size).toBe(9);
  });
  it('ruptures only on an overload that missed the ring',()=>{
    expect(organHit({height:TARGETS[0]},0,2)).toEqual([]);
    expect(organHit({height:TARGETS[0]+.25},0,0)).toEqual([]);
    expect(organHit({height:NaN},0,2)).toEqual([]);
    expect(organHit({height:TARGETS[0]+.25},0,1).length).toBeGreaterThan(0);
  });
  it('bursts the heart again once the height is aimed by hand (user 2026-10-18 "심장은 왜 빠짐?")',()=>{
    expect(organHit({height:.35},0,2,[.18,.5,.82])).toEqual(expect.arrayContaining(['heart','lungL','lungR']));
  });
  it('bursts only the side the hands slid to after the height lock (user 2026-10-18)',()=>{
    expect(organsAt(.6,'R')).toContain('liver');
    expect(organsAt(.6,'R')).not.toEqual(expect.arrayContaining(['spleen']));
    expect(organsAt(.6,'R')).not.toContain('stomach');
    expect(organsAt(.6,'L')).toEqual(expect.arrayContaining(['spleen','stomach']));
    expect(organsAt(.6,'L')).not.toContain('liver');
    expect(organsAt(.82,'L')).toEqual(['kidneyL','bowel']);
    const H=[.18,.5,.82],X=[.5,.5,.5];
    const right=organHit({height:.5,side:.85,locked:true},1,2,H,X),left=organHit({height:.5,side:.15,locked:true},1,2,H,X);
    expect(right).toEqual(expect.arrayContaining(['lungR','liver']));
    expect(right.every(id=>['R','C'].includes(ORGANS.find(o=>o.id===id).side))).toBe(true);
    expect(left).toEqual(expect.arrayContaining(['lungL','spleen','stomach']));
    expect(left.every(id=>['L','C'].includes(ORGANS.find(o=>o.id===id).side))).toBe(true);
    expect(organHit({height:.5,side:.55,locked:true},1,2,H,X)).toEqual([]);
    // Unlocked, the side is ignored; a locked height miss on the spine bursts both sides there.
    expect(organHit({height:.5,side:.95,locked:false},1,2,H,X)).toEqual([]);
    expect(organHit({height:.65,side:.5,locked:true},1,2,H,X)).toEqual(organsAt(.65));
    expect(pressedSide(.51)).toBe('R');expect(pressedSide(.5)).toBe('L');
    for(const r of [0,.5,.999])for(const t of makeSideTargets(()=>r))expect(Math.abs(t-.5)).toBeLessThan(POSITION_TOL);
  });
  it('judges the height first and the side only once locked',()=>{
    const H=[.18,.5,.82],X=[.5,.5,.5];
    for(const h of [.18,.3,.45])expect(judgeAim({height:h},0,.6,1,{heights:H})).toEqual(judgePress(h,0,.6,1,{targets:H}));
    expect(judgeAim({height:.5,side:.85,locked:true},1,.6,1,{heights:H,sides:X}).kind).toBe('miss');
    expect(judgeAim({height:.5,side:.52,locked:true},1,.6,1,{heights:H,sides:X}).kind).toBe('ok');
    expect(judgeAim({height:.8,side:.5,locked:true},1,.6,1,{heights:H,sides:X}).kind).toBe('miss');
    expect(judgeAim({height:.5,side:.85,locked:true},1,.6,5,{heights:H,sides:X})).toMatchObject({kind:'over',tier:2});
  });
  it('labels without repeats and with the right particle',()=>{
    expect(organLabel(['lungL','lungR','heart'])).toBe('폐·심장');
    expect(subject('폐·심장')).toBe('폐·심장이');
    expect(subject('폐')).toBe('폐가');
  });
  it('names each organ for its x-ray tag, sides included',()=>{
    expect(organTagName('lungL')).toBe('왼쪽 폐');
    expect(organTagName('kidneyR')).toBe('오른쪽 신장');
    expect(organTagName('liver')).toBe('간');
    expect(organTagName('heart')).toBe('심장');
    expect(organTagName('nope')).toBe('');
  });
});

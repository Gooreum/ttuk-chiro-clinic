import {describe,it,expect} from 'vitest';
import {sideOrder,canLeave,judgeSide,balance,lumbarAt,makeSideGoals,patientTotal} from '../src/side/core.js';

const goal={height:.78,roll:.6};
const res=(side,kind,roll=.6,pressure=.6,points=80)=>({side,kind,roll,pressure,goalRoll:.6,points});

describe('side-posture lumbar roll (user 2026-10-19 "이거는 좌우 두번해야돼")',()=>{
  it('always does the two opposite sides, symptom side first',()=>{
    expect(sideOrder('L')).toEqual(['L','R']);
    expect(sideOrder('R')).toEqual(['R','L']);
  });
  it('never lets the patient leave after one side or the same side twice',()=>{
    expect(canLeave([])).toBe(false);
    expect(canLeave([res('L','ok')])).toBe(false);
    expect(canLeave([res('L','ok'),res('L','ok')])).toBe(false);
    expect(canLeave([res('L','ok'),res('R','miss')])).toBe(true);
  });
  it('judges the height first and the roll once locked',()=>{
    const ok=judgeSide({height:.78,side:.6,locked:true},.6,1,goal);
    expect(ok.kind).toBe('ok');expect(ok.points).toBeGreaterThan(0);
    expect(judgeSide({height:.78,side:.95,locked:false},.6,1,goal).kind).toBe('ok');
    expect(judgeSide({height:.78,side:.95,locked:true},.6,1,goal).kind).toBe('miss');
    expect(judgeSide({height:.3,side:.6,locked:true},.6,1,goal).kind).toBe('miss');
    expect(judgeSide({height:.78,side:.6,locked:true},.6,5,goal)).toMatchObject({kind:'over',tier:2});
  });
  it('rewards a symmetric pair and punishes a twisted one',()=>{
    expect(balance([res('L','ok'),res('R','ok',.62,.62)])).toEqual({bonus:30,label:'좌우 대칭 완성'});
    expect(balance([res('L','over'),res('R','weak')]).bonus).toBe(-30);
    expect(balance([res('L','ok',.6,.6),res('R','ok',.9,1)]).bonus).toBe(-30);
    expect(balance([res('L','miss'),res('R','miss')]).bonus).toBe(0);
    expect(balance([res('L','ok')]).bonus).toBe(0);
    expect(patientTotal([res('L','ok'),res('R','ok',.62,.62)])).toBe(190);
    expect(patientTotal([res('L','over',.6,.6,0),res('R','weak',.6,.6,0)])).toBe(0);
  });
  it('names the lumbar level and rolls goals near L4/5',()=>{
    expect(lumbarAt(0)).toBe('L1');expect(lumbarAt(1)).toBe('L5');expect(lumbarAt(.7)).toBe('L4');expect(lumbarAt(NaN)).toBe('L5');
    for(const r of [0,.5,.999])for(const g of makeSideGoals(()=>r)){
      expect(g.height).toBeGreaterThan(.7);expect(g.height).toBeLessThan(.86);
      expect(g.roll).toBeGreaterThan(.5);
    }
  });
});

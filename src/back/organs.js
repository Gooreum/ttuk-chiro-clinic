import {POSITION_TOL,TARGETS} from './core.js';
// Organs under the back by spinal level, seen from above (BodyParts3D anatomy; position 0 = T1, 1 = L5). There is no
// left/right aim, so both sides at the pressed height go together; side only places them on the x-ray.
export const ORGANS=[
  {id:'lungL',name:'폐',side:'L',from:0,to:.56},{id:'lungR',name:'폐',side:'R',from:0,to:.56},
  {id:'heart',name:'심장',side:'L',from:.25,to:.44},
  {id:'liver',name:'간',side:'R',from:.44,to:.75},{id:'spleen',name:'비장',side:'L',from:.5,to:.63},
  {id:'stomach',name:'위',side:'L',from:.5,to:.69},
  {id:'kidneyL',name:'신장',side:'L',from:.69,to:.88},{id:'kidneyR',name:'신장',side:'R',from:.69,to:.88},
  {id:'bowel',name:'장',side:'C',from:.81,to:1},
];
export const organsAt=p=>Number.isFinite(p)?ORGANS.filter(o=>p>=o.from&&p<=o.to).map(o=>o.id):[];
// Only an overload (tier 1-2) that also missed the ring ruptures organs (user, 2026-10-16).
export function organHit(position,step,tier,targets=TARGETS){
  if(!tier||!Number.isFinite(position)||!Number.isInteger(step)||step<0||step>2)return [];
  return Math.abs(position-targets[step])>POSITION_TOL?organsAt(position):[];
}
export const organLabel=ids=>[...new Set(ids.map(id=>ORGANS.find(o=>o.id===id)?.name).filter(Boolean))].join('·');
// Subject particle for the last syllable: 간이 / 폐가.
export const subject=w=>w+(w&&(w.charCodeAt(w.length-1)-0xac00)%28?'이':'가');

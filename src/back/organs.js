import {POSITION_TOL,TARGETS,pressedSide} from './core.js';
import {t} from '../i18n/index.js';
// Organs under the back by spinal level, seen from above (BodyParts3D anatomy; height 0 = T1, 1 = L5). The hands aim
// up/down the spine first and, once the height is locked, left/right: a side miss bursts that side's organs at the
// pressed height (the midline bowel goes either way), a height-only miss bursts both sides there.
export const ORGANS=[
  {id:'lungL',name:'폐',side:'L',from:0,to:.56},{id:'lungR',name:'폐',side:'R',from:0,to:.56},
  {id:'heart',name:'심장',side:'L',from:.25,to:.44},
  {id:'liver',name:'간',side:'R',from:.44,to:.75},{id:'spleen',name:'비장',side:'L',from:.5,to:.63},
  {id:'stomach',name:'위',side:'L',from:.5,to:.69},
  {id:'kidneyL',name:'신장',side:'L',from:.69,to:.88},{id:'kidneyR',name:'신장',side:'R',from:.69,to:.88},
  {id:'bowel',name:'장',side:'C',from:.81,to:1},
];
export const organsAt=(h,side)=>Number.isFinite(h)?ORGANS.filter(o=>h>=o.from&&h<=o.to&&(!side||o.side===side||o.side==='C')).map(o=>o.id):[];
// Only an overload (tier 1-2) that also missed the ring ruptures organs (user, 2026-10-16).
export function organHit({height,side=.5,locked=false},step,tier,heights=TARGETS,sides=[.5,.5,.5],tol=POSITION_TOL){
  if(!tier||!Number.isFinite(height)||!Number.isInteger(step)||step<0||step>2)return [];
  const sideOff=locked&&Math.abs(side-sides[step])>tol;
  return sideOff||Math.abs(height-heights[step])>tol?organsAt(height,sideOff?pressedSide(side):undefined):[];
}
export const organLabel=ids=>[...new Set(ids.map(id=>ORGANS.find(o=>o.id===id)?.name).filter(Boolean))].map(n=>t(n)).join('·');
// X-ray name tag: the two lungs and kidneys are told apart there.
const SIDES={lungL:'왼쪽',lungR:'오른쪽',kidneyL:'왼쪽',kidneyR:'오른쪽'};
export const organTagName=id=>{const o=ORGANS.find(o=>o.id===id);return o?(SIDES[id]?t(SIDES[id])+' ':'')+t(o.name):'';};
// Subject particle for the last syllable: 간이 / 폐가.
export const subject=w=>w+(w&&(w.charCodeAt(w.length-1)-0xac00)%28?'이':'가');

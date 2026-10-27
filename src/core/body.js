/* 체형 (user: "마른사람, 이쁜여자, 근육돼지, 노인, 어린이 등등 캐릭터 유형 좀 다양화 시켜봐 … 유형별로 게이지 난이도
   조정하고", 2026-10-23). The body type follows the body (look.model), so a story guest who borrows a body plays like it.
   Bodies without a type (patient01..05) play as before. Pure: no DOM, no three.
   tol: green zone scale, mag: target turn scale, lim: danger line scale, heavy: added input weight (+ heavier),
   breath: breath period scale. towel (목뽑기): mid shifts the tension band, half scales its width, limit shifts the
   snap point, aim scales the left / right centre width. */
export const BODY_OF = { patient06: "slim", patient07: "beauty", patient08: "bulk", patient09: "granny", patient10: "child", patient11: "beauty", patient12: "bulk", patient13: "granny", patient14: "slim" };
export const BODY = {
  slim:   { label: "마른 체형", desc: "목이 가늘어 잘 돌아가지만 위험선이 가까워요", tol: 1.0, mag: 1.15, lim: 0.85, heavy: -0.1, breath: 1.0, towel: { mid: -0.08, half: 1.0, limit: -0.08, aim: 0.85 } },
  beauty: { label: "관리형", desc: "숨이 짧아서 내쉬는 틈이 빨리 지나가요", tol: 0.9, mag: 1.0, lim: 1.0, heavy: 0, breath: 0.7, towel: { mid: 0, half: 0.85, limit: 0, aim: 0.9 } },
  bulk:   { label: "근육돼지", desc: "목이 두꺼워 묵직해요. 구역은 넓지만 수건은 끝까지 당겨야 해요", tol: 1.25, mag: 0.85, lim: 1.0, heavy: 0.2, breath: 1.25, towel: { mid: 0.16, half: 1.3, limit: 0.06, aim: 1.2 } },
  granny: { label: "할머니", desc: "뼈가 약해요. 구역도 좁고 위험선도 가까워요", tol: 0.85, mag: 0.85, lim: 0.8, heavy: 0, breath: 1.1, towel: { mid: -0.14, half: 0.8, limit: -0.1, aim: 0.9 } },
  child:  { label: "어린이", desc: "가만히 있질 않아요. 구역이 좁고 숨이 빨라요", tol: 0.8, mag: 0.9, lim: 0.85, heavy: -0.15, breath: 0.6, towel: { mid: -0.1, half: 0.75, limit: -0.06, aim: 0.75 } }
};
export const bodyOf = p => BODY[BODY_OF[p && p.look && p.look.model]] || null;

// the danger line never comes inside the target plus 1.5 zones, so no body makes a day that can't be cleared
const LIM_ROOM = 1.5;
/* 목꺾기: a rolled patient (roster.js makePatients) in this body */
export function withBody(p, b){
  const tolR = p.tolR*b.tol, tolB = p.tolB*b.tol;
  const maxR = Math.max(...p.sides.map(s => Math.abs(s.rot))), maxB = Math.max(...p.sides.map(s => Math.abs(s.bend)));
  return {...p, tolR, tolB, breath: p.breath*b.breath, heavy: b.heavy,
    limR: Math.max(Math.round(p.limR*b.lim), Math.ceil(maxR + LIM_ROOM*tolR)),
    limB: Math.max(Math.round(p.limB*b.lim), Math.ceil(maxB + LIM_ROOM*tolB))};
}
/* 목뽑기: a tension band (core/towel.js makeTowelTarget) in this body. The band stays inside 0.15..0.88; the snap point
   keeps the band's own headroom (shifted by limit), at least 0.06 above the band and at most 0.97. */
export function towelBody(tg, t){
  const half = tg.half*t.half, mid = Math.min(0.88 - half, Math.max(0.15 + half, tg.mid + t.mid));
  const room = tg.limit - (tg.mid + tg.half) + t.limit;
  return {...tg, mid, half, limit: Math.min(0.97, mid + half + Math.max(0.06, room)), aimTol: tg.aimTol*t.aim};
}

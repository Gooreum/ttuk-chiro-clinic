/* Each patient's own neck on the x-ray (scene/xray.js; user: "환자별로 뼈 모양도 다르게 하고. 지금 모두가 걍 일자
   형태잖아. 디스크 좁기나 넓기도 다르게 하고", 2026-10-15). Shown only: judging never reads it.
   curve    degrees added to the model's own cervical lordosis (BodyParts3D), spread over the gaps C2/3..C7/T1:
            0 = the textbook curve, about -15 = straight neck (일자목), about -28 = reversed (역C자 거북목)
   lateral  degrees of sideways lean over the same gaps (+ = toward the patient's left), the AP view shows it
   disc     height factor of each disc C2/3, C3/4, C4/5, C5/6, C6/7, C7/T1 (1 = healthy)
   spurs    0..1 bone spurs on the front of C5-C7 (spondylosis) */
export const SPINE = {
  "박대리":   {curve: -15, lateral: 5,  disc: [1, 1, 0.95, 0.85, 0.8, 1],      spurs: 0},     // 모니터 9시간: 일자목
  "최교수":   {curve: -6,  lateral: -7, disc: [1, 0.95, 0.9, 0.72, 0.85, 1],   spurs: 0.35},  // 54세, 약간 퇴행
  "이라이더": {curve: 4,   lateral: 3,  disc: [1.05, 0.6, 1.05, 1, 1, 1],      spurs: 0},     // 곡선은 좋은데 C3/4 한 칸이 눌림
  "정작가":   {curve: -28, lateral: -6, disc: [1, 1, 0.9, 0.85, 0.95, 1],      spurs: 0},     // 밤샘 웹툰: 역C자 거북목
  "김사장":   {curve: -8,  lateral: 9,  disc: [0.9, 0.82, 0.68, 0.55, 0.5, 0.8], spurs: 1},  // 63세: 아래 디스크가 납작, 골극
  "조멸치":   {curve: -22, lateral: -4, disc: [1, 1, 0.92, 0.82, 0.9, 1],      spurs: 0},     // 밤샘 개발자: 젓가락처럼 거의 역C자
  "한미모":   {curve: -10, lateral: 6,  disc: [1, 1, 1, 0.9, 0.88, 1],         spurs: 0},     // 12시간 인사 각도: 살짝 일자목
  "마동철":   {curve: 8,   lateral: -3, disc: [1.05, 1, 0.95, 0.9, 0.75, 0.85], spurs: 0.2},  // 씨름: 곡선은 튼튼, 아래 디스크가 짓눌림
  "복순할매": {curve: -18, lateral: 11, disc: [0.85, 0.75, 0.62, 0.5, 0.48, 0.72], spurs: 0.85}, // 79세 쪼그려 앉기 50년: 기울고 납작, 골극
  "정꼬마":   {curve: -12, lateral: 2,  disc: [1.1, 1.1, 1.08, 1.05, 1.05, 1.1], spurs: 0},    // 11세: 디스크는 탱탱한데 태블릿 일자목
  "최필라":   {curve: -16, lateral: -3, disc: [1, 1, 0.95, 0.88, 0.92, 1],      spurs: 0}      // 필라테스 강사: 코어는 튼튼, 목만 일자
};
const FALLBACK = {curve: 0, lateral: 0, disc: [1, 1, 1, 1, 1, 1], spurs: 0};
export const spineOf = name => SPINE[name] || FALLBACK;
// how the curve is shared out over the six gaps (the lower neck bends most)
export const GAP_SHARE = [0.1, 0.14, 0.18, 0.2, 0.21, 0.17];
/* Per gap C2/3..C7/T1 (index 0..5): {bend, lean} radians about the gap and the disc's height factor. */
export function spinePose(profile){
  const p = profile || FALLBACK, D = Math.PI/180;
  return GAP_SHARE.map((w, i) => ({bend: p.curve*w*D, lean: p.lateral*w*D, h: p.disc[i] ?? 1}));
}

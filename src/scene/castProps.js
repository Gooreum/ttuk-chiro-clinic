import * as THREE from "three";
import { M, mesh, cap, box, cyl, sph } from "./materials.js";
import { head, xrayMats } from "./patientModel.js";
import { withVisualIds } from "./visualBuild.js";

/* 영업 일지 cast (patient/cast.js) share five bodies, so what tells them apart is a kit of toy props hung on `head`
   (look.props = names from PROPS). Head space is the primitive head's: face front +y, crown -z, chin +z, ears at x ±0.113.
   The realistic heads are fitted to it (scene/realAssets.js MODELS), so the same props sit on both. They carry
   `userData.keep` so realAssets' primitiveHeadParts leaves them visible, and their materials fade with the x-ray. */
const col = (c, r = 0.8, extra) => M(c, r, extra);
const WHITE = col(0xf1eee6, 0.95), SILVER = col(0xc9ccd2, 0.7), BLACK = col(0x17171a, 0.6), GOLD = col(0xd6a93a, 0.28, {metalness: 0.85});
const RED = col(0xd8423a, 0.7), GREY = col(0x8d8f94, 0.9), BONE = col(0xe8e2d2, 0.7), PAPER = col(0xeef0f0, 0.75), WOOD = col(0x7a5236, 0.7);
const HORN = col(0x7a2a22, 0.5);
const BAND = col(0x8f1212, 0.6);
const MATS = [BAND, HORN, WHITE, SILVER, BLACK, GOLD, RED, GREY, BONE, PAPER, WOOD];

const kit = {};
function group(name, build){
  const g = new THREE.Group(); g.visible = false; g.userData.keep = true;
  build(g); head.add(g); kit[name] = g;
}
const part = (g, geo, m, p, r, s) => mesh(geo, m, g, p, r, s, true);
const cone = (r, h) => new THREE.ConeGeometry(r, h, 10);

function build(){
  // 뚝할배/도깨비영감: long white beard down the chin (cone points to +z = down), bushy brows, wild tufts
  group("beardLong", g => {
    part(g, sph(0.06), WHITE, [0, 0.082, 0.1], null, [1.25, 0.75, 1.15]);
    [-1, 1].forEach(s => part(g, sph(0.042), WHITE, [0.07 * s, 0.062, 0.062], null, [0.8, 1.1, 1.3]));
    part(g, cone(0.062, 0.2), WHITE, [0, 0.084, 0.215], [Math.PI / 2, 0, 0], [1.1, 1, 0.8]);
    part(g, cone(0.04, 0.16), WHITE, [0.02, 0.09, 0.3], [Math.PI / 2, 0, 0.15]);
  });
  group("stacheWhite", g => {
    [-1, 1].forEach(s => part(g, cap(0.01, 0.05), WHITE, [0.026 * s, 0.112, 0.045], [0.25 * s, 0.1 * s, Math.PI / 2 + 0.3 * s]));
  });
  group("stacheGrey", g => {
    [-1, 1].forEach(s => part(g, cap(0.008, 0.044), GREY, [0.024 * s, 0.114, 0.044], [0, 0, Math.PI / 2 - 0.25 * s]));
  });
  group("browsWhite", g => {
    [-1, 1].forEach(s => part(g, cap(0.006, 0.034), WHITE, [0.042 * s, 0.109, -0.044], [0, 0, Math.PI / 2 + 0.2 * s]));
    [-1, 1].forEach(s => part(g, cone(0.005, 0.04), WHITE, [0.068 * s, 0.106, -0.04], [0, 0, -Math.PI / 2 + 0.7 * s]));
  });
  group("browsBlack", g => {
    [-1, 1].forEach(s => part(g, cap(0.0055, 0.036), BLACK, [0.042 * s, 0.109, -0.044], [0, 0, Math.PI / 2 - 0.3 * s]));
  });
  group("hornSmall", g => {
    [-1, 1].forEach(s => {
      const d = new THREE.Vector3(0.45 * s, 0.2, -0.9).normalize();
      const m = part(g, cone(0.022, 0.1), HORN, [0.045 * s, 0.06, -0.12]);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    });
  });
  // white hair standing out from the sides and back (도깨비영감)
  group("hairWild", g => {
    for(let i = 0; i < 9; i++){
      const a = -2.2 + i * 0.55, r = 0.094;
      const d = new THREE.Vector3(Math.sin(a) * 0.95, 0.15 - Math.abs(Math.sin(a)) * 0.1, -Math.cos(a) * 0.9 - 0.25).normalize();
      const m = part(g, cone(0.012, 0.05), WHITE, [d.x * r, d.y * r - 0.006, d.z * 0.125]);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    }
  });
  group("topknot", g => {      // 상투: a white bun standing up from the crown, tied with a gold band
    part(g, sph(0.042), WHITE, [0, -0.01, -0.165], null, [1, 1, 0.95]);
    part(g, new THREE.TorusGeometry(0.03, 0.005, 8, 18), GOLD, [0, -0.01, -0.14]);
  });
  group("hairWhiteSides", g => {
    [-1, 1].forEach(s => {
      part(g, sph(0.03), WHITE, [0.1 * s, 0.002, -0.026], null, [0.9, 1.1, 1.2]);
      part(g, sph(0.024), WHITE, [0.095 * s, 0.02, -0.07], null, [0.8, 1, 1.1]);
    });
    part(g, sph(0.12), WHITE, [0, -0.032, -0.05], null, [0.95, 0.5, 0.7]);
  });
  group("hairSilver", g => {
    // same shell as the primitive short hair (patientModel.js hairShort), plus a swept-back wave on top
    const geo = new THREE.SphereGeometry(0.126, 32, 20, 0, Math.PI * 2, Math.PI * 0.36, Math.PI * 0.64);
    part(g, geo, SILVER, [0, -0.004, -0.006], [0.5, 0, 0], [0.82, 0.84, 1.1]);
    part(g, sph(0.04), SILVER, [0, 0.04, -0.135], null, [1.3, 0.8, 0.7]);
  });
  group("hairSlick", g => {
    const geo = new THREE.SphereGeometry(0.126, 32, 20, 0, Math.PI * 2, Math.PI * 0.36, Math.PI * 0.64);
    part(g, geo, BLACK, [0, -0.004, -0.006], [0.5, 0, 0], [0.82, 0.84, 1.1]);
    part(g, sph(0.03), BLACK, [0.02, 0.05, -0.14], null, [1.4, 0.8, 0.8]);     // a stiff front quiff
  });
  group("glassesGold", g => {
    [-1, 1].forEach(s => {
      part(g, new THREE.TorusGeometry(0.027, 0.0042, 8, 24), GOLD, [0.043 * s, 0.123, -0.024], [Math.PI / 2, 0, 0]);
      part(g, box(0.003, 0.1, 0.003), GOLD, [0.095 * s, 0.075, -0.012], [0, 0, 0.55 * s]);
    });
    part(g, box(0.02, 0.004, 0.004), GOLD, [0, 0.126, -0.022]);
  });
  group("glassesBig", g => {
    [-1, 1].forEach(s => {
      part(g, new THREE.TorusGeometry(0.033, 0.006, 8, 24), BLACK, [0.044 * s, 0.123, -0.024], [Math.PI / 2, 0, 0]);
      part(g, box(0.003, 0.1, 0.004), BLACK, [0.097 * s, 0.075, -0.012], [0, 0, 0.55 * s]);
    });
    part(g, box(0.02, 0.005, 0.005), BLACK, [0, 0.127, -0.022]);
  });
  group("headband", g => {
    part(g, new THREE.TorusGeometry(0.088, 0.009, 8, 36), BAND, [0, 0.008, -0.075], null, [0.96, 0.98, 1.0]);
    part(g, box(0.05, 0.003, 0.03), BAND, [0.06, -0.09, -0.075], [0, 0, 0.35]);     // loose tail
  });
  group("neckBrace", g => {
    part(g, cyl(0.082, 0.092, 0.07, 28), PAPER, [0, 0.01, 0.2], [Math.PI / 2, 0, 0]);
    part(g, cyl(0.084, 0.084, 0.012, 28), col(0x3b82c4, 0.6), [0, 0.01, 0.17], [Math.PI / 2, 0, 0]);
  });
  group("stethoscope", g => {
    part(g, new THREE.TorusGeometry(0.09, 0.006, 8, 28), BLACK, [0, 0.03, 0.235], [0.2, 0, 0], [1, 1.2, 1]);
    part(g, sph(0.018), GREY, [0.0, 0.14, 0.28]);
  });
  group("stamp", g => {      // 보건소장: an ink pad stamp stuck on the forehead
    part(g, cyl(0.016, 0.016, 0.05, 14), BAND, [0, 0.0, -0.17], [Math.PI / 2, 0, 0]);      // stamp handle
    part(g, cyl(0.036, 0.036, 0.012, 20), BAND, [0, 0.0, -0.145], [Math.PI / 2, 0, 0]);    // stamp face
  });
  group("tuftBald", g => {   // thin comb-over strands on a bald head
    for(let i = 0; i < 6; i++) part(g, box(0.1, 0.002, 0.003), GREY, [0, -0.01 + i * 0.012, -0.128 + i * 0.002], [0.5, 0, 0.12 - i * 0.02]);
  });
  group("muscleVein", g => {
    part(g, sph(0.012), RED, [0.07, 0.092, -0.1], null, [1, 0.5, 1]);
  });
  MATS.forEach(m => { m.transparent = false; xrayMats.push(m); });
}
withVisualIds(build);

/* Show exactly the props the patient's look asks for. */
export function applyProps(list){
  const want = new Set(list || []);
  for(const n in kit) kit[n].visible = want.has(n);
}
export const PROP_NAMES = Object.keys(kit);

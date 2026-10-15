import * as THREE from "three";
import { scene } from "./renderer.js";
import { M } from "./materials.js";
import { head, crackFadeMats } from "./patientModel.js";

/* Towel mode (core/towel.js): a thick folded towel wrapped snug round the back of the neck (under the skull), up both
   sides of the neck past the jaw to the therapist's fists, with the loose ends hanging out of them. Never round the
   front of the throat. Swept every frame along a curve with a rounded-box cross section (width along the neck's axis
   where it wraps, twisting flat toward the fists so the camera above sees the cloth, not its edge). Terry texture
   with teal stripes. Without the realistic arms the ends rest beside the head. */
const W = 0.072, TH = 0.02, SEG = 56, NS = 14;
function terry(){
  const c = document.createElement("canvas"); c.width = 128; c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#f3eee3"; g.fillRect(0, 0, 128, 256);
  // the terry loops are in the bump map (a stretched speckle here read as zebra stripes)
  // teal border stripes and a mint pinstripe, along the length
  g.fillStyle = "#2f5f6b"; g.fillRect(10, 0, 12, 256); g.fillRect(106, 0, 12, 256);
  g.fillStyle = "#8adfbf"; g.fillRect(26, 0, 3, 256); g.fillRect(99, 0, 3, 256);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function bumpTex(){
  const c = document.createElement("canvas"); c.width = 64; c.height = 64;
  const g = c.getContext("2d"), img = g.createImageData(64, 64);
  for(let i = 0; i < 64*64; i++){ const v = 150 + Math.random()*60; img.data.set([v, v, v, 255], i*4); }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 10);
  return t;
}
const mat = M(0xffffff, 1, {map: terry(), bumpMap: bumpTex(), bumpScale: 0.25, side: THREE.DoubleSide});
crackFadeMats.push(mat);
// cross section: a rounded box, NS points round it (u across the width, v through the thickness)
const SECT = Array.from({length: NS}, (_, k) => {
  const a = k/NS*Math.PI*2, c = Math.cos(a), s = Math.sin(a);
  const p = 6;   // superellipse: flat faces, rounded edges
  return [Math.sign(c)*Math.pow(Math.abs(c), 2/p)*W/2, Math.sign(s)*Math.pow(Math.abs(s), 2/p)*TH/2, k/NS];
});
const geo = new THREE.BufferGeometry();
const pos = new Float32Array((SEG + 1)*(NS + 1)*3), uv = new Float32Array((SEG + 1)*(NS + 1)*2), idx = [];
for(let i = 0; i <= SEG; i++) for(let k = 0; k <= NS; k++){
  const sec = SECT[k % NS];
  // the stripes face the camera on the top face: u from the width position, v along the length
  uv.set([0.5 + sec[0]/W*(sec[1] >= 0 ? 1 : -1), i/SEG*3.5], (i*(NS + 1) + k)*2);
  if(i < SEG && k < NS){ const a = i*(NS + 1) + k, b = a + NS + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
}
geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
geo.setIndex(idx);
const towel = new THREE.Mesh(geo, mat);
towel.frustumCulled = false; towel.castShadow = true; towel.receiveShadow = true; towel.visible = false;
scene.add(towel);

/* Head-local path, x mirrored (one side listed, from the fist down to the back of the neck). The upper neck sits at
   head-local z ~0.1, centre y ~-0.045, radius ~0.065 (patientModel neck); the wrap hugs it at that radius plus half
   the towel's thickness, from the side of the neck round to the middle at the back. */
const NECK_Z = 0.1, NECK_Y = -0.045, NECK_R = 0.066 + TH/2;
const ring = deg => [Math.cos(deg*Math.PI/180)*NECK_R, NECK_Y + Math.sin(deg*Math.PI/180)*NECK_R, NECK_Z];
const SIDE = [[0.1, 0.0, 0.04], ring(10), ring(-35), ring(-70)];   // past the jaw, then round the neck
const MID = ring(-90);
const REST = [0.14, -0.06, -0.06];      // an end lying beside the head when no hand holds it
const TAIL = [0.035, -0.045, -0.06];    // the loose end out of the fist (from the fist, head-local direction)
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _t = new THREE.Vector3(), _z = new THREE.Vector3(), _x = new THREE.Vector3();
const _w = new THREE.Vector3(), _n = new THREE.Vector3(), _fly = new THREE.Vector3(), _hz = new THREE.Vector3();
const N_PTS = 2*(2 + SIDE.length) + 1;
const pts = Array.from({length: N_PTS}, () => new THREE.Vector3());
const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
const local = (x, y, z) => _v.set(x, y, z).applyMatrix4(head.matrixWorld);

/* on: towel mode and playing. grips: realAssets towelGrips() or null. slip: seconds since the towel slipped off
   (< 0 none): it flies up toward the therapist and is gone, then is back in the hands by SLIP_BACK. */
const SLIP_GONE = 0.7, SLIP_BACK = 1.3;
export function updateTowel(on, grips, slip){
  towel.visible = on && !(slip >= SLIP_GONE && slip < SLIP_BACK);
  if(!towel.visible) return;
  head.updateMatrixWorld(true);
  const hold = grips ? grips.hold : 0;
  _hz.set(0, 0, 1).transformDirection(head.matrixWorld);
  // per side: tail, fist, past the jaw, round the neck; then the middle at the back
  const side = (s, palm, out) => {
    const fist = local(s*REST[0], REST[1], REST[2]).clone();
    if(palm) fist.lerp(palm, hold);
    out.push(fist.clone().add(_a.set(s*TAIL[0], TAIL[1], TAIL[2]).transformDirection(head.matrixWorld).multiplyScalar(Math.hypot(...TAIL))), fist);
    SIDE.forEach(p => out.push(local(s*p[0], p[1], p[2]).clone()));
    return out;
  };
  const L = side(1, grips && grips.l, []), R = side(-1, grips && grips.r, []);
  const seq = [...L, local(MID[0], MID[1], MID[2]).clone(), ...R.reverse()];
  seq.forEach((p, i) => pts[i].copy(p));
  // the slip: the whole towel flies up and back toward the therapist, spinning out of the frame
  const u = slip >= 0 && slip < SLIP_GONE ? slip/SLIP_GONE : 0;
  if(u > 0) pts.forEach((p, i) => { _fly.set(Math.sin(i*1.7)*0.05*u, 0.35*u*u + 0.05*u, -0.55*u*u); p.add(_fly); });
  curve.updateArcLengths();
  _x.set(1, 0, 0).transformDirection(head.matrixWorld);
  for(let i = 0; i <= SEG; i++){
    const t = i/SEG;
    curve.getPointAt(t, _a); curve.getTangentAt(t, _t);
    // width: along the neck's axis round the neck, flat (out to the side) toward the fists and the tails
    const f = Math.min(1, Math.max(0, 1 - Math.min(t, 1 - t)*6));
    _w.copy(_hz).multiplyScalar(1 - f).addScaledVector(_x, f*(t < 0.5 ? 1 : -1));
    _w.addScaledVector(_t, -_w.dot(_t)).normalize();
    _n.crossVectors(_t, _w).normalize();
    for(let k = 0; k <= NS; k++){
      const sec = SECT[k % NS], o = (i*(NS + 1) + k)*3;
      pos[o] = _a.x + _w.x*sec[0] + _n.x*sec[1];
      pos[o + 1] = _a.y + _w.y*sec[0] + _n.y*sec[1];
      pos[o + 2] = _a.z + _w.z*sec[0] + _n.z*sec[1];
    }
  }
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
}

import * as THREE from "three";
import { scene } from "./renderer.js";
import { M } from "./materials.js";
import { head, crackFadeMats } from "./patientModel.js";

/* Towel mode (core/towel.js): a striped towel from the therapist's left fist past the crown, along the side of the
   head, under the back of the neck and back up to the right fist. A ribbon rebuilt every frame on a curve; its width runs along the head's long
   axis (it is a band round the neck). Without the realistic arms the ends rest beside the head. */
const W = 0.09, SEG = 40;
function stripeTex(){
  const c = document.createElement("canvas"); c.width = 64; c.height = 8;
  const g = c.getContext("2d");
  g.fillStyle = "#f3eee3"; g.fillRect(0, 0, 64, 8);
  g.fillStyle = "#2f5f6b"; g.fillRect(6, 0, 8, 8); g.fillRect(50, 0, 8, 8);
  g.fillStyle = "#8adfbf"; g.fillRect(15, 0, 2, 8); g.fillRect(47, 0, 2, 8);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  return t;
}
const mat = M(0xffffff, 0.95, {map: stripeTex(), side: THREE.DoubleSide});
crackFadeMats.push(mat);
const geo = new THREE.BufferGeometry();
const pos = new Float32Array((SEG + 1)*2*3), uv = new Float32Array((SEG + 1)*2*2), idx = [];
for(let i = 0; i <= SEG; i++){
  uv.set([0, i/SEG*6, 1, i/SEG*6], i*4);
  if(i < SEG){ const a = i*2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
}
geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
geo.setIndex(idx);
const towel = new THREE.Mesh(geo, mat);
towel.frustumCulled = false; towel.castShadow = true; towel.visible = false;
scene.add(towel);

// head-local points round the back of the neck (x mirrored): beside the ear, under the occiput, the middle
const WRAP = [[0.125, 0.0, -0.04], [0.1, -0.06, 0.03], [0.055, -0.103, 0.055], [0, -0.115, 0.06]];
const REST = [0.13, -0.06, -0.07];   // an end lying beside the head when no hand holds it
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _z = new THREE.Vector3(), _x = new THREE.Vector3(), _w = new THREE.Vector3(), _fly = new THREE.Vector3();
const pts = Array.from({length: 2 + WRAP.length*2 - 1}, () => new THREE.Vector3());
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
  const end = (s, palm) => {
    const p = local(s*REST[0], REST[1], REST[2]).clone();
    if(palm) p.lerp(palm, hold);
    return p;
  };
  pts[0].copy(end(1, grips && grips.l));
  for(let i = 0; i < WRAP.length; i++) pts[1 + i].copy(local(WRAP[i][0], WRAP[i][1], WRAP[i][2]));
  for(let i = WRAP.length - 2; i >= 0; i--) pts[pts.length - 2 - i].copy(local(-WRAP[i][0], WRAP[i][1], WRAP[i][2]));
  pts[pts.length - 1].copy(end(-1, grips && grips.r));
  // the slip: the whole towel flies up and back toward the therapist, spinning out of the frame
  const u = slip >= 0 && slip < SLIP_GONE ? slip/SLIP_GONE : 0;
  if(u > 0) pts.forEach((p, i) => { _fly.set(Math.sin(i*1.7)*0.05*u, 0.35*u*u + 0.05*u, -0.55*u*u); p.add(_fly); });
  curve.updateArcLengths();
  // the band's width: along the head's long axis where it wraps the neck; toward the fists it twists flat (width out
  // to the side) so the camera above sees the towel, not its edge
  _z.set(0, 0, 1).transformDirection(head.matrixWorld);
  _x.set(1, 0, 0).transformDirection(head.matrixWorld);
  for(let i = 0; i <= SEG; i++){
    const t = i/SEG, f = Math.min(1, Math.max(0, 1 - Math.min(t, 1 - t)*4.4));
    curve.getPointAt(t, _a);
    _w.copy(_z).multiplyScalar(1 - f).addScaledVector(_x, f*(t < 0.5 ? 1 : -1)).normalize().multiplyScalar(W/2);
    pos.set([_a.x - _w.x, _a.y - _w.y, _a.z - _w.z, _a.x + _w.x, _a.y + _w.y, _a.z + _w.z], i*6);
  }
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
}

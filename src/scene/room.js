import * as THREE from "three";
import { mats, mesh, box, cyl, sph } from "./materials.js";
import { scene } from "./renderer.js";

// Capture references without adding or reordering anything in the original scene.
// The towel suite swaps only this range; clinic/back retain these exact objects.
const roomStart = scene.children.length;

/* Treatment room and table. Static meshes; added to the scene in the same order as the prototype. */
/* ---- room ---- */
mesh(new THREE.PlaneGeometry(8,10), mats.floor, null, [0,0,1.2], [-Math.PI/2,0,0], null, true);
mesh(new THREE.PlaneGeometry(1.5,2.9), mats.rug, null, [0,0.004,1.15], [-Math.PI/2,0,0], null, true);
[-1,1].forEach(s => {
  mesh(new THREE.PlaneGeometry(10,3), mats.wall, null, [1.7*s,1.5,1.2], [0,-s*Math.PI/2,0], null, true);
  mesh(box(0.02,0.9,10), mats.wainscot, null, [1.69*s,0.45,1.2], null, null, true);
  mesh(box(0.04,0.04,10), mats.trim, null, [1.68*s,0.92,1.2], null, null, true);
});
mesh(new THREE.PlaneGeometry(4,3), mats.wall, null, [0,1.5,4.2], [0,Math.PI,0], null, true);
// left wall: poster + certificate
mesh(box(0.03,0.9,0.66), mats.frame, null, [-1.675,1.32,1.75]);
mesh(new THREE.PlaneGeometry(0.6,0.84), mats.poster, null, [-1.655,1.32,1.75], [0,Math.PI/2,0], null, true);
mesh(box(0.03,0.34,0.44), mats.frame, null, [-1.675,1.36,0.85]);
mesh(new THREE.PlaneGeometry(0.4,0.3), mats.cert, null, [-1.655,1.36,0.85], [0,Math.PI/2,0], null, true);
// right wall: window
mesh(new THREE.PlaneGeometry(1.1,0.9), mats.glass, null, [1.685,1.45,1.5], [0,-Math.PI/2,0], null, true);
[[0,0.47,1.2,0.05],[0,-0.47,1.2,0.05],[0,0,1.2,0.035]].forEach(([dz,dy,len,t]) => mesh(box(0.05,t,len), mats.mullion, null, [1.67,1.45+dy,1.5+dz]));
[-0.57,0,0.57].forEach(dz => mesh(box(0.05,0.98,dz===0?0.035:0.05), mats.mullion, null, [1.67,1.45,1.5+dz]));
mesh(box(0.14,0.04,1.3), mats.trim, null, [1.62,0.98,1.5]);
// cabinet + plant (right)
mesh(box(0.42,0.82,0.9), mats.cabinet, null, [1.42,0.41,0.55]);
[0.2,0.48].forEach(y => { mesh(box(0.005,0.005,0.8), mats.frame, null, [1.205,y+0.02,0.55], null, null, true); mesh(box(0.02,0.02,0.12), mats.chrome, null, [1.2,y+0.12,0.55]); });
mesh(cyl(0.11,0.08,0.2), mats.pot, null, [1.42,0.92,0.32]);
for(let i=0;i<9;i++){
  const a = i/9*Math.PI*2, r = 0.06 + (i%3)*0.02;
  mesh(sph(0.07,10,8), i%2 ? mats.leaf : mats.leafDark, null, [1.42 + Math.cos(a)*r, 1.08 + (i%3)*0.06, 0.32 + Math.sin(a)*r], [0, a, 0.5], [0.6,1.3,0.45]);
}
// towels on cabinet
mesh(box(0.28,0.05,0.22), mats.trim, null, [1.42,0.845,0.8]);
mesh(box(0.28,0.05,0.22), mats.vinyl, null, [1.42,0.895,0.8]);
// stool (left)
mesh(cyl(0.18,0.18,0.06), mats.vinylDark, null, [-1.0,0.55,0.2]);
mesh(cyl(0.03,0.03,0.5,10), mats.chrome, null, [-1.0,0.28,0.2]);
mesh(cyl(0.2,0.2,0.03), mats.chrome, null, [-1.0,0.03,0.2]);

/* ---- treatment table ---- */
mesh(box(0.42,0.6,1.5), mats.vinylDark, null, [0,0.32,1.05]);
mesh(box(0.66,0.04,1.9), mats.chrome, null, [0,0.64,1.05]);
mesh(box(0.74,0.13,2.26), mats.vinyl, null, [0,0.775,1.07]);
mesh(box(0.745,0.006,2.265), mats.vinylDark, null, [0,0.755,1.07], null, null, true);
mesh(box(0.5,0.002,2.0), mats.paper, null, [0,0.842,1.2], null, null, true);
mesh(cyl(0.05,0.05,0.56,16), mats.paper, null, [0,0.85,2.26], [0,0,Math.PI/2]);
// the head extension and its paper: the towel mode's seated therapist (scene/therapist.js) sits where it is, so it is
// folded away there (headRest)
export const headRest = [mesh(box(0.48,0.1,0.44), mats.vinyl, null, [0,0.83,-0.27]),
  mesh(box(0.36,0.002,0.36), mats.paper, null, [0,0.881,-0.27], null, null, true)];
export const roomMeshes = scene.children.slice(roomStart);

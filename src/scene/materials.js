import * as THREE from "three";
import { scene } from "./renderer.js";
import { woodTex, rugTex, posterTex, certTex } from "./textures.js";

/* Shared materials and mesh helpers. */
export const M = (c, r=0.7, extra) => new THREE.MeshStandardMaterial(Object.assign({color:c, roughness:r, metalness:0}, extra||{}));
export const mats = {
  floor:M(0xffffff,0.85,{map:woodTex}), rug:M(0xffffff,0.95,{map:rugTex}),
  wall:M(0x3d5c54,0.95), wainscot:M(0x2c4842,0.8), trim:M(0xe9e1d0,0.6),
  vinyl:M(0x2f5f6b,0.45), vinylDark:M(0x234a53,0.5), chrome:M(0xb9c2c4,0.25,{metalness:0.8}), paper:M(0xf3eee3,0.9),
  wood:M(0x8a6446,0.6), cabinet:M(0xe6ddca,0.7), pot:M(0xb8613f,0.8), leaf:M(0x4f8a5a,0.7), leafDark:M(0x3d6e48,0.7),
  poster:M(0xffffff,0.8,{map:posterTex}), cert:M(0xffffff,0.8,{map:certTex}), frame:M(0x5a4232,0.6),
  glass:new THREE.MeshBasicMaterial({color:0xdcefff}), mullion:M(0xe9e1d0,0.6),
  skin:M(0xeabd9b,0.6), neck:M(0xeabd9b,0.6), headSkin:M(0xeabd9b,0.55), gown:M(0xb7b1d6,0.85), pants:M(0x4f5f78,0.85), sock:M(0xe8e3d8,0.9),
  hair:M(0x2a211c,0.85), feature:M(0x3b2a24,0.8), lip:M(0xa65a4e,0.6), white:M(0xf7f4ee,0.4), brow:M(0x3b2a24,0.9), frames:M(0x1e2422,0.4),
  doc:M(0xc78d66,0.55), coat:M(0xf4f1ea,0.8), cuff:M(0x2f5f6b,0.6)
};
mats.headSkin.emissive = new THREE.Color(0xff7a59);
mats.headSkin.emissiveIntensity = 0;

export function mesh(geo, mat, parent, pos, rot, scl, noShadow){
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = !noShadow; m.receiveShadow = true;
  if(pos) m.position.set(...pos);
  if(rot) m.rotation.set(...rot);
  if(scl) m.scale.set(...scl);
  (parent||scene).add(m);
  return m;
}
export const cap = (r,l,seg=16) => new THREE.CapsuleGeometry(r, l, 6, seg);
export const box = (w,h,d) => new THREE.BoxGeometry(w,h,d);
export const cyl = (a,b,h,s=20) => new THREE.CylinderGeometry(a,b,h,s);
export const sph = (r,a=20,b=14) => new THREE.SphereGeometry(r,a,b);

import * as THREE from "three";
import { columnFollow, jawFollow, jawColumnFollow, soft } from "../core/towelLook.js";
import { NECK_LEN, HEAD_NECK_LEN } from "../core/towel.js";
import { withVisualIds } from "./visualBuild.js";

// Refine only the neck, without moving the rest surface or changing its UVs.
// Conforming edge splits keep the boundary watertight; UV duplicates share positions.
function refine(source, inside, edgeLength, protectedY = Infinity){
  const geo = source.clone();
  for(let round = 0; round < 3; round++){
    const P = geo.attributes.position, idx = geo.index.array, edges = new Map();
    const edgeKey = (a, b) => a < b ? a + ":" + b : b + ":" + a;
    for(let f = 0; f < idx.length; f += 3){
      const tri = [idx[f], idx[f + 1], idx[f + 2]];
      if(!tri.some(i => inside(P.getX(i), P.getY(i), P.getZ(i)))) continue;
      for(let e = 0; e < 3; e++){
        const a = tri[e], b = tri[(e + 1)%3];
        if(P.getY(a) > protectedY || P.getY(b) > protectedY) continue;
        if(Math.hypot(P.getX(a) - P.getX(b), P.getY(a) - P.getY(b), P.getZ(a) - P.getZ(b)) > edgeLength)
          edges.set(edgeKey(a, b), [a, b]);
      }
    }
    if(!edges.size) break;
    let count = P.count;
    for(const pair of edges.values()) pair.push(count++);
    const splitAttribute = a => {
      const size = a.itemSize, values = new a.array.constructor(count*size);
      const raw = (i,d) => a.isInterleavedBufferAttribute ? a.data.array[i*a.data.stride + a.offset + d] : a.array[i*size + d];
      for(let i = 0; i < a.count; i++) for(let d = 0; d < size; d++) values[i*size + d] = raw(i,d);
      for(const [i, j, k] of edges.values()) for(let d = 0; d < size; d++)
        values[k*size + d] = (raw(i,d) + raw(j,d))/2;
      return new THREE.BufferAttribute(values, size, a.normalized);
    };
    for(const key of Object.keys(geo.attributes)) geo.setAttribute(key, splitAttribute(geo.attributes[key]));
    for(const key of Object.keys(geo.morphAttributes)) geo.morphAttributes[key] = geo.morphAttributes[key].map(splitAttribute);
    const out = [];
    for(let f = 0; f < idx.length; f += 3){
      const a = idx[f], b = idx[f + 1], c = idx[f + 2];
      const ab = edges.get(edgeKey(a,b))?.[2], bc = edges.get(edgeKey(b,c))?.[2], ca = edges.get(edgeKey(c,a))?.[2];
      const mask = (ab !== undefined ? 1 : 0) + (bc !== undefined ? 2 : 0) + (ca !== undefined ? 4 : 0);
      if(mask === 0) out.push(a,b,c);
      if(mask === 1) out.push(a,ab,c, ab,b,c);
      if(mask === 2) out.push(b,bc,a, bc,c,a);
      if(mask === 4) out.push(c,ca,b, ca,a,b);
      if(mask === 3) out.push(ab,b,bc, a,ab,c, ab,bc,c);
      if(mask === 6) out.push(b,bc,ca, bc,c,ca, b,ca,a);
      if(mask === 5) out.push(a,ab,ca, ab,b,c, ab,c,ca);
      if(mask === 7) out.push(a,ab,ca, ab,b,bc, ca,bc,c, ab,bc,ca);
    }
    geo.setIndex(out);
  }
  return geo;
}

function neckTone(model, center, radius){
  const map = model.skinMesh.material.map, image = map?.image;
  if(!image) return new THREE.Color(0xd6ad8b).convertSRGBToLinear();
  const cv = document.createElement("canvas"); cv.width = image.width; cv.height = image.height;
  const ctx = cv.getContext("2d", {willReadFrequently: true}); ctx.drawImage(image,0,0);
  const P = model.skinMesh.geometry.attributes.position, UV = model.skinMesh.geometry.attributes.uv, samples = [[],[],[]];
  for(let i = 0; i < P.count; i++){
    if(P.getY(i) < center.y + radius*0.45 || P.getY(i) > center.y + radius || P.getZ(i) < center.z) continue;
    const x = Math.min(cv.width-1,Math.max(0,Math.round(UV.getX(i)*cv.width)));
    const v = map.flipY ? UV.getY(i) : 1-UV.getY(i), y = Math.min(cv.height-1,Math.max(0,Math.round(v*cv.height)));
    const pixel = ctx.getImageData(x,y,1,1).data;
    for(let c = 0; c < 3; c++) samples[c].push(pixel[c]/255);
  }
  const rgb = samples.map(a => { a.sort((a,b)=>a-b); return a.length ? a[Math.floor(a.length/2)] : 0.7; });
  return new THREE.Color(...rgb).convertSRGBToLinear();
}

function skinMaterial(source, center, radius, upper, model, unit, columnCenter, columnRadius, tone, guard){
  const mat = source.clone();
  // The extreme gag can turn a tiny cut-edge triangle inside out. Keep the skin
  // closed on both sides, including the transparent x-ray fade, in one draw.
  mat.side = THREE.DoubleSide; mat.forceSinglePass = true;
  const uPinch = model.neckPinch, uLag = model.neckLag;
  mat.onBeforeCompile = sh => {
    const uDraw = {get value(){return upper ? -uLag.value : uLag.value*model.headUnit*(0.65/0.35)/unit;}};
    Object.assign(sh.uniforms, {uPinch, uLag, uDraw, uNeckC: {value: center}, uRadius: {value: radius},
      uBodyFrame: {value: model.neckBodyFrame}, uColumnC: {value: columnCenter}, uColumnRadius: {value: columnRadius}, uNeckTone: {value: tone}, uGuard: {value: guard}, uSeamLap: {value: 0.0008/model.headUnit}});
    sh.vertexShader = `attribute float aTowelNeck; attribute float aTowelSeam;
      uniform float uPinch, uLag, uDraw, uRadius, uSeamLap; uniform vec3 uNeckC;
      uniform mat4 uBodyFrame; uniform vec3 uColumnC; uniform float uColumnRadius;
      uniform vec3 uGuard;
      varying float vNeckTension; varying float vNeckSeam;
      float neckFollow(vec3 p){
        ${upper ? `vec3 bp = (uBodyFrame*vec4(p,1.0)).xyz;
        float bt = (uColumnC.y - 0.75*max(0.0,bp.z-uColumnC.z) - bp.y)/(1.3*uColumnRadius);
        float bw = (1.0 - smoothstep(0.035,1.0,bt))*(1.0 - smoothstep(1.2,1.49,length(bp.xz - uColumnC.xz)/uColumnRadius));
        bw *= 1.0 - smoothstep(1.2,1.49,length(bp.xz-uGuard.xy)/uGuard.z);
        float ht = (p.y - uNeckC.y - 0.004)/(0.7*uRadius);
        float jaw = 1.0 - smoothstep(0.0,1.0,ht);
        return mix(jaw,jaw*(1.0 - 0.65*bw)/0.35,aTowelSeam);` : `float t = (uNeckC.y - 0.75*max(0.0,p.z-uNeckC.z) - p.y)/(1.3*uRadius);
        return (1.0 - smoothstep(0.035, 1.0, t))*(1.0 - smoothstep(1.2, 1.49, length(p.xz - uNeckC.xz)/uRadius))*(1.0 - smoothstep(1.2,1.49,length(p.xz-uGuard.xy)/uGuard.z));`}
      }
      vec3 neckSurface(vec3 p){
        float w = neckFollow(p);
        float q = ${upper ? "1.0 - 0.35*w" : "0.65*w"};
        float f = pow(max(0.0, sin(3.14159265*q)), 0.8);
        vec2 d = p.xz - uNeckC.xz;
        float radial = length(d/vec2(uRadius, uRadius*1.12));
        float cap = mix(1.0, min(1.0, 1.0/max(radial,0.001)), smoothstep(0.4,0.8,f)*min(1.0,uPinch*6.0));
        p.xz = uNeckC.xz + d*cap*(vec2(1.0) - uPinch*f*vec2(0.94, 0.72));
        p.y += uDraw*w;
        ${upper ? `float lap = aTowelSeam*min(1.0,uPinch*6.0);
        p.xz = uNeckC.xz + (p.xz-uNeckC.xz)*(1.0+0.012*lap); p.y -= uSeamLap*lap;` : ""}
        return p;
      }\n` + sh.vertexShader;
    sh.vertexShader = sh.vertexShader.replace("#include <morphnormal_vertex>", `#include <morphnormal_vertex>
      if(aTowelNeck > 0.001 && uPinch > 0.001){
        float e = uRadius*0.015;
        vec3 dx = neckSurface(position + vec3(e,0.0,0.0)) - neckSurface(position - vec3(e,0.0,0.0));
        vec3 dy = neckSurface(position + vec3(0.0,e,0.0)) - neckSurface(position - vec3(0.0,e,0.0));
        vec3 dz = neckSurface(position + vec3(0.0,0.0,e)) - neckSurface(position - vec3(0.0,0.0,e));
        objectNormal = normalize(cross(dy,dz)*objectNormal.x + cross(dz,dx)*objectNormal.y + cross(dx,dy)*objectNormal.z);
      }
    `);
    sh.vertexShader = sh.vertexShader.replace("#include <morphtarget_vertex>", `#include <morphtarget_vertex>
      float qNeck = ${upper ? "1.0 - 0.35*aTowelNeck" : "0.65*aTowelNeck"};
      float neckShape = pow(max(0.0, sin(3.14159265*qNeck)), 0.8);
      vNeckTension = neckShape*min(1.0, uPinch*3.0);
      vNeckSeam = aTowelSeam;
      vec2 neckD = transformed.xz - uNeckC.xz;
      float radialNeck = length(neckD/vec2(uRadius,uRadius*1.12));
      float capNeck = mix(1.0,min(1.0,1.0/max(radialNeck,0.001)),smoothstep(0.4,0.8,neckShape)*min(1.0,uPinch*6.0));
      // Preserve depth at the throat; equal squeezing in both axes read as a flat ribbon.
      transformed.xz = uNeckC.xz + neckD*capNeck*(vec2(1.0) - uPinch*neckShape*vec2(0.94, 0.72));
      ${upper ? `transformed.y -= uLag*aTowelNeck;
      // A sub-millimetre skin overlap closes quantisation cracks at the export cut.
      float seamLap = aTowelSeam*min(1.0,uPinch*6.0);
      transformed.xz = uNeckC.xz + (transformed.xz-uNeckC.xz)*(1.0+0.012*seamLap);
      transformed.y -= uSeamLap*seamLap;` : ""}
    `);
    sh.fragmentShader = "varying float vNeckTension; varying float vNeckSeam; uniform vec3 uNeckTone;\n" + sh.fragmentShader;
    sh.fragmentShader = sh.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      diffuseColor.rgb = mix(diffuseColor.rgb, uNeckTone, vNeckTension*${upper ? "vNeckSeam*0.86" : "0.86"});
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(1.06, 0.96, 0.94), vNeckTension*0.42);
    `).replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.43, vNeckTension*0.32);
    `);
  };
  mat.customProgramCacheKey = () => upper ? "towel-jaw-v1" : "towel-column-v1";
  return mat;
}

export const prepareTowelNeck = (model, headCenter, headRadius) => withVisualIds(() => buildNeck(model,headCenter,headRadius));
function buildNeck(model, headCenter, headRadius){
  const bo = model.neckSkin, ho = model.skinMesh;
  const P = bo.geometry.attributes.position;
  let top = -Infinity, cx = 0, cz = 0, n = 0, radius = 0;
  for(let i = 0; i < P.count; i++) top = Math.max(top, P.getY(i));
  for(let i = 0; i < P.count; i++) if(P.getY(i) > top - 0.004){cx += P.getX(i); cz += P.getZ(i); n++;}
  cx /= n; cz /= n;
  for(let i = 0; i < P.count; i++) if(P.getY(i) > top - 0.004) radius += Math.hypot(P.getX(i)-cx, P.getZ(i)-cz)/n;
  // Keep the measured top ring intact, including its sampling density. It is also
  // the reference used by the shoulder/seam regression probe.
  const bg = refine(bo.geometry, (x,y,z) => y > top - NECK_LEN*radius*1.4 && Math.hypot(x-cx,z-cz) < 1.9*radius, radius*0.09, top - 0.0041);
  const hp = headCenter, hr = headRadius;
  const hg = refine(ho.geometry, (x,y,z) => y < hp.y + HEAD_NECK_LEN*hr*1.5 && Math.hypot(x-hp.x,z-hp.z) < 1.9*hr, hr*0.09);
  const si = bg.attributes.skinIndex, sw = bg.attributes.skinWeight, bones = bo.skeleton.bones;
  const ni = bones.findIndex(b=>b.name === "neck"), bi = bones.findIndex(b=>b.name === "body"), full = sw.normalized ? 255 : 1;
  const bw = new Float32Array(bg.attributes.position.count), hw = new Float32Array(hg.attributes.position.count), seam = new Float32Array(hw.length);
  const B = bg.attributes.position, H = hg.attributes.position;
  // The quantised cut contains a few unequal-height rings. Use the final mesh's
  // measured top ring as a second shoulder guard, so refinement cannot recruit traps.
  let gx = 0, gz = 0, gn = 0, gr = 0;
  for(let i = 0; i < B.count; i++) if(B.getY(i) > top - 0.004){gx += B.getX(i); gz += B.getZ(i); gn++;}
  gx /= gn; gz /= gn;
  for(let i = 0; i < B.count; i++) if(B.getY(i) > top - 0.004) gr += Math.hypot(B.getX(i)-gx,B.getZ(i)-gz)/gn;
  const guard = new THREE.Vector3(gx,gz,gr);
  const guardAt = (x,z) => 1 - soft((Math.hypot(x-gx,z-gz)/gr - 1.2)/0.29);
  for(let i = 0; i < B.count; i++){
    const w = Math.round(columnFollow((top-0.75*Math.max(0,B.getZ(i)-cz)-B.getY(i))/(NECK_LEN*radius), Math.hypot(B.getX(i)-cx,B.getZ(i)-cz)/radius)*guardAt(B.getX(i),B.getZ(i))*full)/full;
    bw[i] = w; si.array.set([bi,ni,0,0],i*4);
    const q = Math.round(w*full); sw.array.set([full-q,q,0,0],i*4);
  }
  const mapped = new THREE.Vector3();
  const bodyPoints = [];
  for(let i = 0; i < B.count; i++) if(B.getY(i) > top - radius*1.7 && Math.hypot(B.getX(i)-cx,B.getZ(i)-cz) < radius*1.9)
    bodyPoints.push({p:new THREE.Vector3().fromBufferAttribute(B,i),i});
  const positions = new Float32Array(H.count*3), normals = new Float32Array(H.count*3);
  const back = model.neckBodyFrame.clone().invert(), normalBack = new THREE.Matrix3().getNormalMatrix(back), nrm = new THREE.Vector3();
  for(let i = 0; i < H.count; i++){
    mapped.fromBufferAttribute(H,i).applyMatrix4(model.neckBodyFrame);
    let t = (H.getY(i)-hp.y-0.004)/(HEAD_NECK_LEN*hr), jaw = jawFollow(t), d = Infinity, nearest = null;
    if(jaw > 0) for(const p of bodyPoints){ const ds = p.p.distanceToSquared(mapped); if(ds < d){d = ds; nearest = p;} }
    seam[i] = 1 - soft((Math.sqrt(d) - 0.0015)/0.012);
    // Quantised exports differ by fractions of a millimetre at their shared cut.
    // Weld those positions and normals in rest space; the clinic retains both originals.
    const pos = new THREE.Vector3().fromBufferAttribute(H,i);
    nrm.fromBufferAttribute(hg.attributes.normal,i);
    if(nearest && d < 0.0015*0.0015){
      mapped.copy(nearest.p); pos.copy(mapped).applyMatrix4(back);
      nrm.fromBufferAttribute(bg.attributes.normal,nearest.i).applyMatrix3(normalBack).normalize();
      t = (pos.y-hp.y-0.004)/(HEAD_NECK_LEN*hr); jaw = jawFollow(t);
    }
    positions.set(pos.toArray(),i*3); normals.set(nrm.toArray(),i*3);
    const bodyW = Math.round(columnFollow((top-0.75*Math.max(0,mapped.z-cz)-mapped.y)/(NECK_LEN*radius), Math.hypot(mapped.x-cx,mapped.z-cz)/radius)*guardAt(mapped.x,mapped.z)*full)/full;
    hw[i] = jaw + (jawColumnFollow(bodyW,t) - jaw)*seam[i];
  }
  hg.setAttribute("position",new THREE.BufferAttribute(positions,3)); hg.setAttribute("normal",new THREE.BufferAttribute(normals,3));
  bg.setAttribute("aTowelNeck",new THREE.BufferAttribute(bw,1)); hg.setAttribute("aTowelNeck",new THREE.BufferAttribute(hw,1));
  bg.setAttribute("aTowelSeam",new THREE.BufferAttribute(new Float32Array(bw.length),1));
  hg.setAttribute("aTowelSeam",new THREE.BufferAttribute(seam,1));
  const cc = new THREE.Vector3(cx,top,cz);
  const tone = neckTone(model,hp,hr);
  const bodyUnit = model.headUnit/model.neckBodyFrame.getMaxScaleOnAxis();
  const bm = skinMaterial(bo.material,cc,radius,false,model,bodyUnit,cc,radius,tone,guard);
  const hm = skinMaterial(ho.material,hp,hr,true,model,model.headUnit,cc,radius,tone,guard);
  model.towelNeck = [{mesh:bo,original:bo.geometry,geometry:bg,material:bm,originalMat:bo.material},
    {mesh:ho,original:ho.geometry,geometry:hg,material:hm,originalMat:ho.material}];
  for(const p of model.towelNeck){
    p.originalDepth = p.mesh.customDepthMaterial;
    p.depth = new THREE.MeshDepthMaterial({depthPacking: THREE.RGBADepthPacking});
    p.depth.onBeforeCompile = p.material.onBeforeCompile;
    p.depth.customProgramCacheKey = () => p.material.customProgramCacheKey() + "-depth";
  }
  return [bm,hm];
}

export function showTowelNeck(model, on){
  if(!model.towelNeck) return;
  for(const p of model.towelNeck){
    p.mesh.geometry = on ? p.geometry : p.original;
    p.mesh.material = on ? p.material : p.originalMat;
    p.mesh.customDepthMaterial = on ? p.depth : p.originalDepth;
    if(on) p.material.emissiveIntensity = p.originalMat.emissiveIntensity;
  }
}

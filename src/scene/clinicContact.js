import * as THREE from "three";

// A head-local lateral envelope, rasterized once per patient. Interpolating this tiny surface is considerably
// cheaper on a phone than raycasting a skinned hand against thousands of head triangles every animation frame.
// Only the clinic uses it. The traction rig, its grips and its deformation are untouched.
export function clinicSurface(skin, head){
  head.updateMatrixWorld(true); skin.updateWorldMatrix(true, false);
  const matrix = head.matrixWorld.clone().invert().multiply(skin.matrixWorld);
  const P = skin.geometry.attributes.position, I = skin.geometry.index;
  const points = Array.from({length: P.count}, (_, i) => new THREE.Vector3().fromBufferAttribute(P, i).applyMatrix4(matrix));
  const box = new THREE.Box3().setFromPoints(points), step = 0.0025;
  const ny = Math.ceil((box.max.y - box.min.y)/step) + 1, nz = Math.ceil((box.max.z - box.min.z)/step) + 1;
  const left = new Float32Array(ny*nz).fill(-Infinity), right = new Float32Array(ny*nz).fill(-Infinity);
  for(let i = 0; i < (I ? I.count : P.count); i += 3){
    const a = points[I ? I.getX(i) : i], b = points[I ? I.getX(i + 1) : i + 1], c = points[I ? I.getX(i + 2) : i + 2];
    const den = (b.z - c.z)*(a.y - c.y) + (c.y - b.y)*(a.z - c.z);
    if(Math.abs(den) < 1e-12) continue;
    const y0 = Math.max(0, Math.ceil((Math.min(a.y,b.y,c.y) - box.min.y)/step));
    const y1 = Math.min(ny - 1, Math.floor((Math.max(a.y,b.y,c.y) - box.min.y)/step));
    const z0 = Math.max(0, Math.ceil((Math.min(a.z,b.z,c.z) - box.min.z)/step));
    const z1 = Math.min(nz - 1, Math.floor((Math.max(a.z,b.z,c.z) - box.min.z)/step));
    for(let z = z0; z <= z1; z++) for(let y = y0; y <= y1; y++){
      const py = box.min.y + y*step, pz = box.min.z + z*step;
      const u = ((b.z - c.z)*(py - c.y) + (c.y - b.y)*(pz - c.z))/den;
      const v = ((c.z - a.z)*(py - c.y) + (a.y - c.y)*(pz - c.z))/den;
      if(u < -1e-6 || v < -1e-6 || u + v > 1.000001) continue;
      const x = a.x*u + b.x*v + c.x*(1 - u - v), id = z*ny + y;
      left[id] = Math.max(left[id], x); right[id] = Math.max(right[id], -x);
    }
  }
  return {box, step, ny, nz, left, right};
}

// Keep every unique hand vertex: a fingertip may straddle the open neck boundary, which sparse joint/extremity
// probes miss. Cache the bind-space points and palette matrices so the per-frame fit performs only scalar sums.
export function clinicContactSamples(root){
  const result = [], p = new THREE.Vector3();
  root.traverse(mesh => {
    if(!mesh.isSkinnedMesh || !mesh.name.startsWith("arm_skin")) return;
    const {position: P, skinIndex: SI, skinWeight: SW} = mesh.geometry.attributes;
    const points = [], ids = [], weights = [], seen = new Set();
    for(let i = 0; i < P.count; i++){
      let weight = 0;
      for(let j = 0; j < 4; j++){
        const id = SI.array[i*4 + j], name = mesh.skeleton.bones[id]?.name || "";
        if(/^(hand|thumb|index|middle|ring|pinky)_/.test(name) && !name.includes("bridge")) weight += SW.array[i*4 + j];
      }
      if(weight <= 0.5) continue;
      p.fromBufferAttribute(P, i);
      const key = [p.x,p.y,p.z].map(v => Math.round(v*1e7)).join(",");
      if(seen.has(key)) continue;
      seen.add(key); p.applyMatrix4(mesh.bindMatrix); points.push(p.x,p.y,p.z);
      for(let j = 0; j < 4; j++){ ids.push(SI.array[i*4 + j]); weights.push(SW.array[i*4 + j]); }
    }
    result.push({mesh, points, ids, weights, matrices: mesh.skeleton.bones.map(() => new THREE.Matrix4())});
  });
  return result;
}

const point = new THREE.Vector3(), transform = new THREE.Matrix4();
export function clinicContactShift(surface, samples, inverseHead, side){
  const {box, step, ny, nz} = surface, data = side > 0 ? surface.left : surface.right;
  let nearest = Infinity;
  for(const {mesh, points, ids, weights, matrices} of samples){
    transform.copy(inverseHead).multiply(mesh.matrixWorld).multiply(mesh.bindMatrixInverse);
    matrices.forEach((m, i) => m.copy(transform).multiply(mesh.skeleton.bones[i].matrixWorld).multiply(mesh.skeleton.boneInverses[i]));
    for(let i = 0; i < points.length/3; i++){
      const px = points[i*3], py = points[i*3 + 1], pz = points[i*3 + 2];
      point.set(0,0,0);
      for(let j = 0; j < 4; j++){
        const w = weights[i*4 + j]; if(!w) continue;
        const e = matrices[ids[i*4 + j]].elements;
        point.x += (e[0]*px + e[4]*py + e[8]*pz + e[12])*w;
        point.y += (e[1]*px + e[5]*py + e[9]*pz + e[13])*w;
        point.z += (e[2]*px + e[6]*py + e[10]*pz + e[14])*w;
      }
      const y = (point.y - box.min.y)/step, z = (point.z - box.min.z)/step;
      const iy = Math.floor(y), iz = Math.floor(z);
      if(iy < 0 || iz < 0 || iy >= ny - 1 || iz >= nz - 1) continue;
      const a = data[iz*ny + iy], b = data[iz*ny + iy + 1], c = data[(iz + 1)*ny + iy], d = data[(iz + 1)*ny + iy + 1];
      if(!Number.isFinite(a + b + c + d)) continue;
      const fy = y - iy, fz = z - iz;
      const x = (a*(1 - fy) + b*fy)*(1 - fz) + (c*(1 - fy) + d*fy)*fz;
      nearest = Math.min(nearest, side*point.x - x);
    }
  }
  return Number.isFinite(nearest) ? THREE.MathUtils.clamp(0.002 - nearest, -0.04, 0.04) : 0;
}

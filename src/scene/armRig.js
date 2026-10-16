import * as THREE from "three";

// Visual rig limits, in radians. The small margin allows the palm-centred IK iteration to converge inside the
// anatomical envelope (70 extension / 80 flexion / 25 deviation), including frames during the fall.
export const WRIST_LIMIT = {extension: 68*Math.PI/180, flexion: 78*Math.PI/180, deviation: 24*Math.PI/180};
const direction = new THREE.Vector3(), limited = new THREE.Vector3();
const inverse = new THREE.Quaternion(), correction = new THREE.Quaternion();
export function wristAngles(frame, handQ, elbow, wrist, out = {}){
  direction.copy(elbow).sub(wrist).normalize().applyQuaternion(inverse.copy(handQ).invert());
  const along = direction.dot(frame.fore);
  out.extension = Math.atan2(direction.dot(frame.back), along);
  out.deviation = Math.atan2(direction.dot(frame.side), along);
  return out;
}
const angles = {};
export function limitWrist(frame, handQ, elbow, wrist){
  wristAngles(frame, handQ, elbow, wrist, angles);
  const ext = THREE.MathUtils.clamp(angles.extension, -WRIST_LIMIT.flexion, WRIST_LIMIT.extension);
  const dev = THREE.MathUtils.clamp(angles.deviation, -WRIST_LIMIT.deviation, WRIST_LIMIT.deviation);
  if(Math.abs(ext - angles.extension) < 1e-7 && Math.abs(dev - angles.deviation) < 1e-7) return false;
  // Minimal swing of the hand, about its palm contact. No extra wrist axial twist is introduced.
  limited.copy(frame.fore).addScaledVector(frame.back, Math.tan(ext)).addScaledVector(frame.side, Math.tan(dev)).normalize();
  handQ.multiply(correction.setFromUnitVectors(limited, direction)).normalize();
  return true;
}

// Read normalized integer storage explicitly, including the interleaved padding used by the compressed GLBs.
function component(a, i){
  // Quantized VEC3 positions are padded to an 8-byte vertex stride (four Int16s, not three).
  const offset = a.isInterleavedBufferAttribute ? Math.floor(i/a.itemSize)*a.data.stride + a.offset + i%a.itemSize : i;
  const x = a.array[offset];
  if(!a.normalized) return x;
  if(a.array instanceof Int16Array) return Math.max(-1, x/32767);
  if(a.array instanceof Uint16Array) return x/65535;
  if(a.array instanceof Uint8Array) return x/255;
  if(a.array instanceof Int8Array) return Math.max(-1, x/127);
  return x;
}

/* Four forearm roll joints and one wrist bridge. Pronation accumulates along the radius/ulna, rather than leaving
   40% of it on a single wrist ring. The bridge splits a wrist bend into two smaller rotations, retaining the oval
   section under linear skinning. Existing sleeves and finger weights stay on their original bones. */
export function addArmRollRig(root, lower, hand, wristRest, fingerAxis, smoothSurface = false){
  const meshes = [];
  root.traverse(o => { if(o.isSkinnedMesh) meshes.push(o); });
  const elbow = lower.getWorldPosition(new THREE.Vector3());
  const length = elbow.distanceTo(wristRest);
  const fractions = [0.25, 0.5, 0.75, 1];
  const rolls = fractions.map((f, i) => {
    const b = new THREE.Bone(); b.name = lower.name + "_roll" + (i + 1);
    b.position.set(0, length*f, 0); lower.add(b); return b;
  });
  const bridge = new THREE.Bone(); bridge.name = hand.name + "_bridge";
  bridge.position.copy(hand.position); lower.add(bridge);
  root.updateMatrixWorld(true);
  const helpers = [...rolls, bridge], replacements = new Map();
  const p = new THREE.Vector3(), w = new THREE.Vector3(), tmp = new THREE.Vector3();
  const axis = wristRest.clone().sub(elbow).normalize();
  for(const mesh of meshes){
    const old = mesh.skeleton;
    const li = old.bones.indexOf(lower), hi = old.bones.indexOf(hand);
    if(li < 0 || hi < 0) continue;
    if(!replacements.has(old)){
      // meshopt's quantization transform is folded into the original inverse bind matrices by glTF-Transform.
      // A plain inverse(helperWorld) would skin normalized positions as metres and tear the arm into shards.
      const decode = lower.matrixWorld.clone().multiply(old.boneInverses[li]);
      replacements.set(old, new THREE.Skeleton([...old.bones, ...helpers],
        [...old.boneInverses, ...helpers.map(b => b.matrixWorld.clone().invert().multiply(decode))]));
    }
    const skeleton = replacements.get(old);
    const rollIndices = [li, ...rolls.map(b => skeleton.bones.indexOf(b))], bridgeIndex = skeleton.bones.indexOf(bridge);
    if(smoothSurface && mesh.name.startsWith("arm_skin")){
      const geo = mesh.geometry.clone();
      // Quantized normals cannot accumulate the tiny triangle areas in computeVertexNormals. Rebuild the entire
      // arm in Float32, including the old elbow UV boundary outside the hand sculpt's region.
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count*3), 3));
      geo.computeVertexNormals(); mesh.geometry = geo;
    }
    const geo = mesh.geometry, P = geo.attributes.position, SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight;
    const indices = new Uint16Array(P.count*4), weights = new Float32Array(P.count*4);
    const restMatrices = old.bones.map((b, i) => b.matrixWorld.clone().multiply(old.boneInverses[i]));
    for(let i = 0; i < P.count; i++){
      p.set(component(P, i*3), component(P, i*3 + 1), component(P, i*3 + 2)).applyMatrix4(mesh.bindMatrix);
      w.set(0, 0, 0);
      const influences = new Map();
      for(let j = 0; j < 4; j++){
        const id = component(SI, i*4 + j), weight = component(SW, i*4 + j);
        if(weight){ influences.set(id, (influences.get(id) || 0) + weight); w.addScaledVector(tmp.copy(p).applyMatrix4(restMatrices[id]), weight); }
      }
      const lw = influences.get(li) || 0, hw = influences.get(hi) || 0;
      const offset = tmp.copy(w).sub(wristRest).dot(fingerAxis);
      if(lw + hw > 0.95 && offset > -0.032 && offset < 0.032){
        // A continuous three-joint wrist band. No change to the palm beyond 32 mm from the wrist.
        const t = THREE.MathUtils.smoothstep(offset, -0.032, 0.032)*2;
        influences.delete(li); influences.delete(hi);
        const ids = [rollIndices[4], bridgeIndex, hi], a = Math.min(1, Math.floor(t)), blend = t - a;
        influences.set(ids[a], (influences.get(ids[a]) || 0) + (lw + hw)*(1 - blend));
        influences.set(ids[a + 1], (influences.get(ids[a + 1]) || 0) + (lw + hw)*blend);
      }else if(lw){
        const t = THREE.MathUtils.clamp(tmp.copy(w).sub(elbow).dot(axis)/length, 0, 1)*4;
        const a = Math.min(3, Math.floor(t)), blend = t - a;
        influences.delete(li);
        influences.set(rollIndices[a], (influences.get(rollIndices[a]) || 0) + lw*(1 - blend));
        influences.set(rollIndices[a + 1], (influences.get(rollIndices[a + 1]) || 0) + lw*blend);
      }
      const sorted = [...influences].filter(([, x]) => x > 1e-7).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const total = sorted.reduce((s, [, x]) => s + x, 0);
      sorted.forEach(([id, x], j) => { indices[i*4 + j] = id; weights[i*4 + j] = x/total; });
    }
    if(smoothSurface && mesh.name.startsWith("arm_skin")){
      const groups = new Map(), N = geo.attributes.normal;
      for(let i = 0; i < P.count; i++){
        const key = [0,1,2].map(j => Math.round(component(P, i*3 + j)*1e6)).join(",");
        if(!groups.has(key)) groups.set(key, []);
        groups.get(key).push(i);
      }
      for(const ids of groups.values()){
        const normal = new THREE.Vector3(), influences = new Map();
        for(const i of ids){
          normal.add(tmp.fromBufferAttribute(N,i));
          for(let j = 0; j < 4; j++){
            const id = indices[i*4 + j], weight = weights[i*4 + j];
            if(weight) influences.set(id, (influences.get(id) || 0) + weight);
          }
        }
        normal.normalize();
        const sorted = [...influences].sort((a,b) => b[1] - a[1]).slice(0,4), total = sorted.reduce((s,[,x]) => s + x,0);
        for(const i of ids){
          N.setXYZ(i,normal.x,normal.y,normal.z);
          indices.fill(0,i*4,i*4 + 4); weights.fill(0,i*4,i*4 + 4);
          sorted.forEach(([id,x],j) => { indices[i*4 + j] = id; weights[i*4 + j] = x/total; });
        }
      }
    }
    geo.setAttribute("skinIndex", new THREE.BufferAttribute(indices, 4));
    geo.setAttribute("skinWeight", new THREE.BufferAttribute(weights, 4));
    mesh.skeleton = skeleton;
  }
  return {rolls, fractions, bridge};
}

const yAxis = new THREE.Vector3(0, 1, 0), handEquivalent = new THREE.Quaternion(), full = new THREE.Quaternion();
export function poseArmRollRig(rig, twist, hingeQ, handQ, handRest){
  rig.rolls.forEach((bone, i) => bone.quaternion.setFromAxisAngle(yAxis, twist*rig.fractions[i]));
  full.setFromAxisAngle(yAxis, twist);
  handEquivalent.copy(hingeQ).invert().multiply(handQ).multiply(inverse.copy(handRest).invert());
  rig.bridge.quaternion.copy(full).slerp(handEquivalent, 0.5);
}

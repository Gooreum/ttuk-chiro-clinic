import {describe, it, expect} from "vitest";
import * as THREE from "three";
import {limitWrist, wristAngles, WRIST_LIMIT, addArmRollRig, poseArmRollRig} from "../src/scene/armRig.js";

const frame = {fore: new THREE.Vector3(0, -1, 0), back: new THREE.Vector3(0, 0, 1), side: new THREE.Vector3(-1, 0, 0)};
const wrist = new THREE.Vector3();
describe("visual wrist envelope", () => {
  for(const [ext, dev] of [[100, 0], [-110, 0], [0, 60], [50, -50], [170, 130]]){
    it(`projects extension ${ext} / deviation ${dev} into the anatomical envelope`, () => {
      const e = ext*Math.PI/180, d = dev*Math.PI/180;
      const elbow = frame.fore.clone().multiplyScalar(Math.cos(e)).addScaledVector(frame.back, Math.sin(e)).addScaledVector(frame.side, Math.sin(d)).normalize();
      const q = new THREE.Quaternion();
      expect(limitWrist(frame, q, elbow, wrist)).toBe(true);
      const a = wristAngles(frame, q, elbow, wrist);
      expect(a.extension).toBeLessThanOrEqual(WRIST_LIMIT.extension + 1e-8);
      expect(a.extension).toBeGreaterThanOrEqual(-WRIST_LIMIT.flexion - 1e-8);
      expect(Math.abs(a.deviation)).toBeLessThanOrEqual(WRIST_LIMIT.deviation + 1e-8);
      expect(q.length()).toBeCloseTo(1);
    });
  }
  it("preserves a neutral hand frame exactly", () => {
    const q = new THREE.Quaternion();
    expect(limitWrist(frame, q, frame.fore, wrist)).toBe(false);
    expect(q.toArray()).toEqual([0, 0, 0, 1]);
  });
});

function rig(decode, padded = false){
  const root = new THREE.Group(), lower = new THREE.Bone(), hand = new THREE.Bone();
  lower.name = "lowerarm_l"; hand.name = "hand_l"; hand.position.y = 0.2374;
  root.add(lower); lower.add(hand); root.updateMatrixWorld(true);
  const geo = new THREE.BufferGeometry();
  const rows = [0.05, 0.1187, 0.2, 0.2374, 0.27];
  geo.setAttribute("position", new THREE.Float32BufferAttribute(rows.flatMap(y => [0.02, y, 0]), 3));
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(rows.flatMap(() => [0, 0, 0, 0]), 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(rows.flatMap(() => [1, 0, 0, 0]), 4));
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial()); root.add(mesh);
  mesh.bind(new THREE.Skeleton([lower, hand]));
  if(decode){
    const inverse = decode.clone().invert(), p = new THREE.Vector3();
    for(let i = 0; i < rows.length; i++){
      p.fromBufferAttribute(geo.attributes.position, i).applyMatrix4(inverse);
      geo.attributes.position.setXYZ(i, p.x, p.y, p.z);
    }
    mesh.skeleton.boneInverses.forEach(m => m.multiply(decode));
  }
  if(padded){
    const array = new Int16Array(rows.length*4), P = geo.attributes.position;
    for(let i = 0; i < rows.length; i++){
      for(let j = 0; j < 3; j++) array[i*4 + j] = Math.round(P.array[i*3 + j]*32767);
      array[i*4 + 3] = -12345;
    }
    geo.setAttribute("position", new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(array, 4), 3, 0, true));
  }
  const roll = addArmRollRig(root, lower, hand, hand.position.clone(), new THREE.Vector3(0, 1, 0));
  return {root, lower, hand, mesh, roll};
}
function skin(mesh, i){
  const p = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i).applyMatrix4(mesh.bindMatrix);
  const out = new THREE.Vector3(), si = mesh.geometry.attributes.skinIndex.array, sw = mesh.geometry.attributes.skinWeight.array;
  for(let j = 0; j < 4; j++){
    const id = si[i*4 + j], w = sw[i*4 + j];
    if(w) out.addScaledVector(p.clone().applyMatrix4(mesh.skeleton.boneInverses[id]).applyMatrix4(mesh.skeleton.bones[id].matrixWorld), w);
  }
  return out;
}
describe("distributed forearm skinning", () => {
  it("keeps bind positions and normalized weights after adding roll joints", () => {
    const {mesh, root} = rig(); root.updateMatrixWorld(true);
    for(let i = 0; i < mesh.geometry.attributes.position.count; i++){
      const p = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i);
      expect(skin(mesh, i).distanceTo(p)).toBeLessThan(1e-7);
      expect([...mesh.geometry.attributes.skinWeight.array.slice(i*4, i*4 + 4)].reduce((a,b) => a + b)).toBeCloseTo(1);
    }
  });
  it("distributes a 80 degree turn and retains the distal wrist section", () => {
    const {roll, root, mesh, hand} = rig(), twist = 80*Math.PI/180;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), twist);
    hand.quaternion.copy(q); poseArmRollRig(roll, twist, new THREE.Quaternion(), q, new THREE.Quaternion());
    root.updateMatrixWorld(true);
    roll.rolls.forEach((b, i) => expect(2*Math.atan2(b.quaternion.y, b.quaternion.w)).toBeCloseTo(twist*(i + 1)/4));
    const p = skin(mesh, 3);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(0.02, 5);
    expect(p.y).toBeCloseTo(0.2374);
  });
  it("preserves the quantization decode folded into glTF inverse bind matrices", () => {
    const decode = new THREE.Matrix4().makeScale(0.4, 0.5, 0.6).setPosition(0.1, 0.12, -0.04);
    const {mesh, root} = rig(decode); root.updateMatrixWorld(true);
    [0.05, 0.1187, 0.2, 0.2374, 0.27].forEach((y, i) => {
      expect(skin(mesh, i).distanceTo(new THREE.Vector3(0.02, y, 0))).toBeLessThan(1e-7);
    });
  });
  it("ignores padded Int16 position components when assigning roll weights", () => {
    const {mesh} = rig(undefined, true);
    const si = mesh.geometry.attributes.skinIndex.array, sw = mesh.geometry.attributes.skinWeight.array;
    // At mid-forearm, the 50% roll joint owns the skin; padding must never enter the axial coordinate.
    const at = [...si.slice(4, 8)].findIndex(id => mesh.skeleton.bones[id].name === "lowerarm_l_roll2");
    expect(at).toBeGreaterThanOrEqual(0);
    expect(sw[4 + at]).toBeGreaterThan(0.999);
  });
});

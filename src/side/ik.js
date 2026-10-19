import * as THREE from "three";

const shoulder = new THREE.Vector3(), elbow = new THREE.Vector3(), wrist = new THREE.Vector3();
const ray = new THREE.Vector3(), bend = new THREE.Vector3(), wantedElbow = new THREE.Vector3();
const from = new THREE.Vector3(), to = new THREE.Vector3(), axis = new THREE.Vector3(), cross = new THREE.Vector3();
const delta = new THREE.Quaternion(), parent = new THREE.Quaternion(), inverse = new THREE.Quaternion();
const startUpper = new THREE.Quaternion(), startLower = new THREE.Quaternion();
const EPS = 1e-10;

function rotateWorld(bone){
  if(bone.parent){
    bone.parent.getWorldQuaternion(parent);
    delta.premultiply(inverse.copy(parent).invert()).multiply(parent);
  }
  bone.quaternion.premultiply(delta).normalize();
  bone.updateWorldMatrix(false, true);
}

// Analytic shoulder -> elbow -> wrist IK. Target and pole are world-space points; the pole selects the elbow side.
// Rotations go through each bone's actual parent, including rotated roots and intermediate joints. Weight blends
// the solved local rotations from the incoming pose; neither bone lengths nor the hand's local rotation change.
export function solveTwoBone(upper, lower, hand, target, pole, weight = 1){
  weight = THREE.MathUtils.clamp(weight, 0, 1);
  if(!upper || !lower || !hand || !(weight > 0)) return;
  upper.updateWorldMatrix(true, true);
  upper.getWorldPosition(shoulder); lower.getWorldPosition(elbow); hand.getWorldPosition(wrist);
  const a = shoulder.distanceTo(elbow), b = elbow.distanceTo(wrist);
  if(a < EPS || b < EPS) return;
  startUpper.copy(upper.quaternion); startLower.copy(lower.quaternion);
  ray.subVectors(target, shoulder);
  const distance = ray.length();
  if(distance < EPS){ ray.subVectors(wrist, shoulder); if(ray.lengthSq() < EPS) ray.set(0, 1, 0); }
  ray.normalize();
  const d = Math.max(EPS, THREE.MathUtils.clamp(distance, Math.abs(a - b), a + b));
  const along = (a*a - b*b + d*d)/(2*d), height = Math.sqrt(Math.max(0, a*a - along*along));
  bend.subVectors(pole, shoulder).addScaledVector(ray, -bend.dot(ray));
  if(bend.lengthSq() < EPS) bend.subVectors(elbow, shoulder).addScaledVector(ray, -bend.dot(ray));
  if(bend.lengthSq() < EPS){ bend.set(Math.abs(ray.x) < .8 ? 1 : 0, Math.abs(ray.x) < .8 ? 0 : 1, 0); bend.addScaledVector(ray, -bend.dot(ray)); }
  wantedElbow.copy(shoulder).addScaledVector(ray, along).addScaledVector(bend.normalize(), height);
  from.subVectors(elbow, shoulder).normalize(); to.subVectors(wantedElbow, shoulder).normalize();
  delta.setFromUnitVectors(from, to); rotateWorld(upper);
  lower.getWorldPosition(elbow); hand.getWorldPosition(wrist);
  // Roll the humerus so the elbow bends in the pole plane, then flex the forearm toward the reachable wrist.
  axis.subVectors(elbow, shoulder).normalize();
  from.subVectors(wrist, elbow); from.addScaledVector(axis, -from.dot(axis));
  to.copy(shoulder).addScaledVector(ray, d).sub(elbow); to.addScaledVector(axis, -to.dot(axis));
  if(from.lengthSq() > EPS && to.lengthSq() > EPS){
    from.normalize(); to.normalize();
    delta.setFromAxisAngle(axis, Math.atan2(axis.dot(cross.crossVectors(from, to)), from.dot(to))); rotateWorld(upper);
  }
  lower.getWorldPosition(elbow); hand.getWorldPosition(wrist);
  from.subVectors(wrist, elbow).normalize(); to.copy(shoulder).addScaledVector(ray, d).sub(elbow).normalize();
  delta.setFromUnitVectors(from, to); rotateWorld(lower);
  if(weight < 1){
    delta.copy(upper.quaternion); upper.quaternion.slerpQuaternions(startUpper, delta, weight);
    delta.copy(lower.quaternion); lower.quaternion.slerpQuaternions(startLower, delta, weight);
    upper.updateWorldMatrix(false, true);
  }
}

import * as THREE from "three";

/* Lumbar x-ray film for the side-posture mode. Phase 3 placeholder: an empty group and the film camera framing over
   the lumbar spine; the lumbar model and the facet/disc/fracture beats come with the x-ray step. */
export async function createSideXray({scene}){
  const group = new THREE.Group(); group.visible = false; scene.add(group);
  const look = new THREE.Vector3(0, 1.0, .3);
  function update({film = 0} = {}){ group.visible = film > .01; }
  // a close, slightly high view of the low back from behind the patient
  function focus(side){
    const f = side === "R" ? -1 : 1;
    return {camera: new THREE.Vector3(-f*.55, 1.25, .5), look};
  }
  function dispose(){ scene.remove(group); }
  return {group, update, focus, dispose};
}

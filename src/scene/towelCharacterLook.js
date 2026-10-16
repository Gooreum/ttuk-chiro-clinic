import * as THREE from "three";
import { withVisualIds } from "./visualBuild.js";

// Towel-only materials preserve the authored maps at their full resolution.
// Fold/seam normals, pore/color variation and packed AO/roughness supply detail;
// the directional key makes those details readable without extra render passes.
export function finishTowelCharacter(material, src){
  const name = src?.name || material.name || "";
  const kind = src.userData?.detailKind;
  const skin = /\.(skin|body)$/.test(name) || kind === "face" || kind === "skin";
  const garment = /\.(shirt|pants|sleeve|hem|constructionHem)$/.test(name) || name === "stage.scrub" || kind === "shirt" || kind === "pants";
  const hair = /\.(short0\d|long0\d|bob0\d|ponytail0\d|braid0\d|afro0\d)$/.test(name);
  if(skin || garment || hair){
    material.map = src.map || null;
    material.normalMap = src.normalMap || null;
    if(src.normalScale) material.normalScale.copy(src.normalScale);
    if(src.normalMapType !== undefined) material.normalMapType = src.normalMapType;
    // glTF uses R=occlusion, G=roughness, B=metalness. GLTFLoader creates uv2
    // from uv for the occlusion texture before these materials are replaced.
    material.roughnessMap = src.roughnessMap || null;
    material.metalnessMap = src.metalnessMap || null;
    material.aoMap = src.aoMap || null;
    material.aoMapIntensity = src.aoMapIntensity ?? 1;
    material.roughness = src.roughness ?? (skin ? .68 : .84);
    material.metalness = src.metalness ?? 0;
    material.envMapIntensity = skin ? .2 : garment ? .16 : .2;
    if(garment && src.color) material.color.copy(src.color);
    if(material.isMeshPhysicalMaterial){
      material.clearcoat = 0;
      material.sheen = skin ? .14 : garment ? .18 : 0;
      material.sheenRoughness = .8;
      material.specularIntensity = skin ? .38 : .45;
    }
  }
  material.needsUpdate = true;
  return material;
}

export function finishTowelShoulders(root){
  // The static shirt export closed its amputated sleeves with two triangle
  // fans. The articulated sleeves already overlap those cuts, so the old fans
  // show up as down-facing black wedges when the elbows hang by the torso.
  // Remove only their degenerate-UV triangles, not the shoulder surface.
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if(!o.isMesh || o.name !== "therapist_shirt") return;
    const source = o.geometry, UV = source.attributes.uv, P = source.attributes.position;
    if(!UV || !source.index) return;
    const I = source.index.array, keep = [], keptAt = new Uint32Array(I.length/3 + 1);
    let removed = 0;
    for(let k = 0; k < I.length; k += 3){
      const a = I[k], b = I[k + 1], c = I[k + 2];
      const fan = [b,c].every(i => Math.abs(UV.getX(a) - UV.getX(i)) < 1e-5 && Math.abs(UV.getY(a) - UV.getY(i)) < 1e-5);
      if(fan) removed++; else keep.push(a,b,c);
      keptAt[k/3 + 1] = keep.length;
    }
    // Source-specific guard: do not silently strip an altered future wardrobe.
    if(removed !== 71) return;
    withVisualIds(() => {
      const geo = source.clone(); geo.setIndex(keep);
      for(let i = 0; i < source.groups.length; i++){
        const g = source.groups[i], start = keptAt[g.start/3], end = keptAt[(g.start + g.count)/3];
        geo.groups[i] = {...g, start, count: end - start};
      }
      // r149 reuses the normal attribute. Int8 normals cannot accumulate small
      // face areas, so accumulate in Float32 before joining UV seam duplicates.
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(new Float32Array(P.count*3), 3));
      geo.computeVertexNormals();
      const N = geo.attributes.normal, groups = new Map();
      const scale = o.getWorldScale(new THREE.Vector3()).length()/Math.sqrt(3);
      for(let i = 0; i < P.count; i++){
        const key = [P.getX(i),P.getY(i),P.getZ(i)].map(x => Math.round(x*scale/.00005)).join(",");
        if(!groups.has(key)) groups.set(key, []);
        groups.get(key).push(i);
      }
      const sum = new THREE.Vector3(), n = new THREE.Vector3();
      for(const ids of groups.values()){
        sum.set(0,0,0);
        for(const i of ids) sum.add(n.fromBufferAttribute(N,i));
        sum.normalize();
        for(const i of ids) N.setXYZ(i,sum.x,sum.y,sum.z);
      }
      N.needsUpdate = true;
      o.geometry = geo;
      o.userData.towelShoulderCapTrianglesRemoved = removed;
    });
  });
}

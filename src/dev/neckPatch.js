/* Patient08 neck-only repair. Preserve all original head buffers; reshape only
   the morph-free rim through shader attributes, then loft to the collar. */
import * as THREE from 'three';
export const NECK_BOTTOM=1.28, NECK_TOP=1.415;
const components=['getX','getY','getZ','getW'];
function clip(mesh,M,height,above){
  const old=mesh.geometry,p=old.attributes.position,coords=[];
  for(let i=0;i<p.count;i++)coords.push(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(M));
  const recipes=[],cache=new Map(),segments=[],triangles=[];
  const intersection=(a,b)=>{
    const key=Math.min(a,b)+','+Math.max(a,b);if(cache.has(key))return cache.get(key);
    const t=(height-coords[a].y)/(coords[b].y-coords[a].y),i=p.count+recipes.length;
    recipes.push({a,b,t});coords.push(coords[a].clone().lerp(coords[b],t));cache.set(key,i);return i;
  };
  const index=old.index.array,inside=i=>above?coords[i].y>=height:coords[i].y<=height;
  for(let f=0;f<index.length;f+=3){
    const poly=[],cross=[];
    for(let j=0;j<3;j++){
      const a=index[f+j],b=index[f+(j+1)%3],ia=inside(a),ib=inside(b);
      if(ia)poly.push(a);
      if(ia!==ib){const v=intersection(a,b);poly.push(v);cross.push(v);}
    }
    if(cross.length===2)segments.push(cross);
    for(let j=1;j+1<poly.length;j++)triangles.push(poly[0],poly[j],poly[j+1]);
  }
  const expand=attribute=>{
    const size=attribute.itemSize,values=new Float32Array((p.count+recipes.length)*size);
    for(let i=0;i<p.count;i++)for(let k=0;k<size;k++)values[i*size+k]=attribute[components[k]](i);
    for(let j=0;j<recipes.length;j++){
      const {a,b,t}=recipes[j];for(let k=0;k<size;k++)values[(p.count+j)*size+k]=values[a*size+k]*(1-t)+values[b*size+k]*t;
    }
    return new THREE.BufferAttribute(values,size);
  };
  const g=new THREE.BufferGeometry();
  for(const [name,a] of Object.entries(old.attributes))g.setAttribute(name,expand(a));
  g.morphTargetsRelative=old.morphTargetsRelative;
  for(const [name,targets] of Object.entries(old.morphAttributes))g.morphAttributes[name]=targets.map(expand);
  g.setIndex(triangles);mesh.geometry=g;
  // UV-split vertices share the same contour point. Sorting by angle is valid for
  // these convex anatomical neck/chest sections; reject an absent section.
  const unique=new Map();
  for(const edge of segments)for(const i of edge){const c=coords[i],key=c.toArray().map(v=>Math.round(v*100000)).join(',');if(!unique.has(key))unique.set(key,i);}
  const keyOf=i=>coords[i].toArray().map(v=>Math.round(v*100000)).join(',');
  const graph=new Map();for(const [a,b] of segments){const ka=keyOf(a),kb=keyOf(b);if(!graph.has(ka))graph.set(ka,new Set());if(!graph.has(kb))graph.set(kb,new Set());graph.get(ka).add(kb);graph.get(kb).add(ka);}
  const seen=new Set(),groups=[];
  for(const key of graph.keys())if(!seen.has(key)){
    const stack=[key],group=[];seen.add(key);
    while(stack.length){const k=stack.pop();group.push(unique.get(k));for(const j of graph.get(k))if(!seen.has(j)){seen.add(j);stack.push(j);}}
    groups.push(group);
  }
  groups.sort((a,b)=>b.length-a.length);
  // The body mask leaves separate front/back arcs at the collar. Both belong
  // to the outer section. The head also contains a small internal contour;
  // select the largest connected component instead of the most central one.
  const loop=(above?groups[0]:groups.flat()).map(i=>({i,p:coords[i]}));
  if(loop.length<8)throw new Error('patient08 neck section missing');
  const center=loop.reduce((v,x)=>v.add(x.p),new THREE.Vector3()).multiplyScalar(1/loop.length);
  for(const x of loop){x.angle=Math.atan2(x.p.z-center.z,x.p.x-center.x);if(x.angle<0)x.angle+=Math.PI*2;}
  loop.sort((a,b)=>a.angle-b.angle);
  return {mesh,loop,center,M,groups:groups.map(g=>g.map(i=>coords[i].toArray()))};
}
function headBoundary(mesh,M){
  const g=mesh.geometry,p=g.attributes.position,coords=[],keys=[],unique=new Map(),edges=new Map();
  for(let i=0;i<p.count;i++){
    const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(M);coords.push(v);
    const key=v.toArray().map(x=>Math.round(x*100000)).join(',');keys.push(key);if(!unique.has(key))unique.set(key,i);
  }
  const idx=g.index.array;
  for(let f=0;f<idx.length;f+=3)for(let j=0;j<3;j++){
    const a=keys[idx[f+j]],b=keys[idx[f+(j+1)%3]];if(a===b)continue;
    const key=a<b?a+'|'+b:b+'|'+a;const e=edges.get(key);if(e)e.count++;else edges.set(key,{a,b,count:1});
  }
  const graph=new Map();for(const e of edges.values())if(e.count===1){
    if(!graph.has(e.a))graph.set(e.a,new Set());if(!graph.has(e.b))graph.set(e.b,new Set());graph.get(e.a).add(e.b);graph.get(e.b).add(e.a);
  }
  const seen=new Set(),groups=[];
  for(const key of graph.keys())if(!seen.has(key)){
    const stack=[key],group=[];seen.add(key);while(stack.length){const k=stack.pop();group.push(unique.get(k));for(const j of graph.get(k))if(!seen.has(j)){seen.add(j);stack.push(j);}}groups.push(group);
  }
  // The neck is the lowest external opening. Mouth/eye components lie higher.
  groups.sort((a,b)=>Math.min(...a.map(i=>coords[i].y))-Math.min(...b.map(i=>coords[i].y)));
  const component=groups[0], boundary=new Set(component.map(i=>keys[i]));
  if(component.length<8)throw new Error('patient08 original neck boundary missing');
  // Follow actual welded edges: the stepped rim is not star-shaped.
  const ordered=[];let current=keys[component[0]],previous=null;
  do {
    ordered.push(unique.get(current));
    const neighbors=[...graph.get(current)];
    if(neighbors.length!==2)throw new Error('patient08 neck boundary is not a closed manifold ring');
    const next=neighbors.find(k=>k!==previous);previous=current;current=next;
  } while(current!==keys[component[0]]&&ordered.length<=component.length);
  if(ordered.length!==component.length)throw new Error('patient08 neck boundary traversal failed');
  const area=ordered.reduce((sum,i,j)=>{const a=coords[i],b=coords[ordered[(j+1)%ordered.length]];return sum+a.x*b.z-b.x*a.z;},0);
  if(area<0)ordered.reverse();

  // Only morph-free lower-neck vertices may change. Keep the actual position,
  // normal, index and morph buffers intact: the shader adds separate corrections.
  const neighbors=new Map(),protectedKeys=new Set(),linear=new THREE.Matrix3().setFromMatrix4(M),delta=new THREE.Vector3();
  for(let i=0;i<p.count;i++){
    let protectedVertex=coords[i].y>=1.415;
    for(const target of g.morphAttributes.position||[]){
      if(delta.fromBufferAttribute(target,i).applyMatrix3(linear).lengthSq()>1e-14){protectedVertex=true;break;}
    }
    if(protectedVertex)protectedKeys.add(keys[i]);
    if(!neighbors.has(keys[i]))neighbors.set(keys[i],new Set());
  }
  for(let f=0;f<idx.length;f+=3)for(let j=0;j<3;j++){
    const a=keys[idx[f+j]],b=keys[idx[f+(j+1)%3]];if(a!==b){neighbors.get(a).add(b);neighbors.get(b).add(a);}
  }
  if([...boundary].some(k=>protectedKeys.has(k)))throw new Error('patient08 neck rim overlaps protected face');
  const lengths=[0];for(let j=1;j<=ordered.length;j++)lengths.push(lengths[j-1]+coords[ordered[j-1]].distanceTo(coords[ordered[j%ordered.length]]));
  const perimeter=lengths.at(-1);let cosine=0,sine=0;
  for(let j=0;j<ordered.length;j++){
    const a=coords[ordered[j]],phase=2*Math.PI*lengths[j]/perimeter,original=Math.atan2(a.z+.012,a.x);
    cosine+=Math.cos(original-phase);sine+=Math.sin(original-phase);
  }
  const phase=Math.atan2(sine,cosine),offsets=new Map(),distance=new Map(),queue=[];
  for(let j=0;j<ordered.length;j++){
    const i=ordered[j],angle=phase+2*Math.PI*lengths[j]/perimeter;
    offsets.set(keys[i],new THREE.Vector3(.070*Math.cos(angle),1.350,-.012+.080*Math.sin(angle)).sub(coords[i]));
    distance.set(keys[i],0);queue.push(keys[i]);
  }
  // Geodesic fade, never crossing the face's protected vertices.
  for(let q=0;q<queue.length;q++){
    const k=queue[q];for(const other of neighbors.get(k)){
      if(protectedKeys.has(other))continue;
      const d=distance.get(k)+coords[unique.get(k)].distanceTo(coords[unique.get(other)]);
      if(d<.065&&d<(distance.get(other)??Infinity)){distance.set(other,d);queue.push(other);}
    }
  }
  for(const k of distance.keys())if(!offsets.has(k))offsets.set(k,new THREE.Vector3());
  for(let iteration=0;iteration<160;iteration++){
    const next=new Map();for(const [k,offset] of offsets){
      if(boundary.has(k)){next.set(k,offset);continue;}
      const sum=new THREE.Vector3();let total=0;
      for(const other of neighbors.get(k)){
        const w=1/Math.max(.001,coords[unique.get(k)].distanceTo(coords[unique.get(other)]));
        if(offsets.has(other))sum.addScaledVector(offsets.get(other),w);total+=w;
      }
      next.set(k,sum.multiplyScalar(1/total));
    }
    for(const [k,v] of next)offsets.set(k,v);
  }
  const correction=new Float32Array(p.count*3),normalCorrection=new Float32Array(p.count*3),inverseLinear=linear.clone().invert();
  const corrected=coords.map((v,i)=>v.clone().add(offsets.get(keys[i])||new THREE.Vector3())),normalSums=new Map();
  for(let f=0;f<idx.length;f+=3){
    const a=idx[f],b=idx[f+1],c=idx[f+2],n=corrected[b].clone().sub(corrected[a]).cross(corrected[c].clone().sub(corrected[a]));
    for(const i of [a,b,c]){if(!normalSums.has(keys[i]))normalSums.set(keys[i],new THREE.Vector3());normalSums.get(keys[i]).add(n);}
  }
  const normalBack=new THREE.Matrix3().setFromMatrix4(M).transpose(),normal=g.attributes.normal;
  let changed=0,protectedCount=0;
  for(let i=0;i<p.count;i++){
    if(protectedKeys.has(keys[i])){protectedCount++;continue;}
    const d=offsets.get(keys[i]);if(!d||d.lengthSq()<1e-16)continue;
    changed++;d.clone().applyMatrix3(inverseLinear).toArray(correction,3*i);
    normalSums.get(keys[i]).clone().normalize().applyMatrix3(normalBack).normalize().sub(new THREE.Vector3().fromBufferAttribute(normal,i)).toArray(normalCorrection,3*i);
  }
  g.setAttribute('aRepairOffset',new THREE.Float32BufferAttribute(correction,3));
  g.setAttribute('aRepairNormalCorrection',new THREE.Float32BufferAttribute(normalCorrection,3));
  g.userData.repairProtection={protectedCount,changed,protectedMoved:0};
  const loop=ordered.map((i,j)=>({i,p:corrected[i],angle:(phase+2*Math.PI*lengths[j]/perimeter+2*Math.PI)%(2*Math.PI)}));
  loop.sort((a,b)=>a.angle-b.angle);
  const center=loop.reduce((v,x)=>v.add(x.p),new THREE.Vector3()).multiplyScalar(1/loop.length);
  return {mesh,loop,center,M,groups:groups.map(g=>g.map(i=>corrected[i].toArray()))};
}
function sample(section,angle){
  const loop=section.loop,n=loop.length;
  let j=0;while(j<n&&loop[j].angle<=angle)j++;
  const a=loop[(j+n-1)%n],b=loop[j%n];
  let lo=a.angle,hi=b.angle,t=angle;if(hi<=lo)hi+=Math.PI*2;if(t<lo)t+=Math.PI*2;
  const f=(t-lo)/(hi-lo);
  return {a:a.i,b:b.i,t:f,p:a.p.clone().lerp(b.p,f)};
}
export function makeNeckPatch(model,bodyRest,headRest,toAnatomy){
  const body=model.neckSkin,head=model.skinMesh;
  const bottom=clip(body,toAnatomy.clone().multiply(bodyRest),NECK_BOTTOM,false);
  const top=headBoundary(head,toAnatomy.clone().multiply(headRest));
  const angles=[...new Set([...top.loop,...bottom.loop].map(v=>v.angle.toFixed(8)))].map(Number).sort((a,b)=>a-b);
  const n=angles.length,rows=24,positions=[],uvs=[],indices=[],morphs=[],heights=[];
  const tops=angles.map(a=>sample(top,a)),bottoms=angles.map(a=>sample(bottom,a));
  const headTargets=head.geometry.morphAttributes.position||[],bodyTargets=body.geometry.morphAttributes.position||[];
  const hs=new THREE.Matrix3().setFromMatrix4(top.M),bs=new THREE.Matrix3().setFromMatrix4(bottom.M);
  const interp=(attribute,s)=>new THREE.Vector3(attribute.getX(s.a),attribute.getY(s.a),attribute.itemSize>2?attribute.getZ(s.a):0)
    .lerp(new THREE.Vector3(attribute.getX(s.b),attribute.getY(s.b),attribute.itemSize>2?attribute.getZ(s.b):0),s.t);
  for(let k=0;k<headTargets.length+bodyTargets.length;k++)morphs.push([]);
  for(let row=0;row<=rows;row++){
    const t=row/rows,y=THREE.MathUtils.lerp(NECK_BOTTOM,NECK_TOP,t);
    // Most of the collar section remains under the shirt. It eases into the
    // patient's own top-neck contour, rather than a generated human shape.
    const blend=THREE.MathUtils.smoothstep(t,0,.35);
    for(let j=0;j<n;j++){
      const v=bottoms[j].p.clone().lerp(tops[j].p,blend);v.y=THREE.MathUtils.lerp(NECK_BOTTOM,tops[j].p.y,t);positions.push(v.x,v.y,v.z);heights.push(tops[j].p.y);
      const uv=interp(head.geometry.attributes.uv,tops[j]);uvs.push(uv.x,uv.y);
      for(let k=0;k<headTargets.length;k++){
        const d=interp(headTargets[k],tops[j]).applyMatrix3(hs).multiplyScalar(t);morphs[k].push(d.x,d.y,d.z);
      }
      for(let k=0;k<bodyTargets.length;k++){
        const d=interp(bodyTargets[k],bottoms[j]).applyMatrix3(bs).multiplyScalar(1-t);morphs[headTargets.length+k].push(d.x,d.y,d.z);
      }
    }
  }
  for(let row=0;row<rows;row++)for(let j=0;j<n;j++){
    const a=row*n+j,b=row*n+(j+1)%n,c=(row+1)*n+j,d=(row+1)*n+(j+1)%n;
    // Ring angles increase from +X toward +Z, giving outward winding.
    indices.push(a,c,b,b,c,d);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('aRepairHeight',new THREE.Float32BufferAttribute(heights,1));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  geometry.morphTargetsRelative=true;geometry.morphAttributes.position=morphs.map(a=>new THREE.Float32BufferAttribute(a,3));
  // Match endpoint shading without changing any authored facial normals.
  const patchNormal=geometry.attributes.normal,normalHead=new THREE.Matrix3().getNormalMatrix(top.M),normalBody=new THREE.Matrix3().getNormalMatrix(bottom.M);
  for(let row=0;row<=rows;row++)for(let j=0;j<n;j++){
    const t=row/rows,i=row*n+j,norm=new THREE.Vector3().fromBufferAttribute(patchNormal,i);
    if(t>.65){
      const h=interp(head.geometry.attributes.normal,tops[j]);
      if(head.geometry.attributes.aRepairNormalCorrection)h.add(interp(head.geometry.attributes.aRepairNormalCorrection,tops[j]));
      norm.lerp(h.applyMatrix3(normalHead).normalize(),THREE.MathUtils.smoothstep(t,.65,1));
    }else if(t<.2)norm.lerp(interp(body.geometry.attributes.normal,bottoms[j]).applyMatrix3(normalBody).normalize(),1-THREE.MathUtils.smoothstep(t,0,.2));
    norm.normalize();patchNormal.setXYZ(i,norm.x,norm.y,norm.z);
  }
  const material=head.material.clone();material.name='patient08.neckPatch';material.userData.bodySkin=true;
  // A single UV row stretched along the whole tube creates dark vertical stripes.
  // Use the patient's own median neck texel as a uniform skin colour instead.
  let skinRGB=[215,177,138];
  const image=head.material.map?.image;
  if(image&&typeof document!=='undefined'){
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
    const samples=[];
    for(const sample of tops){
      const uv=interp(head.geometry.attributes.uv,sample),x=Math.max(0,Math.min(image.width-1,Math.floor(uv.x*image.width))),
        y=Math.max(0,Math.min(image.height-1,Math.floor((head.material.map.flipY?1-uv.y:uv.y)*image.height)));
      const pixel=context.getImageData(x,y,1,1).data;
      if(pixel[0]>100&&pixel[1]>65&&pixel[2]>40)samples.push([...pixel].slice(0,3));
    }
    if(samples.length)skinRGB=[0,1,2].map(k=>samples.map(v=>v[k]).sort((a,b)=>a-b)[Math.floor(samples.length/2)]);
  }
  // castTone owns the material colour. Keep the sampled skin texel in a map
  // so its routine tint refresh cannot turn the new neck white.
  material.map=new THREE.DataTexture(new Uint8Array([...skinRGB,255]),1,1,THREE.RGBAFormat);
  material.map.encoding=THREE.sRGBEncoding;material.map.needsUpdate=true;material.color.setHex(0xffffff);material.normalMap=null;material.roughness=.62;
  const patch=new THREE.Mesh(geometry,material);patch.name='patient08_neck_patch';patch.frustumCulled=false;patch.castShadow=patch.receiveShadow=true;
  const fromAnatomy=toAnatomy.clone().invert(),local=model.body.matrixWorld.clone().invert().multiply(fromAnatomy);
  local.decompose(patch.position,patch.quaternion,patch.scale);model.body.add(patch);model.bodyMeshes.push(patch);model.body.updateMatrixWorld(true);
  patch.updateMorphTargets();
  return {patch,rest:fromAnatomy,rows,n,tops,bottoms,top,bottom,
    sync(){for(let k=0;k<headTargets.length;k++)patch.morphTargetInfluences[k]=head.morphTargetInfluences[k]||0;
      for(let k=0;k<bodyTargets.length;k++)patch.morphTargetInfluences[headTargets.length+k]=body.morphTargetInfluences[k]||0;}};
}

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
function headBoundary(mesh,M,version=1){
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
  const face=new THREE.Vector3();let faceCount=0;
  for(let i=0;i<p.count;i++){
    let protectedVertex=coords[i].y>=1.415;
    for(const target of g.morphAttributes.position||[]){
      if(delta.fromBufferAttribute(target,i).applyMatrix3(linear).lengthSq()>1e-14){protectedVertex=true;face.add(coords[i]);faceCount++;break;}
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
  // v2: under the chin the ring keeps the rim's own place, low-passed along the rim (sigma 3.5 cm of arc), so only the
  // steps of the cut become slopes. The flat ellipse at y=1.35 pulled that rim 2.8 cm up and 1.3 cm in, against the
  // fixed jaw (folds). The back keeps the ellipse: its trapezius wings sit 5 cm higher and 6 cm out, and pulling
  // them in level turns faces over.
  const front=Math.atan2(face.z/Math.max(1,faceCount)+.012,face.x/Math.max(1,faceCount));
  const rimTarget=ordered.map((_,j)=>{
    const angle=phase+2*Math.PI*lengths[j]/perimeter,ellipse=new THREE.Vector3(.070*Math.cos(angle),1.350,-.012+.080*Math.sin(angle));
    if(version<2)return ellipse;
    const share=THREE.MathUtils.smoothstep(Math.cos(angle-front),-.6,.9),own=new THREE.Vector3();let total=0;   // a wide blend: a steep rim slope folds the twist
    for(let k=0;k<ordered.length;k++){
      let d=Math.abs(lengths[k]-lengths[j]);d=Math.min(d,perimeter-d);
      const w=Math.exp(-.5*(d/.035)**2);own.addScaledVector(coords[ordered[k]],w);total+=w;
    }
    own.multiplyScalar(1/total);own.y=THREE.MathUtils.clamp(own.y,1.33,1.40);   // at least 5 cm of column under the chin for the twist
    return ellipse.lerp(own,share);
  });
  for(let j=0;j<ordered.length;j++){
    const i=ordered[j];
    offsets.set(keys[i],rimTarget[j].clone().sub(coords[i]));
    distance.set(keys[i],0);queue.push(keys[i]);
  }
  // Geodesic fade, never crossing the face's protected vertices.
  for(let q=0;q<queue.length;q++){
    const k=queue[q];for(const other of neighbors.get(k)){
      if(protectedKeys.has(other))continue;
      const d=distance.get(k)+coords[unique.get(k)].distanceTo(coords[unique.get(other)]);
      if(d<(version>1?.09:.065)&&d<(distance.get(other)??Infinity)){distance.set(other,d);queue.push(other);}
    }
  }
  for(const k of distance.keys())if(!offsets.has(k))offsets.set(k,new THREE.Vector3());
  for(let iteration=0;iteration<(version>1?400:160);iteration++){
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
  // fold check: faces the correction turned over or squashed below 30 % of their area
  let flips=0,squash=0;const e1=new THREE.Vector3(),e2=new THREE.Vector3(),n0=new THREE.Vector3(),n1=new THREE.Vector3();
  for(let f=0;f<idx.length;f+=3){
    const a=idx[f],b=idx[f+1],c=idx[f+2];if(![a,b,c].some(i=>offsets.get(keys[i])?.lengthSq()>1e-16))continue;
    n0.crossVectors(e1.subVectors(coords[b],coords[a]),e2.subVectors(coords[c],coords[a]));
    n1.crossVectors(e1.subVectors(corrected[b],corrected[a]),e2.subVectors(corrected[c],corrected[a]));
    const A0=n0.length(),A1=n1.length();if(A0<1e-12)continue;
    if(n0.dot(n1)<0)flips++;else if(A1/A0<.3)squash++;
  }
  g.userData.repairProtection={protectedCount,changed,protectedMoved:0,flips,squash};
  const loop=ordered.map((i,j)=>({i,p:corrected[i],angle:(phase+2*Math.PI*lengths[j]/perimeter+2*Math.PI)%(2*Math.PI)}));
  loop.sort((a,b)=>a.angle-b.angle);
  const center=loop.reduce((v,x)=>v.add(x.p),new THREE.Vector3()).multiplyScalar(1/loop.length);
  face.multiplyScalar(1/Math.max(1,faceCount));
  return {mesh,loop,center,M,front:Math.atan2(face.z+.012,face.x),groups:groups.map(g=>g.map(i=>corrected[i].toArray()))};
}
// v2 relief in metres along the ring normal: thyroid prominence and the two sternocleidomastoid ridges
// (front low -> behind the ear high), 0 at the collar flange and at the head seam
function sculpt(da,t){
  const env=Math.sin(Math.PI*THREE.MathUtils.clamp((t-.35)/.62,0,1));
  const g=(x,s)=>Math.exp(-.5*(x/s)**2), wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const scm=THREE.MathUtils.lerp(.42,1.9,THREE.MathUtils.clamp((t-.35)/.62,0,1));
  return env*(.004*g(wrap(da),.2)*g(t-.55,.12)+.0025*(g(wrap(da-scm),.34)+g(wrap(da+scm),.34))-.0015);   // broad ridges: a narrow one reads as a cut when stretched
}
// smooth per-column values around the ring (angles in radians), sigma in radians
function ringSmooth(angles,values,sigma){
  return values.map((_,j)=>{
    const out=values[0].clone().multiplyScalar(0);let total=0;
    for(let k=0;k<values.length;k++){
      const d=Math.atan2(Math.sin(angles[k]-angles[j]),Math.cos(angles[k]-angles[j])),w=Math.exp(-.5*(d/sigma)**2);
      out.addScaledVector(values[k],w);total+=w;
    }
    return out.multiplyScalar(1/total);
  });
}
// texel colour (linear) of a sampled ring point, or null off the skin
function texel(material,uvAttribute,s,interp,cache){
  const image=material?.map?.image;if(!image||typeof document==='undefined')return null;
  let context=cache.get(image);
  if(!context){const c=document.createElement('canvas');c.width=image.width;c.height=image.height;context=c.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);cache.set(image,context);}
  const uv=interp(uvAttribute,s),x=Math.max(0,Math.min(image.width-1,Math.floor(uv.x*image.width))),
    y=Math.max(0,Math.min(image.height-1,Math.floor((material.map.flipY?1-uv.y:uv.y)*image.height)));
  const px=context.getImageData(x,y,1,1).data;
  if(!(px[0]>100&&px[1]>65&&px[2]>40))return null;
  return new THREE.Color().setRGB(px[0]/255,px[1]/255,px[2]/255).convertSRGBToLinear();
}
// v2 skin grain: +-2 % value noise in rest anatomy space, so the neck is not one flat paint
const GRAIN=`
varying vec3 vRepairGrain;
float repairHash(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float repairNoise(vec3 x){ vec3 i=floor(x),f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(repairHash(i),repairHash(i+vec3(1,0,0)),f.x),mix(repairHash(i+vec3(0,1,0)),repairHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(repairHash(i+vec3(0,0,1)),repairHash(i+vec3(1,0,1)),f.x),mix(repairHash(i+vec3(0,1,1)),repairHash(i+vec3(1,1,1)),f.x),f.y),f.z); }
`;
function skinGrain(shader){
  if(!shader.fragmentShader.includes('#include <color_fragment>'))return;   // depth / distance passes
  shader.vertexShader='varying vec3 vRepairGrain;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRepairGrain=position;');
  shader.fragmentShader=GRAIN+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    diffuseColor.rgb*=1.0+0.04*(repairNoise(vRepairGrain*260.0)-0.5)+0.03*(repairNoise(vRepairGrain*55.0)-0.5);`);
}
function sample(section,angle){
  const loop=section.loop,n=loop.length;
  let j=0;while(j<n&&loop[j].angle<=angle)j++;
  const a=loop[(j+n-1)%n],b=loop[j%n];
  let lo=a.angle,hi=b.angle,t=angle;if(hi<=lo)hi+=Math.PI*2;if(t<lo)t+=Math.PI*2;
  const f=(t-lo)/(hi-lo);
  return {a:a.i,b:b.i,t:f,p:a.p.clone().lerp(b.p,f)};
}
export function makeNeckPatch(model,bodyRest,headRest,toAnatomy,version=1){
  const body=model.neckSkin,head=model.skinMesh;
  const bottom=clip(body,toAnatomy.clone().multiply(bodyRest),NECK_BOTTOM,false);
  const top=headBoundary(head,toAnatomy.clone().multiply(headRest),version);
  const angles=[...new Set([...top.loop,...bottom.loop].map(v=>v.angle.toFixed(8)))].map(Number).sort((a,b)=>a-b);
  const n=angles.length,rows=24,positions=[],uvs=[],indices=[],morphs=[],heights=[],rowW=[];
  const tops=angles.map(a=>sample(top,a)),bottoms=angles.map(a=>sample(bottom,a));
  const headTargets=head.geometry.morphAttributes.position||[],bodyTargets=body.geometry.morphAttributes.position||[];
  const hs=new THREE.Matrix3().setFromMatrix4(top.M),bs=new THREE.Matrix3().setFromMatrix4(bottom.M);
  const interp=(attribute,s)=>new THREE.Vector3(attribute.getX(s.a),attribute.getY(s.a),attribute.itemSize>2?attribute.getZ(s.a):0)
    .lerp(new THREE.Vector3(attribute.getX(s.b),attribute.getY(s.b),attribute.itemSize>2?attribute.getZ(s.b):0),s.t);
  for(let k=0;k<headTargets.length+bodyTargets.length;k++)morphs.push([]);
  // v2: the body section at the collar has 13-19 cm trapezius spikes. Only the seam row keeps them; the rows above
  // start from the ring-smoothed section, so a stretch that lifts them out of the shirt shows no zigzag fold.
  const smoothBottom=version>1?ringSmooth(angles,bottoms.map(b=>b.p),.35):null;
  for(let row=0;row<=rows;row++){
    const t=row/rows,y=THREE.MathUtils.lerp(NECK_BOTTOM,NECK_TOP,t);
    // Most of the collar section remains under the shirt. It eases into the
    // patient's own top-neck contour, rather than a generated human shape.
    const blend=THREE.MathUtils.smoothstep(t,0,.35);
    for(let j=0;j<n;j++){
      const base=smoothBottom?bottoms[j].p.clone().lerp(smoothBottom[j],THREE.MathUtils.smoothstep(t,0,.12)):bottoms[j].p;
      const v=base.clone().lerp(tops[j].p,blend);v.y=THREE.MathUtils.lerp(NECK_BOTTOM,tops[j].p.y,t);
      if(version>1){const d=sculpt(angles[j]-top.front,t);v.x+=Math.cos(angles[j])*d;v.z+=Math.sin(angles[j])*d;}
      positions.push(v.x,v.y,v.z);heights.push(tops[j].p.y);
      // v2: the turn/stretch share starts at row t=.15 (repairWorld). The flange rows below, the trapezius slope
      // under the collar, stay with the body instead of sweeping out of the shirt.
      rowW.push(version>1?.15:-1);
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
  geometry.setAttribute('aRepairHeight',new THREE.Float32BufferAttribute(heights,1));geometry.setAttribute('aRepairW',new THREE.Float32BufferAttribute(rowW,1));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  geometry.morphTargetsRelative=true;geometry.morphAttributes.position=morphs.map(a=>new THREE.Float32BufferAttribute(a,3));
  // Match endpoint shading without changing any authored facial normals.
  const patchNormal=geometry.attributes.normal,normalHead=new THREE.Matrix3().getNormalMatrix(top.M),normalBody=new THREE.Matrix3().getNormalMatrix(bottom.M);
  // v2: the corrected head rim is lumpy; its normals, carried down a third of the tube, drew the stripes under the chin.
  // Use the ring-smoothed rim normal, and only on the last rows.
  const headNormals=version>1?ringSmooth(angles,tops.map(s=>{const h=interp(head.geometry.attributes.normal,s);
    if(head.geometry.attributes.aRepairNormalCorrection)h.add(interp(head.geometry.attributes.aRepairNormalCorrection,s));return h.applyMatrix3(normalHead).normalize();}),.26):null;
  for(let row=0;row<=rows;row++)for(let j=0;j<n;j++){
    const t=row/rows,i=row*n+j,norm=new THREE.Vector3().fromBufferAttribute(patchNormal,i);
    if(headNormals){
      if(t>.9)norm.lerp(headNormals[j].clone().normalize(),THREE.MathUtils.smoothstep(t,.9,1));
      else if(t<.2)norm.lerp(interp(body.geometry.attributes.normal,bottoms[j]).applyMatrix3(normalBody).normalize(),1-THREE.MathUtils.smoothstep(t,0,.2));
    }else if(t>.65){
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
  let grain=null;
  if(version>1){
    // per-vertex skin colour: the exact head texel on the seam row, the ring-smoothed head colour down the tube,
    // the ring-smoothed body texel at the collar. Smoothing around the ring keeps the old stripes out.
    const cache=new Map(),fallback=new THREE.Color().setRGB(skinRGB[0]/255,skinRGB[1]/255,skinRGB[2]/255).convertSRGBToLinear();
    const fill=list=>{const ok=list.filter(Boolean);const avg=ok.length?ok.reduce((a,c)=>a.add(c),new THREE.Color(0,0,0)).multiplyScalar(1/ok.length):fallback;
      return list.map(c=>new THREE.Vector3(...(c||avg).toArray()));};
    const headExact=fill(tops.map(s=>texel(head.material,head.geometry.attributes.uv,s,interp,cache)));
    const headSmooth=ringSmooth(angles,headExact,.44);
    const bodySmooth=body.geometry.attributes.uv?ringSmooth(angles,fill(bottoms.map(s=>texel(body.material,body.geometry.attributes.uv,s,interp,cache))),.44):headSmooth;
    const colours=[];
    for(let row=0;row<=rows;row++)for(let j=0;j<n;j++){
      const t=row/rows,c=bodySmooth[j].clone().lerp(headSmooth[j],THREE.MathUtils.smoothstep(t,.05,.5)).lerp(headExact[j],THREE.MathUtils.smoothstep(t,.88,1));
      colours.push(c.x,c.y,c.z);
    }
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));material.vertexColors=true;
    material.map=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1,THREE.RGBAFormat);grain=skinGrain;
  }else material.map=new THREE.DataTexture(new Uint8Array([...skinRGB,255]),1,1,THREE.RGBAFormat);
  material.map.encoding=THREE.sRGBEncoding;material.map.needsUpdate=true;material.color.setHex(0xffffff);material.normalMap=null;material.roughness=.62;
  const patch=new THREE.Mesh(geometry,material);patch.name='patient08_neck_patch';patch.frustumCulled=false;patch.castShadow=patch.receiveShadow=true;
  const fromAnatomy=toAnatomy.clone().invert(),local=model.body.matrixWorld.clone().invert().multiply(fromAnatomy);
  local.decompose(patch.position,patch.quaternion,patch.scale);model.body.add(patch);model.bodyMeshes.push(patch);model.body.updateMatrixWorld(true);
  patch.updateMorphTargets();
  return {patch,grain,rest:fromAnatomy,rows,n,tops,bottoms,top,bottom,
    sync(){for(let k=0;k<headTargets.length;k++)patch.morphTargetInfluences[k]=head.morphTargetInfluences[k]||0;
      for(let k=0;k<bodyTargets.length;k++)patch.morphTargetInfluences[headTargets.length+k]=body.morphTargetInfluences[k]||0;}};
}

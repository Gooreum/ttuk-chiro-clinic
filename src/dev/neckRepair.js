/* patient08 only, case build: the two skin pieces share one continuous neck field.
   Evaluate AFTER blended morph targets. Original face buffers, UVs and expressions
   remain untouched; CPU probes evaluate the same function as the vertex shader. */
import * as THREE from 'three';
import {pivot} from '../scene/patientModel.js';
import {makeNeckPatch} from './neckPatch.js';

const GLSL = `
attribute float aRepairRigid;
attribute float aRepairHeight, aRepairW;
attribute vec3 aRepairOffset, aRepairNormalCorrection;
uniform mat4 uRepairRest, uRepairToAnatomy, uRepairFromAnatomy, uRepairInverseModel;
uniform mat3 uRepairNormalRest;
uniform vec3 uRepairPivot, uRepairMove;
uniform vec4 uRepairTurn;
uniform float uRepairSlide;
vec3 repairSculpt(vec3 a){ return a; }
vec3 repairWorld(vec3 world,float rigid){
  if(rigid< -0.5)return world+vec3(0.0,0.0,uRepairSlide);
  if(rigid>0.5){
    vec3 p=world-uRepairPivot,axis=uRepairTurn.xyz;float angle=uRepairTurn.w;
    return p*cos(angle)+cross(axis,p)*sin(angle)+axis*dot(axis,p)*(1.0-cos(angle))+uRepairPivot+uRepairMove;
  }
  vec3 a=repairSculpt((uRepairToAnatomy*vec4(world,1.0)).xyz);
  // patch v2: aRepairW is the row where the share starts (row t = height fraction of the column), so the collar
  // flange stays put. It stays a function of position: repairNormal differentiates it for the stretched normals.
  float w=aRepairW<0.0?smoothstep(1.28,aRepairHeight,a.y):smoothstep(aRepairW,1.0,(a.y-1.28)/(aRepairHeight-1.28));
  vec3 point=(uRepairFromAnatomy*vec4(a,1.0)).xyz;
  vec3 center=(uRepairFromAnatomy*vec4(0.0,a.y,0.005,1.0)).xyz;
  vec3 axis=uRepairTurn.xyz;float angle=uRepairTurn.w*w;
  vec3 p=point-center;
  vec3 v=p*cos(angle)+cross(axis,p)*sin(angle)+axis*dot(axis,p)*(1.0-cos(angle));
  vec3 cp=center-uRepairPivot;float whole=uRepairTurn.w;
  vec3 moved=cp*cos(whole)+cross(axis,cp)*sin(whole)+axis*dot(axis,cp)*(1.0-cos(whole))+uRepairPivot+uRepairMove;
  return v+center+(moved-center)*w+vec3(0.0,0.0,uRepairSlide*(1.0-w));
}
vec3 repairNormal(vec3 p,vec3 n){
  float e=0.00005;
  vec3 a=(repairWorld(p+vec3(e,0.0,0.0),aRepairRigid)-repairWorld(p-vec3(e,0.0,0.0),aRepairRigid))/(2.0*e);
  vec3 b=(repairWorld(p+vec3(0.0,e,0.0),aRepairRigid)-repairWorld(p-vec3(0.0,e,0.0),aRepairRigid))/(2.0*e);
  vec3 c=(repairWorld(p+vec3(0.0,0.0,e),aRepairRigid)-repairWorld(p-vec3(0.0,0.0,e),aRepairRigid))/(2.0*e);
  float d=dot(a,cross(b,c));
  if(abs(d)<0.000001)return normalize(n);
  return normalize((cross(b,c)*n.x+cross(c,a)*n.y+cross(a,b)*n.z)/d);
}
`;
const smooth=(a,b,x)=>THREE.MathUtils.smoothstep(x,a,b);
const sculpt=a=>a;
const weight=a=>smooth(1.28,1.415,a.y)*(1-smooth(.14,.19,Math.abs(a.x)));

export function repairNeck(model, version=1){
  const body=model.neckSkin, head=model.skinMesh;
  model.body.updateWorldMatrix(true,true);head.updateWorldMatrix(true,false);
  const toAnatomy=model.head.matrixWorld.clone().invert(), fromAnatomy=toAnatomy.clone().invert();
  const bi=body.skeleton.bones.findIndex(b=>b.name==='body');
  const restHead=head.matrixWorld.clone(), restHeadInverse=restHead.clone().invert();
  const restBody=body.skeleton.bones[bi].matrixWorld.clone().multiply(body.skeleton.boneInverses[bi]).multiply(body.bindMatrix);
  const originalHeadGeometry=head.geometry;
  const patchInfo=makeNeckPatch(model,restBody,restHead,toAnatomy,version);
  const records=[], q=new THREE.Quaternion(), scale=new THREE.Vector3(), trans=new THREE.Vector3();
  const P=pivot.position.clone(), turn=new THREE.Vector4(0,0,1,0), move=new THREE.Vector3();
  const initialZ=model.body.position.z, v=new THREE.Vector3(), a=new THREE.Vector3(), axis=new THREE.Vector3();
  let slide=0;
  for(const [mesh,rest] of [[body,restBody],[head,restHead],[patchInfo.patch,patchInfo.rest]]){
    const geometry=mesh.geometry,p=geometry.attributes.position;
    const original=p.array.slice(), morphOriginal=(geometry.morphAttributes.position||[]).map(m=>m.array.slice());
    const world=new Float32Array(p.count*3),weights=new Float32Array(p.count),rigid=new Float32Array(p.count),anatomy=[];
    for(let i=0;i<p.count;i++){
      a.fromBufferAttribute(p,i);if(geometry.attributes.aRepairOffset)a.add(new THREE.Vector3().fromBufferAttribute(geometry.attributes.aRepairOffset,i));a.applyMatrix4(rest).applyMatrix4(toAnatomy);rigid[i]=mesh===head?1:mesh===body?-1:(i<patchInfo.n?-1:i>=patchInfo.rows*patchInfo.n?1:0);sculpt(a);
      anatomy.push(a.toArray());weights[i]=weight(a);a.applyMatrix4(fromAnatomy).toArray(world,3*i);
    }
    if(!geometry.attributes.aRepairHeight)geometry.setAttribute("aRepairHeight",new THREE.BufferAttribute(new Float32Array(p.count).fill(1.415),1));
    if(!geometry.attributes.aRepairW)geometry.setAttribute("aRepairW",new THREE.BufferAttribute(new Float32Array(p.count).fill(-1),1));
    for(const name of ["aRepairOffset","aRepairNormalCorrection"])if(!geometry.attributes[name])geometry.setAttribute(name,new THREE.Float32BufferAttribute(new Float32Array(p.count*3),3));
    if(version>1&&!geometry.attributes.aRepairTint)geometry.setAttribute("aRepairTint",new THREE.Float32BufferAttribute(new Float32Array(p.count*4),4));
    geometry.setAttribute("aRepairRigid",new THREE.BufferAttribute(rigid,1));
    const uniforms={uRepairRest:{value:rest},uRepairToAnatomy:{value:toAnatomy},uRepairFromAnatomy:{value:fromAnatomy},
      uRepairInverseModel:{value:mesh.matrixWorld.clone().invert()},uRepairNormalRest:{value:new THREE.Matrix3().getNormalMatrix(rest)},
      uRepairPivot:{value:P},uRepairMove:{value:move},uRepairTurn:{value:turn},uRepairSlide:{value:0}};
    const grain=mesh===patchInfo.patch&&patchInfo.grain;
    const compile=shader=>{
      if(grain)grain(shader);
      if(version>1&&shader.fragmentShader.includes('#include <color_fragment>')){
        shader.vertexShader='attribute vec4 aRepairTint; varying vec4 vRepairTint;\n'+shader.vertexShader
          .replace('#include <begin_vertex>','#include <begin_vertex>\nvRepairTint=aRepairTint;');
        shader.fragmentShader='varying vec4 vRepairTint;\n'+shader.fragmentShader
          .replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,vRepairTint.rgb*diffuse,vRepairTint.a);');
      }
      Object.assign(shader.uniforms,uniforms);
      shader.vertexShader=GLSL+shader.vertexShader
        .replace('#include <morphnormal_vertex>', '#include <morphnormal_vertex>\nvec3 repairMorphNormal=objectNormal+aRepairNormalCorrection;')
        .replace('#include <skinnormal_vertex>',`#include <skinnormal_vertex>
          { vec3 repairNormalPoint=position+aRepairOffset;
            ${THREE.ShaderChunk.morphtarget_vertex.replaceAll("transformed", "repairNormalPoint")}
            vec3 rp=(uRepairRest*vec4(repairNormalPoint,1.0)).xyz;
            vec3 wn=repairNormal(rp,uRepairNormalRest*repairMorphNormal);
            objectNormal=vec3(dot(modelMatrix[0].xyz,wn),dot(modelMatrix[1].xyz,wn),dot(modelMatrix[2].xyz,wn)); }`)
        .replace('#include <skinning_vertex>',`#include <skinning_vertex>
          transformed=(uRepairInverseModel*vec4(repairWorld((uRepairRest*vec4(repairMorphSource,1.0)).xyz,aRepairRigid),1.0)).xyz;`)
        .replace('#include <morphtarget_vertex>',`#include <morphtarget_vertex>
          vec3 repairMorphSource=transformed+aRepairOffset;`);
    };
    mesh.material.onBeforeCompile=compile;
    mesh.material.customProgramCacheKey=()=> 'patient08-neck-repair-v'+(3+version);mesh.material.needsUpdate=true;
    // Shadow passes must use the same skin, otherwise the old trapezius skirt
    // casts a phantom jagged shadow onto the corrected neck.
    mesh.customDepthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});
    mesh.customDistanceMaterial=new THREE.MeshDistanceMaterial();
    for(const mat of [mesh.customDepthMaterial,mesh.customDistanceMaterial]){mat.onBeforeCompile=compile;mat.customProgramCacheKey=()=> 'patient08-neck-repair-v'+(3+version);}
    records.push({mesh,rest,world,weights,rigid,anatomy,original,morphOriginal,uniforms});
  }
  const si=body.geometry.attributes.skinIndex,sw=body.geometry.attributes.skinWeight;
  for(let i=0;i<si.count;i++){si.setXYZW(i,bi,0,0,0);sw.setXYZW(i,1,0,0,0);}
  si.needsUpdate=sw.needsUpdate=true;body.userData.neckW=records[0].weights;
  const center=new THREE.Vector3(),movedCenter=new THREE.Vector3();
  const field=(point,rigid,height,wStart=-1)=>{
    if(rigid<-.5){point.z+=slide;return point;}
    if(rigid>.5){point.sub(P).applyAxisAngle(axis,turn.w).add(P).add(move);return point;}
    a.copy(point).applyMatrix4(toAnatomy);sculpt(a);const w=wStart<0?smooth(1.28,height,a.y):smooth(wStart,1,(a.y-1.28)/(height-1.28));
    center.set(0,a.y,.005).applyMatrix4(fromAnatomy);
    movedCenter.copy(center).sub(P).applyAxisAngle(axis,turn.w).add(P).add(move).sub(center);
    point.copy(a).applyMatrix4(fromAnatomy).sub(center).applyAxisAngle(axis,turn.w*w).add(center).addScaledVector(movedCenter,w);
    point.z+=slide*(1-w);return point;
  };
  const evaluate=(mesh,out)=>{
    const r=records.find(r=>r.mesh===mesh);if(!r)return null;
    const g=mesh.geometry,p=g.attributes.position,targets=g.morphAttributes.position||[];
    for(let i=0;i<p.count;i++){
      v.fromBufferAttribute(p,i).add(new THREE.Vector3().fromBufferAttribute(g.attributes.aRepairOffset,i));
      for(let k=0;k<targets.length;k++){
        const f=mesh.morphTargetInfluences[k]||0;if(!f)continue;
        const m=targets[k];v.x+=f*m.getX(i);v.y+=f*m.getY(i);v.z+=f*m.getZ(i);
      }
      v.applyMatrix4(r.rest);field(v,r.rigid[i],g.attributes.aRepairHeight?.getX(i)||1.415,g.attributes.aRepairW?.getX(i)??-1).toArray(out,3*i);
    }
    return out;
  };
  const validate=()=>{
    let positionBufferChanges=0,morphBufferChanges=0,nonFinite=0;
    for(const r of records){
      const g=r.mesh.geometry;
      for(let i=0;i<r.original.length;i++){if(g.attributes.position.array[i]!==r.original[i])positionBufferChanges++;if(!Number.isFinite(g.attributes.position.array[i]))nonFinite++;}
      for(let k=0;k<r.morphOriginal.length;k++)for(let i=0;i<r.morphOriginal[k].length;i++)if(g.morphAttributes.position[k].array[i]!==r.morphOriginal[k][i])morphBufferChanges++;
    }
    let protectedVertexChanges=0,faceTintVertices=0;
    const hg=head.geometry,hp=hg.attributes.position,hm=hg.morphAttributes.position||[];
    const hlocal=toAnatomy.clone().multiply(restHead),hlinear=new THREE.Matrix3().setFromMatrix4(hlocal),test=new THREE.Vector3();
    for(let i=0;i<hp.count;i++){
      const protect=test.fromBufferAttribute(hp,i).applyMatrix4(hlocal).y>=1.415||hm.some(m=>test.fromBufferAttribute(m,i).applyMatrix3(hlinear).lengthSq()>1e-14);
      if(protect&&(hg.attributes.aRepairTint?.getW(i)||0)>0)faceTintVertices++;
      if(protect&&['aRepairOffset','aRepairNormalCorrection'].some(name=>test.fromBufferAttribute(hg.attributes[name],i).lengthSq()>0))protectedVertexChanges++;
    }
    const rim=hg.userData.repairProtection||{};
    return {positionBufferChanges,morphBufferChanges,nonFinite,protectedVertexChanges,faceTintVertices,headGeometryReplaced:Number(head.geometry!==originalHeadGeometry),rimFlips:rim.flips,rimSquash:rim.squash};
  };
  const seam=()=>{
    const B=evaluate(body,new Float32Array(body.geometry.attributes.position.count*3));
    const H=evaluate(head,new Float32Array(head.geometry.attributes.position.count*3));
    const N=evaluate(patchInfo.patch,new Float32Array(patchInfo.patch.geometry.attributes.position.count*3)),distances=[];
    const endpoint=new THREE.Vector3(),point=new THREE.Vector3();
    for(let j=0;j<patchInfo.n;j++)for(const [source,s,index] of [[B,patchInfo.bottoms[j],j],[H,patchInfo.tops[j],patchInfo.rows*patchInfo.n+j]]){
      endpoint.fromArray(source,s.a*3).lerp(point.fromArray(source,s.b*3),s.t);point.fromArray(N,index*3);distances.push(endpoint.distanceTo(point)*1000);
    }
    distances.sort((a,b)=>a-b);return {mean:distances.reduce((a,b)=>a+b,0)/distances.length,p95:distances[Math.floor(.95*distances.length)],max:distances[distances.length-1],samples:distances.length};
  };
  model.neckRepair={records,evaluate,validate,seam,update(){
    patchInfo.sync();
    model.body.updateWorldMatrix(true,true);head.updateWorldMatrix(true,false);
    const D=head.matrixWorld.clone().multiply(restHeadInverse);D.decompose(trans,q,scale);
    if(q.w<0){q.x*=-1;q.y*=-1;q.z*=-1;q.w*=-1;}
    axis.set(q.x,q.y,q.z);if(axis.lengthSq()<1e-12)axis.set(0,0,1);else axis.normalize();
    turn.set(axis.x,axis.y,axis.z,2*Math.acos(THREE.MathUtils.clamp(q.w,-1,1)));
    move.copy(P).applyMatrix4(D).sub(P);slide=model.body.position.z-initialZ;
    for(const r of records){r.uniforms.uRepairInverseModel.value.copy(r.mesh.matrixWorld).invert();r.uniforms.uRepairSlide.value=slide;}
    model.neckPinch.value=0;if(model.neckLag)model.neckLag.value=0;
  }};
}

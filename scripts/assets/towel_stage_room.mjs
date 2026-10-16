/** Towel suite mesh authoring fallback for sandboxed Blender Metal startup.
 * Original architecture / upholstery / hardware meshes (project LICENSE). Run from repo root:
 * node scripts/assets/towel_stage_room.mjs /private/tmp/room.glb
 * Uses installed three r149 offline; does not add a runtime dependency or passes.
 */
import * as T from 'three';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
import {mergeBufferGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {writeFileSync} from 'node:fs';
// GLTFExporter uses browser FileReader only for binary Blob assembly.
globalThis.FileReader=class {readAsArrayBuffer(b){b.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();});}};
const scene=new T.Scene(), parts=new Map();
// The fall must have a clear physical envelope behind the original stool pivot.
// Recess the wall and mounted furniture; never move the therapist or camera.
const backWallParts = new Set(['rear wall','back skirting','acoustic inset','acoustic flute','door inset','door stile','door rail','frosted door','reeded glazing','door pull','wall shelf carcass','shelf','rolled linen','linen roll seam','radiator fin']);
const mat=(name,c,r=.7,m=0)=>new T.MeshStandardMaterial({name,color:c,roughness:r,metalness:m});
const room=mat('suite.room',0x17312c),paper=mat('suite.paper',0xf4efe4),mint=mat('suite.mint',0x8adfbf),coral=mat('suite.coral',0xff7a59),metal=mat('suite.brushed-metal',0x8adfbf,.48,.62),dark=mat('suite.recess',0x17312c,.95),vinyl=mat('suite.leather',0x17312c,.76);
function add(name,g,p,m,q){const mesh=new T.Mesh(g,m);mesh.name=name;mesh.position.set(...p);if(q)mesh.quaternion.copy(q);mesh.updateMatrix();g.applyMatrix4(mesh.matrix);if(backWallParts.has(name))g.translate(0,0,-.7);g.deleteAttribute('uv');if(!parts.has(m))parts.set(m,[]);parts.get(m).push(g.index ? g.toNonIndexed() : g);}
function box(name,d,p,m,b=.008){
 b=Math.min(b,...d.map(v=>v*.45));let g;
 if(!b)g=new T.BoxGeometry(...d);
 else {
 const bs=Math.min(b,d[0]*.12,d[1]*.12),w=d[0]-2*bs,h=d[1]-2*bs,r=Math.min(b,w*.4,h*.4),s=new T.Shape();
 s.moveTo(-w/2+r,-h/2);s.lineTo(w/2-r,-h/2);s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);s.lineTo(w/2,h/2-r);s.quadraticCurveTo(w/2,h/2,w/2-r,h/2);s.lineTo(-w/2+r,h/2);s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);s.lineTo(-w/2,-h/2+r);s.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);
 g=new T.ExtrudeGeometry(s,{depth:Math.max(.0001,d[2]-2*b),bevelEnabled:true,bevelThickness:b,bevelSize:bs,bevelSegments:1,steps:1,curveSegments:1});g.translate(0,0,-(d[2]-2*b)/2);
 }add(name,g,p,m);
}
function cyl(name,r,depth,p,m,axis=[0,1,0],n=16){add(name,new T.CylinderGeometry(r,r,depth,n),p,m,new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3(...axis)));}
function line(name,pts,r,m){const curve=new T.CatmullRomCurve3(pts.map(p=>new T.Vector3(...p)),false,'centripetal');add(name,new T.TubeGeometry(curve,Math.max(1,pts.length-1),r,4,false),[0,0,0],m);}
let seed=24;const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
box('grout',[5,.035,7],[0,-.025,1],room,0);
for(let x=-4;x<4;x++)for(let z=-4;z<7;z++)box('terrazzo tile',[.618,.018,.618],[(x+.5)*.625,-.004,(z+.5)*.625],paper,0);
const vv=[],nn=[];for(let i=0;i<850;i++){const x=rand()*5-2.5,z=rand()*6.8-2.5,r=.002+rand()*.009;for(const a of [0,4.2,2.1]){vv.push(x+Math.cos(a)*r,.006,z+Math.sin(a)*r);nn.push(0,1,0);}}
const chips=new T.BufferGeometry();chips.setAttribute('position',new T.Float32BufferAttribute(vv,3));chips.setAttribute('normal',new T.Float32BufferAttribute(nn,3));add('mineral chips',chips,[0,0,0],mint);
box('rear wall',[5,3,.09],[0,1.5,-1.65],room);
for(const s of [-1,1]){box('side wall',[.1,3,7],[2.45*s,1.5,1.1],room);box('paper skirting',[.045,.12,7],[2.39*s,.065,1.1],paper);}
box('back skirting',[4.8,.12,.04],[0,.065,-1.59],paper);
box('acoustic inset',[1.25,2.3,.045],[-1.65,1.28,-1.58],dark);
for(let i=0;i<20;i++)box('acoustic flute',[.039,2.24,.035],[-2.23+i*.06,1.28,-1.54],paper,.01);
box('door inset',[.95,2.38,.055],[1.45,1.2,-1.58],dark);
for(const x of [1.02,1.88])box('door stile',[.045,2.3,.045],[x,1.19,-1.52],paper);
for(const y of [.08,.75,2.31])box('door rail',[.9,.045,.045],[1.45,y,-1.51],paper);
box('frosted door',[.81,1.47,.018],[1.45,1.53,-1.54],mint,.003);
for(let i=0;i<24;i++)box('reeded glazing',[.009,1.43,.01],[1.07+i*.033,1.53,-1.525],paper,.003);
line('door pull',[[1.76,.96,-1.47],[1.76,1.17,-1.47]],.012,metal);
box('storage body',[.5,.8,1.38],[1.43,.42,.25],room,.035);box('solid counter',[.56,.035,1.44],[1.43,.835,.25],paper,.014);
for(const z of [-.2,.25,.7])for(const y of [.2,.46,.7]){box('drawer face',[.026,.205,.425],[1.161,y,z],paper);line('drawer pull',[[1.139,y+.025,z-.08],[1.139,y+.025,z+.08]],.007,metal);}
for(let k=0;k<3;k++)box('folded linen',[.26,.04,.23],[1.43,.875+k*.043,.58],paper,.012);
for(const z of [-.18,0]){cyl('lotion bottle',.039,.15,[1.45,.93,z],paper);cyl('pump neck',.016,.035,[1.45,1.023,z],room);line('pump spout',[[1.45,1.05,z],[1.4,1.05,z]],.009,room);}
box('wall shelf carcass',[.85,.7,.18],[.1,1.25,-1.51],paper,.018);
for(const y of [1,1.27,1.53])box('shelf',[.81,.025,.23],[.1,y,-1.4],room,.006);
for(const x of [-.18,.03,.24])for(const y of [1.07,1.34]){cyl('rolled linen',.055,.14,[x,y,-1.36],paper,[0,0,1],20);line('linen roll seam',Array.from({length:29},(_,i)=>[x+.038*Math.cos(i*Math.PI*2/28),y+.038*Math.sin(i*Math.PI*2/28),-1.282]),.0014,mint);}
for(let i=0;i<13;i++)box('radiator fin',[.037,.44,.10],[-.28+i*.06,.36,-1.49],paper,.014);
for(const y of [.34,.72]){box('trolley tray',[.36,.025,.45],[-.95,y,-.22],paper,.01);for(const s of [-1,1])box('tray rim',[.015,.035,.45],[-.95+s*.175,y+.025,-.22],mint,.005);}
for(const x of [-1.1,-.8])for(const z of [-.4,-.04]){cyl('trolley leg',.009,.66,[x,.39,z],metal);cyl('trolley wheel',.034,.025,[x,.046,z],room,[1,0,0]);}
for(let i=0;i<2;i++)box('trolley folded towel',[.25,.04,.24],[-.95,.77+i*.042,-.22],paper,.012);
box('table stabilizer',[.61,.07,1.7],[0,.065,1.05],room,.025);
for(const z of [.39,1.71]){box('table foot',[.78,.07,.24],[0,.045,z],room,.025);box('lifting column',[.18,.49,.22],[0,.33,z],paper,.022);box('column inset',[.185,.23,.12],[0,.37,z],metal);}
box('table chassis',[.65,.07,2.12],[0,.65,1.07],paper,.025);
for(const [z,len] of [[.18,.45],[.81,.76],[1.72,1.02]]){box('stitched upholstery',[.74,.13,len-.012],[0,.775,z],vinyl,.035);const l=(len-.035)/2;line('upholstery welt',[[-.352,.78,z-l],[.352,.78,z-l],[.352,.78,z+l],[-.352,.78,z+l],[-.352,.78,z-l]],.0025,mint);}
box('paper runner',[.46,.002,1.97],[0,.842,1.2],paper,.0005);
for(const s of [-1,1]){line('side rail',[[s*.345,.63,.19],[s*.345,.63,1.95]],.014,metal);for(const z of [.25,.92,1.72]){cyl('adjustment hub',.028,.04,[s*.36,.64,z],room,[1,0,0]);cyl('hex fastener',.010,.044,[s*.365,.64,z],paper,[1,0,0],6);}}
line('table lever',[[-.35,.59,.54],[-.49,.53,.54]],.009,metal);cyl('lever grip',.014,.10,[-.48,.53,.54],coral,[0,0,1]);cyl('paper roll',.05,.56,[0,.85,2.26],paper,[1,0,0],24);
let tris=0;for(const[m,gs]of parts){const geo=mergeBufferGeometries(gs,false);const mesh=new T.Mesh(geo,m);mesh.name=m.name;scene.add(mesh);tris+=geo.attributes.position.count/3;}
new GLTFExporter().parse(scene,res=>{writeFileSync(process.argv[2]||'/private/tmp/room.glb',Buffer.from(res));console.log(JSON.stringify({triangles:tris,draws:parts.size,bytes:res.byteLength}));},e=>{throw e;},{binary:true});

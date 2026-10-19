import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {createSideXray} from "./xray.js";

/* Side-posture lumbar roll scene ("허리비틀기"): its own renderer, scene and camera, like back/scene.js.
   Patient01 lies on his side on the treatment table (public/models/side/patient.glb, scripts/assets/side_patient.py,
   clips lieL / lieR / rollLR / rollRL); the therapist stands on the side he faces (therapist.glb, setupL / setupR /
   walkLR / walkRL). lieL = left side down, facing +x, therapist at +x; lieR is the mirror.
   Coordinates (three.js world, metres): +y up, head at -z, feet at +z, pad top y 0.82.
   The camera sits across the table from the therapist, high and oblique (the Columbus reference), and moves to the
   other side for the second side, around the foot end (user 2026-10-19 "좌우 두번").

   render() inputs (the scene keeps only animation memory):
     side       'L' | 'R' the side being worked
     roll       null, or 0..1.6 s into the roll-over from `side` to the other side
     height     0..1 aim along the lumbar spine (L1..L5)
     position   0..1 pelvis roll once locked (0.5 = neutral, more = rolled toward the therapist)
     pressure   0..1 preload (the therapist leans in)
     impulse    -0.5..3 the thrust profile; kind "ok" | "weak" | "miss" | "over", forceTier 0..2
     goal       {height, roll} the target ring */

const BASE = import.meta.env.BASE_URL + "models/side/";
const COL = {room: 0x17312c, paper: 0xf4efe4, coral: 0xff7a59, mint: 0x7fd1b9};
const CAM_ELEV = 40, CAM_AZ = 128, CAM_FOV = 38;
export const ROLL_S = 1.6;
const ROLL_DEG = 34;         // pelvis roll at position 0/1 (exaggerated so a small aim reads)
const SPINE_DEPTH = .075;                    // skin of the back to the vertebral bodies (m)
const FILM_DIR = [.35, .8, -.45], FILM_D = .5;  // film camera: from above (the spine's side), a little behind (x·-f) and the head end; distance (m)
const clamp01 = v => Math.min(1, Math.max(0, v));
const smooth = (a, b, x) => { const t = clamp01((x - a)/(b - a)); return t*t*(3 - 2*t); };
const lin = hex => new THREE.Color(hex).convertSRGBToLinear();
function loadGLB(loader, url){ return new Promise((res, rej) => loader.load(url, res, undefined, rej)); }
const stdMat = m => m && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial);
const facing = side => side === "R" ? -1 : 1;

export async function createSideScene(canvas){
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: "high-performance"});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COL.room); scene.fog = new THREE.Fog(COL.room, 5, 11);
  const camera = new THREE.PerspectiveCamera(CAM_FOV, 16/9, 0.03, 20);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; pmrem.dispose();
  scene.environment = env;
  scene.add(new THREE.HemisphereLight(COL.paper, COL.room, .45));
  const key = new THREE.SpotLight(COL.paper, 1.9, 0, 0.62, 0.9, 1);
  key.position.set(0, 3.1, .4); key.target.position.set(0, 0.95, 0.35); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.015;
  key.shadow.camera.near = 0.8; key.shadow.camera.far = 3.4; key.shadow.radius = 4;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(COL.paper, .2); fill.position.set(-1.6, 1.8, -0.6); scene.add(fill);
  const fill2 = new THREE.DirectionalLight(COL.paper, .2); fill2.position.set(1.6, 1.8, -0.6); scene.add(fill2);
  const rim = new THREE.DirectionalLight(COL.mint, .16); rim.position.set(0, 1.4, 2); scene.add(rim);

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [pg, tg, room, marks] = await Promise.all([
    loadGLB(loader, BASE + "patient.glb"),
    loadGLB(loader, BASE + "therapist.glb"),
    loadGLB(loader, import.meta.env.BASE_URL + "models/towel-stage/room.glb"),
    fetch(BASE + "patient_marks.json").then(r => { if(!r.ok) throw new Error("patient_marks.json " + r.status); return r.json(); }),
    document.fonts.ready
  ]);
  const suite = room.scene; suite.position.y = -.022; scene.add(suite);
  suite.traverse(o => { if(o.isMesh){ o.castShadow = o.receiveShadow = true; if(o.material) o.material.envMapIntensity = .16; } });
  const xray = await createSideXray({scene, camera, env, renderer});
  const roomBackground = scene.background.clone(), xrayBackground = new THREE.Color(0x0f231f);

  const fades = [];
  // patient jeans in denim blue: the old dark teal vanished into the teal pad (user 2026-10-19 "바지색이 침대색이랑 동일")
  const cloth = {side_jeans: [0x3d5a99, 0x2a3345], side_shirt: [COL.paper, 0xf7f5ef]};
  function prepare(root, hair){
    const bones = {};
    // every skin of one character binds the same joints: one shared skeleton = one bone-texture upload per frame, not
    // one per mesh (back/scene.js); fold each mesh's constant inverse-bind offset into its bind matrix
    let shared = null;
    root.traverse(o => {
      if(o.isSkinnedMesh){
        if(!shared) shared = o.skeleton;
        else if(o.skeleton.bones.length === shared.bones.length && o.skeleton.bones.every((b, i) => b === shared.bones[i])){
          const C = shared.boneInverses[0].clone().invert().multiply(o.skeleton.boneInverses[0]);
          o.bind(shared, C.multiply(o.bindMatrix));
        }
      }
      if(o.isBone) bones[o.name] = o;
      if(!o.isMesh) return;
      o.castShadow = o.receiveShadow = true; o.frustumCulled = false;
      const m = o.material; if(!stdMat(m)) return;
      m.envMapIntensity = .28;
      if(hair.test(m.name || "")){ m.transparent = false; m.depthWrite = true; m.alphaTest = .02; m.side = THREE.DoubleSide; return; }
      if(/eyebrow|eyelash/.test(m.name || "")){ m.transparent = true; m.depthWrite = false; m.alphaTest = .02; return; }
      // the baked clothes come out white: colour them like the back mode (cream gown + dark jeans, white coat + navy jeans)
      const tint = cloth[m.name?.replace(/^(patient|therapist)\./, "")];
      if(tint){ m.color.copy(lin(tint[root === pg.scene ? 0 : 1])); m.roughness = .88; }
      m.transparent = true; m.depthWrite = true; fades.push(m);
    });
    return bones;
  }
  const patient = pg.scene, ther = tg.scene;
  const pBones = prepare(patient, /short02|hair/i), tBones = prepare(ther, /short04|hair/i);
  const patientRoot = new THREE.Group(); patientRoot.add(patient); scene.add(patientRoot);
  const therRoot = new THREE.Group(); therRoot.add(ther); scene.add(therRoot);
  const pMix = new THREE.AnimationMixer(patient), tMix = new THREE.AnimationMixer(ther);
  const clip = (g, name) => { const c = THREE.AnimationClip.findByName(g.animations, name); if(!c) throw new Error("missing clip " + name); return c; };
  const P = Object.fromEntries(["lieL", "lieR", "rollLR", "rollRL"].map(n => [n, pMix.clipAction(clip(pg, n))]));
  const Tr = Object.fromEntries(["setupL", "setupR", "walkLR", "walkRL"].map(n => [n, tMix.clipAction(clip(tg, n))]));
  for(const a of [...Object.values(P), ...Object.values(Tr)]){ a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; }
  let curP = null, curT = null;
  function pose(mixer, actions, name, cur, t){
    const a = actions[name];
    if(cur !== a){ if(cur) cur.stop(); a.reset().play(); }
    a.time = Math.min(t, a.getClip().duration - 1e-4); a.paused = true; mixer.update(0);
    return a;
  }
  // keep him on the bed (user 2026-10-19 "환자 머리가 침대 밖을 벗어나선 안됨"): slide both characters toward the feet
  // until the crown clears the pad's head end in every clip, the roll-over included
  const pad = new THREE.Box3(), _hp = new THREE.Vector3(); suite.updateMatrixWorld(true);
  suite.traverse(o => { if(o.isMesh && o.material?.name === "suite.leather") pad.expandByObject(o); });
  let headMin = Infinity, footMax = -Infinity;
  for(const name of Object.keys(P)){
    const d = P[name].getClip().duration;
    for(let i = 0; i <= 12; i++){
      curP = pose(pMix, P, name, curP, d*i/12); patient.updateMatrixWorld(true);
      headMin = Math.min(headMin, pBones.head.getWorldPosition(_hp).z);
      for(const f of ["foot_l", "foot_r", "ball_l", "ball_r"]) if(pBones[f]) footMax = Math.max(footMax, pBones[f].getWorldPosition(_hp).z);
    }
  }
  const CROWN = .22;          // head bone (skull base) to the crown, plus a little pillow room
  const BED_SHIFT = Math.max(0, pad.min.z + .04 - (headMin - CROWN));
  patient.position.z = ther.position.z = BED_SHIFT;
  const bed = {pad: [pad.min.z, pad.max.z], head: headMin - CROWN + BED_SHIFT, foot: footMax + BED_SHIFT, shift: BED_SHIFT};
  // bind-pose rotations, so the per-frame nudges never accumulate
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), ZAXIS = new THREE.Vector3(0, 0, 1), XAXIS = new THREE.Vector3(1, 0, 0), YAXIS = new THREE.Vector3(0, 1, 0);
  function worldRotate(bone, angle, axis = ZAXIS){
    if(!bone) return;
    bone.parent.getWorldQuaternion(_q2);
    _q.setFromAxisAngle(axis, angle);
    bone.quaternion.premultiply(_q2.clone().invert().multiply(_q).multiply(_q2));
    bone.updateMatrixWorld(true);
  }

  const LIMBS = ["thigh_l", "thigh_r", "calf_l", "calf_r", "upperarm_l", "upperarm_r"];
  const NUDGE = [pBones.pelvis, pBones.spine_02, pBones.head, tBones.spine_01, tBones.spine_02, tBones.spine_03, tBones.head,
    ...LIMBS.map(n => pBones[n]), ...["upperarm_l", "upperarm_r", "lowerarm_l", "lowerarm_r"].map(n => tBones[n])].filter(Boolean), nudged = new Map();

  // ---- the lumbar aim line on the patient's back, from the rig's L4/5 skin marker ----
  const L4 = {L: new THREE.Vector3(...marks.clips.lieL.mark_l4_L), R: new THREE.Vector3(...marks.clips.lieR.mark_l4_R)};
  L4.L.z += BED_SHIFT; L4.R.z += BED_SHIFT;
  const SPINE_Z0 = -.13, SPINE_LEN = .18;      // L1 .. L5 runs this far along z around the L4/5 marker
  const spinePoint = (side, h) => { const p = L4[side].clone(); p.z += SPINE_Z0 + clamp01(h)*SPINE_LEN; p.x -= facing(side)*.035; return p; };

  // ---- target / aim rings: flat discs facing the camera, drawn over the body ----
  const ringMat = c => new THREE.MeshBasicMaterial({color: lin(c), transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide});
  const goalRing = new THREE.Mesh(new THREE.RingGeometry(.034, .044, 40), ringMat(COL.mint)); goalRing.renderOrder = 10;
  const aimDot = new THREE.Mesh(new THREE.CircleGeometry(.016, 24), ringMat(COL.paper)); aimDot.renderOrder = 11;
  scene.add(goalRing, aimDot);

  // ---- camera: across from the therapist, the mirror for side R; the roll-over swings around the foot end ----
  let cssW = 1, cssH = 1;
  const FIT = side => [[0, .95, -.42], [0, .88, 1.25], [facing(side)*.07, 1.48, .17], [facing(side)*.45, .95, .42]].map(p => new THREE.Vector3(p[0], p[1], p[2] + BED_SHIFT));
  const target = new THREE.Vector3(0, 1.0, .32 + BED_SHIFT);
  const camDirAt = (az, el) => { const A = THREE.MathUtils.degToRad(az), E = THREE.MathUtils.degToRad(el); return new THREE.Vector3(Math.cos(E)*Math.cos(A), Math.sin(E), Math.cos(E)*Math.sin(A)); };
  const AZ = {L: CAM_AZ, R: 180 - CAM_AZ};
  const dist = {L: 3, R: 3};
  function fitCamera(){
    camera.aspect = cssW/cssH;
    const portrait = cssW < cssH;
    camera.fov = portrait ? 52 : CAM_FOV; camera.updateProjectionMatrix();
    const margin = portrait ? .9 : .86;
    for(const side of ["L", "R"]){
      const dir = camDirAt(AZ[side], CAM_ELEV), fit = FIT(side);
      let lo = .6, hi = 8;
      for(let i = 0; i < 24; i++){
        const mid = (lo + hi)/2;
        camera.position.copy(target).addScaledVector(dir, mid); camera.lookAt(target); camera.updateMatrixWorld();
        const ok = fit.every(p => { const q = p.clone().project(camera); return Math.abs(q.x) <= margin && Math.abs(q.y) <= margin && q.z < 1; });
        if(ok) hi = mid; else lo = mid;
      }
      dist[side] = hi;
    }
  }

  const st = {shake: 0, t: null};
  function render({now = performance.now(), side = "L", roll = null, height = .5, position = .5, locked = false, pressure = 0, impulse = 0,
    kind = "ok", forceTier = 0, shotTime = -1, exit = null, react = null, goal = {height: .78, roll: .6}, showGoal = true, film = 0, xrayState = null, camAz = null, camEl = null} = {}){
    const dt = st.t == null ? 1/60 : Math.min(.1, Math.max(0, (now - st.t)/1000)); st.t = now;
    const f = facing(side), other = side === "L" ? "R" : "L";
    // a paused action does not rewrite its bones every update, so undo last frame's nudges before re-posing
    for(const [b, q] of nudged) b.quaternion.copy(q);
    // body poses from the baked clips; the roll-over plays its clip at an exact time
    if(roll != null){
      curP = pose(pMix, P, "roll" + side + other, curP, roll);
      curT = pose(tMix, Tr, "walk" + side + other, curT, roll);
    }else{
      curP = pose(pMix, P, "lie" + side, curP, 0);
      curT = pose(tMix, Tr, "setup" + side, curT, 0);
    }
    for(const b of NUDGE) nudged.set(b, b.quaternion.clone());
    patient.updateMatrixWorld(true); ther.updateMatrixWorld(true);
    // pelvis roll toward the therapist (+ thrust snap), the chest counter-rotates a little (the pre-tension)
    impulse = THREE.MathUtils.clamp(impulse, -.5, 3);
    const over = forceTier ? (forceTier === 2 ? 2.2 : 1.5) : kind === "over" ? 1.3 : 1;
    if(roll == null){
      const r = locked ? (clamp01(position) - .5)*2 : 0;
      const ang = THREE.MathUtils.degToRad(r*ROLL_DEG + Math.max(0, impulse)*9*over);
      // +angle about z swings the top of the body toward -x; the patient faces +x on side L
      worldRotate(pBones.pelvis, -f*ang);
      worldRotate(pBones.spine_02, f*ang*.7);
      // therapist: lean in with the preload, drop the body on the thrust
      const lean = THREE.MathUtils.degToRad(pressure*7 + Math.max(0, impulse)*8*over);
      // the baked setup buries his face in the patient's neck: lift the chest a touch and the head up over the shoulder
      worldRotate(tBones.spine_03, -f*8*Math.PI/180); worldRotate(tBones.head, -f*26*Math.PI/180);
      worldRotate(tBones.spine_01, f*lean*.6); worldRotate(tBones.spine_02, f*lean*.4);
      therRoot.position.set(0, -Math.max(0, impulse)*.04*over, (clamp01(height) - .5)*.08);
    }else therRoot.position.set(0, 0, 0);
    patientRoot.position.set(0, -Math.max(0, impulse)*.006, 0); patientRoot.rotation.set(0, 0, 0);
    // exit gags: both sides perfect -> he spins up off the table like a swivel chair; lopsided -> he stays wrung out
    if(exit){
      const e = clamp01(exit.t/1.4);
      if(exit.kind === "spin"){
        const pivot = new THREE.Vector3(0, 0, .45 + BED_SHIFT), turn = Math.PI*4*smooth(0, 1, e)*f;
        patientRoot.rotation.y = turn;
        patientRoot.position.copy(pivot).add(pivot.clone().negate().applyAxisAngle(new THREE.Vector3(0, 1, 0), turn));
        patientRoot.position.y += .35*Math.sin(Math.PI*Math.min(1, e*1.2));
      }else if(exit.kind === "twist"){
        therRoot.position.x += f*.6*smooth(0, .3, e);      // the therapist steps back so the wrung-out patient shows
        worldRotate(pBones.pelvis, -f*THREE.MathUtils.degToRad(80*smooth(0, .4, e)));
        worldRotate(pBones.spine_02, f*THREE.MathUtils.degToRad(120*smooth(0, .4, e)));
        worldRotate(pBones.head, -f*THREE.MathUtils.degToRad(40*smooth(.3, .6, e)));
        patientRoot.rotation.z = Math.sin(exit.t*18)*.02*(1 - e);
      }
    }
    // a hard thrust (core.js overReaction, user 2026-10-19 "환자가 확 돌아가면서 고통스러워 하는 표현이나 의사의 과장된
    // 표현"): he whips round past the push, rolls, kicks and flails with his head thrown back; the therapist throws his
    // hands up, leans away shaking his head and hops on the spot
    if(react && roll == null && !exit){
      const t = react.t, L = react.level/3, D = THREE.MathUtils.degToRad;
      const on = smooth(0, .08, t)*(1 - smooth(2.6, 3.6, t));
      const whip = (1 - Math.exp(-t*14))*(.55 + .45*Math.exp(-t*2.5)*Math.cos(t*17))*on;
      const fl = Math.sin(t*13), fl2 = Math.sin(t*11 + 1.3), up = f > 0 ? "r" : "l", down = f > 0 ? "l" : "r";
      worldRotate(pBones.pelvis, -f*D(20 + 50*L)*whip);
      worldRotate(pBones.spine_02, f*D(10 + 35*L)*whip);
      worldRotate(pBones["thigh_" + up], -D(25 + 35*L)*on*(.7 + .3*fl), XAXIS);
      worldRotate(pBones["calf_" + up], D(30*L)*on*fl2, XAXIS);
      worldRotate(pBones["calf_" + down], D(18*L)*on*fl, XAXIS);
      worldRotate(pBones.upperarm_l, f*D(35 + 45*L)*on*(.75 + .25*fl));
      worldRotate(pBones.upperarm_r, f*D(35 + 45*L)*on*(.75 + .25*fl2));
      worldRotate(pBones.head, f*D(12 + 28*L)*on, YAXIS);
      // the whole body rolls about its length (round a line along the pad) and jumps off the table once
      const tilt = -f*D(14*L)*whip, hop = .045*react.level*Math.max(0, Math.sin(Math.PI*clamp01(t/.45)));
      patientRoot.rotation.z = tilt; patientRoot.position.x += .9*Math.sin(tilt); patientRoot.position.y += .9*(1 - Math.cos(tilt)) + hop;
      const arms = smooth(.3, .5, t)*(1 - smooth(2.6, 3.4, t));
      worldRotate(tBones.upperarm_l, -f*D(100 + 20*L)*arms); worldRotate(tBones.upperarm_r, -f*D(100 + 20*L)*arms);
      worldRotate(tBones.lowerarm_l, -f*D(25)*arms*Math.sin(t*9)); worldRotate(tBones.lowerarm_r, f*D(25)*arms*Math.sin(t*9));
      worldRotate(tBones.spine_01, -f*D(14 + 10*L)*arms);
      worldRotate(tBones.head, D(30)*arms*Math.sin(t*18), YAXIS);
      therRoot.position.x += f*.14*arms;
      const h = t - .6; if(h > 0 && h < .35) therRoot.position.y += .07*(.5 + .5*L)*Math.sin(Math.PI*h/.35);
      if(t < .2) st.shake = Math.max(st.shake, .5 + .4*react.level);
    }
    if(shotTime >= 0 && impulse > .6) st.shake = Math.max(st.shake, forceTier === 2 ? 1.2 : forceTier ? .8 : .35);

    // rings: only while aiming
    const aiming = roll == null && shotTime < 0 && !exit;
    goalRing.visible = aiming && showGoal; aimDot.visible = aiming;
    if(aiming){
      const gp = spinePoint(side, goal.height);
      if(locked) gp.x += f*(goal.roll - .5)*.14;
      goalRing.position.copy(gp); goalRing.quaternion.copy(camera.quaternion);
      const ap = spinePoint(side, height); if(locked) ap.x += f*(clamp01(position) - .5)*.14;
      aimDot.position.copy(ap); aimDot.quaternion.copy(camera.quaternion);
      const s = 1 + .08*Math.sin(now/1000*Math.PI*1.6); goalRing.scale.setScalar(s);
    }

    // x-ray film (src/side/xray.js): the neck mode's engine, the lumbar spine inside the patient under the aim, its body
    // centre a hand's depth in from the skin of the back
    for(const m of fades){ m.opacity = 1 - film*.82; m.depthWrite = film < .05; }
    renderer.toneMappingExposure = 1 - film*.35;
    scene.background.copy(roomBackground).lerp(xrayBackground, film*.85);
    const anchor = spinePoint(side, xrayState?.height ?? height); anchor.x += f*SPINE_DEPTH;
    const released = xray.update({film, side, anchor, ...(xrayState || {})});

    // camera: side L from -x, side R from +x; the roll-over swings over the foot end and pulls back/up
    let az, el = CAM_ELEV, d;
    if(roll != null){
      const t = smooth(.15, ROLL_S - .15, roll), a0 = AZ[side], a1 = AZ[other];
      az = a0 + (a1 - a0)*t; el = CAM_ELEV + 10*Math.sin(Math.PI*t); d = (dist[side] + (dist[other] - dist[side])*t)*(1 + .2*Math.sin(Math.PI*t));
    }else{ az = camAz ?? AZ[side]; d = dist[side]*(1 - .08*clamp01(pressure) - (shotTime >= 0 ? .05 : 0)); el = camEl ?? CAM_ELEV - (shotTime >= 0 ? 6 : 0); }
    const dir = camDirAt(az, el);
    camera.position.copy(target).addScaledVector(dir, d);
    const look = target.clone();
    // the film: the camera comes in close behind the worked side, the spine running across the screen (back/scene.js
    // filmCamera, the neck mode turning to the side of the neck)
    if(film > 0){
      const fc = xray.focus(), fp = fc.clone().addScaledVector(new THREE.Vector3(-f*FILM_DIR[0], FILM_DIR[1], FILM_DIR[2]).normalize(), FILM_D);
      camera.position.lerp(fp, film); look.lerp(fc, film);
    }
    st.shake = Math.max(0, st.shake - dt*1.6);
    if(st.shake > 0){ const s = st.shake*st.shake*.012, t = now/1000; camera.position.x += Math.sin(t*61)*s; camera.position.y += Math.sin(t*47 + 1)*s; camera.position.z += Math.sin(t*53 + 2)*s; }
    camera.lookAt(look);
    renderer.render(scene, camera);
    return {released};
  }

  function resize(width, height){
    cssW = Math.max(1, width|0); cssH = Math.max(1, height|0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(cssW, cssH, false); fitCamera();
  }
  /* aim (height 0..1 along L1..L5, roll position) -> canvas-local CSS pixels on the back */
  function projectPosition(side, height, position = .5, locked = false){
    const p = spinePoint(side, height); if(locked) p.x += facing(side)*(clamp01(position) - .5)*.14;
    camera.updateMatrixWorld(); p.project(camera);
    return {x: (p.x + 1)/2*cssW, y: (1 - p.y)/2*cssH};
  }
  const _bp = new THREE.Vector3();
  /* a character's bone -> canvas-local CSS pixels (the scream / the therapist's line float there) */
  function projectBone(who, name){
    const b = (who === "therapist" ? tBones : pBones)[name]; if(!b) return null;
    b.getWorldPosition(_bp); camera.updateMatrixWorld(); _bp.project(camera);
    return {x: (_bp.x + 1)/2*cssW, y: (1 - _bp.y)/2*cssH};
  }
  function dispose(){
    xray.dispose();
    scene.traverse(o => {
      if(o.geometry) o.geometry.dispose();
      for(const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []){
        for(const k of Object.keys(m)){ const v = m[k]; if(v && v.isTexture) v.dispose(); }
        m.dispose();
      }
    });
    env.dispose(); key.shadow.map?.dispose(); renderer.dispose();
  }

  resize(canvas.clientWidth || canvas.width || 1, canvas.clientHeight || canvas.height || 1);
  renderer.compile(scene, camera);
  // draw every look once while the start card is up (the film and both sides), so no shader links mid-shot
  for(const side of ["L", "R"]){
    render({side, film: 0});
    for(const time of [1.2, 1.6]) render({side, film: 1, shotTime: 1, xrayState: {kind: "ok", time}});
    for(const tier of [0, 1, 2]) for(const time of [1.5, 2.6]) render({side, film: 1, shotTime: 1, kind: "over", forceTier: tier, xrayState: {kind: "over", tier, time, force: tier ? 4 : 1}});
    render({side, roll: .8});
  }
  render({side: "L"}); st.shake = 0;
  return {screenAxis: 1, bed, render, resize, dispose, projectPosition, projectBone, renderer, scene, camera};
}

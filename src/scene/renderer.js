import * as THREE from "three";
import { $ } from "../lib/dom.js";

/* Renderer, scene, camera, lights. ACES tone mapping, only `sun` casts shadows. */
export const canvas = $("#c");
export const renderer = new THREE.WebGLRenderer({canvas, antialias:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;

export const scene = new THREE.Scene();
const roomCol = new THREE.Color(0x1b332e);
scene.background = roomCol;
scene.fog = new THREE.Fog(roomCol, 5, 11);

export const camera = new THREE.PerspectiveCamera(50, 1, 0.03, 30);
export const camBase = new THREE.Vector3(), camLook = new THREE.Vector3();

scene.add(new THREE.HemisphereLight(0xe6f2ec, 0x2a2018, 0.5));
const sun = new THREE.DirectionalLight(0xfff0dc, 1.0);
sun.position.set(2.4, 3.6, 0.4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024,1024);
sun.shadow.bias = -0.0008;
Object.assign(sun.shadow.camera, {left:-2,right:2,top:2.4,bottom:-1.6,near:0.5,far:9});
scene.add(sun);
const lamp = new THREE.PointLight(0xffc89a, 0.65, 3.5, 1.6);
lamp.position.set(-0.5, 1.95, 0.0);
scene.add(lamp);
const rim = new THREE.PointLight(0x9fe0c8, 0.25, 4);
rim.position.set(0, 1.4, 2.6);
scene.add(rim);

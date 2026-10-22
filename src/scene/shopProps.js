/* 진료실 꾸미기 소품 (core/shop.js PROPS). Bought props stand along the back wall (the towel view's backdrop) and the far
   wall (what the first-person clinic view faces), out of the way of the table and the patient. Built lazily: a shop with
   nothing bought allocates nothing. All geometry/material ids go through withVisualIds so the game's seeded random stream
   (next patient targets) is not advanced. ui/shop.js fires "chiro-shop" after a purchase. */
import * as THREE from "three";
import { scene } from "./renderer.js";
import { withVisualIds } from "./visualBuild.js";
import { store } from "../lib/store.js";
import { SHOP_KEY, PROPS, readShop, owns } from "../core/shop.js";

const BACK_Z = -2.24, FAR_Z = 4.45;   // wall planes: in front of the back wall's recess panel / the far wall
const std = (color, rough = .7, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(.62), roughness: rough, metalness: metal, ...extra });   // the suite lighting is hot: full-bright colours blow out to white
const M = {};
const mats = () => M.gold || Object.assign(M, {
  gold: std(0xd9a93a, .32, .85), bone: std(0xe8e0cc, .8), dark: std(0x2a2a2a, .9), wood: std(0x6b4a33, .75), leather: std(0x5b3a2a, .6),
  chrome: std(0xbfc5c3, .3, .8), pot: std(0xc96b4a, .8), green: std(0x4f9a5f, .75), glass: std(0x9fe3d8, .1, 0, { transparent: true, opacity: .28 }),
  water: std(0x66c6c0, .2, 0, { transparent: true, opacity: .3 }), fish: std(0xff8a3d, .5), white: std(0xf4efe4, .8), frame: std(0x2b2118, .7)
});

function canvasTex(w, h, draw){
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
}
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cylm = (rt, rb, h, m, seg = 20) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
const sph = (r, m, sx = 1, sy = 1, sz = 1) => { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), m); s.scale.set(sx, sy, sz); return s; };
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
const group = (...kids) => { const g = new THREE.Group(); kids.forEach(k => g.add(k)); return g; };
function framed(w, h, tex){
  const m = mats();
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: .6 }));
  return group(at(box(w + .06, h + .06, .03, m.frame), 0, 0, 0), at(pic, 0, 0, .0165));
}

/* each builder: local frame, +z toward the room, y up, origin on the wall (wall items) or the floor (floor items) */
const BUILD = {
  skull(){
    const m = mats(), s = sph(.12, m.bone, 1, 1.05, 1.1);
    const jaw = at(box(.12, .06, .1, m.bone), 0, -.1, .04);
    const eye = x => at(sph(.028, m.dark), x, .01, .105);
    return group(at(cylm(.13, .16, .72, m.wood), 0, .36, 0), at(s, 0, .84, 0), jaw, eye(-.045), eye(.045), at(box(.02, .04, .02, m.dark), 0, -.03, .12));
  },
  poster(tex){
    return at(framed(.62, .9, tex), 0, 1.3, .02);
  },
  cert(tex){
    return at(framed(.62, .44, tex), 0, 1.3, .02);
  },
  cactus(){
    const m = mats(), g = group(at(cylm(.13, .1, .22, m.pot), 0, .11, 0));
    for(let i = 0; i < 6; i++) g.add(at(sph(.1 - i * .009, m.green, 1.1, .7, 1.1), Math.sin(i * 1.3) * .015, .3 + i * .1, 0));
    g.add(at(sph(.035, std(0xff6f91, .6)), 0, .93, 0));
    return at(group(at(cylm(.2, .24, .5, m.wood), 0, .25, 0), at(g, 0, .5, 0)), 0, 0, 0);
  },
  trophy(){
    const m = mats();
    const cup = cylm(.14, .06, .22, m.gold, 24), stem = cylm(.025, .025, .14, m.gold), foot = box(.22, .05, .22, m.wood);
    const handle = x => { const t = new THREE.Mesh(new THREE.TorusGeometry(.07, .014, 8, 16), m.gold); t.position.set(x, .08, 0); return t; };
    return group(at(cylm(.2, .24, .5, m.wood), 0, .25, 0), at(foot, 0, .525, 0), at(stem, 0, .62, 0), at(cup, 0, .78, 0), handle(-.16), handle(.16));
  },
  bust(){
    const m = mats(), head = sph(.12, m.gold, 1, 1.12, 1);
    const glass = x => { const t = new THREE.Mesh(new THREE.TorusGeometry(.035, .007, 8, 16), m.dark); t.position.set(x, .02, .115); return t; };
    return group(at(cylm(.2, .24, .56, m.white), 0, .28, 0), at(box(.34, .2, .2, m.gold), 0, .66, 0), at(cylm(.05, .06, .08, m.gold), 0, .8, 0), at(head, 0, .94, 0), at(glass(-.05), 0, .94, 0), at(glass(.05), 0, .94, 0), at(box(.1, .015, .015, m.dark), 0, .96, .12), at(box(.08, .03, .02, m.gold), 0, .86, .115));
  },
  neon(tex){
    const p = new THREE.Mesh(new THREE.PlaneGeometry(.9, .45), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    return at(group(at(p, 0, 0, .02)), 0, 2.15, 0);
  },
  aquarium(){
    const m = mats();
    const g = group(at(box(.9, .6, .5, m.wood), 0, .3, 0), at(box(.7, .42, .36, m.glass), 0, .81, 0), at(box(.66, .3, .32, m.water), 0, .76, 0), at(box(.72, .03, .38, m.dark), 0, 1.03, 0));
    [[-.15, .8, .05], [.12, .86, -.04], [.2, .74, .06]].forEach(([x, y, z]) => { g.add(at(sph(.04, m.fish, 1.5, 1, .6), x, y, z)); g.add(at(sph(.02, m.fish, .6, 1.5, .4), x - .06, y, z)); });
    return g;
  },
  gong(){
    const m = mats(), disc = cylm(.26, .26, .03, m.gold, 32); disc.rotation.x = Math.PI / 2;
    const post = x => at(cylm(.03, .03, 1.1, m.wood), x, .55, 0);
    return group(post(-.36), post(.36), at(box(.8, .05, .06, m.wood), 0, 1.1, 0), at(box(.9, .05, .3, m.wood), 0, .03, 0), at(disc, 0, .72, 0), at(cylm(.012, .012, .08, m.dark), 0, 1.04, 0));
  },
  chair(){
    const m = mats();
    const back = at(box(.62, .86, .2, m.leather), 0, .82, -.22); back.rotation.x = -.28;
    const arm = x => at(box(.1, .22, .56, m.leather), x, .62, .02);
    const foot = at(box(.5, .08, .36, m.leather), 0, .22, .5); foot.rotation.x = .3;
    return group(at(box(.66, .2, .62, m.dark), 0, .1, 0), at(box(.62, .18, .56, m.leather), 0, .5, .02), back, arm(-.38), arm(.38), foot, at(box(.5, .06, .06, m.chrome), 0, .4, .3));
  }
};

/* slot per prop: x along the wall (local), "wall" props hang, "floor" props stand a little in front of it */
const SLOT = {
  poster: [-1.45, .0], cert: [1.5, 0], neon: [-.75, 0],
  skull: [1.95, .35], cactus: [-1.95, .35], trophy: [1.2, .3], bust: [-1.2, .3], aquarium: [.9, .35], gong: [-1.9, .5], chair: [1.85, .7]
};
const WALL = { poster: 1, cert: 1, neon: 1 };
const SIDE = {   // right of the table, as close as the pad allows: inside the clinic camera's frame, clear of the towel camera
  skull: [-.8, .45], cactus: [-1.05, .85], trophy: [-.85, 1.25], bust: [-1.1, 1.6], aquarium: [-.85, 2.0], gong: [-1.1, 2.4], chair: [-.95, 2.8]
};
const TEX = {
  poster: tex => tex(512, 740, (x, w, h) => {
    x.fillStyle = "#17312c"; x.fillRect(0, 0, w, h);
    const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, "#a9741c"); g.addColorStop(.5, "#ffe08a"); g.addColorStop(1, "#a9741c");
    x.fillStyle = g;
    for(let i = 0; i < 7; i++){ const y = 90 + i * 82, ww = 170 - i * 8; x.beginPath(); x.roundRect(w / 2 - ww / 2, y, ww, 52, 18); x.fill(); x.fillRect(w / 2 - 12, y + 52, 24, 30); }
    x.fillStyle = "#f4efe4"; x.font = '44px "Black Han Sans"'; x.textAlign = "center"; x.fillText("황금 경추", w / 2, 56); x.font = '600 22px "IBM Plex Sans KR"'; x.fillText("C1 – C7 순금 도금", w / 2, 712);
  }),
  cert: tex => tex(640, 460, (x, w, h) => {
    x.fillStyle = "#f4efe4"; x.fillRect(0, 0, w, h); x.strokeStyle = "#b9892b"; x.lineWidth = 12; x.strokeRect(14, 14, w - 28, h - 28);
    x.fillStyle = "#17312c"; x.textAlign = "center"; x.font = '50px "Black Han Sans"'; x.fillText("명예 카이로 박사", w / 2, 130);
    x.font = '600 26px "IBM Plex Sans KR"'; x.fillText("세계 뚝 협회 인증", w / 2, 200); x.fillText("(인쇄: 어제)", w / 2, 246);
    x.fillStyle = "#ff7a59"; x.beginPath(); x.arc(w / 2, 340, 42, 0, 7); x.fill(); x.fillStyle = "#f4efe4"; x.font = '40px "Black Han Sans"'; x.fillText("뚝", w / 2, 354);
  }),
  neon: tex => tex(512, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h); x.textAlign = "center"; x.textBaseline = "middle"; x.font = '170px "Black Han Sans"';
    x.shadowColor = "#8adfbf"; x.shadowBlur = 36; x.fillStyle = "#8adfbf"; x.fillText("뚝!", w / 2, h / 2 + 6);
    x.shadowBlur = 8; x.fillStyle = "#e9fff6"; x.fillText("뚝!", w / 2, h / 2 + 6);
  })
};

let root = null;
const built = {};   // id -> [back group, far group]
function make(id){
  const m = BUILD[id], slot = SLOT[id];
  if(!m || !slot) return null;
  const tex = TEX[id] ? TEX[id](canvasTex) : null;
  const sd = SIDE[id];
  return [BACK_Z, FAR_Z, null].filter((z, k) => k < 2 || !WALL[id]).map((z, k) => {
    const g = m(tex);
    const wrap = new THREE.Group();
    wrap.add(g);
    if(k === 2){   // on the floor beside the table: the spot both first-person cameras look at
      g.position.set(0, 0, 0);
      wrap.position.set(sd[0], 0, sd[1]);
      wrap.rotation.y = sd[0] > 0 ? -Math.PI / 2 : Math.PI / 2;
    } else {
      g.position.set(slot[0], 0, slot[1]);
      wrap.position.set(0, 0, z);
      if(k) wrap.rotation.y = Math.PI;
    }
    wrap.traverse(o => { if(o.isMesh){ o.castShadow = false; o.receiveShadow = false; } });
    root.add(wrap);
    return wrap;
  });
}
export function syncShopProps(){
  const st = readShop(store.get(SHOP_KEY, null));
  const want = PROPS.filter(p => owns(st, p.id));
  if(!want.length && !root) return;
  withVisualIds(() => {
    if(!root){ root = new THREE.Group(); root.name = "shop-props"; scene.add(root); }
    PROPS.forEach(p => {
      const on = owns(st, p.id);
      if(on && !built[p.id]) built[p.id] = make(p.id);
      (built[p.id] || []).forEach(g => { g.visible = on; });
    });
    document.documentElement.dataset.shopProps = String(want.length);
  });
}
// fonts first: the poster / certificate / neon draw with the game's web fonts
document.fonts.ready.then(syncShopProps);
addEventListener("chiro-shop", () => document.fonts.ready.then(syncShopProps));

import * as THREE from "three";

/* Canvas textures: wood floor, rug, cervical poster, certificate. Redrawn once web fonts load. */
function canvasTex(w, h, draw, repeat){
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d");
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 4;
  if(repeat){ t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.userData = {redraw: () => { draw(ctx, w, h); t.needsUpdate = true; }};
  return t;
}
function rr(ctx, x, y, w, h, r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
let seed = 7; const rnd = () => (seed = (seed*16807) % 2147483647) / 2147483647;

export const woodTex = canvasTex(512, 512, (c, w, h) => {
  const tones = ["#6e4a33","#7a5239","#664430","#82593d","#71503a"];
  const ph = h/8;
  for(let i=0;i<8;i++){
    c.fillStyle = tones[i%tones.length]; c.fillRect(0, i*ph, w, ph);
    c.strokeStyle = "rgba(0,0,0,.25)"; c.lineWidth = 2; c.beginPath(); c.moveTo(0, i*ph); c.lineTo(w, i*ph); c.stroke();
    const cut = (i*137) % w; c.beginPath(); c.moveTo(cut, i*ph); c.lineTo(cut, (i+1)*ph); c.stroke();
    c.strokeStyle = "rgba(30,15,5,.12)"; c.lineWidth = 1;
    for(let g=0; g<6; g++){
      const y = i*ph + 6 + rnd()*(ph-12);
      c.beginPath(); c.moveTo(0, y);
      for(let x=0; x<=w; x+=32) c.lineTo(x, y + Math.sin(x*0.02 + g)*2.5);
      c.stroke();
    }
  }
}, [5,5]);

export const rugTex = canvasTex(256, 512, (c, w, h) => {
  c.fillStyle = "#7c3e33"; c.fillRect(0,0,w,h);
  c.strokeStyle = "#e4c9a3"; c.lineWidth = 6; c.strokeRect(14,14,w-28,h-28);
  c.strokeStyle = "#2f4d46"; c.lineWidth = 10; c.strokeRect(30,30,w-60,h-60);
  c.fillStyle = "rgba(228,201,163,.5)";
  for(let y=70; y<h-60; y+=46){ c.beginPath(); c.moveTo(w/2, y); c.lineTo(w/2+22, y+18); c.lineTo(w/2, y+36); c.lineTo(w/2-22, y+18); c.closePath(); c.fill(); }
});

function drawPoster(c, w, h){
  c.fillStyle = "#f1eadc"; c.fillRect(0,0,w,h);
  c.strokeStyle = "#2c4842"; c.lineWidth = 10; c.strokeRect(5,5,w-10,h-10);
  c.fillStyle = "#2c4842";
  c.font = "64px 'Black Han Sans', sans-serif"; c.textAlign = "center";
  c.fillText("경추 해부도", w/2, 92);
  c.font = "600 22px 'IBM Plex Sans KR', sans-serif"; c.fillStyle = "#6b7774";
  c.fillText("CERVICAL SPINE · C1–C7", w/2, 126);
  const top = 160, step = 64;
  for(let i=0;i<8;i++){
    const y = top + i*step, bw = 120 + i*10, cx = w/2 + 30;
    if(i>0){ c.fillStyle = "#9fc4d6"; rr(c, cx - bw/2 + 10, y - 14, bw - 20, 12, 6); c.fill(); }
    c.fillStyle = i===4 || i===5 ? "#ff9a7e" : "#e2d6bd";
    c.strokeStyle = "#8b7e66"; c.lineWidth = 3;
    rr(c, cx - bw/2, y, bw, 38, 12); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(cx + bw/2, y + 19); c.lineTo(cx + bw/2 + 40, y + 28); c.stroke();
    c.fillStyle = "#2c4842"; c.font = "700 26px 'IBM Plex Sans KR', sans-serif"; c.textAlign = "right";
    c.fillText(i < 7 ? "C" + (i+1) : "T1", cx - bw/2 - 22, y + 29);
  }
  c.textAlign = "center"; c.fillStyle = "#2c4842"; c.font = "26px 'Black Han Sans', sans-serif";
  c.fillText("바른 목이 하루를 바꿉니다", w/2, h - 46);
}
export const posterTex = canvasTex(512, 720, drawPoster);

export const certTex = canvasTex(384, 288, (c, w, h) => {
  c.fillStyle = "#f6f1e6"; c.fillRect(0,0,w,h);
  c.strokeStyle = "#b39b62"; c.lineWidth = 8; c.strokeRect(10,10,w-20,h-20);
  c.fillStyle = "#2c4842"; c.textAlign = "center";
  c.font = "44px 'Black Han Sans', sans-serif"; c.fillText("자 격 증", w/2, 92);
  c.font = "600 20px 'IBM Plex Sans KR', sans-serif"; c.fillStyle = "#56635f";
  c.fillText("뚝 카이로 클리닉 원장", w/2, 150);
  c.fillText("손끝 감각 1급", w/2, 182);
  c.fillStyle = "#c0503a"; c.beginPath(); c.arc(w-74, h-66, 30, 0, Math.PI*2); c.fill();
});
if(document.fonts && document.fonts.ready) document.fonts.ready.then(() => { posterTex.userData.redraw(); certTex.userData.redraw(); });

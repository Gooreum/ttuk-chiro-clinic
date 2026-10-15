import {createBackScene} from './scene.js';
import {TARGETS, SWEET, POSITION_TOL, pressureAt, judgePress, pressProfile, formatRank} from './core.js';
import {tiltAngles} from '../core/tilt.js';
import {store} from '../lib/store.js';

const $ = id => document.getElementById(id);
const app = $('backApp'), canvas = $('backCanvas'), press = $('backPress'), slider = $('backPosition');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const S = {phase:'loading', position:0.5, step:0, score:0, mistakes:0, results:[], holdAt:null, pointer:null,
  animAt:0, kind:'ok', outcome:null, peakPressure:0, sound:true, tilt:false, tiltLast:null, cue:'', pausedAt:0, previousPhase:null};
let scene, width = innerWidth, height = innerHeight, rotated = false, raf = 0;
const names = ['등 위쪽', '등 가운데', '허리'];
let audio, samples = {}, sources = new Set();
function ensureSound(){
  if(!S.sound) return;
  try{
    if(!audio){
      audio = new (window.AudioContext || window.webkitAudioContext)();
      for(const [key,file] of Object.entries({crack:'crack-hard.wav', tail:'crack.wav'}))
        fetch(import.meta.env.BASE_URL + 'audio/' + file).then(r => { if(!r.ok) throw new Error('audio'); return r.arrayBuffer(); })
          .then(b => audio.decodeAudioData(b)).then(b => { samples[key] = b; }).catch(() => {});
    }
    if(audio.state !== 'running') audio.resume().catch(() => {});
  }catch{ audio = null; }
}
function stopSound(){ for(const source of sources){ try{ source.stop(); }catch{} } sources.clear(); }
function tone(from, to, length, volume, delay = 0){
  if(!S.sound || !audio) return;
  const t = audio.currentTime + delay, o = audio.createOscillator(), g = audio.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(from,t); o.frequency.exponentialRampToValueAtTime(to,t+length);
  g.gain.setValueAtTime(volume,t); g.gain.exponentialRampToValueAtTime(0.001,t+length);
  o.connect(g); g.connect(audio.destination); sources.add(o); o.onended = () => { sources.delete(o); o.disconnect(); g.disconnect(); };
  o.start(t); o.stop(t+length);
}
function crack(kind, step){
  if(!S.sound || !audio) return;
  if(kind === 'weak'){ tone(130, 70, .13, .08); return; }
  if(kind === 'miss'){ tone(240, 110, .12, .1); return; }
  const play = (key, delay, volume, rate) => {
    if(!samples[key]){ tone(200, 45, .14, .18, delay); return; }
    const source = audio.createBufferSource(), gain = audio.createGain();
    source.buffer = samples[key]; source.playbackRate.value = rate; gain.gain.value = volume;
    source.connect(gain); gain.connect(audio.destination); sources.add(source);
    source.onended = () => { sources.delete(source); source.disconnect(); gain.disconnect(); };
    source.start(audio.currentTime + delay);
  };
  play('crack',0,.66, .96 + Math.random()*.08);
  for(let i=0;i<step+1;i++) play('tail', .08 + i*.07, .16 + i*.025, 1.12 - i*.08);
  if(kind === 'over') tone(130, 40, .35, .14);
}
function cue(text, style = ''){
  if(text === S.cue && $('backCue').className === 'cue ' + style) return;
  S.cue = text; $('backCue').textContent = text; $('backCue').className = 'cue ' + style;
}
function sync(){
  $('backScore').textContent = String(S.score).padStart(3,'0');
  const mistakes = $('backMistakes'); mistakes.setAttribute('aria-label', `실수 ${S.mistakes}회 / 3회`);
  [...mistakes.querySelectorAll('i')].forEach((el,i) => el.classList.toggle('on', i < S.mistakes));
  document.querySelectorAll('.step-pills>span').forEach((el,i) => {
    el.classList.toggle('active', i === S.step && S.phase !== 'result'); el.classList.toggle('done', i < S.results.length);
  });
  $('positionTarget').style.left = TARGETS[Math.min(2,S.step)]*100 + '%';
  slider.value = S.position; slider.disabled = S.phase !== 'play' || S.holdAt !== null;
  press.disabled = S.phase !== 'play';
  $('backPositionHint').textContent = S.tilt ? '기울여 손을 옮겨요' : '등을 드래그해도 돼요';
}
function setPosition(value){
  if(S.phase !== 'play' || S.holdAt !== null) return;
  S.position = Math.max(0,Math.min(1,Number(value))); slider.value = S.position;
}
function localPoint(e){
  const rect = app.getBoundingClientRect();
  return rotated ? {x:e.clientY - rect.top, y:rect.right - e.clientX} : {x:e.clientX - rect.left,y:e.clientY - rect.top};
}
function cancelPress(){
  S.holdAt = null; S.pointer = null; press.classList.remove('holding','over'); press.querySelector('b').textContent = '꾹'; sync();
}
function beginPress(pointer = 'key'){
  if(S.phase !== 'play' || S.holdAt !== null) return;
  ensureSound(); S.pointer = pointer; S.holdAt = performance.now();
  press.classList.add('holding'); press.querySelector('b').textContent = '꾹…'; sync();
}
function releasePress(){
  if(S.holdAt === null || S.phase !== 'play') return;
  const now = performance.now(), pressure = pressureAt(now - S.holdAt);
  S.outcome = judgePress(S.position, S.step, pressure); S.kind = S.outcome.kind; S.peakPressure = pressure;
  S.holdAt = null; S.pointer = null; S.phase = 'anim'; S.animAt = now;
  press.classList.remove('holding','over'); press.querySelector('b').textContent = '뚝!';
  if(S.kind === 'ok'){
    S.score += S.outcome.points;
    cue(S.outcome.perfect ? ['딱 거기! 두둑!','이번엔 두루룩!','허리까지 우두두둑!'][S.step] : '좋아요, 그 자리예요. 두루룩!', 'good');
    if(navigator.vibrate) navigator.vibrate([30,25,35]);
  }else{
    S.mistakes++;
    cue({weak:'…선생님, 아직 손만 얹으신 거죠?',miss:'거긴 간지러운데요!',over:'선생님! 침대가 먼저 접혔어요!'}[S.kind], 'bad');
    if(navigator.vibrate) navigator.vibrate(50);
  }
  crack(S.kind,S.step); sync();
}
function finish(){
  S.phase = 'result'; cancelPress(); $('backControls').hidden = true; $('backPause').hidden = true;
  const completed = S.results.length, best = store.get('chiroBackBest',0), newBest = completed === 3 && S.score > best;
  if(newBest) store.set('chiroBackBest',S.score);
  $('backResultTitle').textContent = completed === 3 ? '허리까지 시원하게.' : '오늘은 여기까지만.';
  $('backReview').textContent = completed === 3 ? '“목만 풀러 왔는데, 출근할 용기까지 생겼어요.”' : '“접이식은 제 허리만으로 충분해요…”';
  $('backTotal').textContent = S.score;
  $('backResultSteps').replaceChildren(...names.map((name,i) => {
    const span = document.createElement('span'); const result = S.results[i];
    span.textContent = `${name} ${result ? result.points + '점' : '—'}`; return span;
  }));
  $('backRank').textContent = formatRank(S.score,S.mistakes);
  $('backBest').textContent = newBest ? '새 최고 기록! ' + S.score + '점' : `최고 기록 ${Math.max(best,newBest ? S.score : 0)}점`;
  $('backBestSmall').textContent = `최고 ${store.get('chiroBackBest',0)}점`;
  $('backResult').hidden = false; sync();
}
function start(){
  if(!scene) return;
  ensureSound(); stopSound();
  Object.assign(S,{phase:'play',position:.5,step:0,score:0,mistakes:0,results:[],holdAt:null,pointer:null,animAt:0,kind:'ok',outcome:null,peakPressure:0,tiltLast:null});
  $('backWelcome').hidden = true; $('backResult').hidden = true; $('backPaused').hidden = true;
  $('backControls').hidden = false; $('backPause').hidden = false;
  press.querySelector('b').textContent = '꾹';
  cue('손을 첫 번째 민트 링으로 옮겨 주세요'); sync();
}
function pause(){
  if(S.phase !== 'play' && S.phase !== 'anim') return;
  S.previousPhase = S.phase; S.pausedAt = performance.now(); cancelPress(); S.phase = 'paused';
  stopSound(); if(audio) audio.suspend().catch(() => {});
  $('backPaused').hidden = false; sync();
}
function resume(){
  if(S.phase !== 'paused') return;
  if(S.previousPhase === 'anim') S.animAt += performance.now() - S.pausedAt;
  S.phase = S.previousPhase; S.tiltLast = null; $('backPaused').hidden = true; ensureSound(); sync();
}
function resize(){
  if(S.holdAt !== null) cancelPress();
  const w = innerWidth, h = innerHeight; rotated = h > w;
  width = rotated ? h : w; height = rotated ? w : h; app.classList.toggle('self-rotated',rotated);
  app.style.width = width + 'px'; app.style.height = height + 'px';
  app.style.transform = rotated ? `translateX(${w}px) rotate(90deg)` : 'none';
  app.style.left = '0'; app.style.top = '0'; S.tiltLast = null;
  if(scene) scene.resize(width,height);
}
let dragPointer = null;
canvas.addEventListener('pointerdown', e => {
  if(S.phase !== 'play' || S.holdAt !== null) return;
  const p = localPoint(e), position = scene.pickPosition(p.x,p.y);
  if(position === null || position === undefined) return;
  dragPointer = e.pointerId; canvas.setPointerCapture(e.pointerId); setPosition(position);
});
canvas.addEventListener('pointermove', e => {
  if(dragPointer !== e.pointerId) return;
  const p = localPoint(e), position = scene.pickPosition(p.x,p.y);
  if(position !== null && position !== undefined) setPosition(position);
});
for(const event of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(event, () => { dragPointer = null; });
slider.addEventListener('input', e => setPosition(e.target.value));
press.addEventListener('pointerdown', e => {
  if(e.button !== 0 && e.pointerType === 'mouse') return;
  e.preventDefault(); if(S.phase !== 'play') return;
  press.setPointerCapture(e.pointerId); beginPress(e.pointerId);
});
press.addEventListener('pointerup', e => {
  if(S.pointer !== e.pointerId) return;
  releasePress(); if(press.hasPointerCapture(e.pointerId)) press.releasePointerCapture(e.pointerId);
});
for(const event of ['pointercancel','lostpointercapture']) press.addEventListener(event, () => { if(S.holdAt !== null) cancelPress(); });
press.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('keydown', e => {
  if(e.code === 'Escape'){ if(S.phase === 'paused') resume(); else pause(); return; }
  if(S.phase !== 'play') return;
  if(e.code === 'Space' && e.target !== slider){ e.preventDefault(); if(!e.repeat) beginPress(); }
  if(e.target !== slider && ['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(e.code)){
    e.preventDefault(); setPosition(S.position + (['ArrowLeft','ArrowUp'].includes(e.code) ? -.02 : .02));
  }
});
addEventListener('keyup', e => { if(e.code === 'Space' && S.pointer === 'key'){ e.preventDefault(); releasePress(); } });
addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => { if(document.hidden) pause(); });
$('backPause').addEventListener('click',pause); $('backResume').addEventListener('click',resume);
$('backStart').addEventListener('click',start); $('backAgain').addEventListener('click',start);
$('backSound').addEventListener('click',() => {
  S.sound = !S.sound; $('backSound').setAttribute('aria-pressed',String(S.sound)); $('backSound').textContent = S.sound ? '소리 켬' : '소리 끔';
  if(S.sound) ensureSound(); else stopSound();
});
// Optional tilt positioning only. A physical flick never triggers an accidental press.
if(matchMedia('(pointer: coarse)').matches && 'DeviceMotionEvent' in window) $('backTilt').hidden = false;
$('backTilt').addEventListener('click',async () => {
  if(S.tilt){ S.tilt = false; S.tiltLast = null; $('backTilt').textContent = '기울기로 손 이동'; sync(); return; }
  try{
    const allowed = typeof DeviceMotionEvent.requestPermission === 'function' ? await DeviceMotionEvent.requestPermission() : 'granted';
    if(allowed !== 'granted'){ cue('기울기 대신 드래그로 손을 옮겨 주세요'); return; }
    S.tilt = true; S.tiltLast = null; $('backTilt').textContent = '터치로 손 이동'; sync();
  }catch{ cue('기울기 대신 드래그로 손을 옮겨 주세요'); }
});
addEventListener('devicemotion',e => {
  if(!S.tilt || S.phase !== 'play' || S.holdAt !== null){ S.tiltLast = null; return; }
  const a = e.accelerationIncludingGravity;
  if(!a || a.x == null || a.y == null || a.z == null) return;
  if(Math.abs(Math.hypot(a.x,a.y,a.z)-9.81)>2) return;
  const pa = screen.orientation?.angle ?? window.orientation ?? 0;
  const t = tiltAngles(a.x,a.y,a.z,(pa + (rotated ? 90 : 0))*Math.PI/180);
  const prev = S.tiltLast; S.tiltLast = t;
  if(!prev || Math.abs(t.lr-prev.lr)>12) return;
  setPosition(S.position+(t.lr-prev.lr)*.007);
});
function frame(now){
  raf = requestAnimationFrame(frame);
  if(!scene) return;
  let pressure = S.holdAt === null ? 0 : pressureAt(now-S.holdAt), impulse = 0;
  if(S.phase === 'anim'){
    const t = (now-S.animAt)/1000; impulse = pressProfile(t,S.kind);
    pressure = S.peakPressure*Math.max(0,1-t/.35);
    if(t > (S.kind === 'ok' && S.step === 2 ? 2.1 : S.kind === 'over' ? 1.5 : 1.05)){
      if(S.kind === 'ok'){
        S.results.push(S.outcome);
        if(S.results.length === 3){ finish(); }
        else{ S.step++; S.phase='play'; cue(`${names[S.step]}으로 손을 옮겨 주세요`); }
      }else if(S.mistakes >= 3) finish();
      else{ S.phase='play'; cue('괜찮아요. 같은 구역에서 다시 해봐요'); }
      press.querySelector('b').textContent='꾹'; sync();
    }
  }
  if(S.phase === 'play'){
    const near = Math.abs(S.position-TARGETS[S.step]) <= POSITION_TOL;
    const label = pressure === 0 ? near ? '그 자리예요. 꾹 눌러요' : '민트 링에 손을 맞춰요' : pressure < SWEET.min ? '조금만 더 눌러요' : pressure <= SWEET.max ? '지금 놓으세요!' : '너무 세요!';
    $('backPressureLabel').textContent=label;
    $('backPressureLabel').style.color=pressure>SWEET.max ? 'var(--coral)' : 'var(--mint)';
    if(S.holdAt !== null){ cue(label,pressure>SWEET.max ? 'bad' : pressure>=SWEET.min ? 'good' : ''); }
    else if(near) cue('딱 그 자리! 꾹 누르다 민트에서 놓으세요','good');
    else cue(`${names[S.step]} 민트 링에 손을 맞춰 주세요`);
  }
  $('backPressureFill').style.width = Math.min(100,pressure/1.35*100)+'%';
  $('backPressureNeedle').style.left = Math.min(100,pressure/1.35*100)+'%';
  press.classList.toggle('over',pressure>SWEET.max && S.holdAt !== null);
  slider.disabled = S.phase !== 'play' || S.holdAt !== null;
  if(S.phase !== 'paused') scene.render({now,position:S.position,pressure:Math.min(1,pressure),impulse:reduced ? impulse*.3 : impulse,kind:S.kind,step:S.step,completed:S.results.length});
}
addEventListener('resize',resize); resize();
$('backBestSmall').textContent = `최고 ${store.get('chiroBackBest',0)}점`;
try{
  scene = await createBackScene(canvas); resize();
  S.phase='ready'; $('backStart').disabled=false; $('backStart').textContent='허리 진료 시작';
  document.documentElement.dataset.backReady='true'; raf = requestAnimationFrame(frame);
}catch(error){
  console.error('허리 진료실을 불러오지 못했어요',error);
  $('backLoadNote').textContent='진료실을 불러오지 못했어요. 다시 열어 주세요.';
  $('backStart').textContent='다시 불러오기'; $('backStart').disabled=false;
  $('backStart').addEventListener('click',() => location.reload(),{once:true});
}
addEventListener('pagehide',() => { cancelAnimationFrame(raf); stopSound(); });
addEventListener('pageshow',e => { if(e.persisted && scene){ cancelAnimationFrame(raf); resize(); raf=requestAnimationFrame(frame); } });
// Read-only state for shot builds; no force-success path in the normal game.
if(import.meta.env.MODE === 'shot') window.__backShot = {snapshot:() => ({...S,results:[...S.results]}),project:position=>scene?.projectPosition(position)};

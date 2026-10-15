import {createBackScene} from './scene.js';
import {TARGETS,SWEET,pressureAt,judgePress,backDistance,pressProfile,reactionTiming,BACK_XRAY,makeBackTargets,pressureHint} from './core.js';
import {BackMotion} from './motion.js';
import {breathState,closenessOf} from '../core/feel.js';
import {PREP_MS} from '../core/cue.js';
import {rankTitle} from '../core/scoring.js';
import {T} from '../tuning.js';
import {store} from '../lib/store.js';

const $=id=>document.getElementById(id), app=$('backApp'),canvas=$('backCanvas'),press=$('backPress'),slider=$('backPosition');
const motionDebug=new URLSearchParams(location.search).has('motionDebug');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse=matchMedia('(pointer: coarse)').matches;
const preferMotion=coarse&&'DeviceMotionEvent' in window;
const motion=new BackMotion();
const S={phase:'loading',control:preferMotion?'motion':'touch',position:.5,pressure:.12,step:0,score:0,mistakes:0,streak:0,painHere:0,
  targets:[...TARGETS],results:[],fails:[],holdAt:null,pointer:null,pending:null,animAt:0,kind:'ok',tier:0,force:0,outcome:null,peakPressure:0,sound:true,
  motionEnabled:false,motionReady:false,lastSample:0,sensorStatus:'waiting',prepUntil:0,breathAt:0,nearSaid:false,missAt:0,missPosition:.5,
  cue:'',pausedAt:0,previousPhase:null,sirenPlayed:false,faceVisible:false,speechStage:-1};
let scene,width=innerWidth,height=innerHeight,rotated=false,raf=0,wasNear=false,nextPulse=0;
const names=['등 위쪽','등 가운데','허리'];
let audio, samples = {}, sources = new Set();
function ensureSound(){
  if(!S.sound) return;
  try{
    if(!audio){
      audio = new (window.AudioContext || window.webkitAudioContext)();
      for(const [key,file] of Object.entries({crack:'crack-hard.wav', tail:'crack.wav', break:'break.wav'}))
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
  if(kind === 'over'){ tone(110,360,.16,.14);tone(360,70,.35,.12,.13);return; }
  if(kind === 'miss'){ if(S.outcome?.feedback==='dud')soundSample('tail',.16,.8);else soundSample('crack',.26,1.65);return; }
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

}
function soundSample(key,volume,rate=1){
  if(!S.sound||!audio)return;
  if(!samples[key]){tone(180,40,.17,volume*.2);return;}
  const source=audio.createBufferSource(),g=audio.createGain();source.buffer=samples[key];source.playbackRate.value=rate;g.gain.value=volume;
  source.connect(g);g.connect(audio.destination);sources.add(source);source.onended=()=>{sources.delete(source);source.disconnect();g.disconnect();};source.start();
}
function damageSound(tier){soundSample('break',tier===2?.85:.6,tier===2?1:1.15);if(tier===2)soundSample('crack',.6,.88);}
function ambulanceSound(){for(let i=0;i<4;i++)tone(960,700,.48,.10,i*.55);}
function cue(text,style=''){
  if(text===S.cue&&$('backCue').className==='cue '+style)return;
  S.cue=text;$('backCue').textContent=text;$('backCue').className='cue '+style;
}
function sync(){
  app.dataset.input=S.control;
  $('backScore').textContent=String(S.score).padStart(3,'0');
  const el=$('backMistakes');el.setAttribute('aria-label',`통증 ${S.mistakes}회 / 3회`);
  [...el.querySelectorAll('i')].forEach((e,i)=>e.classList.toggle('on',i<S.mistakes));
  document.querySelectorAll('.step-pills>span').forEach((e,i)=>{e.classList.toggle('active',i===S.step&&S.phase!=='result');e.classList.toggle('done',i<S.results.length);});
  $('positionTarget').style.left=(1-S.targets[Math.min(2,S.step)])*100+'%';slider.value=S.position;
  slider.disabled=S.phase!=='play'||S.holdAt!==null||S.control!=='touch';press.disabled=S.phase!=='play'||S.control!=='touch';
  $('backMotionNotice').hidden=S.control!=='motion'||(S.sensorStatus==='connected'&&S.motionReady);
  $('backSensorRetry').hidden=S.sensorStatus!=='denied';
  $('backCenter').hidden=S.control!=='motion';
}
function setPosition(value){if(S.phase!=='play'||S.holdAt!==null||S.control!=='touch')return;S.position=Math.max(0,Math.min(1,Number(value)));slider.value=S.position;}
function cancelInput(){S.holdAt=null;S.pointer=null;S.pending=null;press.classList.remove('holding','over');press.querySelector('b').textContent='꾹';sync();}
function beginPress(pointer='key'){
  if(S.phase!=='play'||S.control!=='touch'||S.holdAt!==null||performance.now()<S.prepUntil)return;
  ensureSound();S.pointer=pointer;S.holdAt=performance.now();press.classList.add('holding');sync();
}
function applyPress(position,pressure,force=1){
  if(S.phase!=='play')return;
  const now=performance.now(),br=breathState(now,S.breathAt,4.4);
  S.position=position;S.pressure=pressure;S.force=force;
  S.outcome=judgePress(position,S.step,pressure,force,{streak:S.streak,pain:S.painHere,exhale:T.breath&&br.exhale,targets:S.targets});
  S.kind=S.outcome.kind;S.tier=S.outcome.tier;S.peakPressure=pressure;S.animAt=now;S.phase='anim';S.pending=null;
  S.holdAt=null;S.pointer=null;S.sirenPlayed=false;S.speechStage=-1;
  press.classList.remove('holding','over');
  if(S.kind==='ok'){S.score+=S.outcome.points;S.streak=S.outcome.streak;crack('ok',S.step);if(navigator.vibrate)navigator.vibrate([45,40,45,40,80]);}
  else{S.mistakes++;S.painHere++;S.streak=0;S.fails.push({kind:S.kind,tier:S.tier});
    if(S.tier)damageSound(S.tier);else if(S.kind==='weak')soundSample('tail',.22,1.15);else crack(S.kind,S.step);
    if(navigator.vibrate)navigator.vibrate(S.tier?[100,40,130]:[55]);}
  $('backImpact').textContent=S.tier===2?'아그작!!':S.tier===1?'으그적!':S.kind==='ok'?S.step===2?'우두두둑!':'두루룩!':S.kind==='weak'?'뚜…륵?':S.kind==='over'?'뾰잉!':S.outcome.feedback==='dud'?'뚜…둑?':'손가락 뚝!';
  cue(S.kind==='ok'?'그 자리에서 우두둑.':S.tier?'잠깐… 방금 소리가 이상한데요.':'조금 빗나갔어요.',S.kind==='ok'?'good':'bad');sync();
}
function releasePress(){if(S.holdAt!==null&&S.phase==='play'&&S.control==='touch')applyPress(S.position,pressureAt(performance.now()-S.holdAt),1);}
function finish(){
  S.phase='result';cancelInput();$('backControls').hidden=true;$('backPause').hidden=true;$('backMotionNotice').hidden=true;
  const complete=S.results.length===3,best=store.get('chiroBackMotionBest',0),record=complete&&S.score>best;
  if(record)store.set('chiroBackMotionBest',S.score);
  $('backResultTitle').textContent=S.tier?'구급차가 왔어요':complete?'허리까지 시원하게.':'오늘은 여기까지만.';
  $('backReview').textContent=S.tier?'“허리 풀러 왔다가 구급차 타고 갑니다…”':complete?'“와… 그 우두둑 소리, 아직 귀에 남아요.”':'“다음엔 살살 부탁해요…”';
  $('backTotal').textContent=S.score;
  $('backResultSteps').replaceChildren(...names.map((name,i)=>{const e=document.createElement('span');e.textContent=`${name} ${S.results[i]?S.results[i].points+'점':'—'}`;return e;}));
  $('backRank').textContent=rankTitle(S.score/3,S.tier?3:S.mistakes);
  $('backBest').textContent=record?`새 최고 기록! ${S.score}점`:`최고 기록 ${best}점`;
  $('backBestSmall').textContent=`최고 ${store.get('chiroBackMotionBest',0)}점`;
  $('backResult').hidden=false;sync();
}
// Invoke both iOS permission APIs synchronously inside the start tap, as in neck adjustment.
async function start(useMotion=preferMotion){
  let permission,orientationPermission;
  if(useMotion){
    try{if(typeof DeviceMotionEvent.requestPermission==='function')permission=DeviceMotionEvent.requestPermission();}catch{permission=Promise.resolve('denied');}
    try{if(typeof window.DeviceOrientationEvent?.requestPermission==='function')orientationPermission=DeviceOrientationEvent.requestPermission();}catch{}
  }
  if(!scene)return;
  ensureSound();stopSound();
  let granted=true;
  try{if(permission)granted=(await permission)==='granted';if(orientationPermission)await orientationPermission;}catch{granted=false;}
  motion.reset();
  Object.assign(S,{phase:'play',control:useMotion?'motion':'touch',position:.5,pressure:.12,step:0,score:0,mistakes:0,streak:0,painHere:0,targets:makeBackTargets(),results:[],fails:[],
    holdAt:null,pointer:null,pending:null,animAt:0,kind:'ok',tier:0,force:0,outcome:null,peakPressure:0,motionEnabled:useMotion&&granted,
    motionReady:false,lastSample:0,sensorStatus:granted?'waiting':'denied',prepUntil:performance.now()+PREP_MS,breathAt:performance.now(),nearSaid:false,missAt:0,faceVisible:false});
  $('backWelcome').hidden=true;$('backResult').hidden=true;$('backPaused').hidden=true;$('backControls').hidden=false;$('backPause').hidden=false;
  $('backMotionStatus').textContent=granted?'폰을 가로로 편하게 들고 잠깐 기다려 주세요.':'동작 센서가 꺼져 있어요. 다시 연결해 주세요.';
  sync();
}
function pause(){
  if(S.phase!=='play'&&S.phase!=='anim')return;
  S.previousPhase=S.phase;S.pausedAt=performance.now();cancelInput();S.phase='paused';
  stopSound();if(audio)audio.suspend().catch(()=>{});$('backPaused').hidden=false;sync();
}
function resume(){
  if(S.phase!=='paused')return;
  if(S.previousPhase==='anim')S.animAt+=performance.now()-S.pausedAt;
  S.phase=S.previousPhase;motion.recenter();S.motionReady=false;$('backPaused').hidden=true;ensureSound();sync();
}
function resize(){
  if(S.holdAt!==null||S.pending)cancelInput();
  const w=innerWidth,h=innerHeight;rotated=h>w;width=rotated?h:w;height=rotated?w:h;
  app.classList.toggle('self-rotated',rotated);app.style.width=width+'px';app.style.height=height+'px';
  app.style.transform=rotated?`translateX(${w}px) rotate(90deg)`:'none';app.style.left='0';app.style.top='0';
  motion.recenter();S.motionReady=false;if(scene)scene.resize(width,height);
}
function localPoint(e){const r=app.getBoundingClientRect();return rotated?{x:e.clientY-r.top,y:r.right-e.clientX}:{x:e.clientX-r.left,y:e.clientY-r.top};}
let dragPointer=null;
canvas.addEventListener('pointerdown',e=>{
  if(S.phase!=='play'||S.control!=='touch'||S.holdAt!==null)return;
  const p=localPoint(e),v=scene.pickPosition(p.x,p.y);if(v==null)return;
  dragPointer=e.pointerId;canvas.setPointerCapture(e.pointerId);setPosition(v);
});
canvas.addEventListener('pointermove',e=>{if(dragPointer!==e.pointerId)return;const p=localPoint(e),v=scene.pickPosition(p.x,p.y);if(v!=null)setPosition(v);});
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{dragPointer=null;});
slider.addEventListener('input',e=>setPosition(e.target.value));
press.addEventListener('pointerdown',e=>{if(e.button!==0&&e.pointerType==='mouse')return;e.preventDefault();if(S.phase!=='play'||S.control!=='touch')return;press.setPointerCapture(e.pointerId);beginPress(e.pointerId);});
press.addEventListener('pointerup',e=>{if(S.pointer!==e.pointerId)return;releasePress();if(press.hasPointerCapture(e.pointerId))press.releasePointerCapture(e.pointerId);});
for(const event of ['pointercancel','lostpointercapture'])press.addEventListener(event,()=>{if(S.holdAt!==null||S.pending)cancelInput();});
press.addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('keydown',e=>{
  if(e.code==='Escape'){if(S.phase==='paused')resume();else pause();return;}
  if(S.phase!=='play'||S.control!=='touch')return;
  if(e.code==='Space'&&e.target!==slider){e.preventDefault();if(!e.repeat)beginPress();}
  if(e.target!==slider&&['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(e.code)){e.preventDefault();setPosition(S.position+(['ArrowLeft','ArrowUp'].includes(e.code)?.02:-.02));}
});
addEventListener('keyup',e=>{if(e.code==='Space'&&S.pointer==='key'){e.preventDefault();releasePress();}});
addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
$('backPause').addEventListener('click',pause);$('backResume').addEventListener('click',resume);
$('backStart').addEventListener('click',()=>start());$('backAgain').addEventListener('click',()=>start(S.control==='motion'));
$('backTouchStart').addEventListener('click',()=>start(false));$('backTouchFallback').addEventListener('click',()=>start(false));
$('backSensorRetry').addEventListener('click',()=>start(true));
$('backCenter').addEventListener('click',()=>{motion.recenter();S.motionReady=false;S.position=.5;S.pressure=.12;S.prepUntil=performance.now()+700;sync();});
$('backSound').addEventListener('click',()=>{S.sound=!S.sound;$('backSound').setAttribute('aria-pressed',String(S.sound));$('backSound').textContent=S.sound?'소리 켬':'소리 끔';if(S.sound)ensureSound();else stopSound();});
addEventListener('deviceorientation',e=>motion.orientation(e,performance.now()));
addEventListener('devicemotion',e=>{
  if(S.control!=='motion'||!S.motionEnabled||!['play','anim'].includes(S.phase))return;
  const now=performance.now(),pa=screen.orientation?.angle??window.orientation??0;
  const active=S.phase==='play',canPush=active&&!S.pending&&now>=S.prepUntil;
  const sample=motion.sample(e,now,(pa+(rotated?90:0))*Math.PI/180,{active,canPush,step:S.step,sens:T.sens,bend:T.bend,heavy:T.heavy,jerk:T.jerk,flick:T.flick,targets:S.targets});
  if(!sample)return;
  if(motionDebug){$('backDebug').hidden=false;$('backDebug').textContent=`툭 ${sample.force.toFixed(2)} · 앞 ${sample.forward.toFixed(1)} / 뒤 ${sample.reverse.toFixed(1)} · 중력부호 ${sample.sign} / 선가속도 ${sample.linearSign} · 지난 힘 ${S.force.toFixed(2)}`;}
  S.lastSample=now;S.sensorStatus='connected';const becameReady=!S.motionReady&&sample.ready;S.motionReady=sample.ready;
  if(becameReady){S.prepUntil=Math.max(S.prepUntil,now+600);sync();}
  if(S.pending){
    S.pending.force=Math.max(S.pending.force,sample.force);
    const p=S.pending;
    if(p.force>=1&&judgePress(p.position,S.step,p.pressure,p.force,{targets:S.targets}).kind==='ok')applyPress(p.position,p.pressure,p.force);
    return;
  }
  if(sample.type==='impulse'&&canPush){
    const outcome=judgePress(sample.position,S.step,sample.pressure,sample.force,{targets:S.targets});
    if(sample.force>=1&&outcome.kind==='ok')applyPress(sample.position,sample.pressure,sample.force);
    else S.pending={at:now,position:sample.position,pressure:sample.pressure,force:sample.force};
    return;
  }
  if(active&&sample.type==='aim'){S.position=sample.position;S.pressure=sample.pressure;}
});
function speechFor(kind,tier,t){
  if(tier)return t<.8?tier===2?'으아아악!!':'어… 방금 으그적 했는데요?':t<2?'잠깐만요! 허리에서 과자 소리가…':'선생님… 구급차 불러 주세요…';
  if(kind==='ok')return t<.22?'헉!':t<1.5?'하아… 거기였어요.':'와… 허리가 쭉 풀리는 느낌이에요.';
  if(kind==='weak')return t<1?'…아직 시작 안 하신 거죠?':'누르신 거예요, 손만 얹으신 거예요?';
  if(kind==='over')return t<.7?'아 잠깐잠깐잠깐!':'침대까지 같이 접으실 생각이에요?!';
  return S.outcome?.feedback==='dud'?'거의 거긴데… 아직 덜 풀렸어요.':t<.8?'방금 선생님 손가락에서 소리 났는데요?':'제 허리는 아직 그대로예요…';
}
function frame(now){
  raf=requestAnimationFrame(frame);if(!scene)return;
  if(S.pending&&now-S.pending.at>=130){const p=S.pending;applyPress(p.position,p.pressure,p.force);}
  let pressure=S.control==='motion'?S.pressure:S.holdAt===null?0:pressureAt(now-S.holdAt),impulse=0,shotTime=-1,face=false;
  const br=breathState(now,S.breathAt,4.4);$('backBreath').textContent=br.exhale?'후우… 지금 툭 하면 날숨 보너스':'흐읍… 들이쉬는 중';app.classList.toggle('exhaling',br.exhale);
  if(S.phase==='anim'){
    shotTime=(now-S.animAt)/1000;const timing=reactionTiming(S.kind,S.tier);
    impulse=pressProfile(shotTime,S.kind)*(S.tier?S.tier===2?1.7:1.35:1);
    pressure=S.peakPressure*Math.max(0,1-shotTime/.35);
    face=shotTime>=timing.faceAt&&shotTime<timing.faceEnd;
    if(face){const faceTime=shotTime-timing.faceAt;$('backSpeech').textContent=speechFor(S.kind,S.tier,faceTime);}
    $('backCutLabel').textContent=face?'':S.tier===2?'골절!':S.tier===1?'뼈에 금이 갔어요':S.kind==='ok'?'압박이 풀리는 순간':S.kind==='weak'?'아직 풀리지 않았어요':'압박이 빗나갔어요';
    $('backCutLabel').hidden=face||shotTime<BACK_XRAY.start;
    if(shotTime>=BACK_XRAY.start&&shotTime<BACK_XRAY.release&&!S.tier)$('backCutLabel').textContent=S.kind==='ok'?'꽉 눌려 있던 그 자리':'아직 압박이 남아 있어요';
    if(S.tier&&shotTime>=timing.sirenAt&&!S.sirenPlayed){S.sirenPlayed=true;ambulanceSound();}
    app.classList.toggle('ambulance',S.tier>0&&shotTime>=timing.sirenAt);
    if(shotTime>timing.end){
      app.classList.remove('ambulance');$('backCutLabel').hidden=true;
      if(S.tier){finish();}
      else if(S.kind==='ok'){
        S.results.push(S.outcome);if(S.results.length===3)finish();
        else{S.step++;S.painHere=0;S.phase='play';S.nearSaid=false;S.prepUntil=now+700;}
      }else if(S.mistakes>=3)finish();else{S.phase='play';S.prepUntil=now+700;S.missAt=now;S.missPosition=S.position;}
      sync();face=false;shotTime=-1;
    }
  }
  S.faceVisible=face;$('backSpeech').hidden=!face;app.classList.toggle('face-closeup',face);
  $('backImpact').hidden=!(S.phase==='anim'&&shotTime>=0&&shotTime<.65);
  const distance=backDistance(S.position,S.step,pressure,S.targets),near=distance<=1;
  if(S.phase==='play'&&now>=S.prepUntil&&(S.control==='touch'||S.motionReady)){
    if(near&&!wasNear){tone(880,1320,.06,.04);if(navigator.vibrate)navigator.vibrate(35);}
    const close=closenessOf(distance);if(close>.05&&now>nextPulse){if(T.tick)tone(520+520*close,480+480*close,.03,.012);nextPulse=now+560-450*close;}
  }
  wasNear=S.phase==='play'&&near;
  if(S.phase==='play'){
    let label;
    if(now<S.prepUntil)label='힘 빼세요. 손을 얹고 있어요…';
    else if(S.control==='motion'&&!S.motionReady)label='폰을 편하게 들고 잠깐 멈춰 주세요';
    else if(pressure>SWEET.max)label='너무 깊어요. 폰 앞쪽을 조금 들어 주세요';
    else if(near)label=S.control==='motion'?'그 자리! 폰을 앞으로 짧게 툭 밀어요':'그 자리! 민트에서 손을 떼요';
    else if(pressureHint(S.position,S.step,pressure,S.targets)==='position')label=S.control==='motion'?(S.step===2&&S.painHere===0?'천천히 훑어요. 틱 소리가 빨라지는 자리를 찾아요':'좌우로 기울여 민트 링에 손을 맞춰요'):`${names[S.step]} 민트 링에 손을 맞춰 주세요`;
    else if(pressureHint(S.position,S.step,pressure,S.targets)==='release')label=S.control==='motion'?'조금 깊어요. 폰 앞쪽을 살짝 들어요':'압박을 조금 빼 주세요';
    else label=S.control==='motion'?'폰 앞쪽을 천천히 낮춰 압박을 실어요':'조금만 더 꾹 눌러요';
    $('backPressureLabel').textContent=pressure>SWEET.max?'너무 깊어요':near?'준비됐어요':pressureHint(S.position,S.step,pressure,S.targets)==='release'?'힘을 조금 빼요':'압박을 맞춰요';
    cue(label,pressure>SWEET.max?'bad':near?'good':'');
    if(S.control==='motion'){
      $('backMotionStatus').textContent=S.sensorStatus==='denied'?'센서가 꺼져 있어요. 다시 연결해 주세요.':S.lastSample&&now-S.lastSample>1800?'센서 연결이 끊겼어요. 자세를 다시 잡아 주세요.':!S.lastSample&&now-S.breathAt>2200?'동작 센서를 기다리고 있어요. Safari에서 센서를 연결해 주세요.':'폰을 가로로 편하게 들고 잠깐 멈춰 주세요.';
      $('backMotionNotice').hidden=S.sensorStatus==='connected'&&S.motionReady&&now-S.lastSample<1800;
    }
  }
  $('backPressureFill').style.width=Math.min(100,pressure/1.35*100)+'%';$('backPressureNeedle').style.left=Math.min(100,pressure/1.35*100)+'%';
  $('backPositionDot').style.left=S.position*100+'%';slider.value=S.position;
  press.classList.toggle('over',pressure>SWEET.max&&S.holdAt!==null);
  app.dataset.phase=S.phase;
  const mark=S.phase==='play'&&S.missAt>0&&now-S.missAt<3000;
  $('backMissMark').hidden=!mark;$('backAnswer').hidden=!mark;
  if(S.phase!=='paused')scene.render({now,position:S.position,pressure:Math.min(1,pressure),impulse:reduced?impulse*.3:impulse,kind:S.kind,step:S.step,completed:S.results.length,
    shotTime,forceTier:S.tier,faceVisible:face,faceTime:face?shotTime-reactionTiming(S.kind,S.tier).faceAt:0,breath:br.fill,peakPressure:S.peakPressure,targets:S.targets,showTargets:S.control==='touch'||S.step<2,revealTarget:S.painHere>0});
  if(mark){for(const [id,p] of [['backMissMark',S.missPosition],['backAnswer',S.targets[S.step]]]){const point=scene.projectPosition(p);$(id).style.left=point.x+'px';$(id).style.top=point.y+'px';}}
}
addEventListener('resize',resize);resize();
$('backBestSmall').textContent=`최고 ${store.get('chiroBackMotionBest',0)}점`;
try{scene=await createBackScene(canvas);resize();S.phase='ready';$('backStart').disabled=false;$('backTouchStart').disabled=false;
  $('backStart').textContent=preferMotion?'폰 들고 진료 시작':'마우스로 진료 연습';document.documentElement.dataset.backReady='true';raf=requestAnimationFrame(frame);
}catch(error){console.error('허리 진료실을 불러오지 못했어요',error);$('backLoadNote').textContent='진료실을 불러오지 못했어요. 다시 열어 주세요.';$('backStart').textContent='다시 불러오기';$('backStart').disabled=false;$('backStart').addEventListener('click',()=>location.reload(),{once:true});}
addEventListener('pagehide',()=>{cancelAnimationFrame(raf);stopSound();});
addEventListener('pageshow',e=>{if(e.persisted&&scene){cancelAnimationFrame(raf);resize();raf=requestAnimationFrame(frame);}});
if(import.meta.env.MODE==='shot')window.__backShot={snapshot:()=>({...S,results:[...S.results]}),project:p=>scene?.projectPosition(p)};

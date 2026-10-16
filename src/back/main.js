import {therapistStyle} from './therapistMotion.js';
import {createClinicAudio} from 'virtual:clinic-audio';
import {FAIL_STAMP,FORCE_STAMP,FORCE_LINES,failLine,reviewLine} from '../core/fail.js';
import {pickReaction} from '../core/faceRig.js';
import {ROSTER} from '../patient/roster.js';
import {createBackScene} from './scene.js';
import {pressedSegment,pressedZone,TARGETS,SWEET,judgePress,backDistance,pressProfile,reactionTiming,BACK_XRAY,makeBackTargets,pressureHint,clinicFilm} from './core.js';
import {BackMotion} from './motion.js';
import {breathState,closenessOf} from '../core/feel.js';
import {PREP_MS} from '../core/cue.js';
import {rankTitle} from '../core/scoring.js';
import {T} from '../tuning.js';
import {store} from '../lib/store.js';

const $=id=>document.getElementById(id), app=$('backApp'),canvas=$('backCanvas'),press=$('backPress'),slider=$('backPosition');
let drag=null,swipePeak=0;
const motionDebug=new URLSearchParams(location.search).has('motionDebug');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse=matchMedia('(pointer: coarse)').matches;
const preferMotion=coarse&&'DeviceMotionEvent' in window;
const motion=new BackMotion();
const S={phase:'loading',control:preferMotion?'motion':'touch',position:.5,pressure:.12,step:0,score:0,mistakes:0,streak:0,painHere:0,
  targets:[...TARGETS],results:[],fails:[],holdAt:null,pointer:null,pending:null,animAt:0,kind:'ok',tier:0,force:0,outcome:null,peakPressure:0,sound:true,music:store.get("chiroBackMusic",true),
  motionEnabled:false,motionReady:false,lastSample:0,sensorStatus:'waiting',prepUntil:0,breathAt:0,nearSaid:false,missAt:0,missPosition:.5,
  cue:'',pausedAt:0,previousPhase:null,sirenPlayed:false,faceVisible:false,speechStage:-1};
let scene,width=innerWidth,height=innerHeight,rotated=false,raf=0,wasNear=false,nextPulse=0;
const names=['등 위쪽','등 가운데','허리'];
const patient=ROSTER.find(p=>p.name==='박대리');
const clinicAudio=createClinicAudio({S:new Proxy(S,{get:(t,k)=>k==='phase'&&t.phase==='anim'?'play':t[k]}),T:new Proxy(T,{get:(t,k)=>k==='music'?S.music:k==='sound'?S.sound:t[k]})});
// The injured bone is the one under the hands; a wrong-zone shove names where it actually landed.
function injuryLabel(tier,position,step){const seg=pressedSegment(position),hurt=tier===2?'골절!':'금 감';return seg===[3,4,5][step]?`T${seg} ${hurt}`:`${pressedZone(position)} ${hurt} 엉뚱한 데를 눌렀어요`;}
function ensureSound(){if(S.sound||S.music)clinicAudio.ensureAudio();}
function stopSound(){clinicAudio.stopSiren();}
function tone(from,to,length,volume,delay=0){if(S.sound)clinicAudio.tone(from,to,length,'sine',volume,delay);}
function damageSound(tier,volume=1){if(S.sound)clinicAudio.crunch(tier,volume);}
function ambulanceSound(){if(S.sound)clinicAudio.siren(3.4);clinicAudio.vib([200,100,200,100,200]);}
function cue(text,style=''){
  if(text===S.cue&&$('backCue').className==='cue '+style)return;
  S.cue=text;$('backCue').textContent=text;$('backCue').className='cue '+style;
}
function sync(){
  app.dataset.input=S.control;
  if(S.phase!=='paused')clinicAudio.setAmbient();
  $('backScore').textContent=String(S.score).padStart(3,'0');
  const el=$('backMistakes');el.setAttribute('aria-label',`통증 ${S.mistakes}회 / 3회`);
  [...el.querySelectorAll('i')].forEach((e,i)=>e.classList.toggle('on',i<S.mistakes));
  document.querySelectorAll('.step-pills>span').forEach((e,i)=>{e.classList.toggle('active',i===S.step&&S.phase!=='result');e.classList.toggle('done',i<S.results.length);});
  $('positionTarget').style.left=S.targets[Math.min(2,S.step)]*100+'%';slider.value=S.position;
  slider.disabled=S.phase!=='play'||S.control!=='touch';press.disabled=S.phase!=='play';
  $('backMotionNotice').hidden=S.control!=='motion'||(S.sensorStatus==='connected'&&S.motionReady);
  $('backSensorRetry').hidden=S.sensorStatus!=='denied';
}
function setPosition(value){if(S.phase!=='play'||S.control!=='touch')return;S.position=Math.max(0,Math.min(1,Number(value)));slider.value=S.position;}
function cancelInput(){S.holdAt=null;S.pointer=null;S.pending=null;drag=null;swipePeak=0;sync();}
function updateImpact(){
  const p=S.pending;if(!p)return;
  S.force=p.force;
  S.outcome=judgePress(p.position,S.step,p.pressure,p.force,{streak:S.streak,pain:S.painHere,exhale:p.exhale,targets:S.targets});
  S.kind=S.outcome.kind;S.tier=S.outcome.tier;
  $('backImpact').textContent=S.tier?FORCE_STAMP[S.tier]:S.kind==='ok'?S.outcome.perfect?'우두둑!':'두둑!':S.outcome.feedback==='over'?'과압박!':FAIL_STAMP[S.outcome.feedback];
}
function settleImpact(){
  if(!S.pending)return;
  updateImpact();S.pending=null;
  S.reaction=pickReaction(patient.react,S.outcome.perfect,Math.random,S.previousReaction);
  if(S.kind==='ok'){
    S.score+=S.outcome.points;S.streak=S.outcome.streak;

  }else{
    S.mistakes++;S.painHere++;S.streak=0;S.fails.push({kind:S.kind,feedback:S.outcome.feedback,tier:S.tier});

  }
  cue(S.kind==='ok'?'그 자리에서 우두둑.':S.tier?'잠깐… 방금 소리가 이상한데요.':'조금 빗나갔어요.',S.kind==='ok'?'good':'bad');sync();
}
function applyPress(position,pressure,force=1){
  if(S.phase!=='play')return;
  const now=performance.now(),br=breathState(now,S.breathAt,4.4);
  S.position=position;S.pressure=pressure;S.peakPressure=pressure;S.animAt=now;S.phase='anim';
  S.pending={at:now,position,pressure,force,exhale:T.breath&&br.exhale,sounded:false};
  S.previousReaction=S.reaction;S.reaction=pickReaction(patient.react,false,Math.random,S.previousReaction);
  S.holdAt=null;S.pointer=null;S.sirenPlayed=false;S.impactSoundPlayed=false;S.jumpSoundPlayed=false;S.recoilSoundPlayed=false;S.releaseSoundPlayed=false;S.xraySoundPlayed=false;S.fracSoundPlayed=false;S.speechStage=-1;
  updateImpact();
  // Move and sound immediately, but keep the next 130 ms of the same shove for its true peak.

  sync();
}
// Touch follows the neck mode's pointer rules: slow drags aim (sideways = hands along the back, up = more weight),
// a fast flick released within 140 ms is the shove, its speed the force.
function touchShove(force){if(S.phase==='play'&&S.control==='touch'&&!S.pending&&performance.now()>=S.prepUntil){ensureSound();applyPress(S.position,S.pressure,force);}}
function finish(){
  S.phase='result';cancelInput();$('backControls').hidden=true;$('backPause').hidden=true;$('backMotionNotice').hidden=true;
  const complete=S.results.length===3,best=store.get('chiroBackMotionBest',0),record=complete&&S.score>best;
  if(record)store.set('chiroBackMotionBest',S.score);
  $('backResultTitle').textContent=S.tier?'구급차가 왔어요':complete?'허리까지 시원하게.':'오늘은 여기까지만.';
  $('backReview').textContent='“'+reviewLine({stars:complete?3:0,ambulance:!!S.tier,fails:S.fails.map(f=>f.feedback),tiers:S.fails.map(f=>f.tier),lines:patient.lines}).replaceAll('목','허리')+'”';
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
  $('backEmergency').hidden=true;app.classList.remove('ambulance');$('backWelcome').hidden=true;$('backResult').hidden=true;$('backPaused').hidden=true;$('backControls').hidden=false;$('backPause').hidden=false;
  $('backMotionStatus').textContent=granted?'폰을 가로로 편하게 들고 잠깐 기다려 주세요.':'동작 센서가 꺼져 있어요. 다시 연결해 주세요.';
  sync();
}
function pause(){
  if(S.phase!=='play'&&S.phase!=='anim')return;
  settleImpact();S.previousPhase=S.phase;S.pausedAt=performance.now();cancelInput();S.phase='paused';
  stopSound();clinicAudio.suspend();$('backPaused').hidden=false;sync();
}
function resume(){
  if(S.phase!=='paused')return;
  if(S.previousPhase==='anim')S.animAt+=performance.now()-S.pausedAt;
  S.phase=S.previousPhase;motion.recenter();S.motionReady=false;$('backPaused').hidden=true;ensureSound();sync();
}
function resize(){
  if(S.pending)settleImpact();drag=null;swipePeak=0;
  const w=innerWidth,h=innerHeight;rotated=h>w;width=rotated?h:w;height=rotated?w:h;
  app.classList.toggle('self-rotated',rotated);app.style.width=width+'px';app.style.height=height+'px';
  app.style.transform=rotated?`translateX(${w}px) rotate(90deg)`:'none';app.style.left='0';app.style.top='0';
  motion.recenter();S.motionReady=false;if(scene)scene.resize(width,height);
}
function localPoint(e){return rotated?{x:e.clientY,y:innerWidth-e.clientX}:{x:e.clientX,y:e.clientY};}
canvas.addEventListener('pointerdown',e=>{
  if(S.phase!=='play'||S.control!=='touch')return;
  const p=localPoint(e);drag={x:p.x,y:p.y,t:performance.now()};swipePeak=0;
  try{canvas.setPointerCapture(e.pointerId);}catch{}
});
canvas.addEventListener('pointermove',e=>{
  if(!drag||S.phase!=='play'||S.control!=='touch')return;
  const now=performance.now(),p=localPoint(e),dx=p.x-drag.x,dy=p.y-drag.y,speed=Math.hypot(dx,dy)/Math.max(1,now-drag.t);
  drag={x:p.x,y:p.y,t:now};
  if(speed>1.6){swipePeak=speed;return;}
  if(speed<.6)swipePeak=0;
  const g=T.sens/1.5;
  setPosition(S.position+(scene?.screenAxis??1)*dx*.0025*g);
  S.pressure=Math.max(0,Math.min(1.35,S.pressure-dy*.004*g*T.bend));
});
canvas.addEventListener('pointerup',()=>{if(drag&&swipePeak>1.6&&performance.now()-drag.t<140)touchShove(swipePeak/1.6);drag=null;swipePeak=0;});
canvas.addEventListener('pointercancel',()=>{drag=null;swipePeak=0;});
slider.addEventListener('input',e=>setPosition(e.target.value));
press.addEventListener('click',()=>{motion.recenter();S.motionReady=false;S.position=.5;S.pressure=.12;S.prepUntil=performance.now()+700;sync();});
addEventListener('keydown',e=>{
  if(e.code==='Escape'){if(S.phase==='paused')resume();else pause();return;}
  if(S.phase!=='play'||S.control!=='touch')return;
  if(e.code==='Space'&&e.target!==slider){e.preventDefault();if(!e.repeat)touchShove(1);}
  if(e.target!==slider&&['ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();setPosition(S.position+(scene?.screenAxis??1)*(e.code==='ArrowLeft'?-.02:.02));}
  if(['ArrowUp','ArrowDown'].includes(e.code)){e.preventDefault();S.pressure=Math.max(0,Math.min(1.35,S.pressure+(e.code==='ArrowUp'?.04:-.04)));}
});
addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
$('backPause').addEventListener('click',pause);$('backResume').addEventListener('click',resume);
$('backStart').addEventListener('click',()=>start());$('backAgain').addEventListener('click',()=>start(S.control==='motion'));
$('backTouchStart').addEventListener('click',()=>start(false));$('backTouchFallback').addEventListener('click',()=>start(false));
$('backSensorRetry').addEventListener('click',()=>start(true));
$('backSound').addEventListener('click',()=>{S.sound=!S.sound;$('backSound').setAttribute('aria-pressed',String(S.sound));$('backSound').textContent=S.sound?'소리 켬':'소리 끔';if(S.sound)ensureSound();else{stopSound();clinicAudio.setAmbient();}});
$('backMusic').setAttribute('aria-pressed',String(S.music));$('backMusic').textContent=S.music?'음악 켬':'음악 끔';
$('backMusic').addEventListener('click',()=>{S.music=!S.music;store.set('chiroBackMusic',S.music);$('backMusic').setAttribute('aria-pressed',String(S.music));$('backMusic').textContent=S.music?'음악 켬':'음악 끔';ensureSound();clinicAudio.setAmbient();});
addEventListener('deviceorientation',e=>motion.orientation(e,performance.now()));
addEventListener('devicemotion',e=>{
  if(S.control!=='motion'||!S.motionEnabled||!['play','anim'].includes(S.phase))return;
  const now=performance.now(),pa=screen.orientation?.angle??window.orientation??0;
  const active=S.phase==='play',canPush=active&&!S.pending&&now>=S.prepUntil;
  const sample=motion.sample(e,now,(pa+(rotated?90:0))*Math.PI/180,{active,canPush,step:S.step,sens:T.sens,bend:T.bend,heavy:T.heavy,jerk:T.jerk,flick:T.flick,targets:S.targets,axis:scene.screenAxis});
  if(!sample)return;
  if(motionDebug){$('backDebug').hidden=false;$('backDebug').textContent=`툭 ${sample.force.toFixed(2)} · 앞 ${sample.forward.toFixed(1)} / 뒤 ${sample.reverse.toFixed(1)} · 중력부호 ${sample.sign} / 선가속도 ${sample.linearSign} · 지난 힘 ${S.force.toFixed(2)}`;}
  S.lastSample=now;S.sensorStatus='connected';const becameReady=!S.motionReady&&sample.ready;S.motionReady=sample.ready;
  if(becameReady){S.prepUntil=Math.max(S.prepUntil,now+600);sync();}
  if(S.pending){if(now-S.pending.at>=130){settleImpact();return;}S.pending.force=Math.max(S.pending.force,sample.force);updateImpact();return;}
  if(sample.type==='impulse'&&canPush){applyPress(sample.position,sample.pressure,sample.force);return;}
  if(active&&sample.type==='aim'){S.position=sample.position;S.pressure=sample.pressure;}
});
function speechFor(kind,tier,t){
  if(tier)return t<.9?FORCE_LINES[tier][0].replaceAll('목','허리'):tier===2?t<1.7?FORCE_LINES[2][1].replaceAll('목','허리'):'움직이지 마세요… 구급차 불렀어요.':t<1.7?FORCE_LINES[1][1].replaceAll('목','허리'):'허리에 금이 갔다고요…?';
  if(kind==='ok')return t<1.8?patient.lines.what:patient.lines.ahh;
  const f=S.outcome.feedback;
  return (t<1.2?(f==='over'?patient.lines.ouch:f==='dud'?patient.lines.dud:patient.lines.finger):failLine(patient.lines,S.mistakes)).replaceAll('목','허리');
}
function faceFor(t){
  if(S.tier===2)return t<.25?'gasp':'ouch';
  if(S.tier===1)return t<.25?'wince':t<1.5?'ouch':'sulk';
  if(S.kind==='ok')return t<.7?S.reaction.ahh||'sigh':t<1.9?S.reaction.first:S.reaction.then;
  if(S.outcome.feedback==='finger')return t<.35?'startle':'doubt';
  return t<.35?'wince':t<1.4?'doubt':'sulk';
}
function frame(now){
  raf=requestAnimationFrame(frame);if(!scene)return;
  if(S.pending&&now-S.pending.at>=130)settleImpact();
  let pressure=S.pressure,impulse=0,shotTime=-1,face=false;
  const br=breathState(now,S.breathAt,4.4);$('backBreath').textContent=br.exhale?'후우… 지금 툭 하면 날숨 보너스':'흐읍… 들이쉬는 중';app.classList.toggle('exhaling',br.exhale);
  if(S.phase==='anim'){
    shotTime=(now-S.animAt)/1000;const timing=reactionTiming(S.kind,S.tier,S.force),style=therapistStyle(S.force,S.tier);
    if(style.power>.3&&shotTime>=.10&&!S.jumpSoundPlayed){S.jumpSoundPlayed=true;if(S.sound)clinicAudio.whoosh();}
    if(!S.pending&&shotTime>=style.impactAt&&!S.impactSoundPlayed){
      S.impactSoundPlayed=true;
      if(S.kind==='ok'){if(S.sound){clinicAudio.crackSound(S.outcome.perfect?3:2);clinicAudio.chime(S.outcome.perfect);}clinicAudio.vib(S.outcome.perfect?[45,40,45,40,80]:[45,50,45]);}
      else{if(S.tier)damageSound(S.tier);else if(S.sound){if(S.outcome.feedback==='finger')clinicAudio.knuckle();else clinicAudio.fizzle();}clinicAudio.vib(S.tier?S.tier>1?[120,40,200]:[80,30,120]:[60]);}
      if(style.power>.5&&S.sound)clinicAudio.thud();
    }
    if(style.power>.5&&shotTime>=style.impactAt+.14&&!S.recoilSoundPlayed){S.recoilSoundPlayed=true;if(S.sound)clinicAudio.whoosh();}
    impulse=pressProfile(shotTime,S.kind,S.tier,S.outcome.feedback,S.force);
    if(shotTime>=BACK_XRAY.start+style.xrayDelay&&!S.xraySoundPlayed){S.xraySoundPlayed=true;if(S.sound)clinicAudio.whoosh();}
    if(S.kind==='ok'&&shotTime>=1.25+style.xrayDelay&&!S.releaseSoundPlayed){S.releaseSoundPlayed=true;tone(150,55,.2,.16);tone(520,1300,.5,.04,.06);clinicAudio.vib([45,30,70]);}
    if(S.tier&&shotTime>=.8+style.xrayDelay&&!S.fracSoundPlayed){S.fracSoundPlayed=true;damageSound(S.tier,.6);clinicAudio.vib(S.tier>1?[60,30,90]:[50]);}
    pressure=S.peakPressure*Math.max(0,1-shotTime/.35);
    face=shotTime>=timing.faceAt&&shotTime<timing.faceEnd;
    if(face){const faceTime=shotTime-timing.faceAt;$('backSpeech').textContent=speechFor(S.kind,S.tier,faceTime);}
    $('backCutLabel').textContent=face?'':S.tier?injuryLabel(S.tier,S.position,S.step):S.kind==='ok'?'압박이 풀리는 순간':S.kind==='weak'?'아직 풀리지 않았어요':'압박이 빗나갔어요';
    $('backCutLabel').hidden=face||shotTime<(S.tier?.8:BACK_XRAY.start)+style.xrayDelay;
    if(shotTime>=BACK_XRAY.start+style.xrayDelay&&shotTime<BACK_XRAY.release+style.xrayDelay&&!S.tier)$('backCutLabel').textContent=S.kind==='ok'?'꽉 눌려 있던 그 자리':'아직 압박이 남아 있어요';
    if(S.tier&&shotTime>=timing.sirenAt&&!S.sirenPlayed){S.sirenPlayed=true;ambulanceSound();}
    app.classList.toggle('ambulance',S.tier>0&&shotTime>=timing.sirenAt);
    $('backEmergency').hidden=!(S.tier>0&&shotTime>=timing.sirenAt);
    if(shotTime>timing.end){
      app.classList.remove('ambulance');$('backEmergency').hidden=true;$('backCutLabel').hidden=true;
      if(S.tier){finish();}
      else if(S.kind==='ok'){
        S.results.push(S.outcome);if(S.results.length===3)finish();
        else{S.step++;S.painHere=0;S.phase='play';S.nearSaid=false;S.prepUntil=now+700;}
      }else if(S.mistakes>=3)finish();else{S.phase='play';S.prepUntil=now+700;S.missAt=now;S.missPosition=S.position;}
      sync();face=false;shotTime=-1;
    }
  }
  S.faceVisible=face;$('backSpeech').hidden=!face;app.classList.toggle('face-closeup',face);
  const emergency=S.phase==='anim'&&S.tier>0&&S.sirenPlayed;app.classList.toggle('ambulance',emergency);$('backEmergency').hidden=!emergency;
  $('backImpact').hidden=!(S.phase==='anim'&&shotTime>=therapistStyle(S.force,S.tier).impactAt-.1&&shotTime<therapistStyle(S.force,S.tier).impactAt+.5);
  $('backImpactTail').textContent=S.tier===2?'작!':'적…';$('backImpactTail').hidden=!(S.phase==='anim'&&S.tier&&shotTime>=therapistStyle(S.force,S.tier).impactAt+.05&&shotTime<therapistStyle(S.force,S.tier).impactAt+.65);
  $('backHurt').hidden=!(S.phase==='anim'&&S.tier&&shotTime>=therapistStyle(S.force,S.tier).impactAt-.1&&shotTime<therapistStyle(S.force,S.tier).impactAt+.5);
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
    else if(near)label=S.control==='motion'?'그 자리! 폰을 앞이나 뒤로 짧게 툭 밀어요':'그 자리! 화면을 휙 튕겨 툭';
    else if(pressureHint(S.position,S.step,pressure,S.targets)==='position')label=S.control==='motion'?(S.step===2&&S.painHere===0?'천천히 훑어요. 틱 소리가 빨라지는 자리를 찾아요':'좌우로 기울여 민트 링에 손을 맞춰요'):`${names[S.step]} 민트 링에 손을 맞춰 주세요`;
    else if(pressureHint(S.position,S.step,pressure,S.targets)==='release')label=S.control==='motion'?'조금 깊어요. 폰 앞쪽을 살짝 들어요':'압박을 조금 빼 주세요';
    else label=S.control==='motion'?'폰 앞쪽을 천천히 낮춰 압박을 실어요':'위로 드래그해 힘을 더 실어요';
    $('backPressureLabel').textContent=pressure>SWEET.max?'너무 깊어요':near?'준비됐어요':pressureHint(S.position,S.step,pressure,S.targets)==='release'?'힘을 조금 빼요':'압박을 맞춰요';
    cue(label,pressure>SWEET.max?'bad':near?'good':'');
    if(S.control==='motion'){
      $('backMotionStatus').textContent=S.sensorStatus==='denied'?'센서가 꺼져 있어요. 다시 연결해 주세요.':S.lastSample&&now-S.lastSample>1800?'센서 연결이 끊겼어요. 자세를 다시 잡아 주세요.':!S.lastSample&&now-S.breathAt>2200?'동작 센서를 기다리고 있어요. Safari에서 센서를 연결해 주세요.':'폰을 가로로 편하게 들고 잠깐 멈춰 주세요.';
      $('backMotionNotice').hidden=S.sensorStatus==='connected'&&S.motionReady&&now-S.lastSample<1800;
    }
  }
  $('backPressureFill').style.height=Math.min(100,pressure/1.35*100)+'%';$('backPressureNeedle').style.bottom=Math.min(100,pressure/1.35*100)+'%';$('backPressureValue').textContent=Math.round(pressure*100)+'%';
  $('backPositionDot').style.left=S.position*100+'%';slider.value=S.position;
  app.dataset.phase=S.phase;app.classList.toggle('slam-wide',S.phase==='anim'&&therapistStyle(S.force,S.tier).power>.3&&shotTime<therapistStyle(S.force,S.tier).impactAt+.95);app.dataset.injury=S.tier===2?'break':S.tier===1?'crack':'none';
  const mark=S.phase==='play'&&S.missAt>0&&now-S.missAt<3000;
  $('backMissMark').hidden=!mark;$('backAnswer').hidden=!mark;
  if(S.phase!=='paused')scene.render({now,position:S.position,pressure:Math.min(1,pressure),impulse:reduced?impulse*.3:impulse,kind:S.kind,step:S.step,completed:S.results.length,
    shotTime,forceTier:S.tier,faceVisible:face,faceTime:face?shotTime-reactionTiming(S.kind,S.tier,S.force).faceAt:0,breath:br.fill,peakPressure:S.peakPressure,feedback:S.outcome?.feedback,force:S.force,faceName:S.phase==='anim'?faceFor(face?shotTime-reactionTiming(S.kind,S.tier,S.force).faceAt:shotTime):'rest',targets:S.targets,showTargets:S.control==='touch'||S.step<2,revealTarget:S.painHere>0});
  // Read-only DOM diagnostics for browser extensions that isolate the page's JS globals.
  if(import.meta.env.MODE==='shot')app.dataset.shot=JSON.stringify({phase:S.phase,position:S.position,targets:S.targets,points:[.18,.5,.82].map(p=>scene.projectPosition(p))});
  if(mark){for(const [id,p] of [['backMissMark',S.missPosition],['backAnswer',S.targets[S.step]]]){const point=scene.projectPosition(p);$(id).style.left=point.x+'px';$(id).style.top=point.y+'px';}}
}
addEventListener('resize',resize);resize();
$('backBestSmall').textContent=`최고 ${store.get('chiroBackMotionBest',0)}점`;
try{scene=await createBackScene(canvas);resize();S.phase='ready';$('backStart').disabled=false;$('backTouchStart').disabled=false;
  $('backStart').textContent=preferMotion?'폰 들고 진료 시작':'마우스로 진료 연습';document.documentElement.dataset.backReady='true';raf=requestAnimationFrame(frame);
}catch(error){console.error('허리 진료실을 불러오지 못했어요',error);$('backLoadNote').textContent='진료실을 불러오지 못했어요. 다시 열어 주세요.';$('backStart').textContent='다시 불러오기';$('backStart').disabled=false;$('backStart').addEventListener('click',()=>location.reload(),{once:true});}
addEventListener('pagehide',()=>{cancelAnimationFrame(raf);stopSound();});
addEventListener('pageshow',e=>{if(e.persisted&&scene){cancelAnimationFrame(raf);resize();raf=requestAnimationFrame(frame);}});
if(import.meta.env.MODE==='shot')window.__backShot={snapshot:()=>({...S,results:[...S.results]}),project:p=>scene?.projectPosition(p),metrics:()=>scene?.metrics(),timeline:()=>({...reactionTiming(S.kind,S.tier,S.force),...therapistStyle(S.force,S.tier)})};

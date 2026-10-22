import "../boot.js";
import "../ui/clinic-hud.css";
import {drawVGauge,drawHBar,drawHint} from '../ui/gauge.js';
import {makeHud} from '../ui/hudDom.js';
import {mountClinicMenu,renderClinicLinks} from '../ui/clinicSwitch.js';
import {clamp} from '../lib/math.js';
import {therapistStyle} from './therapistMotion.js';
import {createClinicAudio} from 'virtual:clinic-audio';
import {FAIL_STAMP,FORCE_STAMP,FORCE_LINES,failLine,reviewLine} from '../core/fail.js';
import {pickReaction} from '../core/faceRig.js';
import {ROSTER} from '../patient/roster.js';
import {CAST} from '../patient/cast.js';
import {DAYS,CAMPAIGN_KEY,dayRoster,dayLabel,dayClears,dayStars,readProgress,afterDay,nextDay} from '../core/campaign.js';
import {quietDay,bossMissed} from '../core/monetize.js';
import {createBackScene} from './scene.js';
import {pressedSegment,pressedZone,makeSideTargets,TARGETS,SWEET,POSITION_TOL,judgeAim,backDistance,pressProfile,reactionTiming,BACK_XRAY,ORGAN_BEAT,makeBackTargets,pressureHint,backViewRot} from './core.js';
import {BackMotion} from './motion.js';
import {organHit,organLabel,subject} from './organs.js';
import {breathState,closenessOf} from '../core/feel.js';
import {PREP_MS} from '../core/cue.js';
import {rankTitle} from '../core/scoring.js';
import {T,saveT} from '../tuning.js';
import {store} from '../lib/store.js';
import {mountMonetize} from '../ui/monetize.js';
import {track,screenView,firstSuccess,askReview,markReady,bootFail} from '../platform/analytics.js';
import {EV,runOutcome} from '../core/analytics.js';

const $=id=>document.getElementById(id), app=$('backApp'),canvas=$('backCanvas'),press=$('backPress'),hud=$('backHud'),ctx=hud.getContext('2d');
const domHud=makeHud(app);
let hudDpr=1,lastSpeech='',lastExhale=null;
let drag=null,swipePeak=0;
const motionDebug=new URLSearchParams(location.search).has('motionDebug');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse=matchMedia('(pointer: coarse)').matches;
const preferMotion=coarse&&'DeviceMotionEvent' in window;
const motion=new BackMotion();
const S={phase:'loading',control:preferMotion?'motion':'touch',position:.5,pressure:.12,step:0,score:0,mistakes:0,streak:0,painHere:0,
  targets:[.5,.5,.5],heights:[...TARGETS],locked:false,lockHeight:.5,shotAim:{height:.5,side:.5,locked:false},missAim:{height:.5,side:.5,locked:false},results:[],fails:[],holdAt:null,pointer:null,pending:null,animAt:0,kind:'ok',tier:0,organs:[],force:0,outcome:null,peakPressure:0,sound:true,music:store.get("chiroBackMusic",true),
  motionEnabled:false,motionReady:false,lastSample:0,sensorStatus:'waiting',prepUntil:0,breathAt:0,nearSaid:false,missAt:0,
  cue:'',pausedAt:0,previousPhase:null,sirenPlayed:false,faceVisible:false,speechStage:-1};
let scene,width=innerWidth,height=innerHeight,rotated=false,viewRot=0,lastLandscape=90,raf=0,wasNear=false,nextPulse=0;
const names=['등 위쪽','등 가운데','허리'];
// 영업 일지 허리펴기 day (back.html?day=N from index.html's story card): that day's patient (name and lines; the body is
// always 박대리's prone model), its pain limit and the day result. Otherwise the free 박대리 run.
const dayQ=Number(new URLSearchParams(location.search).get('day')),
  DAY=Number.isInteger(dayQ)&&DAYS[dayQ]&&DAYS[dayQ].game==='back'?dayQ:-1,dayDef=DAY>=0?DAYS[DAY]:null;
const patient=dayDef?dayRoster(DAY,[...ROSTER,...CAST])[0]:ROSTER.find(p=>p.name==='박대리');
const painMax=dayDef?dayDef.painMax+(new URLSearchParams(location.search).get('pain')==='1'?1:0):3,dayNo=DAY>=0?DAY+1:null;
const clinicAudio=createClinicAudio({S:new Proxy(S,{get:(t,k)=>k==='phase'&&t.phase==='anim'?'play':t[k]}),T:new Proxy(T,{get:(t,k)=>k==='music'?S.music:k==='sound'?S.sound:t[k]})});
// The injured bone is the one under the hands; a wrong-height shove names where it actually landed.
// An overload that also missed the ring bursts the organs there, one side only if it missed left/right
// (user, 2026-10-16 / 2026-10-18). Spine beat first: organs are named once the camera is on them.
function injuryLabel(tier,height,step,organsShown=true){const seg=pressedSegment(height),hurt=tier===2?'골절!':'금 감';
  if(S.organs.length&&!organsShown)return `${pressedZone(height)} ${hurt}`;
  if(S.organs.length)return `${pressedZone(height)} ${hurt} + ${organLabel(S.organs)} 파열!`;
  return seg===[3,4,5][step]?`T${seg} ${hurt}`:`${pressedZone(height)} ${hurt} 엉뚱한 데를 눌렀어요`;}
// The bar runs along the spine until 고정 locks the height, then left/right of it (user, 2026-10-18).
const aimAt=position=>S.locked?{height:S.lockHeight,side:position,locked:true}:{height:position,side:.5,locked:false};
const axisTargets=()=>S.locked?S.targets:S.heights;
// +1 when a bigger height sits lower on screen. Front-down tilt and an upward drag both walk the hands up the screen.
function heightDown(){if(!scene)return 1;const a=scene.projectPosition(.5,.2),b=scene.projectPosition(.5,.8);return Math.sign(b.y-a.y)||1;}
const heightOk=()=>Math.abs(S.position-S.heights[S.step])<=POSITION_TOL;
function setLocked(on){
  if(S.phase!=='play'||on===S.locked)return;
  if(on){S.lockHeight=S.position;S.position=.5;}else S.position=S.lockHeight;
  S.locked=on;motion.position=S.position;motion.neutral=null;sync();
}
function ensureSound(){if(S.sound||S.music)clinicAudio.ensureAudio();}
function stopSound(){clinicAudio.stopSiren();}
function tone(from,to,length,volume,delay=0){if(S.sound)clinicAudio.tone(from,to,length,'sine',volume,delay);}
function damageSound(tier,volume=1){if(S.sound)clinicAudio.crunch(tier,volume);}
function ambulanceSound(){if(S.sound)clinicAudio.siren(3.4);clinicAudio.vib([200,100,200,100,200]);}
function cue(text,style=''){S.cue=text;S.cueStyle=style;}
function syncMusic(){
  $('backMusic').textContent=S.music?'음악':'음악 끔';
  $('backMusic').classList.toggle('off',!S.music);
  $('backMusic').setAttribute('aria-pressed',String(S.music));
  $('backTuneMusic').checked=S.music;
}
function syncTune(){
  $('backSound').checked=S.sound;
  $('backTuneBreath').checked=!!T.breath;$('backTuneTick').checked=!!T.tick;
  syncMusic();
}
function openTune(){pause();syncTune();$('backPaused').hidden=false;}
function closeTune(){$('backPaused').hidden=true;resume();}
function sync(){
  app.dataset.input=S.control;
  if(S.phase!=='paused')clinicAudio.setAmbient();
  $('backScore').textContent=String(S.score);
  $('backLock').hidden=S.locked;$('backRelock').hidden=!S.locked;
  const el=$('backMistakes');el.setAttribute('aria-label',`통증 ${S.mistakes}회 / ${painMax}회`);
  [...el.querySelectorAll('i')].forEach((e,i)=>e.classList.toggle('on',i<S.mistakes));
  [...$('backDots').children].forEach((e,i)=>{e.classList.toggle('now',i===S.step&&S.phase!=='result');e.classList.toggle('done',i<S.results.length);});
  $('backZone').textContent=names[S.step]+' '+(S.step+1)+'/3';
  $('backMode').innerHTML=!S.locked
    ?(S.control==='motion'?'<b>앞뒤로 기울여</b> 높이 · <b>높이 고정</b>':'<b>위아래 드래그</b>로 높이 · <b>높이 고정</b> · 스페이스')
    :S.control==='motion'
    ?'<b>좌우로 기울여</b> 위치 · <b>앞쪽 낮춰</b> 힘 · <b>앞뒤로 툭</b>'
    :'<b>드래그</b>로 위치·힘 · <b>휙 튕겨서</b> 누르기 · 스페이스';
  press.disabled=S.phase!=='play';
  const now=performance.now(),problem=S.sensorStatus==='denied'||S.lastSample&&now-S.lastSample>1800||!S.lastSample&&now-S.breathAt>2200;
  $('backMotionNotice').hidden=S.phase!=='play'||S.control!=='motion'||!problem;
  $('backSensorRetry').hidden=S.sensorStatus!=='denied';
}
function setPosition(value){if(S.phase!=='play'||S.control!=='touch')return;S.position=Math.max(0,Math.min(1,Number(value)));}
function cancelInput(){S.holdAt=null;S.pointer=null;S.pending=null;drag=null;swipePeak=0;sync();}
function updateImpact(){
  const p=S.pending;if(!p)return;
  S.force=p.force;
  S.outcome=judgeAim(p.aim,S.step,p.pressure,p.force,{streak:S.streak,pain:S.painHere,exhale:p.exhale,heights:S.heights,sides:S.targets});
  S.kind=S.outcome.kind;S.tier=S.outcome.tier;S.organs=organHit(p.aim,S.step,S.tier,S.heights,S.targets);
  $('backImpact').textContent=S.tier?FORCE_STAMP[S.tier]:S.kind==='ok'?S.outcome.perfect?'우두둑!':'두둑!':S.outcome.feedback==='over'?'과압박!':FAIL_STAMP[S.outcome.feedback];
}
// The bone sound lands with the shove, not when the animated hands land (they land up to 0.55 s later).
function impactSound(){
  if(S.kind==='ok'){if(S.sound){clinicAudio.crackSound(S.outcome.perfect?3:2);clinicAudio.chime(S.outcome.perfect);}clinicAudio.vib(S.outcome.perfect?[45,40,45,40,80]:[45,50,45]);}
  else{if(S.tier)damageSound(S.tier);else if(S.sound){if(S.outcome.feedback==='finger')clinicAudio.knuckle();else clinicAudio.fizzle();}clinicAudio.vib(S.tier?S.tier>1?[120,40,200]:[80,30,120]:[60]);}
}
function settleImpact(){
  if(!S.pending)return;
  updateImpact();const early=S.pending.sounded;S.pending=null;
  if(!early||S.kind!=='ok')impactSound();
  S.reaction=pickReaction(patient.react,S.outcome.perfect,Math.random,S.previousReaction);
  const tryNo=S.painHere+1,aimMs=S.animAt-S.prepUntil;
  track(EV.attempt,{zone_no:S.step+1,result:S.kind==='ok'?'ok':S.outcome.feedback||S.kind,tier:S.tier,force:S.force,perfect:!!S.outcome.perfect,pts:S.kind==='ok'?S.outcome.points:0,organs:S.organs.length,try_no:tryNo,aim_ms:aimMs});
  if(S.kind==='ok')firstSuccess({game:'back',zone_no:S.step+1,aim_ms:aimMs});
  if(S.kind==='ok'){
    S.score+=S.outcome.points;S.streak=S.outcome.streak;
    domHud.floater('+'+S.outcome.points,width*.5,height*.45,'big');
    domHud.stamp(S.outcome.perfect?'PERFECT':'성공',names[S.step], 'dud');

  }else{
    S.mistakes++;S.painHere++;S.streak=0;S.fails.push({kind:S.kind,feedback:S.outcome.feedback,tier:S.tier});
    domHud.stamp(S.tier?FORCE_STAMP[S.tier]:FAIL_STAMP[S.outcome.feedback],names[S.step],S.tier===2?'break':S.outcome.feedback);

  }
  cue(S.kind==='ok'?'그 자리에서 우두둑.':S.tier?'잠깐… 방금 소리가 이상한데요.':'조금 빗나갔어요.',S.kind==='ok'?'good':'bad');sync();
}
function applyPress(position,pressure,force=1){
  if(S.phase!=='play')return;
  const now=performance.now(),br=breathState(now,S.breathAt,4.4);
  S.position=position;S.pressure=pressure;S.peakPressure=pressure;S.animAt=now;S.phase='anim';
  S.shotAim=aimAt(position);S.pending={at:now,position,aim:S.shotAim,pressure,force,exhale:T.breath&&br.exhale,sounded:false};
  S.previousReaction=S.reaction;S.reaction=pickReaction(patient.react,false,Math.random,S.previousReaction);
  S.holdAt=null;S.pointer=null;S.sirenPlayed=false;S.impactSoundPlayed=false;S.jumpSoundPlayed=false;S.recoilSoundPlayed=false;S.releaseSoundPlayed=false;S.xraySoundPlayed=false;S.fracSoundPlayed=false;S.speechStage=-1;
  updateImpact();
  // A good press cracks at once, like the neck crack; the next 130 ms of the same shove still settle its true peak,
  // and a miss or an injury (or a good press that peaked into one) sounds then (settleImpact).
  if(S.kind==='ok'){impactSound();S.pending.sounded=true;}
  sync();
}
// Touch follows the neck mode's pointer rules: slow drags aim (sideways = hands along the back, up = more weight),
// a fast flick released within 140 ms is the shove, its speed the force.
function touchShove(force){if(S.phase==='play'&&S.control==='touch'&&S.locked&&!S.pending&&performance.now()>=S.prepUntil){ensureSound();applyPress(S.position,S.pressure,force);}}
function finish(){
  S.phase='result';cancelInput();$('backControls').hidden=true;$('backMotionNotice').hidden=true;
  const complete=S.results.length===3,best=store.get('chiroBackMotionBest',0),record=complete&&S.score>best;
  if(record)store.set('chiroBackMotionBest',S.score);
  $('backResultTitle').textContent=S.tier?'구급차가 왔어요':complete?'허리까지 시원하게.':'오늘은 여기까지만.';
  $('backReview').textContent='“'+reviewLine({stars:complete?3:0,ambulance:!!S.tier,fails:S.fails.map(f=>f.feedback),tiers:S.fails.map(f=>f.tier),lines:patient.lines}).replaceAll('목','허리')+'”';
  $('backTotal').textContent=S.score;
  $('backResultSteps').replaceChildren(...names.map((name,i)=>{const e=document.createElement('li');e.textContent=`${name} ${S.results[i]?S.results[i].points+'점':'—'}`;return e;}));
  $('backRank').textContent=rankTitle(S.score/3,S.tier||S.mistakes>=painMax?3:S.mistakes);
  $('backBest').textContent=record?`새 최고 기록! ${S.score}점`:`최고 기록 ${best}점`;
  $('backResult').hidden=false;sync();
  const outcome=runOutcome({ambulance:!!S.tier,pain:S.mistakes,complete});
  track(EV.runEnd,{game:'back',day:dayNo,outcome,score:S.score,patients:S.results.length,pain:S.mistakes,best:record,continued:S.continued,run_ms:performance.now()-S.runAt,rank:$('backRank').textContent});
  if(complete)track(EV.runComplete,{game:'back',score:S.score,continued:S.continued,run_ms:performance.now()-S.runAt});
  screenView('result',{outcome});
  dayEnd(complete,S.score/3);
  askReview(complete).then(asked=>monetize.showResult({endedBad:!complete,bossMiss:!!dayDef&&bossMissed(dayDef.beat,complete,S.score/3),used:S.continued,skipInterstitial:asked||quietDay(DAY,!!(dayDef&&dayDef.beat)),deferInterstitial:!!dayDef&&dayClears(DAY,complete,S.score/3)}));
}
function dayEnd(complete,avg){
  if(!dayDef)return;
  const cleared=dayClears(DAY,complete,avg),before=readProgress(store.get(CAMPAIGN_KEY,null)),after=afterDay(before,DAY,cleared,dayStars(avg,dayDef));
  if(after!==before)store.set(CAMPAIGN_KEY,after);
  const next=cleared?nextDay(after,DAY):-1;
  $('backResultTitle').textContent=`${dayLabel(DAY)} ${dayDef.title}`;
  $('backDayOutro').textContent=cleared?dayDef.outro:complete?`평균 ${Math.round(avg)}점. ${dayDef.beat}점을 못 넘었어요. ${dayDef.lose}`:`${dayLabel(DAY)}를 못 버텼어요. 다시 문 열어 봐요.`;
  $('backDayOutro').hidden=false;$('backToDays').hidden=false;
  $('backNextDay').hidden=next<0;if(next>=0)$('backNextDay').href=`index.html?story=${next}`;
  $('backAgain').textContent=cleared?'이 날 다시':'다시 도전';
  track(EV.dayEnd,{day:dayNo,cleared,stars:cleared?dayStars(avg,dayDef):0,score:S.score,run_ms:Math.round(performance.now()-S.runAt)});
}
// 이어하기 (Toss build, a rewarded ad, ui/monetize.js): once per run after an ambulance or the third miss, the same
// zone again with the misses cleared; the zones already done keep their points. After a boss day under its beat all
// three zones are done, so the last zone comes back without its points.
function continueRun(){
  if(S.phase!=='result')return;
  if(S.results.length===3){const r=S.results.pop();S.score-=r.points||0;}
  stopSound();lastSpeech='';domHud.hideSpeech();
  motion.position=.5;motion.neutral=null;
  Object.assign(S,{phase:'play',continued:true,locked:false,position:.5,mistakes:0,streak:0,painHere:0,fails:[],holdAt:null,pointer:null,pending:null,animAt:0,kind:'ok',tier:0,organs:[],force:0,outcome:null,peakPressure:0,
    prepUntil:performance.now()+PREP_MS,breathAt:performance.now(),nearSaid:false,missAt:0,faceVisible:false});
  $('backEmergency').hidden=true;app.classList.remove('ambulance');$('backResult').hidden=true;$('backControls').hidden=false;
  track(EV.runStart,{game:'back',how:'continue',zone_no:S.step+1});screenView('play');
  sync();
}
const monetize=mountMonetize({continueBtn:$('backContinueAd'),buyBtn:$('backBuyAdFree'),onContinue:continueRun,leave:[$('backNextDay'),$('backAgain'),$('backToDays')]});
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
  motion.reset();lastSpeech='';lastExhale=null;domHud.hideSpeech();
  track(EV.runStart,{game:'back',day:dayNo,how:S.phase==='result'?'again':'start',control:useMotion&&granted?'tilt':'touch'});screenView('play');S.runAt=performance.now();
  track(EV.patientStart,{zone_no:1,of:3});
  Object.assign(S,{phase:'play',control:useMotion?'motion':'touch',position:.5,pressure:.12,step:0,score:0,mistakes:0,streak:0,painHere:0,targets:makeSideTargets(),heights:makeBackTargets(),locked:false,results:[],fails:[],continued:false,
    holdAt:null,pointer:null,pending:null,animAt:0,kind:'ok',tier:0,organs:[],force:0,outcome:null,peakPressure:0,motionEnabled:useMotion&&granted,
    motionReady:false,lastSample:0,sensorStatus:granted?'waiting':'denied',prepUntil:performance.now()+PREP_MS,breathAt:performance.now(),nearSaid:false,missAt:0,faceVisible:false});
  $('backEmergency').hidden=true;app.classList.remove('ambulance');$('backWelcome').hidden=true;$('backResult').hidden=true;$('backPaused').hidden=true;$('backControls').hidden=false;
  $('backDayOutro').hidden=$('backNextDay').hidden=$('backToDays').hidden=true;
  $('backMotionStatus').textContent=granted?'폰을 가로로 편하게 들고 잠깐 기다려 주세요.':'동작 센서가 꺼져 있어요. 다시 연결해 주세요.';
  sync();
}
// halt: stop the play without the tuning sheet (the 클리닉 menu); pause: halt and show the sheet
function halt(){
  if(S.phase!=='play'&&S.phase!=='anim')return false;
  settleImpact();S.previousPhase=S.phase;S.pausedAt=performance.now();cancelInput();S.phase='paused';
  stopSound();clinicAudio.suspend();sync();return true;
}
function pause(){if(halt()){syncTune();$('backPaused').hidden=false;sync();}}
function resume(){
  if(S.phase!=='paused')return;
  if(S.previousPhase==='anim')S.animAt+=performance.now()-S.pausedAt;
  S.phase=S.previousPhase;motion.recenter();S.motionReady=false;$('backPaused').hidden=true;ensureSound();sync();
}
function resize(){
  if(S.pending)settleImpact();drag=null;swipePeak=0;
  const w=innerWidth,h=innerHeight,v=backViewRot(w,h,physAngle(),lastLandscape);
  viewRot=v.rot;lastLandscape=v.lastLandscape;rotated=viewRot!==0;width=rotated?h:w;height=rotated?w:h;
  app.classList.toggle('self-rotated',rotated);app.classList.toggle('rot270',viewRot===270);app.style.width=width+'px';app.style.height=height+'px';
  app.style.transform=viewRot===90?`translateX(${w}px) rotate(90deg)`:viewRot===270?`translateY(${h}px) rotate(-90deg)`:'none';app.style.left='0';app.style.top='0';
  // No recenter here: tilting a flat-held phone flips the OS layout mid-aim; BackMotion recalibrates on a real angle change.
  if(scene)scene.resize(width,height);
  hudDpr=Math.min(devicePixelRatio||1,2);hud.width=Math.round(width*hudDpr);hud.height=Math.round(height*hudDpr);
  $('backSpeech').style.left=width*.5+'px';$('backSpeech').style.top=height-40+'px';
  $('backSpeech').style.maxWidth=width*.46+'px';
}
function physAngle(){const a=screen.orientation?.angle??window.orientation??0;return ((a%360)+360)%360;}
function localPoint(e){return viewRot===90?{x:e.clientY,y:innerWidth-e.clientX}:viewRot===270?{x:innerHeight-e.clientY,y:e.clientX}:{x:e.clientX,y:e.clientY};}
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
  if(!S.locked){setPosition(S.position+heightDown()*dy*.0025*g);return;}
  setPosition(S.position+(scene?.screenAxis??1)*dx*.0025*g);
  S.pressure=Math.max(0,Math.min(1.35,S.pressure-dy*.004*g*T.bend));
});
canvas.addEventListener('pointerup',()=>{if(drag&&swipePeak>1.6&&performance.now()-drag.t<140)touchShove(swipePeak/1.6);drag=null;swipePeak=0;});
canvas.addEventListener('pointercancel',()=>{drag=null;swipePeak=0;});
$('backLock').addEventListener('click',()=>setLocked(true));$('backRelock').addEventListener('click',()=>setLocked(false));
press.addEventListener('click',()=>{motion.recenter();S.motionReady=false;S.position=.5;S.pressure=.12;S.prepUntil=performance.now()+700;sync();});
addEventListener('keydown',e=>{
  if(e.code==='Escape'){if(!$('backPaused').hidden)closeTune();else openTune();return;}
  if(S.phase!=='play'||S.control!=='touch')return;
  if(e.code==='Space'){e.preventDefault();if(!e.repeat){if(S.locked)touchShove(1);else setLocked(true);}}
  if(!S.locked){if(['ArrowUp','ArrowDown'].includes(e.code)){e.preventDefault();setPosition(S.position+heightDown()*(e.code==='ArrowUp'?-.02:.02));}return;}
  if(['ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();setPosition(S.position+(scene?.screenAxis??1)*(e.code==='ArrowLeft'?-.02:.02));}
  if(['ArrowUp','ArrowDown'].includes(e.code)){e.preventDefault();S.pressure=Math.max(0,Math.min(1.35,S.pressure+(e.code==='ArrowUp'?.04:-.04)));}
});
addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
$('backTune').addEventListener('click',openTune);
mountClinicMenu({chip:$('backClinic'),menu:$('backClinicMenu'),current:()=>'back',onOpen:halt,onClose:resume});
['backWelcomeClinics','backResultClinics'].forEach(id=>renderClinicLinks($(id),'back'));
// the day's patient on the chart, the start card and the pain slots
if(dayDef){
  const nm=$('backName');nm.textContent=patient.name;const ag=document.createElement('small');ag.textContent=`${patient.age}세`;nm.append(ag);
  $('backDayNo').textContent=`영업 일지 · ${dayLabel(DAY)} ${dayDef.title}`;$('backDayNo').hidden=false;
  $('backWelcomeText').textContent=`${patient.name}, ${patient.age}세. ${patient.cc}`;
  $('backMistakes').replaceChildren('통증 ',...Array.from({length:painMax},()=>document.createElement('i')));
}
$('backTuneClose').addEventListener('click',closeTune);
$('backPause').addEventListener('click',pause);$('backResume').addEventListener('click',closeTune);
$('backStart').addEventListener('click',()=>start());$('backAgain').addEventListener('click',()=>start(S.control==='motion'));
$('backTouchStart').addEventListener('click',()=>start(false));$('backTouchFallback').addEventListener('click',()=>start(false));
$('backSensorRetry').addEventListener('click',()=>start(true));
$('backSound').addEventListener('change',e=>{S.sound=e.target.checked;if(S.sound)ensureSound();else{stopSound();clinicAudio.setAmbient();}});
function setMusic(on){S.music=on;store.set('chiroBackMusic',S.music);syncMusic();ensureSound();clinicAudio.setAmbient();}
$('backMusic').addEventListener('click',()=>setMusic(!S.music));
$('backTuneMusic').addEventListener('change',e=>setMusic(e.target.checked));
for(const [id,key] of [['backTuneBreath','breath'],['backTuneTick','tick']]){
  $(id).addEventListener('change',e=>{T[key]=e.target.checked;saveT();});
}
syncTune();
addEventListener('deviceorientation',e=>motion.orientation(e,performance.now()));
addEventListener('devicemotion',e=>{
  if(S.control!=='motion'||!S.motionEnabled||!['play','anim'].includes(S.phase))return;
  const now=performance.now(),pa=physAngle();
  const active=S.phase==='play',canPush=active&&!S.pending&&now>=S.prepUntil;
  const sample=motion.sample(e,now,(pa+viewRot)*Math.PI/180,{active,canPush,step:S.step,sens:T.sens,bend:T.bend,heavy:T.heavy,jerk:T.jerk,flick:T.flick,targets:axisTargets(),axis:scene.screenAxis,vertical:!S.locked,vaxis:-heightDown()});
  if(!sample)return;
  if(motionDebug){$('backDebug').hidden=false;$('backDebug').textContent=`툭 ${sample.force.toFixed(2)} · 앞 ${sample.forward.toFixed(1)} / 뒤 ${sample.reverse.toFixed(1)} · 중력부호 ${sample.sign} / 선가속도 ${sample.linearSign} · 지난 힘 ${S.force.toFixed(2)}\n화면각 ${pa}/${viewRot} · 롤 ${sample.lr?.toFixed(1)}° · 중립 ${sample.neutral?.toFixed(1)}° · 위치 ${S.position.toFixed(2)} · 준비 ${sample.ready}`;}
  S.lastSample=now;S.sensorStatus='connected';const becameReady=!S.motionReady&&sample.ready;S.motionReady=sample.ready;
  if(becameReady){S.prepUntil=Math.max(S.prepUntil,now+600);sync();}
  if(S.pending){if(now-S.pending.at>=130){settleImpact();return;}S.pending.force=Math.max(S.pending.force,sample.force);updateImpact();return;}
  if(sample.type==='impulse'&&canPush){applyPress(sample.position,sample.pressure,sample.force);return;}
  if(active&&sample.type==='aim'){S.position=sample.position;S.pressure=sample.pressure;}
});
function speechFor(kind,tier,t){
  if(tier&&S.organs.length&&t>=1.7)return `${subject(organLabel(S.organs))} 방금 터진 것 같은데요…?`;
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
function boxIn(el){
  let x=0,y=0,n=el;
  while(n&&n!==app){x+=n.offsetLeft;y+=n.offsetTop;n=n.offsetParent;}
  return {left:x,right:x+el.offsetWidth,bottom:y+el.offsetHeight,w:el.offsetWidth};
}
function drawHud(pressure,br){
  ctx.setTransform(hudDpr,0,0,hudDpr,0,0);ctx.clearRect(0,0,width,height);
  if(S.phase!=='play')return;
  const R=clamp(height*.19,62,Math.min(width,height)*.25),cx=width*.5,cy=height*.55;
  const h=clamp(R*1.7,110,height*.62),x=Math.min(cx+Math.max(R*1.7,136),width-76),top=clamp(cy-h*.55,82,height-h-28);
  if(!S.locked){
    // Height step: only the height instrument; the push gauge and side bar wait for the lock (user, 2026-10-18).
    const up=v=>heightDown()>0?1-v:v,t=S.heights[S.step],a=up(t-POSITION_TOL),b=up(t+POSITION_TOL);
    drawVGauge(ctx,{x,top,h,title:'높이',value:up(S.position),band:[Math.min(a,b),Math.max(a,b)],fill:false,hot:heightOk(),colors:{coral:'#7fd1b9'}});
    drawHint(ctx,{x:cx,y:height-104,text:S.cue,hot:S.cueStyle==='bad'});
    return;
  }
  const near=backDistance(S.position,S.step,pressure,axisTargets())<=1;
  drawVGauge(ctx,{x,top,h,title:'누르는 힘',value:pressure/1.35,band:[SWEET.min/1.35,SWEET.max/1.35],limit:SWEET.max/1.35,hot:near||pressure>SWEET.max});
  const mR=boxIn($('backMode')),zR=boxIn(press),gapL=mR.w?mR.right:20,gapR=zR.w?zR.left:width-20;
  const bw=clamp(gapR-gapL-40,110,180),bx=clamp((gapL+gapR-bw)/2,10,width-bw-10);
  const by=clamp((zR.w?zR.bottom:height-12)-19,40,height-20);
  const target=axisTargets()[S.step],off=(S.position-target)/POSITION_TOL,showBand=S.control==='touch'||S.step<2||S.painHere>0;
  drawHBar(ctx,{bx,by,bw,off,span:{pos:S.position,target,tol:POSITION_TOL},ok:Math.abs(off)<=1,title:S.locked?'좌우':'높이',showBand,okText:showBand?'맞아요':'찾아봐요',offText:showBand?'중심 밖':'찾아봐요'});
  drawHint(ctx,{x:bx+bw/2,y:by-40,text:S.cue,hot:S.cueStyle==='bad'});
  if(T.breath&&br.exhale)drawHint(ctx,{x:cx,y:Math.max(110,cy-R+20),text:'후우… 지금 툭 +15',colors:{bone:'#8adfbf'}});
}
function frame(now){
  raf=requestAnimationFrame(frame);if(!scene)return;
  if(S.pending&&now-S.pending.at>=130)settleImpact();
  let pressure=S.pressure,impulse=0,shotTime=-1,face=false;
  const br=breathState(now,S.breathAt,4.4);
  if(S.phase==='play'&&br.exhale!==lastExhale){
    if(lastExhale!==null)domHud.floater(br.exhale?'후우~':'흐읍…',width*.5,height*.42,br.exhale?'breath out':'breath',1700);
    lastExhale=br.exhale;
  }
  if(S.phase==='anim'){
    shotTime=(now-S.animAt)/1000;const timing=reactionTiming(S.kind,S.tier,S.force,S.organs.length>0),style=therapistStyle(S.force,S.tier);
    if(style.power>.3&&shotTime>=.10&&!S.jumpSoundPlayed){S.jumpSoundPlayed=true;if(S.sound)clinicAudio.whoosh();}
    if(!S.pending&&shotTime>=style.impactAt&&!S.impactSoundPlayed){
      S.impactSoundPlayed=true;
      if(style.power>.5&&S.sound)clinicAudio.thud();
    }
    if(style.power>.5&&shotTime>=style.impactAt+.14&&!S.recoilSoundPlayed){S.recoilSoundPlayed=true;if(S.sound)clinicAudio.whoosh();}
    impulse=pressProfile(shotTime,S.kind,S.tier,S.outcome.feedback,S.force);
    if(shotTime>=BACK_XRAY.start+style.xrayDelay&&!S.xraySoundPlayed){S.xraySoundPlayed=true;if(S.sound)clinicAudio.whoosh();}
    if(S.kind==='ok'&&shotTime>=1.25+style.xrayDelay&&!S.releaseSoundPlayed){S.releaseSoundPlayed=true;tone(150,55,.2,.16);tone(520,1300,.5,.04,.06);clinicAudio.vib([45,30,70]);}
    if(S.tier&&shotTime>=.8+style.xrayDelay&&!S.fracSoundPlayed){S.fracSoundPlayed=true;damageSound(S.tier,.6);clinicAudio.vib(S.tier>1?[60,30,90]:[50]);}
    pressure=S.peakPressure*Math.max(0,1-shotTime/.35);
    face=shotTime>=timing.faceAt&&shotTime<timing.faceEnd;
    if(face){
      const text=speechFor(S.kind,S.tier,shotTime-timing.faceAt);
      if(text!==lastSpeech){domHud.say(text,10000,!!S.tier);lastSpeech=text;}
    }
    // One stamp in one place once organs pop: big '간 파열!', small fracture line under it (user, 2026-10-18).
    const burstNow=!face&&S.tier>0&&S.organs.length>0&&shotTime>=ORGAN_BEAT.burstAt+style.xrayDelay;
    $('backCutLabel').classList.toggle('burst',burstNow);
    if(burstNow){const html=`${organLabel(S.organs)} 파열!<small>${injuryLabel(S.tier,S.shotAim.height,S.step,false)}</small>`;if($('backCutLabel').innerHTML!==html)$('backCutLabel').innerHTML=html;}
    else $('backCutLabel').textContent=face?'':S.tier?injuryLabel(S.tier,S.shotAim.height,S.step,false):S.kind==='ok'?'압박이 풀리는 순간':S.kind==='weak'?'아직 풀리지 않았어요':'압박이 빗나갔어요';
    $('backCutLabel').hidden=face||shotTime<(S.tier?.8:BACK_XRAY.start)+style.xrayDelay;
    if(shotTime>=BACK_XRAY.start+style.xrayDelay&&shotTime<BACK_XRAY.release+style.xrayDelay&&!S.tier)$('backCutLabel').textContent=S.kind==='ok'?'꽉 눌려 있던 그 자리':'아직 압박이 남아 있어요';
    if(S.tier&&shotTime>=timing.sirenAt&&!S.sirenPlayed){S.sirenPlayed=true;ambulanceSound();}
    app.classList.toggle('ambulance',S.tier>0&&shotTime>=timing.sirenAt);
    $('backEmergency').hidden=!(S.tier>0&&shotTime>=timing.sirenAt);
    if(shotTime>timing.end){
      app.classList.remove('ambulance');$('backEmergency').hidden=true;$('backCutLabel').hidden=true;$('backCutLabel').classList.remove('burst');
      if(S.tier){finish();}
      else if(S.kind==='ok'){
        S.results.push(S.outcome);track(EV.patientDone,{zone_no:S.step+1,label:'done',pts:S.outcome.points,fails:S.painHere});if(S.results.length===3)finish();
        else{S.step++;track(EV.patientStart,{zone_no:S.step+1,of:3});S.painHere=0;S.phase='play';S.nearSaid=false;S.prepUntil=now+700;S.locked=false;S.position=.5;motion.position=.5;motion.neutral=null;}
      }else if(S.mistakes>=painMax)finish();else{S.phase='play';S.prepUntil=now+700;S.missAt=now;S.missAim=S.shotAim;}
      sync();face=false;shotTime=-1;
    }
  }
  S.faceVisible=face;if(!face){domHud.hideSpeech();lastSpeech='';}app.classList.toggle('face-closeup',face);
  const emergency=S.phase==='anim'&&S.tier>0&&S.sirenPlayed;app.classList.toggle('ambulance',emergency);$('backEmergency').hidden=!emergency;
  $('backImpact').hidden=!(S.phase==='anim'&&shotTime>=therapistStyle(S.force,S.tier).impactAt-.1&&shotTime<therapistStyle(S.force,S.tier).impactAt+.5);
  $('backImpactTail').textContent=S.tier===2?'작!':'적…';$('backImpactTail').hidden=!(S.phase==='anim'&&S.tier&&shotTime>=therapistStyle(S.force,S.tier).impactAt+.05&&shotTime<therapistStyle(S.force,S.tier).impactAt+.65);
  $('backHurt').hidden=!(S.phase==='anim'&&S.tier&&shotTime>=therapistStyle(S.force,S.tier).impactAt-.1&&shotTime<therapistStyle(S.force,S.tier).impactAt+.5);
  const distance=S.locked?backDistance(S.position,S.step,pressure,axisTargets()):Math.abs(S.position-S.heights[S.step])/POSITION_TOL,near=distance<=1;
  if(S.phase==='play'&&now>=S.prepUntil&&(S.control==='touch'||S.motionReady)){
    if(near&&!wasNear){tone(880,1320,.06,.04);if(navigator.vibrate)navigator.vibrate(35);}
    const close=closenessOf(distance);if(close>.05&&now>nextPulse){if(T.tick)tone(520+520*close,480+480*close,.03,.012);nextPulse=now+560-450*close;}
  }
  wasNear=S.phase==='play'&&near;
  $('backLock').classList.toggle('ready',S.phase==='play'&&!S.locked&&near);
  if(S.phase==='play'){
    let label;
    if(now<S.prepUntil)label='힘 빼세요. 손을 얹고 있어요…';
    else if(S.control==='motion'&&!S.motionReady)label='폰을 편하게 들고 잠깐 멈춰 주세요';
    else if(!S.locked)label=near?'좋아요. 이 높이로 고정!':S.control==='motion'?'앞뒤로 기울여 민트 링 높이에 맞춰요':'위아래로 드래그해 민트 링 높이에 맞춰요';
    else if(pressure>SWEET.max)label='너무 깊어요. 폰 앞쪽을 조금 들어 주세요';
    else if(near)label=S.control==='motion'?'그 자리! 폰을 앞이나 뒤로 짧게 툭 밀어요':'그 자리! 화면을 휙 튕겨 툭';
    else if(pressureHint(S.position,S.step,pressure,axisTargets())==='position')label=S.control==='motion'?(S.step===2&&S.painHere===0?'천천히 훑어요. 틱 소리가 빨라지는 자리를 찾아요':(S.locked?'좌우로 기울여 민트 링에 손을 맞춰요':'좌우로 기울여 척추를 따라 민트 링에 맞춰요')):`${names[S.step]} 민트 링에 손을 맞춰 주세요`;
    else if(pressureHint(S.position,S.step,pressure,axisTargets())==='release')label=S.control==='motion'?'조금 깊어요. 폰 앞쪽을 살짝 들어요':'압박을 조금 빼 주세요';
    else label=S.control==='motion'?'폰 앞쪽을 천천히 낮춰 압박을 실어요':'위로 드래그해 힘을 더 실어요';
    cue(label,S.locked&&pressure>SWEET.max?'bad':near?'good':'');
    if(S.control==='motion'){
      $('backMotionStatus').textContent=S.sensorStatus==='denied'?'센서가 꺼져 있어요. 다시 연결해 주세요.':S.lastSample&&now-S.lastSample>1800?'센서 연결이 끊겼어요. 자세를 다시 잡아 주세요.':!S.lastSample&&now-S.breathAt>2200?'동작 센서를 기다리고 있어요. Safari에서 센서를 연결해 주세요.':'폰을 가로로 편하게 들고 잠깐 멈춰 주세요.';
      $('backMotionNotice').hidden=!(S.sensorStatus==='denied'||S.lastSample&&now-S.lastSample>1800||!S.lastSample&&now-S.breathAt>2200);
      $('backSensorRetry').hidden=S.sensorStatus!=='denied';
    }
  }
  drawHud(pressure,br);
  app.dataset.phase=S.phase;app.classList.toggle('slam-wide',S.phase==='anim'&&therapistStyle(S.force,S.tier).power>.3&&shotTime<therapistStyle(S.force,S.tier).impactAt+.95);app.dataset.injury=S.tier===2?'break':S.tier===1?'crack':'none';
  const mark=S.phase==='play'&&S.missAt>0&&now-S.missAt<3000;
  $('backMissMark').hidden=!mark;$('backAnswer').hidden=!mark;
  const aim=S.phase==='anim'?S.shotAim:aimAt(S.position);
  if(S.phase!=='paused')scene.render({now,position:aim.side,height:aim.height,locked:aim.locked,pressure:Math.min(1,pressure),impulse:reduced?impulse*.3:impulse,kind:S.kind,step:S.step,completed:S.results.length,
    shotTime,forceTier:S.tier,faceVisible:face,faceTime:face?shotTime-reactionTiming(S.kind,S.tier,S.force,S.organs.length>0).faceAt:0,breath:br.fill,peakPressure:S.peakPressure,feedback:S.outcome?.feedback,force:S.force,faceName:S.phase==='anim'?faceFor(face?shotTime-reactionTiming(S.kind,S.tier,S.force,S.organs.length>0).faceAt:shotTime):'rest',organs:S.organs,targets:S.targets,heights:S.heights,showTargets:S.control==='touch'||S.step<2,revealTarget:S.painHere>0});
  // Read-only DOM diagnostics for browser extensions that isolate the page's JS globals.
  if(import.meta.env.MODE==='shot')app.dataset.shot=JSON.stringify({phase:S.phase,position:S.position,locked:S.locked,targets:S.targets,heights:S.heights,points:S.heights.map(h=>scene.projectPosition(.5,h))});
  if(mark){for(const [id,a] of [['backMissMark',S.missAim],['backAnswer',{side:S.missAim.locked?S.targets[S.step]:.5,height:S.heights[S.step]}]]){const point=scene.projectPosition(a.side,a.height);$(id).style.left=point.x+'px';$(id).style.top=point.y+'px';}}
}
addEventListener('resize',resize);screen.orientation?.addEventListener?.('change',resize);resize();
const sceneT0=performance.now();
try{scene=await createBackScene(canvas);resize();track(EV.assetLoad,{asset:'back_scene',ok:true,ms:performance.now()-sceneT0});screenView('title');S.phase='ready';$('backStart').disabled=false;$('backTouchStart').disabled=false;
  $('backStart').textContent='진료 시작';document.documentElement.dataset.backReady='true';raf=requestAnimationFrame(t=>{frame(t);markReady();});
}catch(error){console.error('허리 진료실을 불러오지 못했어요',error);bootFail('scene',error&&error.message);$('backLoadNote').textContent='진료실을 불러오지 못했어요. 다시 열어 주세요.';$('backStart').textContent='다시 불러오기';$('backStart').disabled=false;$('backStart').addEventListener('click',()=>location.reload(),{once:true});}
addEventListener('pagehide',()=>{cancelAnimationFrame(raf);stopSound();});
addEventListener('pageshow',e=>{if(e.persisted&&scene){cancelAnimationFrame(raf);resize();raf=requestAnimationFrame(frame);}});
if(import.meta.env.MODE==='shot'||__CASES__)window.__backShot={press:(position,pressure,force)=>applyPress(position,pressure,force),lock:(on=true)=>setLocked(on),aim:p=>{S.position=p;},snapshot:()=>({...S,results:[...S.results]}),project:p=>scene?.projectPosition(p),metrics:()=>scene?.metrics(),timeline:()=>({...reactionTiming(S.kind,S.tier,S.force,S.organs.length>0),...therapistStyle(S.force,S.tier)})};
if(__CASES__)import("../dev/caseBack.js");

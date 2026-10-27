import "../boot.js";
import "../ui/clinic-hud.css";
import {drawVGauge,drawHBar,drawHint,leftGaugeX,GAUGE_COLORS} from '../ui/gauge.js';
import {makeHud,logRow} from '../ui/hudDom.js';
import {mountClinicMenu,renderClinicLinks} from '../ui/clinicSwitch.js';
import {clamp} from '../lib/math.js';
import {therapistStyle} from '../back/therapistMotion.js';
import {createClinicAudio} from 'virtual:clinic-audio';
import {FAIL_STAMP,FORCE_STAMP,FORCE_LINES,failLine,reviewLine} from '../core/fail.js';
import {ROSTER,lumbarPatient} from '../patient/roster.js';
import {CAST} from '../patient/cast.js';
import {CAMPAIGN_KEY,dayRoster,dayLabel,dayClears,dayStars,readProgress,afterDay,afterHard,nextDay,dayDef as dayDefOf} from '../core/campaign.js';
import {quietDay,bossMissed,continueOffer} from '../core/monetize.js';
import {mountMonetize} from '../ui/monetize.js';
import {mountCoinReward} from '../ui/shop.js';
import {createSideScene,ROLL_S} from './scene.js';
import {SWEET,POSITION_TOL,tolFor,backDistance,pressProfile,clinicFilm,backViewRot,pressureHint,dayQuery,resultTitle} from '../back/core.js';
import {BackMotion} from '../back/motion.js';
import {SIDE_NAME,sideOrder,makeSideGoals,judgeSide,balance,canLeave,lumbarAt,thrustSounds,overReaction,xrayTarget,slowWarp,punchProfile,canRetry,runComplete,continuePlan} from './core.js';
import {breathState,closenessOf} from '../core/feel.js';
import {PREP_MS} from '../core/cue.js';
import {rankTitle} from '../core/scoring.js';
import {T,saveT} from '../tuning.js';
import {store} from '../lib/store.js';
import {track,screenView,firstSuccess,askReview,markReady,bootFail} from '../platform/analytics.js';
import {EV,runOutcome} from '../core/analytics.js';
import {t,backify} from '../i18n/index.js';

/* 허리비틀기 (side-posture lumbar roll, user 2026-10-19): the back mode's two-stage aim on a patient lying on his side.
   Front/back tilt picks the height along L1..L5, 고정 locks it, then the left/right tilt rolls the pelvis toward the
   therapist, the forward tilt loads, a short shove thrusts. One side, an x-ray, then he rolls over and the other side:
   the visit ends only after both sides (core.js canLeave). */
const $=id=>document.getElementById(id), app=$('sideApp'),canvas=$('sideCanvas'),center=$('sideCenter'),hud=$('sideHud'),ctx=hud.getContext('2d');
const domHud=makeHud(app);
let hudDpr=1,lastSpeech='',lastExhale=null,drag=null,swipePeak=0;
const motionDebug=new URLSearchParams(location.search).has('motionDebug');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse=matchMedia('(pointer: coarse)').matches;
const preferMotion=coarse&&'DeviceMotionEvent' in window;
const motion=new BackMotion();
const S={phase:'loading',control:preferMotion?'motion':'touch',position:.5,pressure:.12,order:['L','R'],sideIdx:0,goals:makeSideGoals(),score:0,mistakes:0,tries:0,streak:0,
  locked:false,lockHeight:.5,shotAim:{height:.5,side:.5,locked:false},results:[],pending:null,animAt:0,rollAt:0,kind:'ok',tier:0,force:0,outcome:null,peakPressure:0,
  sound:true,music:store.get('chiroSideMusic',true),motionEnabled:false,motionReady:false,lastSample:0,sensorStatus:'waiting',prepUntil:0,breathAt:0,
  cue:'',cueStyle:'',pausedAt:0,previousPhase:null,gag:null};
let scene,width=innerWidth,height=innerHeight,rotated=false,viewRot=0,lastLandscape=90,raf=0,wasNear=false,nextPulse=0;
// 영업 일지 허리비틀기 day (side.html?day=N from index.html's story card): that day's patient (name and lines; the body
// is Patient01's side-lying model unless the patient has its own, look.sideModel), its pain limit and the day result.
// Otherwise the free run: ?patient=<name> or one at random of the patients with a side-lying body (roster lumbarPatient).
// &hard=1: 역경 (core/campaign.js hardDay): one pain fewer, no guide bands, a narrower zone, an average to beat.
// A locked ?day goes to the day list; &pain=1 counts once, on the fresh hop from the story card (back/core.js dayQuery).
const Q=dayQuery(location.search,readProgress(store.get(CAMPAIGN_KEY,null)),'side',{fresh:(performance.getEntriesByType?.('navigation')?.[0]?.type??'navigate')==='navigate',dev:import.meta.env.MODE==='shot'||__CASES__});
if(Q.locked)location.replace('index.html?days=1');
if(Q.pain){const u=new URL(location.href);u.searchParams.delete('pain');history.replaceState(history.state,'',u);}
const DAY=Q.day,HARD=Q.hard,dayDef=DAY>=0?dayDefOf(DAY,HARD):null;
// the day's zone width: mods.tight / tighter narrow it like the neck modes
const TOL=tolFor(dayDef&&dayDef.mods);
const patient=dayDef?dayRoster(DAY,[...ROSTER,...CAST])[0]:lumbarPatient('side',new URLSearchParams(location.search).get('patient'),Math.random,import.meta.env.MODE==='shot'||__CASES__);
const bodyModel=patient.look?.sideModel||null;   // an image-to-3D patient's own side-lying body (roster lumbarPatient)
const painMax=dayDef?dayDef.painMax+(Q.pain?1:0):3,dayNo=DAY>=0?DAY+1:null;
const clinicAudio=createClinicAudio({S:new Proxy(S,{get:(t,k)=>k==='phase'&&['anim','turn','roll','leave'].includes(t.phase)?'play':t[k]}),T:new Proxy(T,{get:(t,k)=>k==='music'?S.music:k==='sound'?S.sound:t[k]})});
const side=()=>S.order[S.sideIdx], goal=()=>S.goals[S.sideIdx];
const aimAt=position=>S.locked?{height:S.lockHeight,side:position,locked:true}:{height:position,side:.5,locked:false};
const axisTarget=()=>S.locked?goal().roll:goal().height;
// +1 when a bigger height sits lower on screen: front-down tilt and an upward drag move the aim up the screen.
function heightDown(){if(!scene)return 1;const a=scene.projectPosition(side(),.2),b=scene.projectPosition(side(),.8);return Math.sign(b.y-a.y)||1;}
const heightOk=()=>Math.abs(S.position-goal().height)<=TOL;
function setLocked(on){
  if(S.phase!=='play'||on===S.locked)return;
  if(on){S.lockHeight=S.position;S.position=.5;}else S.position=S.lockHeight;
  S.locked=on;motion.position=S.position;motion.neutral=null;sync();
}
function ensureSound(){if(S.sound||S.music)clinicAudio.ensureAudio();}
function stopSound(){clinicAudio.stopSiren();}
function tone(from,to,length,volume,delay=0){if(S.sound)clinicAudio.tone(from,to,length,'sine',volume,delay);}
function sideName(k){return t(SIDE_NAME[k]);}
function cue(text,style=''){S.cue=t(text);S.cueStyle=style;}
// One comic caption in one fixed spot (style.css .side-gag); a new one replaces the old.
function gag(text,bad=false,ms=1800){S.gag={text,bad,until:performance.now()+ms};const e=$('sideGag');e.textContent=t(text);e.classList.toggle('bad',bad);e.hidden=false;e.style.animation='none';void e.offsetWidth;e.style.animation='';}
function syncMusic(){$('sideMusic').textContent=S.music?t('음악'):t('음악 끔');$('sideMusic').classList.toggle('off',!S.music);$('sideMusic').setAttribute('aria-pressed',String(S.music));$('sideTuneMusic').checked=S.music;}
function syncTune(){$('sideSound').checked=S.sound;$('sideTuneBreath').checked=!!T.breath;$('sideTuneTick').checked=!!T.tick;syncMusic();}
function openTune(){pause();syncTune();$('sidePaused').hidden=false;}
function closeTune(){$('sidePaused').hidden=true;resume();}
function sync(){
  app.dataset.input=S.control;
  if(S.phase!=='paused')clinicAudio.setAmbient();
  $('sideScore').textContent=String(S.score);
  $('sideLock').hidden=S.locked;$('sideRelock').hidden=!S.locked;
  $('sideFlip').hidden=S.phase!=='turn';
  const el=$('sideMistakes');el.setAttribute('aria-label',t("통증 {n}회 / {max}회",{n:S.mistakes,max:painMax}));
  [...el.querySelectorAll('i')].forEach((e,i)=>e.classList.toggle('on',i<S.mistakes));
  [...$('sideDots').children].forEach((e,i)=>{e.classList.toggle('now',i===S.sideIdx&&S.phase!=='result');e.classList.toggle('done',i<S.results.length);});
  $('sideZone').textContent=`${sideName(side())} ${S.sideIdx+1}/2`;
  $('sideMode').innerHTML=!S.locked
    ?t(S.control==='motion'?'<b>앞뒤로 기울여</b> 높이 · <b>높이 고정</b>':'<b>위아래 드래그</b>로 높이 · <b>높이 고정</b> <span class="towel-key">· 스페이스</span>')
    :t(S.control==='motion'?'<b>오른쪽으로 기울여</b> 비틀기 · <b>앞쪽 낮춰</b> 밀착 · <b>짧게 툭</b>'
    :'<b>좌우 드래그</b> 비틀기 · <b>위로</b> 밀착 · <b>휙 튕겨서</b> 툭');
  center.disabled=S.phase!=='play';
  const now=performance.now(),problem=S.sensorStatus==='denied'||S.lastSample&&now-S.lastSample>1800||!S.lastSample&&now-S.breathAt>2200;
  $('sideMotionNotice').hidden=S.phase!=='play'||S.control!=='motion'||!problem;
  $('sideSensorRetry').hidden=S.sensorStatus!=='denied';
}
function setPosition(value){if(S.phase!=='play'||S.control!=='touch')return;S.position=Math.max(0,Math.min(1,Number(value)));}
function cancelInput(){S.pending=null;drag=null;swipePeak=0;sync();}
function updateImpact(){
  const p=S.pending;if(!p)return;
  S.force=p.force;
  S.outcome=judgeSide(p.aim,p.pressure,p.force,goal(),{streak:S.streak,pain:S.tries,exhale:p.exhale,tol:TOL});   // pain: this side's misses so far, for the neck star rule
  S.kind=S.outcome.kind;S.tier=S.outcome.tier;
  $('sideImpact').textContent=t(S.tier?FORCE_STAMP[S.tier]:S.kind==='ok'?S.outcome.perfect?'우두둑!':'두둑!':S.outcome.feedback==='over'?'과회전!':FAIL_STAMP[S.outcome.feedback]);
}
// every thrust cracks a recorded bone at once, right or wrong (core.js thrustSounds, user 2026-10-19 "우두둑 소리도 안나는것 같은데")
function impactSound(){
  if(S.sound)for(const s of thrustSounds({kind:S.kind,tier:S.tier,perfect:S.outcome.perfect})){
    if(s.fn==='crackSound')clinicAudio.crackSound(s.n);else if(s.fn==='crunch')clinicAudio.crunch(s.tier,1);else if(s.fn==='chime')clinicAudio.chime(s.perfect);else clinicAudio[s.fn]();
  }
  clinicAudio.vib(S.kind==='ok'?(S.outcome.perfect?[45,40,45,40,80]:[45,50,45]):S.tier?[120,40,200]:[60]);
}
function settleImpact(){
  if(!S.pending)return;
  updateImpact();const early=S.pending.sounded;S.pending=null;
  if(!early||S.kind!=='ok')impactSound();
  const label=`${sideName(side())} ${S.sideIdx+1}/2`,aimMs=S.animAt-S.prepUntil;
  track(EV.attempt,{side_no:S.sideIdx+1,result:S.kind==='ok'?'ok':S.outcome.feedback||S.kind,tier:S.tier,force:S.force,perfect:!!S.outcome.perfect,pts:S.kind==='ok'?S.outcome.points:0,try_no:S.tries+1,aim_ms:aimMs});
  if(S.kind==='ok')firstSuccess({game:'side',side_no:S.sideIdx+1,aim_ms:aimMs});
  if(S.kind==='ok'){S.score+=S.outcome.points;S.streak=S.outcome.streak;domHud.floater('+'+S.outcome.points,width*.5,height*.45,'big');domHud.stamp(S.outcome.perfect?'PERFECT':'GOOD',label,'dud');}
  else{S.mistakes++;S.tries++;S.streak=0;domHud.stamp(S.tier?FORCE_STAMP[S.tier]:FAIL_STAMP[S.outcome.feedback],label,S.tier===2?'break':S.outcome.feedback);}
  cue(S.kind==='ok'?'뚝. 골반이 풀렸어요.':S.tier?'잠깐… 방금 소리가 이상한데요.':'조금 빗나갔어요.',S.kind==='ok'?'good':'bad');sync();
}
function applyPress(position,pressure,force=1){
  if(S.phase!=='play')return;
  const now=performance.now(),br=breathState(now,S.breathAt,4.4);
  S.position=position;S.pressure=pressure;S.peakPressure=pressure;S.animAt=now;S.phase='anim';
  S.shotAim=aimAt(position);S.pending={at:now,aim:S.shotAim,pressure,force,exhale:T.breath&&br.exhale,sounded:false};
  S.xraySoundPlayed=false;S.releaseSoundPlayed=false;S.fracSoundPlayed=false;S.screamed=false;S.docSaid=false;
  updateImpact();
  if(S.kind==='ok'){impactSound();S.pending.sounded=true;}
  sync();
}
function touchShove(force){if(S.phase==='play'&&S.control==='touch'&&S.locked&&!S.pending&&performance.now()>=S.prepUntil){ensureSound();applyPress(S.position,S.pressure,force);}}
// The x-ray and the patient's line after a shove; no face close-up in this mode (he lies on his side).
function shotTiming(){const d=therapistStyle(S.force,S.tier).xrayDelay;return S.tier?{speechAt:2.6+d,end:4.8+d}:S.kind!=='miss'?{speechAt:2.5,end:4.3}:{speechAt:1.5,end:3.2};}
function recordSide(){
  const g=goal();
  track(EV.patientDone,{side_no:S.sideIdx+1,label:S.kind==='ok'?'done':S.tier?'ambulance':'miss',pts:S.kind==='ok'?S.outcome.points:0});
  S.results.push({side:side(),kind:S.kind,tier:S.tier,points:S.kind==='ok'?S.outcome.points:0,stars:S.kind==='ok'?S.outcome.stars:0,perfect:!!S.outcome.perfect,roll:S.shotAim.side,pressure:S.peakPressure,goalRoll:g.roll,level:lumbarAt(S.shotAim.height)});
  $('sideCutLabel').hidden=true;$('sideCutLabel').classList.remove('burst');
}
// After a shot (2026-10-22 one rule set for all four modes): a crack or a break calls the ambulance and ends the visit,
// a mild miss is a pain and the same side again until the pain limit, a fixed side moves on.
function afterShot(now){
  if(S.tier){sideAmbulance(now);return;}
  if(S.kind!=='ok'&&S.mistakes>=painMax){recordSide();finish();return;}
  if(canRetry(S.kind,S.tier)){retrySide(now);return;}
  endSide(now);
}
// the neck modes' ambulance once the x-ray has closed: the two-tone siren and the stamp, then the result card
const SIREN_HOLD=2.6;
function sideAmbulance(now){
  recordSide();S.phase='leave';S.exit='ambulance';S.leaveAt=now;cue('');
  if(S.sound)clinicAudio.siren(3.4);clinicAudio.vib([200,100,200,100,200]);
  domHud.stamp('삐용삐용','구급차 불러요!','siren',SIREN_HOLD*1000);sync();
}
function endSide(now){
  recordSide();
  if(S.sideIdx===0){
    S.phase='turn';cue('');
    gag(S.kind==='ok'&&S.outcome.perfect?'뚝발전소 풀가동! 반대쪽 남음':'한쪽 끝! 반대쪽 남았어요',false,2600);
    if(S.kind==='ok'&&S.outcome.perfect)flash();
  }else{
    // the exit gag decides how he leaves: a swivel-chair spin for a symmetric pair, wrung out for a lopsided one
    const b=balance(S.results);S.exit=b.bonus>0?'spin':b.bonus<0?'twist':null;S.phase='leave';S.leaveAt=now;
    if(S.exit)gag(S.exit==='spin'?'좌우 대칭! 회전의자처럼 벌떡':'한쪽만 꽈배기… 몸은 출구, 골반은 벽',S.exit==='twist',2200);
    if(S.exit&&S.sound)clinicAudio.whoosh();
  }
  sync();
}
// a mild miss under the pain limit: the same side again, height first (core.js canRetry)
function retrySide(now){
  S.phase='play';S.locked=false;S.position=.5;S.pressure=.12;motion.recenter();S.motionReady=false;motion.position=.5;motion.neutral=null;
  S.prepUntil=now+700;wasNear=false;cue('');
  $('sideCutLabel').hidden=true;$('sideCutLabel').classList.remove('burst');
  gag('한 번 더! 이번엔 진짜로',false,1800);sync();
}
function flash(){const e=$('sideFlash');e.hidden=false;e.style.animation='none';void e.offsetWidth;e.style.animation='';setTimeout(()=>{e.hidden=true;},700);}
function flip(){
  if(S.phase!=='turn')return;
  ensureSound();S.phase='roll';S.rollAt=performance.now();gag('데구르르… 택배 왔어요',false,1600);if(S.sound)clinicAudio.whoosh();sync();
}
function endRoll(now){
  S.sideIdx=1;S.tries=0;S.phase='play';S.locked=false;S.position=.5;S.pressure=.12;motion.recenter();S.motionReady=false;motion.position=.5;motion.neutral=null;
  S.prepUntil=now+700;S.breathAt=now;wasNear=false;sync();
}
function finish(){
  S.phase='result';cancelInput();$('sideControls').hidden=true;$('sideMotionNotice').hidden=true;
  const done=canLeave(S.results),b=balance(S.results);
  S.score=Math.max(0,S.score+b.bonus);
  const best=store.get('chiroSideBest',0),record=DAY<0&&done&&!S.results.some(r=>r.tier)&&S.score>best;
  if(record)store.set('chiroSideBest',S.score);
  const tier=Math.max(0,...S.results.map(r=>r.tier));
  const painOut=!tier&&S.mistakes>=painMax;
  $('sideResultTitle').textContent=t(resultTitle({ambulance:tier>0,painOut,campaign:!!dayDef,painMax},'양쪽 다 풀렸어요.'));
  $('sideRdate').textContent=dayDef?t("영업 일지 · {day}{hard} {title}",{day:t(dayLabel(DAY)),hard:HARD?t(" 역경"):"",title:t(dayDef.title)}):t('오늘의 진료 일지');
  $('sideTotal').textContent=S.score;
  // the neck card's rows (ui/hudDom.js logRow): one per side seen, its stars by the neck rule, a failed side as 이송 / 중단,
  // the symmetry bonus as its own row, the patient's review under the last row
  const allOk=S.results.length>0&&S.results.every(r=>r.kind==='ok');
  const review=backify(reviewLine({name:patient.name,stars:allOk&&done?Math.min(...S.results.map(r=>r.stars||1)):0,ambulance:tier>0,fails:S.results.filter(r=>r.kind!=='ok').map(r=>r.tier?'over':r.kind==='weak'?'dud':'finger'),tiers:S.results.map(r=>r.tier),lines:patient.lines}));
  const rows=S.results.map(r=>({who:`${sideName(r.side)} ${r.level}`,pts:r.points,stars:r.kind==='ok'?r.stars||1:0,ambulance:!!r.tier}));
  if(b.label)rows.push({who:t(b.label),pts:b.bonus});
  $('sideResultSteps').replaceChildren(...rows.map((r,i)=>logRow(document,{...r,rev:i===rows.length-1?review:''})));
  const rankText=rankTitle(S.score/2,tier||S.mistakes>=painMax?3:S.mistakes);$('sideRank').textContent=t(rankText);
  $('sideBest').hidden=!record;
  $('sideAgain').textContent=t('한 판 더');   // the free-play primary button; a 영업 일지 day relabels it (dayEnd)
  $('sideResult').hidden=false;sync();
  const complete=runComplete(S.results,S.mistakes,painMax,!!dayDef);
  const outcome=runOutcome({ambulance:tier>0,pain:S.mistakes,complete});
  track(EV.runEnd,{game:'side',day:dayNo,outcome,score:S.score,patients:S.results.length,pain:S.mistakes,best:record,continued:!!S.continued,run_ms:performance.now()-S.runAt,rank:rankText});
  if(complete)track(EV.runComplete,{game:'side',score:S.score,run_ms:performance.now()-S.runAt});
  screenView('result',{outcome});
  const prior=dayDef?(HARD?(readProgress(store.get(CAMPAIGN_KEY,null)).hard||[])[DAY]:readProgress(store.get(CAMPAIGN_KEY,null)).stars[DAY])|0:0,replay=prior>0&&!!dayDef&&(dayClears(DAY,complete,S.score/2,dayDef)?dayStars(S.score/2,dayDef):0)<=prior;   // 진료비 replay (core/shop.js isReplay)
  dayEnd(complete,S.score/2);
  coinReward.show({runKey:S.runAt,replay,continueOffered:!HARD&&continueOffer({endedBad:!complete,bossMiss:!HARD&&!!dayDef&&bossMissed(dayDef.beat,complete,S.score/2,{cracks:2,lastCracks:1}),used:S.continued}),avg:S.score/2,complete,cleared:!!dayDef&&dayClears(DAY,complete,S.score/2,dayDef),hard:HARD,game:'side',day:dayNo||0});
  askReview(complete).then(asked=>monetize.showResult({endedBad:!complete,bossMiss:!HARD&&!!dayDef&&bossMissed(dayDef.beat,complete,S.score/2,{cracks:2,lastCracks:1}),used:S.continued,skipInterstitial:asked||quietDay(DAY,!!(dayDef&&dayDef.beat)),hard:HARD}));
}
function dayEnd(complete,avg){
  if(!dayDef)return;
  const cleared=dayClears(DAY,complete,avg,dayDef),before=readProgress(store.get(CAMPAIGN_KEY,null)),after=(HARD?afterHard:afterDay)(before,DAY,cleared,dayStars(avg,dayDef));
  if(after!==before)store.set(CAMPAIGN_KEY,after);
  const next=cleared?nextDay(after,DAY):-1;
  $('sideDayOutro').textContent=(cleared?(HARD?t("역경 통과! {outro}",{outro:t(dayDef.hardOutro||dayDef.outro)}):t(dayDef.outro)):complete?t("평균 {avg}점. {beat}점을 못 넘었어요. {lose}",{avg:Math.round(avg),beat:dayDef.beat,lose:t(dayDef.lose||'역경은 역경이네요. 손 풀고 다시 와요.')}):HARD?t("{day} 역경을 못 버텼어요. 다시 문 열어 봐요.",{day:dayLabel(DAY)}):t("{day}를 못 버텼어요. 다시 문 열어 봐요.",{day:dayLabel(DAY)}))+(HARD&&!cleared?' '+t('역경엔 이어하기가 없어요.'):'');
  $('sideDayOutro').hidden=false;$('sideToDays').hidden=false;
  $('sideNextDay').hidden=next<0;if(next>=0)$('sideNextDay').href=`index.html?story=${next}`;
  $('sideAgain').textContent=t(cleared?'이 날 다시':'다시 도전');
  track(EV.dayEnd,{day:dayNo,hard:HARD?1:0,cleared,stars:cleared?dayStars(avg,dayDef):0,score:S.score,run_ms:Math.round(performance.now()-S.runAt)});
}
// 광고 보고 이어하기, once a run: the fixed side stays, the failed ones are redone with the pain reset (core.js continuePlan).
function continueRun(){
  const p=continuePlan(S.order,S.goals,S.results),now=performance.now();
  S.continued=true;S.mistakes=0;S.tries=0;S.order=p.order;S.goals=p.goals;S.results=p.results;S.score=p.results.reduce((s,r)=>s+r.points,0);
  S.pending=null;S.tier=0;S.kind='ok';S.exit=null;
  $('sideResult').hidden=true;$('sideControls').hidden=false;$('sideCutLabel').hidden=true;$('sideCutLabel').classList.remove('burst');
  if(p.turn){S.sideIdx=0;S.phase='turn';gag('한쪽은 살렸어요. 반대쪽 다시!',false,2200);}
  else{S.sideIdx=p.sideIdx;endRoll(now);S.sideIdx=p.sideIdx;S.prepUntil=now+PREP_MS;gag('다시 손 얹어요. 이번엔 살살',false,2200);}
  track(EV.runStart,{game:'side',how:'continue',control:S.motionEnabled?'tilt':'touch'});screenView('play');sync();
}
const monetize=mountMonetize({continueBtn:$('sideContinueAd'),buyBtn:$('sideBuyAdFree'),onContinue:continueRun,leave:[$('sideNextDay'),$('sideAgain'),$('sideToDays')]});
const coinReward=mountCoinReward($('sideContinueAd'));   // 진료비 (core/shop.js)
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
  track(EV.runStart,{game:'side',how:S.phase==='result'?'again':'start',control:useMotion&&granted?'tilt':'touch'});screenView('play');S.runAt=performance.now();
  Object.assign(S,{phase:'play',control:useMotion?'motion':'touch',position:.5,pressure:.12,order:sideOrder(Math.random()<.5?'L':'R'),sideIdx:0,goals:makeSideGoals(),score:0,mistakes:0,tries:0,streak:0,
    locked:false,results:[],pending:null,animAt:0,kind:'ok',tier:0,force:0,outcome:null,peakPressure:0,motionEnabled:useMotion&&granted,
    motionReady:false,lastSample:0,continued:false,sensorStatus:granted?'waiting':'denied',prepUntil:performance.now()+PREP_MS,breathAt:performance.now(),gag:null});
  $('sideWelcome').hidden=true;$('sideResult').hidden=true;$('sidePaused').hidden=true;$('sideControls').hidden=false;$('sideGag').hidden=true;
  if(dayDef&&patient.lines.start)domHud.say(patient.lines.start,2600);
  $('sideMotionStatus').textContent=t(granted?'폰을 가로로 편하게 들고 잠깐 기다려 주세요.':'동작 센서가 꺼져 있어요. 다시 연결해 주세요.');
  sync();
}
function halt(){
  if(!['play','anim','turn','roll','leave'].includes(S.phase))return false;
  settleImpact();S.previousPhase=S.phase;S.pausedAt=performance.now();drag=null;swipePeak=0;S.phase='paused';
  stopSound();clinicAudio.suspend();sync();return true;
}
function pause(){if(halt()){syncTune();$('sidePaused').hidden=false;sync();}}
function resume(){
  if(S.phase!=='paused')return;
  const gap=performance.now()-S.pausedAt;
  if(S.previousPhase==='anim')S.animAt+=gap;if(S.previousPhase==='roll')S.rollAt+=gap;if(S.previousPhase==='leave')S.leaveAt+=gap;
  S.phase=S.previousPhase;motion.recenter();S.motionReady=false;$('sidePaused').hidden=true;ensureSound();sync();
}
function resize(){
  if(S.pending)settleImpact();drag=null;swipePeak=0;
  const w=innerWidth,h=innerHeight,v=backViewRot(w,h,physAngle(),lastLandscape);
  viewRot=v.rot;lastLandscape=v.lastLandscape;rotated=viewRot!==0;width=rotated?h:w;height=rotated?w:h;
  app.classList.toggle('self-rotated',rotated);app.classList.toggle('rot270',viewRot===270);app.style.width=width+'px';app.style.height=height+'px';
  app.style.transform=viewRot===90?`translateX(${w}px) rotate(90deg)`:viewRot===270?`translateY(${h}px) rotate(-90deg)`:'none';app.style.left='0';app.style.top='0';
  if(scene)scene.resize(width,height);
  hudDpr=Math.min(devicePixelRatio||1,2);hud.width=Math.round(width*hudDpr);hud.height=Math.round(height*hudDpr);
  $('sideSpeech').style.left=width*.5+'px';$('sideSpeech').style.top=height-40+'px';$('sideSpeech').style.maxWidth=width*.46+'px';
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
  // right = more roll on both sides (the HUD bar, not the mirrored body, sets the direction)
  setPosition(S.position+dx*.0025*g);
  S.pressure=Math.max(0,Math.min(1.35,S.pressure-dy*.004*g*T.bend));
});
canvas.addEventListener('pointerup',()=>{if(drag&&swipePeak>1.6&&performance.now()-drag.t<140)touchShove(swipePeak/1.6);drag=null;swipePeak=0;});
canvas.addEventListener('pointercancel',()=>{drag=null;swipePeak=0;});
$('sideLock').addEventListener('click',()=>setLocked(true));$('sideRelock').addEventListener('click',()=>setLocked(false));
$('sideFlip').addEventListener('click',flip);
center.addEventListener('click',()=>{motion.recenter();S.motionReady=false;S.position=.5;S.pressure=.12;S.prepUntil=performance.now()+700;sync();});
addEventListener('keydown',e=>{
  if(e.code==='Escape'){if(!$('sidePaused').hidden)closeTune();else openTune();return;}
  if(S.phase==='turn'&&(e.code==='Space'||e.code==='Enter')){e.preventDefault();if(!e.repeat)flip();return;}
  if(S.phase!=='play'||S.control!=='touch')return;
  if(e.code==='Space'){e.preventDefault();if(!e.repeat){if(S.locked)touchShove(1);else setLocked(true);}}
  if(!S.locked){if(['ArrowUp','ArrowDown'].includes(e.code)){e.preventDefault();setPosition(S.position+heightDown()*(e.code==='ArrowUp'?-.02:.02));}return;}
  if(['ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();setPosition(S.position+(e.code==='ArrowLeft'?-.02:.02));}
  if(['ArrowUp','ArrowDown'].includes(e.code)){e.preventDefault();S.pressure=Math.max(0,Math.min(1.35,S.pressure+(e.code==='ArrowUp'?.04:-.04)));}
});
addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
$('sideTune').addEventListener('click',openTune);
mountClinicMenu({chip:$('sideClinic'),menu:$('sideClinicMenu'),current:()=>'side',onOpen:halt,onClose:resume});
['sideWelcomeClinics','sideResultClinics'].forEach(id=>renderClinicLinks($(id),'side'));
// the day's patient on the chart, the start card and the pain slots
// a free-run patient other than 박대리 (roster lumbarPatient): their name and their back complaint (look.waist; the cc
// is about the neck) over the start card's first line
if(!dayDef&&patient.waist){
  const nm=$('sideName');nm.textContent=t(patient.name);const ag=document.createElement('small');ag.textContent=t("{age}세",{age:patient.age});nm.append(ag);
  $('sideWelcomeText').firstChild.textContent=t("{name}, {age}세. {waist}",{name:t(patient.name),age:patient.age,waist:t(patient.waist)});
}
if(dayDef){
  const nm=$('sideName');nm.textContent=t(patient.name);const ag=document.createElement('small');ag.textContent=t("{age}세",{age:patient.age});nm.append(ag);
  $('sideDayNo').textContent=t("영업 일지 · {day} {title}",{day:dayLabel(DAY)+(HARD?' '+t('역경'):''),title:t(dayDef.title)});$('sideDayNo').hidden=false;
  $('sideWelcomeText').textContent=t("{name}, {age}세. {cc}",{name:t(patient.name),age:patient.age,cc:t(patient.cc)});
}
$('sideMistakes').replaceChildren(t('통증')+' ',...Array.from({length:painMax},()=>document.createElement('i')));
$('sideTuneClose').addEventListener('click',closeTune);
$('sidePause').addEventListener('click',pause);$('sideResume').addEventListener('click',closeTune);
$('sideStart').addEventListener('click',()=>start());// a 영업 일지 day goes back through its story card (the 통증 칸 +1 ad is on offer again, 역경 stays chosen); free play restarts at once
$('sideAgain').addEventListener('click',()=>{if(dayDef){location.href=`index.html?story=${DAY}${HARD?'&hard=1':''}`;return;}start(S.control==='motion');});
$('sideTouchStart').addEventListener('click',()=>start(false));$('sideTouchFallback').addEventListener('click',()=>start(false));
$('sideSensorRetry').addEventListener('click',()=>start(true));
$('sideSound').addEventListener('change',e=>{S.sound=e.target.checked;if(S.sound)ensureSound();else{stopSound();clinicAudio.setAmbient();}});
function setMusic(on){S.music=on;store.set('chiroSideMusic',S.music);syncMusic();ensureSound();clinicAudio.setAmbient();}
$('sideMusic').addEventListener('click',()=>setMusic(!S.music));
$('sideTuneMusic').addEventListener('change',e=>setMusic(e.target.checked));
for(const [id,key] of [['sideTuneBreath','breath'],['sideTuneTick','tick']])$(id).addEventListener('change',e=>{T[key]=e.target.checked;saveT();});
syncTune();
addEventListener('deviceorientation',e=>motion.orientation(e,performance.now()));
addEventListener('devicemotion',e=>{
  if(S.control!=='motion'||!S.motionEnabled||!['play','anim'].includes(S.phase))return;
  const now=performance.now(),pa=physAngle();
  const active=S.phase==='play',canPush=active&&!S.pending&&now>=S.prepUntil;
  const sample=motion.sample(e,now,(pa+viewRot)*Math.PI/180,{active,canPush,step:0,sens:T.sens,bend:T.bend,heavy:T.heavy,jerk:T.jerk,flick:T.flick,targets:[axisTarget()],axis:1,vertical:!S.locked,vaxis:-heightDown()});
  if(!sample)return;
  if(motionDebug){$('sideDebug').hidden=false;$('sideDebug').textContent=t("툭 {force} · 롤 {roll}° · 위치 {pos} · 힘 {pressure} · 준비 {ready}",{force:sample.force.toFixed(2),roll:sample.lr?.toFixed(1),pos:S.position.toFixed(2),pressure:S.pressure.toFixed(2),ready:sample.ready});}
  S.lastSample=now;S.sensorStatus='connected';const becameReady=!S.motionReady&&sample.ready;S.motionReady=sample.ready;
  if(becameReady){S.prepUntil=Math.max(S.prepUntil,now+600);sync();}
  if(S.pending){if(now-S.pending.at>=130){settleImpact();return;}S.pending.force=Math.max(S.pending.force,sample.force);updateImpact();return;}
  if(sample.type==='impulse'&&canPush){applyPress(sample.position,sample.pressure,sample.force);return;}
  if(active&&sample.type==='aim'){S.position=sample.position;S.pressure=sample.pressure;}
});
function speechFor(time){
  if(S.tier)return time<1.1?backify(FORCE_LINES[S.tier][0]):'허리에서 뭔가 툭 끊긴 소리 났죠…?';
  if(S.kind==='ok')return time<1?patient.lines.what:patient.lines.ahh;
  const f=S.outcome.feedback;
  return backify(f==='over'?patient.lines.ouch:f==='dud'?patient.lines.dud:failLine(patient.lines,S.mistakes));
}
function drawHud(pressure,br){
  ctx.setTransform(hudDpr,0,0,hudDpr,0,0);ctx.clearRect(0,0,width,height);
  if(S.phase!=='play')return;
  const R=clamp(height*.19,62,Math.min(width,height)*.25),cx=width*.5,cy=height*.55;
  const h=clamp(R*1.7,110,height*.62),x=leftGaugeX(app),top=clamp(cy-h*.55,82,height-h-28);   // left edge: the bed and the patient stay clear (10차 P2), past the notch / island (gauge.js)
  if(!S.locked){
    const up=v=>heightDown()>0?1-v:v,tg=goal().height,a=up(tg-TOL),b=up(tg+TOL);
    drawVGauge(ctx,{x,top,h,title:t('높이'),value:up(S.position),band:HARD?null:[Math.min(a,b),Math.max(a,b)],fill:false,hot:!HARD&&heightOk(),colors:{coral:GAUGE_COLORS.mint}});
    drawHint(ctx,{x:cx,y:height-104,text:S.cue,hot:S.cueStyle==='bad'});
    return;
  }
  const near=backDistance(S.position,0,pressure,[goal().roll],TOL)<=1;
  drawVGauge(ctx,{x,top,h,title:t('밀착'),value:pressure/1.35,band:[SWEET.min/1.35,SWEET.max/1.35],limit:SWEET.max/1.35,hot:near||pressure>SWEET.max});
  const bw=clamp(width*.3,110,180),bx=(width-bw)/2,by=height-58;
  const target=goal().roll,off=(S.position-target)/TOL;
  drawHBar(ctx,{bx,by,bw,off,span:{pos:S.position,target,tol:TOL},ok:Math.abs(off)<=1,title:t('골반 비틀기'),showBand:!HARD,okText:t(HARD?'찾아봐요':'맞아요'),offText:t(HARD?'찾아봐요':S.position<target?'더 비틀어요':'너무 감았어요')});
  drawHint(ctx,{x:bx+bw/2,y:by-40,text:S.cue,hot:S.cueStyle==='bad'});
  if(T.breath&&br.exhale)drawHint(ctx,{x:cx,y:Math.max(110,cy-R+20),text:t('후우… 지금 툭 +15'),colors:{bone:GAUGE_COLORS.mint}});
}
function frame(now){
  raf=requestAnimationFrame(frame);if(!scene)return;
  if(S.pending&&now-S.pending.at>=130)settleImpact();
  let pressure=S.pressure,impulse=0,shotTime=-1,film=0,roll=null,react=null,punch=0;
  const br=breathState(now,S.breathAt,4.4);
  if(S.phase==='play'&&br.exhale!==lastExhale){if(lastExhale!==null)domHud.floater(br.exhale?'후우~':'흐읍…',width*.5,height*.42,br.exhale?'breath out':'breath',1700);lastExhale=br.exhale;}
  if(S.phase==='anim'){
    // a good thrust: slow-mo from the hand landing and a camera punch (core.js slowWarp, punchProfile)
    const real=(now-S.animAt)/1000;shotTime=S.kind==='ok'?slowWarp(real):real;punch=S.kind==='ok'&&!reduced?punchProfile(real):0;
    const timing=shotTiming(),style=therapistStyle(S.force,S.tier);
    impulse=pressProfile(shotTime,S.kind,S.tier,S.outcome.feedback,S.force);
    // a weak or over-rolled release keeps the full film (the joint sticking / the disc escaping is the joke); a miss flashes
    film=clinicFilm(shotTime,S.kind==='weak'||S.kind==='over'?'ok':S.kind,S.tier,S.force);
    if(film>.05&&!S.xraySoundPlayed){S.xraySoundPlayed=true;if(S.sound)clinicAudio.whoosh();}
    if(S.tier&&shotTime>=.8+style.xrayDelay&&!S.fracSoundPlayed){S.fracSoundPlayed=true;if(S.sound)clinicAudio.crunch(S.tier,.6);}
    pressure=S.peakPressure*Math.max(0,1-shotTime/.35);
    // a hard thrust: the patient screams over his head, then the therapist overacts over his (core.js overReaction)
    const ov=overReaction({kind:S.kind,tier:S.tier});
    if(ov){
      react={level:ov.level,t:shotTime};
      const at=(who,dy,dx=0)=>{const p=scene.projectBone(who,'head')||{x:width*.5,y:height*.35};return {x:clamp(p.x+dx,110,width-110),y:clamp(p.y+dy,70,height-60)};};
      if(shotTime>=.12&&!S.screamed){S.screamed=true;const p=at('patient',-115);domHud.floater(ov.scream,p.x,p.y,'scream lv'+ov.level,2200);}
      if(shotTime>=.5&&!S.docSaid){S.docSaid=true;const p=at('therapist',110,70);domHud.floater(ov.doc,p.x,p.y,'doc',2000);}
    }
    // one stamp in one place for a disaster (big line + level/side), the plain caption otherwise (user 2026-10-18 rule)
    const lv=lumbarAt(S.shotAim.height),where=`${lv} · ${sideName(side())} ${S.sideIdx+1}/2`,xt=shotTime-(S.tier?.45+style.xrayDelay:.7);
    const big=S.tier===2?t("{lv} 골절!",{lv}):S.tier?t("{lv} 금 갔어요!",{lv}):S.kind==='over'?t('디스크 탈주!'):'';
    const burst=!!big&&xt>=(S.tier?.35:.65),label=$('sideCutLabel');
    label.classList.toggle('burst',burst);
    if(burst){const html=`${big}<small>${where}</small>`;if(label.innerHTML!==html)label.innerHTML=html;}
    else label.textContent=S.kind==='ok'?(xt<.5?t("{where} · 꽉 잠긴 관절",{where}):t("{where} · 관절이 열렸어요",{where})):S.kind==='weak'?t("{where} · 아직 잠겼어요",{where}):S.tier||S.kind==='over'?t("{where} · 너무 감았어요…",{where}):t("{where} · 빗나갔어요",{where});
    label.hidden=film<.3;
    if(shotTime>=timing.speechAt){const text=speechFor(shotTime-timing.speechAt);if(text!==lastSpeech){domHud.say(text,10000,!!S.tier);lastSpeech=text;}}
    if(shotTime>timing.end){domHud.hideSpeech();lastSpeech='';afterShot(now);shotTime=-1;film=0;}
  }
  if(S.phase==='roll'){
    roll=(now-S.rollAt)/1000;
    if(roll>=ROLL_S){roll=null;endRoll(now);}
  }
  let exit=null;
  if(S.phase==='leave'){const t=(now-S.leaveAt)/1000,amb=S.exit==='ambulance';exit=S.exit&&!amb?{kind:S.exit,t}:null;if(t>(amb?SIREN_HOLD:S.exit?2.2:.6))finish(now);}
  if(S.gag&&now>S.gag.until){S.gag=null;$('sideGag').hidden=true;}
  // a hard thrust already has its stamp and the scream: no third word on top
  $('sideImpact').hidden=!(S.phase==='anim'&&shotTime>=0&&shotTime<.6&&!react);
  $('sideHurt').hidden=!(S.phase==='anim'&&S.tier&&shotTime>=.1&&shotTime<.6);
  const distance=S.locked?backDistance(S.position,0,pressure,[goal().roll],TOL):Math.abs(S.position-goal().height)/TOL,near=distance<=1;
  if(S.phase==='play'&&now>=S.prepUntil&&(S.control==='touch'||S.motionReady)){
    if(near&&!wasNear){tone(880,1320,.06,.04);if(navigator.vibrate)navigator.vibrate(35);}
    const close=closenessOf(distance);if(close>.05&&now>nextPulse){if(T.tick)tone(520+520*close,480+480*close,.03,.012);nextPulse=now+560-450*close;}
  }
  wasNear=S.phase==='play'&&near;
  $('sideLock').classList.toggle('ready',S.phase==='play'&&!S.locked&&near);
  if(S.phase==='play'){
    let label;
    if(now<S.prepUntil)label=S.sideIdx?'반대쪽이에요. 다시 손을 얹어요…':'힘 빼세요. 어깨랑 골반에 손을 얹어요…';
    else if(S.control==='motion'&&!S.motionReady)label='폰을 편하게 들고 잠깐 멈춰 주세요';
    else if(!S.locked)label=near?'좋아요. 이 높이로 고정!':S.control==='motion'?'앞뒤로 기울여 민트 링 높이에 맞춰요':'위아래로 드래그해 민트 링 높이에 맞춰요';
    else if(pressure>SWEET.max)label='너무 깊어요. 폰 앞쪽을 조금 들어 주세요';
    else if(near)label=S.control==='motion'?'그 자리! 폰을 짧게 툭':'그 자리! 화면을 휙 튕겨 툭';
    else if(pressureHint(S.position,0,pressure,[goal().roll],TOL)==='position')label=S.position<goal().roll?(S.control==='motion'?'오른쪽으로 기울여 골반을 더 비틀어요':'오른쪽으로 드래그해 더 비틀어요'):'너무 감았어요. 살짝 풀어요';
    else if(pressureHint(S.position,0,pressure,[goal().roll],TOL)==='release')label=S.control==='motion'?'조금 깊어요. 폰 앞쪽을 살짝 들어요':'밀착을 조금 빼 주세요';
    else label=S.control==='motion'?'폰 앞쪽을 천천히 낮춰 밀착해요':'위로 드래그해 밀착해요';
    cue(label,S.locked&&pressure>SWEET.max?'bad':near?'good':'');
  }
  drawHud(pressure,br);
  app.dataset.phase=S.phase;app.dataset.injury=S.tier===2?'break':S.tier===1?'crack':'none';
  // the film up: words move off the spine to the side bands (style.css), the burst replaces the stamp
  app.classList.toggle('xray-on',film>=.3);app.classList.toggle('xray-burst',film>=.3&&$('sideCutLabel').classList.contains('burst'));
  const aim=S.phase==='anim'?S.shotAim:aimAt(S.position);
  if(S.debugView){scene.render({now,...S.debugView});return;}
  if(S.phase!=='paused'){const r=scene.render({now,side:side(),roll,height:aim.height,position:aim.side,locked:aim.locked,pressure:Math.min(1,pressure),impulse:reduced?impulse*.3:impulse,punch,
    kind:S.kind,forceTier:S.tier,force:S.force,shotTime,exit,react,goal:goal(),showGoal:S.control==='touch'||S.mistakes>0||!S.locked,film,
    xrayState:shotTime>=0?{kind:S.kind,tier:S.tier,time:shotTime,height:S.shotAim.height,roll:S.shotAim.side,feedback:S.outcome?.feedback,force:S.force,target:xrayTarget(S.shotAim.height,side())}:null});
    // the joint clicks home on the film: the neck mode's release crack (src/scene/xray.js updateXray returns true)
    if(r?.released&&S.phase==='anim'&&!S.releaseSoundPlayed){S.releaseSoundPlayed=true;if(S.sound)clinicAudio.crackSound(2);clinicAudio.vib([45,30,70]);}}
  if(import.meta.env.MODE==='shot')app.dataset.shot=JSON.stringify({phase:S.phase,side:side(),sideIdx:S.sideIdx,locked:S.locked,position:S.position,results:S.results.length});
}
addEventListener('resize',resize);screen.orientation?.addEventListener?.('change',resize);resize();
const sceneT0=performance.now();
try{scene=await createSideScene(canvas,{model:bodyModel});resize();track(EV.assetLoad,{asset:'side_scene',ok:true,ms:performance.now()-sceneT0});screenView('title');S.phase='ready';$('sideStart').disabled=false;$('sideTouchStart').disabled=false;
  $('sideStart').textContent=t('진료 시작');document.documentElement.dataset.sideReady='true';raf=requestAnimationFrame(t=>{frame(t);markReady();});
}catch(error){console.error('허리비틀기 진료실을 불러오지 못했어요',error);bootFail('scene',error&&error.message);$('sideLoadNote').textContent=t('진료실을 불러오지 못했어요. 다시 열어 주세요.');$('sideStart').textContent=t('다시 불러오기');$('sideStart').disabled=false;$('sideStart').addEventListener('click',()=>location.reload(),{once:true});}
addEventListener('pagehide',()=>{cancelAnimationFrame(raf);stopSound();});
addEventListener('pageshow',e=>{if(e.persisted&&scene){cancelAnimationFrame(raf);resize();raf=requestAnimationFrame(frame);}});
if(import.meta.env.MODE==='shot'||__CASES__)window.__sideShot={press:(position,pressure,force)=>applyPress(position,pressure,force),lock:(on=true)=>setLocked(on),aim:p=>{S.position=p;},flip,
  snapshot:()=>({...S,results:[...S.results]}),view:v=>{S.debugView=v;$('sideWelcome').hidden=!!v;},goal:()=>goal(),bed:()=>scene?.bed,project:(h,p,l)=>scene?.projectPosition(side(),h,p,l)};
if(__CASES__)import("../dev/caseBack.js");

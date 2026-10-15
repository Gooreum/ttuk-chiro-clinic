import {tiltAngles} from '../core/tilt.js';
import {aimBefore, aimDelta, orientationSign, voteSign, signFromVotes} from '../core/motion.js';
import {closenessOf, deltaGain} from '../core/feel.js';
import {TARGETS,backDistance} from './core.js';

// Same gravity pose, iOS sign voting, 250 ms pre-flick aim and 900 ms cooldown as neck adjustment.
// A back thrust adds directional translation: rotation on its own cannot press the patient.
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const vector = a => a && [a.x,a.y,a.z].every(Number.isFinite);
export function screenVector(a, angle){
  const c=Math.cos(angle),s=Math.sin(angle);
  return {x:a.x*c-a.y*s,y:a.x*s+a.y*c,z:a.z};
}
export function thrustSample(linear, angle, rate, jerk=10, flick=200){
  const v=screenVector(linear,angle);
  const forward=Math.max(v.y,-v.z), reverse=Math.max(-v.y,v.z);
  const directional=forward>0 && forward>=Math.abs(v.x)*1.15 && forward>=reverse*.8;
  return {forward,reverse,side:Math.abs(v.x),directional,
    force: directional ? Math.max(forward/jerk, forward>=jerk*.4 ? rate/flick : 0) : 0};
}
export class BackMotion {
  constructor(){ this.reset(); }
  reset(){
    this.position=.5;this.pressure=.12;this.prev=null;this.gravity=null;this.sign=0;this.votes=0;
    this.hist=[];this.coolUntil=0;this.ready=false;this.stableAt=null;this.pose=null;this.angle=null;
    this.lastAt=null;this.quietAt=null;this.blockUntil=0;
  }
  recenter(){this.position=.5;this.pressure=.12;this.prev=null;this.hist=[];this.ready=false;this.stableAt=null;this.quietAt=null;}
  orientation(e,now){ if(Number.isFinite(e.beta)&&Number.isFinite(e.gamma))this.pose={beta:e.beta,gamma:e.gamma,t:now}; }
  cooldown(now){this.coolUntil=now+900;this.quietAt=null;}
  sample(e,now,angle,{active=true,canPush=true,step=0,sens=1.5,bend=1,heavy=.6,jerk=10,flick=200,targets=TARGETS}={}){
    const a=e.accelerationIncludingGravity;if(!vector(a))return null;
    const rate=Math.hypot(e.rotationRate?.alpha||0,e.rotationRate?.beta||0,e.rotationRate?.gamma||0);
    if(this.lastAt!==null&&now-this.lastAt>1800)this.recenter();
    const dt=this.lastAt===null?16:Math.max(1,Math.min(60,now-this.lastAt));this.lastAt=now;
    if(this.angle!==null && Math.abs(Math.atan2(Math.sin(angle-this.angle),Math.cos(angle-this.angle)))>.2)this.recenter();
    this.angle=angle;
    const ps=this.pose&&now-this.pose.t<250?orientationSign(a.z,this.pose.beta,this.pose.gamma):0;
    if(ps){this.votes=voteSign(this.votes,ps);const sg=signFromVotes(this.votes);if(sg&&sg!==this.sign){this.sign=sg;this.gravity=null;this.prev=null;this.stableAt=null;}}
    if(!this.sign&&Math.abs(a.z)>2.5)this.sign=a.z>0?1:-1;
    const sg=this.sign||1, raw={x:a.x*sg,y:a.y*sg,z:a.z*sg};
    if(!this.gravity)this.gravity={...raw};
    const residual={x:raw.x-this.gravity.x,y:raw.y-this.gravity.y,z:raw.z-this.gravity.z};
    // Infer linear sensor polarity from the same burst in the gravity-inclusive sensor.
    // Do not assume iOS applies the same sign convention to both acceleration fields.
    const native=e.acceleration;
    const linearSign=vector(native)?Math.sign(native.x*residual.x+native.y*residual.y+native.z*residual.z)||sg:sg;
    const linear=vector(native)?{x:native.x*linearSign,y:native.y*linearSign,z:native.z*linearSign}:residual;
    const lin=Math.hypot(linear.x,linear.y,linear.z), impact=thrustSample(linear,angle,rate,jerk,flick);
    const quiet=lin<1.6&&rate<flick*.65;
    const out={ready:this.ready,position:this.position,pressure:this.pressure,force:impact.force,forward:impact.forward,reverse:impact.reverse,sign:sg,linearSign,rate,linear:lin,type:'measure'};
    // Reversing the phone or shaking sideways cannot turn the returning recoil into another press.
    if(!impact.directional&&lin>jerk*.6)this.blockUntil=now+250;
    if(!active){if(quiet){const k=1-Math.exp(-dt/45);for(const axis of ['x','y','z'])this.gravity[axis]+=(raw[axis]-this.gravity[axis])*k;}this.prev=null;this.hist=[];this.quietAt=null;return out;}
    if(quiet){
      if(this.quietAt===null)this.quietAt=now;
      const k=1-Math.exp(-dt/45);
      for(const axis of ['x','y','z'])this.gravity[axis]+=(raw[axis]-this.gravity[axis])*k;
      const tilt=tiltAngles(this.gravity.x,this.gravity.y,this.gravity.z,angle),prev=this.prev;this.prev=tilt;
      if(!this.ready){
        if(this.stableAt===null)this.stableAt=now;
        if(now-this.stableAt>=450){this.ready=true;out.ready=true;}
      }else if(prev&&canPush&&now>=this.coolUntil-500){
        const dlr=tilt.lr-prev.lr,dpt=tilt.pt-prev.pt;
        if(Math.abs(dlr)<25&&Math.abs(dpt)<25){
          const d=aimDelta(dlr,dpt,sens,bend),gain=deltaGain(heavy,false,closenessOf(backDistance(this.position,step,this.pressure,targets)));
          this.position=clamp(this.position-d.dr*.022*gain,0,1);
          this.pressure=clamp(this.pressure+d.db*.04*gain,0,1.35);
        }
      }
      out.type=this.ready?'aim':'calibrating';out.position=this.position;out.pressure=this.pressure;
      if(this.ready){this.hist.push({t:now,position:this.position,pressure:this.pressure});while(this.hist.length&&this.hist[0].t<now-800)this.hist.shift();}
    }else{
      if(!this.ready)this.stableAt=null;
      if(this.ready&&canPush&&now>this.coolUntil&&now>this.blockUntil&&impact.force>=.6&&this.hist.length){
        const pre=aimBefore(this.hist,now-250,{position:this.position,pressure:this.pressure});
        out.type='impulse';out.position=pre.position;out.pressure=pre.pressure;
        this.position=pre.position;this.pressure=pre.pressure;this.cooldown(now);
      }
      this.quietAt=null;
    }
    return out;
  }
}

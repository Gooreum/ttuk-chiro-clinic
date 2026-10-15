// Whole-body cartoon pressure: crouch -> leap onto the hands -> recoil -> regain footing.
// Coordinates follow the therapist's side of the bed: -x is toward the patient.
const clamp=v=>Math.max(0,Math.min(1,v));
const ease=(a,b,t)=>{const u=clamp((t-a)/(b-a));return u*u*(3-2*u);};
const arch=(a,b,t)=>t<=a||t>=b?0:Math.sin(Math.PI*(t-a)/(b-a));
export function therapistStyle(force=1,tier=0){
  const power=Math.max(clamp((force-1.3)/2.7),tier===2?1:tier===1?.5:0);
  return {power,impactAt:.15+.4*power,xrayDelay:1.1*power};
}
export function therapistMotion(t,force=1,tier=0){
  const style=therapistStyle(force,tier),p=style.power,hit=style.impactAt;
  if(t<0||!Number.isFinite(t))return {...style,x:0,y:0,roll:0,yaw:0,knee:0,lean:0,handLift:0,handAway:0,wide:0};
  const crouch=arch(0,.14,t),air=arch(.10,hit-.045,t),drop=ease(.10,hit,t)*(1-ease(hit+.04,hit+.22,t));
  const recoil=arch(hit+.09,hit+.67,t),regain=1-ease(hit+.67,hit+.95,t);
  return {...style,
    x:p*(-.23*drop-.20*air+.26*recoil),
    y:p*(-.05*crouch+.29*air-.055*drop+.19*recoil),
    roll:-p*.18*recoil,yaw:-p*.16*recoil,
    knee:p*(34*crouch+48*air+28*drop+38*recoil),
    lean:p*(12*air+22*drop-13*recoil),
    handLift:p*(.19*air+.22*recoil),handAway:p*.19*recoil,
    wide:p*ease(0,.10,t)*regain};
}

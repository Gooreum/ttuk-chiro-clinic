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
  if(t<0||!Number.isFinite(t))return {...style,x:0,y:0,roll:0,yaw:0,knee:0,lean:0,handLift:0,handAway:0,wide:0,compression:0};
  // A grounded treatment still transfers body weight: load, sharp sink, hold, slow release.
  // Keep the hands planted through the hold instead of immediately springing off the back.
  const weight=clamp((force-.65)/.45)*(1-p);
  const load=arch(0,.12,t),sink=ease(.075,.15,t)*(1-ease(.29,.62,t));
  const grounded=weight*sink;
  const crouch=arch(0,.14,t),air=arch(.10,hit-.045,t),drop=ease(.10,hit,t)*(1-ease(hit+.04,hit+.22,t));
  const recoil=arch(hit+.09,hit+.67,t),regain=1-ease(hit+.67,hit+.95,t);
  return {...style,
    x:p*(-.23*drop-.20*air+.26*recoil)-.115*grounded+.018*weight*load,
    y:p*(-.05*crouch+.29*air-.055*drop+.19*recoil)-.045*grounded-.012*weight*load,
    roll:-p*.18*recoil,yaw:-p*.16*recoil,
    knee:p*(34*crouch+48*air+28*drop+38*recoil)+18*grounded+7*weight*load,
    lean:p*(12*air+22*drop-13*recoil)+17*grounded-3*weight*load,
    handLift:p*(.19*air+.22*recoil),handAway:p*.19*recoil,
    wide:p*ease(0,.10,t)*regain,compression:.018*grounded};
}

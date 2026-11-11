/** Visual motion only. The fair outcome is saved before this animation starts. */
export const SPIN_DURATION = 5.4;
export const BALL_POCKET_RADIUS = 170;
export const BALL_TRACK_RADIUS = 229;
const POCKET_STEP = 360 / 38;

export type BallProfile = {
 turns:number;
 dropStart:number;
 captureAt:number;
 bounce:number;
 lateral:number;
 phase:number;
};
export type BallMotionPlan = {
 wheelStart:number;
 wheelEnd:number;
 pocketIndex:number;
 startAngle:number;
};
export type BallFrame = {
 x:number;
 y:number;
 radius:number;
 angle:number;
 height:number;
 roll:number;
};
const clamp = (n:number) => Math.max(0,Math.min(1,Number.isFinite(n)?n:0));
const smooth = (n:number) => n*n*(3-2*n);

/** Decorative randomness never consumes the cryptographic result generator. */
export function createBallProfile(random:()=>number=Math.random):BallProfile {
 return {
  turns:4+Math.min(2,Math.floor(clamp(random())*3)),
  dropStart:.44+clamp(random())*.06,
  captureAt:.77+clamp(random())*.04,
  bounce:8+clamp(random())*8,
  lateral:28+clamp(random())*12,
  phase:clamp(random())*Math.PI*2,
 };
}

/** Shared by the SVG wheel and ball, so the ball stays in a moving pocket. */
export function sampleWheelRotation(progress:number,start:number,end:number):number {
 const p=clamp(progress);
 return start+(end-start)*(1-(1-p)**3);
}

export function sampleBallMotion(progress:number,profile:BallProfile,plan:BallMotionPlan):BallFrame {
 const p=clamp(progress);
 const pocketAngle=plan.pocketIndex*POCKET_STEP;
 const captureWheel=sampleWheelRotation(profile.captureAt,plan.wheelStart,plan.wheelEnd);
 const target=captureWheel+pocketAngle;
 // Choose the equivalent angle several full turns behind the launch point.
 const laps=Math.ceil((target-plan.startAngle)/360)+profile.turns;
 const captureAngle=target-laps*360;
 let radius:number,height=0,angle:number;
 if(p<profile.captureAt){
  const orbit=p/profile.captureAt;
  // Hermite interpolation joins the clockwise wheel at its angular velocity.
  const delta=captureAngle-plan.startAngle;
  const startSpeed=delta*2.5;
  const endSpeed=(plan.wheelEnd-plan.wheelStart)*3*(1-profile.captureAt)**2*profile.captureAt;
  angle=(2*orbit**3-3*orbit**2+1)*plan.startAngle
   +(orbit**3-2*orbit**2+orbit)*startSpeed
   +(-2*orbit**3+3*orbit**2)*captureAngle
   +(orbit**3-orbit**2)*endSpeed;
  if(p<profile.dropStart){
   radius=BALL_POCKET_RADIUS+(BALL_TRACK_RADIUS-BALL_POCKET_RADIUS)*smooth(clamp(p/.065));
   radius+=.7*Math.sin(p*25+profile.phase)*Math.sin(Math.PI*clamp(p/profile.dropStart));
  }else{
   const fall=clamp((p-profile.dropStart)/(profile.captureAt-profile.dropStart));
   const hops=Math.sin(fall*Math.PI*4)**2*Math.sin(Math.PI*fall);
   radius=Math.min(233,BALL_TRACK_RADIUS+(BALL_POCKET_RADIUS-BALL_TRACK_RADIUS)*smooth(fall)+profile.bounce*hops);
   height=profile.bounce*.8*hops;
  }
 }else{
  const settle=(p-profile.captureAt)/(1-profile.captureAt);
  const envelope=Math.exp(-3*settle)*(1-settle)**2*(1-Math.exp(-20*settle));
  angle=sampleWheelRotation(p,plan.wheelStart,plan.wheelEnd)+pocketAngle-laps*360
   +profile.lateral*envelope*Math.sin(settle*Math.PI*5);
  radius=BALL_POCKET_RADIUS+profile.bounce*.35*envelope*Math.sin(settle*Math.PI*6);
  height=profile.bounce*.45*envelope*Math.sin(settle*Math.PI*5)**2;
 }
 const radians=angle*Math.PI/180;
 return {x:250+radius*Math.sin(radians),y:250-radius*Math.cos(radians),radius,angle,height,roll:angle*2.4+p*180};
}

/** Visual motion only. The game chooses its outcome independently before this runs. */
export const SPIN_DURATION = 5.4;
export const BALL_POCKET_RADIUS = 170;
export const BALL_TRACK_RADIUS = 229;

export type BallProfile = {
 turns:number;
 dropStart:number;
 captureAt:number;
 bounce:number;
 lateral:number;
 phase:number;
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

/** Math.random varies the animation, never the selected roulette number. */
export function createBallProfile(random:()=>number=Math.random):BallProfile {
 return {
  turns:5+Math.min(2,Math.floor(clamp(random())*3)),
  dropStart:.47+clamp(random())*.07,
  captureAt:.77+clamp(random())*.04,
  bounce:8+clamp(random())*8,
  lateral:5+clamp(random())*4,
  phase:clamp(random())*Math.PI*2,
 };
}

export function sampleBallMotion(progress:number,profile:BallProfile):BallFrame {
 const p=clamp(progress);
 const finalAngle=-profile.turns*360;
 if(p===0)return {x:250,y:80,radius:BALL_POCKET_RADIUS,angle:0,height:0,roll:0};
 if(p===1)return {x:250,y:80,radius:BALL_POCKET_RADIUS,angle:finalAngle,height:0,roll:finalAngle*2.4+180};
 let radius:number,height=0,angle:number;
 if(p<profile.captureAt){
  const orbit=clamp(p/profile.captureAt);
  angle=finalAngle*(1-(1-orbit)**2.4);
  if(p<profile.dropStart){
   radius=BALL_POCKET_RADIUS+(BALL_TRACK_RADIUS-BALL_POCKET_RADIUS)*smooth(clamp(p/.065));
   radius+=.7*Math.sin(p*25+profile.phase)*Math.sin(Math.PI*clamp(p/profile.dropStart));
  }else{
   const fall=clamp((p-profile.dropStart)/(profile.captureAt-profile.dropStart));
   const hops=Math.abs(Math.sin(fall*Math.PI*4+profile.phase))*Math.sin(Math.PI*fall);
   radius=BALL_TRACK_RADIUS+(BALL_POCKET_RADIUS-BALL_TRACK_RADIUS)*smooth(fall)+profile.bounce*hops;
   radius=Math.min(233,radius);
   height=profile.bounce*.8*hops;
  }
 }else{
  const settle=clamp((p-profile.captureAt)/(1-profile.captureAt));
  const envelope=Math.exp(-4*settle)*(1-settle);
  angle=finalAngle+profile.lateral*envelope*Math.sin(settle*Math.PI*5);
  radius=BALL_POCKET_RADIUS+profile.bounce*.35*envelope*Math.sin(settle*Math.PI*6);
  height=profile.bounce*.45*envelope*Math.abs(Math.sin(settle*Math.PI*5));
 }
 const radians=angle*Math.PI/180;
 return {x:250+radius*Math.sin(radians),y:250-radius*Math.cos(radians),radius,angle,height,roll:angle*2.4+p*180};
}

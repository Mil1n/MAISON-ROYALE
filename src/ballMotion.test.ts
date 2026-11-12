import { describe, expect, it, vi } from 'vitest';
import { WHEEL } from './game';
import { BALL_POCKET_RADIUS, BALL_TRACK_RADIUS, ballContactProgress, createBallProfile, sampleBallMotion, sampleWheelRotation, type BallMotionPlan } from './ballMotion';

const plan:BallMotionPlan={wheelStart:137,wheelEnd:137+6*360+83,pocketIndex:19,startAngle:72};
const angleDifference=(a:number,b:number)=>((a-b+180)%360+360)%360-180;
const relativeAngle=(p:number,seed=.5)=>{
 const profile=createBallProfile(()=>seed);
 return angleDifference(sampleBallMotion(p,profile,plan).angle,sampleWheelRotation(p,plan.wheelStart,plan.wheelEnd)+plan.pocketIndex*360/WHEEL.length);
};

describe('visual roulette ball motion',()=>{
 it('lands in the chosen moving pocket at arbitrary wheel angles, including both zeros',()=>{
  for(const wheelEnd of [2223,4711,9365])for(let pocketIndex=0;pocketIndex<WHEEL.length;pocketIndex++){
   const spin={...plan,wheelEnd,pocketIndex};
   const frame=sampleBallMotion(1,createBallProfile(()=>.5),spin);
   expect(angleDifference(frame.angle,wheelEnd+pocketIndex*360/WHEEL.length)).toBeCloseTo(0,7);
   expect(frame.radius).toBe(BALL_POCKET_RADIUS);
   expect(frame.height).toBe(0);
  }
 });
 it('preserves the previous ball position at launch and can finish around the entire circle',()=>{
  const profile=createBallProfile(()=>.5);
  const first=sampleBallMotion(0,profile,plan);
  expect(first.angle).toBe(plan.startAngle);
  expect(first.radius).toBe(BALL_POCKET_RADIUS);
  const positions=WHEEL.map((_,pocketIndex)=>sampleBallMotion(1,profile,{...plan,pocketIndex}));
  expect(positions.some(f=>f.x<100)).toBe(true);
  expect(positions.some(f=>f.x>400)).toBe(true);
  expect(positions.some(f=>f.y>400)).toBe(true);
 });
 it('orbits opposite the wheel before falling from the track',()=>{
  const profile=createBallProfile(()=>.5),track=sampleBallMotion(.2,profile,plan);
  expect(track.radius).toBeGreaterThan(BALL_TRACK_RADIUS-1);
  expect(track.radius).toBeLessThan(BALL_TRACK_RADIUS+1);
  expect(track.angle).toBeLessThan(plan.startAngle);
  expect(sampleWheelRotation(.2,plan.wheelStart,plan.wheelEnd)).toBeGreaterThan(plan.wheelStart);
 });
 it('keeps positions finite and inside the wheel across varied profiles',()=>{
  for(const seed of [0,.1,.25,.5,.75,.9,1]){
   const profile=createBallProfile(()=>seed);
   for(let i=0;i<=1000;i++){
    const frame=sampleBallMotion(i/1000,profile,plan);
    expect(Object.values(frame).every(Number.isFinite)).toBe(true);
    expect(frame.radius).toBeGreaterThan(164);
    expect(frame.radius).toBeLessThanOrEqual(233);
    expect(frame.height).toBeGreaterThanOrEqual(0);
    expect(frame.height).toBeLessThan(13);
    expect(Math.hypot(frame.x-250,frame.y-250)).toBeCloseTo(frame.radius,7);
   }
  }
 });
 it('bounces visibly and crosses adjacent pockets before settling',()=>{
  const profile=createBallProfile(()=>.5);
  const maxHeight=(from:number,to:number)=>Math.max(...Array.from({length:101},(_,i)=>sampleBallMotion(from+(to-from)*i/100,profile,plan).height));
  expect(maxHeight(profile.dropStart,profile.captureAt)).toBeGreaterThan(5);
  expect(maxHeight(profile.captureAt,.9)).toBeGreaterThan(1);
  expect(maxHeight(.97,1)).toBeLessThan(.15);
  const offsets=Array.from({length:101},(_,i)=>relativeAngle(profile.captureAt+(1-profile.captureAt)*i/100));
  expect(Math.max(...offsets)).toBeGreaterThan(360/WHEEL.length);
  expect(Math.min(...offsets)).toBeLessThan(-360/WHEEL.length/2);
  expect(Math.abs(relativeAngle(.995))).toBeLessThan(.01);
 });
 it('joins the moving wheel without a position or velocity snap',()=>{
  for(const seed of [0,.5,1]){
   const profile=createBallProfile(()=>seed),p=profile.captureAt,epsilon=1e-6;
   const before=sampleBallMotion(p-epsilon,profile,plan),at=sampleBallMotion(p,profile,plan),after=sampleBallMotion(p+epsilon,profile,plan);
   expect(before.x).toBeCloseTo(at.x,2);
   expect(after.x).toBeCloseTo(at.x,2);
   const left=(at.angle-before.angle)/epsilon,right=(after.angle-at.angle)/epsilon;
   expect(Math.abs(left-right)).toBeLessThan(1);
  }
 });
 it('follows the wheel during the final settling phase instead of staying at a fixed marker',()=>{
  const profile=createBallProfile(()=>.5),earlier=sampleBallMotion(.97,profile,plan),final=sampleBallMotion(1,profile,plan);
  expect(angleDifference(final.angle,earlier.angle)).toBeCloseTo(plan.wheelEnd-sampleWheelRotation(.97,plan.wheelStart,plan.wheelEnd),1);
  expect(angleDifference(final.angle,earlier.angle)).toBeGreaterThan(0);
  expect(Math.abs(relativeAngle(.99))).toBeLessThan(.02);
 });
 it('varies paths without consuming the result generator or changing the winning pocket',()=>{
  const spy=vi.spyOn(crypto,'getRandomValues');
  try{
   const a=createBallProfile(()=>.1),b=createBallProfile(()=>.9);
   expect(sampleBallMotion(.4,a,plan)).not.toEqual(sampleBallMotion(.4,b,plan));
   expect(angleDifference(sampleBallMotion(1,a,plan).angle,sampleBallMotion(1,b,plan).angle)).toBeCloseTo(0,7);
   expect(spy).not.toHaveBeenCalled();
  }finally{spy.mockRestore();}
 });
 it('places contact cues at the visible ground contacts before settlement',()=>{
  for(const seed of [0,.5,1]){
   const profile=createBallProfile(()=>seed),contacts=ballContactProgress(profile);
   expect(contacts.length).toBe(7);
   expect(contacts).toEqual([...contacts].sort((a,b)=>a-b));
   for(const p of contacts){
    expect(p).toBeGreaterThan(profile.dropStart);
    expect(p).toBeLessThan(1);
    expect(sampleBallMotion(p,profile,plan).height).toBeCloseTo(0,10);
   }
  }
 });
 it('clamps overshoot to exact endpoints',()=>{
  const profile=createBallProfile(()=>.5);
  expect(sampleBallMotion(-.2,profile,plan)).toEqual(sampleBallMotion(0,profile,plan));
  expect(sampleBallMotion(1.2,profile,plan)).toEqual(sampleBallMotion(1,profile,plan));
 });
});

import { describe, expect, it, vi } from 'vitest';
import { BALL_POCKET_RADIUS, BALL_TRACK_RADIUS, createBallProfile, sampleBallMotion } from './ballMotion';

describe('visual roulette ball motion',()=>{
 it('starts and finishes exactly in the pointer pocket for every profile',()=>{
  for(const seed of [0,.15,.5,.85,1]){
   const profile=createBallProfile(()=>seed);
   expect(sampleBallMotion(0,profile)).toMatchObject({x:250,y:80,radius:BALL_POCKET_RADIUS,height:0});
   expect(sampleBallMotion(1,profile)).toMatchObject({x:250,y:80,radius:BALL_POCKET_RADIUS,height:0});
   expect(sampleBallMotion(1,profile).angle%360).toBe(-0);
  }
 });
 it('launches to the outer track, counter-rotates and falls into the pocket',()=>{
  const profile=createBallProfile(()=>.5);
  const track=sampleBallMotion(.2,profile);
  expect(track.radius).toBeGreaterThan(BALL_TRACK_RADIUS-1);
  expect(track.radius).toBeLessThan(BALL_TRACK_RADIUS+1);
  expect(track.angle).toBeLessThan(0);
  expect(sampleBallMotion(.95,profile).radius).toBeCloseTo(BALL_POCKET_RADIUS,0);
 });
 it('keeps all positions finite and inside the wheel across varied profiles',()=>{
  for(const seed of [0,.1,.25,.5,.75,.9,1]){
   const profile=createBallProfile(()=>seed);
   for(let i=0;i<=1000;i++){
    const frame=sampleBallMotion(i/1000,profile);
    expect(Object.values(frame).every(Number.isFinite)).toBe(true);
    expect(frame.radius).toBeGreaterThan(164);
    expect(frame.radius).toBeLessThanOrEqual(233);
    expect(frame.height).toBeGreaterThanOrEqual(0);
    expect(frame.height).toBeLessThan(13);
    expect(Math.hypot(frame.x-250,frame.y-250)).toBeCloseTo(frame.radius,7);
   }
  }
 });
 it('has visible drop bounces that diminish as the ball settles',()=>{
  const profile=createBallProfile(()=>.5);
  const maxHeight=(from:number,to:number)=>Math.max(...Array.from({length:101},(_,i)=>sampleBallMotion(from+(to-from)*i/100,profile).height));
  expect(maxHeight(profile.dropStart,profile.captureAt)).toBeGreaterThan(5);
  expect(maxHeight(profile.captureAt,.9)).toBeGreaterThan(1);
  expect(maxHeight(.95,1)).toBeLessThan(.15);
  const frames=Array.from({length:100},(_,i)=>sampleBallMotion(profile.captureAt+(1-profile.captureAt)*i/100,profile));
  expect(frames.some(f=>f.radius>BALL_POCKET_RADIUS+.5)).toBe(true);
  expect(frames.some(f=>f.radius<BALL_POCKET_RADIUS-.2)).toBe(true);
 });
 it('varies paths without consuming the result generator',()=>{
  const spy=vi.spyOn(crypto,'getRandomValues');
  try{
   const a=createBallProfile(()=>.1),b=createBallProfile(()=>.9);
   expect(a).not.toEqual(b);
   expect(sampleBallMotion(.4,a)).not.toEqual(sampleBallMotion(.4,b));
   expect(sampleBallMotion(1,a).x).toBe(sampleBallMotion(1,b).x);
   expect(spy).not.toHaveBeenCalled();
  }finally{spy.mockRestore();}
 });
 it('clamps overshoot to exact endpoints',()=>{
  const profile=createBallProfile(()=>.5);
  expect(sampleBallMotion(-.2,profile)).toEqual(sampleBallMotion(0,profile));
  expect(sampleBallMotion(1.2,profile)).toEqual(sampleBallMotion(1,profile));
 });
});

import { useEffect, useId, useRef } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, type MotionValue } from 'framer-motion';
import { ballContactProgress, createBallProfile, sampleBallMotion, sampleWheelRotation, SPIN_DURATION, type BallFrame, type BallMotionPlan } from '../ballMotion';
import { sound } from '../audio';

type Props={spinning:boolean;rotation:number;wheelRotation:MotionValue<number>;pocketIndex:number;onComplete:()=>void;durationScale?:number;soundEnabled?:boolean};

export function Ball({spinning,rotation,wheelRotation,pocketIndex,onComplete,durationScale=1,soundEnabled=false}:Props){
 const complete=useRef(onComplete);
 complete.current=onComplete;
 const audible=useRef(soundEnabled);
 audible.current=soundEnabled;
 const reduced=useReducedMotion();
 const angle=useRef(rotation+pocketIndex*360/38);
 const sphereId=`ball-sphere-${useId().replace(/:/g,'')}`;
 const x=useMotionValue(250),groundY=useMotionValue(83),bodyY=useMotionValue(80);
 const scale=useMotionValue(1),roll=useMotionValue(0),shadowScale=useMotionValue(1),shadowOpacity=useMotionValue(.44);
 useEffect(()=>{
  const setFrame=(frame:BallFrame)=>{
   angle.current=frame.angle;
   x.set(frame.x);groundY.set(frame.y+3);bodyY.set(frame.y-frame.height);
   scale.set(1+frame.height*.012);roll.set(frame.roll);
   shadowScale.set(1+frame.height*.035);shadowOpacity.set(.44/(1+frame.height*.09));
  };
  const profile=createBallProfile();
  const contacts=ballContactProgress(profile);
  let nextContact=0;
  const plan:BallMotionPlan={wheelStart:wheelRotation.get(),wheelEnd:rotation,pocketIndex,startAngle:angle.current};
  const draw=(progress:number)=>{
   wheelRotation.set(sampleWheelRotation(progress,plan.wheelStart,plan.wheelEnd));
   setFrame(sampleBallMotion(progress,profile,plan));
   // Animation updates can skip frames; play one contact rather than a burst.
   let touched=false;
   while(nextContact<contacts.length&&progress>=contacts[nextContact]){nextContact++;touched=true;}
   if(spinning&&!reduced&&touched&&progress<1)sound('ball',audible.current);
  };
  if(!spinning){draw(1);return;}
  if(reduced){
   draw(1);
   const timer=setTimeout(()=>complete.current(),150);
   return()=>clearTimeout(timer);
  }
  draw(0);
  const controls=animate(0,1,{
   duration:SPIN_DURATION*(Number.isFinite(durationScale)?Math.max(.25,Math.min(3,durationScale)):1),ease:'linear',
   onUpdate:draw,
   onComplete:()=>{draw(1);complete.current();},
  });
  return()=>controls.stop();
 },[spinning,rotation,wheelRotation,pocketIndex,reduced,durationScale,x,groundY,bodyY,scale,roll,shadowScale,shadowOpacity]);
 return <svg className="ball-overlay" viewBox="0 0 500 500" aria-hidden="true">
  <defs><radialGradient id={sphereId} cx="30%" cy="25%"><stop stopColor="#fffefa"/><stop offset=".5" stopColor="#fff6e0"/><stop offset=".8" stopColor="#ddd0b2"/><stop offset="1" stopColor="#95856a"/></radialGradient></defs>
  <motion.g className="roulette-ball-shadow" style={{x,y:groundY,scaleX:shadowScale,scaleY:shadowScale,opacity:shadowOpacity,transformOrigin:'0px 0px'}}><ellipse cx="2" cy="0" rx="5.5" ry="3.3" fill="#000"/></motion.g>
  <motion.g className="roulette-ball-body" style={{x,y:bodyY,scale,transformOrigin:'0px 0px'}}>
   <circle r="5.5" fill={`url(#${sphereId})`} stroke="#c9bd9f" strokeWidth=".35"/>
   <motion.g style={{rotate:roll,transformOrigin:'0px 0px'}}><path d="M-4-1 Q0-3 4-1" fill="none" stroke="#a99a7c" strokeWidth=".65" opacity=".45"/></motion.g>
   <ellipse cx="-1.8" cy="-2" rx="1.4" ry=".8" fill="#fff" opacity=".8"/>
  </motion.g>
 </svg>;
}

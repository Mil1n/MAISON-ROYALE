import { useEffect, useId, useRef } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, type MotionValue } from 'framer-motion';
import { createBallProfile, sampleBallMotion, sampleWheelRotation, SPIN_DURATION, type BallFrame, type BallMotionPlan } from '../ballMotion';

type Props={spinning:boolean;rotation:number;wheelRotation:MotionValue<number>;pocketIndex:number;onComplete:()=>void};

export function Ball({spinning,rotation,wheelRotation,pocketIndex,onComplete}:Props){
 const complete=useRef(onComplete);
 complete.current=onComplete;
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
  const plan:BallMotionPlan={wheelStart:wheelRotation.get(),wheelEnd:rotation,pocketIndex,startAngle:angle.current};
  const draw=(progress:number)=>{
   wheelRotation.set(sampleWheelRotation(progress,plan.wheelStart,plan.wheelEnd));
   setFrame(sampleBallMotion(progress,profile,plan));
  };
  if(!spinning){draw(1);return;}
  if(reduced){
   draw(1);
   const timer=setTimeout(()=>complete.current(),150);
   return()=>clearTimeout(timer);
  }
  draw(0);
  const controls=animate(0,1,{
   duration:SPIN_DURATION,ease:'linear',
   onUpdate:draw,
   onComplete:()=>{draw(1);complete.current();},
  });
  return()=>controls.stop();
 },[spinning,rotation,wheelRotation,pocketIndex,reduced,x,groundY,bodyY,scale,roll,shadowScale,shadowOpacity]);
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

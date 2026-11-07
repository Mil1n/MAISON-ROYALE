import { useEffect, useId, useRef } from 'react';
import { animate, motion, useMotionValue, useReducedMotion } from 'framer-motion';
import { createBallProfile, sampleBallMotion, SPIN_DURATION, type BallFrame } from '../ballMotion';

type Props={spinning:boolean;rotation:number;onComplete:()=>void};

export function Ball({spinning,rotation,onComplete}:Props){
 const complete=useRef(onComplete);
 complete.current=onComplete;
 const reduced=useReducedMotion();
 const sphereId=`ball-sphere-${useId().replace(/:/g,'')}`;
 const x=useMotionValue(250),groundY=useMotionValue(83),bodyY=useMotionValue(80);
 const scale=useMotionValue(1),roll=useMotionValue(0),shadowScale=useMotionValue(1),shadowOpacity=useMotionValue(.44);
 useEffect(()=>{
  const setFrame=(frame:BallFrame)=>{
   x.set(frame.x);groundY.set(frame.y+3);bodyY.set(frame.y-frame.height);
   scale.set(1+frame.height*.012);roll.set(frame.roll);
   shadowScale.set(1+frame.height*.035);shadowOpacity.set(.44/(1+frame.height*.09));
  };
  const profile=createBallProfile();
  if(!spinning){setFrame(sampleBallMotion(1,profile));return;}
  if(reduced){
   setFrame(sampleBallMotion(1,profile));
   const timer=setTimeout(()=>complete.current(),SPIN_DURATION*1000);
   return()=>clearTimeout(timer);
  }
  setFrame(sampleBallMotion(0,profile));
  const controls=animate(0,1,{
   duration:SPIN_DURATION,ease:'linear',
   onUpdate:value=>setFrame(sampleBallMotion(value,profile)),
   onComplete:()=>{setFrame(sampleBallMotion(1,profile));complete.current();},
  });
  return()=>controls.stop();
 },[spinning,rotation,reduced,x,groundY,bodyY,scale,roll,shadowScale,shadowOpacity]);
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

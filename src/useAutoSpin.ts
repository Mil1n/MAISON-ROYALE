import { useCallback, useEffect, useRef, useState } from 'react';

/** A deadline belongs to the first accepted bet, rather than each added chip. */
export function useAutoSpin(active:boolean, onExpire:()=>void) {
 const [seconds,setSeconds]=useState<number|null>(null);
 const [epoch,setEpoch]=useState(0);
 const interval=useRef<ReturnType<typeof setInterval>|null>(null);
 const callback=useRef(onExpire);
 callback.current=onExpire;
 const cancel=useCallback(()=>{
  if(interval.current!==null)clearInterval(interval.current);
  interval.current=null;
  setSeconds(null);
 },[]);
 const restart=useCallback(()=>setEpoch(n=>n+1),[]);
 useEffect(()=>{
  cancel();
  if(!active)return;
  const deadline=Date.now()+7000;
  setSeconds(7);
  interval.current=setInterval(()=>{
   const left=Math.max(0,Math.ceil((deadline-Date.now())/1000));
   if(left===0){cancel();callback.current();}
   else setSeconds(left);
  },100);
  return()=>{
   if(interval.current!==null)clearInterval(interval.current);
   interval.current=null;
  };
 },[active,epoch,cancel]);
 return {seconds,cancel,restart};
}

import { motion } from 'framer-motion';
import { WHEEL,color } from '../game';
const point=(r:number,a:number)=>[250+r*Math.sin(a*Math.PI/180),250-r*Math.cos(a*Math.PI/180)];
export function Wheel({rotation,spinning,onComplete,result}:{rotation:number;spinning:boolean;onComplete:()=>void;result:number|null}) {
 const step=360/37;
 return <div className="wheel-wrap"><div className="wheel-shadow"/><div className="wheel-frame"><div className="wheel-pointer"/><motion.svg className="wheel" viewBox="0 0 500 500" animate={{rotate:rotation}} transition={{duration:spinning?5.4:0,ease:[.12,.7,.13,1]}} onAnimationComplete={onComplete} aria-label="Колесо европейской рулетки">
 <defs><radialGradient id="wood"><stop stopColor="#825235"/><stop offset=".6" stopColor="#42291e"/><stop offset="1" stopColor="#211711"/></radialGradient><radialGradient id="metal"><stop stopColor="#f0d69b"/><stop offset=".4" stopColor="#a67e3f"/><stop offset=".7" stopColor="#e7cc8e"/><stop offset="1" stopColor="#6e5128"/></radialGradient><radialGradient id="bowl"><stop stopColor="#69422b"/><stop offset=".7" stopColor="#39281d"/><stop offset="1" stopColor="#79563a"/></radialGradient></defs>
 <circle cx="250" cy="250" r="246" fill="url(#wood)" stroke="#cba66a" strokeWidth="5"/><circle cx="250" cy="250" r="229" fill="none" stroke="#241b15" strokeWidth="7"/>
 {WHEEL.map((n,i)=>{const a=i*step-step/2,b=a+step;const p=point(218,a),q=point(218,b),u=point(165,b),v=point(165,a);return <g key={n}><path d={`M${p} A218 218 0 0 1 ${q} L${u} A165 165 0 0 0 ${v} Z`} fill={color(n)==='red'?'#ad292e':color(n)==='green'?'#177955':'#151c1a'} stroke="#bd9d66" strokeWidth=".8"/><text x="250" y="59" transform={`rotate(${i*step} 250 250)`} textAnchor="middle" dominantBaseline="middle" fill="#faf3df" fontSize="17" fontFamily="Georgia">{n}</text></g>})}
 <circle cx="250" cy="250" r="163" fill="url(#bowl)" stroke="#cba66a" strokeWidth="4"/><circle cx="250" cy="250" r="147" fill="none" stroke="#b08755" strokeWidth="1"/><circle cx="250" cy="250" r="129" fill="none" stroke="#1c1813" strokeWidth="1"/>
 {WHEEL.map((_,i)=>{const p=point(145,i*step),q=point(160,i*step);return <path key={i} d={`M${p} L${q}`} stroke="#cba66a" strokeWidth="2"/>})}
 <path d="M250 174 L263 237 L326 250 L263 263 L250 326 L237 263 L174 250 L237 237 Z" fill="url(#metal)" stroke="#e5ca93" strokeWidth="1"/><circle cx="250" cy="250" r="27" fill="url(#metal)"/><circle cx="250" cy="250" r="12" fill="#dec18b"/>
 </motion.svg><motion.div className="ball-orbit" animate={{rotate:-Math.ceil(rotation/360)*360}} transition={{duration:5.4,ease:[.15,.6,.2,1]}}><span className="ball"/></motion.div></div>
 <div className="wheel-caption"><span className="tiny-line"/> ЕВРОПЕЙСКАЯ РУЛЕТКА <span className="tiny-line"/></div>
 <div className="wheel-result" aria-live="polite">{spinning?'Ставки приняты. Удачи!':result===null?'Сделайте вашу ставку':<>Выпало <strong className={color(result)}>{result}</strong> · {color(result)==='red'?'красное':color(result)==='black'?'чёрное':'зеро'}</>}</div></div>;
}

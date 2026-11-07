import { motion } from 'framer-motion';
import { WHEEL, color, type Pocket } from '../game';
const point = (r:number,a:number) => [250+r*Math.sin(a*Math.PI/180),250-r*Math.cos(a*Math.PI/180)];
const sector = (outer:number,inner:number,a:number,b:number) => `M${point(outer,a)} A${outer} ${outer} 0 0 1 ${point(outer,b)} L${point(inner,b)} A${inner} ${inner} 0 0 0 ${point(inner,a)} Z`;
export function Wheel({rotation,spinning,onComplete,result}:{rotation:number;spinning:boolean;onComplete:()=>void;result:Pocket|null}) {
 const step = 360/WHEEL.length;
 return <div className="wheel-wrap"><div className="wheel-shadow"/><div className="wheel-frame"><div className="wheel-pointer"/>
 <svg className="wheel" viewBox="0 0 500 500" role="img" aria-label="Колесо американской рулетки">
 <defs>
  <radialGradient id="wood"><stop stopColor="#30170e"/><stop offset=".83" stopColor="#311a12"/><stop offset=".88" stopColor="#8b5231"/><stop offset=".92" stopColor="#4b2819"/><stop offset=".97" stopColor="#8c5735"/><stop offset="1" stopColor="#25170f"/></radialGradient>
  <linearGradient id="brass" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#634520"/><stop offset=".22" stopColor="#f5dea1"/><stop offset=".45" stopColor="#b88c48"/><stop offset=".55" stopColor="#725027"/><stop offset=".8" stopColor="#dcb777"/><stop offset="1" stopColor="#f4d59a"/></linearGradient>
  <radialGradient id="bowl" gradientUnits="userSpaceOnUse" cx="250" cy="250" r="156"><stop stopColor="#955e39"/><stop offset=".25" stopColor="#7b482b"/><stop offset=".65" stopColor="#54301f"/><stop offset=".88" stopColor="#392318"/><stop offset=".97" stopColor="#231b12"/><stop offset="1" stopColor="#795a37"/></radialGradient>
  <radialGradient id="bowl-light" gradientUnits="userSpaceOnUse" cx="180" cy="160" r="260"><stop stopColor="#ffe4b1" stopOpacity=".13"/><stop offset=".55" stopColor="#ffe4b1" stopOpacity=".04"/><stop offset="1" stopColor="#ffe4b1" stopOpacity="0"/></radialGradient>
  <radialGradient id="hub" cx="35%" cy="25%"><stop stopColor="#fff4c6"/><stop offset=".3" stopColor="#e4c183"/><stop offset=".65" stopColor="#b58a46"/><stop offset=".85" stopColor="#70502b"/><stop offset="1" stopColor="#d5af6a"/></radialGradient>
  <linearGradient id="shine" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff4d3" stopOpacity=".24"/><stop offset=".45" stopColor="#fff4d3" stopOpacity="0"/><stop offset=".8" stopColor="#000" stopOpacity=".18"/><stop offset="1" stopColor="#fff4d3" stopOpacity=".12"/></linearGradient>
  <pattern id="grain" width="500" height="500" patternUnits="userSpaceOnUse"><path d="M-100 90 Q180 10 600 110 M-100 96 Q180 16 600 116 M-100 185 Q180 75 600 180 M-100 190 Q180 82 600 187 M-100 300 Q180 150 600 280 M-100 304 Q180 155 600 285 M-100 400 Q180 270 600 390 M-100 405 Q180 277 600 397 M-100 490 Q180 370 600 480" fill="none" stroke="#e3ab71" strokeWidth="1" opacity=".11"/></pattern>
  <filter id="spindle-shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="3" dy="6" stdDeviation="4" floodOpacity=".6"/></filter>
 </defs>
 <circle cx="250" cy="250" r="248" fill="url(#wood)" stroke="#21160f" strokeWidth="4"/>
 <circle cx="250" cy="250" r="245" fill="url(#grain)"/>
 {[244,240,227,222].map((r,i)=><circle key={r} cx="250" cy="250" r={r} fill="none" stroke={i%2?'#26180e':'url(#brass)'} strokeWidth={i%2?2:2.5}/>)}
 <motion.g style={{transformOrigin:'250px 250px'}} animate={{rotate:rotation}} transition={{duration:spinning?5.4:0,ease:[.12,.7,.13,1]}} onAnimationComplete={onComplete}>
 <circle cx="250" cy="250" r="220" fill="#151613"/>
 {WHEEL.map((n,i)=>{const a=i*step-step/2,b=a+step,c=color(n);return <g key={n}>
  <path d={sector(220,184,a,b)} fill={c==='red'?'#a82b2d':c==='green'?'#176447':'#141b18'} stroke="#e0d0a8" strokeWidth=".75"/>
  <text x="250" y="48" transform={`rotate(${i*step} 250 250)`} textAnchor="middle" dominantBaseline="middle" fill="#fff5df" fontSize="15.5" fontWeight="700" fontFamily="Table Sans, sans-serif">{n}</text>
  <path d={sector(183,158,a+.4,b-.4)} fill={c==='red'?'#6e191b':c==='green'?'#104f36':'#0d1511'} stroke="#a68a54" strokeWidth="1.2"/>
  <path d={`M${point(159,a)} L${point(183,a)}`} stroke="url(#brass)" strokeWidth="2"/>
 </g>})}
 <circle cx="250" cy="250" r="156" fill="url(#bowl)" stroke="url(#brass)" strokeWidth="3"/>
 <circle cx="250" cy="250" r="154" fill="url(#grain)"/>
 {[148,142,134,122,108,90,68,48].map((r,i)=><circle key={r} cx="250" cy="250" r={r} fill="none" stroke={i%2?'#d59a5b':'#24140d'} strokeOpacity={i%2?.08:.18} strokeWidth="1"/>)}
 <g filter="url(#spindle-shadow)">
 <ellipse cx="250" cy="255" rx="38" ry="27" fill="#251b12" opacity=".55"/>
 <path d="M250 170 C256 193 258 222 263 237 C278 242 307 244 330 250 C307 256 278 258 263 263 C258 278 256 307 250 330 C244 307 242 278 237 263 C222 258 193 256 170 250 C193 244 222 242 237 237 C242 222 244 193 250 170Z" fill="url(#brass)" stroke="#e1bd7b" strokeWidth=".8"/>
 {[0,90,180,270].map(a=><ellipse key={a} cx="250" cy="174" rx="5" ry="10" transform={`rotate(${a} 250 250)`} fill="url(#hub)"/>)}
 <circle cx="250" cy="250" r="28" fill="url(#hub)" stroke="#5f431e" strokeWidth="2"/><circle cx="250" cy="250" r="21" fill="none" stroke="#f2d59b" strokeOpacity=".6"/><circle cx="250" cy="250" r="14" fill="url(#hub)"/><ellipse cx="247" cy="245" rx="5" ry="3" fill="#fff5cf" opacity=".5"/>
 </g></motion.g>
 <circle cx="250" cy="250" r="221" fill="none" stroke="url(#brass)" strokeWidth="2"/>
 <circle cx="250" cy="250" r="154" fill="url(#bowl-light)" pointerEvents="none"/>
 <circle cx="250" cy="250" r="247" fill="url(#shine)" pointerEvents="none"/>
 <path d="M52 124 A235 235 0 0 1 370 49" fill="none" stroke="#ffe3ab" strokeWidth="2" opacity=".3"/>
 </svg>
 <motion.div className="ball-orbit" animate={{rotate:-Math.ceil(rotation/360)*360}} transition={{duration:5.4,ease:[.15,.6,.2,1]}}><span className="ball"/></motion.div></div>
 <div className="wheel-caption"><span className="tiny-line"/> АМЕРИКАНСКАЯ РУЛЕТКА <span className="tiny-line"/></div>
 <div className="wheel-result" aria-live="polite">{spinning?'Ставки приняты. Удачи!':result===null?'Сделайте вашу ставку':<>Выпало <strong className={color(result)}>{result}</strong> · {color(result)==='red'?'красное':color(result)==='black'?'чёрное':result==='00'?'двойное зеро':'зеро'}</>}</div></div>;
}

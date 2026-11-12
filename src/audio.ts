let context:AudioContext|undefined;
export function sound(kind:'chip'|'spin'|'win'|'lose'|'ball',enabled:boolean){
 if(!enabled) return;
 try {
 context??=new AudioContext(); void context.resume();
 if(kind==='ball'){
  // A short, quiet wooden/metallic contact, distinct from the chip sound.
  const at=context.currentTime,osc=context.createOscillator(),gain=context.createGain();
  osc.type='triangle';osc.frequency.setValueAtTime(1250,at);osc.frequency.exponentialRampToValueAtTime(420,at+.035);
  gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.035,at+.002);gain.gain.exponentialRampToValueAtTime(.0001,at+.055);
  osc.connect(gain);gain.connect(context.destination);osc.start(at);osc.stop(at+.06);return;
 }
 const notes=kind==='win'?[523,659,784,1047]:kind==='lose'?[220,165]:kind==='spin'?[160,200,240,280]:[900,650];
 notes.forEach((hz,i)=>{const osc=context!.createOscillator(),gain=context!.createGain(),at=context!.currentTime+i*.09;osc.type=kind==='spin'?'triangle':'sine';osc.frequency.setValueAtTime(hz,at);gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.06,at+.01);gain.gain.exponentialRampToValueAtTime(.0001,at+.15);osc.connect(gain);gain.connect(context!.destination);osc.start(at);osc.stop(at+.17);});
 }catch{/* Audio is optional when the browser does not support Web Audio. */}
}

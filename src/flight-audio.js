'use strict';
// Quiet synthesized cabin feedback; starts only after a user gesture.
const FlightAudio=(()=>{
  let context,osc,gain,enabled=false;
  try{enabled=localStorage.getItem('xinghuan-sound')==='on';}catch{}
  function init(){
    if(!enabled)return;
    try{
      if(!context){const C=window.AudioContext||window.webkitAudioContext;if(!C)return;context=new C();gain=context.createGain();gain.gain.value=0;gain.connect(context.destination);osc=context.createOscillator();osc.type='sine';osc.frequency.value=55;osc.connect(gain);osc.start();}
      if(context.state==='suspended')context.resume().catch(()=>{});
    }catch{}
  }
  addEventListener('pointerdown',init);addEventListener('keydown',init);
  addEventListener('blur',()=>engine(false,0));
  function engine(active,power){if(!context)return;gain.gain.setTargetAtTime(enabled&&active ? .018 : 0,context.currentTime,.15);osc.frequency.setTargetAtTime(48+power*36,context.currentTime,.2);}
  function cue(){if(!enabled)return;init();if(!context)return;const o=context.createOscillator(),g=context.createGain();o.connect(g);g.connect(context.destination);o.frequency.setValueAtTime(660,context.currentTime);o.frequency.linearRampToValueAtTime(880,context.currentTime+.15);g.gain.setValueAtTime(.035,context.currentTime);g.gain.exponentialRampToValueAtTime(.0001,context.currentTime+.4);o.start();o.stop(context.currentTime+.4);o.onended=()=>{o.disconnect();g.disconnect();};}
  function toggle(){enabled=!enabled;if(!enabled&&window.speechSynthesis)speechSynthesis.cancel();try{localStorage.setItem('xinghuan-sound',enabled?'on':'off');}catch{}init();engine(false,0);cue();const e=document.createElement('div');e.className='toast';e.textContent='航行音效'+(enabled?'已开启':'已静音')+' · N 切换';document.getElementById('toasts').appendChild(e);setTimeout(()=>e.remove(),3000);}
  function announce(text){
    cue();
    if(!enabled||!window.speechSynthesis)return;
    const voice=speechSynthesis.getVoices().find(v=>v.localService&&/^zh/.test(v.lang));
    if(!voice)return;
    speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.voice=voice;utterance.lang=voice.lang;utterance.volume=.55;speechSynthesis.speak(utterance);
  }
  return {engine,cue,toggle,announce};
})();

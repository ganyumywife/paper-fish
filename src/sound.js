(function(root){
  const recipes={tear:[.3,1900,.24],crumple:[.35,1000,.22],unfold:[.32,1500,.18],land:[.1,280,.25],launch:[.2,700,.24],bin:[.18,420,.26]};
  let context,last=0;
  function samples(type,rate=22050){
    const recipe=recipes[type];if(!recipe)return null;
    const [duration,frequency,level]=recipe,data=new Float32Array(Math.ceil(duration*rate));let seed=913;
    for(let i=0;i<data.length;i++){
      const t=i/rate,fade=Math.sin(Math.PI*i/data.length)*Math.exp(-t*5);
      seed=(seed*1664525+1013904223)>>>0;
      const noise=seed/2147483648-1,grain=.35+.65*Math.abs(Math.sin(t*frequency));
      data[i]=(type==='bin'?Math.sin(2*Math.PI*frequency*t)*.45+noise*.25:noise*grain)*fade*level;
    }
    return data;
  }
  async function play({type,volume}){
    if(!Number.isFinite(volume)||volume<=0||!recipes[type])return;
    try{
      context ||= new AudioContext();if(context.state==='suspended')await context.resume();
      if(context.currentTime-last<.08)return;
      last=context.currentTime;const data=samples(type,context.sampleRate),buffer=context.createBuffer(1,data.length,context.sampleRate);buffer.copyToChannel(data,0);
      const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;gain.gain.value=Math.min(1,volume);source.connect(gain);gain.connect(context.destination);source.onended=()=>{source.disconnect();gain.disconnect();};source.start();
    }catch{/* An unavailable audio device must never interrupt writing. */}
  }
  const api={samples,play};if(typeof module==='object'&&module.exports)module.exports=api;else{root.PaperSound=api;root.desk.onSound(play);}
})(globalThis);

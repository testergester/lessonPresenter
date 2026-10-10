export const EFFECT_DURATION = 300;
export function animationBatch(effects,start=0) {
  let end=start;while(end<effects.length&&(end===start||effects[end].trigger!=='click'))end++;
  let previous={start:0,end:0};
  const steps=effects.slice(start,end).map((effect,index)=>{
    const time=(index===0?0:effect.trigger==='with'?previous.start:previous.end)+(effect.delay||0);
    const step={...effect,start:time,end:time+EFFECT_DURATION};previous=step;return step;
  });
  return {steps,next:end,duration:Math.max(0,...steps.map(step=>step.end))};
}
export function initialAnimationVisibility(effects) {
  const result=new Map();for(const effect of effects)for(const id of effect.targets)if(!result.has(id))result.set(id,effect.effect!=='appear');return result;
}
export class AnimationPlayer {
  constructor(effects,update,{frame=callback=>requestAnimationFrame(callback),cancel=handle=>cancelAnimationFrame(handle),now=()=>performance.now(),onStateChange=()=>{}}={}) {
    this.onStateChange=onStateChange;this.effects=effects;this.update=update;this.frame=frame;this.cancel=cancel;this.now=now;this.cursor=0;this.running=false;this.handle=null;
    this.values=new Map([...initialAnimationVisibility(effects)].map(([id,visible])=>[id,visible?1:0]));this.update(this.values);
    this.onStateChange(this.state);
    if(effects.length&&effects[0].trigger!=='click')this.next();
  }
  get state(){return {total:this.effects.length,remaining:this.effects.length-this.cursor,running:this.running,started:this.cursor>0,finished:!this.running&&this.cursor>=this.effects.length};}
  next() {
    if(this.running)return true;if(this.cursor>=this.effects.length)return false;
    const batch=animationBatch(this.effects,this.cursor);this.cursor=batch.next;this.running=true;const started=this.now();this.onStateChange(this.state);
    const tick=()=>{const elapsed=this.now()-started;
      for(const step of batch.steps){if(elapsed<step.start)continue;const progress=Math.min(1,(elapsed-step.start)/EFFECT_DURATION);for(const id of step.targets)this.values.set(id,step.effect==='appear'?progress:1-progress);}
      this.update(this.values);if(elapsed<batch.duration)this.handle=this.frame(tick);else {this.running=false;this.handle=null;this.onStateChange(this.state);}
    };tick();return true;
  }
  stop(){if(this.handle!==null)this.cancel(this.handle);this.running=false;this.handle=null;this.onStateChange(this.state);}
}

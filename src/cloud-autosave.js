// One serial write queue; captured context keeps late saves away from a new lesson.
export class CloudAutosave {
  constructor({save,onState=()=>{},onSaved=()=>{},delay=2000,setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id)}){
    Object.assign(this,{save,onState,onSaved,delay,setTimer,clearTimer});this.token=0;this.chain=Promise.resolve();this.timer=null;
  }
  context(id,baseline=null){
    this.clearTimer(this.timer);this.timer=null;this.token++;this.id=id;
    this.latest=null;this.saved=baseline?JSON.stringify(baseline):null;
  }
  request(document){
    if(!this.id)return;
    const json=JSON.stringify(document);this.latest={document:structuredClone(document),json};
    this.clearTimer(this.timer);this.timer=null;
    if(json===this.saved)return;
    this.onState('pending');this.timer=this.setTimer(()=>this.flush(),this.delay);
  }
  flush(){
    this.clearTimer(this.timer);this.timer=null;
    if(!this.id||!this.latest)return this.chain;
    const token=this.token,id=this.id,entry=this.latest;
    this.chain=this.chain.catch(()=>{}).then(async()=>{
      if(token!==this.token||entry.json===this.saved)return;
      this.onState('saving');
      try{
        await this.save(entry.document,id);
        if(token!==this.token)return;
        this.saved=entry.json;
        this.onSaved(entry.document,id);
        if(this.latest.json===this.saved)this.onState('saved');
        else this.onState('pending');
      }catch(error){if(token===this.token)this.onState('error',error);}
    });
    return this.chain;
  }
}

import {validRoomId,laserPoint} from './live-protocol.js';

// Same-device traffic never waits for a database acknowledgement. Cloud traffic
// uses the same messages, with separate feeds for content and pointer updates.
export class LiveLink {
  constructor({room,host=false,receive,onStatus=()=>{},channelFactory=name=>new BroadcastChannel(name)}){
    if(!validRoomId(room))throw new Error('Invalid presentation link.');
    this.room=room;this.host=host;this.receive=receive;this.onStatus=onStatus;this.id=crypto.randomUUID();this.cloud=null;this.latest={};this.seen=new Set();this.closed=false;
    this.channel=channelFactory('lesson-presenter-live-'+room);
    this.channel.onmessage=event=>this.accept(event.data);
    this.channel.postMessage(this.message('hello',{}));
  }
  message(type,value){return {room:this.room,id:crypto.randomUUID(),sender:this.id,host:this.host,type,value};}
  accept(message,fromCloud=false){
    if(this.closed||message?.room!==this.room||message.sender===this.id||!validRoomId(message.id)||this.seen.has(message.id))return;
    this.seen.add(message.id);if(this.seen.size>2000)this.seen.delete(this.seen.values().next().value);
    // A phone update arriving through Firebase must also reach the projector
    // connected locally to this presenter. Relays never write back to Firebase.
    if(fromCloud)this.channel.postMessage({...message,sender:this.id,host:this.host});
    if(message.type==='hello'){
      if(!this.host)return;
      for(const [type,value] of Object.entries(this.latest))this.channel.postMessage(this.message(type,value));
      return;
    }
    if(['document','state','end'].includes(message.type))this.latest[message.type]=message.value;
    if(message.type==='laser'){const point=laserPoint(message.value);if(!point)return;message={...message,value:{...point,at:message.value.at}};}
    this.receive(message.type,message.value,message);
  }
  send(type,value){
    if(this.closed)return;
    if(['document','state','end'].includes(type))this.latest[type]=structuredClone(value);
    const message=this.message(type,value);this.channel.postMessage(message);
    this.cloud?.send(message).catch(error=>this.onStatus('error',error));
    return message;
  }
  attach(cloud){if(this.closed){cloud.close();return;}this.cloud?.close();this.cloud=cloud;}
  close(){this.closed=true;this.cloud?.close();this.channel.close();}
}

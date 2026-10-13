import {ref,get,update,onValue,onChildAdded,onDisconnect,serverTimestamp} from 'firebase/database';
import {liveDatabase} from './cloud.js';
import {encodeIncremental,decodeIncremental,incrementalPatch} from './cloud-incremental.js';

export function watchLiveRooms(receive,error){
  const {db,user}=liveDatabase();
  return onValue(ref(db,'presentationRoomIndex/'+user.uid),snapshot=>receive(snapshot.val()||{}),error);
}
export async function connectLiveRoom({link,uid,create=false,document,state,onStatus}){
  const {db,user}=liveDatabase();
  if(uid&&uid!==user.uid)throw new Error('Sign in with the account that started this presentation.');
  const root=`presentationRooms/${user.uid}/${link.room}`,index=`presentationRoomIndex/${user.uid}/${link.room}`;
  let model=null,closed=false,latest=null,timer=null,encoding=false,network=true,hostOnline=true;
  const stops=[];
  const report=error=>onStatus('error',error);
  const connectionStatus=()=>onStatus(!network?'disconnected':hostOnline?'connected':'host-offline');
  if(create){
    model=await encodeIncremental(document,null,{compact:false});
    await update(ref(db),{[root+'/meta']:{title:document.lesson.title.slice(0,200),startedAt:serverTimestamp(),ended:false,hostOnline:true},[root+'/document']:model,[root+'/state']:JSON.stringify(state),[index]:{title:document.lesson.title.slice(0,200),startedAt:serverTimestamp(),ended:false,hostOnline:true}});
    await onDisconnect(ref(db,root+'/meta/hostOnline')).set(false);
  }else{
    const meta=(await get(ref(db,root+'/meta'))).val();
    if(!meta||meta.ended)throw new Error('This presentation has ended or the link is unavailable.');
  }
  function deliver(type,value){link.accept({room:link.room,id:crypto.randomUUID(),sender:'firebase',type,value},true);}
  stops.push(onValue(ref(db,root+'/document'),snapshot=>{
    try{const value=snapshot.val();if(!value)return;model=value;if(encoding||latest)return;deliver('document',decodeIncremental(value));}catch(error){report(error);}
  },report));
  if(!link.host)stops.push(onValue(ref(db,root+'/state'),snapshot=>{try{if(snapshot.exists())deliver('state',JSON.parse(snapshot.val()));}catch(error){report(error);}},report));
  stops.push(onValue(ref(db,root+'/lasers'),snapshot=>{
    const values=Object.values(snapshot.val()||{}).filter(v=>v.sender!==link.id).sort((a,b)=>b.value.at-a.value.at);
    if(values[0])deliver('laser',values[0].value);
  },report));
  let previousDrafts={};
  stops.push(onValue(ref(db,root+'/drafts'),snapshot=>{
    const drafts=snapshot.val()||{};
    for(const client of new Set([...Object.keys(previousDrafts),...Object.keys(drafts)])){
      if(client===link.id||previousDrafts[client]===drafts[client])continue;
      try{deliver('draft',drafts[client]?{...JSON.parse(drafts[client]),client}:{client,clear:true});}catch(error){report(error);}
    }previousDrafts=drafts;
  },report));
  stops.push(onValue(ref(db,root+'/meta'),snapshot=>{const meta=snapshot.val();if(meta?.ended)deliver('end',{});else if(meta){hostOnline=meta.hostOnline;connectionStatus();}},report));
  stops.push(onValue(ref(db,'.info/connected'),snapshot=>{
    network=snapshot.val()===true;connectionStatus();
    if(create&&network&&!closed){
      update(ref(db),{[root+'/meta/hostOnline']:true,[index+'/hostOnline']:true}).catch(report);
      onDisconnect(ref(db,root+'/meta/hostOnline')).set(false).catch(report);
      onDisconnect(ref(db,index+'/hostOnline')).set(false).catch(report);
    }
  },report));
  if(link.host)stops.push(onChildAdded(ref(db,root+'/commands'),snapshot=>{
    const message=snapshot.val();if(Date.now()-message.at<10000)link.accept(message,true);
    update(ref(db,root+'/commands'),{[snapshot.key]:null}).catch(report);
  },report));
  await onDisconnect(ref(db,root+'/lasers/'+link.id)).remove();
  await onDisconnect(ref(db,root+'/drafts/'+link.id)).remove();
  async function flush(){
    if(closed||encoding||!latest)return;
    encoding=true;const doc=latest;latest=null;let failed=false;
    try{
      const next=await encodeIncremental(doc,model,{compact:false}),patch=incrementalPatch(model,next);
      if(closed)return;
      model=next;
      if(Object.keys(patch).length){onStatus('syncing');await update(ref(db,root+'/document'),patch);connectionStatus();}
    }catch(error){failed=true;latest||=doc;report(error);}
    finally{
      encoding=false;timer=null;
      if(latest&&!closed&&!failed)timer=setTimeout(flush,35);
      else if(!closed&&!failed&&model){try{deliver('document',decodeIncremental(model));}catch(error){report(error);}}
    }
  }
  const online=()=>{if(latest)flush();};window.addEventListener('online',online);
  connectionStatus();
  return {uid:user.uid,
    async retry(){model=(await get(ref(db,root+'/document'))).val();latest=link.latest.document;await flush();},
    async send(message){
      if(closed)return;
      if(message.type==='document'){latest=structuredClone(message.value);if(!timer&&!encoding)timer=setTimeout(flush,35);return;}
      if(message.type==='state')await update(ref(db,root),{state:JSON.stringify(message.value)});
      if(message.type==='command')await update(ref(db,root+'/commands'),{[message.id]:{...message,at:Date.now()}});
      if(message.type==='laser')await update(ref(db,root+'/lasers'),{[link.id]:{sender:link.id,value:message.value}});
      if(message.type==='draft')await update(ref(db,root+'/drafts'),{[link.id]:message.value.clear?null:JSON.stringify(message.value)});
      if(message.type==='end')await update(ref(db),{[root+'/meta/ended']:true,[root+'/meta/hostOnline']:false,[index+'/ended']:true,[root+'/document']:null,[root+'/state']:null,[root+'/commands']:null,[root+'/drafts']:null,[root+'/lasers']:null});
    },
    close(){closed=true;clearTimeout(timer);stops.forEach(stop=>stop());window.removeEventListener('online',online);update(ref(db,root),{['lasers/'+link.id]:null,['drafts/'+link.id]:null}).catch(()=>{});}
  };
}

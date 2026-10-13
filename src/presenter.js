import {LiveLink} from './live-link.js';
import {slideState,normalizeState,presentationCommand,remoteStroke,validRoomId} from './live-protocol.js';
import {documentDigest} from './cloud-sync.js';
import {animationBatch} from './animations.js';
import {applyAnnotationCommand} from './live-annotations.js';
import {watchAccount} from './cloud.js';
import {OWNER_EMAIL} from './firebase-config.js';
import {connectLiveRoom,watchLiveRooms} from './live-cloud.js';
import './presenter.css';

export function setupPresenter(api){
  const params=new URLSearchParams(location.search),requested=params.get('room');
  let room=null,link=null,state=null,original=null,doc=null,digest=null,user=null,cloud=null,projector=null,applying=false,frame=null,stopRooms=null,connecting=false,generation=0;
  let host=false,dirty=false,hasDocument=false,nextAllowedAt=0;
  const panel=document.createElement('section');panel.className='presenter-panel';panel.hidden=true;
  panel.innerHTML=`<div class="presenter-heading"><div><strong>Presenter dashboard</strong><span data-status role="status">Local session</span></div><button type="button" data-end>End presentation</button></div>
    <div class="presenter-controls"><button type="button" data-action="previous" aria-label="Previous slide or hide answer">←</button><span data-slide></span><button type="button" data-action="next">Next →</button><button type="button" data-action="reveal">Reveal answer</button><button type="button" data-action="hide">Hide answers</button><button type="button" data-action="restart">Replay effects</button><button type="button" data-action="blank" aria-pressed="false">Blank screen</button><button type="button" data-projector>Projector window ↗</button><button type="button" data-remote>Phone remote</button><button type="button" data-links>Device links</button><button type="button" data-retry hidden>Retry device sync</button></div>
    <div class="presenter-links" hidden><p>Open a device link and sign in with the same owner account.</p><label>Presenter dashboard<input data-presenter-link readonly aria-label="Presenter dashboard link" /></label><label>Phone remote<input data-remote-link readonly aria-label="Phone remote link" /></label><button type="button" data-copy>Copy remote link</button></div>
    <div class="presenter-details"><p>Use the editing tools, slide list and teacher notes below. Changes apply to this live session; your saved lesson stays unchanged.</p><details><summary>Projector preview</summary><iframe title="Live projector preview" data-preview></iframe></details></div>`;
  (document.querySelector('.app-header')).after(panel);
  const lobby=document.createElement('section');lobby.className='presenter-lobby';
  lobby.innerHTML='<h3>Live presenter</h3><p>Present in a separate window, edit live, or join from another device.</p><label>Active presentation<select aria-label="Active presentation"><option value="">Choose a live session</option></select></label><button type="button" data-join>Join presenter</button><button type="button" data-join-remote>Use phone remote</button><p data-lobby-status>Sign in to find live presentations on your other devices.</p>';
  (document.querySelector('.studio-teaching')||document.querySelector('.teaching-sidebar')).append(lobby);
  const status=message=>{panel.querySelector('[data-status]').textContent=message;};
  function url(file){const result=new URL(file,location.href);result.searchParams.set('room',room);if(cloud?.uid||user?.uid)result.searchParams.set('uid',cloud?.uid||user.uid);return result;}
  function links(){
    if(!room)return;
    panel.querySelector('[data-presenter-link]').value=url('studio.html').href;
    panel.querySelector('[data-remote-link]').value=url('remote.html').href;
  }
  function showState(){
    if(!state||!doc)return;
    const visible=doc.lesson.pages.filter(page=>!page.hidden).length;
    const position=doc.lesson.pages.slice(0,state.index+1).filter(page=>!page.hidden).length;
    panel.querySelector('[data-slide]').textContent=`${position} / ${visible} · ${doc.lesson.pages[state.index]?.title||''}`;
    panel.querySelector('[data-action=blank]').setAttribute('aria-pressed',String(state.blank));
    panel.querySelector('[data-end]').textContent=host?'End presentation':'Leave presenter';
  }
  function onStatus(value,error){
    const messages={local:'Instant local connection · sign in for other devices',connecting:'Local projector ready · connecting other devices…',connected:'Live across devices',syncing:'Syncing live changes…',disconnected:'Device connection lost · local projector stays live','host-offline':'Presenter disconnected · waiting to reconnect'};
    panel.querySelector('[data-retry]').hidden=value!=='error';
    status(error?`Local projector active · device sync unavailable: ${error.message}`:messages[value]||value);
    links();
  }
  function accept(type,value){
    if(!room)return;
    if(type==='end'){end(false);return;}
    if(type==='command'){if(host)command(value);return;}
    if(type==='document'){
      try{
        if(host&&connecting&&dirty)return;
        api.validate(value);const nextDigest=documentDigest(value);
        const alreadyReady=hasDocument;
        hasDocument=true;
        if(nextDigest===digest&&alreadyReady)return;
        doc=structuredClone(value);digest=nextDigest;
        applying=true;api.load(doc,state?.index??api.index()).then(()=>{if(state)api.control(normalizeState(doc,state));applying=false;showState();}).catch(error=>{applying=false;api.status(error.message);});
      }catch(error){api.status(`Live change could not be loaded: ${error.message}`);}
    }
    if(type==='state'){
      state=value;
      if(doc&&hasDocument){state=normalizeState(doc,state);applying=true;api.control(state);applying=false;showState();}
    }
  }
  async function attach(){
    if(!room||!user||connecting||cloud)return;
    connecting=true;const captured=generation,currentLink=link;onStatus('connecting');
    try{
      const connected=await connectLiveRoom({link:currentLink,uid:params.get('uid')||user.uid,create:host,document:doc,state,onStatus:(value,error)=>{if(captured===generation)onStatus(value,error);}});
      if(captured!==generation){if(currentLink.host)await connected.send(currentLink.message('end',{}));connected.close();return;}
      cloud=connected;link.attach(connected);links();
      // Edits made while the initial cloud connection was opening are retained.
      if(dirty){link.send('document',doc);link.send('state',state);dirty=false;}
    }catch(error){if(captured===generation)onStatus('error',error);}
    finally{if(captured===generation)connecting=false;}
  }
  function begin(id,isHost){
    room=id;host=isHost;hasDocument=isHost;generation++;original=api.begin();
    doc=api.document();digest=documentDigest(doc);state=slideState(doc,api.index());
    nextAllowedAt=Date.now()+(state.cursor?animationBatch(doc.slides[state.index].lpAnimations).duration:0);
    link=new LiveLink({room,host,receive:accept,onStatus});
    panel.hidden=false;document.body.classList.add('presenter-active');api.status('Presenter ready. Edits are temporary for this presentation.');
    if(host){link.send('document',doc);link.send('state',state);}
    const preview=url('projector.html');preview.searchParams.set('preview','1');panel.querySelector('[data-preview]').src=preview.href;
    onStatus('local');showState();links();attach();
  }
  function openProjector(){
    if(projector&&!projector.closed){projector.focus();return;}
    projector=window.open(url('projector.html').href,'lesson-projector-'+room,'popup,width=1280,height=760');
    if(!projector)api.status('Allow pop-ups for this site, then choose Projector window.');
  }
  function start(){
    if(room){openProjector();return;}
    if(!api.document().lesson.pages.some(page=>!page.hidden)){api.status('Show at least one slide before presenting.');return;}
    // Open synchronously within the click, before any Firebase calls.
    begin(crypto.randomUUID(),true);openProjector();
  }
  async function end(broadcast=true){
    if(!room)return;
    if(host&&broadcast)link.send('end',{});
    generation++;cancelAnimationFrame(frame);frame=null;room=null;
    const previous=link;link=cloud=null;connecting=false;previous.close();
    panel.hidden=true;panel.querySelector('[data-preview]').removeAttribute('src');document.body.classList.remove('presenter-active');
    await api.restore(original);original=null;doc=state=null;
    const address=new URL(location.href);address.searchParams.delete('room');address.searchParams.delete('uid');history.replaceState(null,'',address);
    api.status(host?'Presentation ended. Your original lesson is restored.':'Left presenter. Your original workspace is restored.');
  }
  function publish(){
    frame=null;if(!room||applying||!hasDocument)return;
    const next=api.document(),nextDigest=documentDigest(next),index=api.index();
    if(nextDigest!==digest){doc=next;digest=nextDigest;link.send('document',doc);dirty=!cloud;}
    const nextState=index!==state.index?slideState(doc,index):normalizeState(doc,state);
    if(JSON.stringify(nextState)!==JSON.stringify(state)){state=nextState;if(host)link.send('state',state);else link.send('command',{action:'slide',index});}
    showState();
  }
  function changed(){if(room&&!applying&&!frame)frame=requestAnimationFrame(publish);}
  let commandQueue=Promise.resolve();
  function command(value){
    const session=room;
    commandQueue=commandQueue.then(()=>{if(room===session)return executeCommand(value);}).catch(error=>{applying=false;api.status(`Live command failed: ${error.message}`);});
    return commandQueue;
  }
  async function executeCommand(value){
    if(!room||!doc||!hasDocument)return;
    if(!applying)publish();
    if(!host){link.send('command',value);return;}
    if(value.action==='next'&&Date.now()<nextAllowedAt)return;
    if(value.action==='stroke'){
      const stroke=remoteStroke(value);if(!stroke||!doc.slides[value.index])return;
      const next=api.document();next.slides[value.index].objects.push(stroke);doc=next;digest=documentDigest(doc);
      applying=true;await api.load(doc,state.index);api.control(state);applying=false;link.send('document',doc);return;
    }
    if(value.action==='annotation'){
      const next=applyAnnotationCommand(api.document(),value);if(!next)return;
      doc=next;digest=documentDigest(doc);applying=true;
      await api.load(doc,state.index);api.control(state);applying=false;link.send('document',doc);return;
    }
    if(value.action==='clear'){
      const next=api.document();next.slides[state.index].objects=next.slides[state.index].objects.filter(object=>!object.lpLiveAnnotation);
      doc=next;digest=documentDigest(doc);applying=true;await api.load(doc,state.index);api.control(state);applying=false;link.send('document',doc);return;
    }
    const before=state;state=presentationCommand(doc,state,value);
    if(state.index!==before.index||value.action==='restart')nextAllowedAt=Date.now()+(state.cursor?animationBatch(doc.slides[state.index].lpAnimations).duration:0);
    else if(state.cursor>before.cursor)nextAllowedAt=Date.now()+animationBatch(doc.slides[state.index].lpAnimations,before.cursor).duration;
    applying=true;api.control(state);applying=false;link.send('state',state);showState();
  }
  panel.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(button)command({action:button.dataset.action});});
  panel.querySelector('[data-end]').addEventListener('click',()=>end());
  panel.querySelector('[data-projector]').addEventListener('click',openProjector);
  panel.querySelector('[data-remote]').addEventListener('click',()=>{const address=url('remote.html');if(matchMedia('(max-width:680px)').matches)location.href=address.href;else{panel.querySelector('.presenter-links').hidden=false;panel.querySelector('[data-remote-link]').focus();panel.querySelector('[data-remote-link]').select();}});
  panel.querySelector('[data-links]').addEventListener('click',()=>{const node=panel.querySelector('.presenter-links');node.hidden=!node.hidden;});
  panel.querySelector('[data-retry]').addEventListener('click',()=>{if(cloud)cloud.retry().catch(error=>onStatus('error',error));else attach();});
  panel.querySelector('[data-copy]').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(url('remote.html').href);api.status('Phone remote link copied.');}catch{panel.querySelector('[data-remote-link]').select();api.status('Select and copy the phone remote link.');}});
  function join(remote){const selected=lobby.querySelector('select').value;if(!selected||!user)return;const address=new URL(remote?'remote.html':'studio.html',location.href);address.searchParams.set('room',selected);address.searchParams.set('uid',user.uid);location.href=address.href;}
  lobby.querySelector('[data-join]').addEventListener('click',()=>join(false));lobby.querySelector('[data-join-remote]').addEventListener('click',()=>join(true));
  watchAccount(value=>{
    const previous=user?.uid;user=value?.email===OWNER_EMAIL&&value.emailVerified?value:null;
    stopRooms?.();stopRooms=null;
    if(previous&&previous!==user?.uid){cloud?.close();cloud=null;if(link)link.cloud=null;onStatus('local');}
    if(user){
      stopRooms=watchLiveRooms(rooms=>{
        const select=lobby.querySelector('select'),selected=select.value;select.replaceChildren(new Option('Choose a live session',''));
        Object.entries(rooms).filter(([,meta])=>!meta.ended&&meta.hostOnline).sort((a,b)=>b[1].startedAt-a[1].startedAt).forEach(([id,meta])=>select.append(new Option(meta.title||'Live presentation',id)));select.value=selected;
        lobby.querySelector('[data-lobby-status]').textContent='Choose a live session, or start one with Present.';
      },error=>{lobby.querySelector('[data-lobby-status]').textContent=`Live sessions unavailable: ${error.message}`;});attach();
    }
  });
  const online=()=>{if(room&&!cloud)attach();};window.addEventListener('online',online);
  document.addEventListener('studio:update',changed);
  document.addEventListener('keydown',event=>{
    if(!room||event.target.closest('input,textarea,[contenteditable]')||document.querySelector('dialog[open]'))return;
    if(event.key==='ArrowRight'||event.code==='Space'){event.preventDefault();event.stopImmediatePropagation();command({action:'next'});}
    if(event.key==='ArrowLeft'){event.preventDefault();event.stopImmediatePropagation();command({action:'previous'});}
  },true);
  // Joining suppresses regular autosave before asynchronous account callbacks.
  if(validRoomId(requested)){api.setLive(true);queueMicrotask(()=>begin(requested,false));}
  let draftTimer=null,latestDraft=null,lastDraft=0;
  function draft(value){
    if(!room)return;latestDraft=value;clearTimeout(draftTimer);
    const send=()=>{lastDraft=Date.now();link?.send('draft',latestDraft?{...latestDraft,client:link.id,at:Date.now()}:{client:link.id,clear:true});};
    if(!value||Date.now()-lastDraft>=33)send();else draftTimer=setTimeout(send,33-(Date.now()-lastDraft));
  }
  return {start,end,changed,command,draft,get active(){return !!room;}};
}

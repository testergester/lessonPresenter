import {watchAccount,openPresentationSession,watchPresentationSession,watchPresentationHistory,writePresentationPage,writePresentationDraft,finishPresentationSession} from './cloud.js';
import {OWNER_EMAIL} from './firebase-config.js';
import {presentationDigest,decodePresentationPages,PresentationWriter} from './presentation-session.js';

export function setupPresentationSync({editor,getBinding,currentDocument,setStatus}){
  const clientId=crypto.randomUUID();let userId=null,context=null,session=null,writer=null,stopHistory=null,stopSession=null,token=0;
  let draftTimer=null,lastDraft=0,latestDraft=null,history={},pendingPages={},sessionPages={},pageDigests={},reviewing=false;
  const section=document.createElement('section');section.className='presentation-session-review';
  section.innerHTML='<h3>Presentation annotations</h3><p data-status>Sign in and open a cloud lesson to sync presentation annotations.</p><label>Saved presentation <select aria-label="Saved presentation annotations"><option value="">Choose a presentation</option></select></label><button type="button" data-review>Show annotations</button><p class="helper">Drawings are a separate layer. They never change the saved lesson.</p>';
  (document.querySelector('.studio-teaching')||document.querySelector('.teaching-sidebar')).append(section);
  const select=section.querySelector('select'),review=section.querySelector('[data-review]');
  const preview=document.createElementNS('http://www.w3.org/2000/svg','svg');preview.setAttribute('viewBox','0 0 1280 720');preview.classList.add('presentation-live-drafts');preview.setAttribute('aria-hidden','true');editor.host.append(preview);
  function status(text){section.querySelector('[data-status]').textContent=text;document.dispatchEvent(new CustomEvent('presentation:status',{detail:{text}}));}
  const allowedBinding=()=>{const value=getBinding();return value?.uid===userId&&!value.deleted&&!value.creating?value:null;};
  function renderHistory(){
    const selected=select.value;select.replaceChildren(new Option('Choose a presentation',''));
    Object.entries(history).sort((a,b)=>b[1].startedAt-a[1].startedAt).forEach(([id,meta])=>select.append(new Option(`${new Date(meta.startedAt).toLocaleString()}${meta.endedAt?'':' · live'}`,id)));
    select.value=history[selected]?selected:session&&history[session.id]?session.id:'';
  }
  function renderDrafts(drafts={}){
    preview.replaceChildren();if(!document.body.classList.contains('audience-mode'))return;
    for(const [id,json] of Object.entries(drafts)){
      if(id===clientId)continue;
      try{
        const draft=JSON.parse(json);if(draft.index!==editor.index||!Array.isArray(draft.points)||draft.points.length>300||!/^#[a-f0-9]{6}$/i.test(draft.color)||!Number.isFinite(draft.width))continue;
        const points=draft.points.filter(point=>Array.isArray(point)&&point.length===2&&point.every(Number.isFinite));
        const line=document.createElementNS(preview.namespaceURI,'polyline');line.setAttribute('points',points.map(p=>p.join(',')).join(' '));line.setAttribute('fill','none');line.setAttribute('stroke',draft.color);line.setAttribute('stroke-width',String(Math.max(1,Math.min(30,draft.width))));line.setAttribute('stroke-linecap','round');line.setAttribute('stroke-linejoin','round');preview.append(line);
      }catch{}
    }
  }
  let remoteDrafts={};
  function listen(value){
    stopSession?.();session=value;pageDigests={};const captured=token;
    stopSession=watchPresentationSession(value,data=>{
      if(captured!==token)return;
      const remotePages=decodePresentationPages(data.pages),pages=writer?writer.receive(remotePages):remotePages;
      sessionPages=pages;remoteDrafts=data.drafts||{};renderDrafts(remoteDrafts);
      // SDK local echoes already match the canvas. Remote deltas are applied
      // only to the overlay and never load or autosave the lesson document.
      for(const index of new Set([...Object.keys(pageDigests),...Object.keys(pages)])){
        const objects=pages[index]||[],json=JSON.stringify(objects);
        if(pageDigests[index]===json)continue;pageDigests[index]=json;
        const local=JSON.stringify(editor.presentationPages?.[index]||[]);
        if(local!==json)editor.receivePresentationPage(Number(index),objects).catch(error=>status(error.message));
      }
    },error=>status(`Annotations not synced: ${error.message}`));
  }
  function refreshContext(){
    const value=allowedBinding(),key=value?`${value.uid}/${value.id}`:null;if(key===context)return;
    context=key;token++;stopHistory?.();stopSession?.();stopHistory=stopSession=null;session=writer=null;history={};reviewing=false;pendingPages={};renderHistory();
    if(value)stopHistory=watchPresentationHistory(value.id,data=>{history=data;renderHistory();},error=>status(`Annotations not synced: ${error.message}`));
    if(value&&document.body.classList.contains('audience-mode'))enter();
  }
  async function enter(){
    reviewing=false;review.textContent='Show annotations';pendingPages={};sessionPages={};
    const captured=++token;stopSession?.();stopSession=null;session=writer=null;
    const value=allowedBinding();
    if(!value){status('Annotations stay on this device. Sign in and open a saved cloud lesson for live sync.');return;}
    status('Connecting presentation annotations…');
    try{
      const opened=await openPresentationSession(value.id,{baseDigest:presentationDigest(currentDocument()),title:currentDocument().lesson.title,pageCount:editor.slides.length,clientId});
      if(captured!==token){await finishPresentationSession(opened,clientId);return;}
      session=opened;writer=new PresentationWriter({write:(index,patch)=>writePresentationPage(opened,index,patch),onState:(state,error)=>status(state==='error'?`Annotations not synced: ${error.message}`:state==='syncing'?'Syncing annotations…':'Annotations synced live · saved lesson unchanged')});
      listen(opened);status('Annotations connected live · saved lesson unchanged');
      for(const [index,objects] of Object.entries(pendingPages))writer.change(Number(index),objects).catch(()=>{});
      pendingPages={};
    }catch(error){status(`Annotations not synced: ${error.message}`);}
  }
  function change(index,objects){
    if(!document.body.classList.contains('audience-mode'))return;
    if(writer)writer.change(index,objects).catch(()=>{});else pendingPages[index]=structuredClone(objects);
  }
  function sendDraft(draft){
    if(!session||!document.body.classList.contains('audience-mode'))return;
    const value=session;lastDraft=Date.now();writePresentationDraft(value,clientId,draft).catch(error=>status(`Live pen preview unavailable: ${error.message}`));
  }
  function draft(value){
    latestDraft=value;clearTimeout(draftTimer);
    if(!value||Date.now()-lastDraft>=50)sendDraft(value);
    else draftTimer=setTimeout(()=>sendDraft(latestDraft),50-(Date.now()-lastDraft));
  }
  function leave(){
    clearTimeout(draftTimer);preview.replaceChildren();editor.capturePresentation();sessionPages=structuredClone(editor.presentationPages||{});
    token++;stopSession?.();stopSession=null;const finished=session;writer=null;
    if(finished)finishPresentationSession(finished,clientId).catch(error=>status(`Presentation could not be marked finished: ${error.message}`));
    editor.presentationActive=false;editor.showPresentationAnnotations(false);reviewing=false;review.textContent='Show annotations';status(finished?'Presentation saved separately. Choose it below to show or hide annotations.':'Presentation annotations kept on this device.');
  }
  review.addEventListener('click',async()=>{
    if(document.body.classList.contains('audience-mode')){setStatus('Finish presenting before reviewing annotations.');return;}
    if(reviewing){await editor.showPresentationAnnotations(false);reviewing=false;review.textContent='Show annotations';return;}
    const id=select.value,value=allowedBinding();
    if(id&&value){
      if(history[id]?.baseDigest!==presentationDigest(currentDocument())){status('This presentation belongs to a different lesson version. Open that version to review its annotations.');return;}
      token++;await editor.setPresentationSession({},false,true);listen({id,lessonId:value.id,uid:value.uid});
    }else if(Object.keys(sessionPages).length)await editor.setPresentationSession(sessionPages,false,true);
    else{status('No presentation selected.');return;}
    reviewing=true;review.textContent='Hide annotations';
  });
  select.addEventListener('change',()=>{token++;stopSession?.();stopSession=null;reviewing=false;review.textContent='Show annotations';editor.showPresentationAnnotations(false);});
  watchAccount(user=>{userId=user?.email===OWNER_EMAIL&&user.emailVerified?user.uid:null;refreshContext();});
  document.addEventListener('lesson:snapshot',refreshContext);
  document.addEventListener('presentation:mode',event=>{if(event.detail.presenting)enter();else if(editor.presentationActive)leave();});
  return {enter,leave,change,draft,slideReady:()=>renderDrafts(remoteDrafts)};
}

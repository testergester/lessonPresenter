import {watchAccount,login,logout,saveCloudLesson,deleteCloudLesson,listCloudLessons,getCloudLesson,getCloudLessonRevision,watchCloudLesson,watchCloudIndex,watchConnection} from './cloud.js';
import {OWNER_EMAIL} from './firebase-config.js';
import {CloudAutosave} from './cloud-autosave.js';
import {documentDigest,remoteDecision} from './cloud-sync.js';
import {diagnostics} from './diagnostics.js';
import {cloudStatusState} from './cloud-status.js';
export function setupCloudUI({currentDocument,load,setStatus,getBinding,setBinding,clearLocal}){
  const $=id=>document.getElementById(id);
  let userId=null,key=null,stopLesson=null,stopIndex=null,ready=false,applying=false,conflict=null;
  let deletingId=null,connected=null,hasConnected=false,browserOffline=typeof navigator!=='undefined'&&!navigator.onLine;
  let measurements={saves:0,whole:0,patch:0,initial:0};
  let baseline=null,remoteBaseline=null,sequence=0,remoteChain=Promise.resolve();
  const inFlight=new Set();
  const log=(event,details={})=>diagnostics.log(event,{lessonId:binding()?.id,...details});
  const status=text=>{
    if(userId&&(browserOffline||connected===false&&hasConnected))text='Cloud: disconnected — edits stay on this device';
    $('cloudStatus').textContent=text;$('cloudSaveIndicator').textContent=text;
    $('cloudSaveIndicator').dataset.state=cloudStatusState(text);
  };
  function binding(){const value=getBinding();if(!userId||value?.uid!==userId||value.deleted)return null;if(value.backend!=='incremental'){const normalized={...value,backend:'incremental'};setBinding(normalized,false);return normalized;}return value;}
  const bindingKey=value=>value?`${value.uid}/${'incremental'}/${value.id}`:null;
  const size=bytes=>bytes>=1000000?`${(bytes/1000000).toFixed(2)} MB`:bytes>=1000?`${(bytes/1000).toFixed(1)} KB`:`${bytes} B`;
  function metrics(value){
    log('sync-payload',{phase:value.backend,bytes:value.patchBytes??value.wholeBytes});
    if(value.kind==='receive'){
      const amount=value.downloadBytes??value.patchBytes;
      if(value.initial)measurements.initial+=amount;
      const label={cached:'Opened from this device’s cache',changes:'Downloaded changed fields',full:'Downloaded lesson'}[value.mode]||'Received update';
      $('cloudSyncComparison').textContent=`${label} · revision ${value.revision||getCloudLessonRevision(binding()?.id)||'—'} · ${size(amount)} of database data. Connection overhead is additional.`;
      return;
    }else if(value.initial){measurements.initial+=value.patchBytes??value.wholeBytes;}
    else{
      measurements.saves++;measurements.whole+=value.wholeBytes;measurements.patch+=value.patchBytes;
      $('cloudSyncComparison').textContent=`Last edit: ${size(value.patchBytes)} incremental payload vs ${size(value.wholeBytes)} whole lesson (${value.reduction}% smaller). ${measurements.saves} edits compared: ${size(measurements.patch)} vs ${size(measurements.whole)}. Initial transfers: ${size(measurements.initial)}.`;
    }
    if(value.initial)$('cloudSyncComparison').textContent=`Initial transfer: ${size(measurements.initial)}. Edit a text, shape or note to compare update sizes.`;
  }
  function showIdentity(){
    const deleted=userId&&getBinding()?.uid===userId&&getBinding()?.deleted;
    $('cloudLessonId').textContent=deleted?'Previous cloud lesson deleted · this workspace is not linked to a cloud lesson':binding()?`Lesson ID: ${binding().id}${binding().revision?' · Revision '+binding().revision:''}`:'Open the same cloud lesson in both browsers to see live updates.';
    $('cloudSaveBtn').textContent=deleted?'Save as a new cloud lesson':'Save current lesson to cloud';
    if(deleted){status('Cloud: autosave paused — previous lesson deleted. Save as a new cloud lesson to sync this workspace.');$('cloudAccount').textContent='Signed in. This workspace has no active cloud lesson; autosave is paused.';}
  }
  function storeBaseline(doc,remote=doc){
    baseline=documentDigest(doc);remoteBaseline=documentDigest(remote);
    const value=binding();if(value)setBinding({...value,revision:getCloudLessonRevision(value.id),savedDigest:baseline,remoteDigest:remoteBaseline});showIdentity();
  }
  const autosave=new CloudAutosave({
    save:async(doc,id)=>{
      const digest=documentDigest(doc);inFlight.add(digest);
      log('upload-start',{lessonId:id,bytes:new TextEncoder().encode(JSON.stringify(doc)).length});
      const value=binding();
      try{await saveCloudLesson(doc,id,{create:value?.id===id&&value?.creating===true,onMetrics:report=>{if(binding()?.id===id)metrics(report);}});log('upload-acknowledged',{lessonId:id});}
      catch(error){log('upload-failed',{lessonId:id,code:error.code,message:error.message});throw error;}
      finally{inFlight.delete(digest);}
    },
    onSaved:doc=>{const value=binding();if(value)setBinding({...value,creating:false},false);storeBaseline(doc);},
    onState:(state,error)=>{
      log('autosave-state',{phase:state,code:error?.code,message:error?.message});
      if(conflict)return;
      status({pending:'Cloud: changes pending…',saving:'Cloud: saving…',saved:'Cloud: saved · live updates on',error:`Cloud: not saved — ${error?.message||'try again'}`}[state]);
    }
  });
  async function action(task){try{await task();}catch(error){log('cloud-error',{code:error.code,message:error.message,stack:error.stack});status(`Cloud: ${error.message}`);}}
  function clearConflict(){conflict=null;$('cloudConflict').hidden=true;}
  function start(value,doc=null){
    stopLesson?.();stopLesson=null;sequence++;key=bindingKey(value);ready=false;clearConflict();
    measurements={saves:0,whole:0,patch:0,initial:0};$('cloudSyncComparison').textContent='Only changed fields sync. Embedded images are uploaded once.';
    baseline=value?.savedDigest||(doc?documentDigest(doc):null);remoteBaseline=value?.remoteDigest||baseline;
    autosave.context(value?.id||null,doc);showIdentity();
    if(!value)return;
    const token=sequence;log('listener-start');
    stopLesson=watchCloudLesson(value.id,remote=>{
      if(token!==sequence)return;
      remoteChain=remoteChain.catch(()=>{}).then(()=>{if(token===sequence)return receive(remote,token);}).catch(error=>{log('receive-failed',{message:error.message,stack:error.stack});status(`Cloud: could not apply update — ${error.message}`);});
    },error=>{if(token!==sequence)return;ready=false;log('listener-error',{code:error.code,message:error.message});status(`Cloud: live connection failed — ${error.message}`);},{onMetrics:report=>{if(token===sequence)metrics(report);}});
  }
  async function applyRemote(doc,token){
    log('remote-apply-start');applying=true;
    try{
      await load(doc,{remote:true});if(token!==sequence)return;
      const normalized=currentDocument();autosave.context(binding().id,normalized);storeBaseline(normalized,doc);clearConflict();ready=true;
      status('Cloud: updated from another browser');log('remote-applied');setStatus('Lesson updated from the cloud.');
    }finally{applying=false;}
  }
  async function receive(doc,token){
    log('remote-received',{phase:doc?'document':'missing'});
    if(!doc){
      if(baseline||!binding()?.creating){
        const value=binding();ready=false;stopLesson?.();stopLesson=null;sequence++;autosave.context(null);clearConflict();
        if(value){setBinding({...value,creating:false,deleted:true},false);await clearLocal(value.id,value.uid);}showIdentity();
        status('Lesson deleted from the cloud and this device.');log('remote-missing');return;
      }
      ready=true;changed(currentDocument());return;
    }
    const current=currentDocument(),incoming=documentDigest(doc);
    const decision=remoteDecision(doc,{current,baseline,remoteBaseline,inFlight:[...inFlight]});
    log('remote-decision',{phase:decision});
    if(decision==='echo'){
      ready=true;
      if(!inFlight.has(incoming)){autosave.context(binding().id,current);storeBaseline(current,doc);status('Cloud: saved · live updates on');}
      return;
    }
    if(decision==='unchanged'){ready=true;if(!conflict){status('Cloud: connected · checking local changes');changed(current);}return;}
    if(decision==='apply'){await applyRemote(doc,token);return;}
    // Preserve local edits and stop pending writes until the user picks a version.
    conflict=doc;ready=false;autosave.context(null);$('cloudConflict').hidden=false;
    status('Cloud: edits in both browsers — choose which version to keep in Cloud lessons');log('sync-conflict');
  }
  function changed(doc,{force=false}={}){
    if(applying||deletingId||!userId||!doc?.lesson.pages.length)return;
    if(getBinding()?.uid===userId&&getBinding()?.deleted){showIdentity();return;}
    let value=binding();
    const blank=!value&&doc.lesson.title==='Untitled lesson'&&doc.lesson.pages.length===1&&doc.lesson.pages[0].title==='Untitled slide'&&!doc.lesson.pages[0].questions.length&&!doc.lesson.pages[0].aim&&!doc.lesson.pages[0].teacherNotes?.length&&doc.slides?.length===1&&!doc.slides[0].objects.length;
    if(blank&&!force){status('Cloud: connected · open a lesson or start editing');return;}
    if(!value){value={uid:userId,id:crypto.randomUUID(),creating:true,backend:'incremental'};setBinding(value,false);start(value);setBinding(value);}
    else if(key!==bindingKey(value))start(value);
    showIdentity();
    if(!ready||conflict)return;
    autosave.request(doc);
  }
  async function openCloudLesson(lesson){
    const owner=userId,doc=await getCloudLesson(lesson.id);if(owner!==userId)return;
    log('lesson-open',{lessonId:lesson.id});applying=true;
    try{
      const value={uid:userId,id:lesson.id,backend:'incremental',savedDigest:documentDigest(doc),remoteDigest:documentDigest(doc)};
      stopLesson?.();stopLesson=null;sequence++;ready=false;autosave.context(null);clearConflict();setBinding(value,false);
      await load(doc);if(binding()?.id!==lesson.id)return;
      const normalized=currentDocument();storeBaseline(normalized,doc);start(binding(),normalized);ready=true;status('Cloud: saved · live updates on');
    }finally{applying=false;}
  }
  function renderLessons(lessons,target='cloudLessons'){
    $(target).replaceChildren();
    for(const lesson of lessons){
      const row=document.createElement('div');row.className='cloud-lesson-row';
      const button=document.createElement('button');button.className='button secondary cloud-lesson-open';
      button.textContent=`${lesson.title||'Untitled lesson'} · ${lesson.id.slice(0,8)}`;button.dataset.cloudLessonId=lesson.id;
      button.addEventListener('click',()=>action(()=>openCloudLesson(lesson)));
      const remove=document.createElement('button');remove.type='button';remove.className='button secondary cloud-lesson-delete';remove.textContent='Delete';remove.setAttribute('aria-label',`Delete cloud lesson: ${lesson.title||'Untitled lesson'}`);remove.disabled=!!deletingId;
      remove.addEventListener('click',()=>action(async()=>{
        if(deletingId||!window.confirm(`Delete “${lesson.title||'Untitled lesson'}” from the cloud and this device? This deletes its browser autosave and cannot be undone.`))return;
        const owner=userId,active=binding()?.id===lesson.id,previous=binding();deletingId=lesson.id;remove.disabled=true;let deletedRemotely=false;
        if(active){stopLesson?.();stopLesson=null;sequence++;ready=false;autosave.context(null);clearConflict();setBinding({...previous,deleted:true},false);}
        status('Cloud: deleting lesson…');
        try{
          // Wait for any write already sent before removing both database entries.
          await autosave.chain;if(owner!==userId)return;
          await deleteCloudLesson(lesson.id);deletedRemotely=true;
          if(owner!==userId)return;
          if(active&&getBinding()?.id===lesson.id)setBinding({...previous,creating:false,deleted:true},false);
          await clearLocal(lesson.id,owner);showIdentity();
          status('Lesson deleted from the cloud and this device.');log('lesson-deleted',{lessonId:lesson.id});
        }catch(error){if(!deletedRemotely&&active&&owner===userId&&getBinding()?.id===lesson.id){setBinding(previous,false);start(previous,currentDocument());}throw error;}
        finally{deletingId=null;remove.disabled=false;if(owner===userId)changed(currentDocument());}
        await refresh();
      }));row.append(button,remove);$(target).append(row);
    }
  }
  async function refresh(){const owner=userId,lessons=await listCloudLessons();if(owner===userId)renderLessons(lessons);}
  watchAccount(user=>{
    stopIndex?.();stopIndex=null;const allowed=user?.email===OWNER_EMAIL&&user.emailVerified;userId=allowed?user.uid:null;start(binding());
    log('auth-state',{phase:allowed?'owner-signed-in':'signed-out'});
    $('cloudAccount').textContent=allowed?`Signed in as ${user.email}. Autosave and live updates are on.`:'Sign in with your project owner account.';
    $('cloudSignInBtn').hidden=!!user;$('cloudSignOutBtn').hidden=!user;$('cloudSaveBtn').disabled=!allowed;$('cloudRefreshBtn').disabled=!allowed;
    status(allowed?'Cloud: connecting…':'Cloud: sign in to sync');
    if(allowed){stopIndex=watchCloudIndex(renderLessons,error=>{log('index-error',{code:error.code,message:error.message});status(`Cloud: could not load lessons — ${error.message}`);});changed(currentDocument());}
    else{$('cloudLessons').replaceChildren();}
  });
  watchConnection(value=>{const reconnect=connected===false;connected=value;hasConnected ||=value;log('database-connection',{connected});if(!userId)return;if(getBinding()?.deleted){showIdentity();return;}if(!connected)status(hasConnected?'Cloud: disconnected — waiting to reconnect':'Cloud: connecting…');else if(!binding())status('Cloud: connected · choose a lesson or save this workspace');else if(reconnect){status('Cloud: connecting…');if(ready&&!conflict){changed(currentDocument());if(documentDigest(currentDocument())===baseline)status('Cloud: saved · live updates on');}}});
  $('cloudSignInBtn').addEventListener('click',()=>action(login));$('cloudSignOutBtn').addEventListener('click',()=>action(logout));
  $('cloudSaveBtn').addEventListener('click',()=>action(async()=>{if(deletingId)return;if(conflict){status('Choose a version before saving.');return;}if(getBinding()?.uid===userId&&getBinding()?.deleted)setBinding(null,false);changed(currentDocument(),{force:true});await autosave.flush();await refresh();}));
  $('cloudRefreshBtn').addEventListener('click',()=>action(refresh));
  $('cloudResetComparisonBtn').addEventListener('click',()=>{measurements={saves:0,whole:0,patch:0,initial:0};$('cloudSyncComparison').textContent='Comparison reset. Edit this lesson to collect new measurements.';});
  $('cloudUseRemoteBtn').addEventListener('click',()=>action(async()=>{if(conflict)await applyRemote(conflict,sequence);}));
  $('cloudKeepLocalBtn').addEventListener('click',()=>{
    if(!conflict)return;
    remoteBaseline=documentDigest(conflict);clearConflict();ready=true;autosave.context(binding().id);log('conflict-keep-local');changed(currentDocument());
  });
  document.addEventListener('lesson:snapshot',event=>{log('local-snapshot');changed(event.detail);});
  window.addEventListener('online',()=>{browserOffline=false;log('browser-network',{online:true});if(userId)changed(currentDocument());});
  window.addEventListener('offline',()=>{browserOffline=true;log('browser-network',{online:false});if(userId)status('Cloud: offline — edits stay on this device');});
}

import {SlideEditor} from './src/editor.js';
import {validateDocument} from './src/document.js';
import {initialAnimationVisibility} from './src/animations.js';
import {LiveLink} from './src/live-link.js';
import {normalizeState,validRoomId} from './src/live-protocol.js';
import {connectLiveRoom} from './src/live-cloud.js';
import {watchAccount,login} from './src/cloud.js';
import {OWNER_EMAIL} from './src/firebase-config.js';
import {installProjectorTools} from './src/projector-tools.js';
import {annotationCommand,applyAnnotationCommand} from './src/live-annotations.js';
import './styles.css';
import './src/presenter.css';

const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),room=params.get('room');
if(params.has('preview'))document.body.classList.add('projector-preview');
if(params.has('monitor'))document.body.classList.add('projector-monitor');
let doc=null,state=null,rendering=false,needsRender=false,sceneKey=null,lastCursor=0,lastEpoch=0,ended=false,cloud=null,local=false,laserTimer=null;
const drafts=new Map();
function renderDrafts(){
  const overlay=$('projectorDrafts'),bounds=$('projectorStage').getBoundingClientRect();overlay.replaceChildren();
  Object.assign(overlay.style,{left:bounds.left+'px',top:bounds.top+'px',width:bounds.width+'px',height:bounds.height+'px'});
  for(const [id,draft] of drafts){
    if(Date.now()-draft.at>2000){drafts.delete(id);continue;}
    if(draft.index!==state?.index)continue;
    const line=document.createElementNS(overlay.namespaceURI,'polyline');line.setAttribute('points',draft.points.map(point=>point.join(',')).join(' '));line.setAttribute('fill','none');line.setAttribute('stroke',draft.color);line.setAttribute('stroke-width',String(draft.width));line.setAttribute('stroke-linecap','round');line.setAttribute('stroke-linejoin','round');overlay.append(line);
  }
}
function receiveDraft(value){
  if(!validRoomId(value?.client))return;
  if(value.clear){drafts.delete(value.client);renderDrafts();return;}
  if(!Array.isArray(value.points)||value.points.length>1000||value.points.some(point=>!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite))||!/^#[a-f0-9]{6}$/i.test(value.color)||!Number.isFinite(value.width)||value.width<1||value.width>30||!Number.isFinite(value.at))return;
  drafts.set(value.client,value);renderDrafts();
}
const draftExpiry=setInterval(renderDrafts,750);
let draftTimer=null,lastDraft=0,laserSendTimer=null,lastLaserSend=0,drawingGesture=false;
const ownedMarks=new Map(),interactive=!params.has('preview')&&!params.has('monitor')&&!params.has('inkOverlay');
const tools=interactive?installProjectorTools({onMode:mode=>{editor.setMode({readonly:true,drawing:mode==='pen'});if(mode!=='laser')sendLaser(null);},onCommand:command=>{
  if(!doc||!state||ended)return;
  link?.send('command',command);
  if(command.action==='clear'){doc=structuredClone(doc);doc.slides[state.index].objects=doc.slides[state.index].objects.filter(object=>!object.lpLiveAnnotation);render();}
},onUndo:()=>{
  const ids=ownedMarks.get(state?.index)||[];
  while(ids.length){const id=ids.pop();if(doc.slides[state.index].objects.some(object=>object.lpId===id&&object.lpLiveAnnotation)){editAnnotation(annotationCommand('delete',state.index,id));break;}}
  syncTools();
},onFullscreen:()=>$('projectorFullscreen').click()}):null;
function syncTools(){tools?.update({ready:!!doc&&!!state&&!ended,undo:(ownedMarks.get(state?.index)||[]).some(id=>doc?.slides[state.index]?.objects.some(object=>object.lpId===id&&object.lpLiveAnnotation))});}
function editAnnotation(command){
  const next=applyAnnotationCommand(doc,command);if(!next){tools?.status('This mark could not be synced. Try a shorter drawing.');return;}
  doc=next;link?.send('command',command);render();syncTools();
}
function sendDraft(value){
  clearTimeout(draftTimer);if(!interactive||!link||ended)return;
  const send=()=>{lastDraft=Date.now();link.send('draft',value?{...value,client:link.id,at:Date.now()}:{client:link.id,clear:true});};
  if(!value||Date.now()-lastDraft>=33)send();else draftTimer=setTimeout(send,33-(Date.now()-lastDraft));
}
function sendLaser(event){
  clearTimeout(laserSendTimer);if(!interactive||!link||ended)return;
  const bounds=$('projectorStage').getBoundingClientRect(),value=event?{x:Math.max(0,Math.min(1,(event.clientX-bounds.left)/bounds.width)),y:Math.max(0,Math.min(1,(event.clientY-bounds.top)/bounds.height)),visible:true,at:Date.now()}:{x:0,y:0,visible:false,at:Date.now()};
  pointer(value);
  const send=()=>{lastLaserSend=Date.now();link.send('laser',value);};
  if(!event||Date.now()-lastLaserSend>=33)send();else laserSendTimer=setTimeout(send,33-(Date.now()-lastLaserSend));
}
const editor=new SlideEditor($('projectorStage'),{onChange:()=>{},onSelection:()=>{},onHistory:()=>{},onError:error=>{$('projectorStatus').textContent=error;},onPlayback:()=>{},onPresentationDraft:sendDraft});
editor.liveSession=interactive;
editor.canvas.on('mouse:down',()=>{drawingGesture=interactive&&editor.drawing;});
editor.canvas.on('mouse:up',()=>{drawingGesture=false;if(needsRender){needsRender=false;render();}});
editor.canvas.on('path:created',({path})=>{
  if(!interactive||!doc||!state||ended||tools.mode!=='pen')return;
  const index=editor.index;
  path.lpAnnotationKind='pen';const command=annotationCommand('create',index,path.toObject(['lpId','lpAnnotation','lpLiveAnnotation','lpAnnotationKind']));
  if(!applyAnnotationCommand(doc,command)){editor.canvas.remove(path);tools.status('This mark could not be synced. Try a shorter drawing.');return;}
  const ids=ownedMarks.get(index)||[];ids.push(path.lpId);ownedMarks.set(index,ids);editAnnotation(command);
});
editor.setMode({readonly:true});
function restoreCursor(cursor){
  const player=editor.player;if(!player)return;
  player.stop();player.cursor=cursor;
  player.values=new Map([...initialAnimationVisibility(editor.animations)].map(([id,visible])=>[id,visible?1:0]));
  for(const effect of editor.animations.slice(0,cursor))for(const id of effect.targets)player.values.set(id,effect.effect==='appear'?1:0);
  editor.animationValues=player.values;editor.applyVisibility();editor.syncMedia();
}
async function render(){
  if(rendering||drawingGesture){needsRender=true;return;}if(!doc||!state||ended)return;
  rendering=true;
  try{
    const control=normalizeState(doc,state),current=params.has('inkOverlay')?{...doc,slides:doc.slides.map(slide=>({...slide,objects:slide.objects.filter(object=>!object.lpLiveAnnotation)}))}:doc;
    const scene=JSON.stringify(current.slides[control.index]),changed=sceneKey!==scene||editor.index!==control.index||lastEpoch!==control.epoch;
    $('projectorBlank').hidden=params.has('monitor')||!control.blank;
    if(changed){
      editor.setLesson(current.slides);await editor.show(control.index,control.reveal);sceneKey=scene;
      // Keep automatic opening effects playing; late joiners receive the final
      // visibility of effects that have already been advanced by the presenter.
      if(control.cursor!==editor.player?.cursor)restoreCursor(control.cursor);
    }else{
      editor.setReveal(control.reveal);
      if(control.cursor>lastCursor&&editor.player?.cursor===lastCursor)editor.nextAnimation();
      else if(control.cursor!==editor.player?.cursor)restoreCursor(control.cursor);
    }
    lastCursor=control.cursor;lastEpoch=control.epoch;$('projectorWelcome').hidden=true;editor.resize();renderDrafts();syncTools();
  }catch(error){$('projectorWelcome').hidden=false;$('projectorStatus').textContent=`Slide unavailable: ${error.message}`;}
  finally{rendering=false;if(needsRender){needsRender=false;render();}}
}
function pointer(value){
  clearTimeout(laserTimer);const dot=$('projectorLaser');
  if(!value.visible||Date.now()-value.at>5000||ended){dot.hidden=true;return;}
  const bounds=$('projectorStage').getBoundingClientRect();dot.style.left=(bounds.left+value.x*bounds.width)+'px';dot.style.top=(bounds.top+value.y*bounds.height)+'px';dot.hidden=false;
  laserTimer=setTimeout(()=>{dot.hidden=true;},2000);
}
function receive(type,value,message){
  if(message.sender!=='firebase'&&message.host===true){local=true;if(cloud){cloud.close();cloud=null;}}
  if(type==='document'){try{validateDocument(value);doc=value;render();}catch(error){$('projectorStatus').textContent=error.message;}}
  if(type==='state'){state=value;render();}
  if(type==='laser')pointer(value);
  if(type==='draft')receiveDraft(value);
  if(type==='end'){ended=true;editor.stopAnimations();$('projectorBlank').hidden=false;$('projectorLaser').hidden=true;$('projectorWelcome').hidden=false;$('projectorStatus').textContent='Presentation ended.';syncTools();}
}
let link;
if(validRoomId(room)){
  link=new LiveLink({room,receive,onStatus:(_value,error)=>{if(error){$('projectorConnection').textContent=`Live change not synced: ${error.message}`;tools?.status(`Live change not synced: ${error.message}`);}}});
  watchAccount(user=>{
    $('projectorSignIn').hidden=local||!!user;
    if(user?.email===OWNER_EMAIL&&user.emailVerified)setTimeout(async()=>{
      if(local||cloud||ended)return;
      try{const result=await connectLiveRoom({link,uid:params.get('uid'),onStatus:(status,error)=>{$('projectorConnection').textContent=error?`Connection: ${error.message}`:status==='host-offline'?'Presenter disconnected':'';}});if(local){result.close();return;}cloud=result;link.attach(result);}
      catch(error){$('projectorStatus').textContent=`Cannot connect: ${error.message}`;}
    },350);
  });
}else $('projectorStatus').textContent='Open this window from the presenter dashboard.';
$('projectorSignIn').addEventListener('click',()=>login().catch(error=>{$('projectorStatus').textContent=error.message;}));
$('projectorFullscreen').addEventListener('click',()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen().catch(()=>{$('projectorConnection').textContent='Use your browser’s full-screen control.';}));
window.addEventListener('resize',()=>{editor.resize();renderDrafts();});
if(interactive){
  $('projectorStage').addEventListener('pointermove',event=>{if(tools.mode==='laser'&&doc&&state&&!ended)sendLaser(event);});
  $('projectorStage').addEventListener('pointerleave',()=>{if(tools.mode==='laser')sendLaser(null);});
  $('projectorStage').addEventListener('click',event=>{if(tools.mode==='laser')event.stopImmediatePropagation();},true);
  window.addEventListener('blur',()=>{if(tools.mode==='laser')sendLaser(null);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){sendDraft(null);if(tools.mode==='laser')sendLaser(null);}});
}
window.addEventListener('pagehide',()=>{sendLaser(null);sendDraft(null);clearInterval(draftExpiry);clearTimeout(draftTimer);clearTimeout(laserSendTimer);link?.close();});

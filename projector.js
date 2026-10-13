import {SlideEditor} from './src/editor.js';
import {validateDocument} from './src/document.js';
import {initialAnimationVisibility} from './src/animations.js';
import {LiveLink} from './src/live-link.js';
import {normalizeState,validRoomId} from './src/live-protocol.js';
import {connectLiveRoom} from './src/live-cloud.js';
import {watchAccount,login} from './src/cloud.js';
import {OWNER_EMAIL} from './src/firebase-config.js';
import './styles.css';
import './src/presenter.css';

const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),room=params.get('room');
if(params.has('preview'))document.body.classList.add('projector-preview');
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
const editor=new SlideEditor($('projectorStage'),{onChange:()=>{},onSelection:()=>{},onHistory:()=>{},onError:error=>{$('projectorStatus').textContent=error;},onPlayback:()=>{}});
editor.setMode({readonly:true});
function restoreCursor(cursor){
  const player=editor.player;if(!player)return;
  player.stop();player.cursor=cursor;
  player.values=new Map([...initialAnimationVisibility(editor.animations)].map(([id,visible])=>[id,visible?1:0]));
  for(const effect of editor.animations.slice(0,cursor))for(const id of effect.targets)player.values.set(id,effect.effect==='appear'?1:0);
  editor.animationValues=player.values;editor.applyVisibility();editor.syncMedia();
}
async function render(){
  if(rendering){needsRender=true;return;}if(!doc||!state||ended)return;
  rendering=true;
  try{
    const current=doc,control=normalizeState(current,state),scene=JSON.stringify(current.slides[control.index]),changed=sceneKey!==scene||editor.index!==control.index||lastEpoch!==control.epoch;
    $('projectorBlank').hidden=!control.blank;
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
    lastCursor=control.cursor;lastEpoch=control.epoch;$('projectorWelcome').hidden=true;editor.resize();renderDrafts();
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
  if(message.sender!=='firebase'){local=true;if(cloud){cloud.close();cloud=null;}}
  if(type==='document'){try{validateDocument(value);doc=value;render();}catch(error){$('projectorStatus').textContent=error.message;}}
  if(type==='state'){state=value;render();}
  if(type==='laser')pointer(value);
  if(type==='draft')receiveDraft(value);
  if(type==='end'){ended=true;editor.stopAnimations();$('projectorBlank').hidden=false;$('projectorLaser').hidden=true;$('projectorWelcome').hidden=false;$('projectorStatus').textContent='Presentation ended.';}
}
let link;
if(validRoomId(room)){
  link=new LiveLink({room,receive});
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
window.addEventListener('pagehide',()=>{clearInterval(draftExpiry);link?.close();});

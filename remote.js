import {LiveLink} from './src/live-link.js';
import {validRoomId,clamp,motionPoint} from './src/live-protocol.js';
import {connectLiveRoom} from './src/live-cloud.js';
import {watchAccount,login} from './src/cloud.js';
import {OWNER_EMAIL} from './src/firebase-config.js';
import './src/presenter.css';

const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),room=params.get('room');
let link=null,cloud=null,state=null,doc=null,mode='touch',point={x:.5,y:.5},origin=null,sensor=null,held=false,drag=null,lastCloud=0,pendingLaser=null,laserTimeout=null,ended=false,local=false,hostOnline=false,lastSensor=0;
let heartbeat=null,motionTimeout=null;
const status=text=>{$('remoteStatus').textContent=text;};
const pad=$('remotePad');
function drawDot(){const dot=$('remoteDot');dot.style.left=(point.x*100)+'%';dot.style.top=(point.y*100)+'%';}
function sendPointer(visible){
  if(!link||ended)return;
  const value={...point,visible,at:Date.now()};drawDot();
  // Every local pointer update is immediate; cloud pointer traffic is capped
  // at about 30 fps and separated from document updates.
  const message=link.message('laser',value);link.channel.postMessage(message);
  if(!cloud)return;
  pendingLaser=message;clearTimeout(laserTimeout);
  const flush=()=>{lastCloud=Date.now();const latest=pendingLaser;pendingLaser=null;cloud.send(latest).catch(error=>status(`Laser not synced: ${error.message}`));};
  if(!visible||Date.now()-lastCloud>=33)flush();else laserTimeout=setTimeout(flush,33-(Date.now()-lastCloud));
}
function hold(value){
  held=value;$('remoteMotionHold').setAttribute('aria-pressed',String(value));
  clearInterval(heartbeat);sendPointer(value);
  if(value)heartbeat=setInterval(()=>sendPointer(true),750);
}
function receive(type,value,message){
  if(message.sender!=='firebase'&&message.host===true){local=true;hostOnline=true;if(cloud){cloud.close();cloud=null;}}
  if(type==='document'){doc=value;updateSlide();}
  if(type==='state'){state=value;updateSlide();}
  if(type==='end'){ended=true;hold(false);status('Presentation ended.');document.querySelectorAll('button[data-action],button[data-mode]').forEach(button=>button.disabled=true);}
}
function updateSlide(){if(doc&&state){$('remoteSlide').textContent=`${state.index+1} / ${doc.lesson.pages.length}`;document.querySelector('[data-action=blank]').setAttribute('aria-pressed',String(state.blank));if(local)status('Connected to this device');}}
async function connect(){
  if(!link||cloud||local||ended)return;
  try{
    const result=await connectLiveRoom({link,uid:params.get('uid'),onStatus:(value,error)=>{hostOnline=!['host-offline','disconnected'].includes(value)&&!error;status(error?`Remote connection unavailable: ${error.message}`:hostOnline?'Connected · ready to present':'Presenter disconnected · waiting');if(!hostOnline)hold(false);}});
    if(local){result.close();return;}cloud=result;link.attach(result);
  }catch(error){hostOnline=false;status(`Cannot connect: ${error.message}`);}
}
if(validRoomId(room)){
  link=new LiveLink({room,receive});
  const presenter=new URL('studio.html',location.href);presenter.search=location.search;$('remotePresenter').href=presenter.href;
  const preview=new URL('projector.html',location.href);preview.search=location.search;preview.searchParams.set('preview','1');$('remotePreview').src=preview.href;
  watchAccount(user=>{if(!user){cloud?.close();cloud=null;hostOnline=local;hold(false);$('remoteSignIn').hidden=local;status(local?'Connected to this device':'Sign in with the account presenting this lesson.');}else{ $('remoteSignIn').hidden=true;if(user.email===OWNER_EMAIL&&user.emailVerified)setTimeout(connect,350);else status('Use the project owner’s Google account.');}});
}else status('Open the phone remote link from your presenter dashboard.');
$('remoteSignIn').addEventListener('click',()=>login().catch(error=>status(error.message)));
document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>{if(link&&!ended&&hostOnline)link.send('command',{action:button.dataset.action});else status('Wait for the presenter to reconnect.');}));
function setMode(next){
  hold(false);drag=null;mode=next;origin=null;
  document.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));
  document.querySelector('.remote-motion-controls').hidden=mode!=='motion';document.querySelector('.remote-drawing-controls').hidden=mode!=='draw';
  pad.classList.toggle('remote-pad-drawing',mode==='draw');pad.classList.toggle('remote-pad-motion',mode==='motion');
  $('remoteHint').textContent={touch:'Hold and move your finger on the pad to point at the slide.',motion:'Calibrate, then hold the button and tilt your phone to point.',draw:'Draw on the pad to annotate the current projected slide.'}[mode];
}
async function enableMotion(){
  try{
    if(!window.DeviceOrientationEvent)throw new Error('This device has no motion controls. Use Touch laser.');
    if(typeof DeviceOrientationEvent.requestPermission==='function'&&await DeviceOrientationEvent.requestPermission()!=='granted')throw new Error('Motion permission was not granted. Use Touch laser.');
    setMode('motion');
    clearTimeout(motionTimeout);motionTimeout=setTimeout(()=>{if(!sensor||Date.now()-lastSensor>3000){status('No motion sensor data. Use Touch laser, or allow motion access in browser settings.');setMode('touch');}},3000);
  }catch(error){status(error.message);setMode('touch');}
}
document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>button.dataset.mode==='motion'?enableMotion():setMode(button.dataset.mode)));
window.addEventListener('deviceorientation',event=>{
  if(!Number.isFinite(event.beta)||!Number.isFinite(event.gamma))return;
  sensor={beta:event.beta,gamma:event.gamma};lastSensor=Date.now();
  if(mode!=='motion'||!held)return;
  origin||={...sensor,...point};const next=motionPoint(origin,sensor,screen.orientation?.angle||window.orientation||0);if(next){point=next;sendPointer(true);}
});
$('remoteCalibrate').addEventListener('click',()=>{if(!sensor||Date.now()-lastSensor>3000){status('Waiting for phone motion data.');return;}point={x:.5,y:.5};origin={...sensor,...point};drawDot();if(held)sendPointer(true);});
const motionHold=$('remoteMotionHold');
motionHold.addEventListener('pointerdown',event=>{if(!hostOnline)return;motionHold.setPointerCapture(event.pointerId);origin=sensor?{...sensor,...point}:null;hold(true);});
for(const name of ['pointerup','pointercancel','lostpointercapture'])motionHold.addEventListener(name,()=>hold(false));
motionHold.addEventListener('keydown',event=>{if((event.code==='Space'||event.key==='Enter')&&!event.repeat){event.preventDefault();hold(true);}});
motionHold.addEventListener('keyup',()=>hold(false));
function position(event){const bounds=pad.getBoundingClientRect();return {x:clamp((event.clientX-bounds.left)/bounds.width),y:clamp((event.clientY-bounds.top)/bounds.height)};}
pad.addEventListener('pointerdown',event=>{
  if(mode==='motion'||ended||!hostOnline||!state)return;
  event.preventDefault();pad.setPointerCapture(event.pointerId);const start=position(event);
  drag={id:event.pointerId,start,point:{...point},index:state.index,points:[[start.x,start.y]]};
  if(mode==='touch')hold(true);else {point=start;drawDot();renderInk();}
});
let draftTimer=null,lastDraft=0;
function sendDraft(clear=false){
  clearTimeout(draftTimer);if(!link)return;
  const send=()=>{lastDraft=Date.now();link.send('draft',clear||!drag?{client:link.id,clear:true}:{client:link.id,index:drag.index,color:$('remoteColor').value,width:Number($('remoteWidth').value),points:drag.points.map(([x,y])=>[x*1280,y*720]),at:Date.now()});};
  if(clear||Date.now()-lastDraft>=33)send();else draftTimer=setTimeout(send,33-(Date.now()-lastDraft));
}
function renderInk(){
  const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');line.setAttribute('points',drag.points.map(([x,y])=>`${x*1280},${y*720}`).join(' '));line.setAttribute('fill','none');line.setAttribute('stroke',$('remoteColor').value);line.setAttribute('stroke-width',$('remoteWidth').value);line.setAttribute('stroke-linecap','round');$('remoteInk').replaceChildren(line);sendDraft();
}
pad.addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.id)return;const next=position(event);
  if(mode==='touch'){point={x:clamp(drag.point.x+next.x-drag.start.x),y:clamp(drag.point.y+next.y-drag.start.y)};sendPointer(true);}
  else{if(drag.points.length<1000)drag.points.push([next.x,next.y]);point=next;drawDot();renderInk();}
});
function release(event,cancel=false){
  if(!drag||event.pointerId!==drag.id)return;
  if(mode==='draw'&&!cancel&&drag.points.length>1)link.send('command',{action:'stroke',index:drag.index,points:drag.points,color:$('remoteColor').value,width:Number($('remoteWidth').value)});
  sendDraft(true);
  drag=null;hold(false);$('remoteInk').replaceChildren();
}
pad.addEventListener('pointerup',event=>release(event));pad.addEventListener('pointercancel',event=>release(event,true));pad.addEventListener('lostpointercapture',event=>release(event,true));
pad.addEventListener('keydown',event=>{
  const direction={ArrowLeft:[-.015,0],ArrowRight:[.015,0],ArrowUp:[0,-.015],ArrowDown:[0,.015]}[event.key];
  if(direction){event.preventDefault();point={x:clamp(point.x+direction[0]),y:clamp(point.y+direction[1])};sendPointer(true);}
  if(event.code==='Space'){event.preventDefault();hold(true);}
});pad.addEventListener('keyup',event=>{if(event.code==='Space')hold(false);});
document.addEventListener('visibilitychange',()=>{if(document.hidden){hold(false);drag=null;}});window.addEventListener('blur',()=>hold(false));
window.addEventListener('online',connect);window.addEventListener('pagehide',()=>{hold(false);link?.close();});drawDot();

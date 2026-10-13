import {test} from 'node:test';
import assert from 'node:assert/strict';
import {slideState,presentationCommand,normalizeState,laserPoint,motionPoint,remoteStroke} from '../src/live-protocol.js';
import {LiveLink} from '../src/live-link.js';
import {encodeIncremental,decodeIncremental,incrementalPatch} from '../src/cloud-incremental.js';

const document=()=>({format:'lesson-presenter',version:1,lesson:{title:'Original lesson',pages:[{title:'One',questions:[{prompt:'Question',answer:'Answer'}]},{title:'Hidden',questions:[],hidden:true},{title:'Three',questions:[]}]},slides:[{objects:[{type:'Textbox',lpId:'text',text:'Original'}],lpAnimations:[{id:'appear',effect:'appear',trigger:'click',targets:['text'],delay:0}]},{objects:[]},{objects:[]}]});
test('live controls advance effects and answers before navigating and skip hidden slides',()=>{
  const doc=document();let state=slideState(doc);
  state=presentationCommand(doc,state,{action:'next'});assert.equal(state.cursor,1);assert.equal(state.reveal,0);
  state=presentationCommand(doc,state,{action:'next'});assert.equal(state.reveal,1);
  state=presentationCommand(doc,state,{action:'previous'});assert.equal(state.reveal,0);assert.equal(state.index,0);
  state=presentationCommand(doc,state,{action:'next'});state=presentationCommand(doc,state,{action:'next'});assert.equal(state.index,2);
  assert.equal(presentationCommand(doc,state,{action:'next'}).index,2);
  assert.equal(presentationCommand(doc,state,{action:'previous'}).index,0);
  assert.equal(presentationCommand(doc,state,{action:'slide',index:1}).index,2);
  assert.equal(presentationCommand(doc,state,{action:'blank'}).blank,true);
  assert.deepEqual(doc,document());
});
test('live controls clamp stale state after slides or answers are edited',()=>{
  const doc=document();assert.deepEqual(normalizeState(doc,{index:99,reveal:900,cursor:900}),slideState(doc));
  const state=normalizeState(doc,{index:0,reveal:900,cursor:900});assert.equal(state.reveal,1);assert.equal(state.cursor,1);
  doc.slides[0].lpAnimations[0].trigger='after';assert.equal(slideState(doc).cursor,1);
});
test('laser uses normalized positions and calibrated motion in portrait and landscape',()=>{
  assert.deepEqual(laserPoint({x:-10,y:10,visible:true}),{x:0,y:1,visible:true});assert.equal(laserPoint({x:NaN,y:0}),null);
  const origin={beta:10,gamma:5,x:.5,y:.5};assert.deepEqual(motionPoint(origin,{beta:10,gamma:5}),{x:.5,y:.5,visible:true});
  assert.deepEqual(motionPoint(origin,{beta:10,gamma:27.5}),{x:1,y:.5,visible:true});
  const rotated=motionPoint(origin,{beta:10,gamma:27.5},90);assert.ok(Math.abs(rotated.x-.5)<1e-10);assert.equal(rotated.y,0);
});
test('remote ink retains its target slide and validates point, style and payload bounds',()=>{
  const stroke=remoteStroke({index:2,color:'#e11d48',width:4,points:[[0,0],[1,1]]});
  assert.deepEqual(stroke.path,[['M',0,0],['L',1280,720]]);assert.equal(stroke.lpLiveAnnotation,true);
  assert.equal(remoteStroke({index:0,color:'url(bad)',points:[[0,0],[1,1]]}),null);
  assert.equal(remoteStroke({index:0,color:'#e11d48',points:[[0,NaN],[1,1]]}),null);
});
test('local presentation never waits for Firebase; cloud echoes cannot execute a command twice',()=>{
  const channels=[],received=[];let resolveCloud;
  const factory=()=>{const channel={onmessage:null,postMessage(message){channels.filter(c=>c!==channel).forEach(c=>c.onmessage?.({data:structuredClone(message)}));},close(){}};channels.push(channel);return channel;};
  const host=new LiveLink({room:'room',host:true,channelFactory:factory,receive:(type,value)=>received.push({type,value})});
  host.send('document',document());host.send('state',slideState(document()));
  const peerReceived=[];const peer=new LiveLink({room:'room',channelFactory:factory,receive:(type,value)=>peerReceived.push({type,value})});
  assert.equal(peerReceived.length,2);
  peer.attach({send:()=>new Promise(resolve=>resolveCloud=resolve),close(){}});
  const message=peer.send('command',{action:'next'});assert.equal(received.length,1);
  host.accept(message);assert.equal(received.length,1);
  resolveCloud();peer.close();host.close();
});
test('live document patches preserve editable objects, reuse pixels and leave the saved source untouched',async()=>{
  const original=document();original.slides[0].objects.push({type:'Image',lpId:'image',src:'data:image/png;base64,AAAA'});
  const initial=await encodeIncremental(original,null,{compact:false}),live=structuredClone(original);live.slides[0].objects[0].text='During class';
  live.slides[0].objects.push(remoteStroke({index:0,color:'#e11d48',points:[[0,0],[1,1]],width:4}));
  const updated=await encodeIncremental(live,initial,{compact:false}),patch=incrementalPatch(initial,updated);
  assert.ok(Object.keys(patch).length>0);assert.ok(!Object.keys(patch).some(key=>key.startsWith('assets/')));
  assert.deepEqual(decodeIncremental(updated),live);assert.equal(original.slides[0].objects[0].text,'Original');assert.equal(original.slides[0].objects.length,2);
});
test('phone messages arriving through Firebase relay to the local projector without cloud feedback',()=>{
  const channels=[],seen=[];let cloudWrites=0;
  const factory=()=>{const channel={onmessage:null,postMessage(message){channels.filter(c=>c!==channel).forEach(c=>c.onmessage?.({data:structuredClone(message)}));},close(){}};channels.push(channel);return channel;};
  const presenter=new LiveLink({room:'room',host:true,channelFactory:factory,receive:()=>{}});
  const projector=new LiveLink({room:'room',channelFactory:factory,receive:(type,value)=>seen.push({type,value})});
  presenter.attach({send:async()=>cloudWrites++,close(){}});
  presenter.accept({room:'room',id:'remote-laser',sender:'firebase',type:'laser',value:{x:.2,y:.7,visible:true,at:Date.now()}},true);
  presenter.accept({room:'room',id:'remote-content',sender:'firebase',type:'document',value:document()},true);
  assert.equal(seen.length,2);assert.equal(seen[0].value.x,.2);assert.equal(seen[1].type,'document');assert.equal(cloudWrites,0);
  presenter.close();projector.close();
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {encodeIncremental,decodeIncremental,incrementalPatch} from '../src/cloud-incremental.js';
import {LiveLink} from '../src/live-link.js';
import {annotationCommand,annotationShape,applyAnnotationCommand} from '../src/live-annotations.js';

test('Firebase live room: isolated edits, remote commands, ink and laser; owner permissions and session cleanup',{skip:!process.env.FIREBASE_DATABASE_EMULATOR_HOST},async()=>{
  const require=createRequire(process.env.LP_FIREBASE_TEST_TOOLS+'/package.json');
  const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
  const sdk=require('firebase/database');
  const [host,port]=process.env.FIREBASE_DATABASE_EMULATOR_HOST.split(':');
  const env=await initializeTestEnvironment({projectId:'demo-lp-live',database:{host,port:Number(port),rules:readFileSync(new URL('../database.rules.json',import.meta.url),'utf8')}});
  const claims={email:'mea.gdrive3@gmail.com',email_verified:true,firebase:{sign_in_provider:'google.com'}};
  const a=env.authenticatedContext('owner',claims).database(),b=env.authenticatedContext('owner',claims).database();
  const doc={format:'lesson-presenter',version:1,lesson:{title:'Saved source',pages:[{title:'One',questions:[]}]},slides:[{objects:[{type:'Textbox',lpId:'text',text:'Original'}]}]};
  const state={index:0,reveal:0,cursor:0,blank:false,ended:false};
  const root='presentationRooms/owner/room',source='cloudLessons/owner/lessons/saved-source';
  const sourceText=readFileSync(new URL('../src/live-cloud.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('export async function','async function').replaceAll('export function','function');
  const cloudFor=db=>{
    const context=vm.createContext({...sdk,liveDatabase:()=>({db,user:{uid:'owner'}}),encodeIncremental,decodeIncremental,incrementalPatch,crypto,structuredClone,setTimeout,clearTimeout,Date,window:{addEventListener(){},removeEventListener(){}}});
    vm.runInContext(sourceText,context);return context.connectLiveRoom;
  };
  const inert=()=>({onmessage:null,postMessage(){},close(){}}),hostMessages=[],peerMessages=[],projectorMessages=[],channels=[];
  const local=()=>{const channel={onmessage:null,postMessage(message){channels.filter(c=>c!==channel).forEach(c=>c.onmessage?.({data:structuredClone(message)}));},close(){}};channels.push(channel);return channel;};
  const hostLink=new LiveLink({room:'room',host:true,channelFactory:local,receive:(type,value)=>hostMessages.push({type,value})});
  const projector=new LiveLink({room:'room',channelFactory:local,receive:(type,value)=>projectorMessages.push({type,value})});
  const peer=new LiveLink({room:'room',channelFactory:inert,receive:(type,value)=>peerMessages.push({type,value})});
  const wait=async predicate=>{const deadline=Date.now()+8000;while(!predicate()){if(Date.now()>deadline)throw Error('Live update timed out');await new Promise(resolve=>setTimeout(resolve,20));}};
  try{
    await env.withSecurityRulesDisabled(async context=>sdk.set(sdk.ref(context.database(),source),{json:JSON.stringify(doc)}));
    hostLink.attach(await cloudFor(a)({link:hostLink,create:true,document:doc,state,onStatus:()=>{}}));
    peer.attach(await cloudFor(b)({link:peer,uid:'owner',onStatus:()=>{}}));
    await wait(()=>peerMessages.some(m=>m.type==='document'));
    const changed=structuredClone(doc);changed.slides[0].objects[0].text='Edited live';hostLink.send('document',changed);
    await wait(()=>peerMessages.some(m=>m.type==='document'&&m.value.slides[0].objects[0].text==='Edited live'));
    peer.send('command',{action:'next'});await wait(()=>hostMessages.some(m=>m.type==='command'&&m.value.action==='next'));
    peer.send('laser',{x:.25,y:.75,visible:true,at:Date.now()});await wait(()=>hostMessages.some(m=>m.type==='laser'&&m.value.x===.25));
    assert.ok(projectorMessages.some(m=>m.type==='laser'&&m.value.x===.25));
    peer.send('draft',{client:peer.id,index:0,points:[[10,10],[20,20]],color:'#e11d48',width:4,at:Date.now()});await wait(()=>hostMessages.some(m=>m.type==='draft'&&!m.value.clear));
    peer.send('command',{action:'stroke',index:0,color:'#e11d48',width:4,points:[[0,0],[1,1]]});await wait(()=>hostMessages.some(m=>m.type==='command'&&m.value.action==='stroke'));
    let live=changed;
    for(const [operation,object] of [['create',annotationShape('square',{x:100,y:100},{x:300,y:300},'#e11d48',4,'remote-mark')],['update',{...annotationShape('square',{x:100,y:100},{x:300,y:300},'#2563eb',6,'remote-mark'),left:350,scaleX:1.5,scaleY:1.5}],['delete','remote-mark']]){
      const request=annotationCommand(operation,0,object);peer.send('command',request);
      await wait(()=>hostMessages.some(m=>m.type==='command'&&m.value.operation===operation));
      live=applyAnnotationCommand(live,hostMessages.find(m=>m.type==='command'&&m.value.operation===operation).value);assert.ok(live);
      hostLink.send('document',live);
      await wait(()=>peerMessages.some(m=>m.type==='document'&&JSON.stringify(m.value)===JSON.stringify(live)));
      assert.ok(projectorMessages.some(m=>m.type==='document'&&JSON.stringify(m.value)===JSON.stringify(live)));
    }
    for(const patch of [{operation:'replace'},{index:300},{object:'x'.repeat(65537)},{id:'unsafe/id'}]){
      const message=peer.message('command',{...annotationCommand('create',0,annotationShape('circle',{x:1,y:1},{x:30,y:30},'#e11d48',4,'invalid-mark')),...patch});
      await assertFails(sdk.set(sdk.ref(b,root+'/commands/'+message.id),message));
    }
    hostLink.send('state',{...state,blank:true});await wait(()=>peerMessages.some(m=>m.type==='state'&&m.value.blank));
    await env.withSecurityRulesDisabled(async context=>assert.equal((await sdk.get(sdk.ref(context.database(),source+'/json'))).val(),JSON.stringify(doc)));
    await assertFails(sdk.get(sdk.ref(env.unauthenticatedContext().database(),root)));
    await assertFails(sdk.update(sdk.ref(env.authenticatedContext('stranger',claims).database(),root),{state:'{}'}));
    await assertFails(sdk.update(sdk.ref(env.authenticatedContext('owner',{...claims,email_verified:false}).database(),root),{state:'{}'}));
    await assertFails(sdk.update(sdk.ref(a,root),{state:'x'.repeat(1025)}));
    await assertFails(sdk.update(sdk.ref(a,root+'/lasers'),{bad:{sender:'bad',value:{x:2,y:0,visible:true,at:Date.now()}}}));
    await assertFails(sdk.update(sdk.ref(a,root),{rawLesson:doc}));
    await hostLink.cloud.send(hostLink.message('end',{}));
    const ended=(await sdk.get(sdk.ref(a,root))).val();assert.equal(ended.meta.ended,true);assert.equal(ended.document,undefined);assert.equal(ended.commands,undefined);
  }finally{hostLink.close();peer.close();projector.close();await env.cleanup();}
});

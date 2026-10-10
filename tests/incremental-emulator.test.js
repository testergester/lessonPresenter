import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {encodeIncremental,decodeIncremental,commitIncremental} from '../src/cloud-incremental.js';
import {readCloudRevision} from '../src/cloud-reader.js';

// Optional integration check. The regular suite needs no running database.
const enabled=!!process.env.FIREBASE_DATABASE_EMULATOR_HOST;
test('Firebase emulator: incremental permissions, two clients, conflicts, deletion and legacy isolation',{skip:!enabled},async()=>{
 const require=createRequire(process.env.LP_FIREBASE_TEST_TOOLS?process.env.LP_FIREBASE_TEST_TOOLS+'/package.json':import.meta.url);
 const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
 const {ref,get,update,onValue,serverTimestamp,query,orderByValue,startAt,endAt}=require('firebase/database');
 const [host,port]=process.env.FIREBASE_DATABASE_EMULATOR_HOST.split(':');
 const env=await initializeTestEnvironment({projectId:'demo-lp-incremental',database:{host,port:Number(port),rules:readFileSync(new URL('../database.rules.json',import.meta.url),'utf8')}});
 await env.clearDatabase();
 const claims={email:'mea.gdrive3@gmail.com',email_verified:true,firebase:{sign_in_provider:'google.com'}};
 const a=env.authenticatedContext('owner',claims).database(),b=env.authenticatedContext('owner',claims).database();
 const document={format:'lesson-presenter',version:1,lesson:{title:'Incremental test',pages:[{title:'Slide',questions:[],aim:'Original'}]},slides:[{objects:[{type:'Textbox',lpId:'text',text:'Original',left:10,top:20},{type:'Image',lpId:'image',src:'data:image/png;base64,'+'A'.repeat(10000),left:20,top:30}]}]};
 const id='copy',path='lessons/'+id,root='cloudLessons/owner';
 const commit=async(db,doc,base,create=false)=>commitIncremental({document:doc,base,next:await encodeIncremental(doc,base),id,path,indexPath:'index',create,write:{timestamp:serverTimestamp(),update:changes=>update(ref(db,root),changes)},readHead:async()=>(await get(ref(db,root+'/'+path+'/head'))).val()});
 const read=async db=>(await get(ref(db,root+'/'+path))).val();
 let stop;
 try{
  await commit(a,document,null,true);const base=await read(a);assert.deepEqual(decodeIncremental(base),document);
  await assertFails(get(ref(env.unauthenticatedContext().database(),root)));
  await assertFails(get(ref(env.authenticatedContext('other',claims).database(),root)));
  await assertFails(get(ref(env.authenticatedContext('owner',{...claims,email_verified:false}).database(),root)));
  await assertFails(update(ref(a,root+'/'+path+'/entries'),{bad:42}));
  await assertFails(update(ref(a,root+'/'+path+'/fieldVersions'),{'e:bad':999}));
  const legacy={lessons:{legacy:{json:JSON.stringify(document)}},index:{legacy:{title:document.lesson.title,updatedAt:serverTimestamp()}}};
  await update(ref(a,'users/owner'),legacy);
  let resolve;const received=new Promise(done=>resolve=done);stop=onValue(ref(b,root+'/'+path),snapshot=>{const value=snapshot.val();if(value?.head?.revision===2)resolve(value);});
  const changed=structuredClone(document);changed.slides[0].objects[0].text='Browser A';
  const saved=await commit(a,changed,base);assert.ok(saved.metrics.patchBytes<1000);assert.ok(saved.metrics.reduction>90);
  let timer;const remote=await Promise.race([received,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Peer update timed out')),10000))]).finally(()=>clearTimeout(timer));assert.deepEqual(decodeIncremental(remote),changed);
  const reads=[];
  const cachedResult=await readCloudRevision({head:remote.head,cached:base,
   read:async field=>{reads.push(field);return (await get(ref(b,root+'/'+path+'/'+field))).val();},
   changed:async(from,to)=>(await get(query(ref(b,root+'/'+path+'/fieldVersions'),orderByValue(),startAt(from),endAt(to)))).val()
  });
  assert.equal(cachedResult.mode,'changes');assert.deepEqual(decodeIncremental(cachedResult.model),changed);
  assert.equal(reads.filter(field=>field.startsWith('entries/')).length,1);assert.ok(!reads.includes('entries')&&!reads.includes('assets'));
  const stale=structuredClone(document);stale.lesson.pages[0].aim='Stale browser';
  await assert.rejects(commit(b,stale,base),error=>error.code==='cloud/conflict');assert.deepEqual(decodeIncremental(await read(a)),changed);
  const next=structuredClone(changed);next.slides[0].objects[1].left=55;await commit(b,next,await read(b));assert.deepEqual(decodeIncremental(await read(a)),next);
  assert.equal((await get(ref(a,'users/owner/lessons/legacy/json'))).val(),JSON.stringify(document));
  // Old standard transactions write the account root. Test copies are elsewhere.
  await update(ref(a,'users/owner/lessons/legacy'),{json:JSON.stringify(next)});assert.equal((await read(a)).head.revision,3);
  const last=await read(a),head={...last.head,deleted:true,revision:4,updatedAt:serverTimestamp()};
  await update(ref(a,root),{[path+'/head']:head,[path+'/entries']:null,[path+'/assets']:null,[path+'/fieldVersions']:null,['index/'+id]:null});
  await assert.rejects(commit(b,changed,last),/deleted/);await assert.rejects(commit(a,document,null,true),/deleted/);
  const deleted=await read(a);assert.equal(deleted.head.deleted,true);assert.equal(deleted.entries,undefined);assert.equal(deleted.assets,undefined);
  assert.equal((await get(ref(a,root+'/index/'+id))).exists(),false);
 }finally{stop?.();await env.cleanup();}
});

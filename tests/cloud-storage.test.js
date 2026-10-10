import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {validateDocument} from '../src/document.js';
import {migrateCloudStorage} from '../src/cloud-migration.js';
import {cloudPayload} from '../src/cloud-payload.js';
import {requireCloudId} from '../src/cloud-mutations.js';
import {encodeIncremental,decodeIncremental,incrementalPatch,comparePayload,commitIncremental,byteSize} from '../src/cloud-incremental.js';
import {readCloudRevision,sameRevision} from '../src/cloud-reader.js';
const source=readFileSync(new URL('../src/cloud.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
const document=()=>({format:'lesson-presenter',version:1,lesson:{title:'Saved lesson',pages:[{title:'Slide',questions:[],aim:'Original'}]},slides:[{objects:[{type:'Rect',lpId:'shape',left:10,width:100},{type:'Image',lpId:'image',src:'data:image/png;base64,'+'A'.repeat(10000)}]}]});
function database(){
 const data={cloudLessons:{owner:{migrationComplete:true}}},writes=[],reads=[],listeners=new Set(),disk=new Map();
 const read=path=>path.split('/').filter(Boolean).reduce((value,key)=>value?.[key],data)??null;
 const put=(path,value)=>{const keys=path.split('/').filter(Boolean);let target=data;for(const key of keys.slice(0,-1))target=target[key]||={};if(value===null)delete target[keys.at(-1)];else target[keys.at(-1)]=structuredClone(value);};
 const snapshot=path=>({val:()=>structuredClone(read(path)),exists:()=>read(path)!==null});
 const sdk={ref:(db,path='')=>path,query:(path,...constraints)=>({path,constraints}),orderByValue:()=>({}),startAt:from=>({from}),endAt:to=>({to}),get:async path=>{reads.push(path);if(typeof path==='object'){const from=path.constraints.find(v=>v.from)?.from||0,to=path.constraints.find(v=>v.to)?.to||Infinity;return {val:()=>Object.fromEntries(Object.entries(read(path.path)||{}).filter(([,rev])=>rev>=from&&rev<=to))};}return snapshot(path);},serverTimestamp:()=>1234,
  onValue:(path,callback)=>{const listener={path,callback};listeners.add(listener);queueMicrotask(()=>{if(listeners.has(listener))callback(snapshot(path));});return ()=>listeners.delete(listener);},
  update:async(root,changes)=>{
   const absolute=Object.fromEntries(Object.entries(changes).map(([path,value])=>[[root,path].filter(Boolean).join('/'),value]));
   for(const [path,value] of Object.entries(absolute))if(path.endsWith('/head')){const before=read(path);if(before?.deleted||value.revision!==(before?before.revision+1:1)){const error=Error('revision rejected');error.code='PERMISSION_DENIED';throw error;}}
   writes.push(absolute);for(const [path,value] of Object.entries(absolute))put(path,value);
   for(const {path,callback} of listeners)if(Object.keys(absolute).some(key=>key.startsWith(path+'/')||key===path))callback(snapshot(path));
  }
 };
 function client(cache=new Map()){
  const createCloudCache=()=>({get:async(uid,id)=>structuredClone(cache.get(uid+'/'+id)||null),put:async(uid,id,model)=>{const key=uid+'/'+id;if((cache.get(key)?.head.revision||0)<=model.head.revision)cache.set(key,structuredClone(model));},remove:async(uid,id)=>cache.delete(uid+'/'+id)});
  const context=vm.createContext({...sdk,createCloudCache,readCloudRevision,sameRevision,initializeApp:()=>({}),getAuth:()=>({currentUser:{uid:'owner',email:'owner@test.com',emailVerified:true}}),getDatabase:()=>({}),firebaseConfig:{},OWNER_EMAIL:'owner@test.com',crypto:webcrypto,migrateCloudStorage,validateDocument,cloudPayload,requireCloudId,encodeIncremental,decodeIncremental,incrementalPatch,comparePayload,commitIncremental,byteSize,structuredClone,setTimeout,clearTimeout,queueMicrotask});
  vm.runInContext(source+';this.api={saveCloudLesson,getCloudLesson,listCloudLessons,deleteCloudLesson,watchCloudLesson,watchCloudIndex,getCloudLessonRevision};',context);return context.api;
 }
 return {read,put,writes,reads,listeners,client,disk};
}
const path=id=>'cloudLessons/owner/lessons/'+id;
test('legacy lesson upgrades once with its original ID; edits only write incremental paths and reuse images',async()=>{
 const db=database(),a=db.client(),doc=document();db.put('users/owner/lessons/existing/json',JSON.stringify(doc));db.put('users/owner/index/existing',{title:doc.lesson.title,updatedAt:1});
 assert.deepEqual(await a.getCloudLesson('existing'),doc);assert.equal(db.read(path('existing')+'/head').revision,1);
 const changed=structuredClone(doc);changed.lesson.pages[0].aim='Edited';await a.saveCloudLesson(changed,'existing');
 assert.equal(db.writes.length,2);assert.ok(Object.keys(db.writes[1]).every(key=>key.startsWith('cloudLessons/owner/')));assert.ok(!Object.keys(db.writes[1]).some(key=>key.includes('/assets/')));
 assert.ok(byteSize(db.writes[1])<1000);assert.equal(db.read('users/owner/lessons/existing/json'),JSON.stringify(doc));
 assert.deepEqual(await db.client().getCloudLesson('existing'),changed);assert.equal(db.writes.length,2);
 const lessons=await a.listCloudLessons();assert.equal(lessons.length,1);assert.equal(lessons[0].id,'existing');assert.equal(lessons[0].backend,'incremental');
});
test('simultaneous legacy upgrades converge on one record, and stale clients cannot overwrite later edits',async()=>{
 const db=database(),a=db.client(),b=db.client(),doc=document();db.put('users/owner/lessons/shared/json',JSON.stringify(doc));
 const opened=await Promise.all([a.getCloudLesson('shared'),b.getCloudLesson('shared')]);assert.deepEqual(opened,[doc,doc]);assert.equal(db.writes.length,1);
 const changed=structuredClone(doc);changed.lesson.title='From A';await a.saveCloudLesson(changed,'shared');
 const stale=structuredClone(doc);stale.lesson.title='From B';await assert.rejects(b.saveCloudLesson(stale,'shared'),error=>error.code==='cloud/conflict');
 assert.deepEqual(await b.getCloudLesson('shared'),changed);
});
test('new lessons and former test copies share the main list; peer updates and deletion clean up the legacy recovery copy',async()=>{
 const db=database(),a=db.client(),b=db.client(),doc=document();await a.saveCloudLesson(doc,'new',{create:true});assert.equal(db.read('users/owner/lessons/new/json'),null);
 const copy={...doc,lesson:{...doc.lesson,title:'Former test copy'}};await a.saveCloudLesson(copy,'copy',{create:true});assert.equal((await b.listCloudLessons()).length,2);
 let receive,resolve;const received=new Promise(done=>resolve=done);const stop=b.watchCloudLesson('new',value=>{receive=value;if(value?.lesson.title==='Peer update')resolve();},error=>{throw error;});
 await new Promise(done=>setImmediate(done));const changed=structuredClone(doc);changed.lesson.title='Peer update';await a.saveCloudLesson(changed,'new');await received;assert.deepEqual(receive,changed);
 db.put('users/owner/lessons/new/json',JSON.stringify(doc));db.put('users/owner/index/new',{title:'Recovery',updatedAt:1});await a.deleteCloudLesson('new');await new Promise(done=>setImmediate(done));assert.equal(receive,null);assert.equal(db.read('users/owner/lessons/new'),null);assert.equal(db.read('users/owner/index/new'),null);assert.equal(db.read(path('new')+'/entries'),null);assert.equal(db.read(path('new')+'/assets'),null);
 await assert.rejects(b.saveCloudLesson(changed,'new'),/deleted/);await assert.rejects(a.getCloudLesson('new'),/no longer exists/);assert.equal((await a.listCloudLessons()).length,1);stop();
});
test('cancelled listeners do not apply a late upgrade or attach a live listener',async()=>{
 const db=database(),a=db.client();const stop=a.watchCloudLesson('missing',()=>assert.fail('cancelled callback'),()=>assert.fail('cancelled error'));stop();await new Promise(done=>setImmediate(done));assert.equal(db.listeners.size,0);
});
test('opening then watching shares one initial listener with no full-record get, and releases it on close',async()=>{
 const db=database(),a=db.client(),doc=document();await a.saveCloudLesson(doc,'shared',{create:true});
 const b=db.client();assert.deepEqual(await b.getCloudLesson('shared'),doc);
 let received=0;
 const stop=b.watchCloudLesson('shared',value=>{assert.deepEqual(value,doc);received++;},error=>{throw error;});
 await new Promise(done=>setImmediate(done));
 assert.equal(received,1);assert.equal([...db.listeners].filter(v=>v.path===path('shared')+'/head').length,1);
 assert.equal(db.reads.filter(p=>p===path('shared')).length,0);
 stop();assert.equal(db.listeners.size,0);
 assert.deepEqual(await b.getCloudLesson('shared'),doc);
 const stopAgain=b.watchCloudLesson('shared',()=>{},error=>{throw error;});stopAgain();assert.equal(db.listeners.size,0);
});

test('page restart opens matching lesson ID and revision from persistent cache, with no content reads',async()=>{
 const db=database(),doc=document(),disk=new Map(),a=db.client(disk);
 await a.saveCloudLesson(doc,'cached',{create:true});
 db.reads.length=0;
 const restarted=db.client(disk);assert.deepEqual(await restarted.getCloudLesson('cached'),doc);
 assert.deepEqual(db.reads,['cloudLessons/owner/migrationComplete']);
 assert.ok([...db.listeners].every(v=>v.path.endsWith('/head')));
 assert.equal(restarted.getCloudLessonRevision('cached'),1);
});

test('stale persistent cache fetches only changed fields after multiple missed revisions',async()=>{
 const db=database(),doc=document(),writer=db.client(),disk=new Map();
 await writer.saveCloudLesson(doc,'cached',{create:true});
 const first=db.client(disk);await first.getCloudLesson('cached');first.watchCloudLesson('cached',()=>{},()=>{})();
 const updated=structuredClone(doc);updated.lesson.title='Revision two';await writer.saveCloudLesson(updated,'cached');
 updated.slides[0].objects[0].left=99;await writer.saveCloudLesson(updated,'cached');
 updated.lesson.title='Revision four';await writer.saveCloudLesson(updated,'cached');
 db.reads.length=0;const restarted=db.client(disk);
 assert.deepEqual(await restarted.getCloudLesson('cached'),updated);
 const contentReads=db.reads.filter(p=>typeof p==='string'&&p.includes('/entries/'));
 assert.equal(contentReads.length,2);
 assert.ok(!db.reads.some(p=>typeof p==='string'&&(/\/(entries|assets)$/.test(p)||p.includes('/assets/'))));
 assert.equal(db.reads.filter(p=>typeof p==='object').length,1);
 assert.equal(restarted.getCloudLessonRevision('cached'),4);
});

test('cached deltas carry object and image deletions, additions, slide reorder and new assets',async()=>{
 const db=database(),writer=db.client(),disk=new Map(),doc=document();
 await writer.saveCloudLesson(doc,'changes',{create:true});
 const first=db.client(disk);await first.getCloudLesson('changes');first.watchCloudLesson('changes',()=>{},()=>{})();
 const updated=structuredClone(doc);updated.slides[0].objects.pop();
 updated.lesson.pages.unshift({title:'New first slide',questions:[]});
 updated.slides.unshift({objects:[{type:'Image',lpId:'new-image',src:'data:image/png;base64,BBBB'}]});
 await writer.saveCloudLesson(updated,'changes');db.reads.length=0;
 assert.deepEqual(await db.client(disk).getCloudLesson('changes'),updated);
 assert.ok(!db.reads.includes(path('changes')+'/entries'));
 assert.ok(!db.reads.includes(path('changes')+'/assets'));
 assert.equal(Object.keys(disk.get('owner/changes').assets).length,1);
});

test('matching IDs in separate accounts cannot share cache; corrupt cache gets a full validated copy',async()=>{
 const db=database(),writer=db.client(),doc=document(),disk=new Map();await writer.saveCloudLesson(doc,'same',{create:true});
 disk.set('other/same',structuredClone(db.read(path('same'))));
 await db.client(disk).getCloudLesson('same');assert.ok(db.reads.includes(path('same')+'/entries'));
 disk.get('owner/same').entries.slideOrder='invalid';db.reads.length=0;
 assert.deepEqual(await db.client(disk).getCloudLesson('same'),doc);assert.ok(db.reads.includes(path('same')+'/entries'));
});

test('deleted lessons invalidate persistent copies and never open from stale content',async()=>{
 const db=database(),writer=db.client(),doc=document(),disk=new Map();await writer.saveCloudLesson(doc,'gone',{create:true});
 const first=db.client(disk);await first.getCloudLesson('gone');first.watchCloudLesson('gone',()=>{},()=>{})();
 await writer.deleteCloudLesson('gone');db.reads.length=0;
 await assert.rejects(db.client(disk).getCloudLesson('gone'),/no longer exists/);
 assert.equal(disk.has('owner/gone'),false);assert.ok(!db.reads.some(p=>typeof p==='string'&&p.includes('/entries')));
});
test('existing cloud records gain a revision index on opening without rewriting lesson fields',async()=>{
 const db=database(),doc=document(),model=await encodeIncremental(doc),disk=new Map();
 db.put(path('old'),{...model,head:{version:1,revision:7,writeId:'old',title:doc.lesson.title,deleted:false,updatedAt:1}});
 const first=db.client(disk);assert.deepEqual(await first.getCloudLesson('old'),doc);
 assert.equal(db.read(path('old')+'/head').revision,8);assert.equal(db.read(path('old')+'/head').cacheVersion,1);
 assert.equal(db.writes.length,1);assert.ok(!Object.keys(db.writes[0]).some(key=>key.includes('/entries')||key.includes('/assets')));
 first.watchCloudLesson('old',()=>{},()=>{})();
 const changed=structuredClone(doc);changed.lesson.title='New title';await first.saveCloudLesson(changed,'old');
 db.reads.length=0;assert.deepEqual(await db.client(disk).getCloudLesson('old'),changed);assert.ok(!db.reads.includes(path('old')+'/entries'));
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {CloudAutosave} from '../src/cloud-autosave.js';
import {documentDigest,remoteDecision} from '../src/cloud-sync.js';
import {cloudStatusState} from '../src/cloud-status.js';
const source=readFileSync(new URL('../src/cloud-ui.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace('export function','function');
const settle=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function harness(savedBinding=null){
 const nodes={},events={},listeners=new Map(),store=new Map(),experimentStore=store,writes=[],cleared=[],timers=new Map();let account,indexWatch,connection,binding=savedBinding,counter=0,experimentIndexWatch,denyExperimental=false;
 let doc={lesson:{title:'Test lesson',pages:[{title:'Slide',questions:[]}]},slides:[{objects:[]}]};
 function node(){return {children:[],dataset:{},handlers:{},hidden:false,textContent:'',setAttribute(){},replaceChildren(){this.children=[];},append(...items){this.children.push(...items);},addEventListener(type,fn){this.handlers[type]=fn;}};}
 const context={document:{getElementById:id=>nodes[id]||=(node()),createElement:node,addEventListener:(name,fn)=>events[name]=fn},window:{confirm:()=>true,addEventListener(){}},crypto:{randomUUID:()=>`new-${++counter}`},structuredClone,TextEncoder,documentDigest,remoteDecision,cloudStatusState,OWNER_EMAIL:'owner@test.com',diagnostics:{log(){}},CloudAutosave:class extends CloudAutosave{constructor(options){super({...options,setTimer:fn=>{timers.set(++counter,fn);return counter;},clearTimer:id=>timers.delete(id)});}},watchAccount:fn=>account=fn,watchConnection:fn=>connection=fn,watchCloudIndex:fn=>{indexWatch=fn;return ()=>{};},watchCloudLesson:(id,fn,error,options={})=>{const mode=options.backend!=='standard',key=mode?'inc/'+id:id;listeners.set(key,fn);queueMicrotask(()=>fn((mode?experimentStore:store).get(id)||null));return ()=>listeners.delete(key);},saveCloudLesson:async(document,id,options)=>{const mode=options.backend!=='standard',target=mode?experimentStore:store;if(mode&&denyExperimental)throw Error('Test write denied');writes.push({id,create:options.create,backend:options.backend||'incremental'});if(!options.create&&!target.has(id))throw Error('deleted');target.set(id,structuredClone(document));listeners.get(mode?'inc/'+id:id)?.(document);if(mode)experimentIndexWatch?.([...experimentStore].map(([id,doc])=>({id,title:doc.lesson.title,backend:'incremental'})));},deleteCloudLesson:async(id,options={})=>{(options.backend!=='standard'?experimentStore:store).delete(id);},listCloudLessons:async()=>[...store].map(([id,doc])=>({id,title:doc.lesson.title})),watchIncrementalIndex:fn=>{experimentIndexWatch=fn;queueMicrotask(()=>fn([...experimentStore].map(([id,doc])=>({id,title:doc.lesson.title,backend:'incremental'}))));return ()=>{};},getCloudLessonRevision:()=>1,getCloudLesson:async(id,options={})=>(options.backend!=='standard'?experimentStore:store).get(id),login(){},logout(){},queueMicrotask};
 vm.runInNewContext(source+';setupCloudUI({currentDocument:()=>current(),getBinding:()=>getCurrentBinding(),setBinding:setCurrentBinding,load:loadCurrent,clearLocal:clearCurrent,setStatus:()=>{}})',{...context,current:()=>doc,getCurrentBinding:()=>binding,setCurrentBinding:value=>binding=value,loadCurrent:async value=>doc=structuredClone(value),clearCurrent:async(id,uid)=>{cleared.push({id,uid});if(binding?.id===id){doc={lesson:{title:'Untitled lesson',pages:[{title:'Untitled slide',questions:[]}]},slides:[{objects:[]}]};binding={uid,id,deleted:true};}}});
 return {nodes,store,experimentStore,writes,cleared,timers,denyExperiment(){denyExperimental=true;},connect(value){connection(value);},signIn(){account({uid:'owner',email:'owner@test.com',emailVerified:true});},edit(){doc.lesson.title+=' edited';events['lesson:snapshot']({detail:doc});},get binding(){return binding;},get doc(){return doc;},remoteDelete(id){store.delete(id);listeners.get('inc/'+id)?.(null);},async save(){await nodes.cloudSaveBtn.handlers.click();await settle();await nodes.cloudSaveBtn.handlers.click();await settle();},async list(){await nodes.cloudRefreshBtn.handlers.click();},get rows(){return nodes.cloudLessons.children;}};
}
test('fresh blank workspace stays unbound until an explicit cloud save',async()=>{
 const h=harness();h.doc.lesson={title:'Untitled lesson',pages:[{title:'Untitled slide',questions:[],aim:'',teacherNotes:[]}]};
 h.signIn();await settle();assert.equal(h.binding,null);assert.equal(h.writes.length,0);
 await h.save();assert.ok(h.binding?.id);assert.ok(h.writes.length>0);
});
test('cloud UI keeps the same lesson ID across edits, and deletion clears both cloud and local document',async()=>{
 const h=harness();h.signIn();await settle();await h.save();const id=h.binding.id;
 for(let i=0;i<3;i++){h.edit();await h.save();}
 assert.equal(h.store.size,1);assert.ok(h.writes.every(write=>write.id===id));assert.equal(h.writes[0].create,true);assert.ok(h.writes.slice(1).every(write=>write.create===false));
 await h.list();assert.equal(h.rows.length,1);assert.equal(h.rows[0].children[1].textContent,'Delete');await h.rows[0].children[1].handlers.click();await settle();
 assert.equal(h.store.size,0);assert.deepEqual(h.cleared,[{id,uid:'owner'}]);assert.equal(h.doc.lesson.title,'Untitled lesson');assert.equal(h.binding.deleted,true);
 const count=h.writes.length;h.edit();await settle();assert.equal(h.writes.length,count);assert.equal(h.timers.size,0);
});
test('reload reuses a saved cloud binding rather than allocating a new lesson',async()=>{
 const doc={lesson:{title:'Test lesson',pages:[{title:'Slide',questions:[]}]},slides:[{objects:[]}]};
 const h=harness({uid:'owner',id:'existing',savedDigest:documentDigest(doc),remoteDigest:documentDigest(doc)});h.store.set('existing',doc);h.signIn();await settle();h.edit();await h.save();assert.equal(h.binding.id,'existing');assert.deepEqual(h.writes.map(w=>w.id),['existing']);
});
test('deletion from another browser also clears the open local lesson and stops autosave',async()=>{
 const h=harness();h.signIn();await settle();await h.save();const id=h.binding.id;h.remoteDelete(id);await settle();
 assert.equal(h.doc.lesson.title,'Untitled lesson');assert.deepEqual(h.cleared,[{id,uid:'owner'}]);assert.equal(h.binding.deleted,true);assert.equal(h.timers.size,0);
});

test('deleted binding reports paused autosave rather than an endless connecting state and offers an explicit new save',async()=>{
 const h=harness({uid:'owner',id:'deleted',deleted:true});h.signIn();await settle();h.connect(true);
 assert.match(h.nodes.cloudStatus.textContent,/autosave paused/);assert.match(h.nodes.cloudAccount.textContent,/autosave is paused/);assert.equal(h.nodes.cloudSaveBtn.textContent,'Save as a new cloud lesson');assert.equal(h.writes.length,0);
 h.edit();assert.match(h.nodes.cloudStatus.textContent,/previous lesson deleted/);assert.equal(h.timers.size,0);
 await h.save();assert.notEqual(h.binding.id,'deleted');assert.equal(h.binding.deleted,undefined);assert.equal(h.store.size,1);assert.match(h.nodes.cloudStatus.textContent,/saved/);
});

test('all new lessons use incremental sync and the main list includes existing test copies',async()=>{
 const h=harness();h.signIn();await settle();await h.save();
 assert.equal(h.binding.backend,'incremental');assert.ok(h.writes.every(write=>write.backend==='incremental'));
 h.store.set('old-test-copy',{lesson:{title:'Existing copy',pages:[]},slides:[]});await h.list();
 assert.equal(h.rows.length,2);assert.ok(h.rows.some(row=>row.children[0].textContent==='Existing copy · old-test'));
 assert.equal(h.nodes.cloudExperimentBtn,undefined);
});
test('reloading an incremental binding retains its backend and never creates a standard lesson',async()=>{
 const doc={lesson:{title:'Test lesson',pages:[{title:'Slide',questions:[]}]},slides:[{objects:[]}]};
 const h=harness({uid:'owner',id:'test-copy',backend:'incremental',savedDigest:documentDigest(doc),remoteDigest:documentDigest(doc)});h.experimentStore.set('test-copy',doc);
 h.signIn();await settle();h.edit();await h.save();assert.equal(h.store.size,1);assert.equal(h.binding.backend,'incremental');assert.ok(h.writes.every(write=>write.id==='test-copy'&&write.backend==='incremental'));
});

test('cloud icon reports dirty, saved and disconnected states without a late saved event masking offline status',async()=>{
 const h=harness();h.signIn();await settle();await h.save();assert.equal(h.nodes.cloudSaveIndicator.dataset.state,'saved');
 h.edit();assert.equal(h.nodes.cloudSaveIndicator.dataset.state,'saving');
 h.connect(true);h.connect(false);await h.save();assert.equal(h.nodes.cloudSaveIndicator.dataset.state,'disconnected');
 h.connect(true);assert.equal(h.nodes.cloudSaveIndicator.dataset.state,'saved');
});

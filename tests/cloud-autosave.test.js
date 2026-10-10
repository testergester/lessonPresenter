import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CloudAutosave} from '../src/cloud-autosave.js';
function harness(save=async()=>{}){
  let next=0;const timers=new Map(),states=[],writes=[];
  const autosave=new CloudAutosave({save:async(doc,id)=>{writes.push({doc,id});await save(doc,id);},onState:(state,error)=>states.push({state,error}),setTimer:callback=>{timers.set(++next,callback);return next;},clearTimer:id=>timers.delete(id)});
  autosave.context('lesson-a');return {autosave,timers,states,writes};
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('debounces edits, preserves the document snapshot and skips unchanged uploads',async()=>{
  const h=harness(),doc={title:'First'};h.autosave.request(doc);doc.title='Second';h.autosave.request(doc);doc.title='Unscheduled mutation';assert.equal(h.timers.size,1);await [...h.timers.values()][0]();
  assert.deepEqual(h.writes,[{id:'lesson-a',doc:{title:'Second'}}]);assert.equal(h.states.at(-1).state,'saved');h.autosave.request({title:'Second'});await h.autosave.flush();assert.equal(h.writes.length,1);
});
test('lesson switches cancel pending old saves and ignore late completion',async()=>{
  const pending=deferred(),h=harness(()=>pending.promise);h.autosave.request({title:'Old'});const old=h.autosave.flush();await Promise.resolve();await Promise.resolve();
  assert.equal(h.writes.length,1);h.autosave.context('lesson-b');h.autosave.request({title:'New'});const fresh=h.autosave.flush();pending.resolve();await Promise.all([old,fresh]);
  assert.deepEqual(h.writes.map(x=>x.id),['lesson-a','lesson-b']);assert.equal(h.states.at(-1).state,'saved');
  h.autosave.request({title:'Pending'});h.autosave.context(null);await h.autosave.flush();assert.equal(h.writes.length,2);assert.equal(h.timers.size,0);
});
test('new edits during an upload are serialized after the earlier snapshot',async()=>{
  const first=deferred();let count=0;const h=harness(()=>++count===1?first.promise:Promise.resolve());h.autosave.request({version:1});const a=h.autosave.flush();await Promise.resolve();await Promise.resolve();h.autosave.request({version:2});const b=h.autosave.flush();assert.equal(h.writes.length,1);first.resolve();await Promise.all([a,b]);assert.deepEqual(h.writes.map(x=>x.doc.version),[1,2]);assert.equal(h.states.at(-1).state,'saved');
});
test('failed saves keep dirty data available for retry and loaded baselines need no upload',async()=>{
  let fail=true;const h=harness(async()=>{if(fail)throw new Error('Offline');});h.autosave.request({title:'Keep'});await h.autosave.flush();assert.equal(h.states.at(-1).state,'error');fail=false;await h.autosave.flush();assert.equal(h.states.at(-1).state,'saved');assert.equal(h.writes.length,2);
  h.autosave.context('loaded',{title:'Existing'});h.autosave.request({title:'Existing'});await h.autosave.flush();assert.equal(h.writes.length,2);
});

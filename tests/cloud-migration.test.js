import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeIncremental,decodeIncremental} from '../src/cloud-incremental.js';
import {migrateCloudStorage} from '../src/cloud-migration.js';
const doc={format:'lesson-presenter',version:1,lesson:{title:'Move me',pages:[{title:'Slide',questions:[]}]},slides:[{objects:[{type:'Image',lpId:'image',src:'data:image/png;base64,AAAA'}]}]};
async function fixture(){
 const model={...await encodeIncremental(doc),head:{version:1,revision:12,writeId:'last-edit',title:'Move me',updatedAt:12,deleted:false}};
 const store={syncTests:{incrementalLessons:{lesson:model,deleted:{head:{version:1,revision:5,writeId:'gone',title:'Removed',updatedAt:10,deleted:true}}}},cloudLessons:{}};
 const read=async path=>structuredClone(path.split('/').reduce((value,key)=>value?.[key],store)??null);
 const writes=[];const write=async changes=>{writes.push(changes);for(const [path,value] of Object.entries(changes)){const keys=path.split('/');let node=store;for(const key of keys.slice(0,-1))node=node[key]||={};node[keys.at(-1)]=structuredClone(value);}};
 return {store,read,write,writes,model};
}
test('migration preserves IDs, exact image assets, revisions and tombstones and verifies before completion',async()=>{
 const f=await fixture();await migrateCloudStorage(f);assert.deepEqual(f.store.cloudLessons.lessons.lesson,f.model);assert.deepEqual(decodeIncremental(f.store.cloudLessons.lessons.lesson),doc);assert.equal(f.store.cloudLessons.lessons.deleted.head.deleted,true);assert.equal(f.store.cloudLessons.index.deleted,undefined);assert.equal(f.store.cloudLessons.migrationComplete,true);assert.deepEqual(f.store.syncTests.incrementalLessons.lesson,f.model);
 const count=f.writes.length;await migrateCloudStorage(f);assert.equal(f.writes.length,count);
});
test('resuming migration never overwrites a newer production lesson',async()=>{
 const f=await fixture(),newer=structuredClone(f.model);newer.head.revision=13;newer.head.writeId='new';f.store.cloudLessons.lessons={lesson:newer};await migrateCloudStorage(f);assert.deepEqual(f.store.cloudLessons.lessons.lesson,newer);
});
test('verification failure retains the source and does not mark the migration complete',async()=>{
 const f=await fixture();const write=async changes=>{await f.write(changes);if(f.store.cloudLessons.lessons?.lesson)f.store.cloudLessons.lessons.lesson.entries.slideOrder='[]';};await assert.rejects(migrateCloudStorage({...f,write}),/verification failed/);assert.equal(f.store.cloudLessons.migrationComplete,undefined);assert.deepEqual(f.store.syncTests.incrementalLessons.lesson,f.model);
});
test('migration retries a revision race using the latest source',async()=>{
 const f=await fixture();let rejected=false;const write=async changes=>{if(!rejected&&changes['cloudLessons/lessons/lesson']){rejected=true;f.store.syncTests.incrementalLessons.lesson.head.revision++;f.store.syncTests.incrementalLessons.lesson.head.writeId='concurrent';const error=Error('stale source');error.code='PERMISSION_DENIED';throw error;}return f.write(changes);};await migrateCloudStorage({...f,write});assert.equal(f.store.cloudLessons.lessons.lesson.head.revision,13);assert.equal(f.store.cloudLessons.lessons.lesson.head.writeId,'concurrent');
});
test('completed migration needs no access to the removed namespace',async()=>{
 await migrateCloudStorage({read:async path=>{assert.equal(path,'cloudLessons/migrationComplete');return true;},write:async()=>assert.fail('completed migration must not write')});
});

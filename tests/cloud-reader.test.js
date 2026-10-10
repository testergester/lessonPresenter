import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeIncremental,decodeIncremental,incrementalPatch} from '../src/cloud-incremental.js';
import {readCloudRevision,versionField,versionPath} from '../src/cloud-reader.js';
const doc=()=>({format:'lesson-presenter',version:1,lesson:{title:'One',pages:[{title:'Slide',questions:[]}]},slides:[{objects:[]}]});
const head=revision=>({version:1,revision,writeId:'write-'+revision,deleted:false,cacheVersion:1,cacheEpoch:'epoch'});
test('reader retries concurrent revisions without caching a mixed document',async()=>{
 const original=doc(),first={...await encodeIncremental(original),head:head(1)};
 const secondDoc=structuredClone(original);secondDoc.lesson.title='Two';const second={...await encodeIncremental(secondDoc,first),head:head(2)};
 const thirdDoc=structuredClone(secondDoc);thirdDoc.lesson.pages[0].title='Three';const third={...await encodeIncremental(thirdDoc,second),head:head(3)};
 let queryCount=0;
 const result=await readCloudRevision({head:second.head,cached:first,changed:async()=>{queryCount++;return Object.fromEntries(Object.keys(incrementalPatch(first,queryCount===1?second:third)).map(path=>[versionField(path),queryCount===1?2:3]));},read:async path=>path==='head'?third.head:path.split('/').reduce((v,k)=>v?.[k],third)??null});
 assert.equal(queryCount,2);assert.deepEqual(decodeIncremental(result.model),thirdDoc);assert.equal(result.model.head.revision,3);
});
test('old clients or a new cache epoch require one full refresh rather than applying incomplete deltas',async()=>{
 const original=doc(),first={...await encodeIncremental(original),head:head(1)},updated=structuredClone(original);updated.lesson.title='Upgraded';
 const next={...await encodeIncremental(updated,first),head:{...head(4),cacheEpoch:'new-epoch'}},reads=[];
 const result=await readCloudRevision({head:next.head,cached:first,changed:async()=>assert.fail('must not use an incomplete index'),read:async path=>{reads.push(path);return next[path];}});
 assert.equal(result.mode,'full');assert.deepEqual(reads.sort(),['assets','entries','head']);assert.deepEqual(decodeIncremental(result.model),updated);
});
test('field markers cannot request unrelated database paths',()=>{
 for(const key of ['e:../secret','e:a/b','a:invalid','unknown','e:__proto__.value'])assert.throws(()=>versionPath(key));
 assert.equal(versionPath(versionField('entries/0_a')),'entries/0_a');
});

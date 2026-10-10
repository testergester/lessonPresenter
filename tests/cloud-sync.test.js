import {test} from 'node:test';
import assert from 'node:assert/strict';
import {documentDigest,remoteDecision} from '../src/cloud-sync.js';
import {createDiagnostics,captureCrashes} from '../src/diagnostics.js';
const a={text:'original'},b={text:'remote edit'},c={text:'local edit'};
test('clean browsers apply remote changes without treating their own writes as remote edits',()=>{
  assert.equal(remoteDecision(b,{current:a,baseline:documentDigest(a)}),'apply');
  assert.equal(remoteDecision(b,{current:b,baseline:documentDigest(a)}),'echo');
  assert.equal(remoteDecision(b,{current:c,baseline:documentDigest(a),inFlight:[documentDigest(b)]}),'echo');
  assert.equal(remoteDecision(a,{current:c,baseline:documentDigest(a)}),'unchanged');
});
test('concurrent edits and unknown old baselines are conflicts instead of silent overwrites',()=>{
  assert.equal(remoteDecision(b,{current:c,baseline:documentDigest(a)}),'conflict');
  assert.equal(remoteDecision(b,{current:a,baseline:null}),'conflict');
  assert.equal(remoteDecision(a,{current:a,baseline:null}),'echo');
});
test('Fabric normalization can have a different local baseline from the cloud payload',()=>{
  const normalized={...a,defaultStyle:true};
  assert.equal(remoteDecision(a,{current:normalized,baseline:documentDigest(normalized),remoteBaseline:documentDigest(a)}),'unchanged');
  assert.equal(remoteDecision(b,{current:normalized,baseline:documentDigest(normalized),remoteBaseline:documentDigest(a)}),'apply');
});
test('diagnostics are bounded, survive reload, omit lesson payloads and redact URLs and API keys',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const log=createDiagnostics(storage);for(let i=0;i<350;i++)log.log('snapshot',{lessonId:'id',document:{text:'private'},message:'Error at https://example.com/?token=secret AIzaSensitiveSecret'});
  const entries=log.read();assert.equal(entries.length,300);assert.equal(entries[0].document,undefined);assert.ok(!JSON.stringify(entries).includes('token=secret'));assert.ok(!JSON.stringify(entries).includes('AIzaSensitiveSecret'));assert.equal(createDiagnostics(storage).read().length,300);
});
test('storage failures never prevent recording crashes and rejected promises',()=>{
  const events={},log=createDiagnostics({getItem(){throw new Error('Disabled');},setItem(){throw new Error('Full');}});
  captureCrashes({addEventListener:(name,fn)=>events[name]=fn},log);events.error({message:'Canvas failure',error:new Error('Canvas failure')});events.unhandledrejection({reason:new Error('Upload failure')});assert.deepEqual(log.read().map(x=>x.event),['crash','unhandled-rejection']);
});

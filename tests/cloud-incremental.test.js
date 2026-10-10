import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeIncremental,decodeIncremental,incrementalPatch,comparePayload,commitIncremental,byteSize} from '../src/cloud-incremental.js';
import {packLesson,unpackLesson} from '../src/document.js';

const image='data:image/png;base64,'+'A'.repeat(100000);
const doc=()=>({format:'lesson-presenter',version:1,lesson:{title:'Test',pages:[{title:'Slide',questions:[],aim:'Goal',teacherNotes:[]},{title:'Other',questions:[]}]},slides:[{background:'#fff',objects:[{type:'Textbox',lpId:'text',text:'Original',left:10,top:20,fill:'#123456'},{type:'Image',lpId:'image',src:image,left:20,top:30,clipPath:{type:'Rect',width:30,height:20,rx:5}}],lpAnimations:[{id:'effect',effect:'appear',trigger:'click',targets:['image'],delay:0}]},{objects:[{type:'Group',lpId:'group',objects:[{type:'Textbox',lpId:'child',text:'Nested'},{type:'Image',lpId:'nested-image',src:image}]}]}],roster:[],revealedAnswerCountByPage:[0,0]});

test('incremental representation round-trips Version 1, groups, clips, animations and JSON key order',async()=>{
 const original=doc(),model=await encodeIncremental(original),restored=decodeIncremental(model);
 assert.deepEqual(restored,original);assert.equal(JSON.stringify(restored),JSON.stringify(original));assert.equal(Object.keys(model.assets).length,1);
 assert.ok(Object.values(model.entries).every(value=>!value.includes(image)));
 const pkg=await packLesson(restored);assert.deepEqual(await unpackLesson(pkg),original);
});
test('text, position, fill and notes edits transfer only the changed fields and no pixels',async()=>{
 for(const edit of [d=>d.slides[0].objects[0].text='Changed',d=>d.slides[0].objects[1].left=44,d=>d.slides[0].objects[0].fill='#ffffff',d=>d.lesson.pages[0].aim='New goal',d=>d.slides[1].objects[0].objects[0].text='Nested change']){
  const original=doc(),before=await encodeIncremental(original),changed=structuredClone(original);edit(changed);
  const after=await encodeIncremental(changed,before),patch=incrementalPatch(before,after);
  assert.equal(Object.keys(patch).length,1);assert.ok(Object.keys(patch)[0].startsWith('entries/'));assert.ok(byteSize(patch)<300);
  assert.equal(comparePayload(patch,changed).reduction,99.9);
  assert.deepEqual(decodeIncremental(after),changed);
 }
});
test('reordering slides and objects preserves records and changes only order lists',async()=>{
 const original=doc(),before=await encodeIncremental(original),changed=structuredClone(original);
 changed.slides.reverse();changed.lesson.pages.reverse();changed.slides[1].objects.reverse();
 const after=await encodeIncremental(changed,before),patch=incrementalPatch(before,after);
 assert.equal(Object.keys(patch).length,2);assert.ok(!Object.keys(patch).some(key=>key.startsWith('assets/')));assert.deepEqual(decodeIncremental(after),changed);
});
test('images upload once, are shared within the copy, and disappear only after their last reference is removed',async()=>{
 const original=doc(),before=await encodeIncremental(original),changed=structuredClone(original);
 changed.slides[0].objects.pop();const after=await encodeIncremental(changed,before);assert.equal(Object.keys(after.assets).length,1);
 assert.ok(!Object.keys(incrementalPatch(before,after)).some(key=>key.startsWith('assets/')));
 changed.slides[1].objects[0].objects.pop();const removed=await encodeIncremental(changed,after),patch=incrementalPatch(after,removed);
 assert.equal(Object.keys(removed.assets).length,0);assert.equal(Object.values(patch).filter(value=>value===null).length>0,true);
 assert.deepEqual(decodeIncremental(removed),changed);
});
test('special property names, nulls and empty arrays retain their values',async()=>{
 const original=doc();original.lesson['a.b/#$[]']=null;original.slides[0].objects[0].styles={};original.slides[0].objects[0].toString='Custom property';original.lesson.hasOwnProperty=false;
 assert.deepEqual(decodeIncremental(await encodeIncremental(original)),original);
});
test('missing images and unsupported lesson data are rejected',async()=>{
 const encoded=await encodeIncremental(doc());assert.throws(()=>decodeIncremental({...encoded,assets:{}}),/image is missing/);
 const broken=doc();broken.version=2;await assert.rejects(encodeIncremental(broken),/not supported/);
});
test('compact aliases preserve legacy data, upgrade atomically and keep single-field edits small',async()=>{
 const original=doc(),legacy=await encodeIncremental(original,null,{compact:false});
 const compact=await encodeIncremental(original,legacy);
 assert.deepEqual(decodeIncremental(legacy),original);assert.deepEqual(decodeIncremental(compact),original);
 assert.ok(compact.entries._layout);assert.ok(byteSize(compact)<byteSize(legacy));
 const merged=structuredClone(legacy);
 for(const [path,value] of Object.entries(incrementalPatch(legacy,compact))){const [section,field]=path.split('/');if(value===null)delete merged[section][field];else merged[section][field]=value;}
 assert.deepEqual(decodeIncremental(merged),original);
 const changed=structuredClone(original);changed.slides[0].objects[0].text='Changed';
 const patch=incrementalPatch(compact,await encodeIncremental(changed,compact));assert.equal(Object.keys(patch).length,1);assert.ok(byteSize(patch)<100);
 const invalid=structuredClone(compact);invalid.entries['unknown_unknown']='0';assert.throws(()=>decodeIncremental(invalid),/Unknown cloud field alias/);
});
test('undefined Fabric text path is omitted as in JSON, and early test copies reopen safely',async()=>{
 const original=doc();original.slides[0].objects[0].path=undefined;
 const model=await encodeIncremental(original,null,{compact:false});
 assert.deepEqual(decodeIncremental(model),JSON.parse(JSON.stringify(original)));
 assert.ok(Object.values(model.entries).every(value=>typeof value==='string'));
 const fields=Object.keys(model.entries);const textKeys=fields.find(field=>field.endsWith('_keys')&&JSON.parse(model.entries[field]).includes('text'));
 const legacy=structuredClone(model);legacy.entries[textKeys]=JSON.stringify([...JSON.parse(legacy.entries[textKeys]),'path']);
 assert.deepEqual(decodeIncremental(legacy),JSON.parse(JSON.stringify(original)));
 const repaired=await encodeIncremental(original,legacy,{compact:false});assert.ok(!JSON.parse(repaired.entries[textKeys]).includes('path'));
 legacy.entries[textKeys.replace(/_keys$/,'_k74797065')]='"Path"';assert.throws(()=>decodeIncremental(legacy),/missing \(path\)/);
});
test('revision conflicts reject stale writes without replacing a newer browser edit',async()=>{
 const original=doc(),model=await encodeIncremental(original);let state={...model,head:{version:1,revision:1,deleted:false}};
 const base=structuredClone(state),first=structuredClone(original),second=structuredClone(original);first.lesson.pages[0].aim='Browser A';second.lesson.pages[0].aim='Browser B';
 const calls=[];
 const write={timestamp:1,update:async updates=>{
  const head=updates['incrementalLessons/test/head'];if(head.revision!==state.head.revision+1){const error=Error('permission');error.code='PERMISSION_DENIED';throw error;}
  calls.push(updates);for(const [path,value] of Object.entries(updates)){const parts=path.split('/');if(parts[0]!=='incrementalLessons')continue;if(parts.length===3)state[parts[2]]=value;else if(value===null)delete state[parts[2]][parts[3]];else state[parts[2]][parts[3]]=value;}
 }};
 const options={base,id:'test',path:'incrementalLessons/test',write,readHead:async()=>state.head};
 const result=await commitIncremental({...options,document:first,next:await encodeIncremental(first,base)});
 assert.equal(result.head.revision,2);assert.equal(Object.keys(calls[0]).length,4);assert.ok(!JSON.stringify(calls).includes(image));
 await assert.rejects(commitIncremental({...options,document:second,next:await encodeIncremental(second,base)}),error=>error.code==='cloud/conflict');
 assert.equal(decodeIncremental(state).lesson.pages[0].aim,'Browser A');
});
test('a deleted test copy cannot be recreated by an old client',async()=>{
 const document=doc(),model=await encodeIncremental(document),base={...model,head:{revision:2,deleted:true}};
 await assert.rejects(commitIncremental({document,base,next:model,id:'test',create:false}),/deleted/);
});

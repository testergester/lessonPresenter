import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import {Rect,Circle,Group} from 'fabric';
import {validateDocument,packLesson,unpackLesson} from '../src/document.js';
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const schema=read('../schema/lesson-v1.schema.json');
const validate=new Ajv2020({allErrors:true,strict:true,allowUnionTypes:true}).compile(schema);
const example=read('../public/examples/lesson-v1.json');
function valid(doc){assert.equal(validate(doc),true,JSON.stringify(validate.errors));assert.equal(validateDocument(doc),doc);}

test('Version 1 schema compiles, matches its served copy, and accepts the working embedded-image example',()=>{
 assert.deepEqual(schema,read('../public/schema/lesson-v1.schema.json'));valid(example);
});
test('real Fabric shape and group serialization remains valid with custom editing metadata',()=>{
 const doc=structuredClone(example);
 const circle=new Circle({left:40,top:80,radius:20});circle.lpId='nested-circle';
 const rect=new Rect({left:10,top:10,width:400,height:200,fill:'#eee'});
 const group=new Group([rect,circle]);group.lpId='group';
 doc.slides[0].objects.push(group.toObject(['lpId']));valid(doc);
});
test('Version 1 rejects malformed versions, objects, image sources, groups and animations',()=>{
 const variants=[doc=>doc.version=2,doc=>delete doc.lesson.pages[0].questions,doc=>doc.slides[0].objects[1].src='http://example.com/image.png',doc=>doc.slides[0].objects[1].src='assets/image-1.png',doc=>delete doc.slides[0].objects[1].src,doc=>doc.slides[0].objects.push({type:'Unknown'}),doc=>doc.slides[0].objects.push({type:'Group'}),doc=>doc.slides[0].lpAnimations[0].delay=-1,doc=>doc.slides[0].lpAnimations[0].trigger='on click'];
 for(const modify of variants){const doc=structuredClone(example);modify(doc);assert.equal(validate(doc),false);}
});
test('embedded images and their frame survive package round-trip and still validate as standalone Version 1',async()=>{
 const bytes=await(await packLesson(example)).arrayBuffer();
 const reopened=await unpackLesson({size:bytes.byteLength,arrayBuffer:async()=>bytes});valid(reopened);
 assert.deepEqual(reopened.slides[0].objects[1],example.slides[0].objects[1]);assert.deepEqual(reopened.slides[0].lpAnimations,example.slides[0].lpAnimations);
});
test('the importer enforces equal page and slide counts beyond JSON Schema constraints',()=>{
 const doc=structuredClone(example);doc.lesson.pages.push({title:'Unmatched',questions:[]});assert.equal(validate(doc),true);assert.throws(()=>validateDocument(doc),/does not match/);
});

test('Version 1 accepts direct HTTPS image links',()=>{const doc=structuredClone(example);doc.slides[0].objects[1].src='https://example.com/image.png';valid(doc);});
test('cloud identity uses a separate content revision without changing the file format version',()=>{
 const doc=structuredClone(example);doc.cloud={id:'lesson-123',revision:12};valid(doc);
 doc.cloud.revision=0;assert.equal(validate(doc),false);assert.throws(()=>validateDocument(doc),/revision/);
});

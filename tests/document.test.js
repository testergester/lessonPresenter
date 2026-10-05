import {test} from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {youtubeId,fitSlide,packLesson,unpackLesson,validateDocument} from '../src/document.js';
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC5EAAAAASUVORK5CYII=';
const document=()=>({format:'lesson-presenter',version:1,lesson:{title:'Round trip',pages:[{title:'First slide',questions:[{prompt:'Question?',answer:'Answer'}]}]},slides:[{background:'#fffefb',objects:[{type:'Textbox',text:'Editable',left:90,top:100,width:300,fontSize:36,lpRole:'answer',lpAnswerIndex:0},{type:'Image',src:image,left:200,top:120,width:1,height:1},{type:'Rect',lpVideoId:'dQw4w9WgXcQ',left:300,top:200,width:600,height:340}]}],revealedAnswerCountByPage:[0]});
test('validates watch, short and embed YouTube links without accepting other origins',()=>{
  for(const url of ['https://youtu.be/dQw4w9WgXcQ','https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3','https://youtube.com/shorts/dQw4w9WgXcQ','https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'])assert.equal(youtubeId(url),'dQw4w9WgXcQ');
  assert.equal(youtubeId('https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ'),null);assert.equal(youtubeId('javascript:alert(1)'),null);assert.equal(youtubeId('https://youtu.be/bad'),null);
});
test('fits a fixed 16:9 slide across desktop and mobile without changing object coordinates',()=>{
  assert.deepEqual(fitSlide(640),{scale:.5,width:640,height:360});assert.deepEqual(fitSlide(1280,360),{scale:.5,width:640,height:360});assert.equal(fitSlide(320).height,180);
});
test('editable package round-trips images, text, video, hidden answers and geometry',async()=>{
  const original=document();original.lesson.pages[0].hidden=true;const blob=await packLesson(original);const bytes=await blob.arrayBuffer();
  const zip=await JSZip.loadAsync(bytes);assert.ok(zip.file('assets/image-1.png'));
  const manifest=JSON.parse(await zip.file('lesson.json').async('string'));assert.equal(manifest.slides[0].objects[1].src,'assets/image-1.png');
  const restored=await unpackLesson({size:bytes.byteLength,arrayBuffer:async()=>bytes});assert.deepEqual(restored,original);
  assert.equal(original.slides[0].objects[1].src,image);
});
test('deduplicates shared image assets across slides',async()=>{
  const doc=document();doc.lesson.pages.push({...doc.lesson.pages[0]});doc.slides.push(structuredClone(doc.slides[0]));
  const blob=await packLesson(doc);const zip=await JSZip.loadAsync(await blob.arrayBuffer());assert.equal(Object.keys(zip.files).filter(name=>name.endsWith('.png')).length,1);
});
test('rejects unsupported documents and untrusted external image/fill sources',()=>{
  const doc=document();assert.equal(validateDocument(doc),doc);
  assert.throws(()=>validateDocument({...doc,version:2}),/not supported/);
  const mismatch=document();mismatch.slides=[];assert.throws(()=>validateDocument(mismatch),/does not match/);
  const remote=document();remote.slides[0].objects[1].src='https://example.com/image.png';assert.throws(()=>validateDocument(remote),/included inside/);
  const pattern=document();pattern.slides[0].objects[0].fill={type:'pattern',source:'https://example.com/image.png'};assert.throws(()=>validateDocument(pattern),/fill or stroke/);
  const badGeometry=document();badGeometry.slides[0].objects[0].left=NaN;assert.throws(()=>validateDocument(badGeometry),/geometry/);
});
test('missing packaged assets fail before changing the active lesson',async()=>{
  const doc=document();doc.slides[0].objects[1].src='assets/missing.png';const zip=new JSZip();zip.file('lesson.json',JSON.stringify(doc));
  const bytes=await zip.generateAsync({type:'uint8array'});await assert.rejects(()=>unpackLesson({size:bytes.length,arrayBuffer:async()=>bytes}),/Missing image/);
});

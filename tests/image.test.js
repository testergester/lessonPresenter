import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classRegistry} from 'fabric';
import {StyledImage,DEFAULT_IMAGE_STYLE,imageCornerRadii} from '../src/image.js';
import {packLesson,unpackLesson,validateDocument} from '../src/document.js';

test('rounded image rendering clips the photo and restores the border path',()=>{
  const calls=[];
  const ctx={beginPath(){calls.push('path');},roundRect(...args){calls.push(args);},save(){calls.push('save');},clip(){calls.push('clip');},restore(){calls.push('restore');}};
  const image={width:100,height:60,scaleX:.5,scaleY:1,lpImageRadius:16,framePath:StyledImage.prototype.framePath};
  StyledImage.prototype._renderFill.call(image,ctx);
  assert.equal(calls[0],'save');assert.ok(calls.includes('clip'));assert.ok(calls.includes('restore'));
  assert.equal(calls.filter(call=>call==='path').length,2);
  assert.deepEqual(calls[2],[-50,-30,100,60,{x:32,y:16}]);
  assert.deepEqual(imageCornerRadii({...image,lpImageRadius:200}),{x:50,y:30});
  assert.equal(classRegistry.getClass('Image'),StyledImage);
  assert.equal(classRegistry.getClass('image'),StyledImage);
  assert.equal(DEFAULT_IMAGE_STYLE.strokeWidth,2);assert.equal(DEFAULT_IMAGE_STYLE.lpImageRadius,16);
});
test('image frame edits survive JSON and packaged lesson round trips',async()=>{
  const image={type:'Image',src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC5EAAAAASUVORK5CYII=',width:1,height:1,...DEFAULT_IMAGE_STYLE,lpImageRadius:36,strokeWidth:5,stroke:'#123456'};
  const doc={format:'lesson-presenter',version:1,lesson:{pages:[{title:'Photo',questions:[]}]},slides:[{objects:[image]}]};
  validateDocument(doc);const blob=await packLesson(doc);const bytes=await blob.arrayBuffer();
  assert.deepEqual(await unpackLesson({size:bytes.byteLength,arrayBuffer:async()=>bytes}),doc);
  const invalid=structuredClone(doc);invalid.slides[0].objects[0].lpImageRadius=Infinity;
  assert.throws(()=>validateDocument(invalid),/invalid geometry/);
});

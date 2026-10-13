import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nextPresentationPreview,slideAtPresentationState} from '../src/presentation-preview.js';
import {slideState,presentationCommand} from '../src/live-protocol.js';

const doc=()=>({lesson:{pages:[{title:'Question',questions:[{prompt:'Q',answer:'A'}]},{title:'Hidden',questions:[],hidden:true},{title:'Summary',questions:[]}]},slides:[{objects:[{type:'Textbox',lpId:'title',text:'Question',visible:true},{type:'Textbox',lpId:'answer',text:'A',lpRole:'answer',lpAnswerIndex:0},{type:'Group',lpId:'group',objects:[{type:'Rect',lpId:'box',fill:'#244d40'}]}],lpAnimations:[{id:'a',effect:'appear',trigger:'click',targets:['box'],delay:0},{id:'b',effect:'disappear',trigger:'with',targets:['title'],delay:0},{id:'c',effect:'appear',trigger:'click',targets:['title'],delay:0}]},{objects:[]},{objects:[{type:'Textbox',text:'Summary'}]}]});
test('Next previews the full next animation batch, including grouped targets and disappearing objects',()=>{
  const document=doc(),original=structuredClone(document),current=slideState(document),preview=nextPresentationPreview(document,current);
  assert.equal(preview.kind,'animation');assert.equal(preview.state.cursor,2);
  assert.equal(preview.slide.objects[2].objects[0].visible,true);assert.equal(preview.slide.objects[0].visible,false);assert.equal(preview.slide.objects[1].visible,false);
  assert.deepEqual(document,original);assert.equal(current.cursor,0);
  const second=nextPresentationPreview(document,preview.state);assert.equal(second.kind,'animation');assert.equal(second.slide.objects[0].visible,true);
});
test('Next previews the answer that will appear, then the next visible slide',()=>{
  const document=doc(),preview=nextPresentationPreview(document,{...slideState(document),cursor:3});
  assert.equal(preview.kind,'answer');assert.equal(preview.slide.objects[1].visible,true);assert.equal(preview.state.reveal,1);
  const following=nextPresentationPreview(document,preview.state);assert.equal(following.kind,'slide');assert.equal(following.state.index,2);assert.equal(following.title,'Summary');
  assert.equal(nextPresentationPreview(document,following.state).kind,'end');
});
test('thumbnail uses settled animation state for automatic slide entry and retains original opacity and hidden objects',()=>{
  const document=doc();document.slides[2].objects=[{type:'Textbox',lpId:'auto',text:'Automatic',opacity:.4},{type:'Rect',lpId:'hidden',visible:false}];
  document.slides[2].lpAnimations=[{id:'auto-effect',effect:'appear',trigger:'after',targets:['auto','hidden'],delay:0}];
  const preview=nextPresentationPreview(document,{...slideState(document),cursor:3,reveal:1});
  assert.equal(preview.kind,'slide');assert.equal(preview.slide.objects[0].visible,true);assert.equal(preview.slide.objects[0].opacity,.4);assert.equal(preview.slide.objects[1].visible,false);
});
test('blank-screen control does not erase the thumbnail and previews exactly match Next navigation state',()=>{
  const document=doc(),state={...slideState(document),blank:true};
  const preview=nextPresentationPreview(document,state);assert.deepEqual(preview.state,presentationCommand(document,state,{action:'next'}));
  assert.ok(preview.slide.objects.length>0);assert.equal(preview.state.blank,true);
  assert.deepEqual(slideAtPresentationState(document,preview.state),preview.slide);
});

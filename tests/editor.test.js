import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SlideEditor} from '../src/editor.js';

test('reordering snapshots edits and carries each slide undo history to its new position',()=>{
  const a={objects:[{text:'A'}]},b={objects:[{text:'B'}]},c={objects:[{text:'C'}]};
  const histories=[{undo:['A1','A2'],redo:[]},{undo:['B1'],redo:['B2']},{undo:['C1'],redo:[]}];
  const editor={slides:[a,b,c],histories,index:0,token:3,ready:true,snapshot(){this.slides[0]={objects:[{text:'Latest A'}]};}};
  SlideEditor.prototype.reorderSlides.call(editor,[1,2,0]);
  assert.equal(editor.slides[2].objects[0].text,'Latest A');
  assert.equal(editor.histories[2],histories[0]);assert.equal(editor.histories[0],histories[1]);
  assert.equal(editor.histories[0].redo[0],'B2');
  assert.equal(editor.index,-1);assert.equal(editor.ready,false);assert.equal(editor.token,4);
});

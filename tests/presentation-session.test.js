import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Path,Rect} from 'fabric';
import {SlideEditor} from '../src/editor.js';
import {annotationPatch,decodePresentationPages,PresentationWriter,presentationDigest} from '../src/presentation-session.js';

const stroke=id=>({type:'Path',lpId:id,lpAnnotation:true,lpSessionAnnotation:true,path:[['M',10,10],['L',40,40]],stroke:'#e11d48',strokeWidth:4,fill:null});
test('presentation writes start immediately without waiting for earlier acknowledgements',async()=>{
  const writes=[],pending=[];const writer=new PresentationWriter({write:(index,patch)=>{writes.push({index,patch});return new Promise(resolve=>pending.push(resolve));}});
  const first=writer.change(0,[stroke('a')]);await Promise.resolve();assert.equal(writes.length,1);
  const second=writer.change(0,[stroke('a'),stroke('b')]);await Promise.resolve();assert.equal(writes.length,2);
  assert.deepEqual(Object.keys(writes[1].patch),['b']);pending.forEach(resolve=>resolve());await Promise.all([first,second]);
});
test('stroke deltas preserve peer strokes and undo removes only the affected stroke',()=>{
  assert.deepEqual(annotationPatch([stroke('a')],[stroke('a'),stroke('b')]),{b:JSON.stringify(stroke('b'))});
  assert.deepEqual(annotationPatch([stroke('a'),stroke('b')],[stroke('a')]),{b:null});
  assert.deepEqual(annotationPatch([stroke('a')],[stroke('a')]),{});
  assert.throws(()=>annotationPatch([],[stroke('bad/id')]),/Invalid/);
});
test('a rejected write preserves local drawings when Firebase rolls back its local echo',async()=>{
  const writer=new PresentationWriter({write:async()=>{throw new Error('permission denied');}});
  await assert.rejects(writer.change(0,[stroke('local')]),/permission denied/);
  const merged=writer.receive({0:[stroke('peer')]});
  assert.deepEqual(merged[0].map(object=>object.lpId),['peer','local']);
});
test('session decoder accepts only paths, marks them as overlays and rejects malformed data',()=>{
  const pages=decodePresentationPages({0:{strokes:{a:JSON.stringify(stroke('a')),b:'broken',c:JSON.stringify({type:'Image',lpId:'c',src:'https://example.com'})}}});
  assert.equal(pages[0].length,1);assert.equal(pages[0][0].lpSessionAnnotation,true);
});
test('presentation commits never snapshot or autosave the raw lesson',()=>{
  let saved=0,changed;
  const raw={objects:[{type:'Textbox',text:'Original'}]},editor=Object.create(SlideEditor.prototype);
  Object.assign(editor,{ready:true,index:0,presentationActive:true,presentationVisible:true,slides:[raw],serialize:()=>({objects:[...raw.objects,stroke('a')]}),callbacks:{onChange:()=>saved++,onPresentationChange:(index,objects)=>changed=objects},syncMedia(){},updateSummary(){},historyChanged(){}});
  editor.commit();editor.snapshot();assert.equal(saved,0);assert.equal(editor.slides[0],raw);assert.deepEqual(changed,[stroke('a')]);
  assert.deepEqual(editor.documentSlides(),[raw]);
});
test('review overlays stay out of the saved lesson even during teacher edits',()=>{
  const editor=Object.create(SlideEditor.prototype);
  Object.assign(editor,{ready:true,index:0,slides:[{}],serialize:()=>({objects:[{type:'Textbox',text:'Original'},stroke('a')]})});
  editor.snapshot();assert.deepEqual(editor.slides[0].objects,[{type:'Textbox',text:'Original'}]);
  const doc={lesson:{title:'Lesson'},slides:editor.documentSlides()};assert.equal(presentationDigest(doc),presentationDigest({...doc,roster:['New roster']}));
});
test('presentation clear and undo affect the overlay while preserving authored annotations',async()=>{
  const content=new Rect({left:42});content.lpId='lesson';
  const authored=new Path('M 0 0 L 10 10');authored.lpId='authored';authored.lpAnnotation=true;
  const objects=[content,authored],editor=Object.create(SlideEditor.prototype);
  Object.assign(editor,{ready:true,index:0,token:1,readonly:true,presentationActive:true,presentationVisible:true,slides:[{}],canvas:{getObjects:()=>objects,toObject:keys=>({objects:objects.map(o=>o.toObject(keys))}),remove(...items){for(const o of items)objects.splice(objects.indexOf(o),1);},insertAt(i,o){objects.splice(i,0,o);}},callbacks:{},applyInteraction(){},syncMedia(){},updateSummary(){}});
  editor.ensureAnnotationHistory();const overlay=new Path('M 20 20 L 30 30');Object.assign(overlay,{lpId:'session',lpAnnotation:true,lpSessionAnnotation:true});objects.push(overlay);editor.recordAnnotations();editor.commit();
  editor.clearAnnotations();assert.deepEqual(objects.map(o=>o.lpId),['lesson','authored']);
  await editor.undo();assert.deepEqual(objects.map(o=>o.lpId),['lesson','authored','session']);assert.equal(objects[0],content);assert.equal(objects[1],authored);
});

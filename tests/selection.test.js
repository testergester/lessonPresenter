import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Rect,Textbox,Group,ActiveSelection,FabricImage,Line,util,setEnv} from 'fabric';
import {SlideEditor} from '../src/editor.js';
import {selectionPaint} from '../src/selection.js';

function harness(objects,active=objects[0]) {
  const editor=Object.create(SlideEditor.prototype);
  let selection=active;
  const canvas={getActiveObject:()=>selection,getActiveObjects:()=>selection instanceof ActiveSelection?selection.getObjects():selection?[selection]:[],getObjects:()=>objects,toObject:props=>({objects:objects.map(o=>o.toObject(props))}),requestRenderAll(){},fire(){},discardActiveObject(){if(selection instanceof ActiveSelection)selection.removeAll();selection=null;},remove(...items){objects=objects.filter(o=>!items.includes(o));},insertAt(index,...items){objects.splice(index,0,...items);},setActiveObject(object){selection=object;}};
  Object.assign(editor,{canvas,ready:true,loading:false,readonly:false,index:0,slides:[],histories:[{undo:[],redo:[]}],callbacks:{onChange(){},onSelection(value){editor.selectionState=value;}},updateSummary(){},syncMedia(){}});
  editor.slides=[editor.serialize()];editor.histories[0].undo=[JSON.stringify(editor.slides[0])];
  editor.reloadHistory=async()=>{objects=await util.enlivenObjects(editor.slides[0].objects);selection=null;};
  return editor;
}
setEnv({document:{createElement:()=>({getContext:()=>({measureText:text=>({width:text.length*10})})})},window:{devicePixelRatio:1}});
const shape=(id,fill,left)=>new Rect({lpId:id,fill,left,top:40,width:60,height:30});

test('single-object color preserves IDs and geometry and is undone/redone once',async()=>{
  const rect=shape('one','#00ff00',20),e=harness([rect]);const matrix=rect.calcTransformMatrix();
  e.updateSelected({fill:'#ff0000'});assert.equal(rect.fill,'#ff0000');assert.deepEqual(rect.calcTransformMatrix(),matrix);
  assert.equal(rect.lpId,'one');assert.equal(e.histories[0].undo.length,2);
  await e.undo();assert.equal(e.canvas.getObjects()[0].fill,'#00ff00');
  await e.redo();assert.equal(e.canvas.getObjects()[0].fill,'#ff0000');
});
test('actual ActiveSelection changes both children in one history entry without moving them',async()=>{
  const a=shape('a','#00ff00',20),b=shape('b','#0000ff',150),selection=new ActiveSelection([a,b]),e=harness([a,b],selection);
  const matrices=[a,b].map(o=>o.calcTransformMatrix());e.animations=[{id:'effect',targets:['a','b'],effect:'appear',trigger:'click',delay:0}];
  assert.equal(selectionPaint(selection).mixedColor,true);
  e.updateSelected({fill:'#ff0000'});
  assert.deepEqual([a.fill,b.fill],['#ff0000','#ff0000']);assert.deepEqual([a,b].map(o=>o.calcTransformMatrix()),matrices);
  assert.equal(e.selected(),selection);assert.equal(e.selectionState.count,2);assert.equal(e.selectionState.mixedColor,false);
  assert.equal(e.histories[0].undo.length,2);assert.deepEqual(e.serialize().lpAnimations[0].targets,['a','b']);
  await e.undo();assert.deepEqual(e.canvas.getObjects().map(o=>o.fill),['#00ff00','#0000ff']);
  await e.redo();assert.deepEqual(e.canvas.getObjects().map(o=>o.fill),['#ff0000','#ff0000']);
});
test('nested selected groups receive color while actual image objects keep their frame and pixels',()=>{
  const image=new FabricImage({width:10,height:10,classList:{add(){}}},{width:10,height:10,fill:'#ffffff',stroke:'#123456'});
  const rect=shape('child','#00ff00',0),group=new Group([new Group([rect]),image]);const e=harness([group]);
  const matrices=[rect,image].map(o=>o.calcTransformMatrix());e.updateSelected({fill:'#ff0000'});
  assert.equal(rect.fill,'#ff0000');assert.equal(image.fill,'#ffffff');assert.equal(image.stroke,'#123456');
  assert.deepEqual([rect,image].map(o=>o.calcTransformMatrix()),matrices);
  assert.equal(selectionPaint(image).paintable,false);
});
test('mixed image and shape ActiveSelection colors only the shape; geometry updates still target the container',()=>{
  const image=new FabricImage({width:10,height:10,classList:{add(){}}},{width:10,height:10});const rect=shape('shape','#00ff00',150);
  const selection=new ActiveSelection([image,rect]),e=harness([image,rect],selection);const imageFill=image.fill;
  e.updateSelected({fill:'#ff0000'});assert.equal(rect.fill,'#ff0000');assert.equal(image.fill,imageFill);
  const oldLeft=selection.left;const relativeLeft=rect.left;e.updateSelected({left:oldLeft+10});
  assert.equal(selection.left,oldLeft+10);assert.equal(rect.left,relativeLeft);
  e.readonly=true;e.updateSelected({fill:'#000000'});assert.equal(rect.fill,'#ff0000');
});

test('stroke-only lines use their visible paint and participate in mixed-color selection',()=>{
  const line=new Line([0,0,100,0],{stroke:'#0000ff',strokeWidth:4}),rect=shape('rect','#00ff00',150);
  const selection=new ActiveSelection([line,rect]),e=harness([line,rect],selection);
  assert.equal(selectionPaint(selection).mixedColor,true);e.updateSelected({fill:'#ff0000'});
  assert.equal(line.stroke,'#ff0000');assert.equal(rect.fill,'#ff0000');assert.equal(selectionPaint(selection).mixedColor,false);
});


test('group and ungroup preserve transformed geometry, IDs, layer position and one-step history',async()=>{
  const a=shape('a','#00ff00',20),b=shape('b','#0000ff',150),back=shape('back','#ffffff',0),front=shape('front','#ffffff',400);
  const selection=new ActiveSelection([a,b]);selection.set({angle:20,scaleX:1.3,scaleY:.8});
  const e=harness([back,a,b,front],selection);const matrices=[a,b].map(o=>o.calcTransformMatrix());
  const near=()=>[a,b].forEach((object,i)=>object.calcTransformMatrix().forEach((value,j)=>assert.ok(Math.abs(value-matrices[i][j])<1e-8)));
  assert.equal(e.groupSelection(),true);near();
  const group=e.selected();assert.ok(group instanceof Group);assert.deepEqual(e.canvas.getObjects(),[back,group,front]);
  assert.deepEqual(group.getObjects().map(o=>o.lpId),['a','b']);assert.equal(e.histories[0].undo.length,2);
  e.animations=[{id:'effect',targets:[group.lpId,'a'],effect:'appear',trigger:'click'}];
  assert.equal(e.ungroupSelection(),true);near();assert.deepEqual(e.canvas.getObjects(),[back,a,b,front]);
  assert.deepEqual(e.animations[0].targets,['a','b','a']);assert.equal(e.histories[0].undo.length,3);
  await e.undo();assert.equal(e.canvas.getObjects()[1].type,'group');
  await e.redo();assert.deepEqual(e.canvas.getObjects().map(o=>o.lpId),['back','a','b','front']);
});
test('grouped answers reveal transiently and child animation state does not leak into saved JSON',()=>{
  const answer=shape('answer','#00ff00',20);answer.set({lpRole:'answer',lpAnswerIndex:0});
  const group=new Group([answer,shape('normal','#0000ff',150)],{lpId:'group',objectCaching:false});const e=harness([group]);
  e.revealCount=0;e.applyVisibility();assert.equal(answer.visible,false);
  e.revealCount=1;e.applyVisibility();assert.equal(answer.visible,true);
  e.animationBase=new Map([['answer',{visible:true,opacity:1}]]);e.animationValues=new Map([['answer',.4]]);e.applyVisibility();
  assert.equal(answer.opacity,.4);assert.equal(e.serialize().objects[0].objects[0].opacity,1);
  e.revealCount=0;e.applyVisibility();assert.equal(answer.visible,false);assert.equal(e.serialize().objects[0].objects[0].visible,true);
  e.readonly=true;assert.equal(e.ungroupSelection(),false);
});

test('text styling toggles all four styles, preserves geometry and commits once per action',async()=>{
  const text=new Textbox('Lesson text',{lpId:'text',left:30,top:40,width:200});const e=harness([text]);
  for(const [style,property,on,off] of [['bold','fontWeight','bold','normal'],['italic','fontStyle','italic','normal'],['underline','underline',true,false],['strikethrough','linethrough',true,false]]){
    const before=e.histories[0].undo.length;
    assert.equal(e.toggleTextStyle(style),true);assert.equal(text[property],on);assert.equal(e.histories[0].undo.length,before+1);
    assert.equal(e.toggleTextStyle(style),true);assert.equal(text[property],off);
    assert.equal(text.left,30);assert.equal(text.top,40);assert.equal(text.lpId,'text');
  }
  e.toggleTextStyle('underline');await e.undo();assert.equal(e.canvas.getObjects()[0].underline,false);
  await e.redo();assert.equal(e.canvas.getObjects()[0].underline,true);
  e.readonly=true;assert.equal(e.toggleTextStyle('bold'),false);
});
test('styling highlighted words changes only the text range and mixed selection becomes consistent',()=>{
  const text=new Textbox('one two',{width:200});const e=harness([text]);
  text.initDelayedCursor=()=>{};text.isEditing=true;text.selectionStart=4;text.selectionEnd=7;
  e.toggleTextStyle('bold');assert.equal(text.fontWeight,'normal');
  assert.equal(text.getSelectionStyles(0,3,true).every(s=>s.fontWeight==='normal'),true);
  assert.equal(text.getSelectionStyles(4,7,true).every(s=>s.fontWeight==='bold'),true);
  e.toggleTextStyle('bold');assert.equal(text.getSelectionStyles(4,7,true).every(s=>s.fontWeight==='normal'),true);
  text.isEditing=false;const other=new Textbox('other',{width:200,fontWeight:'bold'});
  const multi=harness([text,other],new ActiveSelection([text,other]));multi.toggleTextStyle('bold');
  assert.equal(text.fontWeight,'bold');assert.equal(other.fontWeight,'bold');
  multi.toggleTextStyle('bold');assert.equal(text.fontWeight,'normal');assert.equal(other.fontWeight,'normal');
  assert.equal(harness([shape('rect','#000000',0)]).toggleTextStyle('underline'),false);
});

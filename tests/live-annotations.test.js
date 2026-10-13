import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Rect,Circle,Path} from 'fabric';
import {annotationCommand,annotationShape,annotationSignature,applyAnnotationCommand,decodeAnnotationCommand} from '../src/live-annotations.js';

const custom=['lpId','lpAnnotation','lpLiveAnnotation','lpAnnotationKind'];
const source=()=>({slides:[{objects:[{type:'Textbox',lpId:'source',text:'Original'},{type:'Rect',lpId:'authored',lpAnnotation:true,fill:'#ffffff',stroke:'#000000'}]}]});
const mark=(kind='square')=>annotationShape(kind,{x:100,y:100},{x:300,y:260},'#e11d48',4,'live-mark');
test('live shapes round-trip through Fabric and command validation with their geometry intact',()=>{
  for(const kind of ['square','circle','arrow']){
    const spec=mark(kind),object=kind==='square'?new Rect(spec):kind==='circle'?new Circle(spec):new Path(spec.path,spec);
    const json=object.toObject(custom),decoded=decodeAnnotationCommand(annotationCommand('create',0,json));
    assert.ok(decoded,kind);assert.equal(decoded.object.lpAnnotationKind,kind);
    assert.equal(annotationSignature(decoded.object),annotationSignature(json));
  }
  const pen=new Path('M 10 10 Q 20 20 30 10 L 40 20',{fill:null,stroke:'#e11d48',strokeWidth:4,lpId:'pen',lpLiveAnnotation:true,lpAnnotation:true,lpAnnotationKind:'pen'});
  assert.ok(decodeAnnotationCommand(annotationCommand('create',0,pen.toObject(custom))));
});
test('creating, moving, resizing, recoloring and deleting live marks preserves authored content',()=>{
  const doc=source(),before=structuredClone(doc),square=mark();
  const created=applyAnnotationCommand(doc,annotationCommand('create',0,square));assert.equal(created.slides[0].objects.length,3);
  const edited={...square,left:450,top:300,scaleX:1.5,scaleY:1.5,stroke:'#2563eb'};
  const updated=applyAnnotationCommand(created,annotationCommand('update',0,edited));
  assert.equal(updated.slides[0].objects[2].left,450);assert.equal(updated.slides[0].objects[2].scaleX,1.5);assert.equal(updated.slides[0].objects[2].stroke,'#2563eb');
  const deleted=applyAnnotationCommand(updated,annotationCommand('delete',0,square.lpId));assert.deepEqual(deleted,doc);assert.deepEqual(doc,before);
});
test('live edit commands cannot change or delete authored objects, duplicate IDs or change shape type',()=>{
  const doc=source();
  assert.equal(applyAnnotationCommand(doc,annotationCommand('delete',0,'authored')),null);
  assert.equal(applyAnnotationCommand(doc,annotationCommand('update',0,{...mark(),lpId:'authored'})),null);
  assert.equal(applyAnnotationCommand(doc,annotationCommand('create',0,{...mark(),lpId:'source'})),null);
  const created=applyAnnotationCommand(doc,annotationCommand('create',0,mark()));
  assert.equal(applyAnnotationCommand(created,annotationCommand('create',0,mark())),null);
  assert.equal(applyAnnotationCommand(created,annotationCommand('update',0,mark('circle'))),null);
  assert.equal(applyAnnotationCommand(doc,annotationCommand('create',2,mark())),null);
});
test('square and circle maintain equal sides in either drag direction; arrows point at the drag end',()=>{
  const square=annotationShape('square',{x:300,y:300},{x:100,y:160},'#e11d48',4,'mark');
  assert.equal(square.width,140);assert.equal(square.height,140);assert.equal(square.left,160);assert.equal(square.top,160);
  const circle=annotationShape('circle',{x:300,y:300},{x:100,y:160},'#e11d48',4,'mark');assert.equal(circle.radius,70);assert.equal(circle.left,160);
  const arrow=mark('arrow');assert.deepEqual(arrow.path[1],['L',300,260]);assert.deepEqual(arrow.path[3],['L',300,260]);
  assert.equal(annotationShape('circle',{x:0,y:0},{x:0,y:5},'#e11d48',4,'mark'),null);
});
test('malformed commands and unexpected embedded objects are rejected or stripped',()=>{
  const base=annotationCommand('create',0,mark());
  for(const change of [{index:-1},{index:300},{index:.5},{id:'unsafe/id'},{operation:'replace'},{object:'{'},{object:'x'.repeat(65537)}])assert.equal(decodeAnnotationCommand({...base,...change}),null);
  for(const change of [{type:'Image'},{scaleX:0},{scaleY:101},{left:Infinity},{stroke:'url(evil)'},{fill:'bad'},{strokeWidth:31},{opacity:2}])assert.equal(decodeAnnotationCommand(annotationCommand('create',0,{...mark(),...change})),null);
  assert.equal(decodeAnnotationCommand(annotationCommand('create',0,{...mark('arrow'),path:[['L','bad',1]]})),null);
  const safe=decodeAnnotationCommand(annotationCommand('create',0,{...mark(),clipPath:{type:'Image',src:'https://example.com'},src:'untrusted',lpLiveAnnotation:false})).object;
  assert.equal(safe.clipPath,undefined);assert.equal(safe.src,undefined);assert.equal(safe.lpLiveAnnotation,true);
});

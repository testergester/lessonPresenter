import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Rect,Point,util,classRegistry} from 'fabric';
import {VideoRect,topObjectAt,visibleVideos,videoTransform} from '../src/video.js';
import {validateDocument,packLesson,unpackLesson} from '../src/document.js';

function draw(object){const calls=[];const ctx=new Proxy({},{get(target,key){return target[key]??((...args)=>calls.push([key,...args]));},set(target,key,value){target[key]=value;return true;}});object._render(ctx);return calls;}
test('ordinary rectangles keep their renderer while videos draw their own poster exactly once',()=>{
  const props={width:640,height:360,fill:'#223d34'};
  assert.deepEqual(draw(new VideoRect(props)),draw(new Rect(props)));
  const calls=draw(new VideoRect({...props,lpVideoId:'dQw4w9WgXcQ'}));
  assert.equal(calls.filter(c=>c[0]==='fillText'&&c[1].includes('Play YouTube')).length,1);
});
test('legacy Rect video loads without migration and survives lesson export with targets intact',async()=>{
  const rect={type:'Rect',left:160,top:160,width:640,height:360,angle:18,scaleX:.7,scaleY:.8,opacity:.5,lpId:'video',lpVideoId:'dQw4w9WgXcQ'};
  const [video]=await util.enlivenObjects([rect]);assert.ok(video instanceof VideoRect);
  assert.equal(classRegistry.getClass('rect'),VideoRect);
  const doc={format:'lesson-presenter',version:1,lesson:{pages:[{title:'Video',questions:[]}]},slides:[{objects:[video.toObject(['lpId','lpVideoId'])],lpAnimations:[{id:'effect',targets:['video'],effect:'appear',trigger:'click',delay:0}]}]};
  validateDocument(doc);const bytes=await(await packLesson(doc)).arrayBuffer();
  const reopened=await unpackLesson({size:bytes.byteLength,arrayBuffer:async()=>bytes});
  assert.deepEqual(reopened,doc);const [restored]=await util.enlivenObjects(reopened.slides[0].objects);
  assert.ok(restored instanceof VideoRect);assert.equal(restored.lpId,'video');assert.equal(restored.angle,18);
  assert.equal(restored.lpVideoId,'dQw4w9WgXcQ');
});
test('video activation respects the topmost visible object and hidden/transparent objects',()=>{
  const v=new VideoRect({left:0,top:0,width:100,height:100,lpVideoId:'dQw4w9WgXcQ'}),above=new Rect({left:0,top:0,width:100,height:100});
  assert.equal(topObjectAt([v,above],new Point(50,50)),above);
  assert.equal(topObjectAt([above,v],new Point(50,50)),v);
  above.visible=false;assert.equal(topObjectAt([v,above],new Point(50,50)),v);
  v.opacity=0;assert.equal(visibleVideos([v]).length,0);assert.equal(topObjectAt([v],new Point(50,50)),undefined);
});
test('iframe transform matches Fabric rotation, scaling, flipping and viewport zoom',()=>{
  const v=new VideoRect({left:120,top:80,width:640,height:360,angle:35,scaleX:.7,scaleY:1.2,flipX:true});
  const viewport=[.5,0,0,.5,10,20],matrix=videoTransform(v,viewport);
  for(const point of [new Point(0,0),new Point(640,360)]){
    const expected=util.transformPoint(util.transformPoint(new Point(point.x-320,point.y-180),v.calcTransformMatrix()),viewport);
    const actual=util.transformPoint(point,matrix);assert.ok(actual.distanceFrom(expected)<1e-8);
  }
});

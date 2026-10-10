import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SlideEditor,SharpCanvas} from '../src/editor.js';
import {createSticker,upgradeStickers} from '../src/stickers.js';
import {validateDocument,packLesson,unpackLesson} from '../src/document.js';

test('renaming an inactive slide changes its heading in one history entry without touching IDs, layout or other content',()=>{
 const scene={objects:[{type:'Textbox',lpId:'heading',lpRole:'title',text:'Before',left:64,top:78,width:900,scaleX:1,angle:0},{type:'Rect',lpId:'shape',left:20,fill:'red'}],lpAnimations:[{targets:['heading']}]};
 const initial=JSON.stringify(scene);let changes=0;
 const editor={slides:[scene],histories:[{undo:[initial],redo:['old redo']}],readonly:false,ready:true,index:1,callbacks:{onChange(){changes++;}}};
 assert.equal(SlideEditor.prototype.renameSlideTitle.call(editor,0,'After'),true);
 assert.deepEqual(scene,{...JSON.parse(initial),objects:[{...JSON.parse(initial).objects[0],text:'After'},JSON.parse(initial).objects[1]]});
 assert.equal(editor.histories[0].undo.length,2);assert.deepEqual(editor.histories[0].redo,[]);assert.equal(changes,1);
 assert.equal(JSON.parse(editor.histories[0].undo[0]).objects[0].text,'Before');assert.equal(JSON.parse(editor.histories[0].undo[1]).objects[0].text,'After');
 editor.readonly=true;assert.equal(SlideEditor.prototype.renameSlideTitle.call(editor,0,'Blocked'),false);assert.equal(scene.objects[0].text,'After');
});
test('renaming the active heading uses the existing commit and leaves slides without a heading untouched',()=>{
 const heading={lpRole:'title',lpId:'keep',text:'Before',left:64,top:78,width:900,set(values){Object.assign(this,values);},setCoords(){}};
 let commits=0,renders=0;const editor={slides:[{objects:[]}],ready:true,loading:false,readonly:false,index:0,canvas:{getObjects:()=>[heading],requestRenderAll(){renders++;}},commit(){commits++;}};
 assert.equal(SlideEditor.prototype.renameSlideTitle.call(editor,0,'After'),true);assert.equal(heading.text,'After');assert.equal(heading.lpId,'keep');assert.equal(heading.left,64);assert.equal(heading.width,900);assert.equal(commits,1);assert.equal(renders,1);
 assert.equal(SlideEditor.prototype.renameSlideTitle.call(editor,0,'After'),false);editor.canvas.getObjects=()=>[];assert.equal(SlideEditor.prototype.renameSlideTitle.call(editor,0,'Metadata only'),false);assert.equal(commits,1);
});

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
test('canvas uses a 2x minimum while honoring explicitly disabled retina rendering',()=>{
  assert.equal(SharpCanvas.prototype.getRetinaScaling.call({enableRetinaScaling:true}),2);
  assert.equal(SharpCanvas.prototype.getRetinaScaling.call({enableRetinaScaling:false}),1);
});
test('all built-in stickers serialize as editable vector groups and survive a lesson round trip',async()=>{
  const properties=['lpId','lpSticker','lpLabel'];
  const objects=['⭐','✅','💡','🎯','👏','❓'].map(symbol=>{
    const sticker=createSticker(symbol);assert.equal(sticker.objectCaching,false);
    const data=sticker.toObject(properties);assert.equal(data.type,'Group');assert.equal(data.lpSticker,symbol);
    assert.ok(data.objects.every(object=>!['Textbox','Image'].includes(object.type)));return data;
  });
  const doc={format:'lesson-presenter',version:1,lesson:{pages:[{title:'Stickers',questions:[]}]},slides:[{objects}]};
  validateDocument(doc);const blob=await packLesson(doc);const bytes=await blob.arrayBuffer();
  assert.deepEqual(await unpackLesson({size:bytes.byteLength,arrayBuffer:async()=>bytes}),JSON.parse(JSON.stringify(doc)));
});
test('legacy emoji stickers upgrade without moving or resizing their bounding boxes',()=>{
  const scene={objects:[{type:'Textbox',text:'✅',lpLabel:'Sticker',lpId:'keep-id',left:90,top:140,width:160,height:120,scaleX:3,scaleY:2,angle:15},{type:'Textbox',text:'A real text box',lpId:'text'}]};
  upgradeStickers(scene,['lpId','lpSticker','lpLabel']);const sticker=scene.objects[0];
  assert.equal(sticker.type,'Group');assert.equal(sticker.lpId,'keep-id');assert.equal(sticker.lpSticker,'✅');
  assert.equal(sticker.left,90);assert.equal(sticker.top,140);assert.equal(sticker.angle,15);
  assert.ok(Math.abs(sticker.width*sticker.scaleX-480)<.02);assert.ok(Math.abs(sticker.height*sticker.scaleY-240)<.02);
  assert.equal(scene.objects[1].text,'A real text box');
});
test('workspace zoom changes only rendering, clamps limits and rejects invalid values',()=>{
  const object={left:160,top:80,scaleX:1,scaleY:1};
  const editor={zoom:1,slides:[{objects:[object]}],resizeCalls:0,resize(){this.resizeCalls++;}};
  SlideEditor.prototype.setZoom.call(editor,1.75);assert.equal(editor.zoom,1.75);
  SlideEditor.prototype.setZoom.call(editor,10);assert.equal(editor.zoom,3);
  SlideEditor.prototype.setZoom.call(editor,0);assert.equal(editor.zoom,.25);
  SlideEditor.prototype.setZoom.call(editor,1);assert.equal(editor.zoom,1);
  SlideEditor.prototype.setZoom.call(editor,NaN);assert.equal(editor.zoom,1);assert.equal(editor.resizeCalls,4);
  assert.deepEqual(object,{left:160,top:80,scaleX:1,scaleY:1});
});

test('URL image insertion requests CORS, keeps its source and ignores a stale slide',async()=>{
  const {StyledImage}=await import('../src/image.js');const original=StyledImage.fromURL;let options,source,added;
  const editor={ready:true,readonly:false,token:1,add:image=>added=image};
  try{
    StyledImage.fromURL=async(url,settings)=>{source=url;options=settings;return {width:1200,height:800,set(values){Object.assign(this,values);}};};
    await SlideEditor.prototype.addImageFromURL.call(editor,'https://example.com/image.png');
    assert.equal(source,'https://example.com/image.png');assert.equal(options.crossOrigin,'anonymous');assert.equal(added.scaleX,.5);
    added=null;StyledImage.fromURL=async()=>{editor.token++;return {width:100,height:100,set(){}};};
    await SlideEditor.prototype.addImageFromURL.call(editor,'https://example.com/image.png');assert.equal(added,null);
    StyledImage.fromURL=async()=>{throw new Error('CORS');};await assert.rejects(()=>SlideEditor.prototype.addImageFromURL.call(editor,'https://example.com/image.png'),/cross-origin/);
  }finally{StyledImage.fromURL=original;}
});

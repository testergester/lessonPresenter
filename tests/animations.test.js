import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AnimationPlayer,animationBatch,initialAnimationVisibility} from '../src/animations.js';
import {SlideEditor} from '../src/editor.js';
import {packLesson,unpackLesson,validateDocument} from '../src/document.js';
const effects=[{id:'1',effect:'appear',trigger:'click',delay:0,targets:['a','b']},{id:'2',effect:'appear',trigger:'with',delay:100,targets:['c']},{id:'3',effect:'disappear',trigger:'after',delay:50,targets:['a']},{id:'4',effect:'disappear',trigger:'click',delay:0,targets:['b']}];
test('with previous shares the previous start, after previous waits for its end, clicks split batches',()=>{
 const batch=animationBatch(effects);assert.deepEqual(batch.steps.map(s=>s.start),[0,100,450]);assert.equal(batch.next,3);assert.equal(batch.duration,750);
 assert.deepEqual([...initialAnimationVisibility(effects)],[['a',false],['b',false],['c',false]]);
});
test('multi-object playback respects click gates and cancels outstanding frames',()=>{
 let time=0,callback,cancelled=false,values;
 const player=new AnimationPlayer(effects,v=>values=new Map(v),{now:()=>time,frame:fn=>{callback=fn;return 1;},cancel:()=>cancelled=true});
 assert.equal(values.get('a'),0);assert.equal(player.running,false);assert.equal(player.next(),true);
 time=150;callback();assert.equal(values.get('a'),.5);assert.equal(values.get('b'),.5);
 time=750;callback();assert.equal(values.get('a'),0);assert.equal(values.get('b'),1);assert.equal(player.running,false);
 player.next();time=900;callback();assert.equal(values.get('b'),.5);player.stop();assert.equal(cancelled,true);
});
test('an automatic first effect starts on slide entry',()=>{
 let frames=0;const player=new AnimationPlayer([{...effects[0],trigger:'after'}],()=>{}, {now:()=>0,frame:()=>++frames,cancel:()=>{}});
 assert.equal(player.running,true);assert.equal(frames,1);player.stop();
});
test('adding a multi-selection creates one persisted effect and playback does not alter saved visibility',()=>{
 const objects=[{lpId:'a'},{lpId:'b'}];const editor={canvas:{getActiveObjects:()=>objects},commit(){this.committed=true;}};
 assert.equal(SlideEditor.prototype.addAnimation.call(editor,'appear','click',0),true);assert.deepEqual(editor.animations[0].targets,['a','b']);assert.equal(editor.committed,true);
 const data=SlideEditor.prototype.serialize.call({canvas:{toObject:()=>({objects:[{lpId:'a',visible:false,opacity:0},{lpId:'b',visible:true,opacity:.2}]})},animations:editor.animations,animationBase:new Map([['a',{visible:true,opacity:1}],['b',{visible:true,opacity:.8}]])});
 assert.equal(data.objects[0].visible,true);assert.equal(data.objects[0].opacity,1);assert.equal(data.objects[1].opacity,.8);assert.equal(data.lpAnimations.length,1);
});
test('animation sequences survive package export and invalid timing is rejected',async()=>{
 const doc={format:'lesson-presenter',version:1,lesson:{pages:[{title:'Test',questions:[]}]},slides:[{objects:[{type:'Rect',lpId:'a'}],lpAnimations:effects}]};
 const bytes=await (await packLesson(doc)).arrayBuffer();assert.deepEqual((await unpackLesson({size:bytes.byteLength,arrayBuffer:async()=>bytes})).slides[0].lpAnimations,effects);
 const bad=structuredClone(doc);bad.slides[0].lpAnimations[0].delay=-1;assert.throws(()=>validateDocument(bad),/animation/);
});
test('one at a time creates one click per object in layer order and one undoable edit',()=>{
 const a={lpId:'a'},b={lpId:'b'};let commits=0;
 const editor={canvas:{getActiveObjects:()=>[b,a],getObjects:()=>[a,b]},commit(){commits++;}};
 SlideEditor.prototype.addAnimation.call(editor,'appear','click',100,'individual');
 assert.deepEqual(editor.animations.map(effect=>effect.targets),[['a'],['b']]);
 assert.deepEqual(editor.animations.map(effect=>effect.trigger),['click','click']);
 assert.equal(animationBatch(editor.animations).next,1);assert.equal(commits,1);
});
test('individual automatic effects sequence after the first chosen start for both effect types',()=>{
 for(const effect of ['appear','disappear'])for(const trigger of ['after','with']){
  const objects=[{lpId:'a'},{lpId:'b'},{lpId:'c'}];
  const editor={canvas:{getActiveObjects:()=>objects,getObjects:()=>objects},commit(){}};
  SlideEditor.prototype.addAnimation.call(editor,effect,trigger,100,'individual');
  assert.deepEqual(editor.animations.map(item=>item.trigger),[trigger,'after','after']);
  assert.deepEqual(animationBatch(editor.animations).steps.map(step=>step.start),[100,500,900]);
  assert.ok(editor.animations.every(item=>item.effect===effect));
 }
});
test('reordering effects preserves targets and timing, changes playback order, and commits once',()=>{
 let commits=0;const editor={animations:structuredClone(effects),commit(){commits++;}};
 const moved=editor.animations[3];
 assert.equal(SlideEditor.prototype.moveAnimation.call(editor,'4',0),true);
 assert.deepEqual(editor.animations.map(effect=>effect.id),['4','1','2','3']);
 assert.equal(editor.animations[0],moved);assert.deepEqual(moved.targets,['b']);assert.equal(moved.trigger,'click');
 assert.equal(animationBatch(editor.animations).steps[0].effect,'disappear');assert.equal(commits,1);
 for(const [id,to] of [['missing',0],['4',-1],['4',4],['4',0]])assert.equal(SlideEditor.prototype.moveAnimation.call(editor,id,to),false);
 editor.readonly=true;assert.equal(SlideEditor.prototype.moveAnimation.call(editor,'4',1),false);assert.equal(commits,1);
});
test('animation previews resolve target content in effect order and identify missing objects',()=>{
 const objects=[{lpId:'text',type:'textbox',text:'The actual lesson text'},{lpId:'image',type:'image',getSrc:()=> 'data:image/png;base64,preview'},{lpId:'shape',type:'rect'}];
 const editor={canvas:{getObjects:()=>objects}};
 const targets=SlideEditor.prototype.animationTargets.call(editor,{targets:['image','text','shape','deleted']});
 assert.equal(targets[0].image,'data:image/png;base64,preview');assert.equal(targets[1].label,'The actual lesson text');
 assert.equal(targets[2].label,'Rect');assert.equal(targets[3].label,'Removed object');
});

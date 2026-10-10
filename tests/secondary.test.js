import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Rect} from 'fabric';
import {SlideEditor} from '../src/editor.js';
import {AnimationPlayer} from '../src/animations.js';

test('playback reports empty, ready, running and completed states',()=>{
 const empty=new AnimationPlayer([],()=>{},{});assert.equal(empty.state.total,0);assert.equal(empty.state.finished,true);
 let time=0,tick;const states=[];
 const player=new AnimationPlayer([{effect:'appear',trigger:'click',targets:['a']}],()=>{},{now:()=>time,frame:fn=>{tick=fn;return 1;},onStateChange:state=>states.push(state)});
 assert.equal(player.state.started,false);player.next();assert.equal(player.state.running,true);
 time=300;tick();assert.equal(player.state.finished,true);assert.equal(player.next(),false);
 assert.deepEqual(states.map(s=>s.running),[false,true,false]);
});

test('preview undo restores only session annotations and preserves lesson content and existing marks',async()=>{
 const content=new Rect({left:42,fill:'blue'});content.lpId='lesson';
 const existing=new Rect({left:70});existing.lpId='old';existing.lpAnnotation=true;
 const objects=[content,existing];
 const editor=Object.create(SlideEditor.prototype);
 Object.assign(editor,{index:0,token:1,ready:true,readonly:true,animations:[],canvas:{getObjects:()=>objects,toObject:keys=>({objects:objects.map(o=>o.toObject(keys))}),remove(...items){for(const o of items)objects.splice(objects.indexOf(o),1);},insertAt(i,o){objects.splice(i,0,o);}},applyInteraction(){},commit(){this.historyChanged();},callbacks:{onHistory:state=>editor.state=state},histories:[{undo:['teacher edit','another edit'],redo:[]}]});
 editor.ensureAnnotationHistory();await editor.undo();assert.equal(objects[0],content);assert.equal(objects.length,2);
 const added=new Rect({left:90});added.lpId='new';added.lpAnnotation=true;objects.push(added);editor.recordAnnotations();editor.historyChanged();assert.equal(editor.state.undo,true);assert.equal(editor.state.editing,false);
 await editor.undo();assert.equal(objects.length,2);assert.equal(objects[0],content);assert.equal(objects[1].lpId,'old');assert.equal(content.left,42);
 await editor.redo();assert.deepEqual(objects.map(o=>o.lpId),['lesson','old','new']);assert.equal(objects[0],content);assert.deepEqual(editor.histories[0].undo,['teacher edit','another edit']);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clampFloatingPosition,installFloatingTools} from '../src/floating-tools.js';

test('floating tool positions remain reachable after dragging past edges or resizing',()=>{
 assert.deepEqual(clampFloatingPosition(-100,900,44,44,320,600),{x:8,y:548});
 assert.deepEqual(clampFloatingPosition(900,-20,44,44,320,600),{x:268,y:8});
 assert.deepEqual(clampFloatingPosition(10,20,340,80,320,600),{x:8,y:20});
});
function harness(){
 const listeners=new Map();
 const node=()=>({hidden:false,style:{},attributes:{},classList:{add(){},remove(){},toggle(){}},contains(target){return target===this;},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,fn){let byType=listeners.get(this)||{};(byType[k]||=[]).push(fn);listeners.set(this,byType);},getBoundingClientRect(){return {width:300,height:80};},querySelector(){return null;}});
 const dock=node(),handle=node(),content=node();dock.contains=target=>[dock,handle,content].includes(target);
 const doc=node(),win=node();win.innerWidth=400;win.innerHeight=700;doc.activeElement=null;
 handle.setPointerCapture=id=>handle.capture=id;handle.hasPointerCapture=id=>handle.capture===id;handle.releasePointerCapture=()=>handle.capture=null;
 globalThis.document=doc;globalThis.window=win;globalThis.ResizeObserver=class{observe(){}};
 const fire=(target,type,detail={})=>(listeners.get(target)?.[type]||[]).forEach(fn=>fn({target,pointerId:1,pointerType:'mouse',button:0,clientX:190,clientY:650,preventDefault(){},stopPropagation(){},...detail}));
 const tools=installFloatingTools(dock,handle,content);tools.refresh();return {dock,handle,content,doc,win,fire,tools};
}
test('hover expands, leaving collapses, and touch taps toggle the controls',async()=>{
 const h=harness();assert.equal(h.content.hidden,true);assert.equal(h.handle.attributes['aria-expanded'],'false');
 h.fire(h.dock,'pointerenter');assert.equal(h.content.hidden,false);
 h.fire(h.dock,'pointerleave');await new Promise(r=>setTimeout(r,220));assert.equal(h.content.hidden,true);
 h.fire(h.handle,'click',{pointerType:'touch',detail:1});assert.equal(h.content.hidden,false);
 h.fire(h.handle,'click',{pointerType:'touch',detail:1});assert.equal(h.content.hidden,true);
 h.fire(h.handle,'click',{pointerType:'touch',detail:1});h.fire(h.doc,'pointerdown',{target:{}});assert.equal(h.content.hidden,true);
});
test('collapsed touch drag moves and clamps the circle without opening it on release',()=>{
 const h=harness();h.fire(h.handle,'pointerdown',{pointerType:'touch'});
 h.fire(h.handle,'pointermove',{pointerType:'touch',clientX:-100,clientY:900});
 assert.equal(h.dock.style.left,'8px');assert.equal(h.dock.style.top,'648px');
 h.fire(h.handle,'pointerup',{pointerType:'touch'});h.fire(h.handle,'click',{pointerType:'touch',detail:1});
 assert.equal(h.content.hidden,true);assert.equal(h.handle.capture,null);
 h.win.innerWidth=320;h.win.innerHeight=400;h.tools.refresh();assert.equal(h.dock.style.top,'348px');
});
test('expanded controls drag with the handle and keyboard movement does not advance slides',()=>{
 const h=harness();h.fire(h.dock,'pointerenter');h.fire(h.handle,'pointerdown');h.fire(h.handle,'pointermove',{clientX:300,clientY:200});
 assert.equal(h.content.hidden,false);assert.equal(h.dock.style.left,'288px');assert.equal(h.dock.style.top,'190px');
 h.fire(h.handle,'pointercancel');assert.equal(h.handle.capture,null);
 let prevented=false,stopped=false;
 h.fire(h.handle,'keydown',{key:'ArrowLeft',preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
 assert.equal(h.dock.style.left,'280px');assert.ok(prevented&&stopped);
});

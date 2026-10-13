import {Canvas,PencilBrush,Rect,Circle,Path,util} from 'fabric';
import {annotationCommand,annotationShape,annotationSignature,decodeAnnotationCommand} from './live-annotations.js';

const custom=['lpId','lpAnnotation','lpLiveAnnotation','lpAnnotationKind'];
export class RemoteInkEditor {
  constructor(host,element,{onChange,onDraft,onSelection=()=>{},onTool=()=>{},onError=()=>{}}){
    this.host=host;this.onChange=onChange;this.onDraft=onDraft;this.onSelection=onSelection;this.onTool=onTool;this.onError=onError;
    this.canvas=new Canvas(element,{width:1280,height:720,selection:false,enablePointerEvents:true,preserveObjectStacking:true,targetFindTolerance:10,uniformScaling:true});
    this.canvas.freeDrawingBrush=new PencilBrush(this.canvas);this.canvas.freeDrawingBrush.color='#e11d48';this.canvas.freeDrawingBrush.width=4;
    this.canvas.wrapperEl.classList.add('remote-ink-canvas');
    this.enabled=false;this.tool='pen';this.index=-1;this.optimistic=new Map();this.remote=[];this.rendering=false;this.interacting=false;this.syncing=false;this.selectedId=null;
    this.color='#e11d48';this.width=4;this.penPoints=null;this.shape=null;this.transformTimer=null;this.pendingTransform=null;this.disposed=false;
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);this.resize();
    this.canvas.on('mouse:down',event=>this.down(event));this.canvas.on('mouse:move',event=>this.move(event));this.canvas.on('mouse:up',()=>this.up());
    this.canvas.on('path:created',event=>this.createdPath(event.path));
    for(const name of ['selection:created','selection:updated','selection:cleared'])this.canvas.on(name,()=>this.selection());
    for(const name of ['object:moving','object:scaling','object:rotating'])this.canvas.on(name,({target})=>{if(this.enabled&&!this.syncing&&target?.lpLiveAnnotation)this.queueTransform(target);});
    this.canvas.on('object:modified',({target})=>{if(this.enabled&&!this.syncing&&target?.lpLiveAnnotation){this.flushTransform(target);this.selection(true);}});
    this.canvas.upperCanvasEl.addEventListener('pointercancel',()=>this.cancelGesture());
    host.addEventListener('keydown',event=>{
      if(!this.enabled)return;
      if(['Delete','Backspace'].includes(event.key)){event.preventDefault();this.deleteSelected();}
      const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key],object=this.selected();
      if(delta&&object){event.preventDefault();const step=event.shiftKey?20:5;object.set({left:object.left+delta[0]*step,top:object.top+delta[1]*step});object.setCoords();this.canvas.requestRenderAll();this.commit('update',object);}
    });
    this.interaction();
  }
  resize(){
    if(this.disposed)return;const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;
    const scale=Math.min(w/1280,h/720);this.canvas.setDimensions({width:w,height:h});this.canvas.setViewportTransform([scale,0,0,scale,(w-1280*scale)/2,(h-720*scale)/2]);
  }
  configure(object){object.set({selectable:this.enabled&&this.tool==='select',evented:this.enabled&&this.tool==='select',cornerSize:22,touchCornerSize:34,cornerStyle:'circle',cornerColor:'#244d40',borderColor:'#244d40',transparentCorners:false,padding:5,lockScalingFlip:true});object.setControlsVisibility({mt:false,mb:false,ml:false,mr:false});return object;}
  interaction(){
    this.canvas.isDrawingMode=this.enabled&&this.tool==='pen';this.canvas.skipTargetFind=!this.enabled||this.tool!=='select';
    this.canvas.getObjects().forEach(object=>this.configure(object));this.canvas.requestRenderAll();
  }
  enable(value){
    if(this.enabled===value)return;this.enabled=value;
    if(!value){this.cancelGesture();this.canvas.discardActiveObject();this.selectedId=null;this.onSelection(null);}
    this.interaction();
  }
  setTool(tool){
    if(!['pen','select','square','circle','arrow'].includes(tool))return;
    this.tool=tool;if(tool!=='select')this.canvas.discardActiveObject();this.interaction();this.onTool(tool);
  }
  selected(){return this.canvas.getActiveObject();}
  selection(reset=false){
    if(this.syncing)return;const object=this.selected(),id=object?.lpId||null;
    if(object){this.color=object.stroke;this.width=object.strokeWidth;this.canvas.freeDrawingBrush.color=this.color;this.canvas.freeDrawingBrush.width=this.width;}
    if(reset||id!==this.selectedId)this.scaleBase=object?{x:object.scaleX,y:object.scaleY}:null;
    const changed=id!==this.selectedId;this.selectedId=id;this.onSelection(object,reset||changed);
  }
  select(id){this.setTool('select');const object=this.canvas.getObjects().find(value=>value.lpId===id);if(object)this.canvas.setActiveObject(object);else this.canvas.discardActiveObject();this.canvas.requestRenderAll();this.selection();}
  point(event){const point=this.canvas.getScenePoint(event.e);return {x:Math.max(0,Math.min(1280,point.x)),y:Math.max(0,Math.min(720,point.y))};}
  down(event){
    if(!this.enabled||this.index<0)return;this.interacting=true;this.gestureIndex=this.index;this.start=this.point(event);
    if(this.tool==='pen'){this.penPoints=[[this.start.x,this.start.y]];this.draft();}
    else if(this.tool!=='select')this.shapeId=crypto.randomUUID();
  }
  move(event){
    if(!this.enabled||!this.interacting)return;const end=this.point(event);
    if(this.penPoints){this.penPoints.push([end.x,end.y]);if(this.penPoints.length>300)this.penPoints=this.penPoints.filter((_,i)=>i%2===0);this.draft();}
    else if(this.tool!=='select'){
      const spec=annotationShape(this.tool,this.start,end,this.color,this.width,this.shapeId);if(!spec)return;
      if(this.shape)this.canvas.remove(this.shape);
      this.shape=spec.type==='Rect'?new Rect(spec):spec.type==='Circle'?new Circle(spec):new Path(spec.path,spec);
      this.configure(this.shape);this.canvas.add(this.shape);this.canvas.requestRenderAll();this.draft();
    }
  }
  draft(){
    let points=this.penPoints;
    if(this.shape){const object=this.shape;
      if(object.type.toLowerCase()==='circle')points=Array.from({length:37},(_,i)=>{const angle=i/36*Math.PI*2;return [object.left+object.radius+Math.cos(angle)*object.radius,object.top+object.radius+Math.sin(angle)*object.radius];});
      else if(object.type.toLowerCase()==='rect')points=[[object.left,object.top],[object.left+object.width,object.top],[object.left+object.width,object.top+object.height],[object.left,object.top+object.height],[object.left,object.top]];
      else points=object.path.map(segment=>segment.slice(1));
    }
    this.onDraft(points?{index:this.gestureIndex,color:this.color,width:this.width,points}:null);
  }
  createdPath(path){
    if(!this.enabled||this.gestureIndex!==this.index){this.canvas.remove(path);return;}
    path.set({lpId:crypto.randomUUID(),lpLiveAnnotation:true,lpAnnotation:true,lpAnnotationKind:'pen',strokeUniform:true});
    this.configure(path);this.commit('create',path);this.penPoints=null;this.onDraft(null);this.setTool('select');this.canvas.setActiveObject(path);this.selection(true);
  }
  up(){
    this.interacting=false;this.penPoints=null;
    if(this.shape){const shape=this.shape;this.shape=null;this.commit('create',shape);this.setTool('select');this.canvas.setActiveObject(shape);this.selection(true);}
    this.onDraft(null);this.render();
  }
  cancelGesture(){
    if(this.shape)this.canvas.remove(this.shape);this.shape=null;this.penPoints=null;this.interacting=false;this.gestureIndex=-1;
    this.canvas.clearContext(this.canvas.contextTop);this.onDraft(null);
  }
  commit(operation,object){
    const json=operation==='delete'?object.lpId:object.toObject(custom),command=annotationCommand(operation,this.index,json);
    if(!decodeAnnotationCommand(command)){this.onError('This mark is too large to sync. Try a shorter drawing.');return;}
    this.optimistic.set(command.id,{index:this.index,object:operation==='delete'?null:json});this.onChange(command);
  }
  queueTransform(object){this.optimistic.set(object.lpId,{index:this.index,object:object.toObject(custom)});this.pendingTransform=object;if(!this.transformTimer)this.transformTimer=setTimeout(()=>this.flushTransform(),50);}
  flushTransform(object=this.pendingTransform){clearTimeout(this.transformTimer);this.transformTimer=null;this.pendingTransform=null;if(object&&this.enabled&&!this.disposed)this.commit('update',object);}
  style(color,width){
    this.color=color;this.width=width;this.canvas.freeDrawingBrush.color=color;this.canvas.freeDrawingBrush.width=width;
    const object=this.selected();if(!object||!this.enabled)return;
    const fill=object.fill&&object.fill!=='transparent'?color:object.fill;
    object.set({stroke:color,strokeWidth:width,fill});object.setCoords();this.canvas.requestRenderAll();this.commit('update',object);
  }
  size(percent){
    const object=this.selected();if(!object||!this.scaleBase)return;
    object.set({scaleX:this.scaleBase.x*percent/100,scaleY:this.scaleBase.y*percent/100});object.setCoords();this.canvas.requestRenderAll();this.queueTransform(object);
  }
  deleteSelected(){
    const object=this.selected();if(!object||!object.lpLiveAnnotation)return;
    clearTimeout(this.transformTimer);this.transformTimer=null;this.pendingTransform=null;this.commit('delete',object);this.canvas.remove(object);this.canvas.discardActiveObject();this.selection();this.canvas.requestRenderAll();
  }
  update(doc,index){
    if(this.index!==index){this.cancelGesture();this.flushTransform();this.index=index;this.canvas.discardActiveObject();this.selectedId=null;this.scaleBase=null;this.onSelection(null);}
    this.remote=doc.slides[index]?.objects.filter(object=>object.lpLiveAnnotation)||[];
    for(const [id,pending] of this.optimistic){
      if(pending.index!==index)continue;const remote=this.remote.find(object=>object.lpId===id);
      if(pending.object?remote&&annotationSignature(remote)===annotationSignature(pending.object):!remote)this.optimistic.delete(id);
    }
    this.render();
  }
  async render(){
    if(this.disposed)return;if(this.rendering||this.interacting){this.needsRender=true;return;}
    this.rendering=true;this.needsRender=false;
    try{
      const objects=new Map(this.remote.map(object=>[object.lpId,object]));
      for(const [id,pending] of this.optimistic)if(pending.index===this.index){if(pending.object)objects.set(id,pending.object);else objects.delete(id);}
      const index=this.index,selection=this.selectedId,enlivened=await util.enlivenObjects([...objects.values()]);
      if(this.disposed||index!==this.index||this.interacting){this.needsRender=true;return;}
      this.syncing=true;this.canvas.remove(...this.canvas.getObjects());enlivened.forEach(object=>this.canvas.add(this.configure(object)));
      if(selection&&this.enabled&&this.tool==='select'){const object=enlivened.find(value=>value.lpId===selection);if(object)this.canvas.setActiveObject(object);}
      this.syncing=false;this.selection();this.canvas.requestRenderAll();
    }catch(error){this.syncing=false;this.onError(`Drawing could not be displayed: ${error.message}`);}
    finally{this.rendering=false;if(this.needsRender&&!this.interacting&&!this.disposed)this.render();}
  }
  dispose(){this.disposed=true;clearTimeout(this.transformTimer);this.resizeObserver.disconnect();this.canvas.dispose();}
}

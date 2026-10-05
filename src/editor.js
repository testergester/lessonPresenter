import {Canvas, StaticCanvas, Textbox, Rect, Circle, Triangle, Line, FabricImage, FabricObject, PencilBrush, ActiveSelection, util} from 'fabric';
import {SLIDE_WIDTH as W, SLIDE_HEIGHT as H, fitSlide, youtubeId, validateDocument} from './document.js';

const CUSTOM = ['lpId','lpRole','lpAnswerIndex','lpVideoId','lpAnnotation','lpLabel'];
FabricObject.customProperties = CUSTOM;
FabricObject.ownDefaults.originX='left';
FabricObject.ownDefaults.originY='top';
FabricObject.ownDefaults.cornerColor = '#244d40';
FabricObject.ownDefaults.borderColor = '#244d40';
FabricObject.ownDefaults.transparentCorners = false;
FabricObject.ownDefaults.cornerSize = 10;
const uid = () => crypto.randomUUID();
const textValue = value => typeof value === 'string' ? value : value?.text || value?.prompt || JSON.stringify(value);
const common = {fontFamily:'Arial',fill:'#293c35',originX:'left',originY:'top',objectCaching:false};
function textbox(text, x, y, width, size = 26, properties = {}) {
  return new Textbox(String(text), {...common, left:x,top:y,width,fontSize:size,lineHeight:1.25,lpId:uid(),...properties});
}
export function stageToSlide(stage) {
  const objects = [];
  let y = 62;
  const addText = (text, size, properties={}) => {
    const object = textbox(text,64,y,1152,size,properties);objects.push(object);y+=object.height+22;return object;
  };
  addText((stage.stageType || 'Activity').replaceAll('_',' ').toUpperCase(),16,{fill:'#7b8d65',charSpacing:100});
  addText(stage.title || 'Untitled slide',48,{fontFamily:'Georgia',lpRole:'title'});
  if (stage.content) addText(stage.content,26,{fill:'#687565'});
  if (stage.instructions?.length) {
    const instructions = textbox(stage.instructions.map(textValue).join('\n'),84,y+18,1112,27);
    objects.push(new Rect({left:64,top:y,width:1152,height:instructions.height+36,fill:'#edf3e8',rx:12,ry:12,lpId:uid()}),instructions);
    y+=instructions.height+60;
  }
  if (stage.prompts?.length) addText(stage.prompts.map(textValue).join('   •   '),22,{fill:'#7b8d65'});
  stage.items?.forEach(item=>addText(textValue(item),24));
  let answerIndex=0;
  stage.questions?.forEach((question,index)=>{
    addText(`${index+1}. ${question.prompt}`,27);
    if (question.answer) addText(question.answer,23,{fill:'#507344',lpRole:'answer',lpAnswerIndex:answerIndex++});
  });
  if (stage.examples?.length) addText(stage.examples.map(textValue).join('\n'),25,{fontStyle:'italic',fill:'#797b64'});
  // Scale generated content to stay within the slide. User-created slides keep a fixed 16:9 size.
  if (y > H-36) {
    const scale = (H-72)/(y-40);
    objects.forEach(object=>{object.set({left:64+(object.left-64)*scale,top:36+(object.top-36)*scale,scaleX:scale,scaleY:scale});});
  }
  return {version:'7.4.0',background:'#fffefb',objects:objects.map(object=>object.toObject(CUSTOM))};
}

export class SlideEditor {
  constructor(host, {onChange,onSelection,onHistory,onError,onTitleChange}) {
    this.host=host;this.callbacks={onChange,onSelection,onHistory,onError,onTitleChange};
    this.slides=[];this.histories=[];this.index=-1;this.ready=false;this.loading=false;this.readonly=false;this.preview=false;this.revealCount=0;this.token=0;
    this.queue=Promise.resolve();
    host.classList.add('fabric-board');
    const canvasElement=document.createElement('canvas');canvasElement.setAttribute('aria-label','Editable lesson slide. Use the board toolbar to add content.');
    host.append(canvasElement);
    this.canvas=new Canvas(canvasElement,{width:W,height:H,backgroundColor:'#fffefb',preserveObjectStacking:true,selection:true,stopContextMenu:true,fireRightClick:false});
    this.canvas.freeDrawingBrush=new PencilBrush(this.canvas);
    this.canvas.freeDrawingBrush.color='#e11d48';this.canvas.freeDrawingBrush.width=4;
    this.summary=document.createElement('div');this.summary.className='canvas-accessibility';this.summary.setAttribute('aria-live','polite');host.append(this.summary);
    this.media=document.createElement('div');this.media.className='media-layer';host.append(this.media);
    ['object:modified','text:editing:exited','path:created'].forEach(event=>this.canvas.on(event,()=>{
      if(event==='path:created')this.canvas.getObjects().filter(o=>o.type==='path'&&!o.lpId).forEach(o=>{o.lpId=uid();o.lpAnnotation=true;});
      this.commit();
    }));
    ['selection:created','selection:updated','selection:cleared'].forEach(event=>this.canvas.on(event,()=>this.selectionChanged()));
    ['object:moving','object:scaling','object:rotating'].forEach(event=>this.canvas.on(event,()=>this.syncMedia()));
    this.canvas.on('object:moving',({target})=>{
      if(!target)return;
      if(Math.abs(target.left+target.getScaledWidth()/2-W/2)<8)target.set('left',W/2-target.getScaledWidth()/2);
      if(Math.abs(target.top+target.getScaledHeight()/2-H/2)<8)target.set('top',H/2-target.getScaledHeight()/2);
    });
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host.parentElement);
    this.resize();
  }
  setLesson(slides) {
    ++this.token;this.ready=false;this.index=-1;this.slides=structuredClone(slides);
    this.histories=slides.map(slide=>({undo:[JSON.stringify(slide)],redo:[]}));
  }
  reorderSlides(order) {
    this.snapshot();++this.token;this.ready=false;this.index=-1;
    this.slides=order.map(index=>this.slides[index]);
    this.histories=order.map(index=>this.histories[index]);
  }
  async show(index,revealCount=0) {
    this.snapshot();
    const token=++this.token;
    this.revealCount=revealCount;this.ready=false;this.loading=true;
    this.media.replaceChildren();this.host.setAttribute('aria-busy','true');
    this.canvas.selection=false;this.canvas.skipTargetFind=true;this.canvas.isDrawingMode=false;
    const scene=structuredClone(this.slides[index]);
    this.queue=this.queue.catch(()=>{}).then(async()=>{
      if(token!==this.token)return;
      try {
        await this.canvas.loadFromJSON(scene);
        if(token!==this.token)return;
        this.index=index;this.loading=false;this.ready=true;
        this.applyVisibility();this.updateSummary();this.applyInteraction();this.resize();this.syncMedia();this.selectionChanged();this.historyChanged();
      }catch(error){if(token===this.token){this.loading=false;this.callbacks.onError('This slide could not be loaded. '+error.message);}}
      finally{if(token===this.token)this.host.setAttribute('aria-busy','false');}
    });
    return this.queue;
  }
  serialize() {
    const scene=this.canvas.toObject(CUSTOM);
    // Reveal is session state. Save all answer objects so hidden answers are never lost.
    const normalize=objects=>objects.forEach(object=>{if(object.lpRole==='answer')object.visible=true;if(object.objects)normalize(object.objects);});
    normalize(scene.objects);return scene;
  }
  snapshot() {if(this.ready&&!this.loading&&this.index>=0)this.slides[this.index]=this.serialize();}
  commit() {
    if(!this.ready||this.loading)return;
    this.snapshot();const history=this.histories[this.index];const value=JSON.stringify(this.slides[this.index]);
    if(value!==history.undo.at(-1)){history.undo.push(value);if(history.undo.length>80)history.undo.shift();history.redo=[];}
    const title=this.canvas.getObjects().find(object=>object.lpRole==='title');
    if(title)this.callbacks.onTitleChange?.(this.index,title.text);
    this.syncMedia();this.updateSummary();this.historyChanged();this.callbacks.onChange();
  }
  historyChanged() {const history=this.histories[this.index];this.callbacks.onHistory?.({undo:(history?.undo.length||0)>1,redo:!!history?.redo.length});}
  async undo() {
    if(!this.ready)return;const history=this.histories[this.index];if(history.undo.length<2)return;
    history.redo.push(history.undo.pop());this.slides[this.index]=JSON.parse(history.undo.at(-1));await this.reloadHistory();
  }
  async redo() {
    if(!this.ready)return;const history=this.histories[this.index];if(!history.redo.length)return;
    const value=history.redo.pop();history.undo.push(value);this.slides[this.index]=JSON.parse(value);await this.reloadHistory();
  }
  async reloadHistory() {
    // Do not snapshot the canvas over the restored history entry.
    const index=this.index;this.ready=false;await this.show(index,this.revealCount);this.callbacks.onChange();
    const title=this.canvas.getObjects().find(object=>object.lpRole==='title');if(title)this.callbacks.onTitleChange?.(index,title.text);
  }
  setMode({readonly=this.readonly,preview=this.preview,drawing=false}={}) {
    this.readonly=readonly;this.preview=preview;this.drawing=drawing;
    if(this.readonly)this.canvas.discardActiveObject();
    this.applyInteraction();this.syncMedia();this.canvas.requestRenderAll();
  }
  applyInteraction() {
    this.canvas.selection=!this.readonly&&this.ready;this.canvas.skipTargetFind=this.readonly||!this.ready;
    this.canvas.isDrawingMode=!!this.drawing&&this.ready;
    this.canvas.getObjects().forEach(object=>object.set({selectable:!this.readonly,evented:!this.readonly}));
    this.canvas.requestRenderAll();
  }
  setReveal(count) {this.revealCount=count;this.applyVisibility();}
  applyVisibility() {
    this.canvas.getObjects().forEach(object=>{if(object.lpRole==='answer')object.set('visible',object.lpAnswerIndex<this.revealCount);});
    this.canvas.requestRenderAll();this.updateSummary();
  }
  updateSummary() {
    const objects=this.canvas.getObjects();
    this.host.dataset.objectCount=objects.length;
    this.summary.textContent=objects.filter(object=>object.visible!==false&&'text'in object).map(object=>object.text).join('\n');
  }
  setPen(color,size) {this.canvas.freeDrawingBrush.color=color;this.canvas.freeDrawingBrush.width=size;}
  resize() {
    const parent=this.host.parentElement;
    const presentation=document.body.classList.contains('audience-mode');
    const maxHeight=presentation?Math.max(220,window.innerHeight-130):Infinity;
    const {scale,width,height}=fitSlide(parent.clientWidth,maxHeight);
    this.scale=scale;
    this.canvas.setDimensions({width,height});this.canvas.setViewportTransform([scale,0,0,scale,0,0]);
    this.host.style.width=`${width}px`;this.host.style.height=`${height}px`;
    this.syncMedia();
  }
  add(object) {
    if(!this.ready||this.readonly)return;
    object.set({lpId:object.lpId||uid()});this.canvas.add(object);this.canvas.setActiveObject(object);this.commit();
  }
  addText(text='Double-click to edit',point={x:160,y:160}) {this.add(textbox(text,point.x,point.y,650,36));}
  addShape(type) {
    const options={left:220,top:190,fill:'#bed39d',stroke:'#7d9f65',strokeWidth:2};
    const shapes={rectangle:()=>new Rect({...options,width:300,height:170,rx:10,ry:10}),circle:()=>new Circle({...options,radius:95}),triangle:()=>new Triangle({...options,width:220,height:190}),line:()=>new Line([0,0,310,0],{...options,stroke:'#244d40',strokeWidth:5})};
    if(shapes[type])this.add(shapes[type]());
  }
  addSticker(sticker) {this.add(textbox(sticker,220,180,160,100,{lpLabel:'Sticker'}));}
  async addImage(file,point={x:160,y:150}) {
    if(!this.ready||this.readonly)return;
    if(file.size>20*1024*1024)throw new Error('Choose an image smaller than 20 MB.');
    if(!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type))throw new Error('Choose a PNG, JPEG, WebP, GIF, or SVG image.');
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
    const token=this.token;const image=await FabricImage.fromURL(data);
    if(token!==this.token||!this.ready)return;
    const scale=Math.min(1,600/image.width,420/image.height);image.set({left:point.x,top:point.y,scaleX:scale,scaleY:scale});this.add(image);
  }
  addVideo(url) {
    const id=youtubeId(url);if(!id)throw new Error('Paste a valid YouTube watch, shorts, or share link.');
    this.add(new Rect({left:160,top:160,width:640,height:360,fill:'#223d34',rx:8,ry:8,lpVideoId:id,lpLabel:'YouTube video'}));
  }
  selected() {return this.canvas.getActiveObject();}
  selectionChanged() {const object=this.selected();this.callbacks.onSelection?.(object ? {type:object.lpVideoId?'video':object.type,text:'text'in object,fontSize:object.fontSize||36,fontFamily:object.fontFamily||'Arial',fill:typeof object.fill==='string'?object.fill:'#244d40',fontWeight:object.fontWeight||'normal',fontStyle:object.fontStyle||'normal',textAlign:object.textAlign||'left'} : null);}
  updateSelected(properties) {const object=this.selected();if(!object||this.readonly||!this.ready)return;object.set(properties);object.setCoords();this.canvas.requestRenderAll();this.commit();this.selectionChanged();}
  deleteSelection() {if(this.readonly||!this.ready||this.selected()?.isEditing)return;this.canvas.remove(...this.canvas.getActiveObjects());this.canvas.discardActiveObject();this.commit();}
  selectedObjectsData() {
    const ids=new Set(this.canvas.getActiveObjects().map(object=>object.lpId));
    return this.serialize().objects.filter(object=>ids.has(object.lpId));
  }
  async copySelection() {
    if(this.readonly||!this.ready||!this.selected()||this.selected().isEditing)return;
    await navigator.clipboard.writeText(JSON.stringify({format:'lesson-presenter-objects',objects:this.selectedObjectsData()}));
  }
  async pasteObjects(data) {
    if(!this.ready||this.readonly)return;
    validateDocument({format:'lesson-presenter',version:1,lesson:{pages:[{title:'Clipboard',questions:[]}]},slides:[{objects:data}]});
    const token=this.token;const objects=await util.enlivenObjects(data);
    if(token!==this.token||this.readonly)return;
    this.canvas.discardActiveObject();
    objects.forEach(object=>{object.set({left:object.left+24,top:object.top+24,lpId:uid()});if(object.lpRole==='title')object.lpRole=undefined;this.canvas.add(object);});
    if(objects.length===1)this.canvas.setActiveObject(objects[0]);
    else if(objects.length)this.canvas.setActiveObject(new ActiveSelection(objects,{canvas:this.canvas}));
    this.commit();
  }
  async duplicateSelection() {
    if(!this.ready||this.readonly||!this.selected())return;
    await this.pasteObjects(this.selectedObjectsData());
  }
  moveLayer(front) {if(!this.selected()||this.readonly)return;const object=this.selected();if(front)this.canvas.bringObjectForward(object);else this.canvas.sendObjectBackwards(object);this.canvas.requestRenderAll();this.commit();}
  clearAnnotations() {this.canvas.remove(...this.canvas.getObjects().filter(object=>object.lpAnnotation));this.commit();}
  async paste(event) {
    if(!this.ready||this.readonly||this.selected()?.isEditing)return false;
    const items=[...event.clipboardData?.items||[]];const image=items.find(item=>item.type.startsWith('image/'))?.getAsFile();
    if(image){event.preventDefault();await this.addImage(image);return true;}
    const text=event.clipboardData?.getData('text/plain')?.trim();
    if(text){event.preventDefault();let copied;try{copied=JSON.parse(text);}catch{/* Plain text. */}if(copied?.format==='lesson-presenter-objects'){await this.pasteObjects(copied.objects);return true;}if(youtubeId(text))this.addVideo(text);else this.addText(text);return true;}
    return false;
  }
  syncMedia() {
    if(!this.media||!this.scale)return;
    const activeIds=new Set();
    this.canvas.getObjects().filter(object=>object.lpVideoId&&object.visible!==false).forEach(object=>{
      activeIds.add(object.lpId);
      let node=[...this.media.children].find(child=>child.dataset.id===object.lpId);
      if(!node){
        node=document.createElement('div');node.className='video-object';node.dataset.id=object.lpId;
        const poster=document.createElement('div');poster.className='video-poster';
        const label=document.createElement('strong');label.textContent='▶ YouTube video';
        const link=document.createElement('span');link.textContent=`youtube.com/watch?v=${object.lpVideoId}`;
        const play=document.createElement('button');play.className='button secondary';play.textContent='Play video';
        play.addEventListener('click',()=>{
          if(!this.readonly)return;
          const iframe=document.createElement('iframe');iframe.src=`https://www.youtube-nocookie.com/embed/${object.lpVideoId}`;iframe.title='Lesson YouTube video';iframe.allow='accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen';iframe.allowFullscreen=true;node.replaceChildren(iframe);
        });
        poster.append(label,link,play);node.append(poster);this.media.append(node);
      }
      Object.assign(node.style,{left:`${object.left*this.scale}px`,top:`${object.top*this.scale}px`,width:`${object.width*object.scaleX*this.scale}px`,height:`${object.height*object.scaleY*this.scale}px`,transform:`rotate(${object.angle||0}deg)`,transformOrigin:'0 0',pointerEvents:this.readonly?'auto':'none'});
      node.querySelector('button')?.toggleAttribute('hidden',!this.readonly);
      if(!this.readonly&&node.querySelector('iframe')){node.remove();activeIds.delete(object.lpId);}
    });
    [...this.media.children].forEach(node=>{if(!activeIds.has(node.dataset.id))node.remove();});
  }
  documentSlides() {this.snapshot();return structuredClone(this.slides);}
  async imagesForPrint({allAnswers=true,annotations=true,counts=[],indices=null}) {
    const slides=this.documentSlides();const output=[];
    for(const i of indices||slides.map((_,index)=>index)){
      const scene=slides[i];
      scene.objects=scene.objects.filter(object=>annotations||!object.lpAnnotation);
      scene.objects.forEach(object=>{if(object.lpRole==='answer')object.visible=allAnswers||object.lpAnswerIndex<(counts[i]||0);});
      const canvas=new StaticCanvas(document.createElement('canvas'),{width:W,height:H});
      await canvas.loadFromJSON(scene);
      canvas.getObjects().filter(object=>object.lpVideoId).forEach(object=>{
        canvas.add(textbox(`YouTube video\nhttps://youtu.be/${object.lpVideoId}`,object.left+20,object.top+25,Math.max(120,object.getScaledWidth()-40),24,{fill:'#fff'}));
      });
      output.push(canvas.toDataURL({format:'png',multiplier:1}));await canvas.dispose();
    }
    return output;
  }
}

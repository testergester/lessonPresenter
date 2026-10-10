import {Canvas, StaticCanvas, Textbox, Rect, Circle, Triangle, Line, FabricImage, FabricObject, PencilBrush, ActiveSelection, Group, util} from 'fabric';
import {SLIDE_WIDTH as W, SLIDE_HEIGHT as H, fitSlide, youtubeId, validateDocument} from './document.js';
import {createSticker,upgradeStickers} from './stickers.js';
import {AnimationPlayer} from './animations.js';
import {StyledImage,DEFAULT_IMAGE_STYLE} from './image.js';
import {VideoRect,visibleVideos,topObjectAt,videoTransform} from './video.js';
import {paintableObjects,selectionPaint,paintProperty} from './selection.js';
import {imageURL} from './image-url.js';

const descendants = objects => objects.flatMap(object=>[object,...descendants(object.getObjects?.()||[])]);
const serializedDescendants = objects => objects.flatMap(object=>[object,...serializedDescendants(object.objects||[])]);

const CUSTOM = ['lpId','lpRole','lpAnswerIndex','lpVideoId','lpAnnotation','lpLabel','lpSticker','lpImageRadius'];
FabricObject.customProperties = CUSTOM;
FabricObject.ownDefaults.originX='left';
FabricObject.ownDefaults.originY='top';
FabricObject.ownDefaults.cornerColor = '#244d40';
FabricObject.ownDefaults.borderColor = '#244d40';
FabricObject.ownDefaults.transparentCorners = false;
FabricObject.ownDefaults.cornerSize = 10;
function corsImages(objects){
  for(const object of objects||[]){if(imageURL(object.src))object.crossOrigin='anonymous';corsImages(object.objects);if(object.clipPath)corsImages([object.clipPath]);}
}
const uid = () => crypto.randomUUID();
export class SharpCanvas extends Canvas {
  getRetinaScaling() {
    if(!this.enableRetinaScaling)return 1;
    return Math.max(2,typeof window==='undefined'?super.getRetinaScaling():window.devicePixelRatio||1);
  }
}
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
  constructor(host, {onChange,onSelection,onHistory,onError,onTitleChange,onPlayback}) {
    this.host=host;this.callbacks={onChange,onSelection,onHistory,onError,onTitleChange,onPlayback};this.zoom=1;
    this.slides=[];this.histories=[];this.index=-1;this.ready=false;this.loading=false;this.readonly=false;this.preview=false;this.revealCount=0;this.token=0;
    this.queue=Promise.resolve();
    host.classList.add('fabric-board');
    const canvasElement=document.createElement('canvas');canvasElement.setAttribute('aria-label','Editable lesson slide. Use the board toolbar to add content.');
    host.append(canvasElement);
    this.canvas=new SharpCanvas(canvasElement,{width:W,height:H,enableRetinaScaling:true,imageSmoothingEnabled:true,backgroundColor:'#fffefb',preserveObjectStacking:true,selection:true,stopContextMenu:true,fireRightClick:false});
    this.canvas.freeDrawingBrush=new PencilBrush(this.canvas);
    this.canvas.freeDrawingBrush.color='#e11d48';this.canvas.freeDrawingBrush.width=4;
    this.summary=document.createElement('div');this.summary.className='canvas-accessibility';this.summary.setAttribute('aria-live','polite');host.append(this.summary);
    this.media=document.createElement('div');this.media.className='media-layer';host.append(this.media);
    this.videoControls=document.createElement('div');this.videoControls.className='video-playback-controls';this.videoControls.hidden=true;
    this.videoSelect=document.createElement('select');this.videoSelect.setAttribute('aria-label','Choose a slide video');
    const play=document.createElement('button');play.type='button';play.textContent='Play video';play.addEventListener('click',()=>this.playVideo(this.videoSelect.value));
    this.videoControls.append(this.videoSelect,play);host.append(this.videoControls);
    this.videoControls.addEventListener('click',event=>event.stopPropagation());
    host.addEventListener('click',event=>{
      if(!this.readonly||this.drawing||!this.ready||event.target.closest('button,select,iframe,.media-layer'))return;
      const object=topObjectAt(this.canvas.getObjects(),this.canvas.getScenePoint(event));
      if(object?.lpVideoId){event.stopImmediatePropagation();this.playVideo(object.lpId);}
    },true);
    ['object:modified','text:editing:exited','path:created'].forEach(event=>this.canvas.on(event,()=>{
      if(event==='path:created')this.canvas.getObjects().filter(o=>o.type==='path'&&!o.lpId).forEach(o=>{o.lpId=uid();o.lpAnnotation=true;});
      if(this.readonly&&event==='path:created')this.recordAnnotations();
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
    ++this.token;this.ready=false;this.index=-1;this.slides=structuredClone(slides).map(slide=>upgradeStickers(slide,CUSTOM));
    this.slides.forEach(slide=>corsImages(slide.objects));
    this.annotationHistories=[];
    this.histories=this.slides.map(slide=>({undo:[JSON.stringify(slide)],redo:[]}));
  }
  reorderSlides(order) {
    this.snapshot();++this.token;this.ready=false;this.index=-1;
    this.slides=order.map(index=>this.slides[index]);
    this.histories=order.map(index=>this.histories[index]);
  }
  async show(index,revealCount=0) {
    this.snapshot();
    this.stopAnimations();
    const token=++this.token;
    this.revealCount=revealCount;this.ready=false;this.loading=true;
    this.playingVideoId=null;this.media.replaceChildren();this.videoControls.hidden=true;this.host.setAttribute('aria-busy','true');
    this.canvas.selection=false;this.canvas.skipTargetFind=true;this.canvas.isDrawingMode=false;
    const scene=structuredClone(this.slides[index]);
    this.queue=this.queue.catch(()=>{}).then(async()=>{
      if(token!==this.token)return;
      try {
        await this.canvas.loadFromJSON(scene);
        if(token!==this.token)return;
        this.index=index;this.loading=false;this.ready=true;
        this.animations=structuredClone(scene.lpAnimations||[]);
        if(this.readonly){this.ensureAnnotationHistory();this.startAnimations();}
        this.applyVisibility();this.updateSummary();this.applyInteraction();this.resize();this.syncMedia();this.selectionChanged();this.historyChanged();
      }catch(error){if(token===this.token){this.loading=false;this.callbacks.onError('This slide could not be loaded. '+error.message);}}
      finally{if(token===this.token)this.host.setAttribute('aria-busy','false');}
    });
    return this.queue;
  }
  serialize() {
    const scene=this.canvas.toObject(CUSTOM);
    scene.lpAnimations=structuredClone(this.animations||[]);
    serializedDescendants(scene.objects).forEach(object=>{const base=this.animationBase?.get(object.lpId);if(base){object.visible=base.visible;object.opacity=base.opacity;}});
    // Reveal is session state. Save all answer objects so hidden answers are never lost.
    const normalize=objects=>objects.forEach(object=>{if(object.lpRole==='answer')object.visible=true;if(object.objects)normalize(object.objects);});
    normalize(scene.objects);return scene;
  }
  snapshot() {if(this.ready&&!this.loading&&this.index>=0)this.slides[this.index]=this.serialize();}
  renameSlideTitle(index,text) {
    if(this.readonly||!this.slides[index])return false;
    if(this.ready&&!this.loading&&index===this.index){
      const title=descendants(this.canvas.getObjects()).find(object=>object.lpRole==='title');
      if(!title||title.text===text)return false;
      title.set({text});title.setCoords();this.canvas.requestRenderAll();this.commit();
    }else{
      const title=serializedDescendants(this.slides[index].objects).find(object=>object.lpRole==='title');
      if(!title||title.text===text)return false;
      title.text=text;
      const history=this.histories[index];history.undo.push(JSON.stringify(this.slides[index]));
      if(history.undo.length>80)history.undo.shift();history.redo=[];
      this.callbacks.onChange();
    }
    return true;
  }
  commit() {
    if(!this.ready||this.loading)return;
    this.snapshot();const history=this.histories[this.index];const value=JSON.stringify(this.slides[this.index]);
    if(value!==history.undo.at(-1)){history.undo.push(value);if(history.undo.length>80)history.undo.shift();history.redo=[];}
    const title=descendants(this.canvas.getObjects()).find(object=>object.lpRole==='title');
    if(title)this.callbacks.onTitleChange?.(this.index,title.text);
    this.syncMedia();this.updateSummary();this.historyChanged();this.callbacks.onChange();
  }
  annotationSnapshot(){return JSON.stringify(this.serialize().objects.flatMap((object,index)=>object.lpAnnotation?[{object,index}]:[]));}
  ensureAnnotationHistory(){this.annotationHistories||=[];return this.annotationHistories[this.index] ||= {undo:[this.annotationSnapshot()],redo:[]};}
  recordAnnotations(){const history=this.ensureAnnotationHistory(),value=this.annotationSnapshot();if(value!==history.undo.at(-1)){history.undo.push(value);history.redo=[];}}
  async restoreAnnotations(direction){
    if(!this.ready||this.annotationRestoring)return;
    const history=this.ensureAnnotationHistory();if(direction==='undo'?history.undo.length<2:!history.redo.length)return;
    const value=direction==='undo'?history.undo.at(-2):history.redo.at(-1);
    const token=this.token,index=this.index;this.annotationRestoring=true;
    try{
      const entries=JSON.parse(value),objects=await util.enlivenObjects(entries.map(entry=>entry.object));
      if(token!==this.token||index!==this.index||!this.readonly)return;
      this.canvas.remove(...this.canvas.getObjects().filter(object=>object.lpAnnotation));
      objects.forEach((object,i)=>this.canvas.insertAt(entries[i].index,object));
      if(direction==='undo')history.redo.push(history.undo.pop());else history.undo.push(history.redo.pop());
      this.applyInteraction();this.commit();
    }finally{this.annotationRestoring=false;}
  }
  historyChanged() {const history=this.readonly?this.ensureAnnotationHistory():this.histories[this.index];this.callbacks.onHistory?.({undo:(history?.undo.length||0)>1,redo:!!history?.redo.length,editing:!this.readonly});}
  async undo() {
    if(this.readonly)return this.restoreAnnotations('undo');
    if(!this.ready)return;const history=this.histories[this.index];if(history.undo.length<2)return;
    history.redo.push(history.undo.pop());this.slides[this.index]=JSON.parse(history.undo.at(-1));await this.reloadHistory();
  }
  async redo() {
    if(this.readonly)return this.restoreAnnotations('redo');
    if(!this.ready)return;const history=this.histories[this.index];if(!history.redo.length)return;
    const value=history.redo.pop();history.undo.push(value);this.slides[this.index]=JSON.parse(value);await this.reloadHistory();
  }
  async reloadHistory() {
    // Do not snapshot the canvas over the restored history entry.
    const index=this.index;this.ready=false;await this.show(index,this.revealCount);this.callbacks.onChange();
    const title=descendants(this.canvas.getObjects()).find(object=>object.lpRole==='title');if(title)this.callbacks.onTitleChange?.(index,title.text);
  }
  setMode({readonly=this.readonly,preview=this.preview,drawing=false}={}) {
    const changed=readonly!==this.readonly;
    if(changed&&readonly)this.annotationHistories=[];
    this.readonly=readonly;this.preview=preview;this.drawing=drawing;
    if(changed&&this.ready){if(readonly){this.ensureAnnotationHistory();this.startAnimations();}else this.stopAnimations();}
    if(this.readonly)this.canvas.discardActiveObject();
    this.applyInteraction();this.syncMedia();this.canvas.requestRenderAll();if(this.ready)this.historyChanged();
  }
  applyInteraction() {
    this.canvas.selection=!this.readonly&&this.ready;this.canvas.skipTargetFind=this.readonly||!this.ready;
    this.canvas.isDrawingMode=!!this.drawing&&this.ready;
    this.canvas.getObjects().forEach(object=>object.set({selectable:!this.readonly,evented:!this.readonly}));
    this.canvas.requestRenderAll();
  }
  setReveal(count) {this.revealCount=count;this.applyVisibility();this.syncMedia();}
  applyVisibility() {
    descendants(this.canvas.getObjects()).forEach(object=>{
      const base=this.animationBase?.get(object.lpId),value=this.animationValues?.get(object.lpId)??1;
      if(base){object.set({visible:base.visible&&value>0,opacity:base.opacity*value});}
      if(object.lpRole==='answer')object.set('visible',object.lpAnswerIndex<this.revealCount&&(!base||value>0));
    });
    this.canvas.requestRenderAll();this.updateSummary();
  }
  startAnimations() {
    this.stopAnimations();
    this.animationBase=new Map(descendants(this.canvas.getObjects()).map(object=>[object.lpId,{visible:object.lpRole==='answer'?true:object.visible,opacity:object.opacity}]));
    this.player=new AnimationPlayer(this.animations||[],values=>{this.animationValues=values;this.applyVisibility();this.syncMedia();},{onStateChange:state=>this.callbacks.onPlayback?.(state)});
  }
  stopAnimations() {
    this.player?.stop();this.player=null;
    descendants(this.canvas.getObjects()).forEach(object=>{const base=this.animationBase?.get(object.lpId);if(base)object.set(base);});
    this.animationBase=null;this.animationValues=null;
    this.applyVisibility();this.syncMedia();
  }
  getPlaybackState(){return this.player?.state;}
  nextAnimation() {return !!this.player?.next();}
  addAnimation(effect,trigger,delay=0,grouping='together') {
    const objects=this.canvas.getActiveObjects();if(this.readonly||!objects.length)return false;
    objects.forEach(object=>{object.lpId ||= uid();});
    this.animations||=[];
    if(grouping==='individual'){
      const selected=new Set(objects);
      const ordered=this.canvas.getObjects().filter(object=>selected.has(object));
      ordered.forEach((object,index)=>this.animations.push({id:uid(),effect,trigger:index===0||trigger==='click'?trigger:'after',delay,targets:[object.lpId]}));
    }else this.animations.push({id:uid(),effect,trigger,delay,targets:objects.map(object=>object.lpId)});
    this.commit();return true;
  }
  removeAnimation(id){if(this.readonly)return;this.animations=(this.animations||[]).filter(effect=>effect.id!==id);this.commit();}
  moveAnimation(id,to) {
    const from=(this.animations||[]).findIndex(effect=>effect.id===id);
    if(this.readonly||from<0||!Number.isInteger(to)||to<0||to>=this.animations.length||from===to)return false;
    this.animations.splice(to,0,this.animations.splice(from,1)[0]);this.commit();return true;
  }
  animationTargets(effect) {
    const objects=new Map(descendants(this.canvas.getObjects()).map(object=>[object.lpId,object]));
    return effect.targets.map(id=>{
      const object=objects.get(id);
      if(!object)return {label:'Removed object'};
      if(typeof object.text==='string')return {label:object.text.trim()||'Empty text box'};
      if(object.type?.toLowerCase()==='image')return {label:object.lpLabel||'Image',image:object.getSrc()};
      if(object.lpVideoId)return {label:`YouTube video · ${object.lpVideoId}`};
      return {label:object.lpLabel||`${object.type.charAt(0).toUpperCase()}${object.type.slice(1)}`};
    });
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
    const studio=document.body.dataset?.layout==='studio';
    const style=studio?getComputedStyle(parent):null;
    const maxHeight=presentation?Math.max(220,window.innerHeight-130):studio?Math.max(120,parent.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)):Infinity;
    const padding=studio?parseFloat(style.paddingLeft)+parseFloat(style.paddingRight):0;
    const fitted=fitSlide(Math.max(120,parent.clientWidth-padding),maxHeight);
    const zoom=studio&&!presentation?(this.zoom||1):1;
    const scale=fitted.scale*zoom,width=fitted.width*zoom,height=fitted.height*zoom;
    this.scale=scale;
    this.canvas.setDimensions({width,height});this.canvas.setViewportTransform([scale,0,0,scale,0,0]);
    this.host.style.width=`${width}px`;this.host.style.height=`${height}px`;
    this.syncMedia();
  }
  setZoom(value) {
    const number=Number(value);if(!Number.isFinite(number))return;
    this.zoom=Math.max(.25,Math.min(3,number));this.resize();
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
  addSticker(symbol) {const sticker=createSticker(symbol);if(sticker)this.add(sticker);}
  async addImage(file,point={x:160,y:150}) {
    if(!this.ready||this.readonly)return;
    if(file.size>20*1024*1024)throw new Error('Choose an image smaller than 20 MB.');
    if(!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type))throw new Error('Choose a PNG, JPEG, WebP, GIF, or SVG image.');
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
    const token=this.token;const image=await StyledImage.fromURL(data);
    if(token!==this.token||!this.ready)return;
    const scale=Math.min(1,600/image.width,420/image.height);image.set({...DEFAULT_IMAGE_STYLE,left:point.x,top:point.y,scaleX:scale,scaleY:scale});this.add(image);
  }
  async addImageFromURL(value,point={x:160,y:150}) {
    if(!this.ready||this.readonly)return;
    const url=imageURL(value);
    if(!url)throw new Error('Paste a direct HTTPS image URL without login credentials.');
    const token=this.token;
    let image;
    try {image=await StyledImage.fromURL(url,{crossOrigin:'anonymous',signal:AbortSignal.timeout(15000)});}
    catch {throw new Error('Could not load this image. Use a direct image link from a host that allows cross-origin access, or paste the image itself.');}
    if(token!==this.token||!this.ready||this.readonly)return;
    const scale=Math.min(1,600/image.width,420/image.height);
    image.set({...DEFAULT_IMAGE_STYLE,left:point.x,top:point.y,scaleX:scale,scaleY:scale});this.add(image);
  }
  addVideo(url) {
    const id=youtubeId(url);if(!id)throw new Error('Paste a valid YouTube watch, shorts, or share link.');
    this.add(new VideoRect({left:160,top:160,width:640,height:360,fill:'#223d34',rx:8,ry:8,lpVideoId:id,lpLabel:'YouTube video'}));
  }
  selected() {return this.canvas.getActiveObject();}
  selectAll() {
    if(this.readonly||!this.ready)return;
    const objects=this.canvas.getObjects().filter(object=>object.visible!==false);
    this.canvas.discardActiveObject();
    if(objects.length)this.canvas.setActiveObject(objects.length===1?objects[0]:new ActiveSelection(objects,{canvas:this.canvas}));
    this.canvas.requestRenderAll();
  }
  selectionChanged() {
    const object=this.selected();
    this.callbacks.onSelection?.(object ? {...selectionPaint(object),count:this.canvas.getActiveObjects().length,canGroup:this.canvas.getActiveObjects().length>1,canUngroup:object instanceof Group&&!(object instanceof ActiveSelection)&&!object.lpSticker,image:object instanceof FabricImage,stroke:object.stroke||'#cbd3df',strokeWidth:object.strokeWidth||0,imageRadius:object.lpImageRadius||0,type:object.lpVideoId?'video':object.lpSticker?'sticker':object.type,text:'text'in object,fontSize:object.fontSize||36,fontFamily:object.fontFamily||'Arial',fontWeight:object.fontWeight||'normal',fontStyle:object.fontStyle||'normal',textAlign:object.textAlign||'left'} : null);
  }
  groupSelection() {
    if(this.readonly||!this.ready||this.selected()?.isEditing)return false;
    const selected=new Set(this.canvas.getActiveObjects());
    if(selected.size<2)return false;
    const ordered=this.canvas.getObjects(),objects=ordered.filter(object=>selected.has(object));
    const index=ordered.indexOf(objects.at(-1))-objects.length+1;
    this.canvas.discardActiveObject();
    this.canvas.remove(...objects);
    const group=new Group(objects,{lpId:uid(),objectCaching:false});
    this.canvas.insertAt(index,group);this.canvas.setActiveObject(group);
    this.canvas.requestRenderAll();this.commit();this.selectionChanged();return true;
  }
  ungroupSelection() {
    const group=this.selected();
    if(this.readonly||!this.ready||!(group instanceof Group)||group instanceof ActiveSelection||group.lpSticker)return false;
    const index=this.canvas.getObjects().indexOf(group);
    this.canvas.discardActiveObject();
    const objects=group.removeAll();this.canvas.remove(group);this.canvas.insertAt(index,...objects);
    this.animations=(this.animations||[]).map(effect=>({...effect,targets:effect.targets.flatMap(id=>id===group.lpId?objects.map(object=>object.lpId):[id])}));
    this.canvas.setActiveObject(new ActiveSelection(objects,{canvas:this.canvas}));
    this.canvas.requestRenderAll();this.commit();this.selectionChanged();return true;
  }
  toggleTextStyle(style) {
    if(this.readonly||!this.ready)return false;
    const settings={bold:['fontWeight','bold','normal'],italic:['fontStyle','italic','normal'],underline:['underline',true,false],strikethrough:['linethrough',true,false]};
    if(!settings[style])return false;
    const [property,on,off]=settings[style];
    const texts=descendants(this.canvas.getActiveObjects()).filter(object=>typeof object.text==='string'&&object.setSelectionStyles);
    if(!texts.length)return false;
    const ranges=texts.map(object=>{
      const partial=object.isEditing&&object.selectionEnd>object.selectionStart;
      return {object,partial,start:partial?object.selectionStart:0,end:partial?object.selectionEnd:object._text.length};
    });
    const enabled=value=>style==='bold'?value==='bold'||Number(value)>=600:value===on;
    const allEnabled=ranges.every(({object,start,end})=>{
      const styles=object.getSelectionStyles(start,end,true);
      return styles.length?styles.every(value=>enabled(value[property])):enabled(object[property]);
    });
    for(const {object,partial,start,end} of ranges){
      const value=allEnabled?off:on;
      if(!partial)object.set(property,value);
      object.setSelectionStyles({[property]:value},start,end);
      object.initDimensions();object.setCoords();
    }
    this.canvas.requestRenderAll();this.commit();this.selectionChanged();return true;
  }
  updateSelected(properties) {
    const object=this.selected();if(!object||this.readonly||!this.ready)return;
    const {fill,...other}=properties;
    if(fill!==undefined)paintableObjects(object).forEach(target=>target.set(paintProperty(target),fill));
    if(Object.keys(other).length)object.set(other);
    object.setCoords();this.canvas.requestRenderAll();this.commit();this.selectionChanged();
  }
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
    data=structuredClone(data);corsImages(data);
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
  clearAnnotations() {if(this.readonly)this.ensureAnnotationHistory();this.canvas.remove(...this.canvas.getObjects().filter(object=>object.lpAnnotation));if(this.readonly)this.recordAnnotations();this.commit();}
  async paste(event) {
    if(!this.ready||this.readonly||this.selected()?.isEditing)return false;
    const items=[...event.clipboardData?.items||[]];const image=items.find(item=>item.type.startsWith('image/'))?.getAsFile();
    if(image){event.preventDefault();await this.addImage(image);return true;}
    const text=event.clipboardData?.getData('text/plain')?.trim();
    if(text){event.preventDefault();let copied;try{copied=JSON.parse(text);}catch{/* Plain text. */}if(copied?.format==='lesson-presenter-objects'){await this.pasteObjects(copied.objects);return true;}if(youtubeId(text))this.addVideo(text);else this.addText(text);return true;}
    return false;
  }
  playVideo(id) {
    if(!this.ready||!this.readonly||this.drawing||!visibleVideos(this.canvas.getObjects()).some(o=>o.lpId===id))return false;
    this.playingVideoId=id;this.syncMedia();this.media.querySelector('button')?.focus();return true;
  }
  closeVideo(restoreFocus=true) {
    this.playingVideoId=null;this.syncMedia();
    if(restoreFocus&&!this.videoControls.hidden)this.videoControls.querySelector('button')?.focus();
  }
  syncMedia() {
    if(!this.media||!this.scale)return;
    const videos=visibleVideos(this.canvas.getObjects());
    this.videoControls.hidden=!this.readonly||this.drawing||!videos.length;
    const key=videos.map(o=>o.lpId+':'+o.lpVideoId).join('|');
    if(key!==this.videoOptionsKey){
      const selected=this.videoSelect.value;this.videoSelect.replaceChildren();
      videos.forEach((object,index)=>{const option=document.createElement('option');option.value=object.lpId;option.textContent=`Video ${index+1} · ${object.lpVideoId}`;this.videoSelect.append(option);});
      if(videos.some(o=>o.lpId===selected))this.videoSelect.value=selected;
      this.videoOptionsKey=key;
    }
    const object=this.readonly&&!this.drawing?videos.find(o=>o.lpId===this.playingVideoId):null;
    if(!object){this.playingVideoId=null;this.media.replaceChildren();return;}
    let node=this.media.firstElementChild;
    if(node?.dataset.id!==object.lpId){
      this.media.replaceChildren();node=document.createElement('div');node.className='video-object video-player';node.dataset.id=object.lpId;
      const iframe=document.createElement('iframe');iframe.src=`https://www.youtube-nocookie.com/embed/${object.lpVideoId}`;iframe.title='Lesson YouTube video';iframe.allow='accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen';iframe.allowFullscreen=true;
      const close=document.createElement('button');close.type='button';close.className='video-player-close';close.textContent='×';close.setAttribute('aria-label','Close video');close.addEventListener('click',()=>this.closeVideo());
      node.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();this.closeVideo();}});
      node.append(iframe,close);this.media.append(node);
    }
    const matrix=videoTransform(object,this.canvas.viewportTransform);
    Object.assign(node.style,{opacity:String(object.opacity),left:'0px',top:'0px',width:`${object.width}px`,height:`${object.height}px`,transform:`matrix(${matrix.join(',')})`,transformOrigin:'0 0',pointerEvents:'auto'});
    const closeScale=Math.max(.05,Math.min(Math.hypot(matrix[0],matrix[1]),Math.hypot(matrix[2],matrix[3])));
    Object.assign(node.querySelector('button').style,{width:`${32/closeScale}px`,height:`${32/closeScale}px`,fontSize:`${24/closeScale}px`});
  }
  documentSlides() {this.snapshot();return structuredClone(this.slides);}
  async imagesForPrint({allAnswers=true,annotations=true,counts=[],indices=null}) {
    const slides=this.documentSlides();const output=[];
    for(const i of indices||slides.map((_,index)=>index)){
      const scene=slides[i];
      scene.objects=scene.objects.filter(object=>annotations||!object.lpAnnotation);
      serializedDescendants(scene.objects).forEach(object=>{if(object.lpRole==='answer')object.visible=allAnswers||object.lpAnswerIndex<(counts[i]||0);});
      const canvas=new StaticCanvas(document.createElement('canvas'),{width:W,height:H});
      await canvas.loadFromJSON(scene);
      output.push(canvas.toDataURL({format:'png',multiplier:2}));await canvas.dispose();
    }
    return output;
  }
}

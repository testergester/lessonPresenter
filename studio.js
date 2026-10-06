import {StaticCanvas} from 'fabric';

const $=id=>document.getElementById(id);
const node=(tag,className,html='')=>{const el=document.createElement(tag);el.className=className;el.innerHTML=html;return el;};
const shell=document.querySelector('.app-shell');
const workspace=document.querySelector('.workspace');
const column=document.querySelector('.lesson-column');
const dock=document.querySelector('.board-dock');
const toolbar=node('div','studio-toolbar');toolbar.setAttribute('aria-label','Slide editing tools');
const inserts=document.querySelector('.insert-tools');
const tools=document.querySelector('.board-tools');
// Fixed application chrome: no floating controls over the slide.
const toolStrip=node('div','studio-toolstrip');toolStrip.append(inserts,tools,$('imageFile'));toolbar.append(toolStrip);shell.prepend(toolbar);
const zoomControls=node('div','studio-zoom-controls','<button type="button" id="studioZoomOut" class="icon-button" aria-label="Zoom out" data-tooltip="Zoom out"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg></button><span id="studioZoomLabel" aria-live="polite" aria-label="Canvas zoom">100%</span><button type="button" id="studioZoomIn" class="icon-button" aria-label="Zoom in" data-tooltip="Zoom in"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button><button type="button" id="studioZoomFit" class="icon-button" aria-label="Fit slide to workspace" data-tooltip="Fit slide"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6"/></svg></button>');toolbar.append(zoomControls);
const viewport=node('div','studio-viewport');
$('teacherStage').before(viewport);viewport.append($('teacherStage'),$('audienceStage'));
const footer=node('footer','studio-footer');
const notesButton=node('button','studio-notes-toggle','Teacher notes');notesButton.type='button';notesButton.id='studioNotesToggle';notesButton.setAttribute('aria-expanded','true');notesButton.setAttribute('aria-controls','studioNotes');
footer.append(document.querySelector('.presentation-controls'),notesButton,document.querySelector('.view-switch'));
const notes=node('section','studio-notes');notes.id='studioNotes';notes.setAttribute('aria-label','Teacher notes');notes.append(document.querySelector('.guidance-card'));workspace.append(notes);
notesButton.addEventListener('click',()=>{notes.hidden=!notes.hidden;notesButton.setAttribute('aria-expanded',String(!notes.hidden));});
workspace.append(footer);dock.remove();
// Retain contextual controls and drawing controls in the properties pane.
const right=$('teacherPanel');right.removeAttribute('inert');$('lessonOutline').removeAttribute('inert');
const teaching=node('div','studio-teaching');while(right.firstChild)teaching.append(right.firstChild);
teaching.append($('responseBoards'),$('participationHub'));
const tabs=node('nav','studio-tabs','<button type="button" data-panel="design" aria-pressed="true">Design</button><button type="button" data-panel="animations" aria-pressed="false">Animations</button><button type="button" data-panel="teach" aria-pressed="false">Teach</button>');tabs.setAttribute('aria-label','Properties panels');
const design=node('section','studio-design','<h2>Object properties</h2><p class="studio-selection-hint">Select an object on the slide to edit its text, color and layer order.</p>');
design.append(dock.querySelector('#selectionInspector'));
design.append(dock.querySelector('#drawingToolbar')); // Shared keyboard/drawing hooks; controls live in the toolbar dropdown.
const imageStyle=node('div','studio-image-style','<h3>Image frame</h3><label>Border color<input id="imageBorderColor" type="color" value="#cbd3df" /></label><label>Border width <span>px</span><input id="imageBorderWidth" type="number" min="0" max="30" step="1" value="2" /></label><label>Corner radius <span>px</span><input id="imageCornerRadius" type="number" min="0" max="200" step="1" value="16" /></label>');imageStyle.hidden=true;design.querySelector('#selectionInspector').append(imageStyle);
document.addEventListener('studio:selection',event=>{const selection=event.detail;imageStyle.hidden=!selection.image;design.querySelector('.inspector-label').hidden=selection.image;if(selection.image){$('imageBorderColor').value=/^#[0-9a-f]{6}$/i.test(selection.stroke)?selection.stroke:'#cbd3df';$('imageBorderWidth').value=selection.strokeWidth;$('imageCornerRadius').value=selection.imageRadius;}});
for(const [id,property,max] of [['imageBorderColor','stroke',null],['imageBorderWidth','strokeWidth',30],['imageCornerRadius','lpImageRadius',200]])imageStyle.querySelector('#'+id).addEventListener('input',()=>{const value=max===null?$(id).value:Math.max(0,Math.min(max,Number($(id).value)||0));engine.getStudioState().editor.updateSelected({[property]:value,strokeUniform:true});});
const quick=node('div','studio-quick','<h3>Add to your slide</h3><p>Choose a tool above, or paste text and images directly onto the canvas.</p><div class="studio-quick-actions"><button type="button" data-open="section-shapes">□ Shapes</button><button type="button" data-open="section-stickers">☆ Stickers</button><button type="button" data-open="section-video">▷ Video</button></div><h3>Slide format</h3><p>Widescreen · 16:9<br>1280 × 720 editable canvas</p>');design.append(quick);
const toolHeading=node('div','studio-tool-heading','<h2 id="studioToolTitle">Slide animations</h2><button type="button" id="studioBackBtn" aria-label="Back to object properties">×</button>');
const toolContent=node('div','studio-tool-content');
right.append(tabs,design,toolHeading,toolContent,teaching);
const docked=['section-animations','section-shapes','section-stickers','section-video','section-annotator','section-participation','section-view','section-export'];
for(const id of docked)toolContent.append($(id));
const titles={'section-shapes':'Shapes','section-stickers':'Stickers','section-video':'YouTube video','section-animations':'Slide animations','section-annotator':'Drawing tools','section-participation':'Participation','section-view':'Display settings','section-export':'Export lesson'};
let activeTool=null;
function showPanel(panel,target=null,title=null){
  activeTool=target;
  if(target){document.body.classList.remove('studio-hide-properties');$('studioPropertiesToggle')?.setAttribute('aria-pressed','true');}
  design.hidden=panel!=='design';teaching.hidden=panel!=='teach';toolContent.hidden=!target;toolHeading.hidden=!target;
  tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.panel===panel)));
  toolContent.querySelectorAll('.feature-section').forEach(section=>section.classList.toggle('active',section.id===target));
  if(target){$('studioToolTitle').textContent=title||titles[target];requestAnimationFrame(()=>toolHeading.scrollIntoView({block:'nearest'}));}
}
const popover=node('section','studio-tool-popover','<header><h2 id="studioPopoverTitle"></h2><button type="button" aria-label="Close tool options" id="studioPopoverClose">×</button></header><div class="studio-popover-content"></div>');
popover.id='studioToolPopover';popover.hidden=true;popover.setAttribute('role','dialog');popover.setAttribute('aria-labelledby','studioPopoverTitle');document.body.append(popover);
const popoverContent=popover.querySelector('.studio-popover-content');
let popoverTarget=null,popoverAnchor=null,clickedButton=null,requestedAnchor=null,keyboardOpening=false,sidebarAnimationRequest=false;
const anchors={'section-shapes':'addShapeBtn','section-stickers':'addStickerBtn','section-video':'addVideoBtn','section-animations':'animationsBtn','section-annotator':'boardPenBtn','section-participation':null,'section-view':null,'section-export':null};
function positionPopover(){
  if(popover.hidden||!popoverAnchor)return;
  const rect=popoverAnchor.getBoundingClientRect();
  const width=Math.min(popoverTarget==='section-animations'?340:280,window.innerWidth-16);
  const left=Math.max(8,Math.min(rect.left,window.innerWidth-width-8));
  const top=Math.min(rect.bottom+8,window.innerHeight-100);
  popover.style.width=width+'px';popover.style.left=left+'px';popover.style.top=top+'px';popover.style.maxHeight=Math.max(80,window.innerHeight-top-12)+'px';
}
function closePopover(restoreFocus=false){
  if(popover.hidden)return;
  const anchor=popoverAnchor;
  toolContent.append($(popoverTarget));$(popoverTarget).classList.remove('active');
  popover.hidden=true;anchor?.setAttribute('aria-expanded','false');
  popoverTarget=null;popoverAnchor=null;
  if(activeTool&&$(activeTool).parentElement===toolContent)$(activeTool).classList.add('active');
  if(restoreFocus)anchor?.focus();
}
function openPopover(target,title){
  const anchor=requestedAnchor||(clickedButton&&clickedButton.isConnected?clickedButton:anchors[target]?$(anchors[target]):toolbar.querySelector(`[data-target="${target}"]`));
  if(!anchor)return;
  if(popoverTarget===target&&!popover.hidden){closePopover();return;}
  closePopover();
  if(activeTool===target)showPanel('design');
  popoverTarget=target;popoverAnchor=anchor;
  anchor.setAttribute('aria-haspopup','dialog');anchor.setAttribute('aria-controls',popover.id);anchor.setAttribute('aria-expanded','true');
  $('studioPopoverTitle').textContent=title||titles[target];popoverContent.append($(target));$(target).classList.add('active');
  popover.hidden=false;positionPopover();
  if(keyboardOpening)popover.querySelector('input,select,textarea,button:not(#studioPopoverClose):not(:disabled)')?.focus();
}
document.addEventListener('click',event=>{
  clickedButton=event.target.closest('button');keyboardOpening=event.detail===0;
  if(!popover.hidden&&!popover.contains(event.target)&&!popoverAnchor?.contains(event.target))closePopover();
},true);
document.addEventListener('studio:open-tool',event=>{
  if(!docked.includes(event.detail.target))return;
  event.preventDefault();
  if(sidebarAnimationRequest){closePopover();showPanel('animations',event.detail.target,event.detail.title);}
  else openPopover(event.detail.target,event.detail.title);
});
document.addEventListener('studio:display-mode',event=>{const mode=event.detail.mode;document.body.classList.toggle('studio-hide-slides',mode==='board');document.body.classList.remove('studio-hide-properties');$('studioSlidesToggle').setAttribute('aria-pressed',String(mode!=='board'));$('studioPropertiesToggle').setAttribute('aria-pressed','true');});
document.addEventListener('studio:close-tool',()=>{
  const target=popoverTarget;closePopover();
  if(target==='section-participation'&&(!$('participationHub').hidden||!$('responseBoards').hidden))showPanel('teach');
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!popover.hidden){event.stopImmediatePropagation();event.preventDefault();closePopover(true);return;}
  if(!popover.hidden&&popover.contains(event.target)&&event.key.startsWith('Arrow'))event.stopImmediatePropagation();
  if(event.key==='Escape'&&activeTool&&!$('toolsDialog').open){event.stopImmediatePropagation();showPanel('design');}
},true);
document.addEventListener('focusin',event=>{if(!popover.hidden&&!popover.contains(event.target)&&event.target!==popoverAnchor)closePopover();});
$('studioPopoverClose').addEventListener('click',()=>closePopover(true));
for(const target of docked){const anchor=anchors[target]?$(anchors[target]):toolbar.querySelector(`[data-target="${target}"]`);if(anchor){anchor.setAttribute('aria-haspopup','dialog');anchor.setAttribute('aria-controls',popover.id);anchor.setAttribute('aria-expanded','false');}}
window.addEventListener('resize',positionPopover);toolStrip.addEventListener('scroll',()=>closePopover());
tabs.addEventListener('click',event=>{const panel=event.target.dataset.panel;closePopover();if(panel==='animations'){sidebarAnimationRequest=true;$('animationsBtn').click();sidebarAnimationRequest=false;}else if(panel)showPanel(panel);});
$('studioBackBtn').addEventListener('click',()=>showPanel('design'));
quick.addEventListener('click',event=>{const target=event.target.dataset.open;const button={'section-shapes':'addShapeBtn','section-stickers':'addStickerBtn','section-video':'addVideoBtn'}[target];if(button){requestedAnchor=event.target;$(button).click();requestedAnchor=null;}});
const hint=design.querySelector('.studio-selection-hint');
new MutationObserver(()=>{hint.hidden=!$('selectionInspector').hidden;}).observe($('selectionInspector'),{attributes:true,attributeFilter:['hidden']});
const original=node('a','studio-original','Original workspace');original.href='/index.html';document.querySelector('.header-actions').prepend(original);
const title=node('span','studio-document-title');
const documentInfo=node('div','studio-document-info');documentInfo.append(title,$('status'));document.querySelector('.workspace-label').replaceWith(documentInfo);
new MutationObserver(()=>{$('status').title=$('status').textContent;}).observe($('status'),{childList:true,characterData:true,subtree:true});
const resizePanels=node('div','studio-panel-buttons','<button type="button" id="studioSlidesToggle" aria-label="Toggle slide list" aria-pressed="true">☰</button><button type="button" id="studioPropertiesToggle" aria-label="Toggle properties panel" aria-pressed="true">▥</button>');toolStrip.prepend(resizePanels);
for(const [id,className] of [['studioSlidesToggle','studio-hide-slides'],['studioPropertiesToggle','studio-hide-properties']])$(id).addEventListener('click',()=>{const hidden=document.body.classList.toggle(className);$(id).setAttribute('aria-pressed',String(!hidden));});
if(matchMedia('(max-width:680px)').matches){document.body.classList.add('studio-hide-properties');$('studioPropertiesToggle').setAttribute('aria-pressed','false');}
showPanel('design');
let engine,updateTimer,revision=0;
const previews=new Map();
document.addEventListener('studio:update',()=>{clearTimeout(updateTimer);updateTimer=setTimeout(updateThumbnails,180);});
async function updateThumbnails(){
  if(!engine)return;
  const {lesson,editor}=engine.getStudioState();if(!editor?.slides.length)return;
  title.textContent=lesson.title;
  const run=++revision;
  // One small offscreen canvas, cached by slide content; the saved lesson is untouched.
  const slides=editor.slides;
  for(let i=0;i<slides.length;i++){
    if(run!==revision)return;
    const button=$('stageList').querySelector(`.stage-item[data-stage-index="${i}"]`);if(!button)continue;
    const key=JSON.stringify(slides[i]);let src=previews.get(key);
    if(!src){
      const canvas=new StaticCanvas(document.createElement('canvas'),{width:160,height:90,enableRetinaScaling:false,renderOnAddRemove:false});
      try{await canvas.loadFromJSON(slides[i]);canvas.setDimensions({width:160,height:90});canvas.setViewportTransform([.125,0,0,.125,0,0]);canvas.renderAll();src=canvas.toDataURL({format:'png'});previews.set(key,src);}
      catch{continue;}finally{await canvas.dispose();}
    }
    if(run!==revision)return;
    let image=button.querySelector('.studio-slide-thumbnail');if(!image){image=document.createElement('img');image.className='studio-slide-thumbnail';image.draggable=false;button.append(image);}
    image.src=src;image.alt='';
  }
  const activeKeys=new Set(slides.map(slide=>JSON.stringify(slide)));for(const key of previews.keys())if(!activeKeys.has(key))previews.delete(key);
}
function changeZoom(value){
  closePopover();
  const editor=engine?.getStudioState().editor;if(!editor)return;
  const slide=$('teacherStage'),before=slide.getBoundingClientRect(),view=viewport.getBoundingClientRect();
  const centerX=(view.left+viewport.clientWidth/2-before.left)/before.width;
  const centerY=(view.top+viewport.clientHeight/2-before.top)/before.height;
  editor.setZoom(value);
  const zoom=editor.zoom;
  $('studioZoomLabel').textContent=Math.round(zoom*100)+'%';
  $('studioZoomLabel').setAttribute('aria-label',`Canvas zoom ${Math.round(zoom*100)} percent of fit`);
  $('studioZoomOut').disabled=zoom<=.25;$('studioZoomIn').disabled=zoom>=3;
  requestAnimationFrame(()=>{
    if(zoom===1){viewport.scrollLeft=0;viewport.scrollTop=0;return;}
    const after=slide.getBoundingClientRect(),bounds=viewport.getBoundingClientRect();
    viewport.scrollLeft+=after.left+after.width*centerX-(bounds.left+viewport.clientWidth/2);
    viewport.scrollTop+=after.top+after.height*centerY-(bounds.top+viewport.clientHeight/2);
  });
}
$('studioZoomOut').addEventListener('click',()=>changeZoom((engine?.getStudioState().editor.zoom||1)-.25));
$('studioZoomIn').addEventListener('click',()=>changeZoom((engine?.getStudioState().editor.zoom||1)+.25));
$('studioZoomFit').addEventListener('click',()=>changeZoom(1));
toolStrip.querySelectorAll('[data-tooltip]').forEach(button=>button.title=button.dataset.tooltip);
engine=await import('./main.js');

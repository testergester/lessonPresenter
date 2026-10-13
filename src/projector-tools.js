import {installFloatingTools} from './floating-tools.js';

export function installProjectorTools({onMode,onCommand,onUndo,onFullscreen}){
  const dock=document.createElement('div');dock.className='presentation-tools projector-tools';dock.hidden=true;
  dock.innerHTML=`<button type="button" class="presentation-tools-handle" aria-label="Presentation tools — drag to move" aria-expanded="false" aria-controls="projectorToolsContent" title="Presentation tools · drag to move"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m13 6 5 5"/></svg></button>
    <div id="projectorToolsContent" class="presentation-tools-content" hidden><div class="presentation-tool-row" role="group" aria-label="Presentation tools">
      <button type="button" data-mode="pen" aria-pressed="false">✎ Pen</button><button type="button" data-mode="laser" aria-pressed="false">⊙ Laser</button>
      <button type="button" data-undo disabled aria-label="Undo annotation">↶</button><button type="button" data-action="clear" aria-label="Clear live annotations">⌫</button>
      <button type="button" data-action="previous" aria-label="Previous presentation step">←</button><button type="button" data-action="next" aria-label="Next presentation step">→</button>
      <button type="button" data-fullscreen>Full screen</button></div><span class="projector-ink-status" role="status">Live annotations · saved lesson stays unchanged</span></div>`;
  document.body.append(dock);
  const floating=installFloatingTools(dock,dock.querySelector('.presentation-tools-handle'),dock.querySelector('.presentation-tools-content'));
  let mode=null;
  function setMode(next){mode=next;dock.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));onMode(mode);}
  dock.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>setMode(mode===button.dataset.mode?null:button.dataset.mode)));
  dock.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>onCommand({action:button.dataset.action})));
  dock.querySelector('[data-undo]').addEventListener('click',onUndo);dock.querySelector('[data-fullscreen]').addEventListener('click',onFullscreen);
  document.addEventListener('keydown',event=>{
    if(dock.hidden||event.target.closest('button,input,select,textarea,[contenteditable],iframe'))return;
    if(event.key==='Escape'&&mode){event.preventDefault();setMode(null);return;}
    if(event.key.toLowerCase()==='a'){event.preventDefault();setMode(mode==='pen'?null:'pen');return;}
    if(mode==='pen')return;
    const action=event.key==='ArrowLeft'?'previous':event.key==='ArrowRight'||event.code==='Space'?'next':null;
    if(action){event.preventDefault();onCommand({action});}
  });
  return {
    get mode(){return mode;},
    update({ready,undo}){dock.hidden=!ready;dock.querySelector('[data-undo]').disabled=!undo;if(!ready){setMode(null);floating.collapse();}floating.refresh();},
    status(text){dock.querySelector('.projector-ink-status').textContent=text;}
  };
}

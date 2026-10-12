import {installFloatingTools} from './floating-tools.js';
// Presentation controls reuse the lesson's pen and stage timer.
export function installPresentationTools() {
  const $=id=>document.getElementById(id);
  const trigger=document.createElement('button');
  trigger.className='presentation-edge';trigger.type='button';trigger.hidden=true;
  trigger.setAttribute('aria-label','Show presentation navigation');trigger.setAttribute('aria-controls','presentationBar');
  const dock=document.createElement('div');dock.className='presentation-tools';dock.hidden=true;
  dock.innerHTML=`<button type="button" class="presentation-tools-handle" aria-label="Presentation tools — drag to move" aria-expanded="false" aria-controls="presentationToolsContent" title="Presentation tools · drag to move"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m13 6 5 5"/></svg></button>
  <div id="presentationToolsContent" class="presentation-tools-content" hidden><div class="presentation-tool-row" role="group" aria-label="Presentation tools">
    <button type="button" data-tool="pen" aria-pressed="false" title="Annotate slide (A)">✎ <span>Pen</span></button>
    <button type="button" data-tool="laser" aria-pressed="false" title="Point to the slide">⊙ <span>Laser</span></button>
    <button type="button" data-tool="undo" aria-label="Undo annotation" title="Undo annotation">↶</button>
    <button type="button" data-tool="clear" aria-label="Clear slide annotations" title="Clear slide annotations">⌫</button>
    <button type="button" data-tool="timer" aria-expanded="false" aria-controls="presentationTimerPanel">◷ <span data-time>00:00</span></button>
  </div>
  <div id="presentationTimerPanel" class="presentation-timer-panel" hidden>
    <label>Minutes <input type="number" min="1" max="180" value="5" aria-label="Presentation timer minutes"></label>
    <span data-state aria-live="polite"></span>
    <div><button type="button" data-tool="start">Start timer</button><button type="button" data-tool="reset">Reset</button></div>
  </div></div>`;
  const laser=document.createElement('div');laser.className='presentation-laser';laser.hidden=true;laser.setAttribute('aria-hidden','true');
  document.body.append(trigger,dock,laser);
  const content=dock.querySelector('.presentation-tools-content');
  const syncStatus=document.createElement('span');syncStatus.className='presentation-sync-status';syncStatus.textContent='Annotations are separate from the saved lesson';content.append(syncStatus);
  const floating=installFloatingTools(dock,dock.querySelector('.presentation-tools-handle'),content);
  document.addEventListener('presentation:status',event=>{syncStatus.textContent=event.detail.text;});
  const button=tool=>dock.querySelector(`[data-tool="${tool}"]`);
  const panel=dock.querySelector('#presentationTimerPanel'),minutes=dock.querySelector('input');
  let laserEnabled=false,hideNavigation;
  const presenting=()=>document.body.classList.contains('audience-mode');
  const hideLaser=()=>{laser.hidden=true;};
  function setLaser(enabled) {
    if(laserEnabled===enabled)return;
    laserEnabled=enabled;button('laser').setAttribute('aria-pressed',String(enabled));
    document.body.classList.toggle('presentation-laser-active',enabled);hideLaser();
  }
  function showNavigation() {
    clearTimeout(hideNavigation);document.body.classList.add('presentation-navigation-visible');
  }
  function scheduleHide() {
    clearTimeout(hideNavigation);hideNavigation=setTimeout(()=>document.body.classList.remove('presentation-navigation-visible'),500);
  }
  trigger.addEventListener('pointerenter',showNavigation);
  trigger.addEventListener('click',()=>{showNavigation();$('presentationPrevBtn').focus();});
  trigger.addEventListener('pointerleave',scheduleHide);
  $('presentationBar').addEventListener('pointerenter',showNavigation);
  $('presentationBar').addEventListener('pointerleave',event=>{
    if(event.pointerType==='mouse'&&$('presentationBar').contains(document.activeElement))$('teacherStage').focus({preventScroll:true});
    scheduleHide();
  });
  $('presentationBar').addEventListener('focusout',scheduleHide);
  button('pen').addEventListener('click',()=>{setLaser(false);$('toggleAnnotatorBtn').click();});
  button('laser').addEventListener('click',()=>{
    const enabled=!laserEnabled;
    if(enabled&&document.body.classList.contains('annotation-active'))$('toggleAnnotatorBtn').click();
    setLaser(enabled);
  });
  button('undo').addEventListener('click',()=>$('undoAnnotationBtn').click());
  button('clear').addEventListener('click',()=>$('clearPageAnnotationBtn').click());
  button('timer').addEventListener('click',()=>{panel.hidden=!panel.hidden;button('timer').setAttribute('aria-expanded',String(!panel.hidden));});
  button('start').addEventListener('click',()=>($('pauseTimerBtn').hidden?$('startTimerBtn'):$('pauseTimerBtn')).click());
  button('reset').addEventListener('click',()=>$('resetTimerBtn').click());
  minutes.addEventListener('change',()=>{$('timerMinutes').value=minutes.value;$('timerMinutes').dispatchEvent(new Event('change'));syncTimer();});
  function syncTimer() {
    dock.querySelector('[data-time]').textContent=$('timerReadout').textContent;
    dock.querySelector('[data-state]').textContent=$('timerState').textContent;
    button('start').textContent=$('pauseTimerBtn').hidden?$('startTimerBtn').textContent:'Pause timer';
    button('timer').classList.toggle('timer-warning',$('timerReadout').classList.contains('timer-warning'));
    if(document.activeElement!==minutes)minutes.value=$('timerMinutes').value;
  }
  document.addEventListener('studio:timer',syncTimer);
  function syncMode() {
    trigger.hidden=dock.hidden=!presenting();
    floating.refresh();
    const pen=document.body.classList.contains('annotation-active');button('pen').setAttribute('aria-pressed',String(pen));
    if(!presenting()||pen)setLaser(false);
    if(!presenting()){floating.collapse();clearTimeout(hideNavigation);if(document.body.classList.contains('presentation-navigation-visible'))document.body.classList.remove('presentation-navigation-visible');panel.hidden=true;button('timer').setAttribute('aria-expanded','false');}
  }
  document.addEventListener('studio:mode',syncMode);
  document.addEventListener('studio:drawing',syncMode);
  document.addEventListener('pointermove',event=>{
    if(!presenting()||!laserEnabled||!event.target.closest('#teacherStage')){hideLaser();return;}
    laser.hidden=false;laser.style.left=`${event.clientX}px`;laser.style.top=`${event.clientY}px`;
  });
  // Laser pointing must not advance animations or reveal answers on click.
  $('teacherStage').addEventListener('click',event=>{if(presenting()&&laserEnabled)event.stopImmediatePropagation();},true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&laserEnabled){setLaser(false);event.stopImmediatePropagation();}},true);
  window.addEventListener('blur',hideLaser);document.addEventListener('pointerout',event=>{if(!event.relatedTarget)hideLaser();});
  syncMode();syncTimer();
}

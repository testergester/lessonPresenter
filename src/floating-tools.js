export function clampFloatingPosition(x,y,width,height,viewportWidth,viewportHeight) {
  return {x:Math.max(8,Math.min(x,Math.max(8,viewportWidth-width-8))),y:Math.max(8,Math.min(y,Math.max(8,viewportHeight-height-8)))};
}

export function installFloatingTools(dock,handle,content) {
  let position=null,drag=null,expanded=false,hovered=false,keyboard=false,hideTimer,suppressClick=false;
  const viewport=()=>({width:window.innerWidth,height:window.innerHeight});
  function layout() {
    if(dock.hidden)return;
    const view=viewport();
    position=clampFloatingPosition(position?.x??view.width/2-22,position?.y??view.height-60,44,44,view.width,view.height);
    dock.style.left=position.x+'px';dock.style.top=position.y+'px';
    if(expanded){
      const rect=content.getBoundingClientRect();
      let x,y=position.y;
      if(position.x+52+rect.width<=view.width-8)x=position.x+52;
      else if(position.x-rect.width-8>=8)x=position.x-rect.width-8;
      else {x=position.x+22-rect.width/2;y=position.y+52+rect.height<=view.height-8?position.y+52:position.y-rect.height-8;}
      const placed=clampFloatingPosition(x,y,rect.width,rect.height,view.width,view.height);
      content.style.left=placed.x-position.x+'px';content.style.top=placed.y-position.y+'px';
    }
  }
  function show(value) {
    clearTimeout(hideTimer);expanded=value;content.hidden=!value;content.inert=!value;
    handle.setAttribute('aria-expanded',String(value));dock.classList.toggle('is-expanded',value);
    if(!value){
      if(content.contains(document.activeElement))document.activeElement.blur();
      const panel=content.querySelector('.presentation-timer-panel');if(panel)panel.hidden=true;
      content.querySelector('[data-tool=timer]')?.setAttribute('aria-expanded','false');
    }
    layout();
  }
  function scheduleHide(){clearTimeout(hideTimer);hideTimer=setTimeout(()=>{if(!drag&&!hovered&&!keyboard)show(false);},180);}
  dock.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse'){hovered=true;if(!drag)show(true);}});
  dock.addEventListener('pointerleave',event=>{if(event.pointerType==='mouse'){hovered=false;keyboard=false;scheduleHide();}});
  dock.addEventListener('focusin',()=>{if(keyboard)show(true);});
  dock.addEventListener('focusout',()=>{keyboard=false;scheduleHide();});
  handle.addEventListener('keydown',event=>{
    if(event.key==='Tab')return;
    keyboard=true;
    if(event.key.startsWith('Arrow')){
      event.preventDefault();event.stopPropagation();layout();const step=event.shiftKey?20:8;
      position={x:position.x+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0),y:position.y+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0)};layout();
    }
  });
  document.addEventListener('keydown',event=>{if(event.key==='Tab')keyboard=true;if(event.key==='Escape'&&expanded&&dock.contains(event.target)){event.preventDefault();event.stopImmediatePropagation();keyboard=false;show(false);handle.focus();}},true);
  handle.addEventListener('click',event=>{event.stopPropagation();if(suppressClick){suppressClick=false;return;}show(event.detail===0||event.pointerType==='touch'?!expanded:true);});
  handle.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    clearTimeout(hideTimer);layout();keyboard=false;suppressClick=false;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,origin:{...position},moved:false};
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if(!drag.moved&&Math.hypot(dx,dy)<5)return;
    drag.moved=true;event.preventDefault();dock.classList.add('is-dragging');
    position={x:drag.origin.x+dx,y:drag.origin.y+dy};layout();
  });
  function endDrag(event){
    if(!drag||drag.id!==event.pointerId)return;
    suppressClick=drag.moved;drag=null;dock.classList.remove('is-dragging');
    if(handle.hasPointerCapture(event.pointerId))handle.releasePointerCapture(event.pointerId);
    if(event.pointerType!=='mouse'||!hovered)show(false);
  }
  handle.addEventListener('pointerup',endDrag);handle.addEventListener('pointercancel',endDrag);
  document.addEventListener('pointerdown',event=>{if(!dock.contains(event.target)){keyboard=false;show(false);}});
  window.addEventListener('resize',layout);
  new ResizeObserver(layout).observe(content);
  show(false);
  return {refresh:layout,collapse:()=>{hovered=false;keyboard=false;show(false);}};
}

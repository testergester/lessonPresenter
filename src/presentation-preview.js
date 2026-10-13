import {initialAnimationVisibility} from './animations.js';
import {normalizeState,presentationCommand} from './live-protocol.js';

// Preview the settled result of a click without playing effects, changing the
// live document, or sending a command to the presentation.
export function slideAtPresentationState(doc,value){
  const state=normalizeState(doc,value),slide=structuredClone(doc.slides[state.index]);
  const effects=slide.lpAnimations||[],visibility=initialAnimationVisibility(effects);
  for(const effect of effects.slice(0,state.cursor))for(const id of effect.targets)visibility.set(id,effect.effect==='appear');
  function visit(objects){
    for(const object of objects){
      const animated=visibility.has(object.lpId),shown=visibility.get(object.lpId)??true;
      if(animated){object.visible=object.visible!==false&&shown;object.opacity=(object.opacity??1)*(shown?1:0);}
      if(object.lpRole==='answer')object.visible=object.lpAnswerIndex<state.reveal&&shown;
      if(object.objects)visit(object.objects);
    }
  }
  visit(slide.objects);return slide;
}

export function nextPresentationPreview(doc,value){
  const current=normalizeState(doc,value),next=presentationCommand(doc,current,{action:'next'});
  const kind=next.index!==current.index?'slide':next.cursor!==current.cursor?'animation':next.reveal!==current.reveal?'answer':'end';
  return {kind,state:next,slide:slideAtPresentationState(doc,next),title:doc.lesson.pages[next.index].title,label:{slide:'Next slide',animation:'Next animation',answer:'Next answer',end:'Presentation complete'}[kind]};
}

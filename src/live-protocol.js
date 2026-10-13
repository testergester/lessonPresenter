import {animationBatch} from './animations.js';

export const validRoomId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
export const clamp=value=>Math.max(0,Math.min(1,value));
export function laserPoint(value){
  if(!value||!Number.isFinite(value.x)||!Number.isFinite(value.y))return null;
  return {x:clamp(value.x),y:clamp(value.y),visible:value.visible===true};
}
export function motionPoint(origin,event,rotation=0){
  if(!origin||!Number.isFinite(event.beta)||!Number.isFinite(event.gamma))return null;
  const dx=(event.gamma-origin.gamma)/45,dy=(event.beta-origin.beta)/45;
  const angle=rotation*Math.PI/180;
  return laserPoint({x:origin.x+dx*Math.cos(angle)+dy*Math.sin(angle),y:origin.y+dy*Math.cos(angle)-dx*Math.sin(angle),visible:true});
}
const initialCursor=slide=>slide?.lpAnimations?.[0]?.trigger!=='click'?animationBatch(slide?.lpAnimations||[]).next:0;
export function slideState(doc,index=0){
  const visible=doc.lesson.pages.flatMap((page,i)=>page.hidden?[]:[i]);
  const selected=visible.includes(index)?index:visible[0]??0;
  return {index:selected,reveal:0,cursor:initialCursor(doc.slides[selected]),blank:visible.length===0,ended:false,epoch:0};
}
export function normalizeState(doc,value){
  const state=slideState(doc,value?.index);
  if(state.index!==value?.index)return state;
  const total=doc.lesson.pages[state.index].questions.filter(q=>q.answer).length;
  return {...state,reveal:Math.max(0,Math.min(total,Math.trunc(value.reveal)||0)),cursor:Math.max(initialCursor(doc.slides[state.index]),Math.min(doc.slides[state.index].lpAnimations?.length||0,Math.trunc(value.cursor)||0)),blank:state.blank||value.blank===true,ended:value.ended===true,epoch:Math.max(0,Math.trunc(value.epoch)||0)};
}
export function presentationCommand(doc,current,command){
  const state=normalizeState(doc,current),indices=doc.lesson.pages.flatMap((page,i)=>page.hidden?[]:[i]);
  const jump=index=>({...slideState(doc,index),blank:state.blank});
  switch(command?.action){
    case 'slide': return Number.isInteger(command.index)&&indices.includes(command.index)?jump(command.index):state;
    case 'blank': return {...state,blank:!state.blank};
    case 'restart': return {...jump(state.index),epoch:state.epoch+1};
    case 'hide': return {...state,reveal:0};
    case 'reveal': return normalizeState(doc,{...state,reveal:state.reveal+1});
    case 'previous': {
      if(state.reveal>0)return {...state,reveal:state.reveal-1};
      const index=indices[indices.indexOf(state.index)-1];return index===undefined?state:jump(index);
    }
    case 'next': {
      const effects=doc.slides[state.index].lpAnimations||[];
      if(state.cursor<effects.length)return {...state,cursor:animationBatch(effects,state.cursor).next};
      const total=doc.lesson.pages[state.index].questions.filter(q=>q.answer).length;
      if(state.reveal<total)return {...state,reveal:state.reveal+1};
      const index=indices[indices.indexOf(state.index)+1];return index===undefined?state:jump(index);
    }
    default:return state;
  }
}
export function remoteStroke(value){
  if(!Number.isInteger(value?.index)||value.index<0||!/^#[a-f0-9]{6}$/i.test(value.color)||!Array.isArray(value.points)||value.points.length<2||value.points.length>1000)return null;
  if(value.points.some(point=>!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)))return null;
  return {type:'Path',lpId:crypto.randomUUID(),lpAnnotation:true,lpLiveAnnotation:true,fill:null,stroke:value.color,strokeWidth:Math.max(2,Math.min(20,Number(value.width)||4)),strokeLineCap:'round',strokeLineJoin:'round',path:value.points.map((point,i)=>[i?'L':'M',clamp(point[0])*1280,clamp(point[1])*720])};
}

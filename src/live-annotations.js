import {validRoomId} from './live-protocol.js';

const geometry=['left','top','width','height','radius','scaleX','scaleY','angle','skewX','skewY','strokeWidth','opacity'];
const copyKeys=[...geometry,'originX','originY','flipX','flipY','strokeUniform','strokeLineCap','strokeLineJoin','fill','stroke','path'];
const colors=value=>value===null||value==='transparent'||typeof value==='string'&&/^#[a-f0-9]{3,8}$/i.test(value);
export const annotationKind=object=>object.lpAnnotationKind||({rect:'square',circle:'circle',path:'pen'}[object.type?.toLowerCase()]||'pen');

export function annotationCommand(operation,index,object){
  return {action:'annotation',operation,index,id:typeof object==='string'?object:object.lpId,...(operation==='delete'?{}:{object:JSON.stringify(object)})};
}
export function decodeAnnotationCommand(value){
  if(value?.action!=='annotation'||!['create','update','delete'].includes(value.operation)||!Number.isInteger(value.index)||value.index<0||value.index>=300||!validRoomId(value.id))return null;
  if(value.operation==='delete')return {operation:value.operation,index:value.index,id:value.id};
  if(typeof value.object!=='string'||value.object.length>65536)return null;
  let object;try{object=JSON.parse(value.object);}catch{return null;}
  if(!object||object.lpId!==value.id||!['path','rect','circle'].includes(object.type?.toLowerCase()))return null;
  if(geometry.some(key=>object[key]!==undefined&&(!Number.isFinite(object[key])||Math.abs(object[key])>25600)))return null;
  if(['width','height','radius','strokeWidth'].some(key=>object[key]!==undefined&&object[key]<0)||['scaleX','scaleY'].some(key=>object[key]!==undefined&&(object[key]<=0||object[key]>100)))return null;
  if(object.opacity!==undefined&&(object.opacity<0||object.opacity>1)||!colors(object.stroke)||!colors(object.fill))return null;
  if(object.strokeWidth!==undefined&&object.strokeWidth>30)return null;
  if(object.type.toLowerCase()==='path'){
    if(!Array.isArray(object.path)||!object.path.length||object.path.length>2048)return null;
    const lengths={M:3,L:3,Q:5,C:7,Z:1};
    if(object.path.some(point=>!Array.isArray(point)||lengths[point[0]]!==point.length||point.slice(1).some(number=>!Number.isFinite(number)||Math.abs(number)>25600)))return null;
  }
  if(object.originX!==undefined&&!['left','center','right'].includes(object.originX)||object.originY!==undefined&&!['top','center','bottom'].includes(object.originY))return null;
  const kind=annotationKind(object);if(!['pen','square','circle','arrow'].includes(kind))return null;
  const safe={type:object.type,lpId:value.id,lpAnnotation:true,lpLiveAnnotation:true,lpAnnotationKind:kind};
  for(const key of copyKeys)if(object[key]!==undefined)safe[key]=structuredClone(object[key]);
  return {operation:value.operation,index:value.index,id:value.id,object:safe};
}
export function applyAnnotationCommand(doc,value){
  const request=decodeAnnotationCommand(value);if(!request||!doc.slides[request.index])return null;
  const objects=doc.slides[request.index].objects,at=objects.findIndex(object=>object.lpId===request.id);
  if(request.operation==='create'?at!==-1:at===-1||objects[at].lpLiveAnnotation!==true)return null;
  if(request.operation==='update'&&objects[at].type.toLowerCase()!==request.object.type.toLowerCase())return null;
  const next=structuredClone(doc),target=next.slides[request.index].objects;
  if(request.operation==='create')target.push(request.object);
  else if(request.operation==='delete')target.splice(at,1);
  else target[at]=request.object;
  return next;
}
export function annotationSignature(object){
  return JSON.stringify([object?.lpId,object?.type?.toLowerCase(),...copyKeys.map(key=>object?.[key]??null),annotationKind(object||{})]);
}

export function annotationShape(kind,start,end,color,width,id=crypto.randomUUID()){
  if(!['square','circle','arrow'].includes(kind))return null;
  const dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy);
  if(length<4)return null;
  const common={lpId:id,lpAnnotation:true,lpLiveAnnotation:true,lpAnnotationKind:kind,fill:'transparent',stroke:color,strokeWidth:width,strokeUniform:true,originX:'left',originY:'top'};
  if(kind==='arrow'){
    const angle=Math.atan2(dy,dx),head=Math.min(36,Math.max(12,length*.2));
    const a=[end.x-head*Math.cos(angle-Math.PI/6),end.y-head*Math.sin(angle-Math.PI/6)],b=[end.x-head*Math.cos(angle+Math.PI/6),end.y-head*Math.sin(angle+Math.PI/6)];
    return {...common,type:'Path',fill:null,path:[['M',start.x,start.y],['L',end.x,end.y],['M',...a],['L',end.x,end.y],['L',...b]],strokeLineCap:'round',strokeLineJoin:'round'};
  }
  const size=Math.min(Math.abs(dx),Math.abs(dy));if(size<4)return null;
  const left=Math.min(start.x,start.x+Math.sign(dx)*size),top=Math.min(start.y,start.y+Math.sign(dy)*size);
  return kind==='circle'?{...common,type:'Circle',left,top,radius:size/2}:{...common,type:'Rect',left,top,width:size,height:size};
}

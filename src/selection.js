import {FabricImage} from 'fabric';

export function paintableObjects(object) {
  if(object instanceof FabricImage)return [];
  if(typeof object.getObjects==='function')return object.getObjects().flatMap(paintableObjects);
  return [object];
}
export function paintProperty(object) {
  return object.type?.toLowerCase()==='line'||!object.fill&&object.stroke?'stroke':'fill';
}
export function selectionPaint(object) {
  const targets=paintableObjects(object);
  const colors=new Set(targets.map(o=>typeof o[paintProperty(o)]==='string'?o[paintProperty(o)]:''));
  return {paintable:targets.length>0,mixedColor:colors.size>1,fill:targets[0]?.[paintProperty(targets[0])]||'#244d40'};
}

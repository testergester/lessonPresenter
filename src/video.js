import {Rect,classRegistry,util} from 'fabric';

// Preserve the standard Rect wire format, including existing video lessons.
export class VideoRect extends Rect {
  static type='Rect';
  _render(ctx) {
    super._render(ctx);
    if(!this.lpVideoId)return;
    const w=this.width,h=this.height;
    ctx.save();ctx.beginPath();ctx.rect(-w/2,-h/2,w,h);ctx.clip();
    const size=Math.min(32,w/16,h/7);
    ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font=`600 ${size}px Arial`;
    ctx.fillText('▶ Play YouTube video',0,-size*.5,Math.max(1,w-32));
    ctx.font=`${size*.52}px Arial`;
    ctx.fillText(`youtu.be/${this.lpVideoId}`,0,size,Math.max(1,w-32));
    ctx.restore();
  }
}
classRegistry.setClass(VideoRect,'Rect');
classRegistry.setClass(VideoRect,'rect');

export function visibleVideos(objects) {
  return objects.filter(o=>o.visible!==false&&o.opacity>0).flatMap(o=>o.lpVideoId?[o]:visibleVideos(o.getObjects?.()||[]));
}
export function topObjectAt(objects,point) {
  for(const object of [...objects].reverse()){
    if(object.visible===false||object.opacity<=0||!object.containsPoint(point))continue;
    return topObjectAt(object.getObjects?.()||[],point)||object;
  }
}
export function videoTransform(object,viewportTransform) {
  // CSS positions the iframe's top-left; Fabric matrices use the object center.
  return util.multiplyTransformMatrices(viewportTransform,util.multiplyTransformMatrices(
    object.calcTransformMatrix(),[1,0,0,1,-object.width/2,-object.height/2]));
}

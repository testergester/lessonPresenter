import {FabricImage,classRegistry} from 'fabric';

export const DEFAULT_IMAGE_STYLE={stroke:'#cbd3df',strokeWidth:2,strokeUniform:true,lpImageRadius:16};
export function imageCornerRadii(image){
  const radius=Math.max(0,Math.min(200,Number(image.lpImageRadius)||0));
  return {x:Math.min(image.width/2,radius/Math.max(.001,Math.abs(image.scaleX||1))),y:Math.min(image.height/2,radius/Math.max(.001,Math.abs(image.scaleY||1)))};
}
// Keep the standard Image document type, with an optional rounded frame.
// Older images without lpImageRadius retain their original rendering.
export class StyledImage extends FabricImage {
  static type='Image';
  framePath(ctx){
    ctx.beginPath();ctx.roundRect(-this.width/2,-this.height/2,this.width,this.height,imageCornerRadii(this));
  }
  _stroke(ctx){
    if(!this.lpImageRadius)return super._stroke(ctx);
    this.framePath(ctx);
  }
  _renderFill(ctx){
    if(!this.lpImageRadius)return super._renderFill(ctx);
    ctx.save();this.framePath(ctx);ctx.clip();super._renderFill(ctx);ctx.restore();
    // Clipping creates a new path; restore it for Fabric's border pass.
    this.framePath(ctx);
  }
}
classRegistry.setClass(StyledImage,'Image');
classRegistry.setClass(StyledImage,'image');

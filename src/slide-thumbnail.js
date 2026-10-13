import {StaticCanvas,FabricObject} from 'fabric';
import './image.js';
import './video.js';

// Match the editor's document defaults, including older slides that omit them.
FabricObject.ownDefaults.originX='left';
FabricObject.ownDefaults.originY='top';

export class SlideThumbnail {
  constructor(element,{onError=()=>{},onReady=()=>{},onLoading=()=>{}}={}){
    this.canvas=new StaticCanvas(element,{width:480,height:270,enableRetinaScaling:true,renderOnAddRemove:false});
    this.onError=onError;this.onReady=onReady;this.onLoading=onLoading;this.pending=null;this.key=null;this.running=false;this.disposed=false;
  }
  update(slide){
    const key=JSON.stringify(slide);if(this.disposed||key===this.key)return;
    this.key=key;this.pending=structuredClone(slide);this.onLoading();this.render();
  }
  async render(){
    if(this.running)return;this.running=true;
    try{
      while(this.pending&&!this.disposed){
        const slide=this.pending;this.pending=null;
        await this.canvas.loadFromJSON(slide);
        if(this.disposed||this.pending)continue;
        this.canvas.setDimensions({width:480,height:270});this.canvas.setViewportTransform([.375,0,0,.375,0,0]);
        this.canvas.renderAll();this.onReady();
      }
    }catch(error){this.key=null;this.onError(error);}
    finally{this.running=false;if(this.pending&&!this.disposed)this.render();}
  }
  dispose(){this.disposed=true;this.pending=null;this.canvas.dispose();}
}

import {digestJSON} from './cloud-sync.js';

export const presentationDigest=doc=>digestJSON(JSON.stringify({lesson:doc.lesson,slides:doc.slides}));
export function annotationPatch(previous=[],next=[]) {
  const before=new Map(previous.map(object=>[object.lpId,JSON.stringify(object)]));
  const after=new Map(next.map(object=>[object.lpId,JSON.stringify(object)]));
  const patch={};
  for(const [id,json] of after){if(!/^[A-Za-z0-9_-]{1,128}$/.test(id))throw new Error('Invalid annotation ID.');if(json.length>65536)throw new Error('This stroke is too large to sync.');if(before.get(id)!==json)patch[id]=json;}
  for(const id of before.keys())if(!after.has(id))patch[id]=null;
  return patch;
}
export function decodePresentationPages(pages={}) {
  const result={};
  for(const [index,page] of Object.entries(pages)){
    if(!/^\d+$/.test(index))continue;
    result[index]=Object.entries(page.strokes||{}).flatMap(([id,json])=>{
      try{const object=JSON.parse(json);if(!['Path','path'].includes(object.type)||object.lpId!==id||!Array.isArray(object.path))return [];return [{...object,lpSessionAnnotation:true,lpAnnotation:true}];}catch{return [];}
    });
  }
  return result;
}

// Each action starts its own Firebase write immediately. No lesson autosave
// debounce or serial acknowledgement queue sits in front of presentation data.
export class PresentationWriter {
  constructor({write,onState=()=>{}}){this.write=write;this.onState=onState;this.pages={};this.pending=0;this.unsynced={};}
  receive(pages){
    const merged=structuredClone(pages);
    for(const [index,patch] of Object.entries(this.unsynced)){
      const objects=new Map((merged[index]||[]).map(object=>[object.lpId,object]));
      for(const [id,json] of Object.entries(patch)){if(json===null)objects.delete(id);else objects.set(id,JSON.parse(json));}
      merged[index]=[...objects.values()];
    }
    this.pages=merged;return merged;
  }
  change(index,objects){
    const patch=annotationPatch(this.pages[index]||[],objects);this.pages[index]=structuredClone(objects);
    if(!Object.keys(patch).length)return Promise.resolve();
    this.unsynced[index]={...this.unsynced[index],...patch};
    this.pending++;this.onState('syncing');
    return Promise.resolve().then(()=>this.write(index,patch)).then(()=>{
      for(const [id,json] of Object.entries(patch))if(this.unsynced[index]?.[id]===json)delete this.unsynced[index][id];
      if(!Object.keys(this.unsynced[index]||{}).length)delete this.unsynced[index];
      if(!--this.pending&&!Object.keys(this.unsynced).length)this.onState('synced');
    },error=>{this.pending--;this.onState('error',error);throw error;});
  }
}

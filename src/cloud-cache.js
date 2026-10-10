import {digestJSON} from './cloud-sync.js';

// Separate from the workspace: reopening the app still starts with a blank slide.
// A cache is only a confirmed server snapshot, never an unsaved draft.
export function createCloudCache(project,{indexedDB=globalThis.indexedDB}={}){
  const key=(uid,id)=>JSON.stringify([project,uid,id]);
  async function transaction(mode,run){
    if(!indexedDB)return null;
    let db;
    try{
      db=await new Promise((resolve,reject)=>{
        const request=indexedDB.open('lessonPresenter.cloudCache.v1',1);
        request.onupgradeneeded=()=>request.result.createObjectStore('lessons');
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Cache busy'));
      });
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction('lessons',mode);let result=null;
        run(tx.objectStore('lessons'),value=>{result=value;});
        tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
      });
    }catch{return null;}finally{db?.close();}
  }
  return {
    async get(uid,id){
      const record=await transaction('readonly',(store,done)=>{store.get(key(uid,id)).onsuccess=event=>done(event.target.result);});
      if(!record||record.lessonId!==id||record.revision!==record.model?.head?.revision||record.checksum!==digestJSON(JSON.stringify(record.model)))return null;
      return record.model;
    },
    async put(uid,id,model){
      if(!Number.isSafeInteger(model?.head?.revision))return;
      const record={lessonId:id,revision:model.head.revision,model:structuredClone(model),checksum:digestJSON(JSON.stringify(model))};
      await transaction('readwrite',store=>{
        store.get(key(uid,id)).onsuccess=event=>{
          const previous=event.target.result;
          if(!previous||previous.revision<=record.revision)store.put(record,key(uid,id));
        };
      });
    },
    async remove(uid,id){await transaction('readwrite',store=>store.delete(key(uid,id)));}
  };
}

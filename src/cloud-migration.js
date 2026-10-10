import {decodeIncremental} from './cloud-incremental.js';

// Firebase may reorder object keys. Compare values, including embedded pixels,
// rather than relying on transport ordering during the one-time verification.
const canonical=value=>JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
export async function migrateCloudStorage({read,write}){
  if(await read('cloudLessons/migrationComplete'))return;
  // Freeze the whole old namespace before reading, including new lesson IDs.
  await write({'cloudLessons/migrationStarted':true});
  for(let attempt=0;attempt<3;attempt++){
    const [source,destination]=await Promise.all([read('syncTests'),read('cloudLessons')]);
    const copies={},changes={};
    for(const [id,model] of Object.entries(source?.incrementalLessons||{})){
      if(destination?.lessons?.[id])continue; // The production record is authoritative.
      if(!model.head?.deleted)decodeIncremental(model);
      else if(!Number.isSafeInteger(model.head.revision)||model.head.revision<1)throw Error('Invalid deleted lesson revision.');
      copies[id]=model;changes['cloudLessons/lessons/'+id]=model;
      if(!model.head.deleted)changes['cloudLessons/index/'+id]={title:model.head.title,updatedAt:model.head.updatedAt};
    }
    try{if(Object.keys(changes).length)await write(changes);}
    catch(error){if(attempt<2&&['PERMISSION_DENIED','permission-denied'].includes(error.code))continue;throw error;}
    for(const [id,model] of Object.entries(copies)){
      const saved=await read('cloudLessons/lessons/'+id);
      // A concurrent production edit is permitted only after the copied revision.
      if(!saved||saved.head.revision<model.head.revision||saved.head.revision===model.head.revision&&canonical(saved)!==canonical(model))throw Error('Cloud migration verification failed. The original lessons have been retained.');
    }
    // Per-record rules freeze migrated sources. Mark complete only after all
    // records present at the final read have matching production destinations.
    const [latest,production]=await Promise.all([read('syncTests'),read('cloudLessons')]);
    if(Object.keys(latest?.incrementalLessons||{}).some(id=>!production?.lessons?.[id]))continue;
    await write({'cloudLessons/migrationComplete':true});return;
  }
  throw Error('Cloud lessons changed during migration. Refresh to retry; original lessons are safe.');
}

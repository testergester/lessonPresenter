import {decodeIncremental,byteSize} from './cloud-incremental.js';

export const sameRevision=(a,b)=>!!a&&!!b&&a.revision===b.revision&&a.writeId===b.writeId&&a.deleted===b.deleted;
export function versionField(path){return path.replace(/^(entries|assets)\//,(_,section)=>section==='entries'?'e:':'a:');}
export function versionPath(field){
  if(/^e:[A-Za-z0-9_]+$/.test(field))return 'entries/'+field.slice(2);
  if(/^a:[a-f0-9]{64}$/.test(field))return 'assets/'+field.slice(2);
  throw Error('Invalid changed cloud field.');
}

// Subscribe to /head only. A stale cache queries the small revision index, then
// reads the current values of changed fields (including deletion tombstones).
// Recheck the head to avoid mixing two concurrent revisions into one snapshot.
export async function readCloudRevision({head,cached,read,changed,onRead=()=>{}}){
  let current=head;
  const tracked=async path=>{const value=await read(path);onRead(byteSize(value));return value;};
  for(let attempt=0;attempt<5;attempt++){
    if(!current||current.deleted)return {model:current?{head:current}:null,mode:'deleted'};
    if(sameRevision(cached?.head,current))return {model:{...cached,head:current},mode:'cached'};
    const canPatch=cached?.entries&&current.cacheVersion===1&&cached.head?.cacheVersion===1&&current.cacheEpoch&&current.cacheEpoch===cached.head.cacheEpoch&&cached.head.revision<current.revision;
    let model,mode;
    if(canPatch){
      const versions=await changed(cached.head.revision+1,current.revision)||{};onRead(byteSize(versions));
      model=structuredClone(cached);mode='changes';
      const fields=Object.entries(versions);
      // Limit concurrent requests when a large edit touches many objects.
      for(let offset=0;offset<fields.length;offset+=16){
        await Promise.all(fields.slice(offset,offset+16).map(async([field,revision])=>{
          if(!Number.isSafeInteger(revision)||revision<=cached.head.revision||revision>current.revision)throw Error('Invalid cloud field revision.');
          const path=versionPath(field),[section,name]=path.split('/'),value=await tracked(path);
          model[section]||={};if(value===null)delete model[section][name];else model[section][name]=value;
        }));
      }
    }else{
      const [entries,assets]=await Promise.all([tracked('entries'),tracked('assets')]);
      model={entries:entries||{},assets:assets||{}};mode='full';
    }
    const latest=await tracked('head');
    if(!sameRevision(current,latest)){current=latest;continue;}
    model.head=latest;decodeIncremental(model);
    return {model,mode};
  }
  throw Error('The lesson is changing quickly. Please try opening it again.');
}

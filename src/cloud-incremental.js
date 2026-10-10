import {validateDocument} from './document.js';
import {cloudPayload} from './cloud-payload.js';
import {digestJSON} from './cloud-sync.js';

export const INCREMENTAL_VERSION=1;
export const byteSize=value=>new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value)).length;
const key=value=>'k'+[...new TextEncoder().encode(value)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
const imageHashes=new Map();
async function assetKey(source){
  if(!imageHashes.has(source)){
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
    if(imageHashes.size>100)imageHashes.clear();
    imageHashes.set(source,[...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join(''));
  }
  return imageHashes.get(source);
}

// This cloud-only representation preserves Version 1 JSON, including key order,
// nulls and empty arrays. Each field is a JSON string so Firebase's array/null
// coercion cannot change a Fabric object. Embedded pixels live outside entries.
// Short aliases remove repeated record/property names without changing Firebase's
// string leaf layout or revision rules. The dictionary is stable across edits.
function expandEntries(entries){
  if(!entries?._layout)return entries;
  const layout=JSON.parse(entries._layout);
  if(layout?.v!==2||!layout.p||!layout.f)throw Error('Unsupported cloud field layout.');
  const result={slideOrder:entries.slideOrder};
  for(const [alias,prefix] of Object.entries(layout.p))if(!/^[0-9a-z]+$/.test(alias)||typeof prefix!=='string'||! /^(doc|lesson|s[a-f0-9]+_(page|slide|o[a-f0-9-]+(?:_\d+)?))$/.test(prefix))throw Error('Invalid cloud record alias.');
  for(const [alias,field] of Object.entries(layout.f))if(!/^[0-9a-z]+$/.test(alias)||typeof field!=='string'||!/^(keys|k[a-f0-9]*)$/.test(field))throw Error('Invalid cloud property alias.');
  for(const [name,value] of Object.entries(entries)){
    if(name==='_layout'||name==='slideOrder')continue;
    const [p,f,...extra]=name.split('_');
    if(extra.length||!Object.hasOwn(layout.p,p)||!Object.hasOwn(layout.f,f))throw Error('Unknown cloud field alias.');
    const full=layout.p[p]+'_'+layout.f[f];if(Object.hasOwn(result,full))throw Error('Duplicate cloud field alias.');
    result[full]=value;
  }
  return result;
}
function compactEntries(entries,previous){
  const old=previous?._layout?JSON.parse(previous._layout):{p:{},f:{}};
  const layout={v:2,p:{},f:{}},reverse={p:new Map(Object.entries(old.p).map(([alias,name])=>[name,alias])),f:new Map(Object.entries(old.f).map(([alias,name])=>[name,alias]))};
  const counters={p:Math.max(-1,...Object.keys(old.p).map(a=>parseInt(a,36)))+1,f:Math.max(-1,...Object.keys(old.f).map(a=>parseInt(a,36)))+1};
  const alias=(kind,name)=>{let value=reverse[kind].get(name);if(value===undefined){value=(counters[kind]++).toString(36);reverse[kind].set(name,value);}layout[kind][value]=name;return value;};
  const result={slideOrder:entries.slideOrder};
  for(const [name,value] of Object.entries(entries)){
    if(name==='slideOrder')continue;
    const at=name.lastIndexOf('_');result[alias('p',name.slice(0,at))+'_'+alias('f',name.slice(at+1))]=value;
  }
  for(const kind of ['p','f'])layout[kind]=Object.fromEntries(Object.entries(layout[kind]).sort(([a],[b])=>a.localeCompare(b)));
  result._layout=JSON.stringify(layout);return result;
}
export async function encodeIncremental(document,previous=null,{compact=true}={}){
  document=JSON.parse(cloudPayload(document));
  const entries={},assets={},usedSlides=new Set();
  const old=previous?decodeIncremental(previous):null;
  const oldOrder=previous?JSON.parse(previous.entries.slideOrder):[];
  const ids=slide=>new Set(slide.objects.map(object=>object.lpId).filter(Boolean));
  const oldIds=old?.slides.map(ids)||[];
  function slideId(slide,page,index){
    const candidates=ids(slide);let match=-1,best=0;
    oldIds.forEach((set,i)=>{if(usedSlides.has(oldOrder[i]))return;const overlap=[...candidates].filter(id=>set.has(id)).length;if(overlap>best){best=overlap;match=i;}});
    if(match<0&&old)match=old.slides.findIndex((value,i)=>!usedSlides.has(oldOrder[i])&&JSON.stringify(value)===JSON.stringify(slide)&&JSON.stringify(old.lesson.pages[i])===JSON.stringify(page));
    if(match<0&&oldOrder[index]&&!usedSlides.has(oldOrder[index]))match=index;
    const id=match>=0?oldOrder[match]:'s'+crypto.randomUUID().replaceAll('-','');usedSlides.add(id);return id;
  }
  async function bag(prefix,value,special={}){
    entries[prefix+'_keys']=JSON.stringify(Object.keys(value));
    for(const [name,item] of Object.entries(value)){
      if(Object.hasOwn(special,name)){await special[name](item,prefix+'_'+key(name));continue;}
      entries[prefix+'_'+key(name)]=JSON.stringify(item);
    }
  }
  const order=[];
  await bag('doc',document,{lesson:async()=>{},slides:async()=>{}});
  await bag('lesson',document.lesson,{pages:async()=>{}});
  for(let i=0;i<document.slides.length;i++){
    const slide=document.slides[i],sid=slideId(slide,document.lesson.pages[i],i),seen=new Map();order.push(sid);
    async function object(value,fallback){
      const base='o'+digestJSON(String(value.lpId||fallback));
      const count=seen.get(base)||0;seen.set(base,count+1);const oid=base+(count?'_'+count:'');
      await bag(sid+'_'+oid,value,{
        src:async(source,path)=>{if(typeof source==='string'&&source.startsWith('data:image/')){const id=await assetKey(source);assets[id]=source;entries[path]=JSON.stringify('@asset:'+id);}else entries[path]=JSON.stringify(source);},
        objects:async(children,path)=>{const refs=[];for(let j=0;j<children.length;j++)refs.push(await object(children[j],oid+'_child_'+j));entries[path]=JSON.stringify(refs);},
        clipPath:async(clip,path)=>{entries[path]=JSON.stringify(clip?await object(clip,oid+'_clip'):clip);}
      });return oid;
    }
    await bag(sid+'_page',document.lesson.pages[i]);
    await bag(sid+'_slide',slide,{objects:async(objects,path)=>{const refs=[];for(let j=0;j<objects.length;j++)refs.push(await object(objects[j],'root_'+j));entries[path]=JSON.stringify(refs);}});
  }
  entries.slideOrder=JSON.stringify(order);
  return {entries:compact?compactEntries(entries,previous?.entries):entries,assets};
}

export function decodeIncremental(model){
  const entries=expandEntries(model?.entries),assets=model?.assets||{};
  if(!entries?.slideOrder)throw new Error('The incremental lesson is incomplete.');
  if(model.head&&(model.head.version!==INCREMENTAL_VERSION||!Number.isSafeInteger(model.head.revision)||model.head.revision<1))throw new Error('Unsupported incremental lesson version or revision.');
  function read(path){if(typeof entries[path]!=='string')throw new Error('A cloud lesson field is missing.');return JSON.parse(entries[path]);}
  function bag(prefix,special={}){
    const output={};
    const names=read(prefix+'_keys');if(!Array.isArray(names)||names.length>1000)throw new Error('Invalid cloud field list.');
    for(const name of names){
      if(typeof name!=='string')throw new Error('Invalid cloud field name.');
      if(['__proto__','constructor','prototype'].includes(name))throw new Error('Unsafe cloud field.');
      const path=prefix+'_'+key(name);
      if(!Object.hasOwn(special,name)&&typeof entries[path]!=='string'){
        // Early test copies listed Fabric's undefined text-on-path property.
        // JSON omits it; this is safe only for text, never Path geometry.
        const type=entries[prefix+'_'+key('type')];
        if(name==='path'&&['"Textbox"','"Text"','"IText"','"textbox"','"text"','"i-text"'].includes(type))continue;
        throw new Error(`A cloud lesson field is missing (${name}).`);
      }
      output[name]=Object.hasOwn(special,name)?special[name](path):read(path);
    }
    return output;
  }
  const pages=[],slides=[];
  for(const sid of read('slideOrder')){
    const visiting=new Set();
    function object(oid){
      if(visiting.has(oid)||visiting.size>100)throw new Error('Invalid cyclic cloud object.');
      visiting.add(oid);try{return bag(sid+'_'+oid,{
      src:path=>{const source=read(path);if(typeof source!=='string'||!source.startsWith('@asset:'))return source;const id=source.slice(7);if(typeof assets[id]!=='string')throw new Error('A cloud image is missing.');return assets[id];},
      objects:path=>read(path).map(object),clipPath:path=>{const id=read(path);return id?object(id):id;}
    });}finally{visiting.delete(oid);}}
    pages.push(bag(sid+'_page'));slides.push(bag(sid+'_slide',{objects:path=>read(path).map(object)}));
  }
  const lesson=bag('lesson',{pages:()=>pages});
  const document=validateDocument(bag('doc',{lesson:()=>lesson,slides:()=>slides}));cloudPayload(document);return document;
}

export function incrementalPatch(previous,next){
  const patch={};
  for(const section of ['entries','assets']){
    const before=previous?.[section]||{},after=next[section]||{};
    for(const name of new Set([...Object.keys(before),...Object.keys(after)])){
      if(before[name]!==after[name])patch[section+'/'+name]=after[name]??null;
    }
  }
  return patch;
}

export function comparePayload(patch,document,{initial=false}={}){
  const patchBytes=byteSize(patch),wholeBytes=byteSize(JSON.stringify(document));
  return {patchBytes,wholeBytes,initial,reduction:wholeBytes?Math.min(99.9,Math.round((1-patchBytes/wholeBytes)*1000)/10):0};
}

export function incrementalConflict(message='Another browser saved first. Open Cloud lessons to choose a version.'){
  const error=new Error(message);error.code='cloud/conflict';return error;
}

// Narrow atomic updates guarded by revision rules. No account-root transaction,
// no full image resend, and no automatic fallback that might overwrite a peer.
export async function commitIncremental({document,base,next,id,path,write,readHead,create=false,sourceId=null,indexPath='incrementalIndex'}){
  if(!create&&(!base||base.head?.deleted))throw new Error('This cloud lesson was deleted; it cannot be updated.');
  const revision=create?1:base.head.revision+1;
  const patch=incrementalPatch(create?null:base,next),writeId=crypto.randomUUID();
  const head={version:INCREMENTAL_VERSION,revision,writeId,title:(document.lesson.title||'Untitled lesson').slice(0,200),updatedAt:write.timestamp,deleted:false,cacheVersion:1,cacheEpoch:base?.head?.cacheVersion===1&&base.head.cacheEpoch||crypto.randomUUID()};
  if(sourceId)head.sourceId=sourceId;
  const update={};for(const [field,value] of Object.entries(patch))update[path+'/'+field]=value;
  // Retain each field's most recent revision, even after deletion. A browser
  // returning months later can request just fields newer than its cached copy.
  const versions=Object.fromEntries(Object.keys(!create&&base.head.cacheVersion===1&&base.head.cacheEpoch?patch:incrementalPatch(null,next)).map(field=>[field.replace(/^(entries|assets)\//,(_,section)=>section==='entries'?'e:':'a:'),revision]));
  if(create||base.head.cacheVersion!==1||!base.head.cacheEpoch)update[path+'/fieldVersions']=versions;
  else for(const [field,value] of Object.entries(versions))update[path+'/fieldVersions/'+field]=value;
  update[path+'/head']=head;
  update[indexPath+'/'+id]={title:head.title,updatedAt:write.timestamp};
  if(sourceId)update[indexPath+'/'+id].sourceId=sourceId;
  try{await write.update(update);}
  catch(error){
    if(error.code==='PERMISSION_DENIED'||error.code==='permission-denied'){
      const remote=await readHead();
      if(remote?.deleted||(!create&&!remote))throw new Error('This cloud lesson was deleted; it cannot be updated.');
      if(remote&&remote.revision!==base?.head?.revision)throw incrementalConflict();
    }
    throw error;
  }
  return {head,metrics:comparePayload(update,document,{initial:create})};
}

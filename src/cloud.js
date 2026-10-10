import {initializeApp} from 'firebase/app';
import {getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged} from 'firebase/auth';
import {getDatabase,ref,get,update,serverTimestamp,onValue,query,orderByValue,startAt,endAt} from 'firebase/database';
import {firebaseConfig,OWNER_EMAIL} from './firebase-config.js';
import {validateDocument} from './document.js';
import {migrateCloudStorage} from './cloud-migration.js';
import {cloudPayload} from './cloud-payload.js';
import {requireCloudId} from './cloud-mutations.js';
import {encodeIncremental,decodeIncremental,incrementalPatch,comparePayload,commitIncremental,byteSize} from './cloud-incremental.js';
import {createCloudCache} from './cloud-cache.js';
import {readCloudRevision,sameRevision} from './cloud-reader.js';
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app);
const incrementalCache=new Map(),migrations=new Map(),storageMigrations=new Map();
const modelFeeds=new Map();
const pendingWrites=new Map();
const persistentCache=createCloudCache(firebaseConfig.databaseURL||firebaseConfig.projectId);
const cacheKey=(uid,id)=>uid+'/'+id;
function owner(){const user=auth.currentUser;if(!user||!user.emailVerified||user.email!==OWNER_EMAIL)throw new Error('Sign in with the project owner’s Google account.');return user;}
export const watchAccount=callback=>onAuthStateChanged(auth,callback);
export async function login(){const provider=new GoogleAuthProvider();provider.setCustomParameters({login_hint:OWNER_EMAIL});await signInWithPopup(auth,provider);try{owner();}catch(error){await signOut(auth);throw error;}}
export const logout=()=>signOut(auth);
const lessonPath=(uid,id)=>`cloudLessons/${uid}/lessons/${requireCloudId(id)}`;
function ensureStorage(user){
  if(!storageMigrations.has(user.uid)){
    const location=path=>{const [root,...parts]=path.split('/');return [root,user.uid,...parts].join('/');};
    const pending=migrateCloudStorage({
      read:async path=>(await get(ref(db,location(path)))).val(),
      write:changes=>update(ref(db),Object.fromEntries(Object.entries(changes).map(([path,value])=>[location(path),value])))
    }).catch(error=>{storageMigrations.delete(user.uid);throw error;});
    storageMigrations.set(user.uid,pending);
  }
  return storageMigrations.get(user.uid);
}
const readModel=async(uid,id)=>(await get(ref(db,lessonPath(uid,id)))).val();

async function writeIncremental(user,document,id,{base=null,create=false,indexOnly=false,onMetrics=()=>{}}={}){
  if(!create&&(!base||base.head?.deleted))throw new Error('This cloud lesson was deleted; it cannot be updated.');
  const next=indexOnly?{entries:base.entries,assets:base.assets||{}}:await encodeIncremental(document,create?null:base);
  const key=cacheKey(user.uid,id);let finish;
  const pending=new Promise(resolve=>{finish=resolve;});pendingWrites.set(key,pending);
  try{
  const result=await commitIncremental({document,base,next,id,path:'lessons/'+id,indexPath:'index',create,
    write:{timestamp:serverTimestamp(),update:changes=>update(ref(db,`cloudLessons/${user.uid}`),changes)},
    readHead:async()=>(await get(ref(db,lessonPath(user.uid,id)+'/head'))).val()
  });
  const cached=incrementalCache.get(key);
  if(!cached||cached.head.revision<=result.head.revision)incrementalCache.set(key,{...next,head:result.head});
  // Server timestamps resolve in the head listener. Store only acknowledged
  // content; revision/writeId are sufficient to validate it after a restart.
  await persistentCache.put(user.uid,id,{...next,head:result.head});
  onMetrics({kind:'save',backend:'incremental',...result.metrics});return id;
  }finally{if(pendingWrites.get(key)===pending)pendingWrites.delete(key);finish();}
}

// Legacy JSON is read only for a one-time upgrade. Keep the original record as
// a recovery copy; it is never updated or used again once an incremental head exists.
async function ensureIncremental(user,id,{knownMissing=false}={}){
  requireCloudId(id);await ensureStorage(user);const key=cacheKey(user.uid,id);
  if(migrations.has(key))return migrations.get(key);
  const pending=(async()=>{
    let value=knownMissing?null:await readModel(user.uid,id);
    if(value)return value; // Includes deletion markers: never resurrect them.
    const legacy=await get(ref(db,`users/${user.uid}/lessons/${id}/json`));
    if(!legacy.exists())return null;
    const document=validateDocument(JSON.parse(legacy.val()));
    try{await writeIncremental(user,document,id,{create:true});}
    catch(error){
      // Another browser may have completed the same upgrade first.
      if(!['cloud/conflict','PERMISSION_DENIED','permission-denied'].includes(error.code))throw error;
      value=await readModel(user.uid,id);if(!value)throw error;
      return value;
    }
    return readModel(user.uid,id);
  })();
  migrations.set(key,pending);
  try{return await pending;}finally{migrations.delete(key);}
}
export async function saveCloudLesson(document,id,{create=false,onMetrics=()=>{}}={}){
  requireCloudId(id);cloudPayload(document);const user=owner(),key=cacheKey(user.uid,id);
  await ensureStorage(user);
  const base=create?null:incrementalCache.get(key)||await ensureIncremental(user,id);
  return writeIncremental(user,document,id,{base,create,onMetrics});
}
// Opening and watching share a tiny head listener. Content is retained across
// page reloads in IndexedDB and fetched only when its server revision changes.
function modelFeed(user,id){
  requireCloudId(id);const key=cacheKey(user.uid,id);
  if(modelFeeds.has(key))return modelFeeds.get(key);
  const feed={observers:new Set(),readers:0,closed:false,stop:null,value:undefined,idle:null,chain:Promise.resolve(),report:null};
  let resolve,reject;feed.first=new Promise((yes,no)=>{resolve=yes;reject=no;});feed.first.catch(()=>{});
  feed.close=()=>{if(feed.closed)return;feed.closed=true;clearTimeout(feed.idle);feed.stop?.();if(modelFeeds.get(key)===feed)modelFeeds.delete(key);};
  feed.emit=(value,report)=>{
    if(feed.closed)return;
    if(feed.value?.head?.revision>value?.head?.revision)return;
    feed.value=value;feed.report=report;if(feed.observers.size)incrementalCache.set(key,value);resolve(value);
    for(const observer of feed.observers)observer.receive(value,report);
  };
  const fail=error=>{if(feed.closed)return;reject(error);for(const observer of feed.observers)observer.error(error);feed.close();};
  modelFeeds.set(key,feed);
  Promise.all([ensureStorage(user),persistentCache.get(user.uid,id)]).then(([,stored])=>{
    if(feed.closed)return;
    let cache=incrementalCache.get(key)||stored;
    try{if(cache&&!cache.head?.deleted)decodeIncremental(cache);}catch{cache=null;}
    feed.stop=onValue(ref(db,lessonPath(user.uid,id)+'/head'),snapshot=>{
      if(feed.closed)return;
      const head=snapshot.val();
      feed.chain=feed.chain.then(async()=>{
        // Firebase fires optimistic local events before acknowledging writes.
        // Wait so failed writes never become confirmed persistent snapshots.
        await pendingWrites.get(key);
        if(feed.closed)return;
        // Own acknowledged saves may be newer than the snapshot used to open.
        const saved=incrementalCache.get(key);
        if(saved&&(!cache||saved.head.revision>cache.head.revision))cache=saved;
        if(head&&feed.value?.head?.revision>head.revision)return;
        if(head&&sameRevision(feed.value?.head,head))return;
        let bytes=byteSize(head),result;
        if(!head){
          const value=await ensureIncremental(user,id,{knownMissing:true});
          result={model:value,mode:value?'full':'deleted'};if(value)bytes+=byteSize(value);
        }else result=await readCloudRevision({head,cached:cache,
          read:async field=>(await get(ref(db,lessonPath(user.uid,id)+'/'+field))).val(),
          changed:async(from,to)=>(await get(query(ref(db,lessonPath(user.uid,id)+'/fieldVersions'),orderByValue(),startAt(from),endAt(to)))).val(),
          onRead:size=>{bytes+=size;}
        });
        if(feed.closed)return;
        cache=result.model;
        if(cache&&!cache.head.deleted&&(cache.head.cacheVersion!==1||!cache.head.cacheEpoch)){
          // One-time metadata upgrade: preserve every lesson field and asset.
          // This gives already-existing lessons a delta index on first opening.
          try{
            await writeIncremental(user,decodeIncremental(cache),id,{base:cache,indexOnly:true});
            cache=incrementalCache.get(key);
          }catch(error){
            if(error.code!=='cloud/conflict')throw error;
            // A peer saved first. Its head event will refresh the cache next;
            // never publish this outdated opening as a successful result.
            const latest=(await get(ref(db,lessonPath(user.uid,id)+'/head'))).val();bytes+=byteSize(latest);
            result=await readCloudRevision({head:latest,cached:cache,
              read:async field=>(await get(ref(db,lessonPath(user.uid,id)+'/'+field))).val(),
              changed:async(from,to)=>(await get(query(ref(db,lessonPath(user.uid,id)+'/fieldVersions'),orderByValue(),startAt(from),endAt(to)))).val(),
              onRead:size=>{bytes+=size;}
            });cache=result.model;
          }
        }
        if(cache?.head?.deleted||!cache){await persistentCache.remove(user.uid,id);}
        else await persistentCache.put(user.uid,id,cache);
        if(feed.closed)return;
        feed.emit(cache,{mode:result.mode,downloadBytes:bytes,revision:cache?.head?.revision});
      }).catch(fail);
    },fail);
  }).catch(fail);
  return feed;
}
function releaseFeed(feed,{warm=false}={}){
  if(feed.readers||feed.observers.size)return;
  if(!warm){feed.close();return;}
  clearTimeout(feed.idle);feed.idle=setTimeout(()=>{if(!feed.readers&&!feed.observers.size)feed.close();},30000);feed.idle.unref?.();
}
export async function getCloudLesson(id){
  const user=owner(),feed=modelFeed(user,id);feed.readers++;clearTimeout(feed.idle);
  try{
    await feed.chain;
    const value=feed.value===undefined?await feed.first:feed.value;
    if(!value||value.head?.deleted)throw new Error('This cloud lesson no longer exists.');
    incrementalCache.set(cacheKey(user.uid,id),value);
    return decodeIncremental(value);
  }finally{feed.readers--;releaseFeed(feed,{warm:true});}
}
export function getCloudLessonRevision(id){return incrementalCache.get(cacheKey(owner().uid,id))?.head?.revision||null;}
export function watchCloudLesson(id,receive,onError,{onMetrics=()=>{}}={}){
  const feed=modelFeed(owner(),id);let previous=null,lastWrite=null,cancelled=false;
  const observer={error:onError,receive:(value,report)=>{
    if(cancelled)return;
    try{
      incrementalCache.set(cacheKey(owner().uid,id),value);
      if(!value||value.head?.deleted){receive(null);return;}
      const document=decodeIncremental(value);
      if(value.head.writeId!==lastWrite){
        const patch=incrementalPatch(previous,value);patch.head=value.head;
        onMetrics({kind:'receive',backend:'incremental',...comparePayload(patch,document,{initial:!previous}),...report});lastWrite=value.head.writeId;
      }
      previous=value;receive(document);
    }catch(error){onError(error);}
  }};
  clearTimeout(feed.idle);feed.observers.add(observer);
  if(feed.value!==undefined)queueMicrotask(()=>observer.receive(feed.value,feed.report));
  return ()=>{cancelled=true;feed.observers.delete(observer);releaseFeed(feed);};
}
const mergeIndexes=(legacy,current)=>Object.entries({...legacy,...current}).map(([id,value])=>({id,...value,backend:'incremental'})).sort((a,b)=>b.updatedAt-a.updatedAt);
export async function listCloudLessons(){
  const user=owner();await ensureStorage(user);
  const [legacy,current]=await Promise.all([get(ref(db,`users/${user.uid}/index`)),get(ref(db,`cloudLessons/${user.uid}/index`))]);
  return mergeIndexes(legacy.val(),current.val());
}
export function watchCloudIndex(receive,onError){
  const user=owner();let legacy,current,closed=false,stopLegacy,stopCurrent;
  const emit=()=>{if(!closed&&legacy!==undefined&&current!==undefined)receive(mergeIndexes(legacy,current));};
  ensureStorage(user).then(()=>{
    if(closed)return;
    stopLegacy=onValue(ref(db,`users/${user.uid}/index`),snapshot=>{legacy=snapshot.val()||{};emit();},onError);
    stopCurrent=onValue(ref(db,`cloudLessons/${user.uid}/index`),snapshot=>{current=snapshot.val()||{};emit();},onError);
  }).catch(error=>{if(!closed)onError(error);});
  return ()=>{closed=true;stopLegacy?.();stopCurrent?.();};
}
export async function deleteCloudLesson(id){
  requireCloudId(id);const user=owner();await ensureStorage(user);
  for(let attempt=0;attempt<3;attempt++){
    const head=(await get(ref(db,lessonPath(user.uid,id)+'/head'))).val();
    const changes={[`users/${user.uid}/lessons/${id}`]:null,[`users/${user.uid}/index/${id}`]:null,[`cloudLessons/${user.uid}/index/${id}`]:null};
    if(head&&!head.deleted){
      const path=lessonPath(user.uid,id);
      changes[path+'/head']={...head,revision:head.revision+1,deleted:true,writeId:crypto.randomUUID(),updatedAt:serverTimestamp()};
      changes[path+'/entries']=null;changes[path+'/assets']=null;changes[path+'/fieldVersions']=null;
    }
    try{await update(ref(db),changes);incrementalCache.delete(cacheKey(user.uid,id));await persistentCache.remove(user.uid,id);return;}
    catch(error){if(attempt===2||!['PERMISSION_DENIED','permission-denied'].includes(error.code))throw error;}
  }
}
export const watchConnection=receive=>onValue(ref(db,'.info/connected'),snapshot=>receive(snapshot.val()===true));

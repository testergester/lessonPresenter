const KEY='lessonPresenter.diagnostics.v1';
const LIMIT=300;
const clean=value=>String(value||'').replace(/https?:\/\/[^\s)]+/g,'[URL]').replace(/(?:data:image\/[^\s]+|AIza[\w-]+)/g,'[redacted]').slice(0,2000);
export function createDiagnostics(storage){
  if(storage===undefined)try{storage=globalThis.sessionStorage;}catch{/* Storage may be blocked by the browser. */}
  let entries=[];try{entries=JSON.parse(storage?.getItem(KEY)||'[]').slice(-LIMIT);}catch{/* Storage is optional. */}
  const listeners=new Set();
  return {
    log(event,details={}){
      const entry={time:new Date().toISOString(),event};
      for(const field of ['lessonId','phase','bytes','objects','online','connected','code','message','stack'])if(details[field]!==undefined)entry[field]=typeof details[field]==='string'?clean(details[field]):details[field];
      entries.push(entry);entries=entries.slice(-LIMIT);
      try{storage?.setItem(KEY,JSON.stringify(entries));}catch{/* Never break the app for logging. */}
      for(const listener of listeners)listener(entries);
    },
    read:()=>structuredClone(entries),
    subscribe(listener){listeners.add(listener);listener(entries);return ()=>listeners.delete(listener);},
  };
}
export const diagnostics=createDiagnostics();
export function captureCrashes(target=globalThis.window,logger=diagnostics){
  target?.addEventListener('error',event=>logger.log('crash',{message:event.message,stack:event.error?.stack}));
  target?.addEventListener('unhandledrejection',event=>logger.log('unhandled-rejection',{message:event.reason?.message||event.reason,stack:event.reason?.stack}));
}
export function setupDiagnosticsUI(document,downloadBlob,logger=diagnostics){
  logger.subscribe(entries=>{document.getElementById('cloudLogs').textContent=entries.map(entry=>JSON.stringify(entry)).join('\n');});
  document.getElementById('cloudDownloadLogsBtn').addEventListener('click',()=>downloadBlob(new Blob([JSON.stringify({format:'lesson-presenter-diagnostics',version:1,entries:logger.read()},null,2)],{type:'application/json'}),'lesson-presenter-diagnostics.json'));
}

import {validateDocument} from './document.js';
export const MAX_CLOUD_BYTES=2*1024*1024;
export function cloudPayload(document){
  validateDocument(document);
  const json=JSON.stringify(document);
  if(new TextEncoder().encode(json).length>MAX_CLOUD_BYTES)throw new Error('This lesson exceeds the 2 MB cloud limit. Use URL images or download a local copy.');
  return json;
}

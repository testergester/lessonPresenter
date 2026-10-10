// A content fingerprint is a change detector, not a security primitive.
export function digestJSON(json){
  let a=2166136261,b=5381;for(let i=0;i<json.length;i++){const c=json.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b,33)^c;}
  return `${(a>>>0).toString(16)}-${(b>>>0).toString(16)}-${json.length}`;
}
export const documentDigest=doc=>digestJSON(JSON.stringify(doc));
export function remoteDecision(remote,{current,baseline,remoteBaseline=baseline,inFlight=[]}){
  const incoming=documentDigest(remote),local=documentDigest(current);
  if(incoming===local||inFlight.includes(incoming))return 'echo';
  if(incoming===remoteBaseline)return 'unchanged';
  if(local===baseline)return 'apply';
  return 'conflict';
}

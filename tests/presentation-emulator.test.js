import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
test('presentation overlays sync to another client without modifying a raw lesson and reject unauthorized writes',{skip:!process.env.FIREBASE_DATABASE_EMULATOR_HOST},async()=>{
  const require=createRequire(process.env.LP_FIREBASE_TEST_TOOLS+'/package.json');
  const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
  const {ref,set,get,update,onValue}=require('firebase/database');
  const [host,port]=process.env.FIREBASE_DATABASE_EMULATOR_HOST.split(':');
  const env=await initializeTestEnvironment({projectId:'demo-lp-presentation',database:{host,port:Number(port),rules:readFileSync(new URL('../database.rules.json',import.meta.url),'utf8')}});
  const claims={email:'mea.gdrive3@gmail.com',email_verified:true,firebase:{sign_in_provider:'google.com'}};
  const a=env.authenticatedContext('owner',claims).database(),b=env.authenticatedContext('owner',claims).database();
  const root='presentationSessions/owner/lesson',path=root+'/sessions/session/pages/0/strokes';let stop,stopRemoved;
  try{
    const raw={title:'Original',objects:[{text:'Keep this'}]};
    const rawPath='cloudLessons/owner/lessons/lesson';
    await env.withSecurityRulesDisabled(async context=>set(ref(context.database(),rawPath),raw));
    await set(ref(a,root+'/active'),{id:'session',baseDigest:'digest',clientId:'teacher',startedAt:Date.now()});
    await set(ref(a,root+'/history/session'),{baseDigest:'digest',title:'Original',pageCount:1,clientId:'teacher',startedAt:Date.now()});
    const json=JSON.stringify({type:'Path',lpId:'stroke',path:[['M',1,2],['L',3,4]]});
    const seen=new Promise((resolve,reject)=>{stop=onValue(ref(b,path),snapshot=>{if(snapshot.child('stroke').val()===json)resolve();},reject);});
    await update(ref(a,path),{stroke:json});await seen;
    await env.withSecurityRulesDisabled(async context=>assert.deepEqual((await get(ref(context.database(),rawPath))).val(),raw));
    const removed=new Promise((resolve,reject)=>{stopRemoved=onValue(ref(b,path),snapshot=>{if(!snapshot.exists())resolve();},reject);});
    await update(ref(a,path),{stroke:null});await removed;
    await assertFails(set(ref(env.unauthenticatedContext().database(),path+'/other'),json));
    await assertFails(set(ref(env.authenticatedContext('stranger',claims).database(),path+'/other'),json));
    await assertFails(set(ref(a,root+'/sessions/session/rawLesson'),raw));
    await assertFails(set(ref(a,path+'/huge'),'x'.repeat(65537)));
  }finally{stop?.();stopRemoved?.();await env.cleanup();}
});

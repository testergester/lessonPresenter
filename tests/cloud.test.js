import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cloudPayload,MAX_CLOUD_BYTES} from '../src/cloud-payload.js';
import {imageURL} from '../src/image-url.js';
const doc=()=>({format:'lesson-presenter',version:1,lesson:{title:'Cloud test',pages:[{title:'Slide',questions:[]}]},slides:[{objects:[]}]});
test('URL validation rejects credentials, insecure and executable sources',()=>{assert.equal(imageURL(' https://example.com/image?q=1 '),'https://example.com/image?q=1');for(const value of ['http://example.com/i','javascript:alert(1)','https://user:pass@example.com/i','data:image/png;base64,AAA','nonsense'])assert.equal(imageURL(value),null);});
test('cloud saves validate before upload and count UTF-8 bytes',()=>{assert.deepEqual(JSON.parse(cloudPayload(doc())),doc());const large=doc();large.lesson.title='a'.repeat(MAX_CLOUD_BYTES);assert.throws(()=>cloudPayload(large),/2 MB/);large.lesson.title='😀'.repeat(MAX_CLOUD_BYTES/3);assert.throws(()=>cloudPayload(large),/2 MB/);assert.throws(()=>cloudPayload({...doc(),version:2}),/not supported/);});

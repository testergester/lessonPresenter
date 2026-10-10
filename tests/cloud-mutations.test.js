import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requireCloudId} from '../src/cloud-mutations.js';
test('cloud identity rejects invalid database paths',()=>{
 assert.equal(requireCloudId('lesson-123'),'lesson-123');
 for(const id of ['',null,'../lesson','a/b','a.b','a#b'])assert.throws(()=>requireCloudId(id),/stable cloud lesson ID/);
});

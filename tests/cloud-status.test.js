import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cloudStatusState} from '../src/cloud-status.js';
test('cloud indicator distinguishes acknowledged saves, pending edits, connection attempts and failures',()=>{
 for(const text of ['Cloud: saved · live updates on','Cloud: updated from another browser','Cloud: incremental test copy ready'])assert.equal(cloudStatusState(text),'saved');
 for(const text of ['Cloud: saving…','Cloud: changes pending…'])assert.equal(cloudStatusState(text),'saving');
 for(const text of ['Cloud: connecting…','Cloud: connected · checking local changes'])assert.equal(cloudStatusState(text),'connecting');
 for(const text of ['Cloud: disconnected','Cloud: sign in to sync','Cloud: not saved — retry','Cloud: edits in both browsers — choose which version','Cloud: live connection failed'])assert.equal(cloudStatusState(text),'disconnected');
});

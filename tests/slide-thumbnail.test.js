import {test} from 'node:test';
import assert from 'node:assert/strict';
import {util} from 'fabric';
import '../src/slide-thumbnail.js';

test('legacy thumbnail objects use editor coordinates while explicit center origins are preserved',async()=>{
  const [legacy,centered]=await util.enlivenObjects([
    {type:'Rect',left:64,top:244,width:1152,height:160,strokeWidth:0},
    {type:'Rect',left:64,top:244,width:40,height:40,strokeWidth:0,originX:'center',originY:'center'}
  ]);
  assert.equal(legacy.getBoundingRect().left,64);assert.equal(legacy.getBoundingRect().top,244);
  assert.equal(centered.getBoundingRect().left,44);assert.equal(centered.getBoundingRect().top,224);
});

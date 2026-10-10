import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StudioPanels} from '../src/studio-panels.js';

test('mobile drawers are exclusive and never overwrite desktop preferences',()=>{
  const p=new StudioPanels();p.setPanel('properties',false);p.setMobile(true);
  assert.equal(p.visible('slides'),false);p.toggle('slides');assert.equal(p.visible('slides'),true);
  p.toggle('properties');assert.equal(p.visible('slides'),false);assert.equal(p.visible('properties'),true);
  p.closeDrawer();p.setMobile(false);assert.equal(p.visible('slides'),true);assert.equal(p.visible('properties'),false);
});
test('preview starts clear, allows only slide navigation, and restores teacher panels',()=>{
  const p=new StudioPanels();p.setPanel('slides',false);p.setMode('preview');
  assert.equal(p.visible('slides'),false);assert.equal(p.visible('properties'),false);
  p.toggle('properties');assert.equal(p.visible('properties'),false);
  p.toggle('slides');assert.equal(p.visible('slides'),true);
  p.setMode('teacher');assert.equal(p.visible('slides'),false);assert.equal(p.visible('properties'),true);
  p.setMode('preview');assert.equal(p.visible('slides'),false);
});
test('presentation and breakpoint transitions close drawers without exposing properties in preview',()=>{
  const p=new StudioPanels(true);p.toggle('slides');p.setMode('present');assert.equal(p.drawer,null);
  p.toggle('properties');assert.equal(p.visible('properties'),false);
  p.setMode('preview');p.toggle('slides');p.setMobile(false);
  assert.equal(p.drawer,null);assert.equal(p.visible('slides'),false);assert.equal(p.visible('properties'),false);
});

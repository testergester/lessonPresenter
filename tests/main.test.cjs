const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'main.js'), 'utf8').split("$('lessonJson').value=JSON.stringify(sampleLesson,null,2);")[0].replace(/^import .*;$/gm, '');
function app() {
  let now = 0;
  let tick;
  let intervalActive = false;
  const nodes = {};
  function classList() {
    const classes = new Set();
    return {toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }, contains(name) { return classes.has(name); }};
  }
  function node(id) {
    return nodes[id] ||= {value: '8', textContent: '', hidden: false, children: [], attributes: {}, classList: classList(), setAttribute(name, value) { this.attributes[name] = value; }};
  }
  const context = vm.createContext({document: {getElementById: node, querySelectorAll:()=>[], body: {classList: classList()}}, console,
    Date: {now: () => now}, setInterval: fn => {tick=fn;intervalActive=true;return 1;}, clearInterval() {intervalActive=false;}, setTimeout, clearTimeout,
    localStorage: {setItem() {}}, structuredClone, DOCUMENT_FORMAT:"lesson-presenter", saveSession:async()=>{}, requestAnimationFrame() {}});
  vm.runInContext(source, context);
  context.schema=JSON.parse(fs.readFileSync(path.join(root, 'schema/lesson.schema.json')));
  vm.runInContext('lessonSchema = schema;', context);
  return {context, node, run: code=>vm.runInContext(code,context), advance:seconds=>{now+=seconds*1000;if(intervalActive)tick();}};
}
test('loads the complete sample with teacher guidance and examples intact',()=>{
  const a=app();const lesson=a.run('parseLesson(JSON.stringify(sampleLesson))');
  assert.equal(lesson.pages.length,2);
  assert.equal(lesson.pages[0].durationMinutes,8);
  assert.equal(lesson.pages[0].instructions[0],'Discuss in pairs and share one example.');
  assert.equal(lesson.pages[1].teacherNotes[0],'Stress selective use of fronting.');
  assert.equal(lesson.pages[1].examples[0],'Only then did I understand the truth.');
});
test('Save lesson downloads standard JSON with editable objects, images and progress',async()=>{
  const a=app();let download;
  a.context.Blob=Blob;
  a.context.validateDocument=()=>{};
  a.context.downloadBlob=(blob,name)=>{download={blob,name};};
  a.context.slide={objects:[{type:'Textbox',text:'Edited text'},{type:'Image',src:'data:image/png;base64,aGVsbG8='}]};
  a.run("lesson={title:'My lesson',pages:[{title:'Slide',questions:[]}]};boardEditor={documentSlides:()=>[slide]};revealedAnswerCountByPage=[1];roster=['Ada'];");
  await a.run('saveLessonFile()');
  assert.equal(download.name,'My-lesson.json');
  assert.equal(download.blob.type,'application/json');
  const saved=JSON.parse(await download.blob.text());
  assert.equal(saved.slides[0].objects[0].text,'Edited text');
  assert.equal(saved.slides[0].objects[1].src,a.context.slide.objects[1].src);
  assert.deepEqual(saved.revealedAnswerCountByPage,[1]);assert.deepEqual(saved.roster,['Ada']);
  assert.match(a.node('status').textContent,/Import lesson/);
});
test('accepts minimal root and wrapped lessons, sorts stages, matches answer IDs',()=>{
  const a=app();
  const data={title:'Test',stages:[{order:2,name:'Second'},{order:1,name:'First',content:{questions:[{id:'b',prompt:'B?'},{id:'a',prompt:'A?'}]},answers:{items:[{questionId:'a',answer:'Answer A'},{questionId:'b',answer:'Answer B'}]}}]};
  a.context.data=data;
  const rootLesson=a.run('parseLesson(JSON.stringify(data))');
  a.context.wrapped={lesson:data};
  const wrapped=a.run('parseLesson(JSON.stringify(wrapped))');
  assert.equal(rootLesson.pages[0].title,'First');
  assert.equal(rootLesson.pages[0].questions[0].answer,'Answer B');
  assert.equal(wrapped.pages[0].questions[1].answer,'Answer A');
});
test('rejects malformed, empty and incorrectly typed lessons with useful errors',()=>{
  const a=app();
  assert.throws(()=>a.run('parseLesson("{")'),/JSON is not valid/);
  assert.throws(()=>a.run('parseLesson(\'{"title":"Empty","stages":[]}\')'),/at least one stage/);
  assert.throws(()=>a.run('parseLesson(\'{"stages":[null]}\')'),/Each stage/);
  assert.throws(()=>a.run('parseLesson(\'{"stages":[{"content":{"questions":"oops"}}]}\')'),/questions must be array/);
  assert.throws(()=>a.run('parseLesson(\'{"stages":[{"durationMinutes":-1}]}\')'),/positive numbers/);
});
test('timer resumes remaining time, uses elapsed time and resets for new duration',()=>{
  const a=app();a.node('timerMinutes').value='2';a.run('resetTimer(); startTimer();');
  a.advance(17);assert.equal(a.node('timerReadout').textContent,'01:43');
  a.run('pauseTimer();');a.advance(13);
  assert.equal(a.node('timerReadout').textContent,'01:43');
  a.run('startTimer();');a.advance(3);
  assert.equal(a.node('timerReadout').textContent,'01:40');
  a.run('pauseTimer();');assert.equal(a.node('startTimerBtn').textContent,'Resume timer');
  a.node('timerMinutes').value='12';a.run('resetTimer();');assert.equal(a.node('timerReadout').textContent,'12:00');
});
test('timer completes and clamps excessive duration',()=>{
  const a=app();a.node('timerMinutes').value='1';a.run('resetTimer(); startTimer();');a.advance(70);
  assert.equal(a.node('timerReadout').textContent,'00:00');assert.equal(a.node('timerState').textContent,'TIME’S UP');
  a.node('timerMinutes').value='999';a.run('resetTimer();');assert.equal(a.node('timerReadout').textContent,'180:00');
});
test('unavailable IndexedDB reports a recoverable save failure',async()=>{
  const a=app();a.context.saveSession=async()=>{throw Error('Quota exceeded');};
  a.context.fakeEditor={documentSlides:()=>[]};a.run('boardEditor=fakeEditor;lesson.pages=[{title:"Test",questions:[]}];');
  await a.run('persistSnapshot();');assert.equal(a.node('saveIndicator').textContent,'Session not saved');assert.match(a.node('status').textContent,/could not save/);
});

test('student view hides teacher guidance and switches back cleanly',()=>{
  const a=app();a.run('setPreview(true);');
  assert.equal(a.context.document.body.classList.contains('preview-mode'),true);
  assert.equal(a.node('previewBtn').attributes['aria-pressed'],'true');
  assert.equal(a.node('presenterViewBtn').attributes['aria-pressed'],'false');
  assert.match(a.node('canvasLabel').textContent,/TEACHER NOTES HIDDEN/);
  a.run('setPreview(false);');
  assert.equal(a.context.document.body.classList.contains('preview-mode'),false);
  assert.equal(a.node('canvasLabel').textContent,'TEACHER WORKSPACE');
});
test('student view locks objects while permitting annotations on the shared board',()=>{
  const a=app();let mode;
  a.context.fakeEditor={setMode:value=>mode=value,setPen(){},selected(){return null;}};
  a.run('boardEditor=fakeEditor;setAnnotation(true);setPreview(true);');
  assert.equal(mode.readonly,true);assert.equal(mode.drawing,true);
  assert.equal(a.node('drawingToolbar').hidden,false);
  a.run('setAnnotation(false);');assert.equal(mode.drawing,false);
  assert.equal(a.context.document.body.classList.contains('preview-mode'),true);
});
test('reordering keeps the active slide, answers, notes, responses and canvas order together',()=>{
  const a=app();let canvasOrder;
  a.context.fakeEditor={reorderSlides:order=>canvasOrder=Array.from(order)};
  a.node('stageList').querySelector=()=>null;
  a.run("lesson.pages=[{title:'A',teacherNotes:['Notes A']},{title:'B',hidden:true},{title:'C'}];currentPageIndex=0;revealedAnswerCountByPage=[2,1,0];annotationStateByPage=[{responses:['A']},{responses:['B']},{responses:['C']}];boardEditor=fakeEditor;renderOutline=()=>{};showPage=index=>currentPageIndex=index;persistSnapshot=()=>{};reorderStage(0,2);");
  assert.deepEqual(canvasOrder,[1,2,0]);
  assert.deepEqual(Array.from(a.run('lesson.pages.map(page=>page.title)')),['B','C','A']);
  assert.equal(a.run('currentPageIndex'),2);assert.equal(a.run('lesson.pages[0].hidden'),true);
  assert.equal(a.run('lesson.pages[2].teacherNotes[0]'),'Notes A');
  assert.deepEqual(Array.from(a.run('revealedAnswerCountByPage')),[1,0,2]);
  assert.equal(a.run('annotationStateByPage[2].responses[0]'),'A');
});
test('student navigation skips hidden slides and refuses an all-hidden preview',()=>{
  const a=app();a.run("lesson.pages=[{hidden:true},{},{hidden:true},{}, {hidden:true}];currentPageIndex=1;");
  assert.equal(a.run('adjacentStage(1)'),2);
  a.run("document.body.classList.toggle('preview-mode',true);");
  assert.equal(a.run('adjacentStage(1)'),3);assert.equal(a.run('adjacentStage(-1)'),undefined);
  a.run('currentPageIndex=3;');assert.equal(a.run('adjacentStage(1)'),undefined);
  a.run("document.body.classList.toggle('preview-mode',false);lesson.pages=[{hidden:true}];setPreview(true);");
  assert.equal(a.context.document.body.classList.contains('preview-mode'),false);
  assert.match(a.node('status').textContent,/Show at least one slide/);
});
test('hiding a slide preserves it and is blocked during student preview',()=>{
  const a=app();a.node('stageList').querySelector=()=>null;
  a.run("lesson.pages=[{title:'Optional',content:'Keep this'}];renderOutline=()=>{};showPage=()=>{};persistSnapshot=()=>{};toggleStageHidden(0);");
  assert.equal(a.run('lesson.pages[0].hidden'),true);assert.equal(a.run('lesson.pages[0].content'),'Keep this');
  a.run('toggleStageHidden(0);');assert.equal(a.run('lesson.pages[0].hidden'),false);
  a.run("document.body.classList.toggle('preview-mode',true);toggleStageHidden(0);");
  assert.equal(a.run('lesson.pages[0].hidden'),false);
});
test('PDF export passes only visible slide indices and labels images in that order',async()=>{
  const a=app();let options;const images=[];let printed=false;
  a.context.fakeEditor={imagesForPrint:async value=>{options=value;return ['image-A','image-C'];}};
  a.context.window={print(){printed=true;}};
  a.context.makeImage=()=>({decode:async()=>{}});
  a.node('printSlides').replaceChildren=()=>{};a.node('printSlides').append=image=>images.push(image);
  a.run("lesson.pages=[{title:'A'},{title:'B',hidden:true},{title:'C'}];revealedAnswerCountByPage=[1,2,3];boardEditor=fakeEditor;element=makeImage;closeTools=()=>{};");
  await a.run('exportForPrint();');
  assert.deepEqual(Array.from(options.indices),[0,2]);assert.deepEqual(Array.from(options.counts),[1,2,3]);
  assert.deepEqual(images.map(image=>image.alt),['A','C']);assert.equal(printed,true);
});
test('both sidebars preview on hover, close on leave, and remain open when pinned',()=>{
  for(const side of ['lesson','guidance']){
    const a=app();const left=side==='lesson';
    const ids=left?['lessonNavigation','lessonOutline','lessonPlanToggle','closeLessonPlanBtn']:['teachingNavigation','teacherPanel','teacherPanelToggle','closeTeacherPanelBtn'];
    ids.forEach(id=>{const node=a.node(id);node.events={};node.addEventListener=(name,fn)=>node.events[name]=fn;node.contains=()=>false;node.focus=()=>{};});
    a.run(`bindSidebar({navigation:'${ids[0]}',panel:'${ids[1]}',toggle:'${ids[2]}',close:'${ids[3]}',state:${left?'lessonPanelState':'guidancePanelState'},set:${left?'setLessonPanel':'setGuidancePanel'},hide:${left?'closeLessonPanel':'closeGuidancePanel'}});`);
    const nav=a.node(ids[0]),panel=a.node(ids[1]),toggle=a.node(ids[2]);
    nav.events.pointerenter({pointerType:'mouse'});assert.equal(toggle.attributes['aria-expanded'],'true');assert.equal(panel.inert,false);
    panel.events.focusin({target:{matches:()=>true}});
    nav.events.pointerleave();assert.equal(toggle.attributes['aria-expanded'],'false');assert.equal(panel.inert,true);
    nav.events.pointerenter({pointerType:'mouse'});toggle.events.click();nav.events.pointerleave();
    assert.equal(toggle.attributes['aria-expanded'],'true');assert.equal(toggle.attributes['aria-pressed'],'true');
    assert.equal(a.context.document.body.classList.contains(left?'lesson-plan-pinned':'teacher-panel-pinned'),true);
    toggle.events.click();assert.equal(toggle.attributes['aria-expanded'],'false');assert.equal(toggle.attributes['aria-pressed'],'false');
    assert.equal(a.context.document.body.classList.contains(left?'lesson-plan-pinned':'teacher-panel-pinned'),false);
    panel.events.focusin({target:{matches:()=>true}});assert.equal(toggle.attributes['aria-expanded'],'true');
    panel.events.focusout({relatedTarget:null});assert.equal(toggle.attributes['aria-expanded'],'false');
  }
});

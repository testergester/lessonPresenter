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
  const context = vm.createContext({document: {events:{},addEventListener(name,fn){(this.events[name]||=[]).push(fn);},getElementById: node, querySelectorAll:()=>[], body: {classList: classList()}}, console,
    diagnostics:{log(){}},captureCrashes(){},navigator:{onLine:true},Date: {now: () => now}, setInterval: fn => {tick=fn;intervalActive=true;return 1;}, clearInterval() {intervalActive=false;}, setTimeout, clearTimeout,
    localStorage: {setItem() {}}, structuredClone, DOCUMENT_FORMAT:"lesson-presenter", saveSession:async()=>{}, requestAnimationFrame() {}});
  vm.runInContext(source, context);
  context.schema=JSON.parse(fs.readFileSync(path.join(root, 'schema/lesson.schema.json')));
  vm.runInContext('lessonSchema = schema;', context);
  return {context, node, run: code=>vm.runInContext(code,context), advance:seconds=>{now+=seconds*1000;if(intervalActive)tick();}};
}
test('presentation advance plays animations, reveals answers, then navigates and stops at the end',()=>{
  const a=app();
  a.run(`lesson={pages:[{questions:[{prompt:'Q1',answer:'A1'},{prompt:'Q2',answer:'A2'}]}]};currentPageIndex=0;revealedAnswerCountByPage=[0];
    let animationPending=true;
    boardEditor={nextAnimation:()=>animationPending,setReveal:()=>{}};
    persistSnapshot=()=>{};let moves=0;let following=1;
    adjacentStage=()=>following;navigateStage=direction=>{moves+=direction;};`);
  a.run('advanceEffect()');assert.equal(a.run('revealedAnswerCountByPage[0]'),0);
  a.run('animationPending=false;advanceEffect()');assert.equal(a.run('revealedAnswerCountByPage[0]'),1);
  a.run('advanceEffect()');assert.equal(a.run('revealedAnswerCountByPage[0]'),2);
  a.run('advanceEffect()');assert.equal(a.run('revealedAnswerCountByPage[0]'),2);
  assert.equal(a.run('moves'),1);
  a.run('lesson.pages[0].questions=[];revealedAnswerCountByPage=[0];advanceEffect()');assert.equal(a.run('revealedAnswerCountByPage[0]'),0);
  assert.equal(a.run('moves'),2);
  a.run('following=undefined;advanceEffect()');assert.equal(a.run('moves'),2);
});
test('fresh startup clears the previous workspace and starts with a blank scene',()=>{
  const a=app();
  a.run(`cloudLessonBinding={uid:'owner',id:'old'};roster=['Old student'];pendingLessonFile={};
    let initialLesson,initialSlides;initLesson=(value,slides)=>{initialLesson=value;initialSlides=slides;};startFreshWorkspace();`);
  assert.equal(a.run('cloudLessonBinding'),null);
  assert.equal(a.run('roster.length'),0);
  assert.equal(a.run('pendingLessonFile'),null);
  assert.equal(a.node('lessonJson').value,'');
  assert.equal(a.node('studentRoster').value,'');
  assert.equal(a.run('initialLesson.pages.length'),1);
  assert.equal(a.run('initialSlides[0].objects.length'),0);
});
test('answer reveals stay out of saved documents and revealing does not queue a save',()=>{
 const a=app();a.run(`lesson={pages:[{questions:[{prompt:'Q',answer:'A'}]}]};boardEditor={documentSlides:()=>[{objects:[]}],setReveal:()=>{}};revealedAnswerCountByPage=[0];let saves=0;persistSnapshot=()=>{saves++;};revealNextAnswer();`);
 assert.equal(a.run('revealedAnswerCountByPage[0]'),1);assert.equal(a.run('saves'),0);
 assert.equal(a.run('currentDocument().revealedAnswerCountByPage[0]'),0);
});
test('presentation arrows reveal and hide one answer before navigating, including boundary slides',()=>{
 const a=app();a.run(`lesson={pages:[{questions:[{prompt:'Q',answer:'A'}]}]};revealedAnswerCountByPage=[0];currentPageIndex=0;
   document.body.classList.toggle('audience-mode',true);boardEditor={nextAnimation:()=>false,setReveal:()=>{}};let saves=0,moves=0;persistSnapshot=()=>{saves++;};navigateStage=direction=>{moves+=direction;};syncAnswers();`);
 assert.equal(a.node('nextBtn').disabled,false);assert.equal(a.node('prevBtn').disabled,true);
 a.run('stepPresentation(1)');assert.equal(a.run('revealedAnswerCountByPage[0]'),1);assert.equal(a.node('prevBtn').disabled,false);assert.equal(a.node('nextBtn').disabled,true);
 a.run('stepPresentation(-1)');assert.equal(a.run('revealedAnswerCountByPage[0]'),0);assert.equal(a.node('prevBtn').disabled,true);assert.equal(a.run('saves'),0);
 a.run('stepPresentation(-1)');assert.equal(a.run('moves'),-1);
 a.run("document.body.classList.toggle('audience-mode',false);stepPresentation(1)");assert.equal(a.run('moves'),0);assert.equal(a.run('revealedAnswerCountByPage[0]'),0);
});
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
  assert.deepEqual(saved.revealedAnswerCountByPage,[0]);assert.deepEqual(saved.roster,['Ada']);
  assert.match(a.node('status').textContent,/Import lesson/);
  a.run("cloudLessonBinding={uid:'owner',id:'cloud-lesson',revision:12};");await a.run('saveLessonFile()');
  const cloudSaved=JSON.parse(await download.blob.text());assert.equal(cloudSaved.version,1);assert.deepEqual(cloudSaved.cloud,{id:'cloud-lesson',revision:12});
  assert.equal(a.run('currentDocument().cloud'),undefined,'export metadata must not create extra autosave edits');
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
    toggle.events.click();
    nav.contains=target=>target===panel;
    a.context.document.events.click.forEach(handler=>handler({target:panel}));
    assert.equal(toggle.attributes['aria-expanded'],'true');
    a.context.document.events.click.forEach(handler=>handler({target:a.node('teacherStage')}));
    assert.equal(toggle.attributes['aria-expanded'],'false');assert.equal(toggle.attributes['aria-pressed'],'false');
  }
});
test('Studio routes tools to its docked panel while the original workspace keeps its dialog',()=>{
  const a=app();
  a.context.document.body.dataset={layout:'studio'};
  a.context.CustomEvent=class {constructor(type,options){this.type=type;this.detail=options.detail;}};
  let routed,opened=0;
  a.context.document.dispatchEvent=event=>{routed=event;return false;};
  a.node('toolsDialog').showModal=()=>opened++;
  a.run("openTools('section-animations')");
  assert.equal(routed.type,'studio:open-tool');assert.equal(routed.detail.target,'section-animations');assert.equal(opened,0);
  a.context.document.body.dataset={};
  a.run("openTools('section-shapes')");
  assert.equal(opened,1);assert.equal(a.node('dialogTitle').textContent,'Add a shape');
});
test('teacher guidance edits update the active lesson, survive saving and stay separate by slide',async()=>{
  const a=app();a.run("lesson={title:'Notes',pages:[{title:'One',questions:[],aim:'Old aim',teacherNotes:['Old reminder']},{title:'Two',questions:[],aim:'Second aim',teacherNotes:[]}]};boardEditor={documentSlides:()=>[{objects:[]},{objects:[]}]};");
  a.run('queueSnapshot=()=>{}');
  assert.equal(a.run("updateStageGuidance('aim','Compare two examples.\\nExplain the difference.')"),true);
  assert.equal(a.run("updateStageGuidance('teacherNotes','Give thinking time.\\n\\nCheck quieter students.')"),true);
  a.run('currentPageIndex=1');
  a.run("updateStageGuidance('teacherNotes','Leave two minutes for review.')");
  const doc=JSON.parse(a.run('JSON.stringify(currentDocument())'));
  assert.equal(doc.lesson.pages[0].aim,'Compare two examples.\nExplain the difference.');
  assert.deepEqual(doc.lesson.pages[0].teacherNotes,['Give thinking time.','Check quieter students.']);
  assert.deepEqual(doc.lesson.pages[1].teacherNotes,['Leave two minutes for review.']);
  assert.equal(doc.lesson.pages[1].aim,'Second aim');
  a.run("document.body.classList.toggle('preview-mode',true)");
  assert.equal(a.run("updateStageGuidance('aim','Student edit')"),false);
  assert.equal(a.run("updateStageGuidance('title','Wrong field')"),false);
  assert.equal(a.run('lesson.pages[1].aim'),'Second aim');
});

test('student playback hides empty controls and disables completed and running effects',()=>{
 const a=app();a.run("document.body.classList.toggle('preview-mode',true);renderPlayback();");assert.equal(a.node('animationPlayback').hidden,true);
 a.run("renderPlayback({total:2,remaining:2,running:false,started:false,finished:false});");assert.equal(a.node('animationPlayback').hidden,false);assert.equal(a.node('nextEffectBtn').disabled,false);assert.equal(a.node('replayEffectsBtn').disabled,true);
 a.run("renderPlayback({total:2,remaining:0,running:true,started:true,finished:false});");assert.equal(a.node('nextEffectBtn').disabled,true);
 a.run("renderPlayback({total:2,remaining:0,running:false,started:true,finished:true});");assert.equal(a.node('nextEffectBtn').disabled,true);assert.equal(a.node('replayEffectsBtn').disabled,false);assert.equal(a.node('animationStatus').textContent,'All effects complete.');
});

test('assigning a cloud identity during a snapshot persists the new binding last',async()=>{
  const a=app(),saved=[];a.context.saveSession=async snapshot=>saved.push(snapshot);a.context.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options.detail;}};
  a.context.document.dispatchEvent=()=>{if(!a.run('cloudLessonBinding'))a.run("cloudLessonBinding={uid:'owner',id:'stable-id'};persistSnapshot();");};
  a.run("lesson={title:'Cloud',pages:[{title:'Slide',questions:[]}]};boardEditor={documentSlides:()=>[{objects:[]}]};");
  await a.run('persistSnapshot()');await a.run('saveChain');assert.equal(saved.at(-1).cloudLessonBinding.id,'stable-id');
});

test('deleting a slide removes its metadata and scene together while retaining the active slide and cloud binding',()=>{
 const a=app();let order;
 a.context.window={confirm:()=>true};a.context.fakeEditor={reorderSlides:indices=>order=Array.from(indices)};
 a.node('stageList').querySelector=()=>null;
 a.run("lesson.pages=[{title:'A'},{title:'B'},{title:'C'}];currentPageIndex=2;revealedAnswerCountByPage=[1,2,3];annotationStateByPage=[{responses:['A']},{responses:['B']},{responses:['C']}];cloudLessonBinding={uid:'owner',id:'same-id'};boardEditor=fakeEditor;renderOutline=()=>{};showPage=index=>currentPageIndex=index;persistSnapshot=()=>{};resetTimer=()=>{};deleteStage(1);");
 assert.deepEqual(order,[0,2]);assert.equal(a.run('currentPageIndex'),1);assert.equal(a.run('lesson.pages[1].title'),'C');assert.equal(a.run('revealedAnswerCountByPage[1]'),3);assert.equal(a.run('annotationStateByPage[1].responses[0]'),'C');assert.equal(a.run('cloudLessonBinding.id'),'same-id');
});
test('deleting the final slide leaves a clean blank scene and respects cancel and student mode',()=>{
 const a=app();let scene;a.context.window={confirm:()=>true};a.context.fakeEditor={setLesson:slides=>scene=slides};a.node('stageList').querySelector=()=>null;
 a.run("lesson.pages=[{title:'Old'}];boardEditor=fakeEditor;renderOutline=()=>{};showPage=index=>currentPageIndex=index;persistSnapshot=()=>{};resetTimer=()=>{};deleteStage(0);");
 assert.equal(a.run('lesson.pages[0].title'),'Untitled slide');assert.equal(scene[0].objects.length,0);assert.equal(a.run('revealedAnswerCountByPage[0]'),0);
 a.context.window.confirm=()=>false;a.run("lesson.pages[0].title='Keep';deleteStage(0)");assert.equal(a.run('lesson.pages[0].title'),'Keep');
 a.context.window.confirm=()=>{throw Error('student deletion should not confirm');};a.run("document.body.classList.toggle('preview-mode',true);deleteStage(0)");assert.equal(a.run('lesson.pages[0].title'),'Keep');
});

test('cloud deletion clears the active canvas, editor history, notes, roster and imported source',async()=>{
 const a=app();let cleared,scene;
 a.context.clearSavedCloudLesson=async(id,uid)=>cleared={id,uid};a.context.fakeEditor={queue:Promise.resolve()};
 a.run("cloudLessonBinding={uid:'owner',id:'deleted'};lesson.pages=[{title:'Old'}];boardEditor=fakeEditor;roster=['Student'];$('lessonJson').value='old source';initLesson=(value,slides)=>{lesson=value;capturedScenes=slides;};persistSnapshot=async()=>{};");
 await a.run("clearDeletedCloudLesson('deleted','owner')");assert.deepEqual(cleared,{id:'deleted',uid:'owner'});assert.equal(a.run('lesson.title'),'Untitled lesson');assert.equal(a.run('capturedScenes[0].objects.length'),0);assert.equal(a.run('roster.length'),0);assert.equal(a.node('lessonJson').value,'');assert.equal(a.node('studentRoster').value,'');assert.equal(a.run('cloudLessonBinding.deleted'),true);assert.equal(a.run('clearingCloudLesson'),false);
});

test('lesson rename preserves the cloud binding and slide contents, queues saving, and protects preview',()=>{
 const a=app();a.run("lesson={title:'Original',pages:[{title:'Slide',questions:[]}]};cloudLessonBinding={uid:'owner',id:'same'};var queued=0;queueSnapshot=()=>queued++;");
 assert.equal(a.run("renameLesson('  New lesson title  ')"),'New lesson title');
 assert.equal(a.node('lessonTitle').textContent,'New lesson title');assert.equal(a.node('presentLessonTitle').textContent,'New lesson title');
 assert.equal(a.run('cloudLessonBinding.id'),'same');assert.equal(a.run('lesson.pages[0].title'),'Slide');assert.equal(a.run('queued'),1);
 assert.equal(a.run("renameLesson('   ')"),'New lesson title');assert.equal(a.run('queued'),1);
 a.run("document.body.classList.toggle('preview-mode',true)");assert.equal(a.run("renameLesson('Blocked')"),'New lesson title');assert.equal(a.run('queued'),1);
});

test('slide rename updates only its page and scene, preserves cloud identity, and protects blank names and preview',async()=>{
 const a=app(),renamed=[];a.context.fakeEditor={queue:Promise.resolve(),renameSlideTitle:(index,title)=>renamed.push({index,title})};a.node('stageList').querySelector=()=>null;
 a.run("lesson={title:'Lesson',pages:[{title:'One',questions:[]},{title:'Two',questions:[]}]};boardEditor=fakeEditor;cloudLessonBinding={uid:'owner',id:'same'};var queued=0;queueSnapshot=()=>queued++;");
 assert.equal(await a.run("renameStage(0,'  New slide name  ')"),'New slide name');
 assert.deepEqual(renamed,[{index:0,title:'New slide name'}]);assert.equal(a.run('lesson.pages[1].title'),'Two');assert.equal(a.run('cloudLessonBinding.id'),'same');assert.equal(a.run('queued'),1);assert.equal(a.node('stageBreadcrumb').textContent,'New slide name');
 await a.run("renameStage(0,'   ')");a.run("document.body.classList.toggle('preview-mode',true)");await a.run("renameStage(0,'Student edit')");assert.equal(a.run('queued'),1);assert.equal(a.run('lesson.pages[0].title'),'New slide name');
});
test('pending slide rename cannot change a replacement lesson or a reordered slide',async()=>{
 const a=app();let release;a.context.fakeEditor={queue:new Promise(resolve=>release=resolve),renameSlideTitle:()=>assert.fail('stale rename')};a.node('stageList').querySelector=()=>null;
 a.run("lesson.pages=[{title:'Original',questions:[]}];boardEditor=fakeEditor;");
 const rename=a.run("renameStage(0,'Stale name')");a.run("lesson.pages=[{title:'Replacement',questions:[]}]");release();
 assert.equal(await rename,'Replacement');assert.equal(a.run('lesson.pages[0].title'),'Replacement');
});

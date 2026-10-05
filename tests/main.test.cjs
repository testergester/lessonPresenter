const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'main.js'), 'utf8').split("$('lessonJson').value=JSON.stringify(sampleLesson,null,2);")[0];
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
  const context = vm.createContext({document: {getElementById: node, body: {classList: classList()}}, console,
    Date: {now: () => now}, setInterval: fn => {tick=fn;intervalActive=true;return 1;}, clearInterval() {intervalActive=false;}, setTimeout, clearTimeout,
    localStorage: {setItem() {}}, requestAnimationFrame() {}});
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
test('unavailable browser storage reports a recoverable save failure',()=>{
  const a=app();a.context.localStorage.setItem=()=>{throw Error('Quota exceeded');};
  a.run('persistSnapshot();');assert.equal(a.node('saveIndicator').textContent,'Session not saved');assert.match(a.node('status').textContent,/could not save/);
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
test('annotation transfers to the visible student board without leaving student view',()=>{
  const a=app();
  const teacher=a.node('teacherCanvas');const student=a.node('studentCanvas');
  a.node('audienceStage').children=[{querySelector:()=>student}];
  a.context.teacherCanvas=teacher;
  a.run('pageCanvases=[teacherCanvas]; setAnnotation(true);');
  assert.equal(teacher.classList.contains('active'),true);
  a.run('setPreview(true);');
  assert.equal(teacher.classList.contains('active'),false);
  assert.equal(student.classList.contains('active'),true);
  assert.equal(a.node('drawingToolbar').hidden,false);
  a.run('setAnnotation(false);');
  assert.equal(student.classList.contains('active'),false);
  assert.equal(a.context.document.body.classList.contains('preview-mode'),true);
  assert.equal(a.node('drawingToolbar').hidden,true);
});

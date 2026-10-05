import {SlideEditor, stageToSlide} from './src/editor.js';
import {packLesson, unpackLesson, validateDocument, downloadBlob, saveSession, readSession, DOCUMENT_FORMAT} from './src/document.js';
'use strict';
const $ = (id) => document.getElementById(id);
const OFFLINE_SNAPSHOT_KEY = 'lessonPresenter.snapshot.v1';
const penColors = ['#e11d48', '#2563eb', '#059669', '#d97706', '#111827', '#7c3aed'];
const colorNames = ['Rose', 'Blue', 'Green', 'Amber', 'Black', 'Purple'];
let lesson = {title: '', pages: []};
let currentPageIndex = 0;
let revealedAnswerCountByPage = [];
let annotationStateByPage = [];
let boardEditor = null;
let saveChain = Promise.resolve();
let pendingLessonFile = null;
let selectedColor = penColors[0];
let selectedPenSize = 4;
let annotatorEnabled = false;
let miniWhiteboardsVisible = false;
let roster = [];
let remainingSeconds = 480;
let timerRunning = false;
let timerStarted = false;
let timerInterval = null;
let timerDeadline = 0;
let saveWarningShown = false;
let lessonSchema;
let dialogOpener;
let snapshotTimeout;
let lessonPanelState = {pinned:false, hovered:false, focused:false};
let guidancePanelState = {pinned:false, hovered:false, focused:false};
const sampleLesson = {
  lesson: {
    id: 'u5_2_c2_writing_fronting_01',
    title: 'A Description: Learn to Use Fronting',
    unit: '5.2',
    lessonType: 'Writing',
    level: 'C2',
    ageGroup: 'Adults 28+',
    durationMinutes: 120,
    theme: 'Looks can be deceiving',
    mainAim: 'Write a descriptive text using controlled fronting.',
    subsidiaryAims: ['Notice model organisation', 'Use fronting for effect'],
    prerequisiteKnowledge: ['Punctuation marks'],
    assumptions: ['Students can analyse literary effects at C2 level.'],
    materials: [
      {
        id: 'sb_u5_2',
        type: 'coursebook_page',
        title: 'Student Book Unit 5.2',
        source: 'uploaded image',
        notes: 'Model text and practice'
      }
    ],
    languageFocus: {
      targetLanguage: 'Fronting for literary description',
      functions: ['Foreground information'],
      forms: ['Carefully, I moved closer.'],
      pronunciation: ['Pause after fronted element when reading aloud.'],
      punctuation: ['Comma after introductory participle clauses.']
    },
    writingTask: {
      genre: 'Descriptive writing',
      audience: 'Creative writing magazine',
      prompt: 'Write on the theme looks can be deceiving.',
      wordCount: { min: 220, max: 280 },
      successCriteria: ['Clear reveal', 'Controlled fronting']
    },
    stages: [
      {
        id: 'stage_01',
        order: 1,
        name: 'Lead-in',
        stageType: 'warm_up',
        durationMinutes: 8,
        aim: 'Activate interest in the theme.',
        interaction: 'S-S, WC',
        procedure: ['Discuss examples where appearance is misleading.'],
        instructions: ['Discuss in pairs and share one example.'],
        content: {
          text: 'Students discuss misleading appearances in life and work.',
          questions: ['What was the first impression?', 'What was the reality?'],
          items: [],
          prompts: ['Person', 'Place', 'Professional situation'],
          examples: ['An elegant hotel that was dirty and noisy.']
        },
        answers: {
          type: 'open',
          items: [
            {
              questionId: 'lead_in_open',
              answer: 'Any relevant example connected to misleading appearances is acceptable.',
              alternatives: ['A polished presentation with no real substance.'],
              notes: 'Aim is engagement and theme activation.'
            }
          ]
        },
        teacherNotes: ['Keep this stage brisk and focused on theme.'],
        anticipatedProblems: [
          {
            problem: 'Examples may be too general.',
            solution: 'Prompt for first impression and hidden reality.'
          }
        ],
        boardPlan: ['LOOKS CAN BE DECEIVING', 'first impression -> reality'],
        timingNotes: ['Spend no more than 2 minutes on class feedback.']
      },
      {
        id: 'stage_02',
        order: 2,
        name: 'Language Focus: Fronting',
        stageType: 'language_analysis',
        durationMinutes: 12,
        aim: 'Clarify fronting forms and punctuation.',
        interaction: 'WC',
        procedure: ['Elicit fronting examples and board key patterns.'],
        instructions: ['Look at sentence openings and discuss effect.'],
        content: {
          text: 'Teacher clarifies fronting patterns used in literary description.',
          questions: ['Does fronting change meaning or focus?', 'In "Only then did I understand", is inversion needed?'],
          items: [],
          prompts: [],
          examples: ['Only then did I understand the truth.']
        },
        answers: {
          type: 'ccq',
          items: [
            {
              questionId: 'lf_q1',
              answer: 'Fronting changes focus, not basic meaning.',
              alternatives: [],
              notes: 'CCQ 1.'
            },
            {
              questionId: 'lf_q2',
              answer: 'Inversion is required after limiting/negative expressions.',
              alternatives: [],
              notes: 'CCQ 2.'
            }
          ]
        },
        teacherNotes: ['Stress selective use of fronting.'],
        anticipatedProblems: [
          {
            problem: 'Students may overuse fronting.',
            solution: 'Remind students effect depends on control and variation.'
          }
        ],
        boardPlan: ['Fronting = change of focus', 'negative fronting + inversion'],
        timingNotes: ['Keep explanation concise and writing-focused.']
      }
    ],
    assessment: {
      criteria: ['Clear contrast between appearance and reality.'],
      peerChecklist: ['Is the first impression clear?'],
      teacherFeedbackFocus: ['Controlled use of fronting.']
    },
    homework: {
      assigned: true,
      task: 'Produce a clean final draft and highlight fronted structures.',
      instructions: ['Rewrite neatly or type it.', 'Highlight each example of fronting.']
    },
    metadata: {
      author: 'OpenAI',
      createdAt: '2026-03-09',
      updatedAt: '2026-03-09',
      version: '1.0'
    }
  }
};


function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}
function list(value) { return Array.isArray(value) ? value : []; }
function displayText(value) {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  if (typeof value === 'object') return String(value.text || value.prompt || value.question || value.example || JSON.stringify(value));
  return String(value);
}
function normalizeQuestionEntry(question, index) {
  if (typeof question === 'string') return {id: `q${index + 1}`, prompt: question, answer: ''};
  return {id: String(question?.id || question?.questionId || `q${index + 1}`), prompt: displayText(question), answer: displayText(question?.answer)};
}
function validateBySchema(value, schema, path = 'lesson') {
  const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
  if (schema.type && !(Array.isArray(schema.type) ? schema.type : [schema.type]).includes(type)) {
    throw new Error(`${path} must be ${[].concat(schema.type).join(' or ')}.`);
  }
  if (schema.properties && type === 'object') {
    Object.entries(schema.properties).forEach(([key, rule]) => {
      if (key in value) validateBySchema(value[key], rule, `${path}.${key}`);
    });
  }
  if (schema.items && type === 'array') value.forEach((item, index) => validateBySchema(item, schema.items, `${path}[${index + 1}]`));
}
async function ensureSchemaLoaded() {
  if (lessonSchema) return lessonSchema;
  const response = await fetch('./schema/lesson.schema.json');
  if (!response.ok) throw new Error('The lesson format could not be loaded. Please refresh and try again.');
  lessonSchema = await response.json();
  return lessonSchema;
}
function lessonSchemaToPresenterSchema(source) {
  const meta = source.lesson || source;
  const stages = [...meta.stages].sort((a,b) => (a.order || 0) - (b.order || 0));
  const pages = stages.map((stage, index) => {
    const content = stage.content || {};
    const questions = list(content.questions).map(normalizeQuestionEntry);
    const answers = list(stage.answers?.items);
    questions.forEach((question, i) => {
      const matched = answers.find((answer) => answer.questionId === question.id) || answers[i];
      if (!question.answer && matched) question.answer = displayText(matched.answer);
    });
    if (!questions.length) answers.forEach((answer,i) => questions.push({id:answer.questionId || `q${i+1}`,prompt: `Discussion ${i+1}`,answer:displayText(answer.answer)}));
    return {stageId:stage.id || `stage-${index+1}`,title:stage.name || stage.stageType || `Stage ${index+1}`,hidden:stage.hidden===true,stageType:stage.stageType || 'Activity',durationMinutes:stage.durationMinutes || 5,aim:stage.aim || '',interaction:stage.interaction || '',instructions:list(stage.instructions),procedure:list(stage.procedure),teacherNotes:list(stage.teacherNotes),timingNotes:list(stage.timingNotes),anticipatedProblems:list(stage.anticipatedProblems),content:content.text || '',prompts:list(content.prompts),examples:list(content.examples),items:list(content.items),questions};
  });
  return {title:meta.title || 'Untitled lesson',level:meta.level || '',lessonType:meta.lessonType || '',durationMinutes:meta.durationMinutes || pages.reduce((total,page)=>total+page.durationMinutes,0),mainAim:meta.mainAim || '',pages};
}
function parseLesson(jsonText) {
  let source;
  try { source = JSON.parse(jsonText); } catch { throw new Error('This JSON is not valid. Check commas, quotes, and brackets, then try again.'); }
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Use a lesson object containing a title and stages.');
  const meta = source.lesson || source;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new Error('The lesson must be an object.');
  if (!Array.isArray(meta.stages) || !meta.stages.length) throw new Error('Add at least one stage to the lesson’s stages array.');
  if (meta.stages.some(stage => !stage || typeof stage !== 'object' || Array.isArray(stage))) throw new Error('Each stage must be an object with a name and content.');
  validateBySchema(meta, lessonSchema.properties.lesson);
  meta.stages.forEach(stage => {
    if (stage.durationMinutes !== undefined && (!Number.isFinite(stage.durationMinutes) || stage.durationMinutes <= 0)) throw new Error('Stage durations must be positive numbers.');
  });
  return lessonSchemaToPresenterSchema(source);
}
function setSidebarPanel(side, changes) {
  const left=side==='lesson';
  const state=left?lessonPanelState:guidancePanelState;
  Object.assign(state,changes);
  const open=state.pinned||state.hovered||state.focused;
  document.body.classList.toggle(left?'lesson-plan-open':'teacher-panel-open',open);
  document.body.classList.toggle(left?'lesson-plan-pinned':'teacher-panel-pinned',state.pinned);
  $(left?'lessonPlanToggle':'teacherPanelToggle').setAttribute('aria-expanded',String(open));
  $(left?'lessonPlanToggle':'teacherPanelToggle').setAttribute('aria-pressed',String(state.pinned));
  $(left?'lessonOutline':'teacherPanel').inert=!open;
}
function setLessonPanel(changes) {setSidebarPanel('lesson',changes);}
function setGuidancePanel(changes) {setSidebarPanel('guidance',changes);}
function closeLessonPanel() {
  setLessonPanel({pinned:false, hovered:false, focused:false});
  if ($('lessonOutline').contains(document.activeElement)) $('lessonPlanToggle').focus();
}
function closeGuidancePanel() {
  setGuidancePanel({pinned:false,hovered:false,focused:false});
  if($('teacherPanel').contains(document.activeElement))$('teacherPanelToggle').focus();
}
function bindSidebar({navigation,panel,toggle,close,state,set,hide}) {
  $(toggle).addEventListener('click',()=>state.pinned?hide():set({pinned:true}));
  $(close).addEventListener('click',hide);
  $(navigation).addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')set({hovered:true,focused:false});});
  $(navigation).addEventListener('pointerleave',()=>set({hovered:false,focused:false}));
  $(panel).addEventListener('focusin',event=>{if(event.target.matches(':focus-visible'))set({focused:true});});
  $(panel).addEventListener('focusout',event=>{if(!$(panel).contains(event.relatedTarget))set({focused:false});});
  $(navigation).addEventListener('pointerdown',()=>set({focused:false}));
}
function setStatus(message) { $('status').textContent = message; }
function openTools(target) {
  const titles = {'section-lesson':'Import lesson','section-annotator':'Annotate your lesson','section-participation':'Bring everyone in','section-view':'Display settings','section-export':'Export your lesson','section-shortcuts':'Keyboard shortcuts','section-shapes':'Add a shape','section-stickers':'Add a sticker','section-video':'Embed a YouTube video'};
  document.querySelectorAll('.feature-section').forEach(section=>section.classList.toggle('active',section.id===target));
  $('dialogTitle').textContent = titles[target];
  if (!$('toolsDialog').open) {
    dialogOpener = document.activeElement;
    $('toolsDialog').showModal();
  }
}
function closeTools() { $('toolsDialog').close(); }
function noteGroup(heading, entries, ordered = false) {
  if (!entries.length) return null;
  const group = element('div','note-group');
  group.append(element('h4','',heading));
  const content = element(ordered ? 'ol' : 'ul');
  entries.forEach(entry=>content.append(element('li','',displayText(entry))));
  group.append(content);
  return group;
}
function renderGuidance(page) {
  const container = $('teacherNotes');
  container.replaceChildren();
  const aim = element('div','note-group');
  aim.append(element('h4','','STAGE AIM'),element('p','',page.aim || 'Guide students through the activity.'));
  container.append(aim);
  [noteGroup('How to run it',list(page.procedure),true),noteGroup('Keep in mind',list(page.teacherNotes)),noteGroup('Pacing',list(page.timingNotes))].filter(Boolean).forEach(group=>container.append(group));
  if (list(page.anticipatedProblems).length) {
    const group = element('div','note-group');
    group.append(element('h4','','IF STUDENTS GET STUCK'));
    page.anticipatedProblems.forEach(problem=>group.append(element('p','',`${problem.problem} ${problem.solution}`)));
    container.append(group);
  }
}
function studentMode() {return document.body.classList.contains('preview-mode')||document.body.classList.contains('audience-mode');}
function stageIndices(visibleOnly=studentMode()) {return lesson.pages.flatMap((page,index)=>visibleOnly&&page.hidden?[]:[index]);}
function adjacentStage(direction) {
  const indices=stageIndices();
  return direction>0?indices.find(index=>index>currentPageIndex):indices.findLast(index=>index<currentPageIndex);
}
function navigateStage(direction) {const index=adjacentStage(direction);if(index!==undefined)goToStage(index);}
function reorderStage(from,to) {
  if(studentMode()||from===to||!Number.isInteger(from)||!Number.isInteger(to)||!lesson.pages[from]||!lesson.pages[to])return;
  const order=lesson.pages.map((_,index)=>index);order.splice(to,0,order.splice(from,1)[0]);
  const active=order.indexOf(currentPageIndex);
  lesson.pages=order.map(index=>lesson.pages[index]);
  revealedAnswerCountByPage=order.map(index=>revealedAnswerCountByPage[index]||0);
  annotationStateByPage=order.map(index=>annotationStateByPage[index]||{responses:[]});
  boardEditor.reorderSlides(order);
  currentPageIndex=active;renderOutline();showPage(active);persistSnapshot();
  $('stageList').querySelector(`[data-stage-index="${to}"] .stage-item`)?.focus();
  setStatus(`${lesson.pages[to].title} moved to slide ${to+1}.`);
}
function toggleStageHidden(index) {
  if(studentMode()||!lesson.pages[index])return;
  const page=lesson.pages[index];page.hidden=!page.hidden;
  renderOutline();showPage(currentPageIndex);persistSnapshot();
  $('stageList').querySelector(`[data-stage-index="${index}"] [data-stage-action="visibility"]`)?.focus();
  setStatus(page.hidden?`${page.title} is hidden from student preview, presentation, and PDF export.`:`${page.title} is included in presentation again.`);
}
function renderOutline() {
  $('lessonTitle').textContent = lesson.title;
  $('presentLessonTitle').textContent = lesson.title;
  $('lessonMeta').replaceChildren();
  [lesson.level,lesson.lessonType,lesson.durationMinutes ? `${lesson.durationMinutes} min` : ''].filter(Boolean).forEach(text=>$('lessonMeta').append(element('span','',text)));
  $('stageCount').textContent = `${lesson.pages.length} stage${lesson.pages.length === 1 ? '' : 's'}`;
  $('outlineDuration').textContent = `${lesson.pages.filter(page=>!page.hidden).reduce((total,page)=>total+(page.durationMinutes || 5),0)} min planned`;
  $('lessonAim').textContent = lesson.mainAim || 'Move through each stage at your class’s pace.';
  $('stageList').replaceChildren();
  lesson.pages.forEach((page,index)=>{
    const row=element('div','stage-row');row.dataset.stageIndex=index;row.classList.toggle('stage-hidden',!!page.hidden);row.hidden=studentMode()&&!!page.hidden;row.draggable=!studentMode();
    const button = element('button','stage-item');
    button.dataset.stageIndex=index;
    button.type = 'button';
    const info = element('span','stage-info');
    info.append(element('strong','',page.title),element('small','',`${page.hidden?'Hidden · ':''}${page.durationMinutes || 5} min · ${(page.stageType || 'activity').replaceAll('_',' ')}`));
    button.append(element('span','stage-number',String(index+1).padStart(2,'0')),info);
    button.addEventListener('click',()=>goToStage(index));
    const tools=element('div','stage-tools');tools.setAttribute('aria-label',`Organize ${page.title}`);
    const handle=element('span','stage-drag-handle','⠿');handle.title='Drag to reorder slide';handle.setAttribute('aria-hidden','true');tools.append(handle);
    const action=(name,label,callback,disabled=false)=>{const control=element('button','stage-action',label);control.type='button';control.title=name;control.setAttribute('aria-label',`${name}: ${page.title}`);control.setAttribute('data-editor-action','');control.dataset.unavailable=String(disabled);control.disabled=disabled||studentMode();control.addEventListener('click',event=>{event.stopPropagation();callback();});tools.append(control);return control;};
    action('Move slide up','↑',()=>reorderStage(index,index-1),index===0);
    action('Move slide down','↓',()=>reorderStage(index,index+1),index===lesson.pages.length-1);
    const visibility=action(page.hidden?'Show slide':'Hide slide',page.hidden?'Show':'Hide',()=>toggleStageHidden(index));visibility.dataset.stageAction='visibility';visibility.setAttribute('aria-pressed',String(!!page.hidden));
    row.append(button,tools);
    row.addEventListener('dragstart',event=>{if(studentMode()){event.preventDefault();return;}event.dataTransfer.setData('application/x-lesson-slide',String(index));event.dataTransfer.effectAllowed='move';row.classList.add('dragging');});
    row.addEventListener('dragover',event=>{if(studentMode()||!event.dataTransfer.types.includes('application/x-lesson-slide'))return;event.preventDefault();event.dataTransfer.dropEffect='move';row.classList.add('drop-target');});
    row.addEventListener('dragleave',()=>row.classList.remove('drop-target'));
    row.addEventListener('dragend',()=>{$('stageList').querySelectorAll('.stage-row').forEach(node=>node.classList.remove('drop-target','dragging'));});
    row.addEventListener('drop',event=>{event.preventDefault();row.classList.remove('drop-target');const value=event.dataTransfer.getData('application/x-lesson-slide');if(value!=='')reorderStage(Number(value),index);});
    $('stageList').append(row);
  });
}
function buildPages(slides) {
  boardEditor.setLesson(slides || lesson.pages.map(stageToSlide));
  renderResponseBoards();
}
function answerTotal() { return lesson.pages[currentPageIndex]?.questions.filter(q=>q.answer).length || 0; }
function syncAnswers() {
  const shown = revealedAnswerCountByPage[currentPageIndex] || 0;
  boardEditor?.setReveal(shown);
  const total = answerTotal();
  $('revealAnswerBtn').disabled = $('presentationRevealBtn').disabled = shown >= total;
  $('revealAnswerBtn').textContent = total ? shown >= total ? 'Answers revealed' : `Reveal answer · ${shown}/${total}` : 'No answers';
  $('hideAnswersBtn').hidden = shown === 0;
}
function resizeVisibleCanvases() { boardEditor?.resize(); }
function showPage(index) {
  if (!lesson.pages[index]) return;
  currentPageIndex = index;
  if (boardEditor.index !== index || !boardEditor.ready) boardEditor.show(index,revealedAnswerCountByPage[index] || 0);
  renderResponseBoards();
  $('stageList').querySelectorAll('.stage-item').forEach(button=>{
    const i=Number(button.dataset.stageIndex);
    button.classList.toggle('active',i===index);
    if (i===index) button.setAttribute('aria-current','step'); else button.removeAttribute('aria-current');
  });
  const page = lesson.pages[index];
  const indices=stageIndices();const position=indices.indexOf(index)+1;const total=indices.length;
  $('stageBreadcrumb').textContent = page.title;
  $('stageCounter').textContent = `${String(position).padStart(2,'0')} / ${String(total).padStart(2,'0')}`;
  $('progressLabel').textContent = `Stage ${position} of ${total}${!studentMode()&&page.hidden?' · Hidden from students':''}`;
  $('presentationCounter').textContent = `${position} / ${total}`;
  $('progressFill').style.width = `${position/total*100}%`;
  $('prevBtn').disabled = $('presentationPrevBtn').disabled = adjacentStage(-1)===undefined;
  $('nextBtn').disabled = $('presentationNextBtn').disabled = adjacentStage(1)===undefined;
  const next=lesson.pages[adjacentStage(1)];
  $('nextStageLabel').textContent = next ? `${next.title} · ${next.durationMinutes || 5} min` : 'Final stage. Time to reflect and wrap up.';
  $('suggestedTime').textContent = `${page.durationMinutes || 5} min planned`;
  renderGuidance(page);syncAnswers();syncDrawing();
  requestAnimationFrame(resizeVisibleCanvases);
}
function goToStage(index) {
  if (index < 0 || index >= lesson.pages.length || index === currentPageIndex || studentMode()&&lesson.pages[index].hidden) return;
  showPage(index);
  $('timerMinutes').value = lesson.pages[index].durationMinutes || 5;
  resetTimer();
  persistSnapshot();
  setStatus(`Stage ${index+1}: ${lesson.pages[index].title}`);
}
function revealNextAnswer() {
  const total = answerTotal();
  if ((revealedAnswerCountByPage[currentPageIndex] || 0)>=total) return;
  revealedAnswerCountByPage[currentPageIndex] = (revealedAnswerCountByPage[currentPageIndex] || 0)+1;
  syncAnswers();persistSnapshot();
  setStatus(`Answer ${revealedAnswerCountByPage[currentPageIndex]} of ${total} revealed.`);
}
function initLesson(parsed, slides) {
  lesson = parsed;currentPageIndex=0;
  revealedAnswerCountByPage = lesson.pages.map(()=>0);
  annotationStateByPage = lesson.pages.map(()=>({strokes:[],redoStack:[],images:[],responses:[]}));
  miniWhiteboardsVisible=false;setAnnotation(false);
  renderOutline();buildPages(slides);showPage(0);
  $('timerMinutes').value = lesson.pages[0].durationMinutes || 5;resetTimer();
  $('participationHub').hidden=true;
  persistSnapshot();setStatus('Lesson ready. Start with the first stage, or choose any stage in the lesson flow.');
}
function formatTime(seconds) { return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`; }
function timerDuration() {
  const minutes = Math.min(180,Math.max(1,Number($('timerMinutes').value)||5));
  $('timerMinutes').value = minutes;
  return Math.round(minutes*60);
}
function renderTimer() {
  $('timerReadout').textContent = formatTime(remainingSeconds);
  $('timerReadout').classList.toggle('timer-warning',remainingSeconds<=10&&timerStarted);
  $('timerState').textContent = timerRunning ? 'TIME TO LEARN' : remainingSeconds===0 ? 'TIME’S UP' : timerStarted ? 'PAUSED' : 'READY WHEN YOU ARE';
  $('startTimerBtn').hidden=timerRunning;$('pauseTimerBtn').hidden=!timerRunning;
  $('startTimerBtn').textContent = timerStarted&&remainingSeconds>0 ? 'Resume timer' : remainingSeconds===0 ? 'Restart timer' : 'Start timer';
}
function startTimer() {
  if (timerRunning) return;
  if (!timerStarted || remainingSeconds===0) remainingSeconds=timerDuration();
  timerStarted=true;timerRunning=true;timerDeadline=Date.now()+remainingSeconds*1000;
  clearInterval(timerInterval);
  timerInterval=setInterval(()=>{
    remainingSeconds=Math.max(0,Math.ceil((timerDeadline-Date.now())/1000));
    if (!remainingSeconds) {timerRunning=false;clearInterval(timerInterval);setStatus('Stage timer complete.');}
    renderTimer();
  },250);
  renderTimer();
}
function pauseTimer() {
  remainingSeconds=Math.max(0,Math.ceil((timerDeadline-Date.now())/1000));
  timerRunning=false;clearInterval(timerInterval);renderTimer();
}
function resetTimer() {timerRunning=false;timerStarted=false;clearInterval(timerInterval);remainingSeconds=timerDuration();renderTimer();}
function setPreview(enabled) {
  if(enabled&&lesson.pages.length&&!stageIndices(true).length){setStatus('Show at least one slide in the lesson plan before opening student preview.');return;}
  document.body.classList.toggle('preview-mode',enabled);
  $('presenterViewBtn').classList.toggle('selected',!enabled);$('presenterViewBtn').setAttribute('aria-pressed',String(!enabled));
  $('previewBtn').classList.toggle('selected',enabled);$('previewBtn').setAttribute('aria-pressed',String(enabled));
  $('canvasLabel').textContent = enabled ? 'STUDENT VIEW · TEACHER NOTES HIDDEN' : 'TEACHER WORKSPACE';
  if(lesson.pages.length){renderOutline();if(enabled&&lesson.pages[currentPageIndex].hidden)goToStage(stageIndices(true)[0]);else showPage(currentPageIndex);}
  syncDrawing();
  setStatus(enabled ? 'Student view: teacher guidance is hidden and objects are locked. You can still annotate the slide.' : 'Teacher view: stage guidance and notes are visible.');
  requestAnimationFrame(resizeVisibleCanvases);
}
function setAudienceMode(enabled) {
  if(enabled&&lesson.pages.length&&!stageIndices(true).length){setStatus('Show at least one slide in the lesson plan before presenting.');return;}
  document.body.classList.toggle('audience-mode',enabled);
  $('presentationBar').hidden=!enabled;
  if (enabled) {setAnnotation(false);$('exitPresentBtn').focus();} else $('audienceViewBtn').focus();
  if(lesson.pages.length){renderOutline();if(studentMode()&&lesson.pages[currentPageIndex].hidden)goToStage(stageIndices(true)[0]);else showPage(currentPageIndex);}
  syncDrawing();
  requestAnimationFrame(resizeVisibleCanvases);
}
function setDisplayMode(mode) {
  document.body.classList.toggle('board-mode',mode==='board');
  document.body.classList.toggle('tablet-mode',mode==='tablet');
  ['board','tablet','standard'].forEach(type=>$(type+'ModeBtn').setAttribute('aria-pressed',String(type===mode)));
  closeTools();requestAnimationFrame(resizeVisibleCanvases);
}
function syncDrawing() {
  const presenting = document.body.classList.contains('audience-mode');
  const preview = document.body.classList.contains('preview-mode');
  boardEditor?.setMode({readonly:presenting || preview,preview,drawing:annotatorEnabled&&!presenting});
  boardEditor?.setPen(selectedColor,selectedPenSize);
  $('drawingToolbar').hidden=!annotatorEnabled;
  $('boardPenBtn').classList.toggle('selected',annotatorEnabled);
  $('boardPenBtn').setAttribute('aria-pressed',String(annotatorEnabled));
  document.body.classList.toggle('annotation-active',annotatorEnabled);
  $('toggleAnnotatorBtn').textContent=annotatorEnabled?'Disable pen':'Enable pen';
  $('toggleAnnotatorBtn').setAttribute('aria-pressed',String(annotatorEnabled));
  document.querySelectorAll('[data-editor-action]').forEach(button=>button.disabled=presenting||preview||button.dataset?.unavailable==='true');
  $('selectionInspector').hidden=presenting||preview||!boardEditor?.selected();
}
function setAnnotation(enabled) {annotatorEnabled=enabled;syncDrawing();}
function createColorSwatches() {
  ['colorSwatches','quickColors'].forEach(id=>{
    $(id).replaceChildren();
    penColors.forEach((color,index)=>{
      const button=element('button','color-swatch');button.type='button';button.style.background=color;
      button.title=colorNames[index];button.setAttribute('aria-label',`${colorNames[index]} pen`);
      button.setAttribute('aria-pressed',String(color===selectedColor));button.classList.toggle('active',color===selectedColor);
      button.addEventListener('click',()=>{selectedColor=color;createColorSwatches();boardEditor?.setPen(selectedColor,selectedPenSize);});
      $(id).append(button);
    });
  });
}
function undoStroke() {boardEditor?.undo();}
function redoStroke() {boardEditor?.redo();}
async function onPaste(event) {
  if(event.target.closest('input,textarea,[contenteditable]')||$('toolsDialog').open)return;
  try {await boardEditor.paste(event);}catch(error){setStatus(error.message);}
}
function renderResponseBoards() {
  const host=$('responseBoards');host.replaceChildren();host.hidden=!miniWhiteboardsVisible;
  if(!miniWhiteboardsVisible)return;
  (roster.length?roster:['Response 1','Response 2','Response 3','Response 4']).slice(0,12).forEach((name,i)=>{
    const card=element('div','mini-board-card');const label=element('label','',name);
    const input=element('textarea');input.id=`response-${i}`;label.htmlFor=input.id;input.placeholder='Write a response…';
    input.value=annotationStateByPage[currentPageIndex]?.responses?.[i]||'';
    input.addEventListener('input',()=>{annotationStateByPage[currentPageIndex].responses ||= [];annotationStateByPage[currentPageIndex].responses[i]=input.value;queueSnapshot();});
    card.append(label,input);host.append(card);
  });
}
function showActivity(cardId,title,prompt) {
  [$('pollCard'),$('exitTicketCard'),$('coldCallCard')].forEach(card=>card.hidden=true);
  const card=$(cardId);card.hidden=false;card.replaceChildren(element('h4','',title),element('p','',prompt));
  $('participationHub').hidden=false;closeTools();return card;
}
function launchPoll() {
  const card=showActivity('pollCard','Quick poll',$('pollQuestion').value.trim()||'How confident do you feel?');
  const options=element('div','poll-options');
  ['Ready','One more example','Need help'].forEach(label=>{
    let count=0;const button=element('button','',`${label} · 0`);button.addEventListener('click',()=>button.textContent=`${label} · ${++count}`);options.append(button);
  });
  card.append(options,element('p','helper','Tap a choice to tally a show of hands on this device.'));
}
function showExitTicket() {
  const card=showActivity('exitTicketCard','Exit ticket',$('exitTicketPrompt').value.trim()||'What is one idea you can explain now?');
  const label=element('label','','Class reflection');label.htmlFor='exitResponse';
  const response=element('textarea','response-input');response.id='exitResponse';response.placeholder='Capture a response together…';card.append(label,response);
}
function coldCallStudent() {
  roster=$('studentRoster').value.split('\n').map(name=>name.trim()).filter(Boolean);
  if(!roster.length){setStatus('Add names to your class roster to pick a student.');$('studentRoster').focus();return;}
  const name=roster[Math.floor(Math.random()*roster.length)];showActivity('coldCallCard','Student spotlight',`${name}, share your thinking with us.`);persistSnapshot();
}
function toggleMiniWhiteboards() {
  roster=$('studentRoster').value.split('\n').map(name=>name.trim()).filter(Boolean);
  miniWhiteboardsVisible=!miniWhiteboardsVisible;
  $('toggleMiniWhiteboardBtn').textContent=miniWhiteboardsVisible?'Hide response boards':'Show response boards';
  renderResponseBoards();closeTools();persistSnapshot();
}
function queueSnapshot() {clearTimeout(snapshotTimeout);snapshotTimeout=setTimeout(persistSnapshot,500);}
function currentDocument() {
  return {format:DOCUMENT_FORMAT,version:1,lesson:structuredClone(lesson),slides:boardEditor.documentSlides(),revealedAnswerCountByPage:[...revealedAnswerCountByPage],roster:[...roster]};
}
async function persistSnapshot() {
  if (!boardEditor || !lesson.pages.length) return;
  const snapshot=structuredClone({document:currentDocument(),currentPageIndex,annotationStateByPage,lessonJson:$('lessonJson').value,miniWhiteboardsVisible});
  $('saveIndicator').textContent='Saving…';
  saveChain=saveChain.catch(()=>{}).then(()=>saveSession(snapshot));
  try {await saveChain;$('saveIndicator').textContent='Saved on this device';}
  catch(error){$('saveIndicator').textContent='Session not saved';setStatus('Your browser could not save this session. Use Save lesson to download an editable JSON backup.');}
}
async function restoreSnapshotIfAvailable() {
  try {
    const saved=await readSession();
    if(saved?.document){
      validateDocument(saved.document);initLesson(saved.document.lesson,saved.document.slides);
      revealedAnswerCountByPage=lesson.pages.map((_,i)=>Number(saved.document.revealedAnswerCountByPage?.[i])||0);
      roster=list(saved.document.roster);$('studentRoster').value=roster.join('\n');
      annotationStateByPage=lesson.pages.map((_,i)=>({responses:list(saved.annotationStateByPage?.[i]?.responses)}));
      miniWhiteboardsVisible=Boolean(saved.miniWhiteboardsVisible);
      $('lessonJson').value=saved.lessonJson||$('lessonJson').value;
      currentPageIndex=Math.max(0,Math.min(Number(saved.currentPageIndex)||0,lesson.pages.length-1));
      showPage(currentPageIndex);$('timerMinutes').value=lesson.pages[currentPageIndex].durationMinutes||5;resetTimer();
      persistSnapshot();setStatus('Your editable lesson and stage progress have been restored.');return true;
    }
  }catch(error){setStatus('The saved session could not be restored. You can import a lesson file.');}
  // Convert the previous HTML app's snapshot without removing the original backup.
  try {
    const old=JSON.parse(localStorage.getItem(OFFLINE_SNAPSHOT_KEY)||'null');
    if(!old?.lesson?.pages?.length)return false;
    const converted=old.lessonJson?parseLesson(old.lessonJson):old.lesson;
    const slides=converted.pages.map(stageToSlide);initLesson(converted,slides);
    for(let index=0;index<slides.length;index++){
      for(const image of list(old.annotationStateByPage?.[index]?.images)){
        slides[index].objects.push({type:'Image',version:'7.4.0',src:image.src,left:image.x||10,top:image.y||10,width:image.width||220,height:image.height||160,originX:'left',originY:'top'});
      }
    }
    buildPages(slides);revealedAnswerCountByPage=converted.pages.map((_,i)=>old.revealedAnswerCountByPage?.[i]||0);
    currentPageIndex=Math.max(0,Math.min(old.currentPageIndex||0,lesson.pages.length-1));showPage(currentPageIndex);
    setStatus('Your previous lesson has been converted into editable slides.');return true;
  }catch{return false;}
}
async function exportForPrint() {
  const indices=stageIndices(true);
  if(!indices.length){setStatus('Show at least one slide in the lesson plan before exporting a PDF.');return;}
  closeTools();$('exportPdfBtn').disabled=true;
  try {
    const images=await boardEditor.imagesForPrint({allAnswers:$('includeHiddenAnswersPrint').checked,annotations:$('includeAnnotationsPrint').checked,counts:revealedAnswerCountByPage,indices});
    const printArea=$('printSlides');printArea.replaceChildren();
    const ready=images.map((src,index)=>{const image=element('img');image.src=src;image.alt=lesson.pages[indices[index]].title;printArea.append(image);return image.decode();});
    await Promise.all(ready);window.print();
  }catch(error){setStatus('Could not export this lesson: '+error.message);}
  finally{$('exportPdfBtn').disabled=false;}
}
async function saveLessonFile(compact=false) {
  $('saveLessonBtn').disabled=true;
  try {
    const doc=currentDocument();validateDocument(doc);
    const blob=compact?await packLesson(doc):new Blob([JSON.stringify(doc,null,2)],{type:'application/json'});
    downloadBlob(blob,`${lesson.title.replace(/[^a-z0-9]+/gi,'-').slice(0,60)||'lesson'}.${compact?'zip':'json'}`);
    setStatus('Editable lesson downloaded. Reopen it using Import lesson in this app.');
  }
  catch(error){setStatus('Could not save the lesson file: '+error.message);}
  finally{$('saveLessonBtn').disabled=false;}
}
async function loadLesson() {
  $('importError').hidden=true;$('loadLessonBtn').disabled=true;
  try{
    const input=pendingLessonFile?await unpackLesson(pendingLessonFile):JSON.parse($('lessonJson').value);
    if(input?.format===DOCUMENT_FORMAT){validateDocument(input);initLesson(input.lesson,input.slides);roster=list(input.roster);$('studentRoster').value=roster.join('\n');revealedAnswerCountByPage=lesson.pages.map((_,i)=>Number(input.revealedAnswerCountByPage?.[i])||0);syncAnswers();persistSnapshot();}
    else {await ensureSchemaLoaded();initLesson(parseLesson($('lessonJson').value));}
    pendingLessonFile=null;closeTools();
  }catch(error){$('importError').textContent=error.message;$('importError').hidden=false;}
  finally{$('loadLessonBtn').disabled=false;}
}
function addStage(duplicate=false) {
  const page=duplicate?structuredClone(lesson.pages[currentPageIndex]):{stageId:crypto.randomUUID(),title:'Untitled slide',stageType:'Activity',durationMinutes:5,questions:[],instructions:[],content:'',teacherNotes:[]};
  page.stageId=crypto.randomUUID();page.hidden=false;if(duplicate)page.title+=' (copy)';
  boardEditor.snapshot();const slides=boardEditor.documentSlides();
  const scene=duplicate?structuredClone(slides[currentPageIndex]):stageToSlide(page);
  if(duplicate)scene.objects.forEach(object=>{if(object.lpRole==='title')object.text=page.title;});
  const index=currentPageIndex+1;lesson.pages.splice(index,0,page);slides.splice(index,0,scene);revealedAnswerCountByPage.splice(index,0,0);annotationStateByPage.splice(index,0,{responses:[]});
  boardEditor.setLesson(slides);renderOutline();showPage(index);$('timerMinutes').value=page.durationMinutes;resetTimer();persistSnapshot();
}
function renderSelection(selection) {
  $('selectionInspector').hidden=!selection||boardEditor.readonly;
  if(!selection)return;
  $('selectedType').textContent=selection.type;
  $('textFormatting').hidden=!selection.text;
  $('objectColor').value=/^#[0-9a-f]{6}$/i.test(selection.fill)?selection.fill:'#244d40';
  if(selection.text){$('objectFontSize').value=Math.round(selection.fontSize);$('objectFontFamily').value=selection.fontFamily;$('objectBold').setAttribute('aria-pressed',String(selection.fontWeight==='bold'));$('objectItalic').setAttribute('aria-pressed',String(selection.fontStyle==='italic'));$('objectAlign').value=selection.textAlign;}
}
$('lessonJson').value=JSON.stringify(sampleLesson,null,2);
bindSidebar({navigation:'lessonNavigation',panel:'lessonOutline',toggle:'lessonPlanToggle',close:'closeLessonPlanBtn',state:lessonPanelState,set:setLessonPanel,hide:closeLessonPanel});
bindSidebar({navigation:'teachingNavigation',panel:'teacherPanel',toggle:'teacherPanelToggle',close:'closeTeacherPanelBtn',state:guidancePanelState,set:setGuidancePanel,hide:closeGuidancePanel});
$('importBtn').addEventListener('click',()=>openTools('section-lesson'));
$('closeDialogBtn').addEventListener('click',closeTools);
$('toolsDialog').addEventListener('close',()=>dialogOpener?.focus());
$('toolsDialog').addEventListener('click',event=>{if(event.target===$('toolsDialog')){const rect=$('toolsDialog').getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeTools();}});
$('shortcutsBtn').addEventListener('click',()=>openTools('section-shortcuts'));
$('penSettingsBtn').addEventListener('click',()=>openTools('section-annotator'));
$('loadLessonBtn').addEventListener('click',loadLesson);
$('sampleLessonBtn').addEventListener('click',()=>{pendingLessonFile=null;$('lessonJson').value=JSON.stringify(sampleLesson,null,2);$('importError').hidden=true;});
$('lessonFile').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  if(/\.(lesson|zip)$/i.test(file.name)){pendingLessonFile=file;$('lessonJson').value='';$('lessonJson').placeholder=`${file.name} — editable lesson package ready to load`;}
  else{pendingLessonFile=null;try{$('lessonJson').value=await file.text();}catch{$('importError').textContent='This file could not be read.';$('importError').hidden=false;event.target.value='';return;}}
  $('importError').hidden=true;setStatus(`${file.name} is ready to load.`);event.target.value='';
});
$('lessonJson').addEventListener('input',()=>pendingLessonFile=null);
document.querySelectorAll('.tool-launch[data-target]').forEach(button=>button.addEventListener('click',()=>openTools(button.dataset.target)));
$('nextBtn').addEventListener('click',()=>navigateStage(1));$('prevBtn').addEventListener('click',()=>navigateStage(-1));
$('presentationNextBtn').addEventListener('click',()=>$('nextBtn').click());$('presentationPrevBtn').addEventListener('click',()=>$('prevBtn').click());
$('revealAnswerBtn').addEventListener('click',revealNextAnswer);$('presentationRevealBtn').addEventListener('click',revealNextAnswer);
$('hideAnswersBtn').addEventListener('click',()=>{revealedAnswerCountByPage[currentPageIndex]=0;syncAnswers();persistSnapshot();});
$('startTimerBtn').addEventListener('click',startTimer);$('pauseTimerBtn').addEventListener('click',pauseTimer);$('resetTimerBtn').addEventListener('click',resetTimer);$('timerMinutes').addEventListener('change',resetTimer);
$('presenterViewBtn').addEventListener('click',()=>setPreview(false));$('previewBtn').addEventListener('click',()=>setPreview(true));
$('audienceViewBtn').addEventListener('click',()=>setAudienceMode(true));$('exitPresentBtn').addEventListener('click',()=>setAudienceMode(false));
['board','tablet','standard'].forEach(mode=>$(mode+'ModeBtn').addEventListener('click',()=>setDisplayMode(mode)));
$('boardPenBtn').addEventListener('click',()=>setAnnotation(!annotatorEnabled));
$('toggleAnnotatorBtn').addEventListener('click',()=>{setAnnotation(!annotatorEnabled);closeTools();});$('finishDrawingBtn').addEventListener('click',()=>setAnnotation(false));
$('penSize').addEventListener('input',()=>{selectedPenSize=Number($('penSize').value);$('penSizeValue').textContent=`${selectedPenSize} px`;boardEditor?.setPen(selectedColor,selectedPenSize);});
$('undoAnnotationBtn').addEventListener('click',undoStroke);$('quickUndoBtn').addEventListener('click',undoStroke);$('redoAnnotationBtn').addEventListener('click',redoStroke);$('quickRedoBtn').addEventListener('click',redoStroke);
$('clearPageAnnotationBtn').addEventListener('click',()=>boardEditor.clearAnnotations());
$('launchPollBtn').addEventListener('click',launchPoll);$('showExitTicketBtn').addEventListener('click',showExitTicket);$('coldCallBtn').addEventListener('click',coldCallStudent);$('toggleMiniWhiteboardBtn').addEventListener('click',toggleMiniWhiteboards);
$('studentRoster').addEventListener('input',()=>{roster=$('studentRoster').value.split('\n').map(name=>name.trim()).filter(Boolean);queueSnapshot();});
$('closeActivityBtn').addEventListener('click',()=>$('participationHub').hidden=true);
$('exportPdfBtn').addEventListener('click',exportForPrint);
document.addEventListener('paste',onPaste);
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!$('toolsDialog').open){if(document.body.classList.contains('lesson-plan-open')||document.body.classList.contains('teacher-panel-open')){closeLessonPanel();closeGuidancePanel();return;}if(document.body.classList.contains('audience-mode'))setAudienceMode(false);else setAnnotation(false);return;}
  if(event.target.closest('input,textarea,select,[contenteditable]')||$('toolsDialog').open||boardEditor.selected()?.isEditing)return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();saveLessonFile();return;}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redoStroke():undoStroke();return;}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='c'&&boardEditor.selected()){event.preventDefault();boardEditor.copySelection().catch(()=>setStatus('Copy is unavailable in this browser. Use Duplicate instead.'));return;}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='d'){event.preventDefault();boardEditor.duplicateSelection();return;}
  if(event.ctrlKey||event.metaKey||event.altKey)return;
  if((event.key==='Delete'||event.key==='Backspace')&&boardEditor.selected()){event.preventDefault();boardEditor.deleteSelection();return;}
  if(boardEditor.selected()&&!boardEditor.readonly&&event.key.startsWith('Arrow')){event.preventDefault();const object=boardEditor.selected();const step=event.shiftKey?10:1;boardEditor.updateSelected({left:object.left+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0),top:object.top+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0)});return;}
  if(event.key==='ArrowRight'){event.preventDefault();navigateStage(1);}
  if(event.key==='ArrowLeft'){event.preventDefault();navigateStage(-1);}
  if(event.key.toLowerCase()==='r'){event.preventDefault();revealNextAnswer();}
  if(event.key.toLowerCase()==='a'&&!document.body.classList.contains('audience-mode')){event.preventDefault();setAnnotation(!annotatorEnabled);}
});
function syncOfflineBanner() {$('offlineBanner').hidden=navigator.onLine;}
window.addEventListener('online',syncOfflineBanner);window.addEventListener('offline',syncOfflineBanner);
window.addEventListener('pagehide',()=>{if(lesson.pages.length)persistSnapshot();});
boardEditor=new SlideEditor($('teacherStage'),{
  onChange:queueSnapshot,onSelection:renderSelection,
  onHistory:state=>{['undoAnnotationBtn','quickUndoBtn','editorUndoBtn'].forEach(id=>$(id).disabled=!state.undo);['redoAnnotationBtn','quickRedoBtn','editorRedoBtn'].forEach(id=>$(id).disabled=!state.redo);},
  onError:setStatus,onTitleChange:(index,title)=>{if(lesson.pages[index]&&lesson.pages[index].title!==title){lesson.pages[index].title=title;renderOutline();$('stageBreadcrumb').textContent=title;}}
});
$('saveLessonBtn').addEventListener('click',()=>saveLessonFile());
$('saveCompactBtn').addEventListener('click',()=>saveLessonFile(true));
$('addStageBtn').addEventListener('click',()=>addStage(false));$('duplicateStageBtn').addEventListener('click',()=>addStage(true));
$('addTextBtn').addEventListener('click',()=>{setAnnotation(false);boardEditor.addText();});
$('addShapeBtn').addEventListener('click',()=>openTools('section-shapes'));
$('addStickerBtn').addEventListener('click',()=>openTools('section-stickers'));
$('addVideoBtn').addEventListener('click',()=>openTools('section-video'));
$('insertVideoBtn').addEventListener('click',()=>{try{boardEditor.addVideo($('youtubeUrl').value);$('videoError').hidden=true;closeTools();}catch(error){$('videoError').hidden=false;$('videoError').textContent=error.message;}});
$('addImageBtn').addEventListener('click',()=>$('imageFile').click());
$('imageFile').addEventListener('change',async event=>{const file=event.target.files[0];if(file){try{await boardEditor.addImage(file);}catch(error){setStatus(error.message);}}event.target.value='';});
$('teacherStage').addEventListener('dragover',event=>{if(!boardEditor.readonly)event.preventDefault();});
$('teacherStage').addEventListener('drop',async event=>{if(boardEditor.readonly)return;event.preventDefault();const file=event.dataTransfer.files[0];if(file){try{await boardEditor.addImage(file);}catch(error){setStatus(error.message);}}});
document.querySelectorAll('[data-shape]').forEach(button=>button.addEventListener('click',()=>{boardEditor.addShape(button.dataset.shape);closeTools();}));
document.querySelectorAll('[data-sticker]').forEach(button=>button.addEventListener('click',()=>{boardEditor.addSticker(button.dataset.sticker);closeTools();}));
$('editorUndoBtn').addEventListener('click',undoStroke);$('editorRedoBtn').addEventListener('click',redoStroke);
$('objectColor').addEventListener('input',()=>boardEditor.updateSelected({fill:$('objectColor').value}));
$('objectFontSize').addEventListener('change',()=>boardEditor.updateSelected({fontSize:Math.min(200,Math.max(8,Number($('objectFontSize').value)||36))}));
$('objectFontFamily').addEventListener('change',()=>boardEditor.updateSelected({fontFamily:$('objectFontFamily').value}));
$('objectBold').addEventListener('click',()=>boardEditor.updateSelected({fontWeight:boardEditor.selected()?.fontWeight==='bold'?'normal':'bold'}));
$('objectItalic').addEventListener('click',()=>boardEditor.updateSelected({fontStyle:boardEditor.selected()?.fontStyle==='italic'?'normal':'italic'}));
$('objectAlign').addEventListener('change',()=>boardEditor.updateSelected({textAlign:$('objectAlign').value}));
$('duplicateObjectBtn').addEventListener('click',()=>boardEditor.duplicateSelection());$('deleteObjectBtn').addEventListener('click',()=>boardEditor.deleteSelection());
$('objectForwardBtn').addEventListener('click',()=>boardEditor.moveLayer(true));$('objectBackwardBtn').addEventListener('click',()=>boardEditor.moveLayer(false));
(async()=>{
  createColorSwatches();syncOfflineBanner();
  try{await ensureSchemaLoaded();if(!await restoreSnapshotIfAvailable())initLesson(parseLesson($('lessonJson').value));}
  catch(error){setStatus(`Could not start: ${error.message}`);}
  if(import.meta.env.PROD&&'serviceWorker'in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>setStatus('Offline app caching is unavailable. Your lesson can still save on this device.'));
})();

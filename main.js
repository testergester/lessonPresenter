'use strict';
const $ = (id) => document.getElementById(id);
const OFFLINE_SNAPSHOT_KEY = 'lessonPresenter.snapshot.v1';
const penColors = ['#e11d48', '#2563eb', '#059669', '#d97706', '#111827', '#7c3aed'];
const colorNames = ['Rose', 'Blue', 'Green', 'Amber', 'Black', 'Purple'];
let lesson = {title: '', pages: []};
let currentPageIndex = 0;
let revealedAnswerCountByPage = [];
let annotationStateByPage = [];
let pageCanvases = [];
let resizeObserver;
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
    return {stageId:stage.id || `stage-${index+1}`,title:stage.name || stage.stageType || `Stage ${index+1}`,stageType:stage.stageType || 'Activity',durationMinutes:stage.durationMinutes || 5,aim:stage.aim || '',interaction:stage.interaction || '',instructions:list(stage.instructions),procedure:list(stage.procedure),teacherNotes:list(stage.teacherNotes),timingNotes:list(stage.timingNotes),anticipatedProblems:list(stage.anticipatedProblems),content:content.text || '',prompts:list(content.prompts),examples:list(content.examples),items:list(content.items),questions};
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
function setLessonPanel(changes) {
  Object.assign(lessonPanelState, changes);
  const open = lessonPanelState.pinned || lessonPanelState.hovered || lessonPanelState.focused;
  document.body.classList.toggle('lesson-plan-open', open);
  $('lessonPlanToggle').setAttribute('aria-expanded', String(open));
  $('lessonPlanToggle').setAttribute('aria-pressed', String(lessonPanelState.pinned));
  $('lessonOutline').inert = !open;
}
function closeLessonPanel() {
  setLessonPanel({pinned:false, hovered:false, focused:false});
  if ($('lessonOutline').contains(document.activeElement)) $('lessonPlanToggle').focus();
}
function setStatus(message) { $('status').textContent = message; }
function openTools(target) {
  const titles = {'section-lesson':'Import lesson','section-annotator':'Annotate your lesson','section-participation':'Bring everyone in','section-view':'Display settings','section-export':'Export your lesson','section-shortcuts':'Keyboard shortcuts'};
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
function renderOutline() {
  $('lessonTitle').textContent = lesson.title;
  $('presentLessonTitle').textContent = lesson.title;
  $('lessonMeta').replaceChildren();
  [lesson.level,lesson.lessonType,lesson.durationMinutes ? `${lesson.durationMinutes} min` : ''].filter(Boolean).forEach(text=>$('lessonMeta').append(element('span','',text)));
  $('stageCount').textContent = `${lesson.pages.length} stage${lesson.pages.length === 1 ? '' : 's'}`;
  $('outlineDuration').textContent = `${lesson.pages.reduce((total,page)=>total+(page.durationMinutes || 5),0)} min planned`;
  $('lessonAim').textContent = lesson.mainAim || 'Move through each stage at your class’s pace.';
  $('stageList').replaceChildren();
  lesson.pages.forEach((page,index)=>{
    const button = element('button','stage-item');
    button.type = 'button';
    const info = element('span','stage-info');
    info.append(element('strong','',page.title),element('small','',`${page.durationMinutes || 5} min · ${(page.stageType || 'activity').replaceAll('_',' ')}`));
    button.append(element('span','stage-number',String(index+1).padStart(2,'0')),info);
    button.addEventListener('click',()=>goToStage(index));
    $('stageList').append(button);
  });
}
function createPageElement(page,index,mode) {
  const article = element('article','page');
  article.dataset.pageIndex = index;
  article.append(element('div','page-kicker',`${(page.stageType || 'activity').replaceAll('_',' ').toUpperCase()}${page.interaction ? ` · ${page.interaction}` : ''}`),element('h2','page-title',page.title));
  if (page.content) article.append(element('p','page-content',page.content));
  if (list(page.instructions).length) {
    const instructions = element('div','instruction-block');
    instructions.append(element('h3','','YOUR TASK'));
    page.instructions.forEach(text=>instructions.append(element('p','',displayText(text))));
    article.append(instructions);
  }
  if (list(page.prompts).length) {
    const chips = element('div','prompt-chips');
    page.prompts.forEach(text=>chips.append(element('span','',displayText(text))));
    article.append(chips);
  }
  list(page.items).forEach(text=>article.append(element('p','question-prompt',displayText(text))));
  page.questions.forEach((question,questionIndex)=>{
    const block = element('div','question');
    const body = element('div','question-body');
    body.append(element('div','question-prompt',question.prompt));
    if (question.answer) {
      const answer = element('div','answer hidden',question.answer);
      body.append(answer);
    }
    block.append(element('span','question-number',questionIndex+1),body);
    article.append(block);
  });
  if (list(page.examples).length) {
    const examples = element('div','examples-block');
    examples.append(element('h3','','AN EXAMPLE TO GET YOU THINKING'));
    page.examples.forEach(text=>examples.append(element('p','',displayText(text))));
    article.append(examples);
  }
  const images = element('div','pasted-images');
  article.append(images);
  list(annotationStateByPage[index]?.images).forEach(image=>addImageElement(images,image,index,mode));
  if (mode === 'teacher' && miniWhiteboardsVisible) {
    const boards = element('div','mini-whiteboards');
    (roster.length ? roster : ['Response 1','Response 2','Response 3','Response 4']).slice(0,12).forEach((name,i)=>{
      const card = element('div','mini-board-card');
      const label = element('label','',name);
      const input = element('textarea');
      input.id = `response-${index}-${i}`;
      label.htmlFor = input.id;
      input.placeholder = 'Write a response…';
      input.value = annotationStateByPage[index]?.responses?.[i] || '';
      input.addEventListener('input',()=>{
        annotationStateByPage[index].responses ||= [];
        annotationStateByPage[index].responses[i] = input.value;
        queueSnapshot();
      });
      card.append(label,input);boards.append(card);
    });
    article.append(boards);
  }
  const footer = element('div','page-footer');
  footer.append(element('span','','LESSON PRESENTER'),element('span','',`${String(index+1).padStart(2,'0')} / ${String(lesson.pages.length).padStart(2,'0')}`));
  article.append(footer);
  const canvas = element('canvas','annotator-layer');
  canvas.setAttribute('aria-hidden','true');
  article.append(canvas);
  attachDrawingEvents(canvas,index);
  return article;
}
function buildPages() {
  if (resizeObserver) resizeObserver.disconnect();
  $('teacherStage').replaceChildren();$('audienceStage').replaceChildren();pageCanvases=[];
  lesson.pages.forEach((page,index)=>{
    const teacher = createPageElement(page,index,'teacher');
    const audience = createPageElement(page,index,'audience');
    teacher.style.display = audience.style.display = 'none';
    $('teacherStage').append(teacher);$('audienceStage').append(audience);
    pageCanvases.push(teacher.querySelector('canvas'));
  });
  resizeObserver = new ResizeObserver(()=>resizeVisibleCanvases());
  [...$('teacherStage').children,...$('audienceStage').children].forEach(page=>resizeObserver.observe(page));
}
function activePage(container = $('teacherStage')) { return container.children[currentPageIndex]; }
function answerTotal() { return lesson.pages[currentPageIndex]?.questions.filter(q=>q.answer).length || 0; }
function syncAnswers() {
  const shown = revealedAnswerCountByPage[currentPageIndex] || 0;
  [$('teacherStage'),$('audienceStage')].forEach(container=>{
    activePage(container)?.querySelectorAll('.answer').forEach((answer,i)=>answer.classList.toggle('hidden',i>=shown));
  });
  const total = answerTotal();
  $('revealAnswerBtn').disabled = $('presentationRevealBtn').disabled = shown >= total;
  $('revealAnswerBtn').textContent = total ? shown >= total ? 'Answers revealed' : `Reveal answer · ${shown}/${total}` : 'No answers';
  $('hideAnswersBtn').hidden = shown === 0;
}
function showPage(index) {
  if (!lesson.pages[index]) return;
  currentPageIndex = index;
  [$('teacherStage'),$('audienceStage')].forEach(container=>[...container.children].forEach((page,i)=>page.style.display=i===index?'block':'none'));
  $('stageList').querySelectorAll('button').forEach((button,i)=>{
    button.classList.toggle('active',i===index);
    if (i===index) button.setAttribute('aria-current','step'); else button.removeAttribute('aria-current');
  });
  const page = lesson.pages[index];
  $('stageBreadcrumb').textContent = page.title;
  $('stageCounter').textContent = `${String(index+1).padStart(2,'0')} / ${String(lesson.pages.length).padStart(2,'0')}`;
  $('progressLabel').textContent = `Stage ${index+1} of ${lesson.pages.length}`;
  $('presentationCounter').textContent = `${index+1} / ${lesson.pages.length}`;
  $('progressFill').style.width = `${(index+1)/lesson.pages.length*100}%`;
  $('prevBtn').disabled = $('presentationPrevBtn').disabled = index === 0;
  $('nextBtn').disabled = $('presentationNextBtn').disabled = index === lesson.pages.length-1;
  $('nextStageLabel').textContent = lesson.pages[index+1] ? `${lesson.pages[index+1].title} · ${lesson.pages[index+1].durationMinutes || 5} min` : 'Final stage. Time to reflect and wrap up.';
  $('suggestedTime').textContent = `${page.durationMinutes || 5} min planned`;
  renderGuidance(page);syncAnswers();syncDrawing();
  requestAnimationFrame(resizeVisibleCanvases);
}
function goToStage(index) {
  if (index < 0 || index >= lesson.pages.length || index === currentPageIndex) return;
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
function initLesson(parsed) {
  lesson = parsed;currentPageIndex=0;
  revealedAnswerCountByPage = lesson.pages.map(()=>0);
  annotationStateByPage = lesson.pages.map(()=>({strokes:[],redoStack:[],images:[],responses:[]}));
  miniWhiteboardsVisible=false;setAnnotation(false);
  renderOutline();buildPages();showPage(0);
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
  document.body.classList.toggle('preview-mode',enabled);
  $('presenterViewBtn').classList.toggle('selected',!enabled);$('presenterViewBtn').setAttribute('aria-pressed',String(!enabled));
  $('previewBtn').classList.toggle('selected',enabled);$('previewBtn').setAttribute('aria-pressed',String(enabled));
  $('canvasLabel').textContent = enabled ? 'STUDENT VIEW · TEACHER NOTES HIDDEN' : 'TEACHER WORKSPACE';
  syncDrawing();
  setStatus(enabled ? 'Student view: teacher guidance is hidden. Board tools remain below the lesson.' : 'Teacher view: stage guidance and notes are visible.');
  requestAnimationFrame(resizeVisibleCanvases);
}
function setAudienceMode(enabled) {
  document.body.classList.toggle('audience-mode',enabled);
  $('presentationBar').hidden=!enabled;
  if (enabled) {setAnnotation(false);$('exitPresentBtn').focus();} else $('audienceViewBtn').focus();
  requestAnimationFrame(resizeVisibleCanvases);
}
function setDisplayMode(mode) {
  document.body.classList.toggle('board-mode',mode==='board');
  document.body.classList.toggle('tablet-mode',mode==='tablet');
  ['board','tablet','standard'].forEach(type=>$(type+'ModeBtn').setAttribute('aria-pressed',String(type===mode)));
  closeTools();requestAnimationFrame(resizeVisibleCanvases);
}
function syncDrawing() {
  const studentView = document.body.classList.contains('preview-mode');
  pageCanvases.forEach((canvas,index)=>{
    canvas.classList.toggle('active',annotatorEnabled&&!studentView&&index===currentPageIndex);
    canvasForAudience(index)?.classList.toggle('active',annotatorEnabled&&studentView&&index===currentPageIndex);
  });
  $('drawingToolbar').hidden=!annotatorEnabled;
  $('boardPenBtn').classList.toggle('selected',annotatorEnabled);
  $('boardPenBtn').setAttribute('aria-pressed',String(annotatorEnabled));
  document.body.classList.toggle('annotation-active',annotatorEnabled);
  $('toggleAnnotatorBtn').textContent=annotatorEnabled?'Disable pen':'Enable pen';
  $('toggleAnnotatorBtn').setAttribute('aria-pressed',String(annotatorEnabled));
  const state=annotationStateByPage[currentPageIndex];
  $('quickUndoBtn').disabled=$('undoAnnotationBtn').disabled=!state?.strokes?.length;
  $('quickRedoBtn').disabled=$('redoAnnotationBtn').disabled=!state?.redoStack?.length;
}
function setAnnotation(enabled) {
  annotatorEnabled=enabled;
  syncDrawing();
}
function createColorSwatches() {
  ['colorSwatches','quickColors'].forEach(id=>{
    $(id).replaceChildren();
    penColors.forEach((color,index)=>{
      const button=element('button','color-swatch');
      button.type='button';button.style.background=color;button.title=colorNames[index];button.setAttribute('aria-label',`${colorNames[index]} pen`);
      button.setAttribute('aria-pressed',String(color===selectedColor));button.classList.toggle('active',color===selectedColor);
      button.addEventListener('click',()=>{selectedColor=color;createColorSwatches();});
      $(id).append(button);
    });
  });
}
function canvasForAudience(index) {return $('audienceStage').children[index]?.querySelector('canvas');}
function redrawCanvas(index,previewStroke) {
  [pageCanvases[index],canvasForAudience(index)].filter(Boolean).forEach(canvas=>{
    const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
    const strokes=[...list(annotationStateByPage[index]?.strokes),...(previewStroke?[previewStroke]:[])];
    strokes.forEach(stroke=>{
      if (!stroke.points.length) return;
      ctx.strokeStyle=stroke.color;ctx.lineWidth=stroke.size;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
      const point=(p)=>stroke.normalized?{x:p.x*canvas.width,y:p.y*canvas.height}:p;
      const first=point(stroke.points[0]);ctx.moveTo(first.x,first.y);
      stroke.points.slice(1).forEach(p=>{const pos=point(p);ctx.lineTo(pos.x,pos.y);});
      if(stroke.points.length===1) ctx.lineTo(first.x+.1,first.y+.1);
      ctx.stroke();
    });
  });
}
function resizeVisibleCanvases() {
  [pageCanvases[currentPageIndex],canvasForAudience(currentPageIndex)].filter(Boolean).forEach(canvas=>{
    const rect=canvas.parentElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    if (canvas.width!==Math.round(rect.width)||canvas.height!==Math.round(rect.height)) {canvas.width=Math.round(rect.width);canvas.height=Math.round(rect.height);}
  });
  redrawCanvas(currentPageIndex);
}
function attachDrawingEvents(canvas,index) {
  let stroke;
  const position=(event)=>{const rect=canvas.getBoundingClientRect();return {x:(event.clientX-rect.left)/rect.width,y:(event.clientY-rect.top)/rect.height};};
  canvas.addEventListener('pointerdown',event=>{
    if(!annotatorEnabled||!canvas.classList.contains('active')||index!==currentPageIndex||event.button!==0)return;
    event.preventDefault();canvas.setPointerCapture(event.pointerId);
    stroke={color:selectedColor,size:selectedPenSize,normalized:true,points:[position(event)]};redrawCanvas(index,stroke);
  });
  canvas.addEventListener('pointermove',event=>{if(!stroke)return;stroke.points.push(position(event));redrawCanvas(index,stroke);});
  const finish=()=>{if(!stroke)return;annotationStateByPage[index].strokes.push(stroke);annotationStateByPage[index].redoStack=[];stroke=null;redrawCanvas(index);syncDrawing();persistSnapshot();};
  canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);canvas.addEventListener('lostpointercapture',finish);
}
function undoStroke() {const state=annotationStateByPage[currentPageIndex];if(!state?.strokes.length)return;state.redoStack.push(state.strokes.pop());redrawCanvas(currentPageIndex);syncDrawing();persistSnapshot();}
function redoStroke() {const state=annotationStateByPage[currentPageIndex];if(!state?.redoStack.length)return;state.strokes.push(state.redoStack.pop());redrawCanvas(currentPageIndex);syncDrawing();persistSnapshot();}
function addImageElement(area,image,index,mode) {
  const item=element('div','pasted-image-item');
  Object.assign(item.style,{left:`${image.x}px`,top:`${image.y}px`,width:`${image.width}px`,height:`${image.height}px`});
  const img=element('img','pasted-image');img.src=image.src;img.alt='Lesson visual';item.append(img);area.append(item);
  area.style.minHeight=`${Math.max(parseFloat(area.style.minHeight)||200,image.y+image.height)}px`;
  if(mode!=='teacher')return;
  const handle=element('div','resize-handle');handle.setAttribute('aria-hidden','true');item.append(handle);
  let drag;
  item.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;event.preventDefault();
    drag={resize:event.target===handle,startX:event.clientX,startY:event.clientY,x:image.x,y:image.y,width:image.width,height:image.height};item.setPointerCapture(event.pointerId);
  });
  item.addEventListener('pointermove',event=>{
    if(!drag)return;
    if(drag.resize){image.width=Math.min(area.clientWidth,Math.max(60,drag.width+event.clientX-drag.startX));image.height=Math.max(60,drag.height+event.clientY-drag.startY);}
    else{image.x=Math.max(0,Math.min(area.clientWidth-image.width,drag.x+event.clientX-drag.startX));image.y=Math.max(0,drag.y+event.clientY-drag.startY);}
    Object.assign(item.style,{left:`${image.x}px`,top:`${image.y}px`,width:`${image.width}px`,height:`${image.height}px`});
    area.style.minHeight=`${Math.max(200,image.y+image.height)}px`;
  });
  const finish=()=>{if(!drag)return;drag=null;const audienceArea=$('audienceStage').children[index].querySelector('.pasted-images');audienceArea.replaceChildren();annotationStateByPage[index].images.forEach(visual=>addImageElement(audienceArea,visual,index,'audience'));audienceArea.style.minHeight=area.style.minHeight;persistSnapshot();};
  item.addEventListener('pointerup',finish);item.addEventListener('pointercancel',finish);
  area.style.minHeight=`${Math.max(parseFloat(area.style.minHeight)||200,image.y+image.height)}px`;
}
function onPaste(event) {
  if(event.target.closest('input,textarea,[contenteditable]')||$('toolsDialog').open||document.body.classList.contains('audience-mode'))return;
  const file=[...event.clipboardData?.items||[]].find(item=>item.type.startsWith('image/'))?.getAsFile();
  if(!file)return;
  event.preventDefault();
  const index=currentPageIndex;const state=annotationStateByPage[index];
  const reader=new FileReader();
  reader.onload=()=>{
    if(annotationStateByPage[index]!==state)return;
    const image={src:reader.result,x:10,y:10,width:Math.min(220,$('teacherStage').clientWidth-60),height:160};
    state.images ||= [];state.images.push(image);
    [$('teacherStage'),$('audienceStage')].forEach((container,i)=>addImageElement(container.children[index].querySelector('.pasted-images'),image,index,i?'audience':'teacher'));
    persistSnapshot();setStatus('Image added. Drag to move it, or drag its corner to resize.');
  };
  reader.readAsDataURL(file);
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
  buildPages();showPage(currentPageIndex);closeTools();persistSnapshot();
}
function queueSnapshot() {clearTimeout(snapshotTimeout);snapshotTimeout=setTimeout(persistSnapshot,500);}
function persistSnapshot() {
  try {
    localStorage.setItem(OFFLINE_SNAPSHOT_KEY,JSON.stringify({lesson,currentPageIndex,revealedAnswerCountByPage,annotationStateByPage,lessonJson:$('lessonJson').value,roster,miniWhiteboardsVisible}));
    $('saveIndicator').textContent='Saved on this device';
  }catch(error){
    $('saveIndicator').textContent='Session not saved';
    if(!saveWarningShown){setStatus('Your browser could not save this session. Keep this tab open to retain your work.');saveWarningShown=true;}
  }
}
function restoreSnapshotIfAvailable() {
  try {
    const saved=JSON.parse(localStorage.getItem(OFFLINE_SNAPSHOT_KEY)||'null');
    if(!saved?.lesson?.pages?.length||saved.lesson.pages.some(page=>!Array.isArray(page.questions)))return false;
    lesson=saved.lesson;
    // Enrich snapshots from the original app with the stage metadata it discarded.
    if(saved.lessonJson&&lesson.pages[0].instructions===undefined){
      try{const enriched=parseLesson(saved.lessonJson);if(enriched.pages.length===lesson.pages.length)lesson=enriched;}catch{/* Keep the usable saved lesson. */}
    }
    $('lessonJson').value=saved.lessonJson||$('lessonJson').value;
    revealedAnswerCountByPage=lesson.pages.map((_,i)=>Number(saved.revealedAnswerCountByPage?.[i])||0);
    annotationStateByPage=lesson.pages.map((_,i)=>({strokes:list(saved.annotationStateByPage?.[i]?.strokes),redoStack:list(saved.annotationStateByPage?.[i]?.redoStack),images:list(saved.annotationStateByPage?.[i]?.images),responses:list(saved.annotationStateByPage?.[i]?.responses)}));
    roster=list(saved.roster);$('studentRoster').value=roster.join('\n');miniWhiteboardsVisible=Boolean(saved.miniWhiteboardsVisible);
    currentPageIndex=Math.max(0,Math.min(Number(saved.currentPageIndex)||0,lesson.pages.length-1));
    renderOutline();buildPages();showPage(currentPageIndex);$('timerMinutes').value=lesson.pages[currentPageIndex].durationMinutes||5;resetTimer();
    setStatus('Welcome back. Your lesson and stage progress have been restored.');return true;
  }catch{return false;}
}
function exportForPrint() {
  closeTools();
  const pages=[...$('teacherStage').children];
  const displays=pages.map(page=>page.style.display);
  const answerClasses=pages.map(page=>[...page.querySelectorAll('.answer')].map(answer=>answer.className));
  const wasPresenting=document.body.classList.contains('audience-mode');const wasPreviewing=document.body.classList.contains('preview-mode');
  document.body.classList.remove('audience-mode','preview-mode');
  pages.forEach((page,index)=>{
    page.style.display='block';page.classList.toggle('hide-annotation-on-print',!$('includeAnnotationsPrint').checked);
    page.querySelectorAll('.answer').forEach((answer,i)=>answer.classList.toggle('hidden',!$('includeHiddenAnswersPrint').checked&&i>=(revealedAnswerCountByPage[index]||0)));
    const canvas=pageCanvases[index];const rect=page.getBoundingClientRect();canvas.width=rect.width;canvas.height=rect.height;redrawCanvas(index);
  });
  const restore=()=>{
    pages.forEach((page,index)=>{page.style.display=displays[index];page.classList.remove('hide-annotation-on-print');page.querySelectorAll('.answer').forEach((answer,i)=>answer.className=answerClasses[index][i]);});
    document.body.classList.toggle('audience-mode',wasPresenting);document.body.classList.toggle('preview-mode',wasPreviewing);resizeVisibleCanvases();
  };
  window.addEventListener('afterprint',restore,{once:true});
  requestAnimationFrame(()=>requestAnimationFrame(()=>{try{window.print();}finally{restore();}}));
}
async function loadLesson() {
  $('importError').hidden=true;
  try{await ensureSchemaLoaded();const parsed=parseLesson($('lessonJson').value);initLesson(parsed);closeTools();}
  catch(error){$('importError').textContent=error.message;$('importError').hidden=false;}
}
$('lessonJson').value=JSON.stringify(sampleLesson,null,2);
$('lessonPlanToggle').addEventListener('click',()=>{
  if (lessonPanelState.pinned) closeLessonPanel();
  else setLessonPanel({pinned:true});
});
$('closeLessonPlanBtn').addEventListener('click',closeLessonPanel);
$('lessonNavigation').addEventListener('pointerenter',event=>{
  if (event.pointerType === 'mouse') setLessonPanel({hovered:true});
});
$('lessonNavigation').addEventListener('pointerleave',()=>setLessonPanel({hovered:false}));
$('lessonOutline').addEventListener('focusin',()=>setLessonPanel({focused:true}));
$('lessonOutline').addEventListener('focusout',event=>{
  if (!$('lessonOutline').contains(event.relatedTarget)) setLessonPanel({focused:false});
});
document.addEventListener('click',event=>{
  if (!$('lessonNavigation').contains(event.target)) setLessonPanel({pinned:false,hovered:false,focused:false});
});
$('importBtn').addEventListener('click',()=>openTools('section-lesson'));
$('closeDialogBtn').addEventListener('click',closeTools);
$('toolsDialog').addEventListener('close',()=>dialogOpener?.focus());
$('toolsDialog').addEventListener('click',event=>{if(event.target===$('toolsDialog')){const rect=$('toolsDialog').getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeTools();}});
$('shortcutsBtn').addEventListener('click',()=>openTools('section-shortcuts'));
$('penSettingsBtn').addEventListener('click',()=>openTools('section-annotator'));
$('loadLessonBtn').addEventListener('click',loadLesson);
$('sampleLessonBtn').addEventListener('click',()=>{$('lessonJson').value=JSON.stringify(sampleLesson,null,2);$('importError').hidden=true;});
$('lessonFile').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try{$('lessonJson').value=await file.text();$('importError').hidden=true;setStatus(`${file.name} is ready to load.`);}catch{$('importError').textContent='This file could not be read. Try pasting the JSON instead.';$('importError').hidden=false;}
  event.target.value='';
});
document.querySelectorAll('.tool-launch[data-target]').forEach(button=>button.addEventListener('click',()=>openTools(button.dataset.target)));
$('nextBtn').addEventListener('click',()=>goToStage(currentPageIndex+1));$('prevBtn').addEventListener('click',()=>goToStage(currentPageIndex-1));
$('presentationNextBtn').addEventListener('click',()=>$('nextBtn').click());$('presentationPrevBtn').addEventListener('click',()=>$('prevBtn').click());
$('revealAnswerBtn').addEventListener('click',revealNextAnswer);$('presentationRevealBtn').addEventListener('click',revealNextAnswer);
$('hideAnswersBtn').addEventListener('click',()=>{revealedAnswerCountByPage[currentPageIndex]=0;syncAnswers();persistSnapshot();});
$('startTimerBtn').addEventListener('click',startTimer);$('pauseTimerBtn').addEventListener('click',pauseTimer);$('resetTimerBtn').addEventListener('click',resetTimer);$('timerMinutes').addEventListener('change',resetTimer);
$('presenterViewBtn').addEventListener('click',()=>setPreview(false));$('previewBtn').addEventListener('click',()=>setPreview(true));
$('audienceViewBtn').addEventListener('click',()=>setAudienceMode(true));$('exitPresentBtn').addEventListener('click',()=>setAudienceMode(false));
['board','tablet','standard'].forEach(mode=>$(mode+'ModeBtn').addEventListener('click',()=>setDisplayMode(mode)));
$('boardPenBtn').addEventListener('click',()=>setAnnotation(!annotatorEnabled));
$('toggleAnnotatorBtn').addEventListener('click',()=>{setAnnotation(!annotatorEnabled);closeTools();});$('finishDrawingBtn').addEventListener('click',()=>setAnnotation(false));
$('penSize').addEventListener('input',()=>{selectedPenSize=Number($('penSize').value);$('penSizeValue').textContent=`${selectedPenSize} px`;});
$('undoAnnotationBtn').addEventListener('click',undoStroke);$('quickUndoBtn').addEventListener('click',undoStroke);$('redoAnnotationBtn').addEventListener('click',redoStroke);$('quickRedoBtn').addEventListener('click',redoStroke);
$('clearPageAnnotationBtn').addEventListener('click',()=>{const state=annotationStateByPage[currentPageIndex];if(!state)return;state.redoStack.push(...state.strokes.reverse());state.strokes=[];redrawCanvas(currentPageIndex);syncDrawing();persistSnapshot();});
$('launchPollBtn').addEventListener('click',launchPoll);$('showExitTicketBtn').addEventListener('click',showExitTicket);$('coldCallBtn').addEventListener('click',coldCallStudent);$('toggleMiniWhiteboardBtn').addEventListener('click',toggleMiniWhiteboards);
$('studentRoster').addEventListener('input',()=>{roster=$('studentRoster').value.split('\n').map(name=>name.trim()).filter(Boolean);queueSnapshot();});
$('closeActivityBtn').addEventListener('click',()=>$('participationHub').hidden=true);
$('exportPdfBtn').addEventListener('click',exportForPrint);
document.addEventListener('paste',onPaste);
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!$('toolsDialog').open){if(document.body.classList.contains('lesson-plan-open')){closeLessonPanel();return;}if(document.body.classList.contains('audience-mode'))setAudienceMode(false);else setAnnotation(false);return;}
  if(event.target.closest('input,textarea,select,[contenteditable]')||$('toolsDialog').open||event.ctrlKey||event.metaKey||event.altKey)return;
  if(event.key==='ArrowRight'){event.preventDefault();goToStage(currentPageIndex+1);}
  if(event.key==='ArrowLeft'){event.preventDefault();goToStage(currentPageIndex-1);}
  if(event.key.toLowerCase()==='r'){event.preventDefault();revealNextAnswer();}
  if(event.key.toLowerCase()==='a'&&!document.body.classList.contains('audience-mode')){event.preventDefault();setAnnotation(!annotatorEnabled);}
});
function syncOfflineBanner() {$('offlineBanner').hidden=navigator.onLine;}
window.addEventListener('online',syncOfflineBanner);window.addEventListener('offline',syncOfflineBanner);
window.addEventListener('pagehide',()=>{if(lesson.pages.length)persistSnapshot();});
(async()=>{
  createColorSwatches();syncOfflineBanner();
  try{await ensureSchemaLoaded();if(!restoreSnapshotIfAvailable())initLesson(parseLesson($('lessonJson').value));}
  catch(error){setStatus(`Could not start: ${error.message}`);}
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>setStatus('Offline app caching is unavailable. Your lesson can still save on this device.'));
})();

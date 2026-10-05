const lessonJsonInput = document.getElementById('lessonJson');
const loadLessonBtn = document.getElementById('loadLessonBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const revealAnswerBtn = document.getElementById('revealAnswerBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const teacherStage = document.getElementById('teacherStage');
const audienceStage = document.getElementById('audienceStage');
const status = document.getElementById('status');
const colorSwatches = document.getElementById('colorSwatches');
const penSize = document.getElementById('penSize');
const penSizeValue = document.getElementById('penSizeValue');
const toggleAnnotatorBtn = document.getElementById('toggleAnnotatorBtn');
const clearPageAnnotationBtn = document.getElementById('clearPageAnnotationBtn');
const undoAnnotationBtn = document.getElementById('undoAnnotationBtn');
const redoAnnotationBtn = document.getElementById('redoAnnotationBtn');
const presenterViewBtn = document.getElementById('presenterViewBtn');
const audienceViewBtn = document.getElementById('audienceViewBtn');
const boardModeBtn = document.getElementById('boardModeBtn');
const tabletModeBtn = document.getElementById('tabletModeBtn');
const stageJump = document.getElementById('stageJump');
const offlineBanner = document.getElementById('offlineBanner');
const includeAnnotationsPrint = document.getElementById('includeAnnotationsPrint');
const includeHiddenAnswersPrint = document.getElementById('includeHiddenAnswersPrint');
const togglePanelMinimizeBtn = document.getElementById('togglePanelMinimizeBtn');
const panelPositionBtn = document.getElementById('panelPositionBtn');
const panelToolbarButtons = [...document.querySelectorAll('.toolbar-btn')];
const controlPanel = document.getElementById('controlPanel');
const panelContent = document.getElementById('panelContent');

const timerReadout = document.getElementById('timerReadout');
const timerMinutes = document.getElementById('timerMinutes');
const startTimerBtn = document.getElementById('startTimerBtn');
const pauseTimerBtn = document.getElementById('pauseTimerBtn');
const resetTimerBtn = document.getElementById('resetTimerBtn');

const participationHub = document.getElementById('participationHub');
const pollQuestion = document.getElementById('pollQuestion');
const launchPollBtn = document.getElementById('launchPollBtn');
const exitTicketPrompt = document.getElementById('exitTicketPrompt');
const showExitTicketBtn = document.getElementById('showExitTicketBtn');
const coldCallBtn = document.getElementById('coldCallBtn');
const toggleMiniWhiteboardBtn = document.getElementById('toggleMiniWhiteboardBtn');
const pollCard = document.getElementById('pollCard');
const exitTicketCard = document.getElementById('exitTicketCard');
const coldCallCard = document.getElementById('coldCallCard');

const penColors = ['#e11d48', '#2563eb', '#059669', '#d97706', '#111827', '#7c3aed'];
const OFFLINE_SNAPSHOT_KEY = 'lessonPresenter.snapshot.v1';
const students = ['Amina', 'Leo', 'Mia', 'Arjun', 'Sofia', 'Noah', 'Ivy', 'Luca'];

let selectedColor = penColors[0];
let selectedPenSize = Number(penSize.value);
let annotatorEnabled = false;
let lessonSchema = null;

let lesson = { title: 'Sample Lesson', pages: [] };
let currentPageIndex = 0;
let revealedAnswerCountByPage = [];
let pageCanvases = [];
let annotationStateByPage = [];
let resizeObserver;
let timerInterval = null;
let remainingSeconds = 0;
let timerRunning = false;
let miniWhiteboardsVisible = false;

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

lessonJsonInput.value = JSON.stringify(sampleLesson, null, 2);

async function ensureSchemaLoaded() {
  if (lessonSchema) return lessonSchema;
  const response = await fetch('./schema/lesson.schema.json');
  if (!response.ok) throw new Error('Could not load lesson schema file.');
  lessonSchema = await response.json();
  return lessonSchema;
}

function validateBySchema(value, schema, path = 'root') {
  if (schema.type) {
    const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowed.includes(type)) {
      throw new Error(`${path} should be type ${allowed.join(' | ')}, got ${type}.`);
    }
  }

  if (schema.required && typeof value === 'object' && !Array.isArray(value) && value !== null) {
    schema.required.forEach((key) => {
      if (!(key in value)) throw new Error(`${path}.${key} is required by schema.`);
    });
  }

  if (schema.additionalProperties === false && schema.properties && typeof value === 'object' && !Array.isArray(value) && value !== null) {
    Object.keys(value).forEach((key) => {
      if (!(key in schema.properties)) throw new Error(`${path}.${key} is not allowed by strict schema.`);
    });
  }

  if (schema.properties && typeof value === 'object' && !Array.isArray(value) && value !== null) {
    Object.entries(schema.properties).forEach(([key, propSchema]) => {
      if (key in value) validateBySchema(value[key], propSchema, `${path}.${key}`);
    });
  }

  if (schema.items && Array.isArray(value)) {
    value.forEach((item, i) => validateBySchema(item, schema.items, `${path}[${i}]`));
  }
}

function normalizeQuestionEntry(question) {
  if (typeof question === 'string') return { prompt: question, answer: '' };
  if (question && typeof question === 'object') {
    return { prompt: question.prompt || question.question || JSON.stringify(question), answer: question.answer || '' };
  }
  return { prompt: String(question), answer: '' };
}

function lessonSchemaToPresenterSchema(source) {
  const lessonMeta = source.lesson || source;
  const stages = [...(lessonMeta.stages || [])].sort((a, b) => (a.order || 0) - (b.order || 0));

  const pages = stages.map((stageItem, index) => {
    const content = stageItem.content || {};
    const prompts = Array.isArray(content.prompts) ? content.prompts : [];

    const supplementalLines = [
      content.text || '',
      prompts.length ? `Prompts: ${prompts.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' • ')}` : ''
    ].filter(Boolean);

    const questions = Array.isArray(content.questions) ? content.questions.map(normalizeQuestionEntry) : [];
    const answerItems = Array.isArray(stageItem.answers?.items) ? stageItem.answers.items : [];
    const answersByIndex = answerItems.map((item) => {
      const alternatives = Array.isArray(item.alternatives) && item.alternatives.length ? ` (alts: ${item.alternatives.join(', ')})` : '';
      const notes = item.notes ? ` — ${item.notes}` : '';
      return `${item.answer || ''}${alternatives}${notes}`.trim();
    });

    if (!questions.length && answersByIndex.length) {
      answersByIndex.forEach((ans, i) => questions.push({ prompt: `Item ${i + 1}`, answer: ans }));
    } else {
      questions.forEach((q, i) => {
        q.answer = q.answer || answersByIndex[i] || '';
      });
    }

    return {
      stageId: stageItem.id || `stage-${index + 1}`,
      title: `${index + 1}. ${stageItem.name || stageItem.stageType || `Stage ${index + 1}`}`,
      content: supplementalLines.join('\n\n'),
      questions
    };
  });

  return { title: lessonMeta.title || 'Untitled Lesson', pages };
}

function parseLesson(jsonText) {
  const parsed = JSON.parse(jsonText);
  validateBySchema(parsed, lessonSchema);
  return lessonSchemaToPresenterSchema(parsed);
}

function setStatus(message) {
  status.textContent = message;
}

function openPanelOverlay() {
  document.body.classList.add('panel-overlay-open');
}

function closePanelOverlay() {
  document.body.classList.remove('panel-overlay-open');
}

function setActivePanelSection(targetId) {
  const sections = [...document.querySelectorAll('.feature-section')];
  sections.forEach((section) => section.classList.toggle('active', section.id === targetId));
  panelToolbarButtons.forEach((button) => button.classList.toggle('active', button.dataset.target === targetId));
  openPanelOverlay();
}

function togglePanelMinimized() {
  const willMinimize = !document.body.classList.contains('panel-minimized');
  document.body.classList.toggle('panel-minimized', willMinimize);
  if (willMinimize) closePanelOverlay();
  else openPanelOverlay();
  if (togglePanelMinimizeBtn) {
    togglePanelMinimizeBtn.textContent = willMinimize ? 'Expand' : 'Minimize';
    togglePanelMinimizeBtn.title = willMinimize ? 'Expand panel' : 'Minimize panel';
  }
}

function togglePanelDockPosition() {
  const isBottom = !document.body.classList.contains('panel-bottom');
  document.body.classList.toggle('panel-bottom', isBottom);
  if (panelPositionBtn) panelPositionBtn.textContent = isBottom ? 'Dock: Bottom' : 'Dock: Side';
  openPanelOverlay();
}

function createColorSwatches() {
  colorSwatches.innerHTML = '';
  penColors.forEach((color) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'color-swatch';
    swatch.style.background = color;
    if (color === selectedColor) swatch.classList.add('active');
    swatch.addEventListener('click', () => {
      selectedColor = color;
      [...colorSwatches.children].forEach((c) => c.classList.remove('active'));
      swatch.classList.add('active');
    });
    colorSwatches.appendChild(swatch);
  });
}

function redrawCanvas(pageIndex) {
  const canvas = pageCanvases[pageIndex];
  const pageState = annotationStateByPage[pageIndex];
  if (!canvas || !pageState) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  pageState.strokes.forEach((stroke) => {
    if (!stroke.points.length) return;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    stroke.points.slice(1).forEach((pt) => ctx.lineTo(pt.x, pt.y));
    ctx.stroke();
    ctx.closePath();
  });
}

function resizeCanvasToParent(canvas, pageIndex) {
  const parentRect = canvas.parentElement.getBoundingClientRect();
  canvas.width = parentRect.width;
  canvas.height = parentRect.height;
  redrawCanvas(pageIndex);
}

function attachDrawingEvents(canvas, pageIndex) {
  let drawing = false;
  let activeStroke = null;

  const getPos = (event) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  canvas.addEventListener('pointerdown', (event) => {
    if (!annotatorEnabled || !canvas.classList.contains('active')) return;
    drawing = true;
    activeStroke = { color: selectedColor, size: selectedPenSize, points: [getPos(event)] };
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!drawing || !activeStroke) return;
    activeStroke.points.push(getPos(event));
    const pageState = annotationStateByPage[pageIndex];
    const preview = [...pageState.strokes, activeStroke];
    const original = pageState.strokes;
    pageState.strokes = preview;
    redrawCanvas(pageIndex);
    pageState.strokes = original;
  });

  ['pointerup', 'pointerleave', 'pointercancel'].forEach((type) => {
    canvas.addEventListener(type, () => {
      if (drawing && activeStroke && activeStroke.points.length > 1) {
        const pageState = annotationStateByPage[pageIndex];
        pageState.strokes.push(activeStroke);
        pageState.redoStack = [];
        redrawCanvas(pageIndex);
        persistSnapshot();
      }
      drawing = false;
      activeStroke = null;
    });
  });
}

function getCurrentPageElement(container = teacherStage) {
  return container.querySelector(`.page[data-page-index="${currentPageIndex}"]`);
}

function enableDragAndResize(container) {
  const handle = document.createElement('div');
  handle.className = 'resize-handle';
  container.appendChild(handle);

  let drag = null;
  container.addEventListener('pointerdown', (event) => {
    if (event.target === handle) return;
    const rect = container.getBoundingClientRect();
    const parentRect = container.parentElement.getBoundingClientRect();
    drag = {
      mode: 'move',
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      parentRect
    };
    container.setPointerCapture(event.pointerId);
  });

  handle.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    const rect = container.getBoundingClientRect();
    drag = { mode: 'resize', startX: event.clientX, startY: event.clientY, width: rect.width, height: rect.height };
    container.setPointerCapture(event.pointerId);
  });

  container.addEventListener('pointermove', (event) => {
    if (!drag) return;
    if (drag.mode === 'move') {
      const left = Math.max(0, event.clientX - drag.parentRect.left - drag.offsetX);
      const top = Math.max(0, event.clientY - drag.parentRect.top - drag.offsetY);
      container.style.left = `${left}px`;
      container.style.top = `${top}px`;
    } else {
      const width = Math.max(80, drag.width + (event.clientX - drag.startX));
      const height = Math.max(80, drag.height + (event.clientY - drag.startY));
      container.style.width = `${width}px`;
      container.style.height = `${height}px`;
    }
  });

  container.addEventListener('pointerup', () => {
    drag = null;
    persistSnapshot();
  });
}

function pasteImageIntoCurrentPage(file) {
  const page = getCurrentPageElement();
  if (!page) return;
  const imageArea = page.querySelector('.pasted-images');
  if (!imageArea) return;

  const reader = new FileReader();
  reader.onload = () => {
    const item = document.createElement('div');
    item.className = 'pasted-image-item';
    item.style.left = '10px';
    item.style.top = '10px';
    item.style.width = '220px';
    item.style.height = '160px';

    const img = document.createElement('img');
    img.src = reader.result;
    img.alt = 'Pasted lesson visual';
    img.className = 'pasted-image';

    item.appendChild(img);
    imageArea.appendChild(item);
    enableDragAndResize(item);
    setStatus('Image pasted into current page. Drag to move; handle to resize.');
    persistSnapshot();
  };
  reader.readAsDataURL(file);
}

function onPaste(event) {
  const activeTag = document.activeElement?.tagName;
  if (activeTag === 'TEXTAREA' || activeTag === 'INPUT') return;
  const clipboardItems = event.clipboardData?.items || [];
  const imageItem = [...clipboardItems].find((item) => item.type.startsWith('image/'));
  if (!imageItem) return;
  const imageFile = imageItem.getAsFile();
  if (!imageFile) return;
  event.preventDefault();
  pasteImageIntoCurrentPage(imageFile);
}

function createPageElement(page, pageIndex, mode = 'teacher') {
  const pageEl = document.createElement('article');
  pageEl.className = 'page';
  pageEl.dataset.pageIndex = pageIndex;

  const title = document.createElement('h2');
  title.className = 'page-title';
  title.textContent = page.title || `Page ${pageIndex + 1}`;

  const content = document.createElement('p');
  content.className = 'page-content';
  content.textContent = page.content || '';

  const pasteHint = document.createElement('p');
  pasteHint.className = 'paste-hint';
  pasteHint.textContent = 'Tip: click page and use Ctrl/Cmd + V to paste images.';

  const pastedImages = document.createElement('div');
  pastedImages.className = 'pasted-images';

  pageEl.append(title, content);

  if (mode === 'teacher') {
    pageEl.append(pasteHint, pastedImages);
  }

  page.questions.forEach((q, questionIndex) => {
    const qEl = document.createElement('div');
    qEl.className = 'question';
    const prompt = document.createElement('div');
    prompt.textContent = `${questionIndex + 1}. ${q.prompt}`;
    const answer = document.createElement('div');
    answer.className = mode === 'teacher' ? 'answer hidden' : 'answer audience-answer';
    answer.textContent = `Answer: ${q.answer || '—'}`;
    qEl.append(prompt, answer);
    pageEl.appendChild(qEl);
  });

  if (mode === 'teacher' && miniWhiteboardsVisible) {
    const miniBoards = document.createElement('div');
    miniBoards.className = 'mini-whiteboards';
    students.slice(0, 4).forEach((student) => {
      const card = document.createElement('div');
      card.className = 'mini-board-card';
      card.innerHTML = `<strong>${student}</strong><p>Tap for mini-board response</p>`;
      miniBoards.appendChild(card);
    });
    pageEl.appendChild(miniBoards);
  }

  return pageEl;
}

function buildPages() {
  if (!teacherStage || !audienceStage) {
    throw new Error('Delivery workspace is missing stage containers (#teacherStage / #audienceStage). Please refresh to load the latest app shell.');
  }
  teacherStage.innerHTML = '';
  audienceStage.innerHTML = '';
  pageCanvases = [];
  annotationStateByPage = lesson.pages.map(() => ({ strokes: [], redoStack: [] }));

  lesson.pages.forEach((page, pageIndex) => {
    const teacherPage = createPageElement(page, pageIndex, 'teacher');
    const audiencePage = createPageElement(page, pageIndex, 'audience');

    const canvas = document.createElement('canvas');
    canvas.className = 'annotator-layer';
    teacherPage.appendChild(canvas);

    teacherStage.appendChild(teacherPage);
    audienceStage.appendChild(audiencePage);

    resizeCanvasToParent(canvas, pageIndex);
    attachDrawingEvents(canvas, pageIndex);
    pageCanvases.push(canvas);
  });

  if (resizeObserver) resizeObserver.disconnect();
  resizeObserver = new ResizeObserver(() => pageCanvases.forEach((canvas, i) => resizeCanvasToParent(canvas, i)));
  resizeObserver.observe(teacherStage);

  buildStageJumpOptions();
}

function buildStageJumpOptions() {
  if (!stageJump) return;
  stageJump.innerHTML = '';
  lesson.pages.forEach((page, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = page.title;
    stageJump.appendChild(option);
  });
  stageJump.value = String(currentPageIndex);
}

function showPage(index) {
  if (!teacherStage || !audienceStage) return;
  const teacherPages = [...teacherStage.querySelectorAll('.page')];
  const audiencePages = [...audienceStage.querySelectorAll('.page')];
  teacherPages.forEach((pageItem, i) => {
    pageItem.style.display = i === index ? 'block' : 'none';
  });
  audiencePages.forEach((pageItem, i) => {
    pageItem.style.display = i === index ? 'block' : 'none';
  });

  pageCanvases.forEach((canvas, i) => {
    canvas.classList.toggle('active', i === index && annotatorEnabled);
  });

  if (stageJump) stageJump.value = String(index);
  setStatus(`Stage ${index + 1}/${lesson.pages.length} • ${lesson.pages[index].title || ''}`);
}

function revealNextAnswer() {
  const activeTeacherPage = getCurrentPageElement(teacherStage);
  const activeAudiencePage = getCurrentPageElement(audienceStage);
  if (!activeTeacherPage || !activeAudiencePage) return;

  const teacherAnswers = [...activeTeacherPage.querySelectorAll('.answer')];
  const audienceAnswers = [...activeAudiencePage.querySelectorAll('.answer')];
  const shownCount = revealedAnswerCountByPage[currentPageIndex] || 0;
  if (shownCount >= teacherAnswers.length) {
    setStatus('All answers on this stage are already shown.');
    return;
  }

  teacherAnswers[shownCount].classList.remove('hidden');
  audienceAnswers[shownCount].classList.remove('audience-answer');
  revealedAnswerCountByPage[currentPageIndex] = shownCount + 1;
  persistSnapshot();
}

function initLesson(parsedLesson) {
  lesson = parsedLesson;
  currentPageIndex = 0;
  revealedAnswerCountByPage = lesson.pages.map(() => 0);
  buildPages();
  showPage(currentPageIndex);
  persistSnapshot();
}

function undoStroke() {
  const pageState = annotationStateByPage[currentPageIndex];
  if (!pageState || !pageState.strokes.length) return;
  pageState.redoStack.push(pageState.strokes.pop());
  redrawCanvas(currentPageIndex);
  persistSnapshot();
}

function redoStroke() {
  const pageState = annotationStateByPage[currentPageIndex];
  if (!pageState || !pageState.redoStack.length) return;
  pageState.strokes.push(pageState.redoStack.pop());
  redrawCanvas(currentPageIndex);
  persistSnapshot();
}

function setAudienceMode(enabled) {
  document.body.classList.toggle('audience-mode', enabled);
  document.body.classList.toggle('teacher-mode', !enabled);
}

function setBoardMode() {
  document.body.classList.add('board-mode');
  document.body.classList.remove('tablet-mode');
}

function setTabletMode() {
  document.body.classList.add('tablet-mode');
  document.body.classList.remove('board-mode');
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function renderTimer() {
  timerReadout.textContent = formatTime(remainingSeconds);
  timerReadout.classList.toggle('timer-warning', remainingSeconds <= 10 && timerRunning);
}

function startTimer() {
  const mins = Math.max(1, Number(timerMinutes.value) || 1);
  remainingSeconds = mins * 60;
  timerRunning = true;
  if (timerInterval) clearInterval(timerInterval);
  renderTimer();
  timerInterval = window.setInterval(() => {
    if (!timerRunning) return;
    remainingSeconds = Math.max(0, remainingSeconds - 1);
    renderTimer();
    if (remainingSeconds === 0) {
      timerRunning = false;
      setStatus('Timer complete.');
    }
  }, 1000);
}

function pauseTimer() {
  timerRunning = false;
}

function resetTimer() {
  timerRunning = false;
  remainingSeconds = (Math.max(1, Number(timerMinutes.value) || 1)) * 60;
  renderTimer();
}

function launchPoll() {
  const question = pollQuestion.value.trim() || 'Quick check: confidence level right now?';
  participationHub.hidden = false;
  pollCard.hidden = false;
  pollCard.innerHTML = `<h4>Poll</h4><p>${question}</p><p><strong>Choices:</strong> ✅ Ready / 🤔 Need one more example / ❓ Confused</p>`;
}

function showExitTicket() {
  const prompt = exitTicketPrompt.value.trim() || 'Exit ticket: What is one idea you can explain now?';
  participationHub.hidden = false;
  exitTicketCard.hidden = false;
  exitTicketCard.innerHTML = `<h4>Exit Ticket</h4><p>${prompt}</p>`;
}

function coldCallStudent() {
  const picked = students[Math.floor(Math.random() * students.length)];
  participationHub.hidden = false;
  coldCallCard.hidden = false;
  coldCallCard.innerHTML = `<h4>Cold-call</h4><p>${picked}, please share your thinking.</p>`;
}

function toggleMiniWhiteboards() {
  miniWhiteboardsVisible = !miniWhiteboardsVisible;
  buildPages();
  showPage(currentPageIndex);
}

function persistSnapshot() {
  const snapshot = {
    lesson,
    currentPageIndex,
    revealedAnswerCountByPage,
    annotationStateByPage,
    lessonJson: lessonJsonInput.value
  };
  localStorage.setItem(OFFLINE_SNAPSHOT_KEY, JSON.stringify(snapshot));
}

function restoreSnapshotIfAvailable() {
  const raw = localStorage.getItem(OFFLINE_SNAPSHOT_KEY);
  if (!raw) return false;

  try {
    const saved = JSON.parse(raw);
    if (!saved.lesson || !Array.isArray(saved.lesson.pages)) return false;

    lesson = saved.lesson;
    lessonJsonInput.value = saved.lessonJson || lessonJsonInput.value;
    currentPageIndex = Math.min(saved.currentPageIndex || 0, Math.max(0, lesson.pages.length - 1));
    revealedAnswerCountByPage = Array.isArray(saved.revealedAnswerCountByPage)
      ? saved.revealedAnswerCountByPage
      : lesson.pages.map(() => 0);

    buildPages();
    if (Array.isArray(saved.annotationStateByPage) && saved.annotationStateByPage.length === lesson.pages.length) {
      annotationStateByPage = saved.annotationStateByPage;
      pageCanvases.forEach((_, index) => redrawCanvas(index));
    }

    showPage(currentPageIndex);
    setStatus('Restored previous session from offline snapshot.');
    return true;
  } catch (error) {
    setStatus(`Failed to restore offline snapshot: ${error.message}`);
    return false;
  }
}

function syncOfflineBanner() {
  const isOffline = !navigator.onLine;
  offlineBanner.hidden = !isOffline;
  if (isOffline) setStatus('Offline: working from local state.');
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./service-worker.js').catch(() => {
    setStatus('Service worker registration failed; offline cache unavailable.');
  });
}

function exportForPrint() {
  const teacherPages = [...teacherStage.querySelectorAll('.page')];
  const previousDisplay = teacherPages.map((pageItem) => pageItem.style.display);
  const previousAnnotator = teacherPages.map((pageItem) => pageItem.classList.contains('hide-annotation-on-print'));

  teacherPages.forEach((pageItem) => {
    pageItem.style.display = 'block';
    if (includeHiddenAnswersPrint.checked) {
      pageItem.querySelectorAll('.answer').forEach((answer) => answer.classList.remove('hidden'));
    }
    if (!includeAnnotationsPrint.checked) {
      pageItem.classList.add('hide-annotation-on-print');
    }
  });

  setTimeout(() => {
    window.print();
    teacherPages.forEach((pageItem, index) => {
      pageItem.style.display = previousDisplay[index];
      if (!previousAnnotator[index]) pageItem.classList.remove('hide-annotation-on-print');
    });
    showPage(currentPageIndex);
  }, 50);
}

loadLessonBtn.addEventListener('click', async () => {
  try {
    await ensureSchemaLoaded();
    const parsed = parseLesson(lessonJsonInput.value);
    if (!parsed.pages.length) {
      setStatus('Lesson must include at least one stage/page.');
      return;
    }
    initLesson(parsed);
  } catch (error) {
    setStatus(`Could not parse lesson JSON: ${error.message}`);
  }
});

nextBtn.addEventListener('click', () => {
  if (currentPageIndex < lesson.pages.length - 1) {
    currentPageIndex += 1;
    showPage(currentPageIndex);
    persistSnapshot();
  }
});

prevBtn.addEventListener('click', () => {
  if (currentPageIndex > 0) {
    currentPageIndex -= 1;
    showPage(currentPageIndex);
    persistSnapshot();
  }
});

if (stageJump) {
  stageJump.addEventListener('change', () => {
    currentPageIndex = Number(stageJump.value);
    showPage(currentPageIndex);
    persistSnapshot();
  });
}

revealAnswerBtn.addEventListener('click', revealNextAnswer);

penSize.addEventListener('input', () => {
  selectedPenSize = Number(penSize.value);
  penSizeValue.textContent = `${selectedPenSize} px`;
});

toggleAnnotatorBtn.addEventListener('click', () => {
  annotatorEnabled = !annotatorEnabled;
  toggleAnnotatorBtn.textContent = annotatorEnabled ? 'Disable Annotator' : 'Enable Annotator';
  pageCanvases.forEach((canvas, index) => {
    canvas.classList.toggle('active', index === currentPageIndex && annotatorEnabled);
  });
});

undoAnnotationBtn.addEventListener('click', undoStroke);
redoAnnotationBtn.addEventListener('click', redoStroke);

clearPageAnnotationBtn.addEventListener('click', () => {
  const pageState = annotationStateByPage[currentPageIndex];
  if (!pageState) return;
  pageState.strokes = [];
  pageState.redoStack = [];
  redrawCanvas(currentPageIndex);
  persistSnapshot();
});

presenterViewBtn.addEventListener('click', () => setAudienceMode(false));
audienceViewBtn.addEventListener('click', () => setAudienceMode(true));
boardModeBtn.addEventListener('click', setBoardMode);
tabletModeBtn.addEventListener('click', setTabletMode);

startTimerBtn.addEventListener('click', startTimer);
pauseTimerBtn.addEventListener('click', pauseTimer);
resetTimerBtn.addEventListener('click', resetTimer);

launchPollBtn.addEventListener('click', launchPoll);
showExitTicketBtn.addEventListener('click', showExitTicket);
coldCallBtn.addEventListener('click', coldCallStudent);
toggleMiniWhiteboardBtn.addEventListener('click', toggleMiniWhiteboards);

exportPdfBtn.addEventListener('click', exportForPrint);

panelToolbarButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (document.body.classList.contains('panel-minimized')) {
      togglePanelMinimized();
    }
    const targetId = button.dataset.target;
    if (targetId) setActivePanelSection(targetId);
  });
});

if (togglePanelMinimizeBtn) togglePanelMinimizeBtn.addEventListener('click', togglePanelMinimized);
if (panelPositionBtn) panelPositionBtn.addEventListener('click', togglePanelDockPosition);

teacherStage.addEventListener('click', () => teacherStage.focus());
document.addEventListener('paste', onPaste);

window.addEventListener('online', syncOfflineBanner);
window.addEventListener('offline', syncOfflineBanner);

document.addEventListener('click', (event) => {
  if (!controlPanel || !panelContent) return;
  if (document.body.classList.contains('panel-minimized')) return;
  const clickedInside = controlPanel.contains(event.target);
  if (!clickedInside) closePanelOverlay();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowRight') nextBtn.click();
  if (event.key === 'ArrowLeft') prevBtn.click();
  if (event.key.toLowerCase() === 'a') toggleAnnotatorBtn.click();
});

(async () => {
  createColorSwatches();
  setActivePanelSection('section-lesson');
  openPanelOverlay();
  registerServiceWorker();
  syncOfflineBanner();

  renderTimer();
  resetTimer();

  if (restoreSnapshotIfAvailable()) return;

  try {
    await ensureSchemaLoaded();
    initLesson(parseLesson(lessonJsonInput.value));
  } catch (error) {
    setStatus(`Startup validation failed: ${error.message}`);
  }
})();

const lessonJsonInput = document.getElementById('lessonJson');
const loadLessonBtn = document.getElementById('loadLessonBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const revealAnswerBtn = document.getElementById('revealAnswerBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const stage = document.getElementById('stage');
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

const penColors = ['#e11d48', '#2563eb', '#059669', '#d97706', '#111827', '#7c3aed'];
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

const sampleLesson = {
  lesson: {
    id: 'sample-lesson',
    title: 'Math Warm-up',
    unit: 'Mental Math',
    lessonType: 'Practice',
    level: 'A2',
    ageGroup: '12-14',
    durationMinutes: 45,
    theme: 'Number confidence',
    mainAim: 'Improve mental arithmetic fluency.',
    subsidiaryAims: ['Build confidence', 'Practice explanation skills'],
    prerequisiteKnowledge: ['Basic operations'],
    assumptions: ['Students can add/subtract 2-digit numbers'],
    materials: [{ id: 'm1', type: 'worksheet', title: 'Warm-up Sheet', source: 'Teacher', notes: 'Optional' }],
    languageFocus: {
      targetLanguage: 'Math language',
      functions: ['Explain reasoning'],
      forms: ['because', 'therefore'],
      pronunciation: [],
      punctuation: []
    },
    writingTask: {
      genre: 'Short response',
      audience: 'Teacher',
      prompt: 'Explain one solution path.',
      wordCount: { min: 20, max: 60 },
      successCriteria: ['Clear steps']
    },
    stages: [
      {
        id: 's1',
        order: 1,
        name: 'Arithmetic',
        stageType: 'practice',
        durationMinutes: 10,
        aim: 'Solve quickly',
        interaction: 'pairs',
        procedure: ['Try each problem mentally'],
        instructions: ['No calculators'],
        content: {
          text: 'Solve each problem mentally before revealing answers.',
          questions: ['12 + 15 = ?', '9 × 6 = ?'],
          items: [],
          prompts: ['Discuss your strategy.'],
          examples: []
        },
        answers: {
          type: 'direct',
          items: [
            { questionId: 'q1', answer: '27', alternatives: [], notes: '' },
            { questionId: 'q2', answer: '54', alternatives: [], notes: '' }
          ]
        },
        teacherNotes: [],
        anticipatedProblems: [{ problem: 'Rushing', solution: 'Ask for explanation' }],
        boardPlan: [],
        timingNotes: []
      }
    ],
    assessment: { criteria: [], peerChecklist: [], teacherFeedbackFocus: [] },
    homework: { assigned: false, task: '', instructions: [] },
    metadata: { author: 'System', createdAt: '', updatedAt: '', version: '1.0.0' }
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

function normalizeQuestionEntry(question) {
  if (typeof question === 'string') return { prompt: question, answer: '' };
  if (question && typeof question === 'object') {
    return { prompt: question.prompt || question.question || JSON.stringify(question), answer: question.answer || '' };
  }
  return { prompt: String(question), answer: '' };
}

function lessonSchemaToPresenterSchema(source) {
  const lessonMeta = source.lesson;
  const stages = [...lessonMeta.stages].sort((a, b) => (a.order || 0) - (b.order || 0));

  const pages = stages.map((stage, index) => {
    const content = stage.content || {};
    const prompts = Array.isArray(content.prompts) ? content.prompts : [];
    const examples = Array.isArray(content.examples) ? content.examples : [];
    const items = Array.isArray(content.items) ? content.items : [];

    const supplementalLines = [
      content.text || '',
      prompts.length ? `Prompts: ${prompts.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' • ')}` : '',
      examples.length ? `Examples: ${examples.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' • ')}` : '',
      items.length ? `Items: ${items.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' • ')}` : ''
    ].filter(Boolean);

    const questions = Array.isArray(content.questions) ? content.questions.map(normalizeQuestionEntry) : [];
    const answerItems = Array.isArray(stage.answers?.items) ? stage.answers.items : [];
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
      title: `${index + 1}. ${stage.name || stage.stageType || `Stage ${index + 1}`}`,
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

function redrawCanvas(pageIndex) {
  const canvas = pageCanvases[pageIndex];
  const state = annotationStateByPage[pageIndex];
  if (!canvas || !state) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  state.strokes.forEach((stroke) => {
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
    const state = annotationStateByPage[pageIndex];
    const preview = [...state.strokes, activeStroke];
    const original = state.strokes;
    state.strokes = preview;
    redrawCanvas(pageIndex);
    state.strokes = original;
  });

  ['pointerup', 'pointerleave', 'pointercancel'].forEach((type) => {
    canvas.addEventListener(type, () => {
      if (drawing && activeStroke && activeStroke.points.length > 1) {
        const state = annotationStateByPage[pageIndex];
        state.strokes.push(activeStroke);
        state.redoStack = [];
        redrawCanvas(pageIndex);
      }
      drawing = false;
      activeStroke = null;
    });
  });
}

function getCurrentPageElement() {
  return stage.querySelector(`.page[data-page-index="${currentPageIndex}"]`);
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

function buildPages() {
  stage.innerHTML = '';
  pageCanvases = [];
  annotationStateByPage = lesson.pages.map(() => ({ strokes: [], redoStack: [] }));

  lesson.pages.forEach((page, pageIndex) => {
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

    pageEl.append(title, content, pasteHint, pastedImages);

    page.questions.forEach((q, questionIndex) => {
      const qEl = document.createElement('div');
      qEl.className = 'question';
      const prompt = document.createElement('div');
      prompt.textContent = `${questionIndex + 1}. ${q.prompt}`;
      const answer = document.createElement('div');
      answer.className = 'answer hidden';
      answer.textContent = `Answer: ${q.answer || '—'}`;
      qEl.append(prompt, answer);
      pageEl.appendChild(qEl);
    });

    const canvas = document.createElement('canvas');
    canvas.className = 'annotator-layer';
    pageEl.appendChild(canvas);

    stage.appendChild(pageEl);
    resizeCanvasToParent(canvas, pageIndex);
    attachDrawingEvents(canvas, pageIndex);
    pageCanvases.push(canvas);
  });

  if (resizeObserver) resizeObserver.disconnect();
  resizeObserver = new ResizeObserver(() => pageCanvases.forEach((c, i) => resizeCanvasToParent(c, i)));
  resizeObserver.observe(stage);
}

function showPage(index) {
  const pages = [...stage.querySelectorAll('.page')];
  pages.forEach((page, i) => {
    page.style.display = i === index ? 'block' : 'none';
  });
  pageCanvases.forEach((canvas, i) => {
    canvas.classList.toggle('active', i === index && annotatorEnabled);
  });
  setStatus(`Page ${index + 1}/${lesson.pages.length} • ${lesson.pages[index].title || ''}`);
}

function revealNextAnswer() {
  const activePage = getCurrentPageElement();
  if (!activePage) return;
  const answers = [...activePage.querySelectorAll('.answer')];
  const shownCount = revealedAnswerCountByPage[currentPageIndex] || 0;
  if (shownCount >= answers.length) {
    setStatus('All answers on this page are already shown.');
    return;
  }
  answers[shownCount].classList.remove('hidden');
  revealedAnswerCountByPage[currentPageIndex] = shownCount + 1;
}

function initLesson(parsedLesson) {
  lesson = parsedLesson;
  currentPageIndex = 0;
  revealedAnswerCountByPage = lesson.pages.map(() => 0);
  buildPages();
  showPage(currentPageIndex);
}

function undoStroke() {
  const state = annotationStateByPage[currentPageIndex];
  if (!state || !state.strokes.length) return;
  state.redoStack.push(state.strokes.pop());
  redrawCanvas(currentPageIndex);
}

function redoStroke() {
  const state = annotationStateByPage[currentPageIndex];
  if (!state || !state.redoStack.length) return;
  state.strokes.push(state.redoStack.pop());
  redrawCanvas(currentPageIndex);
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
  }
});

prevBtn.addEventListener('click', () => {
  if (currentPageIndex > 0) {
    currentPageIndex -= 1;
    showPage(currentPageIndex);
  }
});

revealAnswerBtn.addEventListener('click', revealNextAnswer);

penSize.addEventListener('input', () => {
  selectedPenSize = Number(penSize.value);
  penSizeValue.textContent = `${selectedPenSize} px`;
});

toggleAnnotatorBtn.addEventListener('click', () => {
  annotatorEnabled = !annotatorEnabled;
  toggleAnnotatorBtn.textContent = annotatorEnabled ? 'Disable Annotator' : 'Enable Annotator';
  pageCanvases.forEach((canvas, i) => {
    canvas.classList.toggle('active', i === currentPageIndex && annotatorEnabled);
  });
});

undoAnnotationBtn.addEventListener('click', undoStroke);
redoAnnotationBtn.addEventListener('click', redoStroke);

clearPageAnnotationBtn.addEventListener('click', () => {
  const state = annotationStateByPage[currentPageIndex];
  if (!state) return;
  state.strokes = [];
  state.redoStack = [];
  redrawCanvas(currentPageIndex);
});

presenterViewBtn.addEventListener('click', () => {
  document.body.classList.remove('audience-mode');
});

audienceViewBtn.addEventListener('click', () => {
  document.body.classList.add('audience-mode');
});

exportPdfBtn.addEventListener('click', () => {
  const pages = [...stage.querySelectorAll('.page')];
  const previousDisplay = pages.map((p) => p.style.display);

  pages.forEach((page) => {
    page.style.display = 'block';
    page.querySelectorAll('.answer').forEach((answer) => answer.classList.remove('hidden'));
  });

  setTimeout(() => {
    window.print();
    pages.forEach((page, i) => {
      page.style.display = previousDisplay[i];
    });
    showPage(currentPageIndex);
  }, 50);
});

stage.addEventListener('click', () => stage.focus());
document.addEventListener('paste', onPaste);

document.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowRight') nextBtn.click();
  if (event.key === 'ArrowLeft') prevBtn.click();
  if (event.key.toLowerCase() === 'a') toggleAnnotatorBtn.click();
});

(async () => {
  try {
    await ensureSchemaLoaded();
    createColorSwatches();
    initLesson(parseLesson(lessonJsonInput.value));
  } catch (error) {
    createColorSwatches();
    setStatus(`Startup validation failed: ${error.message}`);
  }
})();

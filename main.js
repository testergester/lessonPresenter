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

const penColors = ['#e11d48', '#2563eb', '#059669', '#d97706', '#111827', '#7c3aed'];
let selectedColor = penColors[0];
let selectedPenSize = Number(penSize.value);
let annotatorEnabled = false;

let lesson = { title: 'Sample Lesson', pages: [] };
let currentPageIndex = 0;
let revealedAnswerCountByPage = [];
let pageCanvases = [];

const sampleLesson = {
  lesson: {
    id: 'sample-1',
    title: 'Math Warm-up',
    unit: 'Mental Math',
    stages: [
      {
        id: 'stage-1',
        order: 1,
        name: 'Arithmetic',
        stageType: 'practice',
        durationMinutes: 10,
        content: {
          text: 'Solve each problem mentally before revealing answers.',
          questions: ['12 + 15 = ?', '9 × 6 = ?'],
          items: [],
          prompts: ['Try without writing first.'],
          examples: []
        },
        answers: {
          type: 'direct',
          items: [
            { questionId: 'q1', answer: '27', alternatives: [], notes: '' },
            { questionId: 'q2', answer: '54', alternatives: [], notes: '' }
          ]
        }
      },
      {
        id: 'stage-2',
        order: 2,
        name: 'Fractions',
        stageType: 'guided',
        durationMinutes: 10,
        content: {
          text: 'Simplify each fraction.',
          questions: ['8/12', '15/25'],
          items: [],
          prompts: [],
          examples: ['6/9 → 2/3']
        },
        answers: {
          type: 'direct',
          items: [
            { questionId: 'q1', answer: '2/3', alternatives: [], notes: '' },
            { questionId: 'q2', answer: '3/5', alternatives: [], notes: '' }
          ]
        }
      }
    ]
  }
};

lessonJsonInput.value = JSON.stringify(sampleLesson, null, 2);

function createColorSwatches() {
  colorSwatches.innerHTML = '';
  penColors.forEach((color) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'color-swatch';
    swatch.style.background = color;
    swatch.title = color;
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
    return {
      prompt: question.prompt || question.question || JSON.stringify(question),
      answer: question.answer || ''
    };
  }
  return { prompt: String(question), answer: '' };
}

function resolveLessonRoot(source) {
  if (!source || typeof source !== 'object') {
    throw new Error('Invalid schema: expected a JSON object containing lesson stages.');
  }

  if (source.lesson && typeof source.lesson === 'object') {
    return source.lesson;
  }

  if (Array.isArray(source.stages)) {
    return source;
  }

  throw new Error('Invalid schema: expected either { lesson: { stages: [] } } or { stages: [] }.');
}

function lessonSchemaToPresenterSchema(source) {
  const lessonMeta = resolveLessonRoot(source);
  if (!Array.isArray(lessonMeta.stages)) {
    throw new Error('Invalid schema: lesson.stages must be an array.');
  }

  const stages = [...lessonMeta.stages].sort((a, b) => (a.order || 0) - (b.order || 0));

  const pages = stages.map((stage, index) => {
    const content = stage.content || {};
    const prompts = Array.isArray(content.prompts) ? content.prompts : [];
    const examples = Array.isArray(content.examples) ? content.examples : [];
    const items = Array.isArray(content.items) ? content.items : [];

    const supplementalLines = [
      content.text || '',
      prompts.length ? `Prompts: ${prompts.join(' • ')}` : '',
      examples.length ? `Examples: ${examples.join(' • ')}` : '',
      items.length ? `Items: ${items.map((i) => (typeof i === 'string' ? i : JSON.stringify(i))).join(' • ')}` : ''
    ].filter(Boolean);

    const questions = Array.isArray(content.questions)
      ? content.questions.map(normalizeQuestionEntry)
      : [];

    const answerItems = Array.isArray(stage.answers?.items) ? stage.answers.items : [];
    const answersByIndex = answerItems.map((item) => {
      if (!item) return '';
      const alternatives = Array.isArray(item.alternatives) && item.alternatives.length
        ? ` (alts: ${item.alternatives.join(', ')})`
        : '';
      const notes = item.notes ? ` — ${item.notes}` : '';
      return `${item.answer || ''}${alternatives}${notes}`.trim();
    });

    if (!questions.length && answersByIndex.length) {
      answersByIndex.forEach((ans, answerIndex) => {
        questions.push({ prompt: `Item ${answerIndex + 1}`, answer: ans });
      });
    } else {
      questions.forEach((q, qIndex) => {
        q.answer = q.answer || answersByIndex[qIndex] || '';
      });
    }

    return {
      title: `${index + 1}. ${stage.name || stage.stageType || `Stage ${index + 1}`}`,
      content: supplementalLines.join('\n\n'),
      questions
    };
  });

  return {
    title: lessonMeta.title || 'Untitled Lesson',
    pages
  };
}

function parseLesson(jsonText) {
  const parsed = JSON.parse(jsonText);
  const converted = lessonSchemaToPresenterSchema(parsed);
  converted.pages.forEach((page, i) => {
    if (!Array.isArray(page.questions)) {
      throw new Error(`Invalid page at index ${i}: questions must be an array.`);
    }
  });
  return converted;
}

function setStatus(message) {
  status.textContent = message;
}

function resizeCanvasToParent(canvas) {
  const parentRect = canvas.parentElement.getBoundingClientRect();
  const snapshot = canvas.toDataURL();
  canvas.width = parentRect.width;
  canvas.height = parentRect.height;

  if (snapshot !== 'data:,') {
    const img = new Image();
    img.onload = () => canvas.getContext('2d').drawImage(img, 0, 0);
    img.src = snapshot;
  }
}

function attachDrawingEvents(canvas) {
  const ctx = canvas.getContext('2d');
  let drawing = false;

  const getPos = (event) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  };

  canvas.addEventListener('pointerdown', (event) => {
    if (!annotatorEnabled || !canvas.classList.contains('active')) return;
    drawing = true;
    const { x, y } = getPos(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!drawing || !annotatorEnabled || !canvas.classList.contains('active')) return;
    const { x, y } = getPos(event);
    ctx.strokeStyle = selectedColor;
    ctx.lineWidth = selectedPenSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineTo(x, y);
    ctx.stroke();
  });

  ['pointerup', 'pointerleave', 'pointercancel'].forEach((type) => {
    canvas.addEventListener(type, () => {
      drawing = false;
      ctx.closePath();
    });
  });
}

function getCurrentPageElement() {
  return stage.querySelector(`.page[data-page-index="${currentPageIndex}"]`);
}

function pasteImageIntoCurrentPage(file) {
  const page = getCurrentPageElement();
  if (!page) return;
  const imageArea = page.querySelector('.pasted-images');
  if (!imageArea) return;

  const reader = new FileReader();
  reader.onload = () => {
    const img = document.createElement('img');
    img.src = reader.result;
    img.alt = 'Pasted lesson visual';
    img.className = 'pasted-image';
    imageArea.appendChild(img);
    setStatus('Image pasted into current page.');
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
    pasteHint.textContent = 'Tip: click the page and press Ctrl/Cmd + V to paste an image onto this page.';

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
    resizeCanvasToParent(canvas);
    attachDrawingEvents(canvas);
    pageCanvases.push(canvas);
  });

  window.addEventListener('resize', () => pageCanvases.forEach(resizeCanvasToParent), { once: true });
}

function showPage(index) {
  const pages = [...stage.querySelectorAll('.page')];
  pages.forEach((page, i) => {
    page.style.display = i === index ? 'block' : 'none';
  });

  pageCanvases.forEach((canvas, i) => {
    canvas.classList.toggle('active', i === index && annotatorEnabled);
  });

  const page = lesson.pages[index];
  setStatus(`Page ${index + 1}/${lesson.pages.length} • ${page.title || ''}`);
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
  setStatus(`Revealed answer ${shownCount + 1} of ${answers.length} on this page.`);
}

function initLesson(parsedLesson) {
  lesson = parsedLesson;
  currentPageIndex = 0;
  revealedAnswerCountByPage = lesson.pages.map(() => 0);

  buildPages();
  showPage(currentPageIndex);
}

loadLessonBtn.addEventListener('click', () => {
  try {
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
  if (currentPageIndex >= lesson.pages.length - 1) {
    setStatus('You are already on the last page.');
    return;
  }
  currentPageIndex += 1;
  showPage(currentPageIndex);
});

prevBtn.addEventListener('click', () => {
  if (currentPageIndex <= 0) {
    setStatus('You are already on the first page.');
    return;
  }
  currentPageIndex -= 1;
  showPage(currentPageIndex);
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

clearPageAnnotationBtn.addEventListener('click', () => {
  const canvas = pageCanvases[currentPageIndex];
  if (!canvas) return;
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
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

stage.addEventListener('click', () => {
  stage.focus();
});
document.addEventListener('paste', onPaste);

createColorSwatches();
initLesson(lessonSchemaToPresenterSchema(sampleLesson));

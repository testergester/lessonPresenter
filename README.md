# Lesson Presenter

A local-first classroom workspace for presenting lessons from JSON. No build step or account is required.

## Run

```bash
python3 -m http.server 4173
```

Open [localhost:4173](http://localhost:4173). A sample lesson opens automatically; saved sessions restore on the same browser and origin.

## Teaching flow

1. **Import lesson**: choose a JSON file or paste a lesson plan. Invalid plans leave the current lesson open.
2. **Follow the lesson flow**: select a stage in the outline, or use the previous/next controls. Teacher guidance, planned timing, and the next stage stay alongside the canvas.
3. **Teach**: start the stage timer, reveal answers individually, or annotate. Changing stage resets the timer to that stage’s planned duration. Pause and resume preserve remaining time.
4. **Present**: student preview hides teacher guidance and expands the student canvas. Present hides teacher guidance and provides navigation and a visible exit button. Escape returns to the workspace.
5. **Wrap up**: use polls, student selection, response boards, or exit tickets, then print all stages or save a PDF.

Annotations, pasted images, revealed answers, response boards, the roster, and stage position save in browser storage. Annotation coordinates scale with the canvas. Poll tallies and exit-ticket text are temporary. Participation tools operate on this device; there is no remote student connection. Storage errors show a message without interrupting the lesson.

## Lesson format

Both wrapped and root-level lessons are accepted:

```json
{
  "lesson": {
    "title": "First impressions",
    "level": "C2",
    "lessonType": "Writing",
    "mainAim": "Describe the difference between appearance and reality.",
    "stages": [
      {
        "name": "Discuss in pairs",
        "durationMinutes": 8,
        "instructions": ["Share an example of a misleading first impression."],
        "content": {
          "questions": [{"id": "q1", "prompt": "What was the reality?"}],
          "examples": ["An elegant hotel that was dirty and noisy."]
        },
        "answers": {
          "items": [{"questionId": "q1", "answer": "Any relevant example is acceptable."}]
        },
        "teacherNotes": ["Keep feedback brief."]
      }
    ]
  }
}
```

Only a nonempty `stages` array is required. Known fields are type-checked using the lesson schema; optional metadata can be omitted. Stages sort by `order` when supplied. Questions may be strings or objects. Answer IDs match question IDs, with positional fallback for string questions. Teacher notes, procedures, pacing, and anticipated problems are private guidance. Instructions, questions, examples, and content items appear on the student canvas.

## Shortcuts

- Left / right arrows: previous / next stage
- R: reveal the next answer
- A: toggle the annotation pen
- Escape: exit presentation, close tools, or leave drawing mode
- Ctrl / Cmd + V: paste an image onto a stage

Presentation shortcuts pause while typing or using a dialog. Classroom tools stay docked below the board, and the annotation pen works in both teacher and student views. All drawing tools have labeled buttons. Annotation clearing can be undone with the redo control, one stroke at a time.

## Offline and print

The service worker caches app assets for offline use after the first successful load. Online requests refresh cached assets. Local lesson state is stored separately in browser storage.

Print/export includes every stage. Options control whether answers and annotations appear. Closing the print dialog restores the current view and revealed-answer state.

## Checks

```bash
node --check main.js
node --test tests/main.test.cjs
```

The tests cover lesson normalization and validation, answer ID matching, teacher metadata retention, timer pause/resume and elapsed-time behavior, and storage failures.

## UX references

The workspace applies patterns researched through Context7 from [tldraw’s contextual style panel](https://github.com/tldraw/tldraw/tree/main/apps/examples/src/examples/ui/contextual-style-panel) and [Reveal.js speaker view](https://revealjs.com/speaker-view/): nearby drawing controls, clear stage navigation, private teacher guidance, timing, and upcoming-stage context. Neither framework is needed at runtime.

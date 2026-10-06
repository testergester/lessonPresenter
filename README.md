# Lesson Presenter · Fabric.js edition

A local-first lesson editor with a fixed 1280 × 720 slide canvas, direct text editing, shapes, images, stickers, drawing, and YouTube embeds. Fabric.js 7.4 provides the object editor. Vite bundles the app; JSZip packages editable lessons.

## Run

Requires Node.js 20.19+ or 22.12+ and pnpm.

```bash
pnpm install
pnpm dev
```

Open the URL printed by Vite, usually http://127.0.0.1:5173. No account, backend, or paid SDK license is required.

```bash
pnpm test
pnpm build
pnpm preview
```

Deploy the contents of `dist/` to a static web host. The production build includes an offline service worker with the compiled app assets. Development does not register a service worker.

## Upload a lesson

**Import lesson** supports your existing `.json` lesson plans, pasted JSON, and editable `.json` documents, `.zip` packages, and older `.lesson` packages. Both wrapped (`{"lesson": {...}}`) and root-level plans are accepted. Each stage becomes a fixed 16:9 slide containing independent, editable text objects. Teacher notes, timing, procedures, and anticipated problems remain private guidance outside the slide.

```json
{
  "lesson": {
    "title": "First impressions",
    "stages": [
      {
        "name": "Discuss in pairs",
        "durationMinutes": 8,
        "instructions": ["Share an example of a misleading first impression."],
        "content": {
          "questions": [{"id": "q1", "prompt": "What was the reality?"}]
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

A nonempty `stages` array is required. Known fields are type-checked. Stages sort by `order` when supplied. Questions may be strings or objects; answers match by ID, with positional fallback. Generated content is scaled to fit each slide; unusually long stages should be split into additional slides for readability. Failed format validation leaves the current lesson open.

## Edit and teach

- Double-click text to edit it directly. The property controls below the board change font, size, color, bold, italic, and alignment.
- Select and drag objects to move them. Use handles to resize and rotate. Multi-select with a drag selection; centers snap to the slide center.
- Add text, rectangles, circles, triangles, lines, uploaded images, or emoji stickers using the dock below the board.
- Paste text or images onto the board, drag in an image, or paste a YouTube URL to create a video object. PNG, JPEG, WebP, GIF, and SVG uploads are supported, up to 20 MB per image. GIF images render as canvas images, not animated players.
- Use Duplicate, Delete, and the layer buttons for selected objects. Copy/paste selected objects works through the clipboard where browser permission allows it.
- Undo/redo restores object edits, deletions, and drawings within the current lesson. Downloaded lessons retain their final layout, not edit history.
- Use **＋ Slide** or **Duplicate** in the lesson outline to add stages. Editing a generated title updates the outline label.
- Drag slides in the lesson outline, or use their up/down buttons, to reorder. Hide/Show excludes a slide from student preview, presentation, and PDF without deleting it. Hidden slides and their order are preserved in saved lessons.
- Both the lesson-plan rail on the left and teacher-tools rail on the right preview on hover and close when the pointer leaves. Click a rail to pin it and resize the canvas to fit beside it; click again or use its close button to collapse it. Hover previews remain temporary overlays. On small screens both toggles stay at the top while open panels expand above the workspace. Clicking outside a sidebar closes it, including when pinned. Student preview hides the teacher-tools rail.
- Student preview locks slide objects and hides teacher guidance. You can still annotate with the pen. Presentation uses the same slide scene, with clear navigation and an exit button.
- YouTube players become interactive in student preview or presentation when you click **Play video**. They require internet access and depend on the video's embedding permissions. They do not autoplay.
- Teacher timers follow stage durations and support pause/resume. Poll tallies, exit tickets, roster selection, and response boards operate on this device; there is no remote student connection.

## Save and reopen

**Save lesson** downloads a standard `.json` file containing the complete editable document and embedded images. Open it through **Import lesson** in this app. Double-clicking the file on your computer may open a text editor; it does not launch Lesson Presenter.

For smaller image-heavy files, **Export PDF → Download editable ZIP** downloads a standard `.zip` package containing:

- `lesson.json`: lesson metadata, Fabric slide objects, answer progress, and roster
- `assets/`: uploaded images, deduplicated when reused

Reimporting the package restores editable text, geometry, colors, shapes, images, drawings, and video links. It is independent of the original uploaded image files. An editable document version is recorded so unsupported future versions can be rejected with a useful message.

The working session autosaves to IndexedDB on this browser and origin, including uploaded images, stage position, and response boards. If storage fails, download a JSON or ZIP lesson file. Poll tallies and exit-ticket text are temporary. Timer progress is not saved. The app can convert the earlier HTML app's local snapshot when it exists on the same origin; its original snapshot is kept as a backup. Old image layouts can need adjustment, and the earlier annotation strokes are not migrated automatically.

## Present and export

Edit, student preview, and presentation share one scene. Answer reveal changes visibility without deleting hidden answers from the saved document.

Print / save PDF renders every visible slide with options for answers and annotations. PDF uses a 2560 × 1440 static image of each slide; video objects become a labeled placeholder with the YouTube link. Presentation state is not changed by export. Use the app's Export PDF action rather than the browser's direct Print shortcut to prepare the slide images.

## Shortcuts

- Ctrl / Cmd + S: download editable lesson
- Ctrl / Cmd + Z / Shift + Z: undo / redo
- Ctrl / Cmd + C / V: copy / paste selected objects or clipboard text/images
- Ctrl / Cmd + D: duplicate selected objects
- Delete / Backspace: delete selected objects
- Arrow keys: nudge a selected object; otherwise navigate stages
- Shift + arrow: nudge by 10 pixels
- R: reveal next answer
- A: toggle drawing
- Escape: close lesson outline, exit presentation, or stop drawing

Shortcuts defer to input fields and active text editing.

## Checks

Automated tests cover existing lesson import, metadata and answers, timer behavior, preview/drawing modes, storage failures, canvas scaling, YouTube URL handling, packaged asset validation, deduplication, and editable lesson round trips. Production build validates the bundled Fabric.js integration and generates the offline asset cache.

Canvas rendering uses at least 2× resolution and follows higher-density displays. Built-in stickers are vector shapes; existing built-in emoji stickers upgrade automatically while retaining their placement and size. Uploaded bitmap images retain their original resolution.

## Object animations

Select one or more objects (Shift-click or drag a selection box), open **Animations**, and add **Appear** or **Disappear**. Choose **Together** to animate the selection as one effect, or **One at a time** to create an effect per object in slide layer order (back to front). With One at a time, On click requires a click per object; automatic timing starts the first object as chosen and runs subsequent objects After previous. Delay applies to each object. Choose **On click**, **With previous**, or **After previous**, with an optional delay. Each transition lasts 0.3 seconds. Automatic effects at the start of a sequence run when the slide opens; after an On click effect, following automatic effects run as scheduled until the next On click step.

Effects play in Student preview and Present. Click the board, press Space while the board is focused, or use **Next effect**. Stage navigation remains separate. Student preview also has **Replay effects**. Returning to Teacher restores normal editing visibility. The Animations list lets you drag effects or use up/down buttons to reorder them, and remove effects. Relative start timing follows the new preceding effect; editing undo/redo also covers animation changes. Sequences are included in JSON/ZIP saves and slide duplication. PDF exports are static and show the authored content, subject to the answer and annotation export options.

## Alternate Studio interface

Open `/studio.html` for the presentation editor layout inspired by PPTist: fixed top toolbar, slide thumbnails and organization on the left, and Design / Animations / Teach panels on the right. Top toolbar tools open compact dropdowns directly beneath their buttons. Object properties stay in the right panel; its Animations tab opens the full effect list. Dropdowns close on outside click, Escape, or completion of an insert action. Import and keyboard help retain their dialogs. Panel buttons at the top let you reclaim canvas space.

The original `/index.html` interface remains available. Both entries use the same Fabric editor, lesson JSON/ZIP format and local saved session. The production build includes both HTML entries and caches both for offline use.

Studio image properties include border color, border width (0 removes it), and corner radius (0 gives square corners). New pasted, uploaded and dropped images receive a 2px border and 16px corners. Frames remain editable, support undo/redo, and persist in JSON/ZIP and PDF output. Existing images retain their previous appearance until edited.

In Studio, Board view expands the canvas by hiding the slide list, Compact view adds canvas margins, and Standard view restores the usual panels and margins. Teacher notes sit beneath the canvas, with a centered footer toggle; student preview and presentation hide them.

Studio's top-right controls zoom out, zoom in, or fit the slide to the workspace. Zoom ranges from 25% to 300% relative to the fitted view, in 25% steps. Scroll to reach any part of an enlarged slide. Zoom changes only the view; saved object positions, sizes, presentation and PDF output retain the original slide geometry.

Stage Aim and Keep in Mind in Studio's notes area are editable text fields. Changes autosave to the local session and are included in downloaded JSON/ZIP lessons. Use one line per reminder in Keep in Mind. Notes belong to each slide and remain hidden in student preview and presentation.

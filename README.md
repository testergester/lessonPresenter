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

**Save lesson** downloads a compact standard `.json` file containing the complete editable document and embedded images. Whitespace is omitted; all editable fields are retained. Open it through **Import lesson** in this app. Double-clicking the file on your computer may open a text editor; it does not launch Lesson Presenter.

For smaller image-heavy files, **Export PDF → Download editable ZIP** downloads a standard `.zip` package containing:

- `lesson.json`: lesson metadata, Fabric slide objects, and roster
- `assets/`: uploaded images, deduplicated when reused

Reimporting the package restores editable text, geometry, colors, shapes, images, drawings, and video links. It is independent of the original uploaded image files. An editable document version is recorded so unsupported future versions can be rejected with a useful message.

The app starts with one blank slide on every open or reload. It does not automatically restore the previous lesson, stage, answers, roster or cloud binding. Download JSON/ZIP or save to Cloud lessons before leaving, then explicitly import or open it when needed. Working snapshots still save locally during use, but startup does not load them. A fresh blank workspace is not automatically uploaded to the cloud.

## Present and export

Edit, student preview, and presentation share one scene. In student preview or presentation, click the slide or press Space to play the next effect, reveal the next answer once effects finish, or advance to the next visible slide once all answers are shown. Right Arrow and the on-screen right arrow use the same sequence. Left Arrow and the on-screen left arrow hide the most recently revealed answer; once all answers are hidden, they return to the previous visible slide. The final slide stops with a completion message. Answers start hidden on entering preview/presentation and reset to hidden on exit. Reveal progress is temporary: it does not trigger cloud/local autosave and is excluded from JSON/ZIP documents. Answer objects remain editable and are retained in saved documents.

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

## Version 1 JSON schema

The current editable document is described by [`schema/lesson-v1.schema.json`](schema/lesson-v1.schema.json). Import [`public/examples/lesson-v1.json`](public/examples/lesson-v1.json) for a working example with text, an embedded image and an animation. See [`docs/lesson-version-1.md`](docs/lesson-version-1.md) for the format, clipboard images and JSON versus ZIP storage. The legacy text-based lesson-plan schema remains unchanged.

## Images and Firebase on Spark

Clipboard image paste, file selection and drag-and-drop still embed image bytes locally. **Image from URL** accepts direct HTTPS links and loads them with anonymous CORS, so the original host must permit it. JSON and ZIP preserve these links; linked images require internet and the host can remove them. Browser caching is not a permanent backup. PDF export works for successfully loaded CORS images.

**Cloud lessons** uses Google sign-in, Realtime Database and the registered `lesson-presenter` web app. Only the verified owner account is allowed by `database.rules.json`. Saves run automatically about 2 seconds after document changes pause while signed in, capped at 2 MB per lesson in the client (rules additionally cap JSON string length), with a separate title index to avoid downloading every lesson to list them. Opening a lesson from Cloud lessons reconnects to the same record; importing a local lesson starts a new cloud record. Reopening or reloading the app starts a blank workspace. Unchanged snapshots do not upload again. Writes are serialized, pending saves are canceled on lesson/account changes, and failed cloud saves leave the local copy intact. The header shows cloud pending/saving/saved/error status separately from local saving. The manual cloud save button retries immediately, and reconnecting retries unsaved changes. Clipboard images remain embedded in cloud JSON, so large image-heavy lessons should stay local or use linked images. There is no Firebase Storage upload or billing upgrade. Spark quotas still apply across all saved lessons and downloads.

Firebase configuration is in `src/firebase-config.js`; these web identifiers are public, and access is enforced by database rules. The Google provider is enabled, the owner-only rules are published, and `localhost` plus `127.0.0.1` are authorized for development. Add your actual hosting domain to Authentication authorized domains when deployed. Build with `pnpm build`; `firebase.json` is ready for Firebase Hosting of `dist`, but no site has been deployed. Do not enable open/test-mode database rules.

### Live synchronization and diagnostics

Open **Cloud lessons** in each browser, sign in as the owner and choose the same record. The visible lesson ID and the ID suffix in each list item distinguish separate copies with identical titles. Firebase listeners receive updates for that record and its lesson index automatically. Edits still upload after a two-second pause, so other browsers update after that upload. A clean browser applies incoming changes without uploading them back. If both copies have unsaved changes, pending autosave pauses and the Cloud lessons dialog offers **Load cloud version** or **Keep my changes**. This is whole-lesson synchronization, without simultaneous text merging. An upload already sent cannot be canceled; keep only one active editor when resolving conflicts.

Under **Cloud lessons → Sync diagnostics**, inspect the recent timeline or **Download diagnostic logs** from each browser. Up to 300 events per tab survive reload via session storage: startup, authentication state, local snapshots, active lesson IDs, upload starts/acknowledgments/failures, database connectivity, received updates, applied updates, conflicts, crashes and unhandled promise rejections. Logs omit lesson documents/image payloads and redact URLs/API keys from error text. Logging does not transmit logs to a server. Private browsing or disabled storage still permits an in-memory diagnostic timeline.

### Cloud updates and deletion

Cloud saves update the current lesson's stable ID while it is open. After a reload, explicitly reopen the record from Cloud lessons. Creating a new imported lesson starts a new cloud record. Each cloud lesson has a **Delete** button. After confirmation, deletion removes its cloud document, cloud list entry, and matching browser autosave. If that lesson is open, the workspace and undo history reset to a blank slide. Other signed-in browsers with that lesson open also clear it when they receive the deletion. Pending autosaves are cancelled, and late updates cannot recreate a deleted record. The blank workspace is not automatically uploaded; import another lesson or explicitly save a new one. Existing JSON/ZIP files previously downloaded outside the app are separate files.

Each teacher slide's organization controls include a trash-bin button. Deleting a slide removes its scene and guidance from the current lesson while keeping the same cloud lesson ID. Deleting the final slide leaves a blank slide. Slide deletion controls are absent from Student preview and presentation.

### Incremental cloud sync

Cloud lessons uses `/cloudLessons/<uid>/lessons` and incremental sync for every save: only changed fields and new image assets are uploaded. Existing experimental copies appear in the main lesson list. Older JSON cloud records upgrade on first open using the same lesson ID; the old record is kept as a recovery copy and is never updated. Deleting a lesson removes both representations and its local autosave. See [sync behavior and testing](docs/incremental-sync-experiment.md).

The former `syncTests` location is migrated automatically with IDs, image assets and revisions preserved. Migration completion disables the old path; refresh older app tabs before continuing work.

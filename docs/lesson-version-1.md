# Lesson Presenter — Version 1

Use `schema/lesson-v1.schema.json` to validate a **standalone editable lesson**, and `public/examples/lesson-v1.json` as an importable starting point. The schema is also served at `/schema/lesson-v1.schema.json`, and the example at `/examples/lesson-v1.json`.

This is the existing saved document format, now documented as Version 1. No migration is required. The older `lesson.schema.json` remains the schema for text-based lesson plans; it is a different input format.

## Structure

```json
{
  "format": "lesson-presenter",
  "version": 1,
  "lesson": {
    "title": "My lesson",
    "pages": [{ "title": "First slide", "questions": [] }]
  },
  "slides": [{ "background": "#ffffff", "objects": [] }]
}
```

`lesson.pages[i]` contains teaching metadata for `slides[i]`. These arrays must have equal length and matching order. A standard JSON Schema cannot enforce their equal lengths; the app's importer checks this. The importer also validates supported canvas objects and image sources. Validation does not guarantee a malformed image can be decoded or a YouTube video can be embedded.

The canvas uses 1280 × 720 logical coordinates. Positions, sizes, rotation and scale belong to each Fabric object, independent of screen size or editor zoom. Root `version: 1` is the document format version; a slide's optional `version: "7.4.0"` is its Fabric serialization version.

Give each object a stable `lpId` when animations target it. `lpAnimations` belongs to a slide. Effects are `appear` or `disappear`, triggers are `click`, `after` or `with`, and `delay` is **milliseconds**. Hidden slides use `lesson.pages[i].hidden: true`. Teacher guidance lives in `aim`, `teacherNotes`, `procedure`, `timingNotes` and `anticipatedProblems`, outside the student canvas. Unknown metadata and Fabric properties remain allowed so normal exports retain their editing information.

## Pasted images

Paste an image into the canvas. The app reads the clipboard image as a file, converts its bytes into a Base64 data URL and stores it in the image object's `src`:

```json
{
  "type": "Image",
  "lpId": "image-1",
  "src": "data:image/png;base64,ACTUAL_BASE64_IMAGE_BYTES",
  "left": 80,
  "top": 180,
  "width": 640,
  "height": 360,
  "scaleX": 1,
  "scaleY": 1,
  "lpImageRadius": 16,
  "stroke": "#cbd3df",
  "strokeWidth": 2,
  "strokeUniform": true
}
```

The `src` above is illustrative. Use the complete data URL from a real image, or use the provided example, which contains a valid embedded SVG. Let the app generate the image JSON through paste/upload and **Save lesson** rather than typing Base64 manually.

JSON stores the image bytes as text, alongside its editable placement and border/corner settings. Moving, resizing and rotating the image stays editable; the picture itself is still a raster image unless the supplied image is SVG. PNG, JPEG, WebP, GIF and SVG are supported. GIF renders as a still canvas image. Pasted images default to a 2-unit border and 16-unit corner radius, both changeable in object properties.

The JSON is self-contained: no original file, clipboard or local path is needed to reopen it. Base64 adds roughly one-third to the raw image size, and repeated images can make JSON large. The app limits each incoming image to 20 MB and imported lesson files to 100 MB.

For image-heavy lessons, use **Export PDF → Download editable ZIP**. It contains `lesson.json` plus `assets/image-N.ext`; repeated identical images are stored once. Its internal `src: "assets/image-1.png"` references are package-only and intentionally do not pass the standalone JSON schema. Importing the ZIP resolves these references back into embedded data URLs. Do not upload its extracted `lesson.json` alone.

Use **Image from URL** for direct HTTPS image links. They remain URLs in JSON and ZIP; the source must remain available and allow anonymous cross-origin loading. Local filesystem paths, insecure HTTP links, credentials in URLs and temporary `blob:` URLs are not accepted. Ordinary clipboard text paste still inserts text; use the dedicated URL option to insert a linked image. YouTube is separate: a rectangle carrying `lpVideoId` stores a video ID, not video bytes, and playback requires a network connection.

## Workflow

1. Edit the supplied example, or paste images into Studio.
2. Choose **Save lesson** to create a complete `.json` document.
3. Validate it using a Draft 2020-12 validator and `lesson-v1.schema.json`.
4. Reopen it with **Import lesson → Choose a lesson file → Load lesson**.

Do not rename an image file to `.json`; JSON needs the document structure and embedded image data described above.

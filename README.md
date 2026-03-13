# Lesson Presenter

A lightweight browser app for presenting lessons from JSON with progressive answer reveal, dual teacher/audience views, live annotation, participation tools, and PDF export.

## Current Features

- Load lesson plans from JSON + validate against schema
- Teacher view and audience view with instant mode switch
- Stage-to-stage jump dropdown + keyboard stage navigation
- Reveal one answer at a time
- Draw annotations with selectable colors and pen sizes
- Paste images directly onto the active page (`Ctrl/Cmd + V`)
- Countdown timer for stage pacing
- Participation tools: polls, exit tickets, cold-call selector, mini whiteboards
- Board mode (projector-friendly) and tablet mode (teacher movement)
- Offline fallback via local snapshot + service-worker cache
- Print/PDF export with options to include/exclude annotations and reveal answers

## JSON Input Shape (Accepted)

The app accepts either of these top-level shapes:

1. Wrapped:

```json
{
  "lesson": {
    "title": "My Lesson",
    "stages": []
  }
}
```

2. Root-level:

```json
{
  "title": "My Lesson",
  "stages": []
}
```

Each stage can include `name`, `stageType`, `order`, `content`, and `answers.items`.

---

## Running Locally

Because this is a static web app, any basic static server works:

```bash
python3 -m http.server 4173
```

Then open:

- `http://localhost:4173`

# Lesson Presenter

A lightweight browser app for presenting lessons from JSON with progressive answer reveal, live annotation, image paste support, and PDF export.

## Current Features

- Load lesson plans from JSON
- Convert lesson stages into presentable pages
- Reveal one answer per click
- Draw annotations with selectable colors and pen sizes
- Paste images directly onto the active page (`Ctrl/Cmd + V`)
- Export a fully revealed/annotated lesson using browser Print to PDF

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

---

## How to Evolve This Into a SaaS

This project is a good MVP foundation. To become a production SaaS, add multi-tenant backend services, auth, persistence, collaboration, and billing.

## Suggested SaaS Architecture

### Frontend
- Keep presenter UI as a SPA (or migrate to React/Vue/Next.js)
- Add login, dashboard, lesson library, templates, and sharing controls
- Support cloud autosave and version history

### Backend API
- Node.js (Nest/Express) or Python (FastAPI/Django)
- REST/GraphQL endpoints for users, organizations, lessons, assets, exports
- Background worker for long-running PDF/image processing

### Data Layer
- PostgreSQL for core data
- Object storage (S3/R2/GCS) for pasted images and exported files
- Redis for caching/session/rate-limit queues

### Infrastructure
- Deploy with Docker on Fly/Render/AWS/GCP/Azure
- CDN + HTTPS
- Observability: logs, traces, metrics, error tracking

---

## Core SaaS Domains

### 1) Identity & Access
- Email/password + OAuth SSO (Google/Microsoft)
- Role-based access (owner, teacher, viewer)
- Organization/workspace support for schools and teams

### 2) Lesson Management
- CRUD for lesson plans
- JSON import/export + schema validation
- Version history and rollback
- Duplicate and template gallery

### 3) Presentation & Collaboration
- Presenter mode and audience mode
- Real-time sync for answer reveal/slide navigation
- Optional co-annotation and moderator controls

### 4) Asset Handling
- Clipboard image upload to cloud storage
- Drag/drop media support
- Virus/mime validation and size limits

### 5) Exporting
- Server-side PDF rendering pipeline for consistent output
- Batch export and branded templates
- Watermarks/branding by plan tier

### 6) Billing
- Stripe subscriptions
- Tiered plans (Free/Pro/School)
- Usage metering (storage, exports, collaborators)

---

## Suggested Roadmap

### Phase 1: Production Readiness
- Convert to modular frontend structure
- Add robust JSON schema validation and user-facing errors
- Persist lessons to backend database

### Phase 2: Multi-User SaaS
- Authentication and organization model
- Cloud image storage and lesson library
- Share links and permission controls

### Phase 3: Monetization + Scale
- Stripe billing and plan enforcement
- Server-side export service
- Audit logs, analytics, and advanced classroom features

---

## Minimal API Design (Example)

- `POST /auth/login`
- `GET /me`
- `GET /lessons`
- `POST /lessons`
- `GET /lessons/:id`
- `PUT /lessons/:id`
- `POST /lessons/:id/assets`
- `POST /lessons/:id/export/pdf`

---

## Security Checklist for SaaS Launch

- Input validation + schema checks on all APIs
- Tenant-level authorization checks on every read/write
- Signed URLs for asset access
- Rate limiting and abuse protection
- Encryption in transit and at rest
- Backups + disaster recovery plan

---

## Nice Next Improvements in This Repo

1. Add a strict JSON Schema file (`schema/lesson.schema.json`) and validate before render.
2. Persist page annotations as vector strokes (not only canvas pixels).
3. Add undo/redo for annotations.
4. Add drag/resize for pasted images.
5. Add a dedicated presenter view and audience view.

---

## License

Add your preferred license (MIT/Apache-2.0/proprietary) before public release.

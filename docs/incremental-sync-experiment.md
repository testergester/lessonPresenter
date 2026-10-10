# Incremental cloud sync

Incremental sync is the only cloud saving method in both workspaces. There is one Cloud lessons list, with no experimental mode or copy-creation step. JSON and ZIP downloads retain the Version 1 document format.

## Existing lessons

Active records now live at `/cloudLessons/<uid>/lessons/<id>`, with `/cloudLessons/<uid>/index` for the lesson list. On first connection, the migration freezes the old `/syncTests/<uid>` namespace, copies records and tombstones with their existing IDs/revisions, verifies copied values including image assets, and sets `migrationComplete`. A completed migration never reads the old namespace again. Production records take precedence when a partial migration resumes. Concurrent source edits are rejected by revision/write-ID guards and retried from a fresh snapshot.

Owner-only rules deny reads and writes to the old namespace after completion, so outdated tabs receive a connection error rather than a false lesson-deleted event. Refresh tabs with the updated app. The old namespace may be retained as a disabled recovery copy or removed after verification. Never remove `cloudLessons` or its migration markers.

The main list combines the incremental index with the legacy `/users/<uid>/index`, preferring incremental entries with matching IDs. An older JSON lesson upgrades when opened or when its saved browser session reconnects. A guarded initial write preserves its ID; simultaneous upgrades converge on the first successful creation. Once an incremental head exists, it is authoritative. The old JSON is retained as an untouched recovery copy, never used for ongoing saves. No account-wide JSON transaction remains.

Refresh all app tabs after installing this update. Older app builds do not understand the production storage location and may still write the legacy recovery copy; those edits do not synchronize into the upgraded lesson. Hosting deployment is separate from updating the local app.

Deletion atomically removes the incremental fields, image assets, list entries and matching legacy recovery record. The local autosave is also cleared. A small tombstone prevents late incremental clients from recreating the lesson.

## Data and conflict handling

Fields use database-safe keys and preserve JSON ordering, nulls and empty arrays. Compact aliases now replace repeated record/property names, with a versioned dictionary stored as a JSON string in `entries/_layout`. Every leaf remains a JSON string, so the existing rules and atomic revision guards still apply. The decoder supports both the old flat keys and compact aliases; an existing lesson converts atomically on its next save. Refresh app tabs with the updated build before opening compact records. Stable object IDs and order lists avoid resending unchanged objects. Embedded images are stored by SHA-256 and reused within the lesson; editing text, geometry or notes does not upload their pixels again. External image URLs remain links.

Atomic updates include changed fields, new/removed assets, a revision header and list metadata. Existing rules require revisions to increase by one and reject stale writes. Local edits are retained when browsers conflict, and the user chooses a version. This is whole-document conflict detection, not simultaneous editing of the same object. Opening a lesson and watching it share a single live subscription to its small `head`, never to the whole lesson. Unsubscribing closes it; an unused opening subscription expires after 30 seconds. There is no full-record `get()` in the normal open-and-watch path. Saved authoring snapshots always have zero answer reveal counts. Presentation/preview reveals stay local and reset on exit. Remote updates still reload the editor; the existing remote-update undo-history limitation remains. The 2 MB reconstructed document limit still applies.

## Transfer estimates

Cloud lessons → Sync details compares update payload size with the complete JSON size. This is a local estimate, not Firebase billing telemetry. A cache miss or legacy protocol upgrade transfers the full representation; bookkeeping, reconnects, retries and protocol overhead affect actual traffic. The Firebase Downloads chart is the source for measured usage. Tiny documents may see less benefit than lessons with embedded images.

## Tests

`npm test` runs codec, UI routing, isolation, export compatibility, asset reuse and conflict unit checks. `tests/incremental-emulator.test.js` skips unless `FIREBASE_DATABASE_EMULATOR_HOST` is set.

For repeatable integration testing, install Firebase CLI and `@firebase/rules-unit-testing` as development tools, with Java 21 or newer available, then run:

```sh
firebase emulators:exec --only database --project demo-lp-incremental --config firebase.experimental-test.json 'node --test tests/incremental-emulator.test.js'
```

For tools installed in a separate directory, set `LP_FIREBASE_TEST_TOOLS` to that directory. The emulator tests use a `demo-` project and never access live lessons. They check access denial, invalid fields, two clients, revision conflicts, deletion protection and legacy isolation.

The emulator integration suite uses an isolated demo project and never accesses live lessons. Storage service tests additionally cover legacy upgrades, concurrent upgrade attempts, default incremental writes, peer updates, stale-write rejection, unified listing, and deletion of both representations.

## Production migration verification

On October 9, 2026, the owner-only production rules were published, the account migration completed and verified its copied records, and the local app reconnected successfully using `cloudLessons`. After explicit confirmation, the retired `syncTests` database node was deleted. The production migration marker must remain in place. Hosting deployment is still separate; old hosted builds need the updated application before reconnecting.

## Persistent lesson cache (October 10, 2026)

`lessonPresenter.cloudCache.v1` stores confirmed cloud models in IndexedDB, keyed by database, account UID and lesson ID. Each record includes its lesson ID, revision and integrity checksum. It is independent of workspace autosave: restarting the app still presents a blank workspace and resets answers. JSON/ZIP exports of a cloud-bound lesson include optional `cloud: {id, revision}` metadata for its last confirmed cloud revision; root `version: 1` still means the file format. Importing that metadata never grants permission to overwrite the original cloud lesson.

An opening reads/subscribes to `head` and compares revision plus write ID with the persistent snapshot. An exact match reads no lesson fields or image assets. Updated records use an indexed `fieldVersions` query (`orderByValue`, revision range) and fetch only those individual fields. Removed fields retain their last revision as tombstones, so arbitrarily old caches can catch up without a growing event log. Changed fields, field versions and the new head are committed atomically. Head rechecks prevent mixed snapshots when edits race with reads. The browser limits field requests to 16 concurrently.

Old records gain `cacheVersion`, `cacheEpoch` and the field index on their first opening (or next save). Opening performs a guarded metadata-only revision update, preserving all lesson entries and assets. Missing, corrupt or evicted cache data requires a full read. A legacy writer or cache-epoch change also requires one full refresh because its missing change history cannot be inferred safely. Failed/unavailable IndexedDB falls back to ordinary loading. Own optimistic SDK events wait for write acknowledgement before caching. Concurrent cache writers cannot replace a higher revision with a lower one. Deleted lessons remove local cache entries.

Deploy the updated database rules before running this client: `fieldVersions` has a `.value` index and integer revision validation; head validation permits cache metadata. Owner-only access remains unchanged. The matching production rule additions were published through the Firebase console on October 10, 2026. Refresh older app tabs.

Sync details distinguishes cached opening, changed-field download and full download. Byte counts estimate received JSON data, including revision checks; they exclude transport/TLS overhead. The Firebase total can still rise from metadata, lesson lists, active connections, other tabs and console reads. It is cumulative and does not fall after optimization.

# Report Module Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the report module end-to-end on the current CaseSystem codebase, including backend persistence, file upload/download, ticket detail integration, configuration-side report templates, and the `/reports` frontend page.

**Architecture:** Keep the existing monolithic app structure in this worktree. Add report persistence models to `backend/app/models.py`, move report business logic into a focused `backend/app/reporting.py` service, extend `backend/app/main.py` with report and template endpoints, and wire the frontend through new API files and focused pages. Use filesystem-backed storage behind a small storage helper instead of the current static `REPORT_LIBRARY`.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, React, TypeScript, Vite, Tailwind CSS, filesystem file storage

---

## Chunk 1: Environment and Backend Persistence

### Task 1: Prepare the worktree environment

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `notes.md`
- Modify: `problems.md`

- [ ] **Step 1: Record the current blocker in `problems.md`**

Add a short entry noting that the fresh worktree does not have frontend dependencies installed and the Python environment is missing `httpx`, which blocks the test client.

- [ ] **Step 2: Install the missing Python dev dependency**

Run: `python3 -m pip install --user httpx`

Expected: install succeeds and `pytest` can import `fastapi.testclient`.

- [ ] **Step 3: Install frontend dependencies in the worktree**

Run: `npm install`

Expected: `frontend/node_modules` is created and `vite` becomes available.

- [ ] **Step 4: Record the environment fix in `notes.md`**

Add a note that new worktrees in this repo need Python dev extras and a fresh `npm install` under `frontend/`.

- [ ] **Step 5: Re-run baseline verification**

Run: `pytest -q`
Run: `npm run build`

Expected: both commands complete without environment-related failures before feature work starts.

### Task 2: Add failing backend tests for report persistence and access control

**Files:**
- Modify: `backend/tests/test_ticket_api.py`
- Create: `backend/tests/test_report_api.py`

- [ ] **Step 1: Write failing tests for ticket detail integration**

Cover:
- ticket detail returns `report_templates` alongside `reports`
- static report download endpoint is no longer used for real reports

- [ ] **Step 2: Write failing tests for report template CRUD and download**

Cover:
- admin can create a template for a ticket category
- non-admin cannot create templates
- ticket detail only returns active templates for the ticket category
- template download requires auth and returns attachment headers

- [ ] **Step 3: Write failing tests for uploaded report CRUD**

Cover:
- internal users can upload reports
- customers cannot upload
- uploaded report can optionally reference a matching template
- mismatched template/category is rejected
- metadata update works
- file replacement works
- delete removes the report and its file
- customers can download reports on their own tickets but not unrelated tickets

- [ ] **Step 4: Run the new backend tests to verify RED**

Run: `pytest backend/tests/test_ticket_api.py backend/tests/test_report_api.py -q`

Expected: FAIL because report models, routes, and storage do not exist yet.

### Task 3: Implement backend data model and storage

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/app/models.py`
- Modify: `backend/app/database.py`
- Create: `backend/app/reporting_storage.py`

- [ ] **Step 1: Add settings for report storage**

Introduce a configurable storage root such as `report_storage_dir` with a sensible local default inside the repo runtime directory.

- [ ] **Step 2: Add new SQLAlchemy models**

Add:
- `ReportTemplate`
- `TicketReport`

Use foreign keys to `tickets.id`, keep template `ticket_category_id`, and store `storage_key`, file metadata, and audit fields.

- [ ] **Step 3: Ensure runtime schema initialization creates the new tables**

Keep `create_all()` behavior intact and make sure the new models are imported before metadata creation.

- [ ] **Step 4: Add a focused file storage helper**

Implement helpers to:
- save uploaded files
- replace files safely
- stream/download files
- delete files on hard delete

- [ ] **Step 5: Run the targeted backend tests**

Run: `pytest backend/tests/test_report_api.py -q`

Expected: still FAIL on missing business logic, but model/storage wiring loads cleanly.

## Chunk 2: Backend Business Logic and API

### Task 4: Build report service logic

**Files:**
- Create: `backend/app/reporting.py`
- Modify: `backend/app/ticketing.py`

- [ ] **Step 1: Write failing tests for service-level behaviors indirectly through API**

If any missing cases remain from Task 2, add them before implementation.

- [ ] **Step 2: Implement report template service functions**

Add functions to:
- list templates by category or status
- create templates
- update template metadata/status
- replace template files
- download template files

- [ ] **Step 3: Implement uploaded report service functions**

Add functions to:
- list visible reports with filters
- upload a report
- fetch report detail
- update metadata
- replace the file
- hard delete the report
- download the report

- [ ] **Step 4: Integrate ticket detail aggregation**

Replace the static `_reports()` data source with real `TicketReport` records and add a new `report_templates` payload sourced from active templates for the current `category_id`.

- [ ] **Step 5: Record ticket actions for report changes**

Use existing `TicketAction` logging patterns for upload, update, replace, and delete.

- [ ] **Step 6: Run backend tests to verify GREEN**

Run: `pytest backend/tests/test_ticket_api.py backend/tests/test_report_api.py -q`

Expected: PASS.

### Task 5: Expose FastAPI endpoints and schemas

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Add Pydantic request/response schemas**

Add dedicated schemas for:
- report template summary/detail
- report list/detail
- multipart-related metadata requests represented by form fields

- [ ] **Step 2: Add report template endpoints**

Implement:
- `GET /api/v1/report-templates`
- `POST /api/v1/report-templates`
- `GET /api/v1/report-templates/{template_id}`
- `PATCH /api/v1/report-templates/{template_id}`
- `POST /api/v1/report-templates/{template_id}/replace-file`
- `GET /api/v1/report-templates/{template_id}/download`

- [ ] **Step 3: Add uploaded report endpoints**

Implement:
- `GET /api/v1/reports`
- `POST /api/v1/reports`
- `GET /api/v1/reports/{report_id}`
- `PATCH /api/v1/reports/{report_id}`
- `POST /api/v1/reports/{report_id}/replace-file`
- `GET /api/v1/reports/{report_id}/download`
- `DELETE /api/v1/reports/{report_id}`

- [ ] **Step 4: Remove the old ticket-scoped static markdown download dependency**

Keep ticket detail wired to real reports and templates; do not keep the old `REPORT_LIBRARY`-backed download path as the source of truth.

- [ ] **Step 5: Re-run backend tests**

Run: `pytest backend/tests/test_ticket_api.py backend/tests/test_report_api.py -q`

Expected: PASS.

## Chunk 3: Frontend Types, API, and Pages

### Task 6: Add failing frontend tests or verification targets, then implement API clients

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/src/api/reports.ts`
- Create: `frontend/src/api/reportTemplates.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/types/ticket.ts`
- Create: `frontend/src/types/report.ts`

- [ ] **Step 1: Add frontend test tooling only if needed for isolated helper coverage**

If the current repo still has no frontend test runner after backend work, add only the minimal tooling needed to test any extracted pure helpers. Otherwise skip extra tooling and keep verification to `tsc`/`vite build`.

- [ ] **Step 2: Extend `api/client.ts` for multipart and delete flows**

Add helpers for multipart POST/PATCH and DELETE with CSRF handling.

- [ ] **Step 3: Add report-specific types and clients**

Implement typed API functions for templates and uploaded reports.

- [ ] **Step 4: Extend ticket detail types**

Add `report_templates` and replace the old static `TicketReport` shape with the real uploaded-report shape expected from the backend.

- [ ] **Step 5: Verify TypeScript/build compatibility**

Run: `npm run build`

Expected: build may still fail on missing pages, but API/type changes compile cleanly.

### Task 7: Build the report pages and configuration entry

**Files:**
- Modify: `frontend/src/app/routes.tsx`
- Modify: `frontend/src/components/AppHeader.tsx`
- Modify: `frontend/src/components/AppSidebar.tsx`
- Modify: `frontend/src/contexts/AuthContext.tsx`
- Create: `frontend/src/pages/ReportsPage.tsx`
- Create: `frontend/src/pages/ReportTemplatesPage.tsx`
- Possibly create: `frontend/src/components/ReportUploadModal.tsx`
- Possibly create: `frontend/src/components/ReportTemplateForm.tsx`

- [ ] **Step 1: Use the repo’s existing styling rules from Figma MCP output**

Apply the previously derived Figma design-system constraints: IBM Plex typography, blue/slate tokens, rounded card surfaces, and existing sidebar/header patterns.

- [ ] **Step 2: Replace the `/reports` placeholder**

Build a real reports page with:
- visible-report listing
- list/card toggle
- search/filter controls
- upload entry point
- actions for edit, replace file, download, delete

- [ ] **Step 3: Add configuration-side template management**

Create `/configuration/report-templates` for admins with:
- template list
- create/edit/status update
- replace file
- download

- [ ] **Step 4: Wire navigation**

Expose the new configuration subpage from the existing configuration placeholder or replace the placeholder with a real entry page if that is the smaller change on this codebase.

- [ ] **Step 5: Run frontend verification**

Run: `npm run build`

Expected: PASS.

### Task 8: Integrate ticket detail with real reports

**Files:**
- Modify: `frontend/src/pages/TicketDetailPage.tsx`
- Possibly create small helper components under `frontend/src/components/`

- [ ] **Step 1: Update ticket detail data handling**

Read `report_templates` and the new `reports` shape from the API.

- [ ] **Step 2: Replace the old static report card section**

Render:
- template download area
- uploaded report area
- internal-only upload/edit/replace/delete actions
- customer-visible download-only actions

- [ ] **Step 3: Keep the rest of the ticket detail behavior stable**

Do not regress comments, actions, knowledge drawer, or markdown context panels.

- [ ] **Step 4: Run final frontend verification**

Run: `npm run build`

Expected: PASS.

## Chunk 4: Final Verification and Documentation

### Task 9: End-to-end verification and notes

**Files:**
- Modify: `notes.md`
- Modify: `problems.md`

- [ ] **Step 1: Capture any solved implementation gotchas**

If report storage, multipart handling, or worktree setup revealed reusable lessons, append them to `notes.md`.

- [ ] **Step 2: Record encountered issues**

Append any blockers or edge cases encountered during implementation to `problems.md`, even if resolved.

- [ ] **Step 3: Run the full verification suite**

Run: `pytest -q`
Run: `npm run build`

Expected: backend tests pass and frontend build passes.

- [ ] **Step 4: Review the diff**

Run: `git status --short`
Run: `git diff --stat`

Expected: only report-module-related files are changed in this worktree.

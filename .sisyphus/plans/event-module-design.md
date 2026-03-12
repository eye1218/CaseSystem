# Event Module and Backend Restructure Plan

## TL;DR

> Build the `Event` module on top of a new modular backend architecture, introduce `PostgreSQL` + `Alembic` + `Celery`, and keep the Event domain narrowly focused on event persistence, scheduling, task-template binding, and trigger dispatch.
>
> **Deliverables**:
> - Modular backend layout for auth, tickets, events, and future modules
> - PostgreSQL-ready database layer with Alembic migrations
> - Celery worker + beat infrastructure using DB-first scheduling
> - Event APIs, models, schemas, service logic, and ticket trigger wiring
> - Tests-after coverage for new architecture and Event flows
>
> **Estimated Effort**: XL
> **Parallel Execution**: YES - 4 waves + final verification
> **Critical Path**: T1 -> T2 -> T3 -> T8 -> T9 -> T10 -> T11 -> T12

---

## Context

### Original Request
Design the project's Event module strictly according to the provided development document, cancel prior unfinished work, and focus only on this work. Then expand the scope to include backend restructuring so the repository can cleanly host ticketing, auth, Event, knowledge base, reports, user management, and future modules. Use `Celery` and `PostgreSQL`.

### Interview Summary
**Key Discussions**:
- Event supports `instant` and `timed` behavior aligned to the user's normal/timed Event requirement.
- Event must support delayed trigger, early trigger, and postponed trigger.
- Event binds one or more task template IDs and dispatches them asynchronously in parallel.
- Event state stays limited to `pending`, `triggered`, `cancelled`.
- Event does not own downstream task execution state or results.
- Only administrators directly manage Event APIs; ordinary users only trigger indirectly through business flows.
- Backend restructuring is in scope so the project can host multiple modules cleanly.
- Test strategy is `tests-after`.

**Research Findings**:
- Current backend is flat: `backend/app/main.py`, `backend/app/models.py`, `backend/app/schemas.py`, `backend/app/enums.py`, `backend/app/ticketing.py`.
- Current tests are already solid: `pytest` + `FastAPI TestClient` + in-memory SQLite.
- No scheduler, broker, Celery, Redis, PostgreSQL migration system, or Alembic exists yet.
- `docs/工单核心模块.md:997` defines ticket-side trigger points that the Event module should consume.
- External guidance favors DB-first scheduling: DB is source of truth, Celery executes due work, and runtime re-checks prevent cancelled events from firing.

### Metis Review
**Identified Gaps** (addressed in this plan):
- Event requirements only existed in conversation, not repository docs -> plan includes an Event spec codification task.
- No migration system exists -> plan starts with Alembic/database groundwork.
- Backend move from flat layout could break imports -> plan isolates pure structural migration and verifies old tests before Event work.
- Task template entity is undefined -> plan treats template IDs as opaque references owned by the future task module.
- Redis/Celery runtime assumptions are unresolved -> plan includes local/dev worker configuration and verification gates without forcing production deployment details.

---

## Work Objectives

### Core Objective
Create a production-oriented Event subsystem and backend module layout that can scale beyond the current auth/ticket MVP, while preserving existing API behavior and keeping Event responsibilities tightly bounded.

### Concrete Deliverables
- Modular backend package structure under `backend/app/`
- Alembic initialization and baseline migrations
- PostgreSQL-ready settings and SQLAlchemy runtime
- Celery app, worker base, and periodic sweep task
- Event models, enums, schemas, services, router, and task binding persistence
- Ticket-to-Event integration points for documented trigger types
- Backend tests covering new Event flows and restructured imports

### Definition of Done
- [x] Existing auth/ticket routes still load and current tests still pass after restructuring
- [x] `alembic upgrade head` succeeds on configured database
- [x] Celery app imports cleanly and scheduled sweep task can be discovered
- [x] Admin can create, query, bind, reschedule, trigger early, and cancel Event records
- [x] Due Events dispatch bound task-template IDs in parallel without storing downstream task results
- [x] Event status changes only through `pending -> triggered` or `pending -> cancelled`

### Must Have
- Celery-based async execution
- PostgreSQL-ready persistence and migration path
- DB-first scheduling, not Celery ETA as sole source of truth
- Modular backend layout supporting current and future domains
- Tests-after coverage for backend changes

### Must NOT Have (Guardrails)
- No downstream task execution-result tracking inside Event
- No notification/business side effects implemented directly in Event
- No API path or response-shape regressions for existing auth/ticket endpoints during restructuring
- No broad event bus abstraction beyond what is needed for this scoped module
- No long-lived in-memory-only scheduler as source of truth

---

## Verification Strategy

> ZERO HUMAN INTERVENTION - all verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: Tests-after
- **Framework**: `pytest`

### QA Policy
Every task includes executable QA scenarios. Evidence should be saved under `.sisyphus/evidence/`.

- **Backend/API**: Bash with `pytest`, `python -c`, and `curl` against a running app when needed
- **Worker/Celery**: Bash with `python -c` and Celery CLI import/discovery checks
- **Structure checks**: Bash with targeted imports and test commands

---

## Execution Strategy

### Parallel Execution Waves

```text
Wave 1 (foundation)
├── T1: Codify target architecture and Event contract [writing]
├── T2: Add PostgreSQL + Alembic groundwork [unspecified-high]
├── T3: Add Celery runtime skeleton [unspecified-high]
└── T4: Extract shared core/infra structure [deep]

Wave 2 (modularization)
├── T5: Migrate auth module into package layout [deep]
├── T6: Migrate tickets module into package layout [deep]
├── T7: Create future-module skeleton packages [quick]
└── T8: Define Event domain data contracts [unspecified-high]

Wave 3 (Event implementation)
├── T9: Implement Event persistence, services, and admin APIs [deep]
├── T10: Implement Celery sweep and parallel dispatch [deep]
└── T11: Wire ticket trigger points into Event creation [unspecified-high]

Wave 4 (verification and tests)
└── T12: Add backend tests for structure, Event APIs, and dispatch guards [deep]

Wave FINAL
├── F1: Plan compliance audit [oracle]
├── F2: Code quality review [unspecified-high]
├── F3: Real QA execution [unspecified-high]
└── F4: Scope fidelity check [deep]
```

### Dependency Matrix

- **T1**: blocked by none -> blocks T8, T9, T11
- **T2**: blocked by none -> blocks T9, T10, T12
- **T3**: blocked by T2 -> blocks T10, T12
- **T4**: blocked by none -> blocks T5, T6, T7, T9
- **T5**: blocked by T4 -> blocks T12
- **T6**: blocked by T4 -> blocks T11, T12
- **T7**: blocked by T4 -> blocks none
- **T8**: blocked by T1, T2, T4 -> blocks T9, T10, T12
- **T9**: blocked by T1, T2, T4, T8 -> blocks T10, T11, T12
- **T10**: blocked by T2, T3, T8, T9 -> blocks T12
- **T11**: blocked by T1, T6, T9, T10 -> blocks T12
- **T12**: blocked by T2, T3, T5, T6, T8, T9, T10, T11 -> blocks FINAL wave

### Agent Dispatch Summary

- **Wave 1**: T1 -> `writing`, T2 -> `unspecified-high`, T3 -> `unspecified-high`, T4 -> `deep`
- **Wave 2**: T5 -> `deep`, T6 -> `deep`, T7 -> `quick`, T8 -> `unspecified-high`
- **Wave 3**: T9 -> `deep`, T10 -> `deep`, T11 -> `unspecified-high`
- **Wave 4**: T12 -> `deep`
- **FINAL**: F1 -> `oracle`, F2 -> `unspecified-high`, F3 -> `unspecified-high`, F4 -> `deep`

---

## TODOs

- [x] T1. Codify the Event contract and target backend architecture

  **What to do**:
  - Create or update repository documentation so the conversational Event requirements become a stable spec for execution.
  - Document the target modular backend layout and explicit ownership for `auth`, `tickets`, `events`, `knowledge`, `reports`, and `users`.
  - Freeze core Event semantics: `instant` vs `timed`, `pending/triggered/cancelled`, early trigger, postpone, opaque task-template IDs, admin-only direct APIs.

  **Must NOT do**:
  - Do not broaden Event into notification, task-result, or workflow-engine ownership.
  - Do not redesign ticket business rules while documenting Event triggers.

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: this is specification codification and architecture communication.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `obsidian-markdown`: standard markdown is enough; no vault-specific syntax needed.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2, T3, T4)
  - **Blocks**: T8, T9, T11
  - **Blocked By**: None

  **References**:
  - `docs/系统总览设计.md:64` - Defines Event and action orchestration as a first-class module.
  - `docs/系统总览设计.md:118` - Shows Event module dependency boundaries against ticketing, SLA, config, and audit.
  - `docs/工单核心模块.md:997` - Lists ticket trigger points that Event should consume, not reinvent.
  - `.sisyphus/drafts/event-module-design.md:1` - Captures the clarified user decisions from this planning session.

  **Acceptance Criteria**:
  - [x] A repository doc exists that captures the Event contract and target backend layout.
  - [x] The doc explicitly states Event does not manage downstream task execution status/results.
  - [x] The doc explicitly defines early trigger and postpone behavior for pending timed events.

  **QA Scenarios**:
  ```text
  Scenario: Event spec file is complete
    Tool: Bash
    Preconditions: Documentation changes saved
    Steps:
      1. Run `python -c "from pathlib import Path; p=Path('docs'); print(sorted(str(x) for x in p.rglob('*Event*.md')))"`
      2. Read the produced Event design doc and assert it contains `pending`, `triggered`, `cancelled`, `instant`, `timed`, and `task template`.
      3. Save the command output and checked file path.
    Expected Result: Event spec exists and includes the agreed terms.
    Failure Indicators: Missing doc, or missing one of the required semantics.
    Evidence: .sisyphus/evidence/task-t1-event-spec.txt

  Scenario: Architecture ownership stays bounded
    Tool: Bash
    Preconditions: Documentation changes saved
    Steps:
      1. Search the new spec with `python -c "from pathlib import Path; text=Path('<DOC_PATH>').read_text(); print('task result' in text, 'notification send' in text)"`
      2. Assert the doc excludes task-result ownership and direct notification behavior.
    Expected Result: Exclusions are explicit.
    Failure Indicators: Event spec silently absorbs out-of-scope responsibilities.
    Evidence: .sisyphus/evidence/task-t1-scope-guards.txt
  ```

  **Commit**: NO

- [x] T2. Add PostgreSQL settings and Alembic migration foundation

  **What to do**:
  - Introduce PostgreSQL-ready settings and connection plumbing.
  - Initialize Alembic, wire it to the project settings, and create a baseline migration strategy for existing tables plus future Event tables.
  - Keep the current boot path usable while migrations are being introduced.

  **Must NOT do**:
  - Do not hard-cut existing runtime to PostgreSQL-only before migrations and tests are stable.
  - Do not remove fallback development/test support prematurely.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: infra-heavy backend migration with schema tooling.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `supabase-postgres-best-practices`: helpful later for query tuning, but this task is migration plumbing first.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T3, T4)
  - **Blocks**: T9, T10, T12
  - **Blocked By**: None

  **References**:
  - `backend/app/config.py:10` - Current settings pattern to extend with PostgreSQL and Celery values.
  - `backend/app/database.py:1` - Current engine/session/Base setup that Alembic must target.
  - `pyproject.toml:10` - Existing dependency surface that needs Alembic/PostgreSQL additions.
  - `backend/tests/conftest.py:20` - Current test settings override pattern that must remain workable.

  **Acceptance Criteria**:
  - [x] Alembic is initialized and points to project metadata.
  - [x] Baseline migration can upgrade the configured database successfully.
  - [x] Settings support PostgreSQL DSN and Celery broker/result values.

  **QA Scenarios**:
  ```text
  Scenario: Alembic upgrade succeeds
    Tool: Bash
    Preconditions: Migration files and settings are in place
    Steps:
      1. Run `alembic heads`.
      2. Run `alembic upgrade head`.
      3. Record exit codes and resulting head revision.
    Expected Result: One valid head and successful upgrade.
    Failure Indicators: Multiple unexpected heads, import errors, migration failure.
    Evidence: .sisyphus/evidence/task-t2-alembic-upgrade.txt

  Scenario: Settings expose new infrastructure values safely
    Tool: Bash
    Preconditions: Settings updated
    Steps:
      1. Run `python -c "from app.config import Settings; s=Settings(); print(hasattr(s, 'database_url'), hasattr(s, 'celery_broker_url'), hasattr(s, 'celery_result_backend'))"`.
      2. Assert all printed values are `True`.
    Expected Result: New settings fields resolve without boot failure.
    Failure Indicators: AttributeError, import error, or missing Celery/PostgreSQL fields.
    Evidence: .sisyphus/evidence/task-t2-settings.txt
  ```

  **Commit**: YES
  - Message: `build(db): add postgres settings and alembic baseline`

- [x] T3. Add Celery app, worker base, and beat scaffolding

  **What to do**:
  - Create a shared Celery app, worker entrypoint, and beat schedule location.
  - Add a DB-safe task base or equivalent session-handling pattern for worker execution.
  - Configure eager/test-friendly behavior so later tests can run without a live worker.

  **Must NOT do**:
  - Do not use Celery ETA/countdown as the primary scheduling truth.
  - Do not couple worker startup to FastAPI request lifecycle.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: background runtime integration with infrastructure edge cases.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `playwright`: backend worker task; no browser interaction needed.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2, T4)
  - **Blocks**: T10, T12
  - **Blocked By**: T2

  **References**:
  - `backend/app/main.py:51` - Current app factory boundary; Celery must remain separate from HTTP app creation.
  - `backend/app/database.py:1` - Session factory/source for worker task DB access.
  - `pyproject.toml:20` - Dev dependency section that will need Celery-related additions.
  - `.sisyphus/drafts/event-module-design.md:17` - DB-first scheduling guidance gathered during planning.

  **Acceptance Criteria**:
  - [x] Celery app imports cleanly.
  - [x] Worker task module discovery succeeds.
  - [x] Test/eager configuration path exists for later automated tests.

  **QA Scenarios**:
  ```text
  Scenario: Celery app imports without FastAPI boot coupling
    Tool: Bash
    Preconditions: Celery files added
    Steps:
      1. Run `python -c "from app.worker.celery_app import celery_app; print(celery_app.main)"`.
      2. Assert the command exits 0 and prints a Celery app name.
    Expected Result: Celery runtime is importable as a standalone unit.
    Failure Indicators: ImportError, circular import, or FastAPI boot side effects.
    Evidence: .sisyphus/evidence/task-t3-celery-import.txt

  Scenario: Task discovery path exists
    Tool: Bash
    Preconditions: Celery task modules registered
    Steps:
      1. Run `python -c "from app.worker.celery_app import celery_app; print(sorted(celery_app.conf.include or []))"`.
      2. Assert Event worker modules are included.
    Expected Result: Worker can discover registered task modules.
    Failure Indicators: Empty include list or missing event task module.
    Evidence: .sisyphus/evidence/task-t3-celery-discovery.txt
  ```

  **Commit**: YES
  - Message: `build(worker): add celery app and beat skeleton`

- [x] T4. Extract shared core and infrastructure packages from the flat backend

  **What to do**:
  - Move shared settings, DB, security, dependency, and app bootstrap concerns into stable `core` / `infra` style locations.
  - Slim `backend/app/main.py` so it becomes an app factory plus router registration boundary.
  - Preserve current imports through safe transitional updates until module migrations are complete.

  **Must NOT do**:
  - Do not change route paths or business rules during the structural move.
  - Do not mix Event feature work into this pure extraction step.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: cross-cutting structural move with import-risk management.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `refactor`: useful in implementation, but the plan should stay tool-agnostic.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2, T3)
  - **Blocks**: T5, T6, T7, T8, T9
  - **Blocked By**: None

  **References**:
  - `backend/app/main.py:51` - Current app factory and route-registration hotspot to decompose.
  - `backend/app/dependencies.py:13` - Shared dependency patterns to preserve during extraction.
  - `backend/app/config.py:10` - Current settings class to relocate cleanly.
  - `backend/app/database.py:1` - Shared DB runtime that future modules will depend on.

  **Acceptance Criteria**:
  - [x] Shared runtime files live in stable non-domain package locations.
  - [x] `create_app()` still imports and builds successfully.
  - [x] Existing tests still pass once downstream module moves are complete.

  **QA Scenarios**:
  ```text
  Scenario: App factory still imports after extraction
    Tool: Bash
    Preconditions: Shared files moved and imports updated
    Steps:
      1. Run `python -c "from app.main import create_app; create_app(); print('ok')"`.
      2. Assert output contains `ok`.
    Expected Result: App factory survives the structural extraction.
    Failure Indicators: Circular import, missing module, or startup exception.
    Evidence: .sisyphus/evidence/task-t4-app-import.txt

  Scenario: Shared dependency contract preserved
    Tool: Bash
    Preconditions: Shared files moved and imports updated
    Steps:
      1. Run `pytest backend/tests/test_auth_flow.py -q`.
      2. Assert the auth flow tests still pass.
    Expected Result: Shared auth/dependency boot flow still works.
    Failure Indicators: Fixture/import failures or changed auth runtime behavior.
    Evidence: .sisyphus/evidence/task-t4-auth-regression.txt
  ```

  **Commit**: YES
  - Message: `refactor(core): extract shared backend runtime structure`

- [x] T5. Migrate the auth domain into a modular package without breaking behavior

  **What to do**:
  - Split auth routes, service logic, schemas, models, and policy helpers into an auth package.
  - Preserve current endpoint paths and existing `ActorContext`/permission behavior.
  - Keep tests green before any Event wiring begins.

  **Must NOT do**:
  - Do not change login, logout, refresh, role-switch, or CSRF semantics.
  - Do not add Event-related auth concerns here.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: sensitive security-area relocation with regression risk.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `git-master`: commit hygiene matters later, but not needed inside the task spec.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T6, T7, T8)
  - **Blocks**: T12
  - **Blocked By**: T4

  **References**:
  - `backend/app/auth.py:1` - Existing auth service implementation to relocate.
  - `backend/app/main.py:96` - Current auth route registration to preserve path-for-path.
  - `backend/app/schemas.py:9` - Current auth request/response schema pattern.
  - `backend/tests/test_auth_flow.py:1` - Regression tests that must stay green through the move.

  **Acceptance Criteria**:
  - [x] Auth code resides in a dedicated domain package.
  - [x] Existing auth tests still pass unchanged.
  - [x] Public auth endpoints keep the same paths and response models.

  **QA Scenarios**:
  ```text
  Scenario: Auth regression suite stays green
    Tool: Bash
    Preconditions: Auth package move completed
    Steps:
      1. Run `pytest backend/tests/test_auth_flow.py backend/tests/test_authorization.py -q`.
      2. Assert zero failures.
    Expected Result: Auth behavior is unchanged after modularization.
    Failure Indicators: Broken imports, changed permissions, changed auth responses.
    Evidence: .sisyphus/evidence/task-t5-auth-tests.txt

  Scenario: Public auth routes unchanged
    Tool: Bash
    Preconditions: App imports successfully
    Steps:
      1. Run `python -c "from app.main import create_app; app=create_app(); print(sorted(r.path for r in app.routes if r.path.startswith('/auth')))"`.
      2. Assert expected paths such as `/auth/login`, `/auth/logout`, `/auth/refresh`, `/auth/me` remain present.
    Expected Result: Route contract is preserved.
    Failure Indicators: Missing or renamed auth routes.
    Evidence: .sisyphus/evidence/task-t5-auth-routes.txt
  ```

  **Commit**: YES
  - Message: `refactor(auth): move auth into modular package`

- [x] T6. Migrate the ticket domain into a modular package and isolate seed/support data

  **What to do**:
  - Split ticket routes, service logic, schemas, models, and seed data into a ticket package.
  - Preserve all existing ticket endpoints and response structures.
  - Separate seed/support records from core service logic so later Event integration is cleaner.

  **Must NOT do**:
  - Do not alter ticket business rules while moving files.
  - Do not implement Event behavior inside ticket service yet.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: large service decomposition with many current responsibilities.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `writing`: this is structural/backend work rather than documentation.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T5, T7, T8)
  - **Blocks**: T11, T12
  - **Blocked By**: T4

  **References**:
  - `backend/app/ticketing.py:16` - Current service/error pattern to preserve.
  - `backend/app/main.py:181` - Current ticket route surface to preserve.
  - `backend/app/models.py:161` - Existing ticket-side ORM models.
  - `backend/tests/test_ticket_api.py:6` - Regression test suite for the ticket API.

  **Acceptance Criteria**:
  - [x] Ticket code is moved into a dedicated package.
  - [x] Ticket seed data is isolated from core runtime logic.
  - [x] Existing ticket API tests still pass.

  **QA Scenarios**:
  ```text
  Scenario: Ticket regression suite stays green
    Tool: Bash
    Preconditions: Ticket package move completed
    Steps:
      1. Run `pytest backend/tests/test_ticket_api.py -q`.
      2. Assert zero failures.
    Expected Result: Ticket behavior is unchanged after modularization.
    Failure Indicators: Broken imports, changed route behavior, seed-data regressions.
    Evidence: .sisyphus/evidence/task-t6-ticket-tests.txt

  Scenario: Ticket routes remain discoverable
    Tool: Bash
    Preconditions: App imports successfully
    Steps:
      1. Run `python -c "from app.main import create_app; app=create_app(); print(sorted(p for p in [r.path for r in app.routes] if p.startswith('/api/v1/tickets')))"`.
      2. Assert list includes list/create/detail/comment/update/action/report paths.
    Expected Result: Existing ticket route contract is intact.
    Failure Indicators: Missing or renamed ticket endpoints.
    Evidence: .sisyphus/evidence/task-t6-ticket-routes.txt
  ```

  **Commit**: YES
  - Message: `refactor(tickets): move tickets into modular package`

- [x] T7. Create skeleton packages for future backend domains

  **What to do**:
  - Create minimal package placeholders for `knowledge`, `reports`, and `users` so the backend layout is ready for upcoming modules.
  - Add package-level README or placeholder files only as needed to keep the structure explicit.
  - Keep these packages intentionally empty of business logic for now.

  **Must NOT do**:
  - Do not invent unfinished APIs or schemas for modules not requested yet.
  - Do not introduce dead placeholder code that implies unsupported functionality.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: small structural scaffolding task.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `writing`: package scaffolding is primarily codebase-structure work.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T5, T6, T8)
  - **Blocks**: None
  - **Blocked By**: T4

  **References**:
  - `docs/系统总览设计.md:72` - Knowledge and report modules exist in the broader system design.
  - `docs/系统总览设计.md:88` - KPI/report-related downstream module landscape reinforces future modular growth.
  - `.sisyphus/drafts/event-module-design.md:54` - User explicitly requested future-ready backend organization.

  **Acceptance Criteria**:
  - [x] Target future-domain package directories exist.
  - [x] No fake business implementation is introduced in those packages.

  **QA Scenarios**:
  ```text
  Scenario: Future module skeletons exist
    Tool: Bash
    Preconditions: Package scaffolding created
    Steps:
      1. Run `python -c "from pathlib import Path; print(sorted(str(p) for p in Path('backend/app/modules').iterdir() if p.is_dir()))"`.
      2. Assert `knowledge`, `reports`, and `users` appear in the output.
    Expected Result: Future-ready domain directories exist.
    Failure Indicators: Missing package directories.
    Evidence: .sisyphus/evidence/task-t7-module-skeletons.txt

  Scenario: No unsupported routes were added accidentally
    Tool: Bash
    Preconditions: App imports successfully
    Steps:
      1. Run `python -c "from app.main import create_app; app=create_app(); print(sorted(r.path for r in app.routes))"`.
      2. Assert no new `/api/v1/knowledge`, `/api/v1/reports`, or `/api/v1/users` endpoints exist yet unless explicitly planned elsewhere.
    Expected Result: Structure exists without premature API creep.
    Failure Indicators: Unplanned route surfaces for future modules.
    Evidence: .sisyphus/evidence/task-t7-no-route-creep.txt
  ```

  **Commit**: NO

- [x] T8. Define Event domain enums, models, schemas, and task-template binding contract

  **What to do**:
  - Define the Event persistence contract: Event table, binding table, enums, and Pydantic schema shapes.
  - Treat `task_template_id` as an opaque ID owned by the future task module; persist binding metadata only.
  - Capture reschedule/early-trigger/cancel constraints on `pending` Events.

  **Must NOT do**:
  - Do not invent task execution-result tables.
  - Do not require the task module to exist before Event bindings can be stored.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: contract design crossing API, DB, and future integration boundaries.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `supabase-postgres-best-practices`: useful for performance review later, but this task is primarily contract design.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T5, T6, T7)
  - **Blocks**: T9, T10, T12
  - **Blocked By**: T1, T2, T4

  **References**:
  - `backend/app/enums.py:54` - Existing enum style to mirror for Event statuses/types.
  - `backend/app/models.py:138` - `AuthSecurityEvent` shows a UUID-based event-like audit pattern already used in the codebase.
  - `backend/app/schemas.py:61` - Existing request/response naming and `from_attributes` style to mirror.
  - `docs/工单核心模块.md:1003` - Ticket trigger names that need compatible source/event semantics.

  **Acceptance Criteria**:
  - [x] Event domain types and schema shapes are explicit and migration-ready.
  - [x] Binding model stores one-to-many or many-to-many task-template references without downstream execution state.
  - [x] Reschedule and early-trigger inputs are limited to valid `pending` Event states.

  **QA Scenarios**:
  ```text
  Scenario: Event schema and enum imports are stable
    Tool: Bash
    Preconditions: Event contract files added
    Steps:
      1. Run `python -c "from app.modules.events.enums import EventStatus, EventType; from app.modules.events.schemas import EventCreateRequest, EventResponse; print([e.value for e in EventStatus], [e.value for e in EventType])"`.
      2. Assert statuses are exactly `pending`, `triggered`, `cancelled` and event types include `instant`, `timed`.
    Expected Result: Event contracts are importable and values match the agreed spec.
    Failure Indicators: Import errors or extra/incorrect enum values.
    Evidence: .sisyphus/evidence/task-t8-contract-imports.txt

  Scenario: Binding model avoids task-result leakage
    Tool: Bash
    Preconditions: Event model files added
    Steps:
      1. Search Event models with `python -c "from pathlib import Path; text=Path('backend/app/modules/events/models.py').read_text(); print('result' in text, 'status_result' in text, 'task_template_id' in text)"`.
      2. Assert task-template references exist and task-result persistence fields do not.
    Expected Result: Event binding persistence stays within scope.
    Failure Indicators: Event model begins storing downstream result/status data.
    Evidence: .sisyphus/evidence/task-t8-binding-scope.txt
  ```

  **Commit**: YES
  - Message: `feat(events): define event contracts and bindings`

- [x] T9. Implement Event service logic and admin-facing APIs

  **What to do**:
  - Implement create/get/list/bind/cancel/reschedule/early-trigger Event flows.
  - Enforce admin-only direct access and preserve the repository's existing auth/dependency pattern.
  - Keep Event state transitions narrow and explicit.

  **Must NOT do**:
  - Do not dispatch downstream tasks synchronously in the API request.
  - Do not allow mutation of already triggered or cancelled Events outside explicit guard rails.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: this is the core domain behavior and API layer.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `playwright`: backend API task only.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T10, T11 after dependencies clear)
  - **Blocks**: T10, T11, T12
  - **Blocked By**: T1, T2, T4, T8

  **References**:
  - `backend/app/main.py:210` - Existing mutating route pattern with CSRF dependency to mirror where applicable.
  - `backend/app/dependencies.py:20` - Current `require_auth` pattern for actor enforcement.
  - `backend/app/ticketing.py:16` - Business error pattern to mirror with an Event-specific exception.
  - `backend/tests/test_ticket_api.py:58` - Canonical backend API test shape for authenticated POST flows.

  **Acceptance Criteria**:
  - [x] Admin can create Event and receive `event_id` plus `pending` status.
  - [x] Admin can bind one or more task-template IDs.
  - [x] Admin can query Event status and binding list.
  - [x] Pending timed Event can be cancelled, postponed, or triggered early.

  **QA Scenarios**:
  ```text
  Scenario: Admin creates and queries Event
    Tool: Bash (curl)
    Preconditions: App running locally with auth available; admin token/cookies prepared
    Steps:
      1. POST `/api/v1/events` with JSON containing `name`, `type`, `related_object`, `tags`, and either `delay` or `trigger_time`.
      2. Assert response status is success and body contains non-empty `event_id` and `status == "pending"`.
      3. GET `/api/v1/events/{event_id}` and assert the same Event is returned.
    Expected Result: Event persists and is queryable immediately after creation.
    Failure Indicators: Missing `event_id`, wrong initial status, or follow-up query mismatch.
    Evidence: .sisyphus/evidence/task-t9-create-query.json

  Scenario: Non-admin cannot manage Event directly
    Tool: Bash (curl)
    Preconditions: App running; non-admin authenticated session available
    Steps:
      1. POST `/api/v1/events` as non-admin with valid payload.
      2. Assert response is `403` or project-standard denial response.
    Expected Result: Direct Event management remains admin-only.
    Failure Indicators: Non-admin can create or mutate Event records.
    Evidence: .sisyphus/evidence/task-t9-admin-guard.txt
  ```

  **Commit**: YES
  - Message: `feat(events): add event services and admin APIs`

- [x] T10. Implement the Celery due-event sweep and parallel task dispatch flow

  **What to do**:
  - Add a periodic sweep task that finds due `pending` Events from the database.
  - Re-check state at dispatch time so cancelled or already-triggered Events are skipped safely.
  - Dispatch bound task-template IDs in parallel and then mark the Event as `triggered` when dispatch succeeds.

  **Must NOT do**:
  - Do not rely on Celery `eta`/`countdown` as the only scheduler.
  - Do not store downstream task success/failure state in the Event module.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: concurrency, scheduling, and idempotency are the core risk areas.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `ultrabrain`: this is hard but still within normal deep systems work.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T9, T11 after dependencies clear)
  - **Blocks**: T11, T12
  - **Blocked By**: T2, T3, T8, T9

  **References**:
  - `.sisyphus/drafts/event-module-design.md:17` - Captured DB-first scheduling guidance from research.
  - `backend/app/models.py:138` - Existing event-like audit persistence pattern using UUID IDs.
  - `docs/工单核心模块.md:1011` - Timed ticket trigger examples that the sweep will eventually support.
  - `pyproject.toml:10` - Dependency baseline to extend with Celery-related packages.

  **Acceptance Criteria**:
  - [x] Periodic sweep task claims due `pending` Events only.
  - [x] Cancelled Events are skipped safely.
  - [x] Bound task-template IDs are dispatched in parallel.
  - [x] Event is marked `triggered` only after dispatch call(s) complete successfully.

  **QA Scenarios**:
  ```text
  Scenario: Due pending Event is dispatched once
    Tool: Bash
    Preconditions: Event exists in DB with due trigger time, pending status, and at least two task-template bindings; Celery eager/test mode enabled if no live worker
    Steps:
      1. Run the sweep task directly, e.g. `python -c "from app.modules.events.tasks import sweep_due_events; print(sweep_due_events())"` or the project-equivalent invocation.
      2. Query the Event record afterward and assert `status == "triggered"`.
      3. Assert dispatch log/output shows both task-template IDs were submitted in the same sweep run.
    Expected Result: One due Event dispatches once and becomes triggered.
    Failure Indicators: Event remains pending, double dispatch, or only one binding dispatched.
    Evidence: .sisyphus/evidence/task-t10-due-dispatch.txt

  Scenario: Cancelled Event is not dispatched
    Tool: Bash
    Preconditions: Event exists in DB with due trigger time and `cancelled` status
    Steps:
      1. Run the same sweep invocation.
      2. Assert no dispatch records/output mention the cancelled Event.
      3. Query the Event record and assert status remains `cancelled`.
    Expected Result: Cancelled due Event is skipped completely.
    Failure Indicators: Cancelled Event dispatches or status changes unexpectedly.
    Evidence: .sisyphus/evidence/task-t10-cancelled-skip.txt
  ```

  **Commit**: YES
  - Message: `feat(events): add celery sweep and parallel dispatch`

- [x] T11. Wire documented ticket trigger points into Event creation paths

  **What to do**:
  - Integrate Event creation into selected ticket lifecycle paths defined by the project docs, starting with the concrete triggers implemented in the current codebase.
  - Ensure trigger emission is narrow, explicit, and uses Event service boundaries rather than embedding worker logic in ticket handlers.
  - For SLA/time-based triggers, create pending timed Event rows whose execution is later handled by the sweep.

  **Must NOT do**:
  - Do not invent a full generic event bus unless required for current flows.
  - Do not mutate ticket behavior beyond adding the Event-creation hook.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: cross-module integration with coupling control.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `artistry`: straightforward integration is preferred over creative abstraction.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T9, T10)
  - **Blocks**: T12
  - **Blocked By**: T1, T6, T9, T10

  **References**:
  - `docs/工单核心模块.md:1003` - Ticket-side trigger vocabulary to honor.
  - `backend/app/ticketing.py:383` - Existing ticket lifecycle/service area where integration points live.
  - `backend/app/ticketing.py:622` - Detail-building/service flow that should remain separated from Event dispatch.
  - `backend/tests/test_ticket_api.py:58` - Existing create/update paths to extend with indirect Event assertions.

  **Acceptance Criteria**:
  - [x] Ticket flows create or schedule Event rows only for documented trigger points selected for current implementation.
  - [x] Ticket APIs remain responsive and do not synchronously execute bound task work.
  - [x] Time-based ticket-triggered Events persist with future trigger times instead of immediate execution.

  **QA Scenarios**:
  ```text
  Scenario: Ticket action creates indirect Event record
    Tool: Bash
    Preconditions: App running; ticket flow integrated with Event service; admin or appropriate actor authenticated
    Steps:
      1. Execute a ticket action that should emit a documented trigger, such as creating a ticket or a timeout-related setup path.
      2. Query Event storage or the Event list API filtered by related ticket ID.
      3. Assert at least one matching Event row exists with the expected trigger type and related object.
    Expected Result: Ticket-side trigger produces an Event record indirectly.
    Failure Indicators: No Event created, wrong related object, or trigger path executes task work synchronously.
    Evidence: .sisyphus/evidence/task-t11-ticket-trigger.txt

  Scenario: Ticket request remains non-blocking
    Tool: Bash
    Preconditions: App running; Celery worker intentionally absent or eager mode disabled for the request path
    Steps:
      1. Execute the same ticket request while the worker is not processing tasks.
      2. Assert the HTTP request still returns success without waiting for downstream task completion.
    Expected Result: Ticket endpoint persists work and returns without blocking on task execution.
    Failure Indicators: Request hangs, waits on worker completion, or fails solely because downstream task worker is absent.
    Evidence: .sisyphus/evidence/task-t11-nonblocking.txt
  ```

  **Commit**: YES
  - Message: `feat(events): wire ticket triggers into event creation`

- [x] T12. Add tests-after coverage for modular structure, Event APIs, and dispatch safeguards

  **What to do**:
  - Add backend tests covering modular import stability, Event admin APIs, permissions, binding behavior, cancel/reschedule/early-trigger guards, and sweep idempotency.
  - Keep existing auth/ticket tests green and add focused Event tests in the same style.
  - Use eager/test-friendly Celery execution where needed.

  **Must NOT do**:
  - Do not depend on manual browser or human QA for the core acceptance path.
  - Do not rewrite existing stable tests unless restructuring requires import-path-only updates.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: test matrix spans architecture, API, permissions, and scheduler behavior.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `playwright`: no frontend Event UI was requested.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4
  - **Blocks**: Final verification wave
  - **Blocked By**: T2, T3, T5, T6, T8, T9, T10, T11

  **References**:
  - `backend/tests/conftest.py:19` - Existing fixture setup to extend for Event tests.
  - `backend/tests/test_ticket_api.py:6` - Existing API-test style to mirror.
  - `pyproject.toml:33` - Current pytest configuration surface.
  - `.sisyphus/drafts/event-module-design.md:50` - Confirmed `tests-after` strategy.

  **Acceptance Criteria**:
  - [x] Event API tests cover admin success and non-admin denial.
  - [x] Event tests cover binding, cancel, early trigger, and postpone flows.
  - [x] Sweep tests cover due dispatch and cancelled-event skip behavior.
  - [x] Existing test suite remains green.

  **QA Scenarios**:
  ```text
  Scenario: Full backend suite passes after Event work
    Tool: Bash
    Preconditions: All backend changes complete
    Steps:
      1. Run `pytest backend/tests -q --tb=short`.
      2. Assert the full suite exits with code 0.
    Expected Result: Existing and new tests all pass together.
    Failure Indicators: Any regression or new Event test failure.
    Evidence: .sisyphus/evidence/task-t12-full-suite.txt

  Scenario: Event-focused tests cover negative guards
    Tool: Bash
    Preconditions: Event tests added
    Steps:
      1. Run `pytest backend/tests/test_event_api.py -q` and any sweep-specific test file added for worker behavior.
      2. Assert there are explicit cases for non-admin denial, cancelled-event skip, and invalid state transitions.
    Expected Result: Event test coverage includes both happy path and failure/guard scenarios.
    Failure Indicators: Event tests only cover success paths or omit scheduler guards.
    Evidence: .sisyphus/evidence/task-t12-event-tests.txt
  ```

  **Commit**: YES
  - Message: `test(events): cover event lifecycle and dispatch guards`

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** - `oracle`
  Verify every deliverable and guardrail in this plan against the implementation and evidence directory.

- [x] F2. **Code Quality Review** - `unspecified-high`
  Run type/import/test checks, inspect changed files for dead code, bad naming, and unsafe shortcuts.

- [x] F3. **Real QA Execution** - `unspecified-high`
  Execute every listed QA scenario and save evidence under `.sisyphus/evidence/final-qa/`.

- [x] F4. **Scope Fidelity Check** - `deep`
  Confirm the work implements this plan exactly, without missing pieces or unrelated creep.

---

## Commit Strategy

- `refactor(backend): modularize app structure for domain packages`
- `build(infra): add alembic postgres and celery foundation`
- `feat(events): add event module APIs scheduling and bindings`
- `test(events): cover event workflows and dispatch safeguards`

---

## Success Criteria

### Verification Commands
```bash
pytest
alembic upgrade head
python -c "from app.main import create_app; create_app(); print('ok')"
python -c "from app.worker.celery_app import celery_app; print(celery_app.main)"
```

### Final Checklist
- [x] Existing modules still boot after restructuring
- [x] PostgreSQL-ready migration flow exists
- [x] Celery worker and beat wiring exist
- [x] Event APIs and task bindings work as planned
- [x] Cancelled Events never dispatch
- [x] Early/postponed trigger flows work on pending timed events
- [x] Tests and QA evidence cover the final behavior

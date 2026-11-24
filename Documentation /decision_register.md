# Architectural Decision & Requirements Register

## Status Overview
- **Phase:** Phase 1 — Product Discovery and Requirement Interrogation
- **Active Section:** 2. Users, Access Management & Roles

---

## 1. Confirmed Decisions (Phase 1)

### Section 1: Product Vision & Operational Scope
- **Deployment & Architecture Model:** Single-tenant / Internal Enterprise Tool
  - Dedicated deployment for a single organization (self-hosted on private cloud or on-prem).
  - Integrates natively with corporate IAM (Okta, Entra ID, Google Workspace, LDAP / SCIM).
  - Eliminates multi-tenant data leak risks, subscription billing logic, and cross-tenant noisy-neighbor concerns.
- **Operational Scope:** Unified Hybrid (ITSM / Helpdesk + Agile Engineering)
  - Unifies IT service requests, incident management, change requests, and approvals with engineering backlogs, sprints, epics, and bug tracking.
  - Bridges the communication gap between employee requesters, IT support agents, and software developers in one system.
- **UX Philosophy & Differentiator:** Dual-Persona Workspace + Full Traceability Graph
  - *Consumer-grade Employee Portal:* Clean, non-technical self-service catalog for employees to submit and track requests.
  - *Power-User Agent/Engineer Workspace:* Blisteringly fast, keyboard-first UI (command palette, optimistic updates, markdown editor, vim/shortcut navigation).
  - *End-to-End Context Graph:* First-class bidirectional linking between IT incident tickets, engineering bugs/features, git branches/commits/PRs, and deployment releases.
- **Workflow Engine Architecture:** Two-Tier Workflow Model
  - *Tier 1 (Engineering Projects):* Opinionated, high-velocity finite state machines (Linear model: Backlog -> Todo -> In Progress -> In Review -> Done / Canceled) designed for sub-100ms interactions without administrative bloat.
  - *Tier 2 (Service Desk / IT Projects):* Configurable lifecycle with approval gates (manager/security sign-off), strict SLA timers, escalation policies, and requester/agent privacy boundaries.
- **Displacement Strategy:** Phased Departmental Migration with Import Utilities
  - Teams transition department-by-department with batch import utilities (Jira/CSV/JSON), avoiding complex long-term bi-directional synchronization.
- **Target Scale & Load Profile (Mid-to-Large Enterprise):**
  - *Total Registered Employees:* 1,000 to 10,000 internal users.
  - *Active Power Users (Engineers, PMs, IT Agents):* ~200 to 1,500 users.
  - *Peak Concurrent Users:* 300 to 800 active sessions.
  - *Ticket Throughput:* 10,000 to 50,000 tickets created/updated per month (~120k–600k tickets/year).
  - *Database Capacity:* Designed for millions of relational ticket records over a 5-year retention lifecycle with read-replicas, proper indexing, and Redis caching.

### Section 2: Users, Roles & Access Management
- **User Personas & External Boundary:**
  - *Internal Corporate Users:* Authenticate via corporate SSO/IdP (SAML 2.0 / OIDC) and synced via SCIM.
  - *Restricted External Guests / Contractors:* Explicit project-level invitations only. Strict row-level isolation blocks access to the global employee directory, unrelated projects, and internal-only metadata.
- **Multi-Project Role Polymorphism:**
  - Users can belong to multiple teams and projects simultaneously with distinct roles per project (e.g., Tech Lead on Project X, Contributor on Project Y, Guest Viewer on Project Z).
- **High-Performance Permission Architecture (Tiered Bitmask Schemes):**
  - Project-level permissions are modeled using ~30 granular permission flags encoded as a 64-bit integer bitmask.
  - Resolved at session load and cached in Redis. Authorization checks in API gateways execute via $O(1)$ bitwise operations (`(userBitmask & REQUIRED_PERM) != 0`).
- **Multi-Audience Comment Privacy Model:**
  - *Fast Two-Way UX Toggle:* Authors default to either `Public Reply` (visible to requester/external guests) or `Internal Note` (visible to all internal staff).
  - *Advanced Group Scoping:* For sensitive legal, HR, security, or executive matters, authors can attach an optional `Restricted To User Group` audience scope to individual comments without impeding daily workflow speed.

### Section 3: Organization & Workspace Structure
- **4-Level Operational Structural Hierarchy:**
  - `Organization` (Company root)
    - `Departments` (High-level functional divisions: e.g., Engineering, IT Operations, People & Culture, Finance)
      - `Teams` (Autonomous functional units: e.g., Platform Team, SRE, Core Backend, Helpdesk L1/L2)
        - `Projects` (Bounded delivery initiatives or ongoing service queues: e.g., Identity Migration v2, IT Hardware Catalog)
          - `Tickets / Issues` (Epics -> Tasks / Bugs / Requests -> Subtasks)
- **View vs. Container Separation:**
  - Boards (Kanban/Scrum), Lists, Gantt charts, and Calendars are **dynamic query views**, NOT rigid structural database containers. Moving a ticket between views or creating custom team views never alters the ticket's underlying project lineage.
- **Cross-Functional Team Collaboration (Many-to-Many with Primary Owner):**
  - Every project has exactly one *Primary Owning Team* accountable for overall delivery.
  - Multiple *Contributing Teams* can be mapped to a project, enabling cross-team issue assignment, shared sprint planning, and consolidated cross-functional backlogs without duplicating tickets.

- **Project Privacy & Visibility Tiers:**
  - *Public (Open):* Discoverable, searchable, and joinable by any authenticated internal employee.
  - *Team-Restricted:* Visible only to members of the primary/contributing teams and explicitly invited users.
  - *Confidential / Secret:* Completely hidden from global search, autocompletion, and directory listings. Accessible exclusively to direct invitees (mandatory for executive compensation, M&A, legal discovery, and zero-day security incident response).

### Section 4: Ticket and Task Management
- **Data Model & Custom Fields Architecture:**
  - *Hybrid Relational + JSONB:* Standard indexed relational columns (`id`, `project_id`, `ticket_key`, `type`, `title`, `description`, `status_id`, `priority`, `assignee_id`, `reporter_id`, `due_date`, `created_at`, `updated_at`).
  - *Project-Scoped Custom Fields:* Dynamic project fields defined in metadata schemas and stored in a strongly validated JSONB column (`custom_fields`) on the `tickets` table with PostgreSQL GIN indexing for fast querying and filtering.
- **Hierarchy & Dependency Graph:**
  - *Capped 3-4 Level Structural Hierarchy:* `Initiative (Portfolio)` -> `Epic` -> `Task / Story / Bug / Request` -> `Subtask`.
  - Guarantees clean, predictable Kanban board rendering, deterministic rollup metrics, and prevents recursive query lockups.
  - *Directed Dependency Graph:* First-class support for `BLOCKS`, `BLOCKED_BY`, `RELATES_TO`, and `DUPLICATES` with automated cycle detection (preventing A -> B -> A loops) and automated status warnings when attempting to close blocked parent tasks.

- **Estimation, Time Tracking & SLA Architecture:**
  - *Engineering Projects:* Story Points (Fibonacci scale) + optional time estimates (hours/days).
  - *IT Service Desk Projects:* Real-time SLA Countdown Engines with two primary metrics: **Time-to-First-Response (TTFR)** and **Time-to-Resolution (TTR)**. Supports configurable SLA clock pause conditions (e.g., when ticket status enters "Waiting on Customer", "Waiting on 3rd Party Vendor").
  - *Work Logging:* Granular work log entries (`spent_seconds`, `started_at`, `notes`, `user_id`) aggregated at ticket and project level.
- **Audit History & Deletion Model:**
  - *Append-Only Immutable Field Audit Trail:* Dedicated `ticket_audit_events` table capturing actor, change type, field name, previous value, new value, and RFC3339 timestamp.
  - *Soft Deletion:* All entities implement `deleted_at` timestamps. Soft-deleted tickets enter a 30-day recoverable Trash Bin before permanent automated purge.

---

### Section 5: Project and Workflow Management
- **Comprehensive Unified View Engine:**
  - *Day-One View Types:* Kanban Boards, Scrum Sprints, Interactive Backlog, Fast Spreadsheet/Table View, Calendar View, and Milestones/Epics Roadmap.
  - *Interactive Gantt View (Warning Mode Engine):* Supports interactive timeline bars, start/end date adjustments, and dependency arrows. Schedule violations trigger real-time **visual conflict warnings** (red highlights & dependency breach badges) rather than autonomous uncontrolled date shifting.
- **Sprint Management Lifecycle:**
  - Standardized agile sprint cadences (1 to 4 weeks).
  - Explicit sprint states: `Planning`, `Active`, `Closed`.
  - Sprint rollover mechanics: When a sprint is completed, uncompleted issues are cleanly prompted to either roll into the *Next Scheduled Sprint* or return to the *Product Backlog*, preserving accurate historical burndown metrics.

- **Multi-Party Approval Engine (Service Desk):**
  - *Staged Approval Pipelines:* Supports sequential and parallel approval tiers (e.g., Tier 1: Direct Line Manager -> Tier 2: InfoSec / Finance Lead).
  - *Quorum Logic:* Configurable per stage as `Unanimous (All Must Approve)` or `First-Response (Any One Approver)`.
  - *Approval Actions:* Secure one-click in-app approval/rejection with mandatory justification remarks on rejection.

---

### Section 6: Communication and Collaboration
- **Real-Time Synchronization & Presence Architecture:**
  - *Transport & Pub/Sub:* Bi-directional WebSockets managed by backend application gateways, backed by a distributed Redis Pub/Sub cluster.
  - *Live Presence Indicators:* Ephemeral presence tracking showing active viewer and editor avatars on open tickets and active boards.
  - *Concurrency & Conflict Handling (Optimistic Locking):* Tickets maintain an incremental `lock_version` integer. If User B submits an update based on a stale version already incremented by User A, the API gracefully rejects the overwrite with a `409 Conflict`, prompting User B with a side-by-side visual diff to merge or overwrite without silent data loss.

- **Notification Hub & Dispatch Architecture:**
  - *Multi-Channel Delivery:* Central In-App Notification Center (with read/unread states and inbox filtering: Mentions, Assigned, Subscribed), transactional email dispatch (powered by SMTP / SES / SendGrid), and first-class Slack / Microsoft Teams bot integrations.
  - *User Preference Engine:* Granular matrix allowing users to configure frequency (immediate vs batched hourly digest) and channel per event type (@mentions, assignment, status change, comment).

---

### Section 7: Reporting and Analytics
- **Analytical Data & Query Architecture:**
  - *Read-Replica Routing:* All heavy aggregation and reporting queries are routed to an asynchronous PostgreSQL Read-Replica, guaranteeing zero impact on transactional OLTP performance.
  - *Rollup Snapshot Aggregations:* Nightly and hourly cron background workers pre-calculate sprint daily burn rates, historical velocity, and SLA compliance percentages into dedicated rollup tables (`sprint_daily_snapshots`, `sla_metrics_hourly`).
- **Dashboard Presentation & Widgets:**
  - *Modular Widget Architecture:* Pre-built widgets (Sprint Burndown, Velocity Chart, Cumulative Flow Diagram, SLA Breach Gauge, Team Workload Heatmap, Saved Filter Card) customizable in responsive 12-column grid layouts.

### Section 8: Automation and Integrations
- **Asynchronous Event-Driven Rule Engine:**
  - *Trigger -> Condition -> Action Matrix:* Asynchronous workers process events (issue created, status changed, SLA warning, comment added).
  - *Actions:* Automated round-robin & workload-balanced assignment, field updates, SLA escalation notifications, and outbound webhooks.
  - *Recursion Guardrails:* Enforces a maximum execution depth of 3 nested event cascades to strictly prevent infinite automated loops.
- **Bi-Directional External Ingestion:**
  - *Inbound Email-to-Ticket Gateway:* Ingests emails from configured departmental inboxes (e.g., `helpdesk@company.com`), parses MIME attachments, auto-creates tickets, and threads email replies as ticket comments based on message-id and ticket key tokens.
  - *Deep Git Webhook Integration:* Bi-directional GitHub/GitLab integration linking branch names (`feat/KEY-123`), commit messages, and Pull Requests with automated status transitions upon PR review and merge.

---

### Section 9: Non-Functional Requirements & Security
- **File Storage & Attachment Architecture:**
  - *Storage Target:* S3-compatible Object Storage (AWS S3 or self-hosted MinIO for on-prem compliance).
  - *Zero-Buffer Uploads:* Direct browser-to-object-storage uploads using temporary presigned PUT URLs with SHA-256 payload verification and strict MIME-type whitelisting.
  - *Async Malware Quarantine:* Uploaded files are quarantined until an asynchronous background worker scans the file with ClamAV, preventing malicious payload propagation.
- **Enterprise Reliability & Disaster Recovery:**
  - *High Availability SLA:* 99.9% uptime target with Multi-AZ containerized application services.
  - *Disaster Recovery:* RPO < 15 minutes (continuous PostgreSQL WAL streaming), RTO < 1 hour (automated database read-replica promotion and container health orchestrators).
  - *Security & Compliance Standards:* SOC 2 Type II audit logging readiness, GDPR data deletion/anonymization workflows, TLS 1.3 in-transit encryption, AES-256 at-rest database and object encryption.

### Section 10: Platform and User Experience
- **Client Targets & Form Factors:**
  - *Primary Surface:* High-performance Single Page Application (SPA) / Modern Web App, responsive across desktop, tablet, and mobile browsers.
  - *Progressive Web App (PWA):* Installable PWA with offline caching of recent tasks and native desktop notifications. Desktop wrapper (Tauri) scheduled for post-MVP.
  - *Keyboard-First Ergonomics:* Full global keyboard navigation, vim-style shortcuts (`j`/`k` navigation, `c` create, `e` edit), and a centralized Command Palette (`Cmd+K` / `Ctrl+K`) for sub-second command dispatch.
- **Instant Search Architecture (Meilisearch):**
  - Dedicated lightweight Meilisearch container syncing asynchronously with PostgreSQL via change events.
  - Delivers sub-20ms typo-tolerant search-as-you-type across tickets, issue keys, summaries, descriptions, comments, and attachment names.

---

## 2. Phase 1 Discovery: Complete
All 10 core product discovery areas have been interrogated, clarified, and confirmed.
Moving to **Phase 2: Challenge My Requirements & Architectural Risk Assessment**.

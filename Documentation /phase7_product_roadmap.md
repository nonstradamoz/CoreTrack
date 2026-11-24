# Phase 7 — Product Roadmap & Execution Strategy

This document establishes the delivery phases from initial MVP to enterprise maturity, detailing technical complexity, dependencies, priorities, and concrete acceptance criteria.

---

```mermaid
gantt
    title Platform Engineering Roadmap
    dateFormat  YYYY-MM
    section Phase 1: MVP
    Core IAM, 4-Level Org & Bitmask RBAC       :done,    m1, 2026-12, 2027-01
    Polymorphic Tickets, FSM & Custom Fields   :active,  m2, 2027-01, 2027-02
    Kanban, Backlog, Table & Real-Time Sync    :         m3, 2027-02, 2027-03
    Employee Portal & Basic SLA Timers         :         m4, 2027-03, 2027-04
    section Phase 2: Version 1.0
    Gantt (Warning Mode), Sprints & Roadmaps   :         v1, 2027-04, 2027-05
    GitHub / GitLab Webhook Integrations       :         v2, 2027-05, 2027-06
    Inbound Email Gateway & Staged Approvals   :         v3, 2027-06, 2027-07
    section Phase 3: Version 2.0
    Event Automation Builder (Triggers/Actions):         v4, 2027-07, 2027-08
    Meilisearch Instant Global Search (Cmd+K)  :         v5, 2027-08, 2027-09
    Analytics Dashboards (Read-Replica Engine) :         v6, 2027-09, 2027-10
    section Phase 4: Enterprise Hardening
    SCIM 2.0 Directory Sync & Audit Logs       :         e1, 2027-10, 2027-11
    ClamAV Scanner, Multi-AZ & Disaster Recov  :         e2, 2027-11, 2027-12
```

---

## 1. Phase 1: MVP (Months 1–4) — "Core Velocity & Dual Persona"
* **Focus:** Replace day-to-day Jira boards and simple helpdesk queues with sub-100ms velocity.

### Deliverables & Modules
1. **IAM & 4-Level Hierarchy:** Organization, Departments, Teams, Projects with 64-bit Bitmask RBAC.
2. **Dual-Persona Interface:**
   * Power-user workspace for engineers/IT agents (Linear-style keyboard-driven navigation, command palette).
   * Consumer-grade Employee Service Portal for non-technical staff to file requests.
3. **Core Ticket Engine:**
   * Capped 4-level hierarchy (`Initiative` -> `Epic` -> `Task` -> `Subtask`).
   * Dynamic project-scoped custom fields (JSONB + GIN index).
   * Directional dependencies (`BLOCKS`, `BLOCKED_BY`, `RELATES_TO`, `DUPLICATES`) with cycle detection.
4. **Primary Views:** Kanban Board with drag-and-drop, Interactive Backlog, and Fast Spreadsheet/List View.
5. **Real-Time Synchronization:** WebSocket gateway + Redis Pub/Sub for live card moves and optimistic updates.
6. **Comments & Notes:** Fast toggle between Public Reply and Internal Note.
7. **Jira / CSV Batch Importer:** One-time migration pipeline for pilot teams.

### Acceptance Criteria
* Board card drag-and-drop reflects in <50ms optimistically and synchronizes to peer browsers in <250ms over WebSockets.
* Optimistic concurrency rejects stale edits with 409 Conflict and visual diff.
* Zero data leakage between restricted projects and external guests.

---

## 2. Phase 2: Version 1.0 (Months 5–7) — "Agile Delivery & ITIL Workflows"
* **Focus:** Complete engineering sprint cycles and ITIL service desk approval governance.

### Deliverables & Modules
1. **Interactive Gantt View (Warning Mode Engine):** Visual timeline with milestone dependencies and conflict warning badges.
2. **Sprint Lifecycle Management:** Planning, active sprint burndowns, velocity charts, and sprint rollover wizards.
3. **ITSM Staged Approvals:** Multi-tier sequential/parallel sign-offs with one-click email/in-app decisions.
4. **Real-Time SLA Engine:** TTFR (Time to First Response) and TTR (Time to Resolution) countdown clocks with pause states.
5. **Code Integrations:** Native GitHub and GitLab webhook parsers linking branch names and PR states to tickets.
6. **Inbound Email-to-Ticket Gateway:** Ingests emails from support inboxes, parses attachments, and captures threaded comment replies.

### Acceptance Criteria
* PR merge automatically transitions linked ticket from "In Review" to "Done".
* SLA countdown pauses immediately when status changes to "Waiting on Customer".
* Staged approval requires all designated managers before ticket status transitions to "In Progress".

---

## 3. Phase 3: Version 2.0 (Months 8–10) — "Intelligence & Custom Automation"
* **Focus:** Deep workflow automation, instant search, and executive analytics.

### Deliverables & Modules
1. **Asynchronous Automation Rule Engine:** Visual Trigger -> Condition -> Action builder with loop suppression (max depth 3).
2. **Meilisearch Full-Text Integration:** Sub-20ms typo-tolerant search across all tickets, comments, and attachments via outbox sync.
3. **Read-Replica Analytics Engine:** Pre-aggregated hourly rollup snapshots powering modular 12-column dashboards.
4. **Slack & Microsoft Teams Bi-directional Bots:** Ticket creation from chat, assignment alerts, and interactive approval buttons.
5. **Batch Operations:** Multi-select table view to bulk-reassign, bulk-transition, or bulk-tag up to 100 tickets atomically.

### Acceptance Criteria
* Global search query returns ranked results in under 30ms across 500,000 tickets.
* Automated rules cannot trigger recursive cascades beyond depth 3.
* Heavy analytics queries run strictly on read-replicas with zero impact on OLTP response times.

---

## 4. Phase 4: Enterprise Hardening & Future Horizons (Months 11+)
* **Focus:** Compliance, resilience, and multi-platform expansion.

### Deliverables & Modules
1. **Enterprise Identity:** SCIM 2.0 automated provisioning and deprovisioning; out-of-office approval delegation.
2. **Security Hardening:** Containerized ClamAV scanning for presigned S3 uploads; Outbound webhook SSRF DNS pinning.
3. **Disaster Recovery:** Continuous PostgreSQL WAL streaming (RPO < 15 min), automated read-replica failover (RTO < 1 hr).
4. **Client Expansion:** Installable Progressive Web App (PWA) with offline task draft cache; lightweight desktop wrapper (Tauri).
5. **AI Assistants (Future):** Smart issue deduplication, auto-triage ticket categorization, and automated meeting action-item extraction.

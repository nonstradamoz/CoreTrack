# Phase 5 — Database & API Planning

This document details the complete relational database schema, indexing strategies, audit logging mechanics, and production REST API specifications.

---

## 1. Database Schema & Indexing Strategy (PostgreSQL 16)

### 1.1 Core Tables & DDL Blueprint

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 1. USERS & IDENTITY
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    avatar_url TEXT,
    user_type VARCHAR(30) NOT NULL DEFAULT 'INTERNAL_EMPLOYEE' 
        CHECK (user_type IN ('INTERNAL_EMPLOYEE', 'EXTERNAL_GUEST')),
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' 
        CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DEACTIVATED')),
    global_permissions BIGINT NOT NULL DEFAULT 0, -- 64-bit bitmask
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. DEPARTMENTS & TEAMS
CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(20) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL,
    key_prefix VARCHAR(10) NOT NULL UNIQUE, -- e.g., 'PLAT', 'SEC'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE team_members (
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_team_lead BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (team_id, user_id)
);

-- 3. PROJECTS & ACCESS CONTROL
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    primary_team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    key VARCHAR(10) NOT NULL UNIQUE, -- e.g. 'CORE', 'SEC', 'HD'
    name VARCHAR(150) NOT NULL,
    description TEXT,
    project_type VARCHAR(30) NOT NULL DEFAULT 'ENGINEERING' 
        CHECK (project_type IN ('ENGINEERING', 'SERVICE_DESK')),
    privacy_tier VARCHAR(30) NOT NULL DEFAULT 'PUBLIC' 
        CHECK (privacy_tier IN ('PUBLIC', 'TEAM_RESTRICTED', 'SECRET')),
    next_ticket_number INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE, -- NULL = System Global Template
    role_name VARCHAR(50) NOT NULL,
    permission_bitmask BIGINT NOT NULL, -- 64-bit integer
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_members (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES project_roles(id) ON DELETE RESTRICT,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, user_id)
);

-- 4. TICKETS & TASKS (CORE ENTITY)
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    ticket_key VARCHAR(20) NOT NULL UNIQUE, -- e.g. 'CORE-1042'
    ticket_number INT NOT NULL,
    ticket_type VARCHAR(30) NOT NULL 
        CHECK (ticket_type IN ('INITIATIVE', 'EPIC', 'STORY', 'TASK', 'BUG', 'SERVICE_REQUEST', 'INCIDENT')),
    parent_id UUID REFERENCES tickets(id) ON DELETE SET NULL, -- Depth capped at 4 levels
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'TODO',
    priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' 
        CHECK (priority IN ('URGENT', 'HIGH', 'MEDIUM', 'LOW')),
    story_points INT,
    estimated_hours NUMERIC(6, 2),
    spent_hours NUMERIC(6, 2) NOT NULL DEFAULT 0.0,
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
    sprint_id UUID, -- Foreign key added below
    due_date TIMESTAMPTZ,
    
    -- ITSM SLA Timestamps
    sla_response_due_at TIMESTAMPTZ,
    sla_response_fulfilled_at TIMESTAMPTZ,
    sla_resolution_due_at TIMESTAMPTZ,
    sla_resolution_fulfilled_at TIMESTAMPTZ,
    is_sla_paused BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Dynamic Custom Fields (JSONB)
    custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Optimistic Concurrency & Lifecycle
    lock_version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ -- Soft deletion
);

-- 5. SPRINTS
CREATE TABLE sprints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    goal TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'PLANNING' 
        CHECK (status IN ('PLANNING', 'ACTIVE', 'CLOSED')),
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tickets ADD CONSTRAINT fk_ticket_sprint 
    FOREIGN KEY (sprint_id) REFERENCES sprints(id) ON DELETE SET NULL;

-- 6. TICKET DEPENDENCIES
CREATE TABLE ticket_dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    target_ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    dependency_type VARCHAR(30) NOT NULL 
        CHECK (dependency_type IN ('BLOCKS', 'BLOCKED_BY', 'RELATES_TO', 'DUPLICATES')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_no_self_dependency CHECK (source_ticket_id != target_ticket_id),
    CONSTRAINT uq_ticket_dependency UNIQUE (source_ticket_id, target_ticket_id, dependency_type)
);

-- 7. COMMENTS & AUDIENCES
CREATE TABLE ticket_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    body TEXT NOT NULL,
    visibility_scope VARCHAR(30) NOT NULL DEFAULT 'PUBLIC' 
        CHECK (visibility_scope IN ('PUBLIC', 'INTERNAL_ONLY', 'RESTRICTED_GROUPS')),
    restricted_group_ids UUID[] DEFAULT ARRAY[]::UUID[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- 8. IMMUTABLE AUDIT LOG (Partitionable by Year)
CREATE TABLE ticket_audit_events (
    id UUID DEFAULT uuid_generate_v4(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action_type VARCHAR(50) NOT NULL, -- 'STATUS_TRANSITION', 'FIELD_CHANGE', 'ASSIGNMENT'
    field_name VARCHAR(100),
    previous_value TEXT,
    new_value TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- 9. TRANSACTIONAL OUTBOX TABLE
CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aggregate_type VARCHAR(50) NOT NULL, -- 'TICKET', 'COMMENT', 'PROJECT'
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSED', 'FAILED')),
    retry_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);
```

### 1.2 Performance Indexing Strategy

```sql
-- 1. High-velocity Kanban Board queries (Active tickets in project by status)
CREATE INDEX idx_tickets_project_status 
ON tickets (project_id, status) 
WHERE deleted_at IS NULL;

-- 2. Sprint Backlog rendering
CREATE INDEX idx_tickets_sprint_priority 
ON tickets (sprint_id, priority) 
WHERE deleted_at IS NULL;

-- 3. Ticket Key lookups (sub-10ms direct navigation)
CREATE UNIQUE INDEX idx_tickets_key_lookup 
ON tickets (ticket_key);

-- 4. User My-Work Triage (Tickets assigned to user sorted by due date)
CREATE INDEX idx_tickets_assignee_active 
ON tickets (assignee_id, status, due_date) 
WHERE deleted_at IS NULL;

-- 5. ITSM SLA Active Countdown Index
CREATE INDEX idx_tickets_sla_breach_monitor 
ON tickets (sla_resolution_due_at, status) 
WHERE is_sla_paused = FALSE AND sla_resolution_fulfilled_at IS NULL AND deleted_at IS NULL;

-- 6. Dynamic JSONB Custom Fields GIN Index
CREATE INDEX idx_tickets_custom_fields_gin 
ON tickets USING GIN (custom_fields);

-- 7. Outbox Poller Index
CREATE INDEX idx_outbox_pending 
ON outbox_events (created_at) 
WHERE status = 'PENDING';
```

---

## 2. API Architecture & REST Specifications (`/api/v1`)

* **Standards:** RESTful JSON, RFC 7807 Problem Details for errors, Cursor-based pagination (`limit`, `cursor`).
* **Authentication:** `Authorization: Bearer <JWT_ACCESS_TOKEN>` or Secure HTTP-only Cookie.

### 2.1 Core API Endpoints

| Method | Endpoint | Description | Permissions Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/projects/:key/tickets` | Query project tickets (with cursor pagination, filtering) | `PROJECT_VIEW` (bitmask) |
| `POST` | `/api/v1/projects/:key/tickets` | Create a new ticket (auto-assigns ticket key e.g. `CORE-1043`) | `TICKET_CREATE` (bitmask) |
| `GET` | `/api/v1/tickets/:ticketKey` | Fetch ticket details, dependencies, and SLA timer | `TICKET_VIEW` (bitmask) |
| `PATCH` | `/api/v1/tickets/:ticketKey` | Update ticket fields (optimistic lock with `lock_version`) | `TICKET_EDIT` (bitmask) |
| `POST` | `/api/v1/tickets/:ticketKey/comments` | Post public or internal comment | `COMMENT_CREATE` (bitmask) |
| `POST` | `/api/v1/tickets/:ticketKey/attachments/presign` | Generate presigned PUT URL for direct S3 upload | `TICKET_ATTACH` (bitmask) |
| `POST` | `/api/v1/tickets/batch-update` | Bulk status/assignee updates across multiple tickets | `TICKET_BATCH_EDIT` (bitmask) |
| `POST` | `/api/v1/tickets/:ticketKey/approvals/:id/decision`| Approve or reject an ITSM approval stage | `APPROVAL_REVIEW` (bitmask) |

### 2.2 Request / Response Examples

#### Update Ticket (With Optimistic Concurrency Control)
`PATCH /api/v1/tickets/CORE-1042`

```json
{
  "status": "IN_PROGRESS",
  "assignee_id": "4b68e920-5883-4a0e-9189-63a1e1d0d932",
  "lock_version": 3,
  "custom_fields": {
    "root_cause": "Database connection timeout under peak load"
  }
}
```

**Response (200 OK):**
```json
{
  "data": {
    "id": "e93922d0-bc9b-44c1-84df-f2d1e57c6b99",
    "ticket_key": "CORE-1042",
    "status": "IN_PROGRESS",
    "lock_version": 4,
    "updated_at": "2026-11-21T10:45:00.000Z",
    "assignee": {
      "id": "4b68e920-5883-4a0e-9189-63a1e1d0d932",
      "full_name": "Devin Vance",
      "avatar_url": "https://assets.internal/avatars/devin.png"
    }
  }
}
```

**Response on Stale Conflict (409 Conflict):**
```json
{
  "type": "https://errors.company.internal/stale-version-conflict",
  "title": "Optimistic Concurrency Conflict",
  "status": 409,
  "detail": "The ticket was modified by another user while you were editing.",
  "current_lock_version": 4,
  "last_modified_by": "Sarah Connor"
}
```

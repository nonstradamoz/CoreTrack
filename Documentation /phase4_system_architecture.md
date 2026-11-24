# Phase 4 — System Architecture & Component Design

This document details the high-level system architecture, module boundaries, database entity relationships, authorization flows, and real-time event distribution for the platform.

---

## 1. High-Level Component & Module Boundaries

The backend is architected as a **High-Performance Modular Monolith** in TypeScript/Fastify. Each domain is strictly isolated with clear internal public contracts, enabling zero-friction refactoring and future extraction into independent microservices if required.

```mermaid
flowchart TD
    subgraph Boundary_IAM["1. Identity & Access Module (IAM)"]
        SSO_Handler["SSO / SAML / OIDC Authenticator"]
        SCIM_Worker["SCIM v2 User Ingestion"]
        Bitmask_Authz["Bitmask RBAC & Session Engine"]
    end

    subgraph Boundary_Core["2. Project & Workspace Module"]
        Dept_Mgr["Department & Team Hierarchy"]
        Proj_Mgr["Project Registry & Privacy Guards"]
        Scheme_Mgr["Role & Bitmask Scheme Resolver"]
    end

    subgraph Boundary_Ticket["3. Ticket & Workflow Engine"]
        Ticket_Mgr["Polymorphic Ticket Core"]
        State_Machine["Finite State Machine (FSM)"]
        Custom_Fields["JSONB Dynamic Schema Validator"]
        Dep_Graph["Directed Dependency Graph (Cycle Check)"]
    end

    subgraph Boundary_ITSM["4. ITSM & SLA Engine"]
        SLA_Timer["SLA Clock & Business Hours Calculator"]
        Approval_Pipeline["Staged Approval Coordinator"]
    end

    subgraph Boundary_Collab["5. Collaboration & Real-Time Module"]
        Comment_Mgr["Multi-Audience Comment Router"]
        WS_Gateway["WebSocket Pub/Sub Gateway"]
        Presence_Tracker["Ephemeral Redis Presence"]
    end

    subgraph Boundary_Async["6. Asynchronous Jobs & Integration Engine"]
        Rule_Engine["Automation Rule Executor (Max Depth 3)"]
        Git_Sync["GitHub / GitLab Webhook Parser"]
        Email_Gateway["Inbound Email MIME Parser"]
        Meili_Indexer["Search Outbox Indexer"]
        AV_Scanner["ClamAV Quarantined File Scanner"]
    end

    Boundary_IAM --> Boundary_Core
    Boundary_Core --> Boundary_Ticket
    Boundary_Ticket --> Boundary_ITSM
    Boundary_Ticket --> Boundary_Collab
    Boundary_Ticket --> Boundary_Async
```

---

## 2. Database Architecture: Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    DEPARTMENTS ||--o{ TEAMS : contains
    TEAMS ||--o{ TEAM_MEMBERS : has
    USERS ||--o{ TEAM_MEMBERS : belongs_to
    
    DEPARTMENTS ||--o{ PROJECTS : organizes
    TEAMS ||--o{ PROJECTS : owns
    PROJECTS ||--o{ PROJECT_MEMBERS : enrolls
    USERS ||--o{ PROJECT_MEMBERS : participates
    PROJECT_ROLES ||--o{ PROJECT_MEMBERS : assigns_role

    PROJECTS ||--o{ SPRINTS : plans
    PROJECTS ||--o{ TICKETS : contains
    SPRINTS ||--o{ TICKETS : includes

    USERS ||--o{ TICKETS : reports
    USERS ||--o{ TICKETS : assigned_to

    TICKETS ||--o{ TICKET_DEPENDENCIES : blocks_or_relates
    TICKETS ||--o{ TICKET_COMMENTS : receives
    USERS ||--o{ TICKET_COMMENTS : writes
    
    TICKETS ||--o{ TICKET_ATTACHMENTS : stores
    TICKETS ||--o{ TICKET_AUDIT_EVENTS : logs

    TICKETS ||--o{ TICKET_APPROVALS : requires
    USERS ||--o{ TICKET_APPROVALS : reviews

    DEPARTMENTS {
        uuid id PK
        varchar name
        varchar code
        timestamp created_at
    }

    TEAMS {
        uuid id PK
        uuid department_id FK
        varchar name
        varchar key_prefix
    }

    USERS {
        uuid id PK
        varchar email UK
        varchar full_name
        varchar user_type "INTERNAL_EMPLOYEE | EXTERNAL_GUEST"
        varchar status "ACTIVE | SUSPENDED | DEACTIVATED"
        bigint global_permissions
    }

    PROJECTS {
        uuid id PK
        uuid department_id FK
        uuid primary_team_id FK
        varchar key UK "e.g. CORE, SEC"
        varchar name
        varchar project_type "ENGINEERING | SERVICE_DESK"
        varchar privacy_tier "PUBLIC | TEAM_RESTRICTED | SECRET"
    }

    PROJECT_ROLES {
        uuid id PK
        uuid project_id FK "Null if global template"
        varchar role_name
        bigint permission_bitmask
    }

    TICKETS {
        uuid id PK
        uuid project_id FK
        varchar ticket_key UK "e.g. CORE-1042"
        varchar title
        text description
        varchar ticket_type "EPIC | STORY | TASK | BUG | REQUEST | INCIDENT"
        uuid parent_id FK "Capped hierarchy depth"
        uuid sprint_id FK
        varchar status "TODO | IN_PROGRESS | IN_REVIEW | DONE | etc"
        varchar priority "URGENT | HIGH | MEDIUM | LOW"
        int story_points
        uuid reporter_id FK
        uuid assignee_id FK
        int lock_version "Optimistic concurrency"
        jsonb custom_fields "Validated project attributes"
        timestamp sla_response_due_at
        timestamp sla_resolution_due_at
        timestamp due_date
        timestamp deleted_at "Soft deletion"
    }

    TICKET_DEPENDENCIES {
        uuid id PK
        uuid source_ticket_id FK
        uuid target_ticket_id FK
        varchar dependency_type "BLOCKS | RELATES_TO | DUPLICATES"
    }

    TICKET_COMMENTS {
        uuid id PK
        uuid ticket_id FK
        uuid author_id FK
        text body
        varchar visibility_scope "PUBLIC | INTERNAL_ONLY | RESTRICTED_GROUPS"
        jsonb restricted_group_ids
        timestamp created_at
    }

    TICKET_APPROVALS {
        uuid id PK
        uuid ticket_id FK
        int stage_order
        uuid reviewer_id FK
        varchar status "PENDING | APPROVED | REJECTED"
        text decision_notes
        timestamp decided_at
    }
```

---

## 3. Real-Time Event & Synchronization Architecture

To power **Linear-like sub-50ms optimistic UI** without client-server desynchronization, card movements and comment posts use an event-driven broadcast model:

```mermaid
sequenceDiagram
    autonumber
    actor Alice as Alice (Engineer)
    participant ClientA as Alice's Browser (Web)
    participant LB as Load Balancer
    participant API as Core Fastify API
    participant DB as PostgreSQL 16
    participant Redis as Redis Pub/Sub
    participant WS as WebSocket Gateway
    actor Bob as Bob (Teammate)
    participant ClientB as Bob's Browser (Web)

    Alice->>ClientA: Drags ticket CORE-104 from "Todo" to "In Progress"
    Note over ClientA: 1. Optimistic Update: Card moves instantly in UI (<10ms)
    ClientA->>LB: PATCH /api/v1/tickets/CORE-104 (status: IN_PROGRESS, version: 4)
    LB->>API: Route Request
    API->>DB: UPDATE tickets SET status = 'IN_PROGRESS', lock_version = 5 WHERE id = 104 AND lock_version = 4
    
    alt Optimistic Lock Success
        DB-->>API: 1 Row Updated
        API->>DB: INSERT INTO ticket_audit_events (...)
        API->>Redis: PUBLISH project:CORE "TICKET_UPDATED", {id: 104, status: IN_PROGRESS, version: 5}
        API-->>ClientA: 200 OK (Confirmed)
        Redis->>WS: Broadcast to project room "project:CORE"
        WS->>ClientB: WebSocket: {event: "TICKET_UPDATED", id: 104, status: IN_PROGRESS}
        ClientB->>Bob: Bob's board card automatically slides to "In Progress"
    else Stale Version Conflict (Optimistic Lock Failure)
        DB-->>API: 0 Rows Updated (lock_version mismatch)
        API-->>ClientA: 409 Conflict {current_version: 5, updated_by: "Charlie"}
        ClientA->>Alice: Rollback card & display banner: "Ticket updated by Charlie. Reloaded latest."
    end
```

---

## 4. Asynchronous Outbox & Search Indexing Pipeline

```mermaid
flowchart LR
    API["API Request"] -->|1. Write Ticket & Outbox Event in Single DB Tx| PG[(PostgreSQL 16)]
    PG -->|Table: outbox_events| Worker["Outbox Poller Worker (BullMQ)"]
    Worker -->|2. Batch Index Documents| Meili[(Meilisearch Engine)]
    Worker -->|3. Mark Event Processed| PG
```

This guarantees **zero lost search index updates** even if the background worker or search container crashes.

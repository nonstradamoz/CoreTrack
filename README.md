# CoreTrack

Enterprise Task Management, ITSM Ticketing & Agile Delivery Platform built as a `pnpm` TypeScript monorepo.

## Architecture

```text
├── apps/
│   ├── api/        # Fastify REST & WebSocket API (port 4000)
│   └── web/        # Next.js frontend application (port 3000)
├── packages/
│   ├── db/         # Drizzle ORM schema, migrations & seed scripts (PostgreSQL 16)
│   └── shared/     # Shared Zod schemas, RBAC bitmask permissions & types
├── docker-compose.yml
├── render.yaml     # Render deployment blueprint
└── vercel.json     # Vercel deployment configuration
```

## Key Features

- **Project & Task Management**: Multi-team projects, Kanban board (`To Do`, `Pending Approval`, `In Progress`, `In Review`, `Done`, `Canceled`), sprint planning, milestones, dependencies, and optimistic concurrency (`lockVersion`).
- **Project Summariser**: Live deterministic breakdown of **Tasks Completed**, **Blockers Present** (explicitly blocked, dependency-blocked, and overdue tasks), and **Tasks Planned**, with optional AI executive narrative via `GEMINI_API_KEY` or `OPENAI_API_KEY`.
- **ITSM Service Desk Portal**: Service catalog requests, approval workflows, SLA tracking, and internal/public comments.
- **Reports & Analytics**: Project Overview, Sprint Burndown, Velocity History, and **Workload & SLA** with a user-specific performance & SLA review panel.
- **Daily Standup**: Auto-compiled daily task status with team-isolated **Team Feed** (`Cmd+D`).
- **Team & RBAC Management**: 64-bit bitmask RBAC (`Super Admin`, `Admin`, `Manager`, `Team Lead`, `Employee`), full team member & lead editing, and password authentication (`crypto.scrypt`) with first-login forced password setup/change.
- **Real-Time & Communications**: WebSocket project updates, team chat, notifications, and multi-provider email delivery (Resend, Mailjet, custom SMTP).

## Prerequisites

- **Node.js** 20+
- **pnpm** `10.5.2` (`corepack enable`)
- **Docker & Docker Compose** (for PostgreSQL 16, Redis 7, Meilisearch, and MinIO)

## Local Setup

1. **Install dependencies**
   ```bash
   pnpm install
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   Update `.env` as needed (defaults work out-of-the-box with `docker-compose.yml`).
   - Optional AI Project Summariser: set `GEMINI_API_KEY` or `OPENAI_API_KEY` in `.env`.

3. **Start backing services**
   ```bash
   pnpm docker:up
   ```
   Services started:
   - PostgreSQL 16 (`localhost:5432`)
   - Redis 7 (`localhost:6379`)
   - Meilisearch (`localhost:7700`)
   - MinIO S3 (`localhost:9000`, console `localhost:9001`)

4. **Push database schema & seed data**
   ```bash
   pnpm --filter @coretrack/db db:push
   pnpm --filter @coretrack/db db:seed
   ```

5. **Run development servers**
   ```bash
   pnpm dev
   ```
   - Web app: `http://localhost:3000`
   - API server: `http://localhost:4000`

## Useful Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Run API and Web apps in parallel |
| `pnpm dev:api` | Run only `@coretrack/api` |
| `pnpm dev:web` | Run only `@coretrack/web` |
| `pnpm build` | Build all workspace packages |
| `pnpm lint` | Run linters across all packages |
| `pnpm test` | Run tests across all packages |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Run Drizzle migrations |
| `pnpm db:studio` | Open Drizzle Studio |
| `pnpm docker:up` | Start local Docker services |
| `pnpm docker:down` | Stop local Docker services |

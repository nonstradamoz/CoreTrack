import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { pool, db, tickets, ticketApprovals, projects, users, eq, clearSampleData, seed } from '@coretrack/db';
import { sendEmailNotification, setMockProviderChain } from '../src/services/email.js';

describe('CoreTrack API Tests', () => {
  beforeAll(async () => {
    await seed(false);
  });

  afterAll(async () => {
    await clearSampleData();
    await pool.end();
  });

  it('GET /api/v1/health should return healthy status and database connected', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('healthy');
    expect(body.database).toBe('connected');
    await app.close();
  });

  it('GET /api/v1/projects should return seeded projects', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/projects',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.some((p: { key: string }) => p.key === 'CORE')).toBe(true);
    await app.close();
  });

  it('GET /api/v1/tickets should return list of seeded tickets', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tickets?projectKey=CORE',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.some((t: { ticketKey: string }) => t.ticketKey === 'CORE-1')).toBe(true);
    await app.close();
  });

  it('POST & GET /api/v1/tickets/:ticketKey/comments should create and list comments', async () => {
    const app = await buildApp();
    const postRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tickets/CORE-1/comments',
      payload: {
        body: 'Investigating Redis caching latency under peak load.',
        visibilityScope: 'INTERNAL_ONLY',
      },
    });

    expect(postRes.statusCode).toBe(201);
    const created = postRes.json();
    expect(created.data.body).toBe('Investigating Redis caching latency under peak load.');
    expect(created.data.visibilityScope).toBe('INTERNAL_ONLY');

    const getRes = await app.inject({
      method: 'GET',
      url: '/api/v1/tickets/CORE-1/comments',
    });

    expect(getRes.statusCode).toBe(200);
    const comments = getRes.json();
    expect(comments.data.length).toBeGreaterThan(0);
    expect(comments.data[0].visibilityScope).toBe('INTERNAL_ONLY');
    await app.close();
  });

  it('PATCH /api/v1/tickets/:ticketKey should reject stale lock_version with 409 Conflict', async () => {
    const app = await buildApp();
    const conflictRes = await app.inject({
      method: 'PATCH',
      url: '/api/v1/tickets/CORE-1',
      payload: {
        lockVersion: 99999, // Stale version
        status: 'DONE',
      },
    });

    expect(conflictRes.statusCode).toBe(409);
    const errorBody = conflictRes.json();
    expect(errorBody.title).toBe('Optimistic Concurrency Conflict');
    await app.close();
  });

  it('GET /api/v1/auth/me and /api/v1/auth/users should return authenticated user and directory', async () => {
    const app = await buildApp();
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
    });

    expect(meRes.statusCode).toBe(200);
    const meBody = meRes.json();
    expect(meBody.data.email).toBeDefined();
    expect(meBody.data.globalPermissions).toBeDefined();

    const usersRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/users',
    });

    expect(usersRes.statusCode).toBe(200);
    const usersBody = usersRes.json();
    expect(usersBody.data.length).toBeGreaterThanOrEqual(3);

    const switchRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/switch-user',
      payload: {
        email: 'engineer@coretrack.internal',
      },
    });

    expect(switchRes.statusCode).toBe(200);
    expect(switchRes.json().data.user.email).toBe('engineer@coretrack.internal');

    // Switch back to admin
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/switch-user',
      payload: {
        email: 'admin@coretrack.internal',
      },
    });

    await app.close();
  });

  it('POST & GET /api/v1/projects/CORE/sprints should manage sprint lifecycle', async () => {
    const app = await buildApp();
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/CORE/sprints',
      payload: {
        name: 'Sprint Test Auto',
        goal: 'Validate automated sprint capacity metrics',
      },
    });

    expect(createRes.statusCode).toBe(201);
    const createdSprint = createRes.json().data;
    expect(createdSprint.name).toBe('Sprint Test Auto');
    expect(createdSprint.status).toBe('PLANNING');

    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/CORE/sprints',
    });

    expect(listRes.statusCode).toBe(200);
    const sprintList = listRes.json().data;
    expect(sprintList.some((s: { id: string }) => s.id === createdSprint.id)).toBe(true);

    // Update sprint to ACTIVE
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/sprints/${createdSprint.id}`,
      payload: {
        status: 'ACTIVE',
      },
    });

    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().data.status).toBe('ACTIVE');

    await app.close();
  });

  it('POST /api/v1/tickets should auto-calculate ITSM SLA due dates', async () => {
    const app = await buildApp();
    const projRes = await app.inject({
      method: 'GET',
      url: '/api/v1/projects',
    });
    const hdProject = projRes.json().data.find((p: { key: string }) => p.key === 'HD');

    const createTicketRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tickets',
      payload: {
        projectId: hdProject.id,
        title: 'IT Incident: VPN Gateway unresponsive',
        ticketType: 'INCIDENT',
        priority: 'URGENT',
        status: 'TODO',
      },
    });

    expect(createTicketRes.statusCode).toBe(201);
    const createdTicket = createTicketRes.json().data;
    expect(createdTicket.slaResponseDueAt).toBeDefined();
    expect(createdTicket.slaResolutionDueAt).toBeDefined();
    expect(createdTicket.isSlaPaused).toBe(false);

    // Transition to PENDING_APPROVAL and check that SLA is auto-paused
    const pauseRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tickets/${createdTicket.ticketKey}`,
      payload: {
        lockVersion: createdTicket.lockVersion,
        status: 'PENDING_APPROVAL',
      },
    });

    expect(pauseRes.statusCode).toBe(200);
    expect(pauseRes.json().data.isSlaPaused).toBe(true);

    await app.close();
  });

  it('POST & PATCH /api/v1/tickets should auto-default deadline when task is assigned', async () => {
    const app = await buildApp();
    const projRes = await app.inject({ method: 'GET', url: '/api/v1/projects' });
    const coreProject = projRes.json().data.find((p: { key: string }) => p.key === 'CORE');
    const usersRes = await app.inject({ method: 'GET', url: '/api/v1/auth/users' });
    const testUser = usersRes.json().data[0];

    // 1. Create task with assignee but no deadline -> auto-default +7 days
    const createAssignedRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tickets',
      payload: {
        projectId: coreProject.id,
        title: 'Assigned Task without explicit deadline',
        ticketType: 'TASK',
        priority: 'MEDIUM',
        status: 'TODO',
        assigneeId: testUser.id,
      },
    });

    expect(createAssignedRes.statusCode).toBe(201);
    const assignedTicket = createAssignedRes.json().data;
    expect(assignedTicket.assigneeId).toBe(testUser.id);
    expect(assignedTicket.dueDate).toBeDefined();
    const dueDate = new Date(assignedTicket.dueDate);
    const expectedMinDate = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);
    expect(dueDate.getTime()).toBeGreaterThan(expectedMinDate.getTime());

    // 2. Create unassigned task, then assign it via PATCH -> auto-default +7 days
    const createUnassignedRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tickets',
      payload: {
        projectId: coreProject.id,
        title: 'Initially unassigned task',
        ticketType: 'TASK',
        priority: 'MEDIUM',
        status: 'TODO',
      },
    });

    expect(createUnassignedRes.statusCode).toBe(201);
    const unassignedTicket = createUnassignedRes.json().data;
    expect(unassignedTicket.dueDate).toBeNull();

    const patchAssignRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tickets/${unassignedTicket.ticketKey}`,
      payload: {
        lockVersion: unassignedTicket.lockVersion,
        assigneeId: testUser.id,
      },
    });

    expect(patchAssignRes.statusCode).toBe(200);
    const patchedTicket = patchAssignRes.json().data;
    expect(patchedTicket.assigneeId).toBe(testUser.id);
    expect(patchedTicket.dueDate).toBeDefined();

    await app.close();
  });

  it('POST /api/v1/tickets/:ticketKey/dependencies should link dependencies and reject cycles', async () => {
    const app = await buildApp();

    // Link CORE-1 blocks CORE-2
    const linkRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tickets/CORE-1/dependencies',
      payload: {
        targetTicketKey: 'CORE-2',
        dependencyType: 'BLOCKS',
      },
    });
    expect([201, 200]).toContain(linkRes.statusCode);

    // Attempting to link CORE-2 blocks CORE-1 must be rejected with 400 (Cyclic Dependency)
    const cycleRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tickets/CORE-2/dependencies',
      payload: {
        targetTicketKey: 'CORE-1',
        dependencyType: 'BLOCKS',
      },
    });
    expect(cycleRes.statusCode).toBe(400);
    expect(cycleRes.json().error).toBe('CYCLIC_DEPENDENCY_DETECTED');

    await app.close();
  });

  it('POST /api/v1/tickets/bulk should update multiple tickets atomically', async () => {
    const app = await buildApp();

    const bulkRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tickets/bulk',
      payload: {
        ticketKeys: ['CORE-1', 'CORE-2'],
        status: 'IN_PROGRESS',
        priority: 'HIGH',
      },
    });

    expect(bulkRes.statusCode).toBe(200);
    const body = bulkRes.json();
    expect(body.success).toBe(true);
    expect(body.updatedCount).toBeGreaterThanOrEqual(2);

    await app.close();
  });

  it('GET /api/v1/tickets/search/global and attachments should search and handle attachments', async () => {
    const app = await buildApp();

    // Test Search
    const searchRes = await app.inject({
      method: 'GET',
      url: '/api/v1/tickets/search/global?q=CORE',
    });
    expect(searchRes.statusCode).toBe(200);
    expect(searchRes.json().data.length).toBeGreaterThan(0);

    // Test Attachment Presign
    const attachRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tickets/CORE-1/attachments/presign',
      payload: {
        fileName: 'architecture_diagram.png',
        fileSize: 1024 * 50,
        mimeType: 'image/png',
      },
    });
    expect(attachRes.statusCode).toBe(201);
    expect(attachRes.json().data.s3Key).toBeDefined();

    // List attachments
    const listAttachRes = await app.inject({
      method: 'GET',
      url: '/api/v1/tickets/CORE-1/attachments',
    });
    expect(listAttachRes.statusCode).toBe(200);
    expect(listAttachRes.json().data.length).toBeGreaterThan(0);

    await app.close();
  });

  it('Tier 2: ITSM Staged Multi-Tier Approvals & State Machine Guard', async () => {
    const app = await buildApp();

    // Clean up any existing approvals for CORE-1 to guarantee clean state
    const t = await db.query.tickets.findFirst({ where: eq(tickets.ticketKey, 'CORE-1') });
    if (t) {
      await db.delete(ticketApprovals).where(eq(ticketApprovals.ticketId, t.id));
    }

    // 1. Request Approval
    const reqRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tickets/CORE-1/approvals',
      payload: {
        tier: 1,
      },
    });

    expect(reqRes.statusCode).toBe(201);
    const approval = reqRes.json().data;
    expect(approval.tier).toBe(1);
    expect(approval.status).toBe('PENDING');

    // Verify ticket entered PENDING_APPROVAL and SLA paused
    const ticketPendingRes = await app.inject({
      method: 'GET',
      url: '/api/v1/tickets/CORE-1',
    });
    expect(ticketPendingRes.statusCode).toBe(200);
    const pendingTicket = ticketPendingRes.json().data;
    expect(pendingTicket.status).toBe('PENDING_APPROVAL');
    expect(pendingTicket.isSlaPaused).toBe(true);

    // 2. Fetch Approvals List
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/tickets/CORE-1/approvals',
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data.length).toBeGreaterThan(0);

    // 3. Approve Decision
    const decideRes = await app.inject({
      method: 'POST',
      url: `/api/v1/tickets/CORE-1/approvals/${approval.id}/decision`,
      payload: {
        decision: 'APPROVED',
        comment: 'Verified architecture requirements and sign-off approved.',
      },
    });

    expect(decideRes.statusCode).toBe(200);
    const decideBody = decideRes.json();
    expect(decideBody.data.status).toBe('APPROVED');
    expect(decideBody.ticketStatus).toBe('IN_PROGRESS');

    // Verify ticket SLA is unpaused and in IN_PROGRESS
    const ticketApprovedRes = await app.inject({
      method: 'GET',
      url: '/api/v1/tickets/CORE-1',
    });
    const unpausedTicket = ticketApprovedRes.json().data;
    expect(unpausedTicket.status).toBe('IN_PROGRESS');
    expect(unpausedTicket.isSlaPaused).toBe(false);

    await app.close();
  });

  it('Tier 2: GitHub Webhook Automation (PR Open -> IN_REVIEW, PR Merge -> DONE)', async () => {
    const app = await buildApp();

    // 1. Webhook PR Opened
    const prOpenRes = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/github',
      headers: {
        'x-github-event': 'pull_request',
      },
      payload: {
        action: 'opened',
        pull_request: {
          id: 4001,
          title: 'feat: Implement caching layer for CORE-1',
          html_url: 'https://github.com/coretrack/coretrack/pull/4001',
          head: {
            ref: 'feat/CORE-1-caching',
          },
        },
      },
    });

    expect(prOpenRes.statusCode).toBe(200);
    const openData = prOpenRes.json();
    expect(openData.matchedTickets).toContain('CORE-1');

    // Verify ticket moved to IN_REVIEW
    const ticketInReviewRes = await app.inject({
      method: 'GET',
      url: '/api/v1/tickets/CORE-1',
    });
    expect(ticketInReviewRes.json().data.status).toBe('IN_REVIEW');

    // Verify VCS links recorded
    const vcsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/tickets/CORE-1/vcs-links',
    });
    expect(vcsRes.statusCode).toBe(200);
    const vcsLinks = vcsRes.json().data;
    expect(vcsLinks.some((l: { title: string }) => l.title.includes('CORE-1'))).toBe(true);

    // 2. Webhook PR Merged
    const prMergedRes = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/github',
      headers: {
        'x-github-event': 'pull_request',
      },
      payload: {
        action: 'closed',
        pull_request: {
          id: 4001,
          merged: true,
          title: 'feat: Implement caching layer for CORE-1',
          html_url: 'https://github.com/coretrack/coretrack/pull/4001',
          head: {
            ref: 'feat/CORE-1-caching',
          },
        },
      },
    });

    expect(prMergedRes.statusCode).toBe(200);

    // Verify ticket moved to DONE
    const ticketDoneRes = await app.inject({
      method: 'GET',
      url: '/api/v1/tickets/CORE-1',
    });
    expect(ticketDoneRes.json().data.status).toBe('DONE');

    await app.close();
  });

  it('Tier 2: Agile Burndown & Team Velocity Reports', async () => {
    const app = await buildApp();

    // 1. Team Velocity Report
    const velRes = await app.inject({
      method: 'GET',
      url: '/api/v1/reports/velocity?projectKey=CORE',
    });

    expect(velRes.statusCode).toBe(200);
    const velData = velRes.json().data;
    expect(velData.projectKey).toBe('CORE');
    expect(typeof velData.averageVelocity).toBe('number');
    expect(Array.isArray(velData.velocityHistory)).toBe(true);

    // 2. Sprint Burndown Report
    const sprintsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/CORE/sprints',
    });
    expect(sprintsRes.statusCode).toBe(200);
    const sprintsList = sprintsRes.json().data;

    if (sprintsList.length > 0) {
      const burnRes = await app.inject({
        method: 'GET',
        url: `/api/v1/reports/burndown?sprintId=${sprintsList[0].id}`,
      });

      expect(burnRes.statusCode).toBe(200);
      const burnData = burnRes.json().data;
      expect(burnData.sprint).toBeDefined();
      expect(Array.isArray(burnData.dataPoints)).toBe(true);
      expect(burnData.dataPoints.length).toBeGreaterThan(0);
    }

    await app.close();
  });

  it('GET /api/v1/dashboard/portfolio should return cross-project portfolio health & metrics', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/portfolio',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toBeDefined();

    // Verify Summary KPIs
    expect(body.data.summary).toBeDefined();
    expect(typeof body.data.summary.totalProjects).toBe('number');
    expect(typeof body.data.summary.totalTicketsCount).toBe('number');
    expect(typeof body.data.summary.completionRate).toBe('number');
    expect(typeof body.data.summary.slaAtRiskCount).toBe('number');

    // Verify Project Health Cards
    expect(Array.isArray(body.data.projectsHealth)).toBe(true);
    expect(body.data.projectsHealth.length).toBeGreaterThan(0);
    const firstProject = body.data.projectsHealth[0];
    expect(firstProject.key).toBeDefined();
    expect(typeof firstProject.completionPercentage).toBe('number');
    expect(['ON_TRACK', 'AT_RISK', 'IN_PROGRESS']).toContain(firstProject.healthStatus);

    // Verify Cross-Project Blockers, Critical Risk Tickets, Team Workload
    expect(Array.isArray(body.data.crossProjectBlockers)).toBe(true);
    expect(Array.isArray(body.data.criticalRiskTickets)).toBe(true);
    expect(Array.isArray(body.data.teamWorkload)).toBe(true);

    await app.close();
  });

  it('Tier 3: Automation Rule Engine (Triggers, Conditions, Actions & Loop Suppression)', async () => {
    const app = await buildApp();
    const projRes = await app.inject({ method: 'GET', url: '/api/v1/projects' });
    const coreProject = projRes.json().data.find((p: { key: string }) => p.key === 'CORE');

    // 1. Create an Automation Rule: When task created with INCIDENT type -> Set Priority URGENT & Add 2-day deadline
    const createRuleRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/CORE/automation/rules',
      payload: {
        name: 'Auto-Escalate Urgent Incidents',
        description: 'Auto-set priority to URGENT when incident is created',
        triggerType: 'TASK_CREATED',
        conditions: [
          { field: 'ticketType', operator: 'EQUALS', value: 'INCIDENT' },
        ],
        actions: [
          { type: 'SET_PRIORITY', value: 'URGENT' },
          { type: 'ADD_DEADLINE_DAYS', value: 2 },
          { type: 'ADD_COMMENT', value: 'Priority auto-escalated by rule.' },
        ],
        isActive: true,
      },
    });

    expect(createRuleRes.statusCode).toBe(201);
    const createdRule = createRuleRes.json().data;
    expect(createdRule.id).toBeDefined();

    // 2. Create an INCIDENT with LOW priority -> triggers rule
    const taskRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tickets',
      payload: {
        projectId: coreProject.id,
        title: 'Network outage in Block A',
        ticketType: 'INCIDENT',
        priority: 'LOW',
        status: 'TODO',
      },
    });

    expect(taskRes.statusCode).toBe(201);
    const createdTask = taskRes.json().data;

    // Small delay to allow async engine execution
    await new Promise((r) => setTimeout(r, 150));

    // Fetch the updated task from database
    const verifyRes = await app.inject({
      method: 'GET',
      url: `/api/v1/tickets/${createdTask.ticketKey}`,
    });

    expect(verifyRes.statusCode).toBe(200);
    const updatedTask = verifyRes.json().data;
    expect(updatedTask.priority).toBe('URGENT');
    expect(updatedTask.dueDate).toBeDefined();

    // 3. Verify rule execution count incremented
    const listRulesRes = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/CORE/automation/rules',
    });
    expect(listRulesRes.statusCode).toBe(200);
    const rules = listRulesRes.json().data;
    const ruleInDb = rules.find((r: { id: string }) => r.id === createdRule.id);
    expect(ruleInDb.executionCount).toBeGreaterThan(0);

    // Clean up rule
    await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/CORE/automation/rules/${createdRule.id}`,
    });

    await app.close();
  });

  it('Tier 3: Batch Import & Export Tasks (CSV and Jira JSON structure)', async () => {
    const app = await buildApp();

    // 1. Batch Import Tasks
    const importRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/CORE/import/batch',
      payload: {
        tasks: [
          {
            title: 'Imported Task Alpha',
            ticketType: 'TASK',
            priority: 'HIGH',
            status: 'TODO',
            storyPoints: 5,
          },
          {
            title: 'Imported Bug Beta',
            ticketType: 'BUG',
            priority: 'URGENT',
            status: 'IN_PROGRESS',
            storyPoints: 3,
          },
        ],
      },
    });

    expect(importRes.statusCode).toBe(201);
    const importData = importRes.json();
    expect(importData.success).toBe(true);
    expect(importData.importedCount).toBe(2);
    expect(importData.ticketKeys.length).toBe(2);

    // 2. Export Project Tasks as CSV
    const exportRes = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/CORE/export/csv',
    });

    expect(exportRes.statusCode).toBe(200);
    expect(exportRes.headers['content-type']).toContain('text/csv');
    expect(exportRes.payload).toContain('Key,Type,Title,Status,Priority');
    expect(exportRes.payload).toContain('Imported Task Alpha');

    await app.close();
  });

  it('Daily Status Update & Standup: Auto-compilation, Copyable Summary, and Team Feed', async () => {
    const app = await buildApp();
    const projRes = await app.inject({ method: 'GET', url: '/api/v1/projects' });
    const coreProject = projRes.json().data.find((p: { key: string }) => p.key === 'CORE');
    const usersRes = await app.inject({ method: 'GET', url: '/api/v1/auth/users' });
    const testUser = usersRes.json().data[0];

    // 1. Create a task assigned to testUser and mark it DONE today
    const taskRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tickets',
      payload: {
        projectId: coreProject.id,
        title: 'Complete Standup Feature Implementation',
        ticketType: 'TASK',
        priority: 'HIGH',
        status: 'DONE',
        assigneeId: testUser.id,
        storyPoints: 3,
      },
    });
    expect(taskRes.statusCode).toBe(201);

    // 2. GET /api/v1/standups/today
    const todayRes = await app.inject({
      method: 'GET',
      url: `/api/v1/standups/today?projectKey=CORE`,
    });

    expect(todayRes.statusCode).toBe(200);
    const todayData = todayRes.json().data;
    expect(todayData.user).toBeDefined();
    expect(todayData.project.key).toBe('CORE');
    expect(todayData.autoCompiled).toBeDefined();
    expect(Array.isArray(todayData.autoCompiled.completed)).toBe(true);
    expect(todayData.generatedSummaryMarkdown).toContain('Completed Today');

    // 3. POST /api/v1/standups -> Save daily standup
    const todayStr = new Date().toISOString().split('T')[0];
    const saveRes = await app.inject({
      method: 'POST',
      url: '/api/v1/standups',
      payload: {
        projectId: coreProject.id,
        standupDate: todayStr,
        completedTaskIds: todayData.autoCompiled.completed,
        inProgressTaskIds: todayData.autoCompiled.inProgress,
        blockers: 'None',
        customNotes: 'Wrapped up all standup sprint items on schedule.',
        summaryMarkdown: todayData.generatedSummaryMarkdown,
      },
    });

    expect(saveRes.statusCode).toBe(200);
    expect(saveRes.json().data.id).toBeDefined();

    // 4. GET /api/v1/standups/team -> Team roll-up feed
    const teamRes = await app.inject({
      method: 'GET',
      url: `/api/v1/standups/team?projectKey=CORE&date=${todayStr}`,
    });

    expect(teamRes.statusCode).toBe(200);
    const teamData = teamRes.json().data;
    expect(teamData.projectKey).toBe('CORE');
    expect(Array.isArray(teamData.standups)).toBe(true);
    expect(teamData.standups.length).toBeGreaterThan(0);
    expect(teamData.standups[0].summaryMarkdown).toContain('Completed Today');

    await app.close();
  });

  it('Tier 3: Dynamic RBAC Roles, Bitmask Permissions & Project Membership', async () => {
    const app = await buildApp();

    // 1. GET /api/v1/permissions/definitions
    const defsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/permissions/definitions',
    });
    expect(defsRes.statusCode).toBe(200);
    const defs = defsRes.json().data;
    expect(Array.isArray(defs)).toBe(true);
    expect(defs.length).toBeGreaterThan(15);
    expect(defs.find((d: any) => d.key === 'ORG_ADMIN')).toBeDefined();
    expect(defs.find((d: any) => d.key === 'MEMBER_MANAGE')).toBeDefined();

    // 2. GET /api/v1/roles?projectKey=CORE
    const rolesRes = await app.inject({
      method: 'GET',
      url: '/api/v1/roles?projectKey=CORE',
    });
    expect(rolesRes.statusCode).toBe(200);
    const rolesList = rolesRes.json().data;
    expect(rolesList.length).toBeGreaterThanOrEqual(5);
    const adminRole = rolesList.find((r: any) => r.name === 'Super Admin' || r.name === 'Organization Admin');
    const leadRole = rolesList.find((r: any) => r.name === 'Team Lead') || adminRole;
    expect(adminRole).toBeDefined();
    expect(adminRole.isSystem).toBe(true);

    // 3. POST /api/v1/roles -> Create custom dynamic role
    const createRoleRes = await app.inject({
      method: 'POST',
      url: '/api/v1/roles',
      headers: {
        'x-user-email': 'admin@coretrack.internal',
      },
      payload: {
        name: 'Release Specialist',
        description: 'Authorized to transition tasks and manage sprints only',
        color: '#8B5CF6',
        permissions: (1n << 8n | 1n << 13n | 1n << 20n | 1n << 25n).toString(),
        projectKey: 'CORE',
      },
    });
    expect(createRoleRes.statusCode).toBe(201);
    const createdRole = createRoleRes.json().data;
    expect(createdRole.name).toBe('Release Specialist');
    expect(createdRole.color).toBe('#8B5CF6');

    // 4. PATCH /api/v1/roles/:roleId -> Update role permissions
    const updateRoleRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/roles/${createdRole.id}`,
      headers: {
        'x-user-email': 'admin@coretrack.internal',
      },
      payload: {
        description: 'Updated release description with added ticket view capability',
        color: '#A855F7',
      },
    });
    expect(updateRoleRes.statusCode).toBe(200);
    expect(updateRoleRes.json().data.description).toContain('Updated release description');

    // 5. GET /api/v1/projects/CORE/members
    const membersRes = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/CORE/members',
    });
    expect(membersRes.statusCode).toBe(200);
    const members = membersRes.json().data;
    expect(Array.isArray(members)).toBe(true);
    expect(members.length).toBeGreaterThanOrEqual(2);

    // 6. POST /api/v1/projects/CORE/members -> Assign custom role to member
    const targetMember = members.find((m: any) => m.email === 'engineer@coretrack.internal') || members[0];
    const assignRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/CORE/members',
      headers: {
        'x-user-email': 'admin@coretrack.internal',
      },
      payload: {
        userId: targetMember.userId,
        roleId: createdRole.id,
      },
    });
    expect(assignRes.statusCode).toBe(200);

    // 7. GET /api/v1/auth/me?projectKey=CORE
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me?projectKey=CORE',
      headers: {
        'x-user-email': 'engineer@coretrack.internal',
      },
    });
    expect(meRes.statusCode).toBe(200);
    const meData = meRes.json().data;
    expect(meData.roleName).toBe('Release Specialist');

    // 8. DELETE /api/v1/roles/:roleId -> Clean up custom role
    // First remove or reassign the member to avoid FK constraint
    await app.inject({
      method: 'POST',
      url: '/api/v1/projects/CORE/members',
      headers: {
        'x-user-email': 'admin@coretrack.internal',
      },
      payload: {
        userId: targetMember.userId,
        roleId: leadRole.id,
      },
    });

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/roles/${createdRole.id}`,
      headers: {
        'x-user-email': 'admin@coretrack.internal',
      },
    });
    expect(delRes.statusCode).toBe(200);

    await app.close();
  });

  it('Tier 4: Project Management Module & Metrics', async () => {
    const app = await buildApp();

    // 1. GET /api/v1/projects/dashboard/metrics
    const metricsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/dashboard/metrics',
    });
    expect(metricsRes.statusCode).toBe(200);
    const metrics = metricsRes.json().data;
    expect(metrics.totalProjects).toBeGreaterThanOrEqual(2);
    expect(typeof metrics.overallProgress).toBe('number');
    expect(Array.isArray(metrics.upcomingDeadlines)).toBe(true);

    // 2. GET /api/v1/projects/CORE
    const projRes = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/CORE',
    });
    expect(projRes.statusCode).toBe(200);
    const proj = projRes.json().data;
    expect(proj.key).toBe('CORE');
    expect(proj.projectManager).toBeDefined();
    expect(proj.reviewer).toBeDefined();
    expect(Array.isArray(proj.milestones)).toBe(true);
    expect(Array.isArray(proj.activityLogs)).toBe(true);

    // 3. POST /api/v1/projects/CORE/milestones
    const addMileRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/CORE/milestones',
      headers: {
        'x-user-email': 'admin@coretrack.internal',
      },
      payload: {
        title: 'Q4 Performance Hardening',
        description: 'Load test API at 10k req/s',
        status: 'PENDING',
        dueDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });
    expect(addMileRes.statusCode).toBe(201);
    const newMilestone = addMileRes.json().data;
    expect(newMilestone.title).toBe('Q4 Performance Hardening');

    // 4. PATCH /api/v1/projects/CORE/milestones/:id
    const patchMileRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/CORE/milestones/${newMilestone.id}`,
      headers: {
        'x-user-email': 'admin@coretrack.internal',
      },
      payload: {
        status: 'COMPLETED',
      },
    });
    expect(patchMileRes.statusCode).toBe(200);
    expect(patchMileRes.json().data.status).toBe('COMPLETED');

    // 5. DELETE /api/v1/projects/CORE/milestones/:id
    const delMileRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/CORE/milestones/${newMilestone.id}`,
      headers: {
        'x-user-email': 'admin@coretrack.internal',
      },
    });
    expect(delMileRes.statusCode).toBe(200);

    await app.close();
  });

  it('Tier 4: Team Management & Employee Allocation', async () => {
    const app = await buildApp();

    // 1. GET /api/v1/teams
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/teams',
    });
    expect(listRes.statusCode).toBe(200);
    const teamsList = listRes.json().data;
    expect(Array.isArray(teamsList)).toBe(true);
    const engTeam = teamsList.find((t: any) => t.keyPrefix === 'PLAT');
    expect(engTeam).toBeDefined();
    expect(engTeam.lead).toBeDefined();
    expect(engTeam.memberCount).toBeGreaterThanOrEqual(1);

    // 2. POST /api/v1/teams -> Create new team
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/teams',
      headers: {
        'x-user-email': 'admin@coretrack.internal',
      },
      payload: {
        name: 'Design Systems Team',
        keyPrefix: 'DST',
        departmentId: engTeam.departmentId,
        description: 'Design token governance and UI component library.',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const createdTeam = createRes.json().data;
    expect(createdTeam.name).toBe('Design Systems Team');

    // 3. POST /api/v1/teams/:id/members -> Add member
    const usersRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/users',
    });
    const usersList = usersRes.json().data;
    const testUser = usersList.find((u: any) => u.email === 'engineer@coretrack.internal') || usersList[0];

    const addMemberRes = await app.inject({
      method: 'POST',
      url: `/api/v1/teams/${createdTeam.id}/members`,
      headers: {
        'x-user-email': 'admin@coretrack.internal',
      },
      payload: {
        userId: testUser.id,
        role: 'LEAD',
      },
    });
    expect(addMemberRes.statusCode).toBe(201);

    // 4. DELETE /api/v1/teams/:id/members/:userId -> Remove member
    const remMemberRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/teams/${createdTeam.id}/members/${testUser.id}`,
      headers: {
        'x-user-email': 'admin@coretrack.internal',
      },
    });
    expect(remMemberRes.statusCode).toBe(200);

    // 5. DELETE /api/v1/teams/:id -> Clean up team
    const delTeamRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/teams/${createdTeam.id}`,
      headers: {
        'x-user-email': 'admin@coretrack.internal',
      },
    });
    expect(delTeamRes.statusCode).toBe(200);

    await app.close();
  });

  it('Tier 5: Automated Email Notifications, Deadline Scanner & Backlog Auto-Sprint Promotion', async () => {
    const app = await buildApp();

    // 1. Create a test project with overdue deadline
    const pastDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const createProjRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { 'x-user-email': 'admin@coretrack.internal' },
      payload: {
        key: 'ESCAL',
        name: 'Escalation & Automation Test Project',
        description: 'Verifies email escalations and auto-sprint promotions',
        deadline: pastDate,
      },
    });
    expect(createProjRes.statusCode).toBe(201);
    const createdProject = createProjRes.json().data;

    // 2. Create an active sprint in project ESCAL
    const createSprintRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/ESCAL/sprints',
      headers: { 'x-user-email': 'admin@coretrack.internal' },
      payload: {
        name: 'Active Sprint 1',
        goal: 'Testing auto backlog promotion',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });
    expect(createSprintRes.statusCode).toBe(201);
    const sprint = createSprintRes.json().data;

    // Activate the sprint
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/ESCAL/sprints/${sprint.id}`,
      headers: { 'x-user-email': 'admin@coretrack.internal' },
      payload: { status: 'ACTIVE' },
    });

    // 3. Create a backlog ticket nearing deadline (2 days from now)
    const approachingDeadline = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const createBacklogRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tickets',
      headers: { 'x-user-email': 'admin@coretrack.internal' },
      payload: {
        projectId: createdProject.id,
        title: 'Urgent Backlog Task Nearing Deadline',
        ticketType: 'TASK',
        priority: 'HIGH',
        status: 'BACKLOG',
        dueDate: approachingDeadline,
      },
    });
    expect(createBacklogRes.statusCode).toBe(201);
    const backlogTicket = createBacklogRes.json().data;

    // 4. Create an overdue unfinished ticket
    const createOverdueRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tickets',
      headers: { 'x-user-email': 'admin@coretrack.internal' },
      payload: {
        projectId: createdProject.id,
        title: 'Delayed Task Past Deadline',
        ticketType: 'BUG',
        priority: 'URGENT',
        status: 'TODO',
        dueDate: pastDate,
      },
    });
    expect(createOverdueRes.statusCode).toBe(201);
    const overdueTicket = createOverdueRes.json().data;

    // 5. Trigger the Deadline & Escalation Scanner via API
    const scanRes = await app.inject({
      method: 'POST',
      url: '/api/v1/automation/scan-deadlines',
      headers: { 'x-user-email': 'admin@coretrack.internal' },
    });
    expect(scanRes.statusCode).toBe(200);
    const scanBody = scanRes.json();
    expect(scanBody.success).toBe(true);
    expect(scanBody.data.tasksPromotedToSprint).toBeGreaterThanOrEqual(1);
    expect(scanBody.data.overdueTasksEscalated).toBeGreaterThanOrEqual(1);
    expect(scanBody.data.overdueProjectsEscalated).toBeGreaterThanOrEqual(1);

    // 6. Verify Backlog task was auto-promoted into the active sprint
    const getTicketRes = await app.inject({
      method: 'GET',
      url: `/api/v1/tickets/${backlogTicket.ticketKey}`,
      headers: { 'x-user-email': 'admin@coretrack.internal' },
    });
    expect(getTicketRes.statusCode).toBe(200);
    const updatedTicket = getTicketRes.json().data;
    expect(updatedTicket.sprintId).toBe(sprint.id);
    expect(updatedTicket.status).toBe('TODO');

    // 7. Verify Email logs were recorded
    const logsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/automation/email-logs?limit=10',
      headers: { 'x-user-email': 'admin@coretrack.internal' },
    });
    expect(logsRes.statusCode).toBe(200);
    const logsBody = logsRes.json();
    expect(Array.isArray(logsBody.data)).toBe(true);
    expect(logsBody.data.length).toBeGreaterThanOrEqual(1);

    await app.close();
  });

  it('Tier 6: Multi-Provider Email Failover (Resend Quota Exhaustion -> Mailjet Fallback)', async () => {
    const app = await buildApp();

    // 1. Verify provider status endpoint
    const statusRes = await app.inject({
      method: 'GET',
      url: '/api/v1/automation/email-providers',
      headers: { 'x-user-email': 'admin@coretrack.internal' },
    });
    expect(statusRes.statusCode).toBe(200);

    // 2. Mock a chain where RESEND fails (429 Quota Exceeded) and MAILJET succeeds
    const mockResend = {
      name: 'RESEND' as const,
      priority: 1,
      from: 'CoreTrack <onboarding@resend.dev>',
      transporter: {
        sendMail: async () => {
          throw new Error('429 Too Many Requests: Daily quota limit reached');
        },
      } as any,
    };

    const mockMailjet = {
      name: 'MAILJET' as const,
      priority: 2,
      from: 'CoreTrack <notifications@domain.com>',
      transporter: {
        sendMail: async () => {
          return { messageId: 'mailjet_msg_98765' };
        },
      } as any,
    };

    setMockProviderChain([mockResend, mockMailjet]);

    // 3. Send notification
    const dispatchResult = await sendEmailNotification({
      to: 'employee@coretrack.internal',
      toName: 'Devin Vance',
      subject: '[Urgent] Test Multi-Provider Failover',
      html: '<p>Testing failover</p>',
      notificationType: 'TASK_ASSIGNED',
    });

    expect(dispatchResult.success).toBe(true);
    expect(dispatchResult.provider).toBe('MAILJET');
    expect(dispatchResult.failoverOccurred).toBe(true);

    // 4. Verify Database audit log recorded the failover
    const logsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/automation/email-logs?limit=5',
      headers: { 'x-user-email': 'admin@coretrack.internal' },
    });
    expect(logsRes.statusCode).toBe(200);
    const logs = logsRes.json().data;
    const failoverLog = logs.find((l: any) => l.id === dispatchResult.logId);
    expect(failoverLog).toBeDefined();
    expect(failoverLog.provider).toBe('MAILJET');
    expect(failoverLog.status).toBe('SENT');
    expect(failoverLog.errorMessage).toContain('Failover: RESEND (429 Too Many Requests');

    // Clean up mock override
    setMockProviderChain(null);

    await app.close();
  });

  it('Tier 7: Executive Mail Hub (Direct Mails, Inside Broadcasts, RBAC Gate & Audit Logs)', async () => {
    const app = await buildApp();

    // 1. Employee (Tier 1) should be REJECTED with 403 Forbidden
    const employeeRes = await app.inject({
      method: 'GET',
      url: '/api/v1/mail/status',
      headers: { 'x-user-email': 'employee@coretrack.internal' },
    });
    expect(employeeRes.statusCode).toBe(403);
    expect(employeeRes.json().error).toContain('Access restricted');

    // 2. Super Admin (Tier 5) should be ALLOWED to fetch status & telemetry
    const adminStatusRes = await app.inject({
      method: 'GET',
      url: '/api/v1/mail/status',
      headers: { 'x-user-email': 'admin@coretrack.internal' },
    });
    expect(adminStatusRes.statusCode).toBe(200);
    const statusData = adminStatusRes.json().data;
    expect(statusData.providers).toBeDefined();
    expect(statusData.caller.roleName).toBe('Super Admin');
    expect(statusData.telemetry).toBeDefined();

    // 3. Super Admin should be able to fetch recipients directory
    const recipientsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/mail/recipients',
      headers: { 'x-user-email': 'admin@coretrack.internal' },
    });
    expect(recipientsRes.statusCode).toBe(200);
    const recData = recipientsRes.json().data;
    expect(recData.users.length).toBeGreaterThan(0);
    expect(recData.projects.length).toBeGreaterThan(0);

    // Mock provider so sending succeeds without real SMTP connection
    const mockTransporter = {
      name: 'RESEND' as const,
      priority: 1,
      from: 'CoreTrack Notifications <notifications@coretrack.internal>',
      transporter: {
        sendMail: async () => ({ messageId: 'exec_mail_123' }),
      } as any,
    };
    setMockProviderChain([mockTransporter]);

    // 4. Send Direct Mail to a specific user
    const targetUser = recData.users[0];
    const sendDirectRes = await app.inject({
      method: 'POST',
      url: '/api/v1/mail/send',
      headers: { 'x-user-email': 'admin@coretrack.internal' },
      payload: {
        recipientType: 'INDIVIDUAL',
        recipientUserIds: [targetUser.id],
        subject: 'Q4 Performance Review Directive',
        category: 'DIRECT_MAIL',
        priority: 'HIGH',
        content: 'Please prepare your self-assessment notes for this quarter review session.',
        ctaText: 'Open Dashboard',
      },
    });
    expect(sendDirectRes.statusCode).toBe(200);
    const sendResult = sendDirectRes.json().data;
    expect(sendResult.success).toBe(true);
    expect(sendResult.successCount).toBe(1);

    // 5. Send Inside Broadcast Mail to a Project Team
    const targetProject = recData.projects.find((p: any) => p.key === 'CORE') || recData.projects[0];
    const sendProjectRes = await app.inject({
      method: 'POST',
      url: '/api/v1/mail/send',
      headers: { 'x-user-email': 'admin@coretrack.internal' },
      payload: {
        recipientType: 'PROJECT_TEAM',
        projectId: targetProject.id,
        subject: 'Critical Architecture Checkpoint',
        category: 'PROJECT_UPDATE',
        priority: 'URGENT',
        content: 'All team members please review the updated API schema before tomorrow morning standup.',
        ctaText: 'View Project',
      },
    });
    expect(sendProjectRes.statusCode).toBe(200);
    expect(sendProjectRes.json().data.success).toBe(true);

    // 6. Query Mail Audit Logs
    const logsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/mail/logs?limit=10',
      headers: { 'x-user-email': 'admin@coretrack.internal' },
    });
    expect(logsRes.statusCode).toBe(200);
    const logsData = logsRes.json().data;
    expect(logsData.logs.length).toBeGreaterThan(0);
    expect(logsData.logs.some((l: any) => l.subject.includes('Q4 Performance Review Directive'))).toBe(true);

    // Clean up
    setMockProviderChain(null);
    await app.close();
  });

  it('Tier 8: Project RBAC Isolation & Safe Foreign Key Handling', async () => {
    const app = await buildApp();

    // 1. Employee (Tier 1) attempting to CREATE a project should be BLOCKED with 403 Forbidden
    const empCreateRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { 'x-user-email': 'employee@coretrack.internal' },
      payload: {
        name: 'Rogue Employee Project',
        key: 'ROGUE',
      },
    });
    expect(empCreateRes.statusCode).toBe(403);
    expect(empCreateRes.json().message).toContain('Employees and Team Leads are not authorized to create projects');

    // 2. Team Lead (Tier 2) attempting to CREATE a project should be BLOCKED with 403 Forbidden
    const leadCreateRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { 'x-user-email': 'engineer@coretrack.internal' },
      payload: {
        name: 'Rogue Lead Project',
        key: 'ROGUE2',
      },
    });
    expect(leadCreateRes.statusCode).toBe(403);
    expect(leadCreateRes.json().message).toContain('Employees and Team Leads are not authorized to create projects');

    // 3. Employee (Tier 1) attempting to UPDATE an existing project should be BLOCKED with 403 Forbidden
    const empUpdateRes = await app.inject({
      method: 'PATCH',
      url: '/api/v1/projects/CORE',
      headers: { 'x-user-email': 'employee@coretrack.internal' },
      payload: {
        name: 'Hacked Project Name',
      },
    });
    expect(empUpdateRes.statusCode).toBe(403);
    expect(empUpdateRes.json().message).toContain('Employees and Team Leads are not authorized to manage or edit projects');

    // 4. Team Lead (Tier 2) attempting to UPDATE an existing project should be BLOCKED with 403 Forbidden
    const leadUpdateRes = await app.inject({
      method: 'PATCH',
      url: '/api/v1/projects/CORE',
      headers: { 'x-user-email': 'engineer@coretrack.internal' },
      payload: {
        name: 'Unauthorized Lead Rename',
      },
    });
    expect(leadUpdateRes.statusCode).toBe(403);
    expect(leadUpdateRes.json().message).toContain('Employees and Team Leads are not authorized to manage or edit projects');

    // 5. Admin (Tier 5) creating project with a NON-EXISTENT / STALE team ID should NOT throw foreign key error
    // It should safely sanitize primaryTeamId to null and return 201 Created
    const fakeTeamId = '00000000-0000-0000-0000-000000009999';
    const adminCreateRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { 'x-user-email': 'admin@coretrack.internal' },
      payload: {
        name: 'Safe Enterprise Project',
        key: 'SAFE',
        primaryTeamId: fakeTeamId,
      },
    });
    expect(adminCreateRes.statusCode).toBe(201);
    const createdProject = adminCreateRes.json().data;
    expect(createdProject.key).toBe('SAFE');
    expect(createdProject.primaryTeamId).toBeNull();

    // 6. Admin updating project with a NON-EXISTENT team ID should also safely sanitize without 500 error
    const adminUpdateRes = await app.inject({
      method: 'PATCH',
      url: '/api/v1/projects/SAFE',
      headers: { 'x-user-email': 'admin@coretrack.internal' },
      payload: {
        primaryTeamId: fakeTeamId,
      },
    });
    expect(adminUpdateRes.statusCode).toBe(200);
    const updatedProject = adminUpdateRes.json().data;
    expect(updatedProject.primaryTeamId).toBeNull();

    await app.close();
  });

  it('Tier 9: User Provisioning & Directory (Add User, Duplicate Email Guard, Role Mapping & Status)', async () => {
    const app = await buildApp();
    const testEmail = `anita.roy.${Date.now()}@coretrack.internal`;

    // 1. Employee (Tier 1) should be REJECTED from provisioning users with 403 Forbidden
    const empAddRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/users',
      headers: { 'x-user-email': 'employee@coretrack.internal' },
      payload: {
        fullName: 'Unauthorized Provision',
        email: testEmail,
        role: 'EMPLOYEE',
      },
    });
    expect(empAddRes.statusCode).toBe(403);

    // 2. Super Admin (Tier 5) can provision a new Project Manager user
    const addPmRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/users',
      headers: { 'x-user-email': 'admin@coretrack.internal' },
      payload: {
        fullName: 'Dr. Anita Roy',
        email: testEmail,
        role: 'MANAGER',
        userType: 'INTERNAL_EMPLOYEE',
        sendInviteEmail: false,
      },
    });
    expect(addPmRes.statusCode).toBe(201);
    const newPm = addPmRes.json().data;
    expect(newPm.fullName).toBe('Dr. Anita Roy');
    expect(newPm.email).toBe(testEmail);
    expect(newPm.roleName).toBe('Manager');
    expect(newPm.roleTier).toBe(3);

    // 3. Duplicate email should be REJECTED with 409 Conflict
    const dupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/users',
      headers: { 'x-user-email': 'admin@coretrack.internal' },
      payload: {
        fullName: 'Duplicate Anita',
        email: testEmail,
        role: 'EMPLOYEE',
      },
    });
    expect(dupRes.statusCode).toBe(409);
    expect(dupRes.json().error).toContain('already exists');

    // 4. Update provisioned user status
    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/auth/users/${newPm.id}`,
      headers: { 'x-user-email': 'admin@coretrack.internal' },
      payload: {
        status: 'INACTIVE',
      },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().data.status).toBe('INACTIVE');

    // 5. Verify user is in directory
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/users',
    });
    expect(listRes.statusCode).toBe(200);
    const allUsers = listRes.json().data;
    const found = allUsers.find((u: any) => u.email === testEmail);
    expect(found).toBeDefined();
    expect(found.status).toBe('INACTIVE');

    await app.close();
  });

  it('DELETE /api/v1/projects/:key should enforce higher authority permission', async () => {
    const app = await buildApp();

    // 1. Employee cannot delete project (Tier 1 < 4)
    const empDeleteRes = await app.inject({
      method: 'DELETE',
      url: '/api/v1/projects/CORE',
      headers: { 'x-user-email': 'employee@coretrack.internal' },
    });
    expect(empDeleteRes.statusCode).toBe(403);
    expect(empDeleteRes.json().message).toContain('Projects can only be deleted by higher authorities');

    // 2. Admin creates a temporary project and deletes it (Tier 5)
    const projKey = `DEL${Date.now().toString().slice(-4)}`;
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { 'x-user-email': 'admin@coretrack.internal' },
      payload: {
        key: projKey,
        name: 'Temporary Project For Deletion',
        description: 'Testing project deletion by higher authority',
      },
    });
    expect(createRes.statusCode).toBe(201);

    const adminDeleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${projKey}`,
      headers: { 'x-user-email': 'admin@coretrack.internal' },
    });
    expect(adminDeleteRes.statusCode).toBe(200);
    expect(adminDeleteRes.json().message).toContain('deleted successfully');

    await app.close();
  });

  it('DELETE /api/v1/tickets/:ticketKey should block deleting tasks assigned by higher authorities', async () => {
    const app = await buildApp();

    // 1. CORE-1 is assigned by Super Admin (Tier 5). Employee (Tier 1) attempts to delete it.
    const empDeleteHigherRes = await app.inject({
      method: 'DELETE',
      url: '/api/v1/tickets/CORE-1',
      headers: { 'x-user-email': 'employee@coretrack.internal' },
    });
    expect(empDeleteHigherRes.statusCode).toBe(403);
    const body = empDeleteHigherRes.json();
    expect(body.error).toBe('TASK_ASSIGNED_BY_HIGHER_AUTHORITY');
    expect(body.message).toContain('assigned by a higher authority');

    // 2. Create a temporary ticket without higher authority assignment
    const proj = await db.query.projects.findFirst({ where: eq(projects.key, 'CORE') });
    const empUser = await db.query.users.findFirst({ where: eq(users.email, 'employee@coretrack.internal') });

    const createTicketRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tickets',
      headers: { 'x-user-email': 'employee@coretrack.internal' },
      payload: {
        projectId: proj!.id,
        ticketType: 'TASK',
        title: 'Employee Temporary Task',
        description: 'Testing employee task deletion when not assigned by higher authority',
        priority: 'MEDIUM',
        status: 'TODO',
      },
    });
    expect(createTicketRes.statusCode).toBe(201);
    const createdKey = createTicketRes.json().data.ticketKey;

    // 3. Employee can delete their own unassigned task
    const empDeleteOwnRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tickets/${createdKey}`,
      headers: { 'x-user-email': 'employee@coretrack.internal' },
    });
    expect(empDeleteOwnRes.statusCode).toBe(200);
    expect(empDeleteOwnRes.json().message).toContain('deleted successfully');

    await app.close();
  });

  it('Tier 10: Deadline & SLA Background Scheduler & Full Overdue Escalation', async () => {
    const app = await buildApp();

    // 1. Get scheduler status
    const getRes = await app.inject({
      method: 'GET',
      url: '/api/v1/automation/scheduler',
    });
    expect(getRes.statusCode).toBe(200);
    const initialStatus = getRes.json().data;
    expect(initialStatus).toBeDefined();
    expect(typeof initialStatus.intervalMinutes).toBe('number');

    // 2. Configure scheduler (adjust interval and pause/resume)
    const updateRes = await app.inject({
      method: 'POST',
      url: '/api/v1/automation/scheduler',
      headers: { 'x-user-email': 'admin@coretrack.internal' },
      payload: {
        isActive: true,
        intervalMinutes: 15,
      },
    });
    expect(updateRes.statusCode).toBe(200);
    const updatedStatus = updateRes.json().data;
    expect(updatedStatus.isActive).toBe(true);
    expect(updatedStatus.intervalMinutes).toBe(15);
    expect(updatedStatus.nextRunAt).toBeDefined();

    // 3. Verify non-manager / employee is forbidden from changing scheduler config
    const empConfigRes = await app.inject({
      method: 'POST',
      url: '/api/v1/automation/scheduler',
      headers: { 'x-user-email': 'employee@coretrack.internal' },
      payload: {
        intervalMinutes: 5,
      },
    });
    expect(empConfigRes.statusCode).toBe(403);

    // 4. Test Overdue Full Escalation: Create an overdue task past deadline
    const proj = await db.query.projects.findFirst({ where: eq(projects.key, 'CORE') });
    const pastDueDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const overdueTicketRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tickets',
      headers: { 'x-user-email': 'admin@coretrack.internal' },
      payload: {
        projectId: proj!.id,
        ticketType: 'BUG',
        title: 'Critical Regression in Caching Layer',
        description: 'Overdue bug awaiting full escalation',
        priority: 'MEDIUM',
        status: 'IN_PROGRESS',
        dueDate: pastDueDate,
      },
    });
    expect(overdueTicketRes.statusCode).toBe(201);
    const createdKey = overdueTicketRes.json().data.ticketKey;

    // 5. Trigger immediate scan via scheduler endpoint
    const scanTriggerRes = await app.inject({
      method: 'POST',
      url: '/api/v1/automation/scheduler',
      headers: { 'x-user-email': 'admin@coretrack.internal' },
      payload: {
        runImmediately: true,
      },
    });
    expect(scanTriggerRes.statusCode).toBe(200);

    // 6. Verify ticket was escalated to URGENT
    const fetchEscalatedTicketRes = await app.inject({
      method: 'GET',
      url: `/api/v1/tickets/${createdKey}`,
    });
    expect(fetchEscalatedTicketRes.statusCode).toBe(200);
    const escalatedTicket = fetchEscalatedTicketRes.json().data;
    expect(escalatedTicket.priority).toBe('URGENT');
    expect(escalatedTicket.lastOverdueNotifiedAt).toBeDefined();

    // 7. Verify automated internal audit comment was posted
    const commentsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/tickets/${createdKey}/comments`,
    });
    expect(commentsRes.statusCode).toBe(200);
    const comments = commentsRes.json().data;
    const escalationComment = comments.find((c: any) => c.body.includes('Automated Escalation'));
    expect(escalationComment).toBeDefined();
    expect(escalationComment.visibilityScope).toBe('INTERNAL_ONLY');

    await app.close();
  });

  it('Tier 11: Task Editing Permission - Only Assigned Person or Higher Authorities Can Edit Tasks', async () => {
    const app = await buildApp();

    const proj = await db.query.projects.findFirst({ where: eq(projects.key, 'CORE') });
    const engineer = await db.query.users.findFirst({ where: eq(users.email, 'engineer@coretrack.internal') });
    const employee = await db.query.users.findFirst({ where: eq(users.email, 'employee@coretrack.internal') });
    const admin = await db.query.users.findFirst({ where: eq(users.email, 'admin@coretrack.internal') });

    expect(proj).toBeDefined();
    expect(engineer).toBeDefined();
    expect(employee).toBeDefined();
    expect(admin).toBeDefined();

    // 1. Admin creates Task A assigned to Engineer
    const taskARes = await app.inject({
      method: 'POST',
      url: '/api/v1/tickets',
      headers: { 'x-user-email': 'admin@coretrack.internal' },
      payload: {
        projectId: proj!.id,
        ticketType: 'TASK',
        title: 'Backend Auth Refactor',
        description: 'Assigned to Engineer',
        priority: 'MEDIUM',
        status: 'TODO',
        assigneeId: engineer!.id,
      },
    });
    expect(taskARes.statusCode).toBe(201);
    const taskA = taskARes.json().data;

    // 2. Employee (Tier 1) attempts to update Task A assigned to Engineer -> Expect 403 ASSIGNED_PERSON_ONLY
    const empEditTaskARes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tickets/${taskA.ticketKey}`,
      headers: { 'x-user-email': 'employee@coretrack.internal' },
      payload: {
        status: 'DONE',
        lockVersion: taskA.lockVersion,
      },
    });
    expect(empEditTaskARes.statusCode).toBe(403);
    const empEditError = empEditTaskARes.json();
    expect(empEditError.error).toBe('ASSIGNED_PERSON_ONLY');

    // 3. Employee attempts to change priority or deadline of Task A -> Expect 403
    const empPriorityRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tickets/${taskA.ticketKey}`,
      headers: { 'x-user-email': 'employee@coretrack.internal' },
      payload: {
        priority: 'URGENT',
        lockVersion: taskA.lockVersion,
      },
    });
    expect(empPriorityRes.statusCode).toBe(403);

    // 4. Admin creates Task B assigned to Employee
    const taskBRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tickets',
      headers: { 'x-user-email': 'admin@coretrack.internal' },
      payload: {
        projectId: proj!.id,
        ticketType: 'TASK',
        title: 'Frontend Button Polish',
        description: 'Assigned to Employee',
        priority: 'LOW',
        status: 'TODO',
        assigneeId: employee!.id,
      },
    });
    expect(taskBRes.statusCode).toBe(201);
    const taskB = taskBRes.json().data;

    // 5. Employee updates their OWN task (Task B) -> Expect 200 OK
    const empSelfUpdateRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tickets/${taskB.ticketKey}`,
      headers: { 'x-user-email': 'employee@coretrack.internal' },
      payload: {
        status: 'IN_PROGRESS',
        priority: 'MEDIUM',
        lockVersion: taskB.lockVersion,
      },
    });
    expect(empSelfUpdateRes.statusCode).toBe(200);
    const updatedTaskB = empSelfUpdateRes.json().data;
    expect(updatedTaskB.status).toBe('IN_PROGRESS');
    expect(updatedTaskB.priority).toBe('MEDIUM');

    // 6. Higher authority (Admin Tier 5) updates Task B -> Expect 200 OK
    const adminUpdateTaskBRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tickets/${taskB.ticketKey}`,
      headers: { 'x-user-email': 'admin@coretrack.internal' },
      payload: {
        status: 'IN_REVIEW',
        lockVersion: updatedTaskB.lockVersion,
      },
    });
    expect(adminUpdateTaskBRes.statusCode).toBe(200);
    expect(adminUpdateTaskBRes.json().data.status).toBe('IN_REVIEW');

    // 7. Bulk Update: Employee attempts to bulk update [taskA, taskB] -> Expect 403
    const empBulkForbiddenRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tickets/bulk',
      headers: { 'x-user-email': 'employee@coretrack.internal' },
      payload: {
        ticketKeys: [taskA.ticketKey, taskB.ticketKey],
        status: 'DONE',
      },
    });
    expect(empBulkForbiddenRes.statusCode).toBe(403);
    expect(empBulkForbiddenRes.json().error).toBe('ASSIGNED_PERSON_ONLY');

    // 8. Bulk Update: Employee bulk updates only their own tasks [taskB] -> Expect 200 OK
    const empBulkSuccessRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tickets/bulk',
      headers: { 'x-user-email': 'employee@coretrack.internal' },
      payload: {
        ticketKeys: [taskB.ticketKey],
        status: 'DONE',
      },
    });
    expect(empBulkSuccessRes.statusCode).toBe(200);
    expect(empBulkSuccessRes.json().success).toBe(true);

    await app.close();
  });
});

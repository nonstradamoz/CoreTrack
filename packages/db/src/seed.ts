import { db, users, departments, teams, teamMembers, projects, tickets, roles, projectMembers, projectMilestones, projectActivityLogs } from './index.js';
import { sql, eq } from 'drizzle-orm';
import { StandardRoleBitmasks } from '@coretrack/shared';

export async function seed(exitOnComplete = false) {
  console.log('🌱 Seeding CoreTrack initial data...');

  // 1. Create Default Users — mapped to new 6-tier role hierarchy
  const [adminUser] = await db
    .insert(users)
    .values({
      email: 'admin@coretrack.internal',
      fullName: 'System Administrator',
      userType: 'INTERNAL_EMPLOYEE',
      status: 'ACTIVE',
      globalPermissions: StandardRoleBitmasks.SUPER_ADMIN, // ORG_ADMIN bitmask (full bypass)
    })
    .onConflictDoNothing()
    .returning();

  const [devUser] = await db
    .insert(users)
    .values({
      email: 'engineer@coretrack.internal',
      fullName: 'Devin Vance',
      userType: 'INTERNAL_EMPLOYEE',
      status: 'ACTIVE',
      globalPermissions: StandardRoleBitmasks.TEAM_LEAD,
    })
    .onConflictDoNothing()
    .returning();

  const [employeeUser] = await db
    .insert(users)
    .values({
      email: 'employee@coretrack.internal',
      fullName: 'Alex Chen',
      userType: 'INTERNAL_EMPLOYEE',
      status: 'ACTIVE',
      globalPermissions: StandardRoleBitmasks.EMPLOYEE,
    })
    .onConflictDoNothing()
    .returning();

  // Fetch users if they already existed and ensure their global permissions match the 6-tier hierarchy
  const actualAdmin = adminUser || (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.email, 'admin@coretrack.internal') }));
  const actualDev = devUser || (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.email, 'engineer@coretrack.internal') }));
  const actualEmployee = employeeUser || (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.email, 'employee@coretrack.internal') }));

  if (actualAdmin) {
    await db.update(users).set({ globalPermissions: StandardRoleBitmasks.SUPER_ADMIN }).where(eq(users.id, actualAdmin.id));
  }
  if (actualDev) {
    await db.update(users).set({ globalPermissions: StandardRoleBitmasks.TEAM_LEAD }).where(eq(users.id, actualDev.id));
  }
  if (actualEmployee) {
    await db.update(users).set({ globalPermissions: StandardRoleBitmasks.EMPLOYEE }).where(eq(users.id, actualEmployee.id));
  }

  // 2. Seed Baseline Dynamic Roles (6-tier RBAC hierarchy)
  const baselineRoles = [
    {
      name: 'Super Admin',
      description: 'Full platform bypass. Access to every module including Roles & Settings.',
      color: '#0F172A',
      isSystem: true,
      permissions: StandardRoleBitmasks.SUPER_ADMIN,
    },
    {
      name: 'Admin',
      description: 'Full access to all modules except Roles & Settings configuration.',
      color: '#1D4ED8',
      isSystem: true,
      permissions: StandardRoleBitmasks.ADMIN,
    },
    {
      name: 'Manager',
      description: 'Projects, boards, reports, and automation. No system settings.',
      color: '#4F46E5',
      isSystem: true,
      permissions: StandardRoleBitmasks.MANAGER,
    },
    {
      name: 'Team Lead',
      description: 'Boards, tasks, sprints. View-only access to projects and reports.',
      color: '#0EA5E9',
      isSystem: true,
      permissions: StandardRoleBitmasks.TEAM_LEAD,
    },
    {
      name: 'Employee',
      description: 'Dashboard, board (own tasks), and service desk portal only.',
      color: '#10B981',
      isSystem: true,
      permissions: StandardRoleBitmasks.EMPLOYEE,
    },
    {
      name: 'Custom Role',
      description: 'Configurable via module toggle grid in Roles & Settings. Assigned by Super Admin.',
      color: '#F59E0B',
      isSystem: false,
      permissions: StandardRoleBitmasks.CUSTOM,
    },
  ];

  for (const roleDef of baselineRoles) {
    await db
      .insert(roles)
      .values(roleDef)
      .onConflictDoNothing();
  }

  const seededRoles = await db.query.roles.findMany();
  const superAdminRole = seededRoles.find((r) => r.name === 'Super Admin') || seededRoles[0];
  const teamLeadRole   = seededRoles.find((r) => r.name === 'Team Lead')   || seededRoles[0];
  const employeeRole   = seededRoles.find((r) => r.name === 'Employee')    || seededRoles[0];
  // Legacy aliases used below for project membership
  const adminRole      = superAdminRole;
  const devRole        = teamLeadRole;
  const requesterRole  = employeeRole;

  // 2. Create Engineering Department & Project (CORE)
  const [engDept] = await db
    .insert(departments)
    .values({
      name: 'Engineering',
      code: 'ENG',
    })
    .onConflictDoNothing()
    .returning();

  const actualEngDept = engDept || (await db.query.departments.findFirst({ where: (d, { eq }) => eq(d.code, 'ENG') }));
  if (actualEngDept) {
    const [engTeam] = await db
      .insert(teams)
      .values({
        departmentId: actualEngDept.id,
        name: 'Platform Engineering',
        keyPrefix: 'PLAT',
      })
      .onConflictDoNothing()
      .returning();

    const actualEngTeam = engTeam || (await db.query.teams.findFirst({ where: (t, { eq }) => eq(t.keyPrefix, 'PLAT') }));
    if (actualEngTeam) {
      const [engProject] = await db
        .insert(projects)
        .values({
          departmentId: actualEngDept.id,
          primaryTeamId: actualEngTeam.id,
          key: 'CORE',
          name: 'Core Application Platform',
          description: 'High-performance ticketing and task management backbone',
          projectType: 'ENGINEERING',
          privacyTier: 'PUBLIC',
          nextTicketNumber: 2,
        })
        .onConflictDoNothing()
        .returning();

      const actualEngProject = engProject || (await db.query.projects.findFirst({ where: (p, { eq }) => eq(p.key, 'CORE') }));
      if (actualEngProject && actualAdmin) {
        await db
          .insert(tickets)
          .values({
            projectId: actualEngProject.id,
            ticketKey: 'CORE-1',
            ticketNumber: 1,
            ticketType: 'TASK',
            title: 'Verify local development infrastructure & health endpoints',
            description: 'Docker Compose containers (PostgreSQL, Redis, Meilisearch, MinIO) operational.',
            status: 'IN_PROGRESS',
            priority: 'HIGH',
            storyPoints: 3,
            reporterId: actualAdmin.id,
            assigneeId: actualDev ? actualDev.id : actualAdmin.id,
            assignedByUserId: actualAdmin.id,
            assignedByRoleTier: 5,
            dueDateSetByUserId: actualAdmin.id,
            dueDateSetByRoleTier: 5,
          })
          .onConflictDoNothing();
        await db.update(projects).set({ nextTicketNumber: 2 }).where(eq(projects.id, actualEngProject.id));
      }
    }
  }

  // 3. Create IT Department & Service Desk Project (HD)
  const [itDept] = await db
    .insert(departments)
    .values({
      name: 'Information Technology',
      code: 'IT',
    })
    .onConflictDoNothing()
    .returning();

  const actualItDept = itDept || (await db.query.departments.findFirst({ where: (d, { eq }) => eq(d.code, 'IT') }));
  if (actualItDept) {
    const [itTeam] = await db
      .insert(teams)
      .values({
        departmentId: actualItDept.id,
        name: 'Enterprise Support',
        keyPrefix: 'ITSD',
      })
      .onConflictDoNothing()
      .returning();

    const actualItTeam = itTeam || (await db.query.teams.findFirst({ where: (t, { eq }) => eq(t.keyPrefix, 'ITSD') }));
    if (actualItTeam) {
      const [hdProject] = await db
        .insert(projects)
        .values({
          departmentId: actualItDept.id,
          primaryTeamId: actualItTeam.id,
          key: 'HD',
          name: 'IT Helpdesk & Service Desk',
          description: 'Employee service requests, hardware provisioning, and access management',
          projectType: 'SERVICE_DESK',
          privacyTier: 'PUBLIC',
          nextTicketNumber: 2,
        })
        .onConflictDoNothing()
        .returning();

      const actualHdProject = hdProject || (await db.query.projects.findFirst({ where: (p, { eq }) => eq(p.key, 'HD') }));
      if (actualHdProject && actualAdmin) {
        await db
          .insert(tickets)
          .values({
            projectId: actualHdProject.id,
            ticketKey: 'HD-1',
            ticketNumber: 1,
            ticketType: 'SERVICE_REQUEST',
            title: 'Hardware Upgrade: 32GB RAM Developer Laptop',
            description: 'Requesting upgrade for local Docker containers and LLM inference development.',
            status: 'PENDING_APPROVAL',
            priority: 'MEDIUM',
            reporterId: actualEmployee ? actualEmployee.id : actualAdmin.id,
            assigneeId: actualAdmin.id,
          })
          .onConflictDoNothing();
        await db.update(projects).set({ nextTicketNumber: 2 }).where(eq(projects.id, actualHdProject.id));
      }
    }
  }

  // 4. Assign Project Memberships, Teams, Milestones, and Personnel
  const coreProj = await db.query.projects.findFirst({ where: (p, { eq }) => eq(p.key, 'CORE') });
  const hdProj = await db.query.projects.findFirst({ where: (p, { eq }) => eq(p.key, 'HD') });
  const engTeamObj = await db.query.teams.findFirst({ where: (t, { eq }) => eq(t.keyPrefix, 'PLAT') });
  const itTeamObj = await db.query.teams.findFirst({ where: (t, { eq }) => eq(t.keyPrefix, 'ITSD') });

  const now = new Date();
  const pastDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const futureDeadline = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
  const pastDeadline = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

  // Update teams with leads & description
  if (engTeamObj && actualDev) {
    await db.update(teams).set({
      leadId: actualDev.id,
      description: 'Core infrastructure, platform services, reliability, and backend architecture.',
      updatedAt: now,
    }).where(eq(teams.id, engTeamObj.id));

    // Seed team members
    await db.delete(teamMembers).where(eq(teamMembers.teamId, engTeamObj.id));
    await db.insert(teamMembers).values([
      { teamId: engTeamObj.id, userId: actualDev.id, role: 'LEAD' },
      { teamId: engTeamObj.id, userId: actualEmployee.id, role: 'MEMBER' },
      { teamId: engTeamObj.id, userId: actualAdmin.id, role: 'MEMBER' },
    ]);
  }

  if (itTeamObj && actualAdmin) {
    await db.update(teams).set({
      leadId: actualAdmin.id,
      description: 'Enterprise IT operations, identity lifecycle, and technical support desk.',
      updatedAt: now,
    }).where(eq(teams.id, itTeamObj.id));

    await db.delete(teamMembers).where(eq(teamMembers.teamId, itTeamObj.id));
    await db.insert(teamMembers).values([
      { teamId: itTeamObj.id, userId: actualAdmin.id, role: 'LEAD' },
      { teamId: itTeamObj.id, userId: actualEmployee.id, role: 'MEMBER' },
    ]);
  }

  // Update projects with PM, Reviewer, Status, Dates
  if (coreProj && actualAdmin && actualDev) {
    await db.update(projects).set({
      status: 'IN_PROGRESS',
      startDate: pastDate,
      deadline: futureDeadline,
      projectManagerId: actualAdmin.id,
      reviewerId: actualDev.id,
      description: 'Enterprise ticketing and distributed task coordination platform backbone.',
      updatedAt: now,
    }).where(eq(projects.id, coreProj.id));

    // Milestones for CORE
    await db.delete(projectMilestones).where(eq(projectMilestones.projectId, coreProj.id));
    await db.insert(projectMilestones).values([
      {
        projectId: coreProj.id,
        title: 'Architecture Baseline & Schema Sharding',
        description: 'PostgreSQL relational core schemas, connection pooling, and baseline indices.',
        status: 'COMPLETED',
        dueDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      },
      {
        projectId: coreProj.id,
        title: 'Project & Team Management RBAC Engine',
        description: 'Hierarchical role bindings, personnel assignment, and project workflow controls.',
        status: 'IN_PROGRESS',
        dueDate: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
      },
      {
        projectId: coreProj.id,
        title: 'SLA Engine & Production Rollout',
        description: 'High-throughput SLA breach monitor and webhook notification dispatchers.',
        status: 'PENDING',
        dueDate: futureDeadline,
      },
    ]);

    // Audit logs for CORE
    await db.delete(projectActivityLogs).where(eq(projectActivityLogs.projectId, coreProj.id));
    await db.insert(projectActivityLogs).values([
      {
        projectId: coreProj.id,
        userId: actualAdmin.id,
        action: 'PROJECT_INITIALIZED',
        details: 'Project Core Application Platform initialized by System Administrator.',
      },
      {
        projectId: coreProj.id,
        userId: actualAdmin.id,
        action: 'REVIEWER_ASSIGNED',
        details: 'Assigned Devin Vance as primary Technical Reviewer.',
      },
      {
        projectId: coreProj.id,
        userId: actualDev.id,
        action: 'MILESTONE_COMPLETED',
        details: 'Milestone "Architecture Baseline & Schema Sharding" marked completed.',
      },
    ]);
  }

  if (hdProj && actualAdmin && actualEmployee) {
    await db.update(projects).set({
      status: 'IN_PROGRESS',
      startDate: pastDate,
      deadline: futureDeadline,
      projectManagerId: actualAdmin.id,
      reviewerId: actualAdmin.id,
      description: 'Employee hardware provisioning, technical inquiries, and access management.',
      updatedAt: now,
    }).where(eq(projects.id, hdProj.id));

    await db.delete(projectMilestones).where(eq(projectMilestones.projectId, hdProj.id));
    await db.insert(projectMilestones).values([
      {
        projectId: hdProj.id,
        title: 'IT Helpdesk Portal Launch',
        description: 'Self-service ticketing portal for internal staff.',
        status: 'COMPLETED',
        dueDate: pastDate,
      },
      {
        projectId: hdProj.id,
        title: 'Hardware Procurement Automation',
        description: 'Direct procurement workflow integration for laptop allocation.',
        status: 'IN_PROGRESS',
        dueDate: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
      },
    ]);
  }

  // 5. Assign Project Memberships
  if (coreProj && adminRole && devRole && requesterRole && actualAdmin && actualDev && actualEmployee) {
    await db.delete(projectMembers).where(eq(projectMembers.projectId, coreProj.id));
    await db.insert(projectMembers).values([
      { projectId: coreProj.id, userId: actualAdmin.id, roleId: adminRole.id },
      { projectId: coreProj.id, userId: actualDev.id, roleId: devRole.id },
      { projectId: coreProj.id, userId: actualEmployee.id, roleId: requesterRole.id },
    ]);
  }

  if (hdProj && adminRole && requesterRole && actualAdmin && actualEmployee) {
    await db.delete(projectMembers).where(eq(projectMembers.projectId, hdProj.id));
    await db.insert(projectMembers).values([
      { projectId: hdProj.id, userId: actualAdmin.id, roleId: adminRole.id },
      { projectId: hdProj.id, userId: actualEmployee.id, roleId: requesterRole.id },
    ]);
  }

  console.log('✅ Database seeded successfully with Engineering & Service Desk projects and dynamic RBAC roles!');
  if (exitOnComplete) {
    process.exit(0);
  }
}

if (process.argv[1]?.endsWith('seed.ts')) {
  seed(true).catch((err) => {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  });
}

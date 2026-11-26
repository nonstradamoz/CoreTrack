import {
  db,
  users,
  departments,
  teams,
  teamMembers,
  projects,
  tickets,
  roles,
  projectMembers,
  projectMilestones,
  projectActivityLogs,
} from './index.js';
import { eq } from 'drizzle-orm';
import { getSeedConfig, UserKey, SeedConfig } from './seedConfig.js';

export async function seed(exitOnComplete = false, customConfig?: SeedConfig) {
  const config = customConfig || getSeedConfig();
  console.log('🌱 Seeding CoreTrack initial data...');

  const now = new Date();

  // 1. Seed or Synchronize Users dynamically from config
  const userMap = new Map<UserKey, typeof users.$inferSelect>();

  for (const userDef of config.users) {
    const [inserted] = await db
      .insert(users)
      .values({
        email: userDef.email,
        fullName: userDef.fullName,
        userType: userDef.userType,
        status: userDef.status,
        globalPermissions: userDef.globalPermissions,
      })
      .onConflictDoNothing()
      .returning();

    const actualUser =
      inserted ||
      (await db.query.users.findFirst({
        where: (u, { eq: eqU }) => eqU(u.email, userDef.email),
      }));

    if (actualUser) {
      if (
        actualUser.globalPermissions !== userDef.globalPermissions ||
        actualUser.fullName !== userDef.fullName ||
        actualUser.status !== userDef.status
      ) {
        await db
          .update(users)
          .set({
            globalPermissions: userDef.globalPermissions,
            fullName: userDef.fullName,
            status: userDef.status,
            updatedAt: now,
          })
          .where(eq(users.id, actualUser.id));
      }
      userMap.set(userDef.key, actualUser);
    }
  }

  const adminUser = userMap.get('admin');
  const devUser = userMap.get('dev');
  const employeeUser = userMap.get('employee');

  if (!adminUser) {
    throw new Error('Default admin user could not be seeded or retrieved.');
  }

  // 2. Seed Baseline Dynamic Roles
  for (const roleDef of config.roles) {
    await db.insert(roles).values(roleDef).onConflictDoNothing();
  }

  const allRoles = await db.query.roles.findMany();
  const roleMap = new Map<string, typeof roles.$inferSelect>();
  for (const r of allRoles) {
    roleMap.set(r.name, r);
  }

  // 3. Seed Departments, Teams, Projects, Tickets, Milestones & Personnel
  const teamPrefixMap = new Map<string, typeof teams.$inferSelect>();

  for (const deptDef of config.departments) {
    // 3a. Department
    const [insertedDept] = await db
      .insert(departments)
      .values({
        name: deptDef.name,
        code: deptDef.code,
      })
      .onConflictDoNothing()
      .returning();

    const actualDept =
      insertedDept ||
      (await db.query.departments.findFirst({
        where: (d, { eq: eqD }) => eqD(d.code, deptDef.code),
      }));

    if (!actualDept) continue;

    // 3b. Teams within Department
    for (const teamDef of deptDef.teams) {
      const leadUser = userMap.get(teamDef.leadUserKey) || adminUser;

      const [insertedTeam] = await db
        .insert(teams)
        .values({
          departmentId: actualDept.id,
          name: teamDef.name,
          keyPrefix: teamDef.keyPrefix,
          description: teamDef.description,
          leadId: leadUser.id,
        })
        .onConflictDoNothing()
        .returning();

      const actualTeam =
        insertedTeam ||
        (await db.query.teams.findFirst({
          where: (t, { eq: eqT }) => eqT(t.keyPrefix, teamDef.keyPrefix),
        }));

      if (!actualTeam) continue;

      teamPrefixMap.set(teamDef.keyPrefix, actualTeam);

      await db
        .update(teams)
        .set({
          leadId: leadUser.id,
          description: teamDef.description,
          updatedAt: now,
        })
        .where(eq(teams.id, actualTeam.id));

      // Team Memberships
      await db.delete(teamMembers).where(eq(teamMembers.teamId, actualTeam.id));
      const teamMemberRecords = teamDef.members
        .map((m) => {
          const u = userMap.get(m.userKey);
          return u ? { teamId: actualTeam.id, userId: u.id, role: m.role } : null;
        })
        .filter(Boolean) as { teamId: string; userId: string; role: 'LEAD' | 'MEMBER' }[];

      if (teamMemberRecords.length > 0) {
        await db.insert(teamMembers).values(teamMemberRecords);
      }
    }

    // 3c. Projects within Department
    for (const projDef of deptDef.projects) {
      const primaryTeam = teamPrefixMap.get(projDef.primaryTeamPrefix);
      const pmUser = userMap.get(projDef.projectManagerUserKey) || adminUser;
      const revUser = userMap.get(projDef.reviewerUserKey) || adminUser;

      const startDate = new Date(now.getTime() + projDef.startOffsetDays * 86400000);
      const deadline = new Date(now.getTime() + projDef.deadlineOffsetDays * 86400000);

      const [insertedProj] = await db
        .insert(projects)
        .values({
          departmentId: actualDept.id,
          primaryTeamId: primaryTeam ? primaryTeam.id : null,
          key: projDef.key,
          name: projDef.name,
          description: projDef.description,
          projectType: projDef.projectType,
          privacyTier: projDef.privacyTier,
          status: projDef.status,
          startDate,
          deadline,
          projectManagerId: pmUser.id,
          reviewerId: revUser.id,
          nextTicketNumber: projDef.tickets.length + 1,
        })
        .onConflictDoNothing()
        .returning();

      const actualProj =
        insertedProj ||
        (await db.query.projects.findFirst({
          where: (p, { eq: eqP }) => eqP(p.key, projDef.key),
        }));

      if (!actualProj) continue;

      // Ensure updated dates and metadata
      await db
        .update(projects)
        .set({
          name: projDef.name,
          description: projDef.description,
          status: projDef.status,
          startDate,
          deadline,
          projectManagerId: pmUser.id,
          reviewerId: revUser.id,
          primaryTeamId: primaryTeam ? primaryTeam.id : actualProj.primaryTeamId,
          nextTicketNumber: Math.max(actualProj.nextTicketNumber, projDef.tickets.length + 1),
          updatedAt: now,
        })
        .where(eq(projects.id, actualProj.id));

      // Tickets for project
      for (const tDef of projDef.tickets) {
        const reporter = userMap.get(tDef.reporterUserKey) || adminUser;
        const assignee = tDef.assigneeUserKey ? userMap.get(tDef.assigneeUserKey) : null;

        await db
          .insert(tickets)
          .values({
            projectId: actualProj.id,
            ticketKey: tDef.ticketKey,
            ticketNumber: tDef.ticketNumber,
            ticketType: tDef.ticketType,
            title: tDef.title,
            description: tDef.description,
            status: tDef.status,
            priority: tDef.priority,
            storyPoints: tDef.storyPoints,
            reporterId: reporter.id,
            assigneeId: assignee ? assignee.id : null,
            assignedByUserId: assignee ? adminUser.id : null,
            assignedByRoleTier: assignee ? 5 : 1,
            dueDateSetByUserId: assignee ? adminUser.id : null,
            dueDateSetByRoleTier: assignee ? 5 : 1,
          })
          .onConflictDoNothing();
      }

      // Milestones for project
      if (projDef.milestones.length > 0) {
        await db.delete(projectMilestones).where(eq(projectMilestones.projectId, actualProj.id));
        await db.insert(projectMilestones).values(
          projDef.milestones.map((m) => ({
            projectId: actualProj.id,
            title: m.title,
            description: m.description,
            status: m.status,
            dueDate: new Date(now.getTime() + m.dueOffsetDays * 86400000),
          }))
        );
      }

      // Activity logs for project
      if (projDef.activityLogs.length > 0) {
        await db.delete(projectActivityLogs).where(eq(projectActivityLogs.projectId, actualProj.id));
        await db.insert(projectActivityLogs).values(
          projDef.activityLogs.map((log) => {
            const actor = userMap.get(log.actorUserKey) || adminUser;
            return {
              projectId: actualProj.id,
              userId: actor.id,
              action: log.action,
              details: log.detailTemplate({
                actorName: actor.fullName,
                adminName: adminUser.fullName,
                devName: devUser?.fullName || 'Devin Vance',
                employeeName: employeeUser?.fullName || 'Alex Chen',
                projectName: projDef.name,
              }),
            };
          })
        );
      }

      // Project Memberships
      if (projDef.members.length > 0) {
        await db.delete(projectMembers).where(eq(projectMembers.projectId, actualProj.id));
        const memberValues = projDef.members
          .map((m) => {
            const u = userMap.get(m.userKey);
            const r = roleMap.get(m.roleName);
            return u && r ? { projectId: actualProj.id, userId: u.id, roleId: r.id } : null;
          })
          .filter(Boolean) as { projectId: string; userId: string; roleId: string }[];

        if (memberValues.length > 0) {
          await db.insert(projectMembers).values(memberValues);
        }
      }
    }
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

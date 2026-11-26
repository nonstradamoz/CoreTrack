import {
  db,
  pool,
  tickets,
  ticketComments,
  ticketAttachments,
  ticketDependencies,
  ticketApprovals,
  ticketVcsLinks,
  sprints,
  dailyStandups,
  projectMilestones,
  projectActivityLogs,
  projectMembers,
  teamMembers,
  projects,
  teams,
  departments,
  automationRules,
  emailNotificationLogs,
  roles,
  users,
  eq,
} from './index.js';
import { getSeedConfig } from './seedConfig.js';

export async function clearSampleData() {
  console.log('🧹 Purging all sample and test data from CoreTrack database...');

  // 0. Clear email notification logs
  await db.delete(emailNotificationLogs);
  console.log('  ✓ Cleared all email notification logs');

  // 1. Delete all ticket-related child entities
  await db.delete(ticketComments);
  await db.delete(ticketAttachments);
  await db.delete(ticketDependencies);
  await db.delete(ticketApprovals);
  await db.delete(ticketVcsLinks);
  console.log('  ✓ Cleared all ticket relations (comments, attachments, dependencies, approvals, VCS links)');

  // 2. Delete all tickets
  await db.delete(tickets);
  console.log('  ✓ Cleared all tickets');

  // 3. Delete all sprints and sprint assignments
  await db.delete(sprints);
  console.log('  ✓ Cleared all sprints');

  // 4. Delete all daily standups
  await db.delete(dailyStandups);
  console.log('  ✓ Cleared all daily standups');

  // 5. Delete all project milestones and activity logs
  await db.delete(projectMilestones);
  await db.delete(projectActivityLogs);
  console.log('  ✓ Cleared all project milestones & activity logs');

  // 6. Delete all automation rules
  await db.delete(automationRules);
  console.log('  ✓ Cleared all automation rules');

  // 7. Delete all project memberships
  await db.delete(projectMembers);
  console.log('  ✓ Cleared all project memberships');

  // 8. Delete all projects (complete clean slate)
  await db.delete(projects);
  console.log('  ✓ Cleared all projects (0 projects remaining)');

  // 9. Delete all team memberships
  await db.delete(teamMembers);
  console.log('  ✓ Cleared all team memberships');

  // 10. Delete all teams (complete clean slate)
  await db.delete(teams);
  console.log('  ✓ Cleared all teams (0 teams remaining)');

  // 10b. Delete all departments
  await db.delete(departments);
  console.log('  ✓ Cleared all departments (0 departments remaining)');

  // 11. Deduplicate dynamic roles, retaining only baseline configured roles
  const canonicalRoleNames = getSeedConfig().roles.map((r) => r.name);
  const allRoles = await db.select().from(roles);
  const seen = new Set<string>();
  const toDeleteRoleIds: string[] = [];

  for (const r of allRoles) {
    if (!canonicalRoleNames.includes(r.name)) {
      toDeleteRoleIds.push(r.id);
    } else if (seen.has(r.name)) {
      toDeleteRoleIds.push(r.id);
    } else {
      seen.add(r.name);
    }
  }

  for (const id of toDeleteRoleIds) {
    try {
      await db.delete(roles).where(eq(roles.id, id));
    } catch {
      // ignore if foreign key is bound
    }
  }
  console.log(`  ✓ Cleaned duplicate roles (retained canonical 6 roles)`);

  // 12. Purge transient test accounts (e.g. anita.roy.*)
  const allUsers = await db.select().from(users);
  for (const u of allUsers) {
    if (u.email.includes('anita.roy')) {
      try {
        await db.delete(users).where(eq(users.id, u.id));
      } catch {
        // ignore if foreign key is bound
      }
    }
  }
  console.log('  ✓ Purged transient test users');

  console.log('✨ All sample data and sample projects successfully removed! Database is now a pure clean slate.');
}

// Direct execution
if (process.argv[1]?.endsWith('clean.ts')) {
  clearSampleData()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('❌ Failed to clear sample data:', err);
      await pool.end();
      process.exit(1);
    });
}

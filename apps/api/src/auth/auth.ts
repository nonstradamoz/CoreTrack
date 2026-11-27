import { FastifyRequest, FastifyReply } from 'fastify';
import { db, users, projects, projectMembers, roles, teams, teamMembers, eq, and } from '@coretrack/db';
import { Permissions, hasPermission, StandardRoleBitmasks } from '@coretrack/shared';
import { verifyAuthToken } from './jwt.js';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  userType: 'INTERNAL_EMPLOYEE' | 'EXTERNAL_GUEST';
  globalPermissions: bigint;
}

export function setMockUserEmail(_email: string | null) {
  // Stateless JWT sessions are used; no global in-memory user state.
}

export function clearMockUserSession() {
  // Stateless JWT sessions are cleared client-side on logout.
}

export async function getCurrentUser(request: FastifyRequest): Promise<AuthUser | null> {
  const authHeader = request.headers.authorization;
  let user = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const payload = verifyAuthToken(token);
    if (!payload) return null;

    user = await db.query.users.findFirst({
      where: eq(users.id, payload.sub),
    });
  } else {
    const emailHeader = request.headers['x-user-email'] as string | undefined;
    if (!emailHeader) return null;

    user = await db.query.users.findFirst({
      where: eq(users.email, emailHeader.trim().toLowerCase()),
    });
  }

  if (!user || (user.status && user.status !== 'ACTIVE')) return null;

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    userType: user.userType as 'INTERNAL_EMPLOYEE' | 'EXTERNAL_GUEST',
    globalPermissions: user.globalPermissions,
  };
}

/**
 * Resolves effective permissions by combining global permissions with project-scoped member role.
 */
export async function getEffectiveUserPermissions(userId: string, projectKey?: string): Promise<{ permissions: bigint; roleName?: string }> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  if (!user) return { permissions: 0n };

  // Org admin bypasses everything
  if ((user.globalPermissions & Permissions.ORG_ADMIN) === Permissions.ORG_ADMIN) {
    return { permissions: user.globalPermissions, roleName: 'Organization Admin' };
  }

  let effective = user.globalPermissions;
  let activeRoleName: string | undefined = undefined;

  if (projectKey) {
    const project = await db.query.projects.findFirst({
      where: eq(projects.key, projectKey),
    });

    if (project) {
      const membership = await db.query.projectMembers.findFirst({
        where: and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, userId)),
        with: {
          role: true,
        },
      });

      if (membership?.role) {
        effective = effective | membership.role.permissions;
        activeRoleName = membership.role.name;
      }
    }
  }

  return { permissions: effective, roleName: activeRoleName };
}

/**
 * Returns numerical tier (1 to 5) for hierarchical deadline locking.
 * Super Admin (5) > Admin (4) > Manager (3) > Team Lead (2) > Employee (1).
 */
export async function getUserRoleTier(userId: string, projectKey?: string): Promise<{ tier: number; roleName: string }> {
  const { permissions, roleName } = await getEffectiveUserPermissions(userId, projectKey);
  const name = (roleName || '').toLowerCase();

  if ((permissions & Permissions.ORG_ADMIN) === Permissions.ORG_ADMIN || name.includes('super admin')) {
    return { tier: 5, roleName: 'Super Admin' };
  }
  if (name.includes('admin') || (permissions & Permissions.PROJECT_DELETE) === Permissions.PROJECT_DELETE) {
    return { tier: 4, roleName: 'Admin' };
  }
  if (
    name.includes('manager') ||
    (permissions & Permissions.PROJECT_EDIT) === Permissions.PROJECT_EDIT ||
    (permissions & Permissions.AUTOMATION_MANAGE) === Permissions.AUTOMATION_MANAGE
  ) {
    return { tier: 3, roleName: 'Manager' };
  }
  if (name.includes('team lead') || name.includes('lead') || (permissions & Permissions.SPRINT_MANAGE) === Permissions.SPRINT_MANAGE) {
    return { tier: 2, roleName: 'Team Lead' };
  }
  return { tier: 1, roleName: 'Employee' };
}

/**
 * PreHandler hook to enforce 64-bit Bitmask RBAC authorization on Fastify routes.
 * Sub-millisecond O(1) bitwise evaluation.
 */
export function requirePermission(requiredPermission: bigint) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await getCurrentUser(request);

    if (!user) {
      return reply.status(401).send({
        type: 'https://errors.coretrack.internal/unauthorized',
        title: 'Authentication Required',
        status: 401,
        detail: 'User session is invalid or user not found.',
      });
    }

    // Evaluate 64-bit Bitmask
    const isAuthorized = hasPermission(user.globalPermissions, requiredPermission);

    if (!isAuthorized) {
      return reply.status(403).send({
        type: 'https://errors.coretrack.internal/forbidden',
        title: 'Access Denied',
        status: 403,
        detail: `User lacks the required capability bitmask: ${requiredPermission.toString()}`,
      });
    }
  };
}

/**
 * PreHandler hook to enforce project-aware 64-bit Bitmask RBAC authorization.
 */
export function requireProjectPermission(requiredPermission: bigint) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await getCurrentUser(request);

    if (!user) {
      return reply.status(401).send({
        type: 'https://errors.coretrack.internal/unauthorized',
        title: 'Authentication Required',
        status: 401,
        detail: 'User session is invalid or user not found.',
      });
    }

    const projectKey = (request.params as any)?.projectKey || (request.query as any)?.projectKey;
    const { permissions } = await getEffectiveUserPermissions(user.id, projectKey);
    const isAuthorized = hasPermission(permissions, requiredPermission);

    if (!isAuthorized) {
      return reply.status(403).send({
        type: 'https://errors.coretrack.internal/forbidden',
        title: 'Access Denied',
        status: 403,
        detail: `User lacks the required project capability bitmask: ${requiredPermission.toString()}`,
      });
    }
  };
}

/**
 * Returns all team IDs that a user belongs to (as a member or as team lead).
 */
export async function getUserTeamIds(userId: string): Promise<string[]> {
  const [memberRows, leadRows] = await Promise.all([
    db.select({ teamId: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, userId)),
    db.select({ id: teams.id }).from(teams).where(eq(teams.leadId, userId)),
  ]);
  const set = new Set<string>();
  for (const r of memberRows) set.add(r.teamId);
  for (const r of leadRows) set.add(r.id);
  return Array.from(set);
}

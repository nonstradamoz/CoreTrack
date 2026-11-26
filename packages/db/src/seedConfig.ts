import { StandardRoleBitmasks } from '@coretrack/shared';

export type UserKey = 'admin' | 'dev' | 'employee';

export interface SeedUserConfig {
  key: UserKey;
  email: string;
  fullName: string;
  userType: 'INTERNAL_EMPLOYEE';
  status: 'ACTIVE';
  globalPermissions: bigint;
}

export interface SeedRoleConfig {
  name: string;
  description: string;
  color: string;
  isSystem: boolean;
  permissions: bigint;
}

export interface SeedTeamMemberConfig {
  userKey: UserKey;
  role: 'LEAD' | 'MEMBER';
}

export interface SeedTeamConfig {
  name: string;
  keyPrefix: string;
  description: string;
  leadUserKey: UserKey;
  members: SeedTeamMemberConfig[];
}

export interface SeedTicketConfig {
  ticketKey: string;
  ticketNumber: number;
  ticketType: 'TASK' | 'SERVICE_REQUEST' | 'BUG' | 'INCIDENT';
  title: string;
  description: string;
  status: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'PENDING_APPROVAL';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  storyPoints?: number;
  reporterUserKey: UserKey;
  assigneeUserKey?: UserKey;
}

export interface SeedMilestoneConfig {
  title: string;
  description: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING';
  dueOffsetDays: number;
}

export interface SeedActivityLogConfig {
  actorUserKey: UserKey;
  action: string;
  detailTemplate: (context: {
    actorName: string;
    adminName: string;
    devName: string;
    employeeName: string;
    projectName: string;
  }) => string;
}

export interface SeedProjectMemberConfig {
  userKey: UserKey;
  roleName: string;
}

export interface SeedProjectConfig {
  key: string;
  name: string;
  description: string;
  projectType: 'ENGINEERING' | 'SERVICE_DESK';
  privacyTier: 'PUBLIC' | 'PRIVATE' | 'RESTRICTED';
  primaryTeamPrefix: string;
  projectManagerUserKey: UserKey;
  reviewerUserKey: UserKey;
  status: 'TODO' | 'IN_PROGRESS' | 'COMPLETED';
  startOffsetDays: number;
  deadlineOffsetDays: number;
  tickets: SeedTicketConfig[];
  milestones: SeedMilestoneConfig[];
  activityLogs: SeedActivityLogConfig[];
  members: SeedProjectMemberConfig[];
}

export interface SeedDepartmentConfig {
  name: string;
  code: string;
  teams: SeedTeamConfig[];
  projects: SeedProjectConfig[];
}

export interface SeedConfig {
  domain: string;
  users: SeedUserConfig[];
  roles: SeedRoleConfig[];
  departments: SeedDepartmentConfig[];
}

export function getSeedConfig(env: NodeJS.ProcessEnv = process.env): SeedConfig {
  const domain = env.SEED_DOMAIN || 'coretrack.internal';

  const users: SeedUserConfig[] = [
    {
      key: 'admin',
      email: env.SEED_ADMIN_EMAIL || `admin@${domain}`,
      fullName: env.SEED_ADMIN_NAME || 'System Administrator',
      userType: 'INTERNAL_EMPLOYEE',
      status: 'ACTIVE',
      globalPermissions: StandardRoleBitmasks.SUPER_ADMIN,
    },
    {
      key: 'dev',
      email: env.SEED_DEV_EMAIL || `engineer@${domain}`,
      fullName: env.SEED_DEV_NAME || 'Devin Vance',
      userType: 'INTERNAL_EMPLOYEE',
      status: 'ACTIVE',
      globalPermissions: StandardRoleBitmasks.TEAM_LEAD,
    },
    {
      key: 'employee',
      email: env.SEED_EMPLOYEE_EMAIL || `employee@${domain}`,
      fullName: env.SEED_EMPLOYEE_NAME || 'Alex Chen',
      userType: 'INTERNAL_EMPLOYEE',
      status: 'ACTIVE',
      globalPermissions: StandardRoleBitmasks.EMPLOYEE,
    },
  ];

  const roles: SeedRoleConfig[] = [
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

  const departments: SeedDepartmentConfig[] = [
    {
      name: 'Engineering',
      code: 'ENG',
      teams: [
        {
          name: 'Platform Engineering',
          keyPrefix: 'PLAT',
          description: 'Core infrastructure, platform services, reliability, and backend architecture.',
          leadUserKey: 'dev',
          members: [
            { userKey: 'dev', role: 'LEAD' },
            { userKey: 'employee', role: 'MEMBER' },
            { userKey: 'admin', role: 'MEMBER' },
          ],
        },
      ],
      projects: [
        {
          key: 'CORE',
          name: 'Core Application Platform',
          description: 'Enterprise ticketing and distributed task coordination platform backbone.',
          projectType: 'ENGINEERING',
          privacyTier: 'PUBLIC',
          primaryTeamPrefix: 'PLAT',
          projectManagerUserKey: 'admin',
          reviewerUserKey: 'dev',
          status: 'IN_PROGRESS',
          startOffsetDays: -14,
          deadlineOffsetDays: 45,
          tickets: [
            {
              ticketKey: 'CORE-1',
              ticketNumber: 1,
              ticketType: 'TASK',
              title: 'Verify local development infrastructure & health endpoints',
              description: 'Docker Compose containers (PostgreSQL, Redis, Meilisearch, MinIO) operational.',
              status: 'IN_PROGRESS',
              priority: 'HIGH',
              storyPoints: 3,
              reporterUserKey: 'admin',
              assigneeUserKey: 'dev',
            },
          ],
          milestones: [
            {
              title: 'Architecture Baseline & Schema Sharding',
              description: 'PostgreSQL relational core schemas, connection pooling, and baseline indices.',
              status: 'COMPLETED',
              dueOffsetDays: -7,
            },
            {
              title: 'Project & Team Management RBAC Engine',
              description: 'Hierarchical role bindings, personnel assignment, and project workflow controls.',
              status: 'IN_PROGRESS',
              dueOffsetDays: 10,
            },
            {
              title: 'SLA Engine & Production Rollout',
              description: 'High-throughput SLA breach monitor and webhook notification dispatchers.',
              status: 'PENDING',
              dueOffsetDays: 45,
            },
          ],
          activityLogs: [
            {
              actorUserKey: 'admin',
              action: 'PROJECT_INITIALIZED',
              detailTemplate: ({ adminName, projectName }) =>
                `Project ${projectName} initialized by ${adminName}.`,
            },
            {
              actorUserKey: 'admin',
              action: 'REVIEWER_ASSIGNED',
              detailTemplate: ({ devName }) =>
                `Assigned ${devName} as primary Technical Reviewer.`,
            },
            {
              actorUserKey: 'dev',
              action: 'MILESTONE_COMPLETED',
              detailTemplate: () =>
                'Milestone "Architecture Baseline & Schema Sharding" marked completed.',
            },
          ],
          members: [
            { userKey: 'admin', roleName: 'Super Admin' },
            { userKey: 'dev', roleName: 'Team Lead' },
            { userKey: 'employee', roleName: 'Employee' },
          ],
        },
      ],
    },
    {
      name: 'Information Technology',
      code: 'IT',
      teams: [
        {
          name: 'Enterprise Support',
          keyPrefix: 'ITSD',
          description: 'Enterprise IT operations, identity lifecycle, and technical support desk.',
          leadUserKey: 'admin',
          members: [
            { userKey: 'admin', role: 'LEAD' },
            { userKey: 'employee', role: 'MEMBER' },
          ],
        },
      ],
      projects: [
        {
          key: 'HD',
          name: 'IT Helpdesk & Service Desk',
          description: 'Employee hardware provisioning, technical inquiries, and access management.',
          projectType: 'SERVICE_DESK',
          privacyTier: 'PUBLIC',
          primaryTeamPrefix: 'ITSD',
          projectManagerUserKey: 'admin',
          reviewerUserKey: 'admin',
          status: 'IN_PROGRESS',
          startOffsetDays: -14,
          deadlineOffsetDays: 45,
          tickets: [
            {
              ticketKey: 'HD-1',
              ticketNumber: 1,
              ticketType: 'SERVICE_REQUEST',
              title: 'Hardware Upgrade: 32GB RAM Developer Laptop',
              description: 'Requesting upgrade for local Docker containers and LLM inference development.',
              status: 'PENDING_APPROVAL',
              priority: 'MEDIUM',
              reporterUserKey: 'employee',
              assigneeUserKey: 'admin',
            },
          ],
          milestones: [
            {
              title: 'IT Helpdesk Portal Launch',
              description: 'Self-service ticketing portal for internal staff.',
              status: 'COMPLETED',
              dueOffsetDays: -14,
            },
            {
              title: 'Hardware Procurement Automation',
              description: 'Direct procurement workflow integration for laptop allocation.',
              status: 'IN_PROGRESS',
              dueOffsetDays: 14,
            },
          ],
          activityLogs: [
            {
              actorUserKey: 'admin',
              action: 'PROJECT_INITIALIZED',
              detailTemplate: ({ adminName, projectName }) =>
                `Project ${projectName} initialized by ${adminName}.`,
            },
          ],
          members: [
            { userKey: 'admin', roleName: 'Super Admin' },
            { userKey: 'employee', roleName: 'Employee' },
          ],
        },
      ],
    },
  ];

  return {
    domain,
    users,
    roles,
    departments,
  };
}

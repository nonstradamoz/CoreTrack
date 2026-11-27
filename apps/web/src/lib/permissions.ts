/**
 * 64-Bit Bitmask Permission Architecture for CoreTrack Web Client
 */
export const Permissions = {
  // Global / System (Bits 0-7)
  ORG_ADMIN:              1n << 0n, // 1
  PROJECT_CREATE:         1n << 1n, // 2
  USER_INVITE:            1n << 2n, // 4
  SETTINGS_EDIT:          1n << 3n, // 8

  // Project Level (Bits 8-19)
  PROJECT_VIEW:           1n << 8n,  // 256
  PROJECT_EDIT:           1n << 9n,  // 512
  PROJECT_DELETE:         1n << 10n, // 1024
  PROJECT_ADMIN:          1n << 11n, // 2048
  MEMBER_MANAGE:          1n << 12n, // 4096
  SPRINT_MANAGE:          1n << 13n, // 8192
  AUTOMATION_MANAGE:      1n << 14n, // 16384

  // Ticket Operations (Bits 20-35)
  TICKET_VIEW:            1n << 20n, // 1,048,576
  TICKET_CREATE:          1n << 21n, // 2,097,152
  TICKET_EDIT:            1n << 22n, // 4,194,304
  TICKET_DELETE:          1n << 23n, // 8,388,608
  TICKET_ASSIGN:          1n << 24n, // 16,777,216
  TICKET_TRANSITION:      1n << 25n, // 33,554,432
  TICKET_ATTACH:          1n << 26n, // 67,108,864
  TICKET_BATCH_EDIT:      1n << 27n, // 134,217,728

  // Collaboration & ITSM (Bits 36-47)
  COMMENT_VIEW_PUBLIC:    1n << 36n,
  COMMENT_CREATE_PUBLIC:  1n << 37n,
  COMMENT_VIEW_INTERNAL:  1n << 38n, // Internal notes
  COMMENT_CREATE_INTERNAL:1n << 39n,
  APPROVAL_REVIEW:        1n << 40n,
  SLA_OVERRIDE:           1n << 41n,
} as const;

export type PermissionKey = keyof typeof Permissions;

export function hasPermission(userBitmask: bigint, requiredPermission: bigint): boolean {
  if ((userBitmask & Permissions.ORG_ADMIN) === Permissions.ORG_ADMIN) {
    return true;
  }
  return (userBitmask & requiredPermission) === requiredPermission;
}

/**
 * Standard role bitmasks — 6-tier RBAC hierarchy
 */
export const StandardRoleBitmasks = {
  SUPER_ADMIN: Permissions.ORG_ADMIN,

  ADMIN:
    Permissions.PROJECT_CREATE |
    Permissions.USER_INVITE |
    Permissions.PROJECT_VIEW |
    Permissions.PROJECT_EDIT |
    Permissions.PROJECT_DELETE |
    Permissions.PROJECT_ADMIN |
    Permissions.MEMBER_MANAGE |
    Permissions.SPRINT_MANAGE |
    Permissions.AUTOMATION_MANAGE |
    Permissions.TICKET_VIEW |
    Permissions.TICKET_CREATE |
    Permissions.TICKET_EDIT |
    Permissions.TICKET_DELETE |
    Permissions.TICKET_ASSIGN |
    Permissions.TICKET_TRANSITION |
    Permissions.TICKET_ATTACH |
    Permissions.TICKET_BATCH_EDIT |
    Permissions.COMMENT_VIEW_PUBLIC |
    Permissions.COMMENT_CREATE_PUBLIC |
    Permissions.COMMENT_VIEW_INTERNAL |
    Permissions.COMMENT_CREATE_INTERNAL |
    Permissions.APPROVAL_REVIEW |
    Permissions.SLA_OVERRIDE,

  MANAGER:
    Permissions.PROJECT_CREATE |
    Permissions.USER_INVITE |
    Permissions.PROJECT_VIEW |
    Permissions.PROJECT_EDIT |
    Permissions.PROJECT_ADMIN |
    Permissions.MEMBER_MANAGE |
    Permissions.SPRINT_MANAGE |
    Permissions.AUTOMATION_MANAGE |
    Permissions.TICKET_VIEW |
    Permissions.TICKET_CREATE |
    Permissions.TICKET_EDIT |
    Permissions.TICKET_DELETE |
    Permissions.TICKET_ASSIGN |
    Permissions.TICKET_TRANSITION |
    Permissions.TICKET_ATTACH |
    Permissions.TICKET_BATCH_EDIT |
    Permissions.COMMENT_VIEW_PUBLIC |
    Permissions.COMMENT_CREATE_PUBLIC |
    Permissions.COMMENT_VIEW_INTERNAL |
    Permissions.COMMENT_CREATE_INTERNAL |
    Permissions.APPROVAL_REVIEW |
    Permissions.SLA_OVERRIDE,

  TEAM_LEAD:
    Permissions.PROJECT_VIEW |
    Permissions.SPRINT_MANAGE |
    Permissions.TICKET_VIEW |
    Permissions.TICKET_CREATE |
    Permissions.TICKET_EDIT |
    Permissions.TICKET_ASSIGN |
    Permissions.TICKET_TRANSITION |
    Permissions.TICKET_ATTACH |
    Permissions.TICKET_BATCH_EDIT |
    Permissions.COMMENT_VIEW_PUBLIC |
    Permissions.COMMENT_CREATE_PUBLIC |
    Permissions.COMMENT_VIEW_INTERNAL |
    Permissions.COMMENT_CREATE_INTERNAL,

  EMPLOYEE:
    Permissions.PROJECT_VIEW |
    Permissions.TICKET_VIEW |
    Permissions.TICKET_CREATE |
    Permissions.TICKET_ATTACH |
    Permissions.COMMENT_VIEW_PUBLIC |
    Permissions.COMMENT_CREATE_PUBLIC,

  CUSTOM: 0n,
} as const;

/**
 * Module-level access control mapping
 */
export const MODULE_ACCESS: Record<string, bigint> = {
  dashboard:   Permissions.PROJECT_VIEW,
  board:       Permissions.PROJECT_VIEW,
  table:       Permissions.TICKET_BATCH_EDIT,
  timeline:    Permissions.PROJECT_VIEW,
  backlog:     Permissions.SPRINT_MANAGE,
  reports:     Permissions.PROJECT_VIEW,
  automation:  Permissions.AUTOMATION_MANAGE,
  mail:        Permissions.AUTOMATION_MANAGE,
  portal:      Permissions.TICKET_CREATE,
  settings:    Permissions.SETTINGS_EDIT,
};

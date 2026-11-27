'use client';

import { usePermissions } from './usePermissions';
import { MODULE_ACCESS, Permissions } from '../lib/permissions';

export type AppModule =
  | 'dashboard'
  | 'board'
  | 'table'
  | 'timeline'
  | 'backlog'
  | 'reports'
  | 'automation'
  | 'portal'
  | 'settings'
  | 'mail';

/**
 * Returns whether the currently authenticated user may access a given app module.
 * Super Admin (ORG_ADMIN bit) always bypasses every check.
 */
export function useModuleAccess() {
  const { rawPermissions, isOrgAdmin, roleTier, isLoading } = usePermissions();

  function canAccess(module: AppModule): boolean {
    if (isLoading) return true;
    if (isOrgAdmin) return true;
    if (module === 'automation') {
      return isOrgAdmin || roleTier >= 4;
    }
    if (module === 'mail') {
      return roleTier >= 3 || (rawPermissions & Permissions.AUTOMATION_MANAGE) === Permissions.AUTOMATION_MANAGE;
    }
    const required = MODULE_ACCESS[module];
    if (required === undefined) return true; // unknown module → allow
    return (rawPermissions & required) === required;
  }

  /**
   * Returns true only when SETTINGS_EDIT bit is set (Super Admin only).
   * Admin role does NOT carry this bit.
   */
  function canAccessSettings(): boolean {
    if (isOrgAdmin) return true;
    return (rawPermissions & Permissions.SETTINGS_EDIT) === Permissions.SETTINGS_EDIT;
  }

  /**
   * Returns true for Super Admin (5), Admin (4), and Project Manager (3).
   */
  function canAccessMail(): boolean {
    if (isOrgAdmin) return true;
    return roleTier >= 3 || (rawPermissions & Permissions.AUTOMATION_MANAGE) === Permissions.AUTOMATION_MANAGE;
  }

  return { canAccess, canAccessSettings, canAccessMail, isLoading };
}

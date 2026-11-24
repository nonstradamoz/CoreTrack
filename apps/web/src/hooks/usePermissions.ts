'use client';

import { useQuery } from '@tanstack/react-query';
import { useProject } from '../context/ProjectContext';
import { Permissions, hasPermission as checkBitmask } from '../lib/permissions';
import { API_URL } from '../lib/api';

export function usePermissions() {
  const { activeProject } = useProject();
  const projectKey = activeProject?.key || 'CORE';

  const { data, isLoading } = useQuery({
    queryKey: ['currentUserPermissions', projectKey],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/v1/auth/me?projectKey=${encodeURIComponent(projectKey)}`);
      if (!res.ok) throw new Error('Failed to fetch user permissions');
      const json = await res.json();
      return json.data;
    },
  });

  const rawGlobal = BigInt(data?.globalPermissions || '0');
  const rawEffective = BigInt(data?.effectivePermissions || '0');
  const isOrgAdmin = (rawGlobal & Permissions.ORG_ADMIN) === Permissions.ORG_ADMIN;

  function hasPerm(requiredBit: bigint): boolean {
    if (isOrgAdmin) return true;
    return checkBitmask(rawEffective, requiredBit);
  }

  return {
    user: data,
    roleName: data?.roleName || (isOrgAdmin ? 'Organization Admin' : 'Member'),
    roleTier: (data?.roleTier as number) || (isOrgAdmin ? 5 : 1),
    isOrgAdmin,
    hasPermission: hasPerm,
    isLoading,
    rawPermissions: rawEffective,
  };
}

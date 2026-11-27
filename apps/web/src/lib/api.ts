/**
 * Resolves the base URL for API requests.
 * - In server-side execution (functions/SSR), prioritizes the Vercel Service binding (process.env.API_URL).
 * - In client-side execution, uses process.env.NEXT_PUBLIC_API_URL if defined,
 *   or an empty string in production/Vercel (leveraging top-level rewrites on the same origin),
 *   or 'http://localhost:4000' during standalone local development.
 */
function normalizeUrl(rawUrl?: string): string {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim().replace(/\/$/, '');
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export function getBaseApiUrl(): string {
  if (typeof window === 'undefined') {
    if (process.env.API_URL) {
      return normalizeUrl(process.env.API_URL);
    }
    if (process.env.NEXT_PUBLIC_API_URL) {
      return normalizeUrl(process.env.NEXT_PUBLIC_API_URL);
    }
    return 'http://localhost:4000';
  }

  if (process.env.NEXT_PUBLIC_API_URL) {
    return normalizeUrl(process.env.NEXT_PUBLIC_API_URL);
  }

  if (typeof window !== 'undefined' && window.location.port === '3000' && window.location.hostname === 'localhost') {
    return 'http://localhost:4000';
  }

  return '';
}

export const API_URL = {
  toString() {
    return getBaseApiUrl();
  },
  valueOf() {
    return getBaseApiUrl();
  },
  [Symbol.toPrimitive]() {
    return getBaseApiUrl();
  },
} as unknown as string;

const AUTH_TOKEN_KEY = 'coretrack_auth_token';

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

export function clearAuthToken() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem('coretrack_user_email');
  } catch {
    // ignore
  }
}

// Attach per-browser Authorization Bearer JWT to all API requests
if (typeof window !== 'undefined' && !(window as any).__coretrackFetchPatched) {
  (window as any).__coretrackFetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const baseApi = getBaseApiUrl();
    const isApiRequest =
      url.startsWith('/api/v1/') || (baseApi ? url.startsWith(baseApi) : false);

    if (isApiRequest) {
      const token = getAuthToken();
      if (token) {
        const headers = new Headers(
          init?.headers || (input instanceof Request ? input.headers : undefined)
        );
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        return originalFetch(input, { ...init, headers });
      }
    }
    return originalFetch(input, init);
  };
}

export interface Ticket {
  id: string;
  projectId: string;
  teamId?: string | null;
  team?: { id: string; name: string; keyPrefix: string } | null;
  ticketKey: string;
  displayKey?: string;
  userTicketNumber?: number;
  ticketNumber: number;
  ticketType: 'INITIATIVE' | 'EPIC' | 'STORY' | 'TASK' | 'BUG' | 'SERVICE_REQUEST' | 'INCIDENT';
  parentId?: string | null;
  sprintId?: string | null;
  title: string;
  description: string;
  status: 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'PENDING_APPROVAL' | 'IN_REVIEW' | 'RESOLVED' | 'DONE' | 'CANCELED';
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  storyPoints?: number | null;
  estimatedHours?: string | null;
  spentHours?: string | null;
  reporterId: string;
  assigneeId?: string | null;
  assignee?: UserPersona | null;
  startDate?: string | null;
  dueDate?: string | null;
  dueDateSetByUserId?: string | null;
  dueDateSetByRoleTier?: number | null;
  assignedByUserId?: string | null;
  assignedByRoleTier?: number | null;
  lockVersion: number;
  slaResponseDueAt?: string | null;
  slaResolutionDueAt?: string | null;
  isSlaPaused?: boolean;
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  ticketId: string;
  authorId: string;
  authorName?: string | null;
  authorEmail?: string | null;
  body: string;
  visibilityScope: 'PUBLIC' | 'INTERNAL_ONLY' | 'RESTRICTED_GROUPS';
  createdAt: string;
}

export interface Project {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  projectType: string;
  privacyTier: string;
  status?: string;
  computedStatus?: string;
  startDate?: string | null;
  deadline?: string | null;
  deadlineSetByUserId?: string | null;
  deadlineSetByRoleTier?: number | null;
  githubRepoOwner?: string | null;
  githubRepoName?: string | null;
  githubLastSyncedAt?: string | null;
  projectManagerId?: string | null;
  reviewerId?: string | null;
  archived?: boolean;
  nextTicketNumber?: number;
  totalTicketsCount?: number;
  completedTicketsCount?: number;
  progressPercentage?: number;
  memberCount?: number;
  milestonesCount?: number;
  completedMilestonesCount?: number;
  projectManager?: { id: string; fullName: string; email: string } | null;
  reviewer?: { id: string; fullName: string; email: string } | null;
  primaryTeam?: {
    id: string;
    name: string;
    keyPrefix: string;
    lead?: { id: string; fullName: string; email: string } | null;
    members?: Array<{
      id: string;
      teamId: string;
      userId: string;
      role: 'LEAD' | 'MEMBER';
      user?: { id: string; fullName: string; email: string };
    }>;
  } | null;
  assignedTeams?: Array<{
    id: string;
    name: string;
    keyPrefix: string;
    description?: string | null;
    leadId?: string | null;
    lead?: { id: string; fullName: string; email: string } | null;
    members?: Array<{
      id: string;
      teamId: string;
      userId: string;
      role: 'LEAD' | 'MEMBER';
      user?: { id: string; fullName: string; email: string };
    }>;
  }>;
  department?: { id: string; name: string; code: string } | null;
}

export interface ProjectMilestone {
  id: string;
  projectId: string;
  title: string;
  description?: string | null;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  dueDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectActivityLog {
  id: string;
  projectId: string;
  userId?: string | null;
  action: string;
  details: string;
  createdAt: string;
  user?: {
    id: string;
    fullName: string;
    email: string;
  } | null;
}

export interface ProjectDetail extends Project {
  milestones: ProjectMilestone[];
  activityLogs: ProjectActivityLog[];
  members: Array<{
    id: string;
    projectId: string;
    userId: string;
    roleId: string;
    user: { id: string; fullName: string; email: string };
    role: { id: string; name: string; color: string };
  }>;
  tickets: Array<{
    id: string;
    ticketKey: string;
    displayKey?: string;
    title: string;
    status: string;
    priority: string;
    assigneeId?: string | null;
    teamId?: string | null;
    team?: { id: string; name: string; keyPrefix: string } | null;
    dueDate?: string | null;
  }>;
  ticketStatusBreakdown: Record<string, number>;
}

export interface ProjectDashboardMetrics {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  overdueProjects: number;
  onHoldProjects: number;
  notStartedProjects: number;
  totalTickets: number;
  completedTickets: number;
  overallProgress: number;
  upcomingDeadlines: Array<{
    id: string;
    key: string;
    name: string;
    deadline: string | null;
    daysRemaining: number;
    status: string;
  }>;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  role: 'LEAD' | 'MEMBER';
  createdAt: string;
  user?: {
    id: string;
    fullName: string;
    email: string;
  };
}

export interface Team {
  id: string;
  name: string;
  keyPrefix: string;
  description?: string | null;
  leadId?: string | null;
  departmentId: string;
  department?: { id: string; name: string; code: string };
  lead?: { id: string; fullName: string; email: string } | null;
  members: TeamMember[];
  projects: Array<{ id: string; key: string; name: string; status: string }>;
  memberCount?: number;
  assignedTicketsCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal?: string | null;
  status: 'PLANNING' | 'ACTIVE' | 'CLOSED';
  startDate?: string | null;
  endDate?: string | null;
  ticketCount: number;
  totalPoints: number;
  completedPoints: number;
  createdAt: string;
}

export interface UserPersona {
  id: string;
  email: string;
  fullName: string;
  designation?: string | null;
  userType: string;
  status?: string;
  globalPermissions: string;
  effectivePermissions?: string;
  roleName?: string;
  roleTier?: number;
  mustChangePassword?: boolean;
  createdAt?: string;
}

export interface CreateUserPayload {
  fullName: string;
  email: string;
  password: string;
  designation?: string | null;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'TEAM_LEAD' | 'EMPLOYEE';
  userType?: 'INTERNAL_EMPLOYEE' | 'EXTERNAL_GUEST';
  status?: 'ACTIVE' | 'INACTIVE';
  teamId?: string;
  projectId?: string;
  projectRoleId?: string;
  sendInviteEmail?: boolean;
}

export interface UpdateUserPayload {
  fullName?: string;
  designation?: string | null;
  role?: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'TEAM_LEAD' | 'EMPLOYEE';
  userType?: 'INTERNAL_EMPLOYEE' | 'EXTERNAL_GUEST';
  status?: 'ACTIVE' | 'INACTIVE';
  password?: string;
}

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${API_URL}/api/v1/projects`);
  if (!res.ok) throw new Error('Failed to fetch projects');
  const json = await res.json();
  return json.data;
}

export async function fetchTickets(projectKey: string): Promise<Ticket[]> {
  const res = await fetch(`${API_URL}/api/v1/tickets?projectKey=${encodeURIComponent(projectKey)}`);
  if (!res.ok) throw new Error('Failed to fetch tickets');
  const json = await res.json();
  return json.data;
}

export async function fetchTicket(ticketKey: string): Promise<Ticket> {
  const res = await fetch(`${API_URL}/api/v1/tickets/${encodeURIComponent(ticketKey)}`);
  if (!res.ok) throw new Error('Failed to fetch ticket');
  const json = await res.json();
  return json.data;
}

export async function createTicket(data: {
  projectId: string;
  teamId?: string;
  title: string;
  description?: string;
  ticketType: Ticket['ticketType'];
  priority: Ticket['priority'];
  status: Ticket['status'];
  storyPoints?: number;
  assigneeId?: string;
  dueDate?: string;
}): Promise<Ticket> {
  const res = await fetch(`${API_URL}/api/v1/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to create ticket');
  }
  const json = await res.json();
  return json.data;
}

export async function updateTicket(
  ticketKey: string,
  updates: Partial<Ticket> & { lockVersion: number }
): Promise<Ticket> {
  const res = await fetch(`${API_URL}/api/v1/tickets/${encodeURIComponent(ticketKey)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || err.message || 'Failed to update ticket');
  }
  const json = await res.json();
  return json.data;
}

export async function fetchComments(ticketKey: string): Promise<Comment[]> {
  const res = await fetch(`${API_URL}/api/v1/tickets/${encodeURIComponent(ticketKey)}/comments`);
  if (!res.ok) throw new Error('Failed to fetch comments');
  const json = await res.json();
  return json.data;
}

export async function createComment(
  ticketKey: string,
  data: { body: string; visibilityScope: 'PUBLIC' | 'INTERNAL_ONLY' }
): Promise<Comment> {
  const res = await fetch(`${API_URL}/api/v1/tickets/${encodeURIComponent(ticketKey)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to post comment');
  }
  const json = await res.json();
  return json.data;
}

// Sprint Management Endpoints
export async function fetchSprints(projectKey: string): Promise<Sprint[]> {
  const res = await fetch(`${API_URL}/api/v1/projects/${encodeURIComponent(projectKey)}/sprints`);
  if (!res.ok) throw new Error('Failed to fetch sprints');
  const json = await res.json();
  return json.data;
}

export async function createSprint(
  projectKey: string,
  data: { name: string; goal?: string; startDate?: string; endDate?: string }
): Promise<Sprint> {
  const res = await fetch(`${API_URL}/api/v1/projects/${encodeURIComponent(projectKey)}/sprints`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to create sprint');
  }
  const json = await res.json();
  return json.data;
}

export async function updateSprintStatus(
  sprintId: string,
  updates: { status?: 'PLANNING' | 'ACTIVE' | 'CLOSED'; name?: string; goal?: string }
): Promise<Sprint> {
  const res = await fetch(`${API_URL}/api/v1/sprints/${encodeURIComponent(sprintId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to update sprint');
  }
  const json = await res.json();
  return json.data;
}

export async function assignTicketToSprint(
  ticketKey: string,
  sprintId: string | null
): Promise<Ticket> {
  const res = await fetch(`${API_URL}/api/v1/tickets/${encodeURIComponent(ticketKey)}/sprint`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sprintId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to assign ticket to sprint');
  }
  const json = await res.json();
  return json.data;
}

// Authentication & IAM Mock SSO Endpoints
export async function fetchCurrentUser(): Promise<UserPersona> {
  const res = await fetch(`${API_URL}/api/v1/auth/me`);
  if (!res.ok) throw new Error('Failed to fetch authenticated session');
  const json = await res.json();
  return json.data;
}

export async function fetchAvailableUsers(): Promise<UserPersona[]> {
  const res = await fetch(`${API_URL}/api/v1/auth/users`);
  if (!res.ok) throw new Error('Failed to fetch user directory');
  const json = await res.json();
  return json.data;
}

export async function createUser(payload: CreateUserPayload): Promise<UserPersona> {
  const res = await fetch(`${API_URL}/api/v1/auth/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Failed to create user account');
  }
  const json = await res.json();
  return json.data;
}

export async function updateUser(id: string, payload: UpdateUserPayload): Promise<UserPersona> {
  const res = await fetch(`${API_URL}/api/v1/auth/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Failed to update user account');
  }
  const json = await res.json();
  return json.data;
}

export async function deleteUser(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/auth/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Failed to deactivate user');
  }
}

export async function switchUser(email: string): Promise<{ message: string; token?: string; user: UserPersona | null }> {
  const res = await fetch(`${API_URL}/api/v1/auth/switch-user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to switch user persona');
  }
  const json = await res.json();
  if (typeof window !== 'undefined') {
    localStorage.setItem('coretrack_user_email', email);
    if (json.data?.token) setAuthToken(json.data.token);
  }
  return json.data;
}

export async function loginUser(email: string, password?: string): Promise<{ message: string; token?: string; user: UserPersona }> {
  const res = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const error = new Error(err.error || err.message || 'Invalid email or password') as Error & {
      code?: string;
    };
    if (err.code) error.code = err.code;
    throw error;
  }
  const json = await res.json();
  if (typeof window !== 'undefined') {
    localStorage.setItem('coretrack_user_email', email);
    if (json.data?.token) setAuthToken(json.data.token);
  }
  return json.data;
}

export async function setupInitialPassword(
  email: string,
  password: string
): Promise<{ message: string; token?: string; user: UserPersona }> {
  const res = await fetch(`${API_URL}/api/v1/auth/setup-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Failed to set password');
  }
  const json = await res.json();
  if (typeof window !== 'undefined') {
    localStorage.setItem('coretrack_user_email', email);
    if (json.data?.token) setAuthToken(json.data.token);
  }
  return json.data;
}

export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string
): Promise<{ message: string }> {
  const res = await fetch(`${API_URL}/api/v1/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Failed to update password');
  }
  const json = await res.json();
  return json.data;
}

export async function logoutUser(): Promise<{ message: string }> {
  const res = await fetch(`${API_URL}/api/v1/auth/logout`, {
    method: 'POST',
  });
  clearAuthToken();
  const json = await res.json();
  return json.data;
}

// ==========================================
// TIER 1 EXTENSIONS: Dependencies, Bulk, Search, Attachments
// ==========================================

export interface TicketDependency {
  id: string;
  dependencyType: 'BLOCKS' | 'BLOCKED_BY' | 'RELATES_TO' | 'DUPLICATES';
  sourceId?: string;
  sourceKey?: string;
  sourceTitle?: string;
  sourceStatus?: string;
  sourcePriority?: string;
  sourceDueDate?: string | null;
  targetId?: string;
  targetKey?: string;
  targetTitle?: string;
  targetStatus?: string;
  targetPriority?: string;
  targetDueDate?: string | null;
  externalText?: string | null;
  createdAt?: string;
}

export interface TicketAttachment {
  id: string;
  ticketId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  s3Key: string;
  createdAt: string;
  uploaderName?: string | null;
  uploadUrl?: string;
  downloadUrl?: string;
}

export interface TicketApproval {
  id: string;
  ticketId: string;
  approverId?: string | null;
  tier: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  comment?: string | null;
  decidedAt?: string | null;
  createdAt: string;
}

export interface TicketVcsLink {
  id: string;
  ticketId: string;
  provider: 'GITHUB' | 'GITLAB';
  linkType: 'PULL_REQUEST' | 'COMMIT' | 'BRANCH';
  externalId: string;
  title: string;
  url: string;
  branchName?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface SprintBurndownReport {
  sprint: {
    id: string;
    name: string;
    status: string;
    totalPoints: number;
    completedPoints: number;
    remainingPoints: number;
  };
  dataPoints: {
    day: string;
    idealPoints: number;
    remainingPoints: number;
  }[];
}

export interface VelocityReport {
  projectKey: string;
  averageVelocity: number;
  velocityHistory: {
    sprintId: string;
    sprintName: string;
    status: string;
    committedPoints: number;
    completedPoints: number;
  }[];
}

export async function fetchProjectDependencies(projectKey: string): Promise<TicketDependency[]> {
  const res = await fetch(`${API_URL}/api/v1/tickets/dependencies/project/${encodeURIComponent(projectKey)}`);
  if (!res.ok) throw new Error('Failed to fetch project dependencies');
  const json = await res.json();
  return json.data;
}

export async function fetchTicketDependencies(ticketKey: string): Promise<{ outward: TicketDependency[]; inward: TicketDependency[] }> {
  const res = await fetch(`${API_URL}/api/v1/tickets/${encodeURIComponent(ticketKey)}/dependencies`);
  if (!res.ok) throw new Error('Failed to fetch ticket dependencies');
  const json = await res.json();
  return json.data;
}

export async function createTicketDependency(
  ticketKey: string,
  data: {
    targetTicketKey?: string;
    externalText?: string;
    dependencyType: 'BLOCKS' | 'BLOCKED_BY' | 'RELATES_TO' | 'DUPLICATES';
  }
): Promise<TicketDependency> {
  const res = await fetch(`${API_URL}/api/v1/tickets/${encodeURIComponent(ticketKey)}/dependencies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || 'Failed to create dependency');
  }
  const json = await res.json();
  return json.data;
}

export async function searchProjectTasks(
  projectKey: string,
  q?: string,
  excludeKey?: string
): Promise<Array<{ id: string; ticketKey: string; title: string; status: string; priority: string; projectKey: string }>> {
  const params = new URLSearchParams({ projectKey });
  if (q) params.set('q', q);
  if (excludeKey) params.set('excludeKey', excludeKey);
  const res = await fetch(`${API_URL}/api/v1/tickets/search/project-tasks?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to search project tasks');
  const json = await res.json();
  return json.data;
}

export interface ProjectGithubConfig {
  owner: string | null;
  repo: string | null;
  hasToken: boolean;
  lastSyncedAt: string | null;
  linkedVcsItemsCount: number;
}

export async function fetchProjectGithubConfig(projectKey: string): Promise<ProjectGithubConfig> {
  const res = await fetch(`${API_URL}/api/v1/projects/${encodeURIComponent(projectKey)}/github`);
  if (!res.ok) throw new Error('Failed to fetch GitHub configuration');
  const json = await res.json();
  return json.data;
}

export async function saveProjectGithubConfig(
  projectKey: string,
  config: { owner: string; repo: string; token?: string }
): Promise<{ success: boolean; config: ProjectGithubConfig }> {
  const res = await fetch(`${API_URL}/api/v1/projects/${encodeURIComponent(projectKey)}/github/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to save GitHub configuration');
  }
  return res.json();
}

export async function syncProjectGithub(
  projectKey: string
): Promise<{ success: boolean; syncedItemsCount: number; matchedTicketsCount: number; message: string }> {
  const res = await fetch(`${API_URL}/api/v1/projects/${encodeURIComponent(projectKey)}/github/sync`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to sync GitHub repository');
  }
  return res.json();
}

export async function deleteTicketDependency(ticketKey: string, dependencyId: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_URL}/api/v1/tickets/${encodeURIComponent(ticketKey)}/dependencies/${encodeURIComponent(dependencyId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete dependency');
  return res.json();
}

export async function deleteTicket(ticketKey: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_URL}/api/v1/tickets/${encodeURIComponent(ticketKey)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Failed to delete ticket');
  }
  return res.json();
}

export async function bulkUpdateTickets(data: {
  ticketKeys: string[];
  status?: Ticket['status'];
  priority?: Ticket['priority'];
  assigneeId?: string | null;
  sprintId?: string | null;
}): Promise<{ success: boolean; updatedCount: number; data: Ticket[] }> {
  const res = await fetch(`${API_URL}/api/v1/tickets/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to bulk update tickets');
  }
  return res.json();
}

export async function searchGlobalTickets(q: string, projectKey?: string): Promise<Ticket[]> {
  const params = new URLSearchParams({ q });
  if (projectKey) params.set('projectKey', projectKey);
  const res = await fetch(`${API_URL}/api/v1/tickets/search/global?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to search tickets');
  const json = await res.json();
  return json.data;
}

export async function fetchTicketAttachments(ticketKey: string): Promise<TicketAttachment[]> {
  const res = await fetch(`${API_URL}/api/v1/tickets/${encodeURIComponent(ticketKey)}/attachments`);
  if (!res.ok) throw new Error('Failed to fetch attachments');
  const json = await res.json();
  return json.data;
}

export async function presignTicketAttachment(
  ticketKey: string,
  data: { fileName: string; fileSize: number; mimeType: string }
): Promise<TicketAttachment> {
  const res = await fetch(`${API_URL}/api/v1/tickets/${encodeURIComponent(ticketKey)}/attachments/presign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to register attachment');
  }
  const json = await res.json();
  return json.data;
}

export async function fetchTicketApprovals(ticketKey: string): Promise<TicketApproval[]> {
  const res = await fetch(`${API_URL}/api/v1/tickets/${encodeURIComponent(ticketKey)}/approvals`);
  if (!res.ok) throw new Error('Failed to fetch approvals');
  const json = await res.json();
  return json.data;
}

export async function requestTicketApproval(
  ticketKey: string,
  data: { approverEmail?: string; tier?: number }
): Promise<TicketApproval> {
  const res = await fetch(`${API_URL}/api/v1/tickets/${encodeURIComponent(ticketKey)}/approvals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || 'Failed to request approval');
  }
  const json = await res.json();
  return json.data;
}

export async function submitApprovalDecision(
  ticketKey: string,
  approvalId: string,
  data: { decision: 'APPROVED' | 'REJECTED'; comment?: string }
): Promise<{ success: boolean; data: TicketApproval; ticketStatus: string }> {
  const res = await fetch(
    `${API_URL}/api/v1/tickets/${encodeURIComponent(ticketKey)}/approvals/${encodeURIComponent(approvalId)}/decision`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  );
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || 'Failed to submit approval decision');
  }
  return res.json();
}

export async function fetchTicketVcsLinks(ticketKey: string): Promise<TicketVcsLink[]> {
  const res = await fetch(`${API_URL}/api/v1/tickets/${encodeURIComponent(ticketKey)}/vcs-links`);
  if (!res.ok) throw new Error('Failed to fetch VCS links');
  const json = await res.json();
  return json.data;
}

export async function fetchSprintBurndown(sprintId: string): Promise<SprintBurndownReport> {
  const res = await fetch(`${API_URL}/api/v1/reports/burndown?sprintId=${encodeURIComponent(sprintId)}`);
  if (!res.ok) throw new Error('Failed to fetch sprint burndown report');
  const json = await res.json();
  return json.data;
}

export interface PortfolioDashboardData {
  summary: {
    totalProjects: number;
    totalTicketsCount: number;
    completedTicketsCount: number;
    completionRate: number;
    totalStoryPoints: number;
    completedStoryPoints: number;
    slaAtRiskCount: number;
    pendingApprovalsCount: number;
  };
  projectsHealth: {
    id: string;
    key: string;
    name: string;
    description?: string | null;
    projectType: string;
    privacyTier: string;
    totalTickets: number;
    completedTickets: number;
    completionPercentage: number;
    activeSprint: {
      id: string;
      name: string;
      status: string;
    } | null;
    healthStatus: 'ON_TRACK' | 'AT_RISK' | 'IN_PROGRESS';
  }[];
  crossProjectBlockers: {
    id: string;
    dependencyType: string;
    isCrossProject: boolean;
    source: {
      ticketKey: string;
      title: string;
      status: string;
      projectKey: string;
    };
    target: {
      ticketKey: string;
      title: string;
      status: string;
      projectKey: string;
    };
  }[];
  criticalRiskTickets: {
    id: string;
    ticketKey: string;
    title: string;
    status: string;
    priority: string;
    ticketType: string;
    slaResolutionDueAt?: string | null;
    isSlaPaused?: boolean;
  }[];
  teamWorkload: {
    userId: string;
    fullName: string;
    email: string;
    totalAssigned: number;
    openAssigned: number;
    allocatedPoints: number;
  }[];
}

export async function fetchProjectVelocity(projectKey?: string): Promise<VelocityReport> {
  const params = projectKey ? `?projectKey=${encodeURIComponent(projectKey)}` : '';
  const res = await fetch(`${API_URL}/api/v1/reports/velocity${params}`);
  if (!res.ok) throw new Error('Failed to fetch velocity report');
  const json = await res.json();
  return json.data;
}

export async function fetchPortfolioDashboard(): Promise<PortfolioDashboardData> {
  const res = await fetch(`${API_URL}/api/v1/dashboard/portfolio`);
  if (!res.ok) throw new Error('Failed to fetch portfolio dashboard data');
  const json = await res.json();
  return json.data;
}

// Automation Rules & Import/Export Endpoints
export interface AutomationRule {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  triggerType: 'TASK_CREATED' | 'STATUS_CHANGED' | 'PRIORITY_CHANGED' | 'ASSIGNEE_CHANGED';
  conditions: Array<{ field: string; operator: string; value?: unknown }>;
  actions: Array<{ type: string; value: unknown; extra?: Record<string, unknown> }>;
  isActive: boolean;
  executionCount: number;
  lastExecutedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function fetchAutomationRules(projectKey: string): Promise<AutomationRule[]> {
  const res = await fetch(`${API_URL}/api/v1/projects/${encodeURIComponent(projectKey)}/automation/rules`);
  if (!res.ok) throw new Error('Failed to fetch automation rules');
  const json = await res.json();
  return json.data;
}

export async function createAutomationRule(
  projectKey: string,
  input: {
    name: string;
    description?: string;
    triggerType: AutomationRule['triggerType'];
    conditions: AutomationRule['conditions'];
    actions: AutomationRule['actions'];
    isActive?: boolean;
  }
): Promise<AutomationRule> {
  const res = await fetch(`${API_URL}/api/v1/projects/${encodeURIComponent(projectKey)}/automation/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to create automation rule');
  }
  const json = await res.json();
  return json.data;
}

export async function updateAutomationRule(
  projectKey: string,
  ruleId: string,
  updates: Partial<AutomationRule>
): Promise<AutomationRule> {
  const res = await fetch(
    `${API_URL}/api/v1/projects/${encodeURIComponent(projectKey)}/automation/rules/${encodeURIComponent(ruleId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }
  );
  if (!res.ok) throw new Error('Failed to update automation rule');
  const json = await res.json();
  return json.data;
}

export async function deleteAutomationRule(projectKey: string, ruleId: string): Promise<{ success: boolean }> {
  const res = await fetch(
    `${API_URL}/api/v1/projects/${encodeURIComponent(projectKey)}/automation/rules/${encodeURIComponent(ruleId)}`,
    {
      method: 'DELETE',
    }
  );
  if (!res.ok) throw new Error('Failed to delete automation rule');
  return res.json();
}

export interface DeadlineScanSummary {
  timestamp: string;
  tasksPromotedToSprint: number;
  overdueTasksEscalated: number;
  overdueProjectsEscalated: number;
  totalEmailsDispatched: number;
  details: {
    promotedTickets: string[];
    escalatedTickets: string[];
    escalatedProjects: string[];
  };
}

export async function triggerDeadlineScan(): Promise<{ success: boolean; message: string; data: DeadlineScanSummary }> {
  const res = await fetch(`${API_URL}/api/v1/automation/scan-deadlines`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to trigger deadline scan');
  }
  return res.json();
}

export interface DeadlineSchedulerStatus {
  isActive: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastSummary: DeadlineScanSummary | null;
}

export async function fetchSchedulerStatus(): Promise<DeadlineSchedulerStatus> {
  const res = await fetch(`${API_URL}/api/v1/automation/scheduler`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to fetch deadline scheduler status');
  }
  const json = await res.json();
  return json.data;
}

export async function updateSchedulerStatus(payload: {
  isActive?: boolean;
  intervalMinutes?: number;
  runImmediately?: boolean;
}): Promise<DeadlineSchedulerStatus> {
  const res = await fetch(`${API_URL}/api/v1/automation/scheduler`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to update scheduler configuration');
  }
  const json = await res.json();
  return json.data;
}

export interface EmailNotificationLog {
  id: string;
  recipientEmail: string;
  recipientName?: string | null;
  subject: string;
  notificationType: string;
  ticketId?: string | null;
  projectId?: string | null;
  provider?: string | null;
  status: string;
  errorMessage?: string | null;
  sentAt: string;
}

export interface EmailProviderStatus {
  providers: Array<{
    name: 'RESEND' | 'MAILJET' | 'BREVO';
    priority: number;
    from: string;
  }>;
  failoverEnabled: boolean;
  primaryProvider: string;
  fallbackProvider: string | null;
}

export async function fetchEmailProviders(): Promise<EmailProviderStatus> {
  const res = await fetch(`${API_URL}/api/v1/automation/email-providers`);
  if (!res.ok) throw new Error('Failed to fetch email provider status');
  const json = await res.json();
  return json.data;
}

export async function fetchEmailNotificationLogs(limit = 50, mine = false): Promise<EmailNotificationLog[]> {
  const res = await fetch(`${API_URL}/api/v1/automation/email-logs?limit=${limit}${mine ? '&mine=true' : ''}`);
  if (!res.ok) throw new Error('Failed to fetch email notification logs');
  const json = await res.json();
  return json.data;
}

export async function clearEmailNotificationLogs(): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_URL}/api/v1/automation/email-logs`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to clear email notification logs');
  return res.json();
}

export async function importBatchTasks(
  projectKey: string,
  tasks: Array<{
    title: string;
    description?: string;
    ticketType?: string;
    priority?: string;
    status?: string;
    storyPoints?: number;
    dueDate?: string;
    assigneeEmail?: string;
  }>
): Promise<{ success: boolean; importedCount: number; ticketKeys: string[] }> {
  const res = await fetch(`${API_URL}/api/v1/projects/${encodeURIComponent(projectKey)}/import/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tasks }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to import batch tasks');
  }
  return res.json();
}

export function getExportCsvUrl(projectKey: string): string {
  return `${API_URL}/api/v1/projects/${encodeURIComponent(projectKey)}/export/csv`;
}

// Daily Status Update & Standup Types & Endpoints
export interface StandupTaskItem {
  key: string;
  title: string;
  status?: string;
  priority?: string;
  storyPoints?: number | null;
}

export interface TodayStandupResponse {
  user: {
    id: string;
    fullName: string;
    email: string;
  };
  project: {
    id: string;
    key: string;
    name: string;
  };
  date: string;
  savedStandup: {
    id: string;
    standupDate: string;
    completedTaskIds: StandupTaskItem[];
    inProgressTaskIds: StandupTaskItem[];
    blockers: string;
    customNotes: string;
    summaryMarkdown: string;
    updatedAt: string;
  } | null;
  autoCompiled: {
    completed: StandupTaskItem[];
    inProgress: StandupTaskItem[];
    blocked: StandupTaskItem[];
  };
  generatedSummaryMarkdown: string;
}

export interface TeamStandupEntry {
  id: string;
  standupDate: string;
  user: {
    id: string;
    fullName: string;
    email: string;
  };
  completedTasks: StandupTaskItem[];
  inProgressTasks: StandupTaskItem[];
  blockers: string;
  customNotes: string;
  summaryMarkdown: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamStandupsResponse {
  projectKey: string;
  date: string;
  standups: TeamStandupEntry[];
  unsubmittedActivity?: Array<{
    user: { id: string; fullName: string; email: string };
    completedTasks: StandupTaskItem[];
  }>;
}

export async function fetchTodayStandup(projectKey: string = 'CORE'): Promise<TodayStandupResponse> {
  const res = await fetch(`${API_URL}/api/v1/standups/today?projectKey=${encodeURIComponent(projectKey)}`);
  if (!res.ok) throw new Error('Failed to fetch today standup activity');
  const json = await res.json();
  return json.data;
}

export async function saveDailyStandup(payload: {
  projectId: string;
  standupDate: string;
  completedTaskIds: StandupTaskItem[];
  inProgressTaskIds: StandupTaskItem[];
  blockers?: string;
  customNotes?: string;
  summaryMarkdown: string;
}): Promise<any> {
  const res = await fetch(`${API_URL}/api/v1/standups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to save daily standup');
  }
  const json = await res.json();
  return json.data;
}

export async function fetchTeamStandups(projectKey: string = 'CORE', date?: string): Promise<TeamStandupsResponse> {
  const dateParam = date ? `&date=${encodeURIComponent(date)}` : '';
  const res = await fetch(`${API_URL}/api/v1/standups/team?projectKey=${encodeURIComponent(projectKey)}${dateParam}`);
  if (!res.ok) throw new Error('Failed to fetch team standups');
  const json = await res.json();
  return json.data;
}

// ==========================================
// TIER 3: Dynamic RBAC & Role Management
// ==========================================

export interface Role {
  id: string;
  name: string;
  description: string;
  color: string;
  isSystem: boolean;
  projectId: string | null;
  permissions: string;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PermissionDefinition {
  key: string;
  bit: string;
  name: string;
  category: 'ORG' | 'PROJECT' | 'TASK' | 'ITSM';
  description: string;
}

export interface ProjectMember {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  avatarUrl?: string | null;
  userType: string;
  role: {
    id: string;
    name: string;
    color: string;
    isSystem: boolean;
    permissions: string;
  };
  createdAt: string;
}

export async function fetchPermissionDefinitions(): Promise<PermissionDefinition[]> {
  const res = await fetch(`${API_URL}/api/v1/permissions/definitions`);
  if (!res.ok) throw new Error('Failed to fetch permission definitions');
  const json = await res.json();
  return json.data;
}

export async function fetchRoles(projectKey?: string): Promise<Role[]> {
  const param = projectKey ? `?projectKey=${encodeURIComponent(projectKey)}` : '';
  const res = await fetch(`${API_URL}/api/v1/roles${param}`);
  if (!res.ok) throw new Error('Failed to fetch roles');
  const json = await res.json();
  return json.data;
}

export async function createRole(data: {
  name: string;
  description?: string;
  color?: string;
  permissions: string;
  projectKey?: string;
}): Promise<Role> {
  const res = await fetch(`${API_URL}/api/v1/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to create role');
  }
  const json = await res.json();
  return json.data;
}

export async function updateRole(
  roleId: string,
  data: Partial<{ name: string; description: string; color: string; permissions: string }>
): Promise<Role> {
  const res = await fetch(`${API_URL}/api/v1/roles/${encodeURIComponent(roleId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to update role');
  }
  const json = await res.json();
  return json.data;
}

export async function deleteRole(roleId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/roles/${encodeURIComponent(roleId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to delete role');
  }
}

export async function fetchProjectMembers(projectKey: string): Promise<ProjectMember[]> {
  const res = await fetch(`${API_URL}/api/v1/projects/${encodeURIComponent(projectKey)}/members`);
  if (!res.ok) throw new Error('Failed to fetch project members');
  const json = await res.json();
  return json.data;
}

export async function assignProjectMemberRole(
  projectKey: string,
  data: { userId: string; roleId: string }
): Promise<any> {
  const res = await fetch(`${API_URL}/api/v1/projects/${encodeURIComponent(projectKey)}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to assign member role');
  }
  const json = await res.json();
  return json.data;
}

export async function removeProjectMember(projectKey: string, userId: string): Promise<void> {
  const res = await fetch(
    `${API_URL}/api/v1/projects/${encodeURIComponent(projectKey)}/members/${encodeURIComponent(userId)}`,
    {
      method: 'DELETE',
    }
  );
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to remove project member');
  }
}

// Project & Team Management APIs
export async function fetchProjectMetrics(): Promise<ProjectDashboardMetrics> {
  const res = await fetch(`${API_URL}/api/v1/projects/dashboard/metrics`);
  if (!res.ok) throw new Error('Failed to fetch project dashboard metrics');
  const json = await res.json();
  return json.data;
}

export async function fetchProjectByKey(key: string): Promise<ProjectDetail> {
  const res = await fetch(`${API_URL}/api/v1/projects/${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error('Failed to fetch project details');
  const json = await res.json();
  return json.data;
}

export interface Department {
  id: string;
  name: string;
  code: string;
}

export async function fetchDepartments(): Promise<Department[]> {
  const res = await fetch(`${API_URL}/api/v1/departments`);
  if (!res.ok) throw new Error('Failed to fetch departments');
  const json = await res.json();
  return json.data;
}

export async function createProject(data: {
  name: string;
  key: string;
  description?: string;
  departmentId?: string;
  primaryTeamId?: string;
  projectType?: string;
  privacyTier?: string;
  status?: string;
  startDate?: string | null;
  deadline?: string | null;
  deadlineSetByUserId?: string | null;
  deadlineSetByRoleTier?: number | null;
  githubRepoOwner?: string | null;
  githubRepoName?: string | null;
  githubLastSyncedAt?: string | null;
  projectManagerId?: string | null;
  reviewerId?: string | null;
}): Promise<Project> {
  const res = await fetch(`${API_URL}/api/v1/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || 'Failed to create project');
  }
  const json = await res.json();
  return json.data;
}

export async function updateProject(
  key: string,
  data: {
    name?: string;
    description?: string;
    status?: string;
    startDate?: string | null;
    deadline?: string | null;
    projectManagerId?: string | null;
    reviewerId?: string | null;
    primaryTeamId?: string;
    archived?: boolean;
  }
): Promise<Project> {
  const res = await fetch(`${API_URL}/api/v1/projects/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || 'Failed to update project');
  }
  const json = await res.json();
  return json.data;
}

export async function deleteProject(key: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/projects/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || 'Failed to delete project');
  }
}

export async function updateProjectTeams(
  key: string,
  teamIds: string[]
): Promise<{ teamIds: string[]; teams: Team[] }> {
  const res = await fetch(`${API_URL}/api/v1/projects/${encodeURIComponent(key)}/teams`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamIds }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || 'Failed to update project teams');
  }
  const json = await res.json();
  return json.data;
}

export async function createMilestone(
  key: string,
  data: {
    title: string;
    description?: string;
    dueDate?: string | null;
    status?: string;
  }
): Promise<ProjectMilestone> {
  const res = await fetch(`${API_URL}/api/v1/projects/${encodeURIComponent(key)}/milestones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to create milestone');
  }
  const json = await res.json();
  return json.data;
}

export async function updateMilestone(
  key: string,
  milestoneId: string,
  data: {
    title?: string;
    description?: string;
    dueDate?: string | null;
    status?: string;
  }
): Promise<ProjectMilestone> {
  const res = await fetch(
    `${API_URL}/api/v1/projects/${encodeURIComponent(key)}/milestones/${encodeURIComponent(milestoneId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  );
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to update milestone');
  }
  const json = await res.json();
  return json.data;
}

export async function deleteMilestone(key: string, milestoneId: string): Promise<void> {
  const res = await fetch(
    `${API_URL}/api/v1/projects/${encodeURIComponent(key)}/milestones/${encodeURIComponent(milestoneId)}`,
    {
      method: 'DELETE',
    }
  );
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to delete milestone');
  }
}

export async function fetchTeams(): Promise<Team[]> {
  const res = await fetch(`${API_URL}/api/v1/teams`);
  if (!res.ok) throw new Error('Failed to fetch teams');
  const json = await res.json();
  return json.data;
}

export async function createTeam(data: {
  name: string;
  keyPrefix: string;
  departmentId?: string;
  description?: string;
  leadId?: string | null;
}): Promise<Team> {
  const res = await fetch(`${API_URL}/api/v1/teams`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || 'Failed to create team');
  }
  const json = await res.json();
  return json.data;
}

export async function updateTeam(
  teamId: string,
  data: {
    name?: string;
    description?: string;
    leadId?: string | null;
    departmentId?: string;
  }
): Promise<Team> {
  const res = await fetch(`${API_URL}/api/v1/teams/${encodeURIComponent(teamId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || 'Failed to update team');
  }
  const json = await res.json();
  return json.data;
}

export async function deleteTeam(teamId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/teams/${encodeURIComponent(teamId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || 'Failed to delete team');
  }
}

export async function addTeamMember(
  teamId: string,
  data: { userId: string; role?: 'LEAD' | 'MEMBER' }
): Promise<any> {
  const res = await fetch(`${API_URL}/api/v1/teams/${encodeURIComponent(teamId)}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || 'Failed to add team member');
  }
  const json = await res.json();
  return json.data;
}

export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  const res = await fetch(
    `${API_URL}/api/v1/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`,
    {
      method: 'DELETE',
    }
  );
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || 'Failed to remove team member');
  }
}

export async function updateTeamMemberRole(
  teamId: string,
  userId: string,
  role: 'LEAD' | 'MEMBER'
): Promise<any> {
  const res = await fetch(
    `${API_URL}/api/v1/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    }
  );
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || 'Failed to update team member role');
  }
  const json = await res.json();
  return json.data;
}

// ── MAILING & DIRECT/INTERNAL COMMUNICATIONS ──

export interface MailProvider {
  name: string;
  priority: number;
  from: string;
  configured?: boolean;
  isPrimary?: boolean;
}

export interface MailLog {
  id: string;
  recipientEmail: string;
  recipientName?: string | null;
  subject: string;
  notificationType: string;
  ticketId?: string | null;
  projectId?: string | null;
  provider: string;
  status: 'SENT' | 'FAILED';
  errorMessage?: string | null;
  sentAt: string;
}

export interface MailStatus {
  providers: MailProvider[];
  allGateways?: MailProvider[];
  failoverEnabled: boolean;
  primaryProvider: string;
  fallbackProvider: string | null;
  telemetry: {
    totalDispatched: number;
    totalSent: number;
    totalFailed: number;
    successRate: number;
    recentLogs: MailLog[];
  };
  caller: {
    id: string;
    email: string;
    fullName: string;
    roleName: string;
    tier: number;
  };
}

export interface MailRecipientDirectory {
  users: Array<{
    id: string;
    fullName: string;
    email: string;
    userType: string;
    status: string;
  }>;
  projects: Array<{
    id: string;
    key: string;
    name: string;
    projectType: string;
    projectManagerId?: string | null;
  }>;
  departments: Array<{
    id: string;
    name: string;
    code: string;
  }>;
}

export interface SendMailPayload {
  recipientType: 'INDIVIDUAL' | 'INTERNAL_ALL' | 'PROJECT_TEAM' | 'CUSTOM_EMAIL';
  recipientUserIds?: string[];
  customEmails?: string;
  projectId?: string;
  ticketId?: string;
  subject: string;
  category?: string;
  categoryColor?: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  content: string;
  ctaText?: string;
  ctaUrl?: string;
}

export interface MailLogsResponse {
  logs: MailLog[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export async function fetchMailStatus(): Promise<MailStatus> {
  const res = await fetch(`${API_URL}/api/v1/mail/status`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch mail gateway status');
  }
  const json = await res.json();
  return json.data;
}

export async function setMailPrimaryProvider(provider: string): Promise<MailStatus> {
  const res = await fetch(`${API_URL}/api/v1/mail/provider`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to select mail gateway');
  }
  const json = await res.json();
  return json.data;
}

export async function fetchMailRecipients(): Promise<MailRecipientDirectory> {
  const res = await fetch(`${API_URL}/api/v1/mail/recipients`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch mail recipients directory');
  }
  const json = await res.json();
  return json.data;
}

export async function sendMail(payload: SendMailPayload): Promise<{
  success: boolean;
  message: string;
  totalTargets: number;
  successCount: number;
  results: Array<{ email: string; success: boolean; provider?: string; error?: string }>;
}> {
  const res = await fetch(`${API_URL}/api/v1/mail/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Failed to dispatch email');
  }
  const json = await res.json();
  return json.data;
}

export async function fetchMailLogs(params?: {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<MailLogsResponse> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.search) query.set('search', params.search);
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));

  const res = await fetch(`${API_URL}/api/v1/mail/logs?${query.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch mail audit logs');
  }
  const json = await res.json();
  return json.data;
}

export async function resendMailLog(logId: string): Promise<{ success: boolean; provider?: string; error?: string }> {
  const res = await fetch(`${API_URL}/api/v1/mail/resend/${encodeURIComponent(logId)}`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to re-dispatch email log');
  }
  const json = await res.json();
  return json.data;
}

// ─── Workspace Chat API ──────────────────────────────────────────────────────

export interface ChatAttachment {
  name: string;
  url: string;
  contentType?: string;
  size?: number;
}

export interface ChatChannel {
  id: string;
  channelType: 'DIRECT' | 'TEAM' | 'PROJECT';
  name: string;
  team?: { id: string; name: string; keyPrefix: string } | null;
  project?: { id: string; key: string; name: string } | null;
  peerUser?: { id: string; fullName: string; email: string } | null;
  unreadCount: number;
  lastMessage?: {
    id: string;
    body: string;
    senderName: string;
    createdAt: string;
  } | null;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  senderId: string;
  parentMessageId?: string | null;
  body: string;
  attachments: ChatAttachment[];
  reactions: Record<string, string[]>;
  editedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  replyCount?: number;
  sender?: { id: string; fullName: string; email: string } | null;
}

export async function fetchChatChannels(): Promise<ChatChannel[]> {
  const res = await fetch(`${API_URL}/api/v1/chat/channels`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch chat channels');
  }
  const json = await res.json();
  return json.data;
}

export async function openDirectMessage(targetUserId: string): Promise<ChatChannel> {
  const res = await fetch(`${API_URL}/api/v1/chat/dm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUserId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to open direct message');
  }
  const json = await res.json();
  return json.data;
}

export async function fetchChatMessages(
  channelId: string,
  parentMessageId?: string
): Promise<ChatMessage[]> {
  const q = parentMessageId ? `?parentMessageId=${encodeURIComponent(parentMessageId)}` : '';
  const res = await fetch(`${API_URL}/api/v1/chat/channels/${encodeURIComponent(channelId)}/messages${q}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch messages');
  }
  const json = await res.json();
  return json.data;
}

export async function sendChatMessage(
  channelId: string,
  payload: { body: string; parentMessageId?: string | null; attachments?: ChatAttachment[] }
): Promise<ChatMessage> {
  const res = await fetch(`${API_URL}/api/v1/chat/channels/${encodeURIComponent(channelId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to send message');
  }
  const json = await res.json();
  return json.data;
}

export async function editChatMessage(messageId: string, body: string): Promise<ChatMessage> {
  const res = await fetch(`${API_URL}/api/v1/chat/messages/${encodeURIComponent(messageId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to edit message');
  }
  const json = await res.json();
  return json.data;
}

export async function deleteChatMessage(messageId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/chat/messages/${encodeURIComponent(messageId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete message');
  }
}

export async function toggleChatReaction(
  messageId: string,
  emoji: string
): Promise<{ id: string; reactions: Record<string, string[]> }> {
  const res = await fetch(`${API_URL}/api/v1/chat/messages/${encodeURIComponent(messageId)}/reactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emoji }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to toggle reaction');
  }
  const json = await res.json();
  return json.data;
}

export async function markChatChannelRead(channelId: string): Promise<void> {
  await fetch(`${API_URL}/api/v1/chat/channels/${encodeURIComponent(channelId)}/read`, {
    method: 'POST',
  });
}

export interface ChatSearchMatch extends ChatMessage {
  channelName: string;
  channelType: 'DIRECT' | 'TEAM' | 'PROJECT';
}

export async function searchChatMessages(params: {
  q: string;
  channelId?: string;
  senderId?: string;
}): Promise<ChatSearchMatch[]> {
  const query = new URLSearchParams({ q: params.q });
  if (params.channelId) query.set('channelId', params.channelId);
  if (params.senderId) query.set('senderId', params.senderId);

  const res = await fetch(`${API_URL}/api/v1/chat/search?${query.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to search messages');
  }
  const json = await res.json();
  return json.data;
}

// ─── Standalone Helpdesk Portal API ──────────────────────────────────────────

export interface HelpdeskTicket {
  id: string;
  ticketKey: string;
  displayKey?: string;
  userTicketNumber?: number;
  ticketNumber: number;
  category: string;
  requestType: 'SERVICE_REQUEST' | 'INCIDENT';
  title: string;
  description: string;
  department: string;
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_ON_USER' | 'RESOLVED' | 'CLOSED';
  requesterId: string;
  assigneeId?: string | null;
  statusSetByRoleTier?: number;
  assigneeSetByRoleTier?: number;
  requester?: { id: string; fullName: string; email: string } | null;
  assignee?: { id: string; fullName: string; email: string } | null;
  slaResponseDueAt?: string | null;
  slaResolutionDueAt?: string | null;
  isSlaPaused?: boolean;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HelpdeskComment {
  id: string;
  ticketId: string;
  authorId: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
  author?: { id: string; fullName: string; email: string } | null;
}

export async function fetchHelpdeskTickets(
  scope: 'mine' | 'all' = 'mine',
  status?: string
): Promise<HelpdeskTicket[]> {
  const q = new URLSearchParams({ scope });
  if (status && status !== 'ALL') q.set('status', status);
  const res = await fetch(`${API_URL}/api/v1/helpdesk/tickets?${q.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch helpdesk tickets');
  }
  const json = await res.json();
  return json.data;
}

export async function createHelpdeskTicket(data: {
  category: string;
  requestType: 'SERVICE_REQUEST' | 'INCIDENT';
  title: string;
  description: string;
  department: string;
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
}): Promise<HelpdeskTicket> {
  const res = await fetch(`${API_URL}/api/v1/helpdesk/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to submit helpdesk request');
  }
  const json = await res.json();
  return json.data;
}

export async function updateHelpdeskTicket(
  ticketKey: string,
  updates: {
    status?: HelpdeskTicket['status'];
    priority?: HelpdeskTicket['priority'];
    assigneeId?: string | null;
  }
): Promise<HelpdeskTicket> {
  const res = await fetch(`${API_URL}/api/v1/helpdesk/tickets/${encodeURIComponent(ticketKey)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update helpdesk ticket');
  }
  const json = await res.json();
  return json.data;
}

export async function fetchHelpdeskComments(ticketKey: string): Promise<HelpdeskComment[]> {
  const res = await fetch(`${API_URL}/api/v1/helpdesk/tickets/${encodeURIComponent(ticketKey)}/comments`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch helpdesk comments');
  }
  const json = await res.json();
  return json.data;
}

export async function createHelpdeskComment(
  ticketKey: string,
  payload: { body: string; isInternal?: boolean }
): Promise<HelpdeskComment> {
  const res = await fetch(`${API_URL}/api/v1/helpdesk/tickets/${encodeURIComponent(ticketKey)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to post reply');
  }
  const json = await res.json();
  return json.data;
}

export interface ProjectOverviewReport {
  project: { id: string; key: string; name: string };
  summary: {
    totalTickets: number;
    completedTickets: number;
    inProgressTickets: number;
    overdueTickets: number;
    completionRate: number;
    slaComplianceRate: number;
    breachedSlaCount: number;
  };
  statusBreakdown: Array<{ status: string; count: number }>;
  priorityBreakdown: Array<{ priority: string; count: number }>;
  workloadByAssignee: Array<{
    userId: string;
    fullName: string;
    email: string;
    total: number;
    completed: number;
    inProgress: number;
    inReview: number;
    blocked: number;
    overdue: number;
    storyPoints: number;
    slaTracked: number;
    slaBreached: number;
    slaComplianceRate: number;
    tickets: Array<{
      id: string;
      ticketKey: string;
      title: string;
      status: string;
      priority: string;
      storyPoints: number | null;
      dueDate: string | null;
      slaResolutionDueAt: string | null;
      isOverdue: boolean;
      isSlaBreached: boolean;
      updatedAt: string;
    }>;
  }>;
  teamBreakdown: Array<{
    teamId: string;
    name: string;
    keyPrefix: string;
    total: number;
    completed: number;
    inProgress: number;
  }>;
}

export async function fetchProjectOverviewReport(projectKey: string): Promise<ProjectOverviewReport> {
  const res = await fetch(`${API_URL}/api/v1/reports/overview?projectKey=${encodeURIComponent(projectKey)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch project overview report');
  }
  const json = await res.json();
  return json.data;
}

export interface SummaryTaskItem {
  id: string;
  ticketKey: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  updatedAt: string;
  assigneeName: string | null;
  teamName: string | null;
}

export interface SummaryBlockerItem {
  id: string;
  ticketKey: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  assigneeName: string | null;
  teamName: string | null;
  blockerReasons: Array<'EXPLICIT_BLOCKED' | 'DEPENDENCY' | 'OVERDUE'>;
  blockerDetails: string[];
}

export interface ProjectSummary {
  projectId: string;
  projectKey: string;
  projectName: string;
  projectStatus: string;
  deadline: string | null;
  generatedAt: string;
  healthStatus: 'ON_TRACK' | 'AT_RISK' | 'CRITICAL' | 'COMPLETED';
  headline: string;
  stats: {
    totalTasks: number;
    completedCount: number;
    inProgressCount: number;
    plannedCount: number;
    blockedCount: number;
    overdueCount: number;
    dependencyBlockerCount: number;
    completionPercentage: number;
  };
  completed: {
    totalCount: number;
    recentCount: number;
    recentHighlights: SummaryTaskItem[];
  };
  blockers: {
    totalCount: number;
    explicitBlockedCount: number;
    dependencyCount: number;
    overdueCount: number;
    items: SummaryBlockerItem[];
  };
  planned: {
    inProgressCount: number;
    todoCount: number;
    upcomingMilestones: Array<{
      id: string;
      title: string;
      status: string;
      dueDate: string | null;
    }>;
    items: SummaryTaskItem[];
  };
  ai: {
    configured: boolean;
    narrative: string | null;
    provider: 'gemini' | 'openai' | null;
    generatedAt: string | null;
  };
}

export async function fetchProjectSummary(projectKey: string): Promise<ProjectSummary> {
  const res = await fetch(`${API_URL}/api/v1/projects/${encodeURIComponent(projectKey)}/summary`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch project summary');
  }
  const json = await res.json();
  return json.data;
}

export async function regenerateProjectSummary(projectKey: string): Promise<ProjectSummary> {
  const res = await fetch(`${API_URL}/api/v1/projects/${encodeURIComponent(projectKey)}/summary/regenerate`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to regenerate project summary');
  }
  const json = await res.json();
  return json.data;
}

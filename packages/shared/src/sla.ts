/**
 * ITSM Real-Time SLA Countdown Calculation Engine
 * Computes TTFR (Time to First Response) and TTR (Time to Resolution)
 */

export interface SLATargets {
  responseHours: number;
  resolutionHours: number;
}

export const SLA_PRIORITY_TARGETS: Record<'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW', SLATargets> = {
  URGENT: { responseHours: 1, resolutionHours: 4 },
  HIGH: { responseHours: 2, resolutionHours: 8 },
  MEDIUM: { responseHours: 4, resolutionHours: 24 },
  LOW: { responseHours: 8, resolutionHours: 48 },
};

/**
 * Calculates due timestamps for SLA tracking given priority and start timestamp
 */
export function calculateSLADueDates(
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW',
  fromDate: Date = new Date()
) {
  const targets = SLA_PRIORITY_TARGETS[priority] || SLA_PRIORITY_TARGETS.MEDIUM;

  const responseDueAt = new Date(fromDate.getTime() + targets.responseHours * 60 * 60 * 1000);
  const resolutionDueAt = new Date(fromDate.getTime() + targets.resolutionHours * 60 * 60 * 1000);

  return { responseDueAt, resolutionDueAt };
}

export type SLAStatus = 'HEALTHY' | 'WARNING' | 'BREACHED' | 'PAUSED' | 'FULFILLED';

export interface SLACountdownResult {
  status: SLAStatus;
  formatted: string;
  isPaused: boolean;
  isBreached: boolean;
  remainingMinutes: number;
}

/**
 * Computes live countdown, badge color, and breach status
 */
export function evaluateSLACountdown(
  dueAt: string | Date | null | undefined,
  isPaused: boolean = false,
  fulfilledAt?: string | Date | null
): SLACountdownResult {
  if (fulfilledAt) {
    return {
      status: 'FULFILLED',
      formatted: 'Met',
      isPaused: false,
      isBreached: false,
      remainingMinutes: 0,
    };
  }

  if (!dueAt) {
    return {
      status: 'HEALTHY',
      formatted: 'No SLA',
      isPaused: false,
      isBreached: false,
      remainingMinutes: 999999,
    };
  }

  if (isPaused) {
    return {
      status: 'PAUSED',
      formatted: 'Clock Paused',
      isPaused: true,
      isBreached: false,
      remainingMinutes: 0,
    };
  }

  const now = Date.now();
  const dueTime = new Date(dueAt).getTime();
  const diffMs = dueTime - now;
  const remainingMinutes = Math.floor(diffMs / (60 * 1000));

  if (diffMs <= 0) {
    // Breached! Calculate overtime
    const overtimeMinutes = Math.abs(remainingMinutes);
    const hours = Math.floor(overtimeMinutes / 60);
    const mins = overtimeMinutes % 60;
    const formatted = hours > 0 ? `-${hours}h ${mins}m overdue` : `-${mins}m overdue`;

    return {
      status: 'BREACHED',
      formatted,
      isPaused: false,
      isBreached: true,
      remainingMinutes,
    };
  }

  // Not breached yet
  const hours = Math.floor(remainingMinutes / 60);
  const mins = remainingMinutes % 60;
  const formatted = hours > 0 ? `${hours}h ${mins}m left` : `${mins}m left`;

  // Warning when less than 2 hours remaining
  const status: SLAStatus = remainingMinutes < 120 ? 'WARNING' : 'HEALTHY';

  return {
    status,
    formatted,
    isPaused: false,
    isBreached: false,
    remainingMinutes,
  };
}

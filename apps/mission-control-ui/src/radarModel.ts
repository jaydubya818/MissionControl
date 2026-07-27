export interface RadarTaskLike {
  _id: string;
  title: string;
  status: string;
  dueAt?: number;
}

export interface RadarAlertLike {
  _id: string;
  title: string;
  severity: string;
}

export interface RadarSummary {
  overdue: number;
  dueNext24Hours: number;
  blockedDueSoon: number;
  criticalAlerts: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DUE_SOON_WINDOW_MS = 7 * DAY_MS;
const TERMINAL_STATUSES = new Set(["DONE", "CANCELED"]);
const BLOCKING_STATUSES = new Set(["BLOCKED", "FAILED", "NEEDS_APPROVAL"]);
const CRITICAL_SEVERITIES = new Set(["CRITICAL", "ERROR"]);

export function isOpenTask(task: RadarTaskLike) {
  return !TERMINAL_STATUSES.has(task.status);
}

export function dueSoonTasks(tasks: RadarTaskLike[], now: number) {
  return tasks
    .filter((task) => task.dueAt != null && task.dueAt >= now && task.dueAt <= now + DUE_SOON_WINDOW_MS && isOpenTask(task))
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
}

export function overdueTasks(tasks: RadarTaskLike[], now: number) {
  return tasks.filter((task) => task.dueAt != null && task.dueAt < now && isOpenTask(task));
}

export function dueNext24Hours(tasks: RadarTaskLike[], now: number) {
  return tasks.filter((task) => task.dueAt != null && task.dueAt >= now && task.dueAt <= now + DAY_MS && isOpenTask(task));
}

export function blockedDueSoonTasks(tasks: RadarTaskLike[], now: number) {
  return dueSoonTasks(tasks, now).filter((task) => BLOCKING_STATUSES.has(task.status));
}

export function criticalAlerts(alerts: RadarAlertLike[]) {
  return alerts.filter((alert) => CRITICAL_SEVERITIES.has(alert.severity));
}

export function buildRadarSummary(tasks: RadarTaskLike[], alerts: RadarAlertLike[], now: number): RadarSummary {
  return {
    overdue: overdueTasks(tasks, now).length,
    dueNext24Hours: dueNext24Hours(tasks, now).length,
    blockedDueSoon: blockedDueSoonTasks(tasks, now).length,
    criticalAlerts: criticalAlerts(alerts).length,
  };
}

export function relativeDueLabel(dueAt: number, now: number) {
  const delta = dueAt - now;
  if (delta < 0) {
    const days = Math.max(1, Math.ceil(Math.abs(delta) / DAY_MS));
    return days === 1 ? "Overdue by 1 day" : `Overdue by ${days} days`;
  }

  const hours = Math.ceil(delta / (60 * 60 * 1000));
  if (hours <= 24) {
    return hours <= 1 ? "Due within 1 hour" : `Due within ${hours} hours`;
  }

  const days = Math.ceil(delta / DAY_MS);
  return days === 1 ? "Due in 1 day" : `Due in ${days} days`;
}

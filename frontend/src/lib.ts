import type { ProgressPoint, WorkoutSession } from "./types";

export const formatKg = (value: number) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(value);
export const formatDate = (date: string) => new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));

export function weeklyMetrics(sessions: WorkoutSession[]) {
  const now = Date.now();
  const since = now - 7 * 24 * 60 * 60 * 1000;
  const week = sessions.filter((session) => new Date(session.date).getTime() >= since);
  return {
    volume: week.reduce((total, session) => total + session.total_volume, 0),
    sets: week.reduce((total, session) => total + session.exercises.reduce((n, ex) => n + ex.sets.length, 0), 0)
  };
}

export function filterProgress(points: ProgressPoint[], window: string) {
  if (window === "all") return points;
  const months = Number(window);
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  return points.filter((point) => new Date(point.date) >= cutoff);
}

import { describe, expect, it } from "vitest";
import { filterProgress, weeklyMetrics } from "./lib";
import type { WorkoutSession } from "./types";

const session = (date: string, volume: number, sets: number): WorkoutSession => ({
  id: volume, name: "Sesión", date, notes: "", routine_id: null, routine_name: "",
  total_volume: volume, exercises: [{ id: 1, exercise_id: 1, exercise_name: "Press", position: 0, notes: "", sets: Array.from({ length: sets }, (_, index) => ({ id: index, set_number: index + 1, weight: 10, reps: 10, volume: 100 })) }]
});

describe("weeklyMetrics", () => {
  it("solo acumula sesiones de los últimos siete días", () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 2 * 86400000).toISOString();
    const old = new Date(now.getTime() - 9 * 86400000).toISOString();
    expect(weeklyMetrics([session(recent, 1200, 3), session(old, 800, 2)])).toEqual({ volume: 1200, sets: 3 });
  });
});

describe("filterProgress", () => {
  it("recorta puntos fuera de la ventana seleccionada", () => {
    const now = new Date(); const old = new Date(); old.setMonth(old.getMonth() - 4);
    const points = [
      { date: old.toISOString(), session_id: 1, max_weight: 80, best_1rm: 90, total_volume: 1000, total_sets: 3, total_reps: 24 },
      { date: now.toISOString(), session_id: 2, max_weight: 90, best_1rm: 100, total_volume: 1200, total_sets: 3, total_reps: 21 }
    ];
    expect(filterProgress(points, "3")).toHaveLength(1);
    expect(filterProgress(points, "all")).toHaveLength(2);
  });
});

import type { Exercise, LastExercise, ProgressPoint, Routine, SetLog, WorkoutSession } from "./types";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers }
  });
  if (!response.ok) {
    let detail = response.statusText;
    try { detail = (await response.json()).detail || detail; } catch { /* response is not JSON */ }
    throw new Error(detail);
  }
  return response.status === 204 ? (undefined as T) : response.json() as Promise<T>;
}

export const api = {
  exercises: () => request<Exercise[]>("/api/exercises"),
  createExercise: (name: string, muscle_group: string) => request<Exercise>("/api/exercises", { method: "POST", body: JSON.stringify({ name, muscle_group }) }),
  deleteExercise: (id: number) => request<void>(`/api/exercises/${id}`, { method: "DELETE" }),
  routines: () => request<Routine[]>("/api/routines"),
  createRoutine: (name: string, description: string) => request<Routine>("/api/routines", { method: "POST", body: JSON.stringify({ name, description }) }),
  deleteRoutine: (id: number) => request<void>(`/api/routines/${id}`, { method: "DELETE" }),
  addRoutineExercise: (routineId: number, data: { exercise_id: number; target_sets: number; target_reps: number; target_weight: number }) => request<Routine>(`/api/routines/${routineId}/exercises`, { method: "POST", body: JSON.stringify(data) }),
  removeRoutineExercise: (routineId: number, linkId: number) => request<Routine>(`/api/routines/${routineId}/exercises/${linkId}`, { method: "DELETE" }),
  sessions: () => request<WorkoutSession[]>("/api/sessions?limit=100"),
  session: (id: number) => request<WorkoutSession>(`/api/sessions/${id}`),
  createSession: (data: { name?: string; routine_id?: number; notes?: string }) => request<WorkoutSession>("/api/sessions", { method: "POST", body: JSON.stringify(data) }),
  updateSession: (id: number, data: { name?: string; notes?: string }) => request<WorkoutSession>(`/api/sessions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteSession: (id: number) => request<void>(`/api/sessions/${id}`, { method: "DELETE" }),
  addSessionExercise: (sessionId: number, exercise_id: number) => request<WorkoutSession>(`/api/sessions/${sessionId}/exercises`, { method: "POST", body: JSON.stringify({ exercise_id }) }),
  updateSessionExercise: (id: number, notes: string) => request<{ ok: true }>(`/api/session-exercises/${id}`, { method: "PATCH", body: JSON.stringify({ notes }) }),
  deleteSessionExercise: (id: number) => request<void>(`/api/session-exercises/${id}`, { method: "DELETE" }),
  addSet: (id: number, weight: number, reps: number) => request<SetLog>(`/api/session-exercises/${id}/sets`, { method: "POST", body: JSON.stringify({ weight, reps }) }),
  deleteSet: (id: number) => request<void>(`/api/sets/${id}`, { method: "DELETE" }),
  progress: (exerciseId: number) => request<ProgressPoint[]>(`/api/progress/${exerciseId}`),
  last: (exerciseId: number) => request<LastExercise>(`/api/last/${exerciseId}`)
};

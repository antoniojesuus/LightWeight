export type Exercise = { id: number; name: string; muscle_group: string; notes: string };

export type RoutineExercise = {
  id: number; exercise_id: number; exercise_name: string; muscle_group: string;
  position: number; target_sets: number; target_reps: number; target_weight: number; notes: string;
};

export type Routine = { id: number; name: string; description: string; created_at: string; exercises: RoutineExercise[] };

export type SetLog = { id: number; set_number: number; weight: number; reps: number; volume: number };

export type SessionExercise = {
  id: number; exercise_id: number; exercise_name: string; position: number; notes: string; sets: SetLog[];
};

export type WorkoutSession = {
  id: number; name: string; date: string; notes: string; routine_id: number | null;
  routine_name: string; exercises: SessionExercise[]; total_volume: number;
};

export type ProgressPoint = {
  date: string; session_id: number; max_weight: number; best_1rm: number;
  total_volume: number; total_sets: number; total_reps: number;
};

export type LastExercise = { found: false } | { found: true; session_exercise_id: number; notes: string; sets: SetLog[] };
export type Route = "entrenar" | "rutinas" | "historial" | "progreso";

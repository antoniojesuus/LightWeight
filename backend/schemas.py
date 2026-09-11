"""Esquemas Pydantic (validación + serialización API)."""
from datetime import datetime
from pydantic import BaseModel, Field


# ---------- Exercises ----------
class ExerciseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    muscle_group: str = ""
    notes: str = ""


class ExerciseOut(BaseModel):
    id: int
    name: str
    muscle_group: str
    notes: str

    class Config:
        from_attributes = True


# ---------- Routines ----------
class RoutineCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = ""


class RoutineExerciseCreate(BaseModel):
    exercise_id: int
    position: int = 0
    target_sets: int = 3
    target_reps: int = 10
    target_weight: float = 0.0
    notes: str = ""


class RoutineExerciseOut(BaseModel):
    id: int
    exercise_id: int
    exercise_name: str = ""
    muscle_group: str = ""
    position: int
    target_sets: int
    target_reps: int
    target_weight: float
    notes: str

    class Config:
        from_attributes = True


class RoutineOut(BaseModel):
    id: int
    name: str
    description: str
    created_at: datetime
    exercises: list[RoutineExerciseOut] = []

    class Config:
        from_attributes = True


# ---------- Sessions ----------
class SessionCreate(BaseModel):
    """Crear sesión vacía o a partir de rutina (routine_id opcional)."""

    name: str = ""
    routine_id: int | None = None
    notes: str = ""


class SessionExerciseCreate(BaseModel):
    exercise_id: int
    position: int = 0
    notes: str = ""


class SetCreate(BaseModel):
    weight: float = Field(ge=0)
    reps: int = Field(ge=0)
    set_number: int | None = None  # si None -> auto-incremental


class SetOut(BaseModel):
    id: int
    set_number: int
    weight: float
    reps: int
    volume: float = 0.0

    class Config:
        from_attributes = True


class SessionExerciseOut(BaseModel):
    id: int
    exercise_id: int
    exercise_name: str = ""
    position: int
    notes: str
    sets: list[SetOut] = []

    class Config:
        from_attributes = True


class SessionOut(BaseModel):
    id: int
    name: str
    date: datetime
    notes: str
    routine_id: int | None
    routine_name: str = ""
    exercises: list[SessionExerciseOut] = []
    total_volume: float = 0.0

    class Config:
        from_attributes = True


class SessionUpdate(BaseModel):
    name: str | None = None
    notes: str | None = None


class SessionExerciseUpdate(BaseModel):
    notes: str | None = None
    position: int | None = None


# ---------- Progress ----------
class ProgressPoint(BaseModel):
    date: datetime
    session_id: int
    max_weight: float
    best_1rm: float
    total_volume: float
    total_sets: int
    total_reps: int

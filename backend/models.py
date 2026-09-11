"""Modelo de datos LightWeight (SQLAlchemy 2.0)."""
from datetime import datetime
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base


class Exercise(Base):
    """Catálogo de ejercicios (ej: Press banca, Sentadilla)."""

    __tablename__ = "exercises"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    muscle_group: Mapped[str] = mapped_column(String(50), default="", nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)

    routine_links: Mapped[list["RoutineExercise"]] = relationship(
        back_populates="exercise", cascade="all, delete-orphan"
    )
    session_links: Mapped[list["SessionExercise"]] = relationship(
        back_populates="exercise", cascade="all, delete-orphan"
    )


class Routine(Base):
    """Rutina planificada de antemano (ej: Push Day)."""

    __tablename__ = "routines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    exercises: Mapped[list["RoutineExercise"]] = relationship(
        back_populates="routine", cascade="all, delete-orphan", order_by="RoutineExercise.position"
    )
    sessions: Mapped[list["WorkoutSession"]] = relationship(back_populates="routine")


class RoutineExercise(Base):
    """Ejercicio dentro de una rutina con objetivo planificado."""

    __tablename__ = "routine_exercises"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    routine_id: Mapped[int] = mapped_column(ForeignKey("routines.id", ondelete="CASCADE"))
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer, default=0)
    target_sets: Mapped[int] = mapped_column(Integer, default=3)
    target_reps: Mapped[int] = mapped_column(Integer, default=10)
    target_weight: Mapped[float] = mapped_column(Float, default=0.0)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)

    routine: Mapped["Routine"] = relationship(back_populates="exercises")
    exercise: Mapped["Exercise"] = relationship(back_populates="routine_links")


class WorkoutSession(Base):
    """Sesión real de entrenamiento (puede partir de una rutina o ser libre)."""

    __tablename__ = "workout_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    routine_id: Mapped[int | None] = mapped_column(
        ForeignKey("routines.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)  # nota global sesión

    routine: Mapped["Routine | None"] = relationship(back_populates="sessions")
    exercises: Mapped[list["SessionExercise"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="SessionExercise.position"
    )


class SessionExercise(Base):
    """Ejercicio concreto realizado en una sesión. Permite añadir/quitar sobre la marcha."""

    __tablename__ = "session_exercises"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("workout_sessions.id", ondelete="CASCADE"))
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)  # nota por ejercicio

    session: Mapped["WorkoutSession"] = relationship(back_populates="exercises")
    exercise: Mapped["Exercise"] = relationship(back_populates="session_links")
    sets: Mapped[list["SetLog"]] = relationship(
        back_populates="session_exercise", cascade="all, delete-orphan", order_by="SetLog.set_number"
    )


class SetLog(Base):
    """Una serie: número de serie, peso y repeticiones."""

    __tablename__ = "set_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_exercise_id: Mapped[int] = mapped_column(
        ForeignKey("session_exercises.id", ondelete="CASCADE"), index=True
    )
    set_number: Mapped[int] = mapped_column(Integer, nullable=False)
    weight: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    reps: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    session_exercise: Mapped["SessionExercise"] = relationship(back_populates="sets")

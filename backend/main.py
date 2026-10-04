"""LightWeight API — FastAPI + SQLAlchemy (SQLite or PostgreSQL/Neon).

Arranque local:
    pip install -r requirements.txt
    uvicorn backend.main:app --reload
    -> http://127.0.0.1:8000
"""
import os
from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session, joinedload

from .database import Base, engine, get_db
from . import models
from . import schemas

from sqlalchemy import func, inspect, text

db_inspector = inspect(engine)
pb_groups_table_existed = db_inspector.has_table("pb_groups")
legacy_pb_group_column_existed = db_inspector.has_table("exercises") and any(
    column["name"] == "pb_group_id" for column in db_inspector.get_columns("exercises")
)
pb_membership_order_column_existed = db_inspector.has_table("exercise_pb_groups") and any(
    column["name"] == "display_order"
    for column in db_inspector.get_columns("exercise_pb_groups")
)
Base.metadata.create_all(bind=engine)


def ensure_exercise_columns():
    """Garantiza que las columnas current_weight y current_reps existan en tablas ya creadas."""
    for col, col_type, default in [
        ("current_weight", "FLOAT", "0.0"),
        ("current_reps", "INTEGER", "0"),
    ]:
        try:
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE exercises ADD COLUMN {col} {col_type} DEFAULT {default}"))
        except Exception:
            pass


ensure_exercise_columns()


def ensure_exercise_pb_group_columns():
    """Add per-group exercise ordering to databases created before this feature."""
    if not inspect(engine).has_table("exercise_pb_groups"):
        return
    column_names = {
        column["name"] for column in inspect(engine).get_columns("exercise_pb_groups")
    }
    if "display_order" not in column_names:
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE exercise_pb_groups "
                "ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0"
            ))


ensure_exercise_pb_group_columns()

app = FastAPI(title="LightWeight API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- helpers ----------
def epley_1rm(weight: float, reps: int) -> float:
    if reps <= 0:
        return 0.0
    if reps == 1:
        return round(weight, 2)
    return round(weight * (1 + reps / 30), 2)


def set_out(s: models.SetLog) -> dict:
    return {
        "id": s.id,
        "set_number": s.set_number,
        "weight": s.weight,
        "reps": s.reps,
        "volume": round(s.weight * s.reps, 2),
    }


def session_exercise_out(se: models.SessionExercise) -> dict:
    return {
        "id": se.id,
        "exercise_id": se.exercise_id,
        "exercise_name": se.exercise.name if se.exercise else "",
        "position": se.position,
        "notes": se.notes,
        "sets": [set_out(s) for s in sorted(se.sets, key=lambda x: x.set_number)],
    }


def session_out(sess: models.WorkoutSession) -> dict:
    vol = sum(s.weight * s.reps for se in sess.exercises for s in se.sets)
    return {
        "id": sess.id,
        "name": sess.name,
        "date": sess.date,
        "notes": sess.notes,
        "routine_id": sess.routine_id,
        "routine_name": sess.routine.name if sess.routine else "",
        "exercises": [
            session_exercise_out(se)
            for se in sorted(sess.exercises, key=lambda x: x.position)
        ],
        "total_volume": round(vol, 2),
    }


def routine_out(r: models.Routine) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "description": r.description,
        "created_at": r.created_at,
        "exercises": [
            {
                "id": re.id,
                "exercise_id": re.exercise_id,
                "exercise_name": re.exercise.name if re.exercise else "",
                "muscle_group": re.exercise.muscle_group if re.exercise else "",
                "position": re.position,
                "target_sets": re.target_sets,
                "target_reps": re.target_reps,
                "target_weight": re.target_weight,
                "notes": re.notes,
            }
            for re in sorted(r.exercises, key=lambda x: x.position)
        ],
    }


def seed_exercises(db: Session):
    if db.query(models.Exercise).count() == 0:
        base = [
            ("Press banca", "Pecho", ""),
            ("Sentadilla", "Pierna", ""),
            ("Peso muerto", "Espalda", ""),
            ("Press militar", "Hombro", ""),
            ("Dominadas", "Espalda", ""),
            ("Remo con barra", "Espalda", ""),
            ("Curl bíceps", "Brazo", ""),
            ("Fondos", "Tríceps", ""),
        ]
        for name, mg, notes in base:
            db.add(models.Exercise(name=name, muscle_group=mg, notes=notes))
        db.commit()


DEFAULT_PB_GROUPS = [
    ("Pecho", "🏋️"),
    ("Espalda", "🧲"),
    ("Pierna", "🦵"),
    ("Hombro", "🧱"),
    ("Brazo", "💪"),
    ("Core", "⚡"),
    ("Cuerpo completo", "🔄"),
    ("Cardio", "🏃"),
    ("Otro", "🔧"),
]


def seed_pb_groups(db: Session):
    """Create initial PB groups once and copy legacy visual grouping assignments."""
    if pb_groups_table_existed or db.query(models.PbGroup).count() > 0:
        return
    configured = {name.casefold() for name, _ in DEFAULT_PB_GROUPS}
    for order, (name, emoji) in enumerate(DEFAULT_PB_GROUPS):
        db.add(models.PbGroup(name=name, emoji=emoji, display_order=order))
    existing_names = {
        name.strip()
        for (name,) in db.query(models.Exercise.muscle_group).distinct().all()
        if name and name.strip()
    }
    next_order = len(DEFAULT_PB_GROUPS)
    for name in sorted(existing_names, key=str.casefold):
        if name.casefold() not in configured:
            db.add(models.PbGroup(name=name, emoji="💪", display_order=next_order))
            next_order += 1
    db.flush()
    groups_by_name = {group.name: group.id for group in db.query(models.PbGroup).all()}
    for exercise in db.query(models.Exercise).all():
        group_id = groups_by_name.get(exercise.muscle_group)
        if group_id is not None:
            next_position = db.query(func.count(models.ExercisePbGroup.exercise_id)).filter(
                models.ExercisePbGroup.pb_group_id == group_id
            ).scalar() or 0
            db.add(models.ExercisePbGroup(
                exercise_id=exercise.id, pb_group_id=group_id, display_order=next_position
            ))
    db.commit()


def exercise_out(exercise: models.Exercise, db: Session) -> dict:
    memberships = (
            db.query(models.ExercisePbGroup)
            .filter(models.ExercisePbGroup.exercise_id == exercise.id)
            .order_by(models.ExercisePbGroup.pb_group_id)
            .all()
    )
    return {
        "id": exercise.id,
        "name": exercise.name,
        "muscle_group": exercise.muscle_group,
        "pb_group_ids": [membership.pb_group_id for membership in memberships],
        "pb_group_positions": {
            membership.pb_group_id: membership.display_order for membership in memberships
        },
        "notes": exercise.notes,
        "current_weight": exercise.current_weight,
        "current_reps": exercise.current_reps,
    }


def validate_pb_group_ids(group_ids: list[int], db: Session) -> list[int]:
    unique_ids = list(dict.fromkeys(group_ids))
    existing_ids = {
        group_id
        for (group_id,) in db.query(models.PbGroup.id).filter(models.PbGroup.id.in_(unique_ids)).all()
    } if unique_ids else set()
    if existing_ids != set(unique_ids):
        raise HTTPException(404, "Uno o más grupos PB no existen")
    return unique_ids


def replace_pb_memberships(exercise_id: int, group_ids: list[int], db: Session):
    valid_ids = validate_pb_group_ids(group_ids, db)
    current = db.query(models.ExercisePbGroup).filter(
        models.ExercisePbGroup.exercise_id == exercise_id
    ).all()
    current_by_group = {membership.pb_group_id: membership for membership in current}
    for group_id, membership in current_by_group.items():
        if group_id not in valid_ids:
            db.delete(membership)
    for group_id in valid_ids:
        if group_id in current_by_group:
            continue
        max_order = db.query(func.max(models.ExercisePbGroup.display_order)).filter(
            models.ExercisePbGroup.pb_group_id == group_id
        ).scalar()
        db.add(models.ExercisePbGroup(
            exercise_id=exercise_id,
            pb_group_id=group_id,
            display_order=(max_order + 1) if max_order is not None else 0,
        ))


def migrate_legacy_pb_memberships(db: Session):
    """Copy assignments from the former single-group column, then clear it once."""
    if not legacy_pb_group_column_existed:
        return
    rows = db.execute(
        text("SELECT id, pb_group_id FROM exercises WHERE pb_group_id IS NOT NULL")
    ).all()
    for exercise_id, group_id in rows:
        exists = db.query(models.ExercisePbGroup).filter_by(
            exercise_id=exercise_id, pb_group_id=group_id
        ).first()
        if not exists and db.get(models.PbGroup, group_id):
            max_order = db.query(func.max(models.ExercisePbGroup.display_order)).filter(
                models.ExercisePbGroup.pb_group_id == group_id
            ).scalar()
            db.add(models.ExercisePbGroup(
                exercise_id=exercise_id,
                pb_group_id=group_id,
                display_order=(max_order + 1) if max_order is not None else 0,
            ))
    db.execute(text("UPDATE exercises SET pb_group_id = NULL WHERE pb_group_id IS NOT NULL"))
    db.commit()


def normalize_pb_membership_order(db: Session):
    """Compact legacy or sparse positions while preserving their current order."""
    for (group_id,) in db.query(models.PbGroup.id).all():
        query = db.query(models.ExercisePbGroup).join(
            models.Exercise,
            models.Exercise.id == models.ExercisePbGroup.exercise_id,
        ).filter(
            models.ExercisePbGroup.pb_group_id == group_id
        )
        if pb_membership_order_column_existed:
            query = query.order_by(
                models.ExercisePbGroup.display_order,
                models.ExercisePbGroup.exercise_id,
            )
        else:
            # Match the alphabetical order used by the UI before ordering existed.
            query = query.order_by(models.Exercise.name, models.Exercise.id)
        memberships = query.all()
        for position, membership in enumerate(memberships):
            membership.display_order = position
    db.commit()


@app.on_event("startup")
def on_startup():
    db = next(get_db())
    try:
        seed_exercises(db)
        seed_pb_groups(db)
        migrate_legacy_pb_memberships(db)
        normalize_pb_membership_order(db)
    finally:
        db.close()


# ---------- PB Groups ----------
@app.get("/api/pb-groups", response_model=list[schemas.PbGroupOut])
def list_pb_groups(db: Session = Depends(get_db)):
    return db.query(models.PbGroup).order_by(models.PbGroup.display_order, models.PbGroup.id).all()


@app.post("/api/pb-groups", response_model=schemas.PbGroupOut, status_code=201)
def create_pb_group(data: schemas.PbGroupCreate, db: Session = Depends(get_db)):
    name = data.name.strip()
    emoji = data.emoji.strip() or "💪"
    if not name:
        raise HTTPException(400, "El nombre no puede estar vacío")
    if db.query(models.PbGroup).filter(models.PbGroup.name.ilike(name)).first():
        raise HTTPException(400, "Ya existe un grupo PB con ese nombre")
    max_order = db.query(func.max(models.PbGroup.display_order)).scalar()
    group = models.PbGroup(
        name=name, emoji=emoji, display_order=(max_order + 1) if max_order is not None else 0
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


@app.patch("/api/pb-groups/{group_id}", response_model=schemas.PbGroupOut)
def update_pb_group(group_id: int, data: schemas.PbGroupUpdate, db: Session = Depends(get_db)):
    group = db.get(models.PbGroup, group_id)
    if not group:
        raise HTTPException(404, "Grupo PB no encontrado")
    if data.name is not None:
        name = data.name.strip()
        if not name:
            raise HTTPException(400, "El nombre no puede estar vacío")
        duplicate = (
            db.query(models.PbGroup)
            .filter(models.PbGroup.name.ilike(name), models.PbGroup.id != group_id)
            .first()
        )
        if duplicate:
            raise HTTPException(400, "Ya existe otro grupo PB con ese nombre")
        group.name = name
    if data.emoji is not None:
        group.emoji = data.emoji.strip() or "💪"
    db.commit()
    db.refresh(group)
    return group


@app.put("/api/pb-groups/reorder", response_model=list[schemas.PbGroupOut])
def reorder_pb_groups(data: schemas.PbGroupReorder, db: Session = Depends(get_db)):
    groups = db.query(models.PbGroup).all()
    current_ids = {group.id for group in groups}
    if len(data.ids) != len(set(data.ids)) or set(data.ids) != current_ids:
        raise HTTPException(400, "La lista debe incluir todos los grupos PB una sola vez")
    order_by_id = {group_id: order for order, group_id in enumerate(data.ids)}
    for group in groups:
        group.display_order = order_by_id[group.id]
    db.commit()
    return list_pb_groups(db)


@app.put("/api/pb-groups/{group_id}/exercises/reorder", status_code=204)
def reorder_pb_group_exercises(
    group_id: int,
    data: schemas.PbGroupExerciseReorder,
    db: Session = Depends(get_db),
):
    if not db.get(models.PbGroup, group_id):
        raise HTTPException(404, "Grupo PB no encontrado")
    memberships = db.query(models.ExercisePbGroup).filter(
        models.ExercisePbGroup.pb_group_id == group_id
    ).all()
    current_ids = {membership.exercise_id for membership in memberships}
    if (
        len(data.exercise_ids) != len(set(data.exercise_ids))
        or set(data.exercise_ids) != current_ids
    ):
        raise HTTPException(
            400, "La lista debe incluir todos los ejercicios del grupo PB una sola vez"
        )
    order_by_id = {
        exercise_id: order for order, exercise_id in enumerate(data.exercise_ids)
    }
    for membership in memberships:
        membership.display_order = order_by_id[membership.exercise_id]
    db.commit()
    return None


@app.delete("/api/pb-groups/{group_id}", status_code=204)
def delete_pb_group(group_id: int, db: Session = Depends(get_db)):
    group = db.get(models.PbGroup, group_id)
    if not group:
        raise HTTPException(404, "Grupo PB no encontrado")
    db.query(models.ExercisePbGroup).filter(
        models.ExercisePbGroup.pb_group_id == group_id
    ).delete(synchronize_session=False)
    db.delete(group)
    db.commit()
    return None


# ---------- Exercises ----------
@app.get("/api/exercises", response_model=list[schemas.ExerciseOut])
def list_exercises(db: Session = Depends(get_db)):
    exercises = db.query(models.Exercise).order_by(models.Exercise.name).all()
    return [exercise_out(exercise, db) for exercise in exercises]


@app.post("/api/exercises", response_model=schemas.ExerciseOut, status_code=201)
def create_exercise(data: schemas.ExerciseCreate, db: Session = Depends(get_db)):
    exists = db.query(models.Exercise).filter(models.Exercise.name.ilike(data.name.strip())).first()
    if exists:
        raise HTTPException(400, "Ya existe un ejercicio con ese nombre")
    group_ids = validate_pb_group_ids(data.pb_group_ids, db)
    ex = models.Exercise(
        name=data.name.strip(),
        muscle_group=data.muscle_group.strip(),
        notes=data.notes,
        current_weight=data.current_weight,
        current_reps=data.current_reps,
    )
    db.add(ex)
    db.flush()
    replace_pb_memberships(ex.id, group_ids, db)
    db.commit()
    db.refresh(ex)
    return exercise_out(ex, db)


@app.patch("/api/exercises/{exercise_id}", response_model=schemas.ExerciseOut)
def update_exercise(exercise_id: int, data: schemas.ExerciseUpdate, db: Session = Depends(get_db)):
    ex = db.get(models.Exercise, exercise_id)
    if not ex:
        raise HTTPException(404, "Ejercicio no encontrado")
    if data.name is not None:
        name_clean = data.name.strip()
        if not name_clean:
            raise HTTPException(400, "El nombre no puede estar vacío")
        exists = (
            db.query(models.Exercise)
            .filter(models.Exercise.name.ilike(name_clean), models.Exercise.id != exercise_id)
            .first()
        )
        if exists:
            raise HTTPException(400, "Ya existe otro ejercicio con ese nombre")
        ex.name = name_clean
    if data.muscle_group is not None:
        ex.muscle_group = data.muscle_group.strip()
    if "pb_group_ids" in data.model_fields_set and data.pb_group_ids is not None:
        replace_pb_memberships(exercise_id, data.pb_group_ids, db)
    if data.notes is not None:
        ex.notes = data.notes
    if data.current_weight is not None:
        ex.current_weight = max(0.0, float(data.current_weight))
    if data.current_reps is not None:
        ex.current_reps = max(0, int(data.current_reps))
    db.commit()
    db.refresh(ex)
    return exercise_out(ex, db)


@app.delete("/api/exercises/{exercise_id}", status_code=204)
def delete_exercise(exercise_id: int, db: Session = Depends(get_db)):
    ex = db.get(models.Exercise, exercise_id)
    if not ex:
        raise HTTPException(404, "Ejercicio no encontrado")
    in_routine = db.query(models.RoutineExercise).filter_by(exercise_id=exercise_id).first()
    in_session = db.query(models.SessionExercise).filter_by(exercise_id=exercise_id).first()
    if in_routine or in_session:
        raise HTTPException(
            409,
            "No se puede eliminar un ejercicio que ya aparece en rutinas o sesiones",
        )
    db.query(models.ExercisePbGroup).filter(
        models.ExercisePbGroup.exercise_id == exercise_id
    ).delete(synchronize_session=False)
    db.delete(ex)
    db.commit()
    return None


# ---------- Routines ----------
@app.get("/api/routines", response_model=list[schemas.RoutineOut])
def list_routines(db: Session = Depends(get_db)):
    routines = (
        db.query(models.Routine)
        .options(joinedload(models.Routine.exercises).joinedload(models.RoutineExercise.exercise))
        .order_by(models.Routine.id.desc())
        .all()
    )
    return [routine_out(r) for r in routines]


@app.post("/api/routines", response_model=schemas.RoutineOut, status_code=201)
def create_routine(data: schemas.RoutineCreate, db: Session = Depends(get_db)):
    r = models.Routine(name=data.name.strip(), description=data.description)
    db.add(r)
    db.commit()
    db.refresh(r)
    return routine_out(r)


@app.get("/api/routines/{routine_id}", response_model=schemas.RoutineOut)
def get_routine(routine_id: int, db: Session = Depends(get_db)):
    r = (
        db.query(models.Routine)
        .options(joinedload(models.Routine.exercises).joinedload(models.RoutineExercise.exercise))
        .filter(models.Routine.id == routine_id)
        .first()
    )
    if not r:
        raise HTTPException(404, "Rutina no encontrada")
    return routine_out(r)


@app.patch("/api/routines/{routine_id}", response_model=schemas.RoutineOut)
def update_routine(routine_id: int, data: schemas.RoutineUpdate, db: Session = Depends(get_db)):
    r = db.get(models.Routine, routine_id)
    if not r:
        raise HTTPException(404, "Rutina no encontrada")
    if data.name is not None and data.name.strip():
        r.name = data.name.strip()
    if data.description is not None:
        r.description = data.description
    db.commit()
    return get_routine(routine_id, db)


@app.delete("/api/routines/{routine_id}", status_code=204)
def delete_routine(routine_id: int, db: Session = Depends(get_db)):
    r = db.get(models.Routine, routine_id)
    if not r:
        raise HTTPException(404, "Rutina no encontrada")
    db.query(models.WorkoutSession).filter(models.WorkoutSession.routine_id == routine_id).update({"routine_id": None})
    db.delete(r)
    db.commit()
    return None


@app.post("/api/routines/{routine_id}/exercises", response_model=schemas.RoutineOut)
def add_exercise_to_routine(routine_id: int, data: schemas.RoutineExerciseCreate, db: Session = Depends(get_db)):
    r = db.get(models.Routine, routine_id)
    if not r:
        raise HTTPException(404, "Rutina no encontrada")
    if not db.get(models.Exercise, data.exercise_id):
        raise HTTPException(404, "Ejercicio no encontrado")
    pos = data.position or (len(r.exercises))
    r.exercises.append(
        models.RoutineExercise(
            exercise_id=data.exercise_id,
            position=pos,
            target_sets=data.target_sets,
            target_reps=data.target_reps,
            target_weight=data.target_weight,
            notes=data.notes,
        )
    )
    db.commit()
    db.refresh(r)
    return get_routine(routine_id, db)


@app.patch("/api/routines/{routine_id}/exercises/{link_id}", response_model=schemas.RoutineOut)
def update_routine_exercise(
    routine_id: int, link_id: int, data: schemas.RoutineExerciseUpdate, db: Session = Depends(get_db)
):
    link = (
        db.query(models.RoutineExercise)
        .filter(models.RoutineExercise.id == link_id, models.RoutineExercise.routine_id == routine_id)
        .first()
    )
    if not link:
        raise HTTPException(404, "Ejercicio no encontrado en la rutina")
    if data.target_sets is not None:
        link.target_sets = data.target_sets
    if data.target_reps is not None:
        link.target_reps = data.target_reps
    if data.target_weight is not None:
        link.target_weight = data.target_weight
    if data.notes is not None:
        link.notes = data.notes
    if data.position is not None:
        link.position = data.position
    db.commit()
    return get_routine(routine_id, db)


@app.delete("/api/routines/{routine_id}/exercises/{link_id}", response_model=schemas.RoutineOut)
def remove_exercise_from_routine(routine_id: int, link_id: int, db: Session = Depends(get_db)):
    link = (
        db.query(models.RoutineExercise)
        .filter(models.RoutineExercise.id == link_id, models.RoutineExercise.routine_id == routine_id)
        .first()
    )
    if not link:
        raise HTTPException(404, "Ejercicio no encontrado en la rutina")
    db.delete(link)
    db.commit()
    return get_routine(routine_id, db)


# ---------- Sessions ----------
def _load_session(session_id: int, db: Session) -> models.WorkoutSession:
    sess = (
        db.query(models.WorkoutSession)
        .options(
            joinedload(models.WorkoutSession.routine),
            joinedload(models.WorkoutSession.exercises)
            .joinedload(models.SessionExercise.exercise),
            joinedload(models.WorkoutSession.exercises).joinedload(models.SessionExercise.sets),
        )
        .filter(models.WorkoutSession.id == session_id)
        .first()
    )
    if not sess:
        raise HTTPException(404, "Sesión no encontrada")
    return sess


@app.get("/api/sessions", response_model=list[schemas.SessionOut])
def list_sessions(limit: int = 20, db: Session = Depends(get_db)):
    sessions = (
        db.query(models.WorkoutSession)
        .options(
            joinedload(models.WorkoutSession.routine),
            joinedload(models.WorkoutSession.exercises).joinedload(models.SessionExercise.exercise),
            joinedload(models.WorkoutSession.exercises).joinedload(models.SessionExercise.sets),
        )
        .order_by(models.WorkoutSession.date.desc())
        .limit(min(limit, 100))
        .all()
    )
    return [session_out(s) for s in sessions]


@app.post("/api/sessions", response_model=schemas.SessionOut, status_code=201)
def create_session(data: schemas.SessionCreate, db: Session = Depends(get_db)):
    """Crea sesión vacía o clonando una rutina (copia ejercicios como SessionExercise)."""
    routine = None
    if data.routine_id:
        routine = db.get(models.Routine, data.routine_id)
        if not routine:
            raise HTTPException(404, "Rutina no encontrada")
        # cargar ejercicios de la rutina
        db.refresh(routine, ["exercises"])

    name = data.name.strip() or (f"{routine.name} — {datetime.now():%d/%m}" if routine else f"Entreno {datetime.now():%d/%m %H:%M}")
    sess = models.WorkoutSession(name=name, routine_id=routine.id if routine else None, notes=data.notes)
    db.add(sess)
    db.flush()

    if routine:
        for i, re in enumerate(sorted(routine.exercises, key=lambda x: x.position)):
            se = models.SessionExercise(
                session_id=sess.id, exercise_id=re.exercise_id, position=i, notes=re.notes
            )
            db.add(se)
            db.flush()
            # pre-crear series objetivo vacías para rellenar sobre la marcha
            for n in range(1, (re.target_sets or 0) + 1):
                db.add(models.SetLog(session_exercise_id=se.id, set_number=n, weight=re.target_weight or 0, reps=re.target_reps or 0))
    db.commit()
    return session_out(_load_session(sess.id, db))


@app.get("/api/sessions/{session_id}", response_model=schemas.SessionOut)
def get_session(session_id: int, db: Session = Depends(get_db)):
    return session_out(_load_session(session_id, db))


@app.patch("/api/sessions/{session_id}", response_model=schemas.SessionOut)
def update_session(session_id: int, data: schemas.SessionUpdate, db: Session = Depends(get_db)):
    sess = db.get(models.WorkoutSession, session_id)
    if not sess:
        raise HTTPException(404, "Sesión no encontrada")
    if data.name is not None:
        sess.name = data.name
    if data.notes is not None:
        sess.notes = data.notes
    db.commit()
    return session_out(_load_session(session_id, db))


@app.delete("/api/sessions/{session_id}", status_code=204)
def delete_session(session_id: int, db: Session = Depends(get_db)):
    sess = db.get(models.WorkoutSession, session_id)
    if not sess:
        raise HTTPException(404, "Sesión no encontrada")
    db.delete(sess)
    db.commit()
    return None


# Añadir / quitar ejercicios sobre la marcha
@app.post("/api/sessions/{session_id}/exercises", response_model=schemas.SessionOut)
def add_exercise_to_session(session_id: int, data: schemas.SessionExerciseCreate, db: Session = Depends(get_db)):
    sess = db.get(models.WorkoutSession, session_id)
    if not sess:
        raise HTTPException(404, "Sesión no encontrada")
    if not db.get(models.Exercise, data.exercise_id):
        raise HTTPException(404, "Ejercicio no encontrado")
    count = db.query(models.SessionExercise).filter_by(session_id=session_id).count()
    se = models.SessionExercise(
        session_id=session_id, exercise_id=data.exercise_id,
        position=data.position if data.position else count, notes=data.notes,
    )
    db.add(se)
    db.commit()
    return session_out(_load_session(session_id, db))


@app.patch("/api/session-exercises/{link_id}")
def update_session_exercise(link_id: int, data: schemas.SessionExerciseUpdate, db: Session = Depends(get_db)):
    se = db.get(models.SessionExercise, link_id)
    if not se:
        raise HTTPException(404, "Ejercicio de sesión no encontrado")
    if data.notes is not None:
        se.notes = data.notes
    if data.position is not None:
        se.position = data.position
    db.commit()
    return {"ok": True}


@app.delete("/api/session-exercises/{link_id}", status_code=204)
def remove_exercise_from_session(link_id: int, db: Session = Depends(get_db)):
    se = db.get(models.SessionExercise, link_id)
    if not se:
        raise HTTPException(404, "Ejercicio de sesión no encontrado")
    db.delete(se)
    db.commit()
    return None


# Series: registrar peso x reps
@app.post("/api/session-exercises/{link_id}/sets", response_model=schemas.SetOut, status_code=201)
def add_set(link_id: int, data: schemas.SetCreate, db: Session = Depends(get_db)):
    se = db.get(models.SessionExercise, link_id)
    if not se:
        raise HTTPException(404, "Ejercicio de sesión no encontrado")
    if data.set_number is None:
        existing = db.query(models.SetLog).filter_by(session_exercise_id=link_id).all()
        data.set_number = (max([s.set_number for s in existing], default=0) + 1)
    s = models.SetLog(session_exercise_id=link_id, set_number=data.set_number, weight=data.weight, reps=data.reps)
    db.add(s)
    db.commit()
    db.refresh(s)
    return set_out(s)


@app.delete("/api/sets/{set_id}", status_code=204)
def delete_set(set_id: int, db: Session = Depends(get_db)):
    s = db.get(models.SetLog, set_id)
    if not s:
        raise HTTPException(404, "Serie no encontrada")
    db.delete(s)
    db.commit()
    return None


# ---------- Progress ----------
@app.get("/api/progress/{exercise_id}", response_model=list[schemas.ProgressPoint])
def exercise_progress(exercise_id: int, db: Session = Depends(get_db)):
    """Evolución por ejercicio: peso máximo, 1RM estimado (Epley) y volumen por sesión."""
    if not db.get(models.Exercise, exercise_id):
        raise HTTPException(404, "Ejercicio no encontrado")
    rows = (
        db.query(models.SessionExercise, models.WorkoutSession)
        .join(models.WorkoutSession, models.SessionExercise.session_id == models.WorkoutSession.id)
        .options(joinedload(models.SessionExercise.sets))
        .filter(models.SessionExercise.exercise_id == exercise_id)
        .order_by(models.WorkoutSession.date.asc())
        .all()
    )
    out = []
    for se, sess in rows:
        if not se.sets:
            continue
        max_w = max(s.weight for s in se.sets)
        best_1rm = max(epley_1rm(s.weight, s.reps) for s in se.sets)
        vol = round(sum(s.weight * s.reps for s in se.sets), 2)
        out.append(
            {
                "date": sess.date,
                "session_id": sess.id,
                "max_weight": max_w,
                "best_1rm": best_1rm,
                "total_volume": vol,
                "total_sets": len(se.sets),
                "total_reps": sum(s.reps for s in se.sets),
            }
        )
    return out


@app.get("/api/last/{exercise_id}")
def last_time_exercise(exercise_id: int, db: Session = Depends(get_db)):
    """Última vez que hiciste un ejercicio: para consultar rápido qué hiciste."""
    se = (
        db.query(models.SessionExercise)
        .join(models.WorkoutSession)
        .options(joinedload(models.SessionExercise.sets))
        .filter(models.SessionExercise.exercise_id == exercise_id)
        .order_by(models.WorkoutSession.date.desc())
        .first()
    )
    if not se:
        return {"found": False}
    return {
        "found": True,
        "session_exercise_id": se.id,
        "notes": se.notes,
        "sets": [set_out(s) for s in sorted(se.sets, key=lambda x: x.set_number)],
    }


# ---------- Frontend compilado (Vite) ----------
PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIST = os.path.join(PROJECT_DIR, "frontend", "dist")

# Las rutas API se declaran antes de este mount, así que siguen teniendo prioridad.
# El frontend usa navegación hash y Vite copia manifest, iconos y service worker al build.
if os.path.isdir(FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
else:
    @app.get("/", include_in_schema=False)
    def frontend_not_built():
        return {
            "msg": "Frontend no compilado. Ejecuta `pnpm install` y `pnpm build` en frontend/."
        }

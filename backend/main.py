"""LightWeight API — FastAPI + SQLite + SQLAlchemy.

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

Base.metadata.create_all(bind=engine)

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


@app.on_event("startup")
def on_startup():
    db = next(get_db())
    try:
        seed_exercises(db)
    finally:
        db.close()


# ---------- Exercises ----------
@app.get("/api/exercises", response_model=list[schemas.ExerciseOut])
def list_exercises(db: Session = Depends(get_db)):
    return db.query(models.Exercise).order_by(models.Exercise.name).all()


@app.post("/api/exercises", response_model=schemas.ExerciseOut, status_code=201)
def create_exercise(data: schemas.ExerciseCreate, db: Session = Depends(get_db)):
    exists = db.query(models.Exercise).filter(models.Exercise.name == data.name.strip()).first()
    if exists:
        raise HTTPException(400, "Ya existe un ejercicio con ese nombre")
    ex = models.Exercise(name=data.name.strip(), muscle_group=data.muscle_group.strip(), notes=data.notes)
    db.add(ex)
    db.commit()
    db.refresh(ex)
    return ex


@app.delete("/api/exercises/{exercise_id}", status_code=204)
def delete_exercise(exercise_id: int, db: Session = Depends(get_db)):
    ex = db.get(models.Exercise, exercise_id)
    if not ex:
        raise HTTPException(404, "Ejercicio no encontrado")
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


@app.delete("/api/routines/{routine_id}", status_code=204)
def delete_routine(routine_id: int, db: Session = Depends(get_db)):
    r = db.get(models.Routine, routine_id)
    if not r:
        raise HTTPException(404, "Rutina no encontrada")
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

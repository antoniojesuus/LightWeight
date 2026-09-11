# LightWeight 🏋️

App local de seguimiento de entrenamientos en el gimnasio.

**Stack:** FastAPI + SQLite (SQLAlchemy) + HTML/Tailwind (CDN) + JS vainilla + Chart.js.

## Estructura

```
02_LightWeight/
├── backend/
│   ├── __init__.py
│   ├── database.py   # engine SQLite + SessionLocal + Base
│   ├── models.py     # Exercise, Routine, RoutineExercise, WorkoutSession, SessionExercise, SetLog
│   ├── schemas.py    # Pydantic
│   └── main.py       # FastAPI + endpoints + sirve frontend
├── frontend/
│   ├── index.html
│   └── app.js
├── requirements.txt
└── lightweight.db    # se crea sola al arrancar
```

## Modelo de datos

- **exercises**: catálogo (`name` único, `muscle_group`, `notes`).
- **routines** + **routine_exercises**: planificación (`target_sets/reps/weight`, `position`, `notes`).
- **workout_sessions**: sesión real (`routine_id` opcional, `date`, `notes` global).
- **session_exercises**: ejercicio en sesión (permite añadir/quitar sobre la marcha, `notes` por ejercicio).
- **set_logs**: cada serie (`set_number`, `weight`, `reps`).

Sin tiempos de descanso, según requisito.

## Uso local

```bash
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

- App: http://127.0.0.1:8000
- Docs API: http://127.0.0.1:8000/docs

## Flujo

1. **Entrenar**: crea ejercicios en el catálogo, inicia sesión libre o desde rutina, registra series (kg × reps), notas por ejercicio y nota global.
2. **Rutinas**: crea rutinas y añade ejercicios con objetivo (series/reps/kg). Al iniciar sesión desde rutina se clonan los ejercicios y se pre-crean las series objetivo (editables).
3. **Historial**: últimas 20 sesiones con volumen total y detalle `peso×reps`.
4. **Progreso**: elige ejercicio → gráficos de peso máximo + 1RM estimado (Epley) y volumen; además "última vez" para consulta rápida.

## Endpoints principales

- `GET/POST /api/exercises`, `DELETE /api/exercises/{id}`
- `GET/POST /api/routines`, `GET/DELETE /api/routines/{id}`
- `POST /api/routines/{id}/exercises`, `DELETE /api/routines/{id}/exercises/{link_id}`
- `GET/POST /api/sessions`, `GET/PATCH/DELETE /api/sessions/{id}`
- `POST /api/sessions/{id}/exercises`, `PATCH/DELETE /api/session-exercises/{link_id}`
- `POST /api/session-exercises/{link_id}/sets`, `DELETE /api/sets/{id}`
- `GET /api/progress/{exercise_id}`, `GET /api/last/{exercise_id}`

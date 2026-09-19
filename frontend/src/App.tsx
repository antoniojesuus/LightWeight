import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, BarChart3, BookOpen, Check, ChevronDown, CirclePlus, ClipboardList,
  Dumbbell, FileText, LoaderCircle, Menu, NotebookPen, Plus, Search, Trash2, X
} from "lucide-react";
import { api } from "./api";
import { filterProgress, formatDate, formatKg, weeklyMetrics } from "./lib";
import { ProgressCharts } from "./ProgressCharts";
import type { Exercise, LastExercise, ProgressPoint, Route, Routine, SessionExercise, WorkoutSession } from "./types";

type ToastKind = "success" | "error" | "info";
type Toast = { text: string; kind: ToastKind } | null;
type ConfirmState = { title: string; detail: string; action: () => Promise<void> } | null;
const routes: { id: Route; label: string; icon: typeof Dumbbell }[] = [
  { id: "entrenar", label: "Entrenar", icon: Dumbbell },
  { id: "rutinas", label: "Planificador de Rutinas", icon: ClipboardList },
  { id: "historial", label: "Historial", icon: BookOpen },
  { id: "progreso", label: "Progreso y Análisis", icon: BarChart3 }
];

function haptic(pattern: number | number[] = 10) { try { navigator.vibrate?.(pattern); } catch { /* no haptics */ } }
function routeFromHash(): Route { const value = window.location.hash.slice(2) as Route; return routes.some((route) => route.id === value) ? value : "entrenar"; }

export function App() {
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(null);
  const [selectedRoutineId, setSelectedRoutineId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [toast, setToast] = useState<Toast>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const notify = useCallback((text: string, kind: ToastKind = "info") => {
    setToast({ text, kind });
    window.setTimeout(() => setToast(null), 3500);
  }, []);
  const reload = useCallback(async () => {
    try {
      const [nextExercises, nextRoutines, nextSessions] = await Promise.all([api.exercises(), api.routines(), api.sessions()]);
      setExercises(nextExercises); setRoutines(nextRoutines); setSessions(nextSessions); setOnline(true);
      setSelectedRoutineId((current) => current && nextRoutines.some((routine) => routine.id === current) ? current : nextRoutines[0]?.id ?? null);
    } catch (error) { setOnline(false); notify(error instanceof Error ? error.message : "No se pudo conectar con la API", "error"); }
    finally { setLoading(false); }
  }, [notify]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHashChange);
    if (!window.location.hash) window.location.hash = "#/entrenar";
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const navigate = (next: Route) => { window.location.hash = `#/${next}`; haptic(); };
  const metrics = useMemo(() => weeklyMetrics(sessions), [sessions]);
  const selectedRoutine = routines.find((routine) => routine.id === selectedRoutineId) ?? null;
  const refreshSession = async (id: number) => { const next = await api.session(id); setActiveSession(next); await reload(); return next; };
  const ask = (title: string, detail: string, action: () => Promise<void>) => setConfirm({ title, detail, action });

  const createExercise = async (name: string, muscle: string) => {
    await api.createExercise(name, muscle); await reload(); notify("Ejercicio creado", "success"); haptic([10, 30, 10]);
  };
  const createRoutine = async (name: string, description: string) => {
    const routine = await api.createRoutine(name, description); await reload(); setSelectedRoutineId(routine.id); notify("Rutina creada", "success");
  };
  const startSession = async (data: { name?: string; routine_id?: number }) => {
    const session = await api.createSession(data); setActiveSession(session); await reload(); navigate("entrenar"); notify("Sesión iniciada", "success"); haptic([10, 30, 10]);
  };
  const addSet = async (exercise: SessionExercise, weight: number, reps: number) => {
    if (!activeSession) return;
    const optimistic = { id: -Date.now(), set_number: exercise.sets.length + 1, weight, reps, volume: weight * reps };
    setActiveSession((current) => current ? { ...current, exercises: current.exercises.map((item) => item.id === exercise.id ? { ...item, sets: [...item.sets, optimistic] } : item) } : current);
    try { await api.addSet(exercise.id, weight, reps); await refreshSession(activeSession.id); haptic([8, 25, 8]); }
    catch (error) { await refreshSession(activeSession.id).catch(() => undefined); notify("La serie no se pudo guardar", "error"); haptic([40, 40, 40]); }
  };
  const deleteSet = async (exercise: SessionExercise, setId: number) => {
    if (!activeSession) return;
    const previous = activeSession;
    setActiveSession({ ...activeSession, exercises: activeSession.exercises.map((item) => item.id === exercise.id ? { ...item, sets: item.sets.filter((set) => set.id !== setId) } : item) });
    try { await api.deleteSet(setId); await refreshSession(activeSession.id); haptic(20); }
    catch { setActiveSession(previous); notify("No se pudo eliminar la serie", "error"); }
  };

  return <div className="app-shell">
    <Sidebar route={route} navigate={navigate} online={online} />
    <main className="main-area">
      <Topbar metrics={metrics} />
      <div className="page-content">
        {loading ? <Loading /> : route === "entrenar" ? <TrainView exercises={exercises} routines={routines} activeSession={activeSession} onStart={startSession} onCreateExercise={createExercise} onRefresh={reload} onSetActive={setActiveSession} onRefreshSession={refreshSession} onAddSet={addSet} onDeleteSet={deleteSet} notify={notify} ask={ask} /> : null}
        {!loading && route === "rutinas" ? <RoutinesView exercises={exercises} routines={routines} selected={selectedRoutine} onSelect={setSelectedRoutineId} onCreate={createRoutine} onReload={reload} onStart={startSession} ask={ask} notify={notify} /> : null}
        {!loading && route === "historial" ? <HistoryView sessions={sessions} routines={routines} onReload={reload} ask={ask} /> : null}
        {!loading && route === "progreso" ? <ProgressView exercises={exercises} /> : null}
      </div>
    </main>
    {toast && <div className={`toast toast-${toast.kind}`}>{toast.kind === "success" ? <Check size={16} /> : <Activity size={16} />}{toast.text}</div>}
    {confirm && <ConfirmDialog confirm={confirm} close={() => setConfirm(null)} notify={notify} />}
  </div>;
}

function Sidebar({ route, navigate, online }: { route: Route; navigate: (route: Route) => void; online: boolean }) {
  return <aside className="sidebar">
    <div className="brand"><div className="brand-icon"><Dumbbell size={18} /></div><div><strong>LIGHTWEIGHT</strong><span>OBSIDIAN ENGINE</span></div></div>
    <div className={`db-status ${online ? "" : "offline"}`}><i />{online ? "SQLITE LOCAL ACTIVA" : "API NO DISPONIBLE"}</div>
    <nav>{routes.map(({ id, label, icon: Icon }) => <button className={route === id ? "nav-item active" : "nav-item"} onClick={() => navigate(id)} key={id}><Icon size={18} />{label}</button>)}</nav>
    <div className="sidebar-footer"><span>MOTOR LOCAL</span><b>SQLite + API</b><span>SINCRONIZACIÓN</span><b>{online ? "Conectada" : "Sin red"}</b></div>
  </aside>;
}

function Topbar({ metrics }: { metrics: { volume: number; sets: number } }) {
  return <header className="topbar"><div className="session-label">SESIÓN DE FUERZA <span>v2.0-OBSIDIAN</span></div><div className="header-metrics"><Metric label="VOLUMEN TOTAL (SEM)" value={`${formatKg(metrics.volume)} kg`} /><Metric label="SERIES COMPLETADAS" value={String(metrics.sets)} accent /></div><div className="athlete">Atleta Principal <span>Seguimiento local</span></div></header>;
}
function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <div className="header-metric"><span>{label}</span><b className={accent ? "accent" : ""}>{value}</b></div>; }
function Loading() { return <div className="loading"><LoaderCircle className="spin" size={24} />Cargando datos locales…</div>; }

function TrainView({ exercises, routines, activeSession, onStart, onCreateExercise, onRefresh, onSetActive, onRefreshSession, onAddSet, onDeleteSet, notify, ask }: {
  exercises: Exercise[]; routines: Routine[]; activeSession: WorkoutSession | null; onStart: (data: { name?: string; routine_id?: number }) => Promise<void>; onCreateExercise: (name: string, muscle: string) => Promise<void>; onRefresh: () => Promise<void>; onSetActive: (session: WorkoutSession | null) => void; onRefreshSession: (id: number) => Promise<WorkoutSession>; onAddSet: (exercise: SessionExercise, weight: number, reps: number) => Promise<void>; onDeleteSet: (exercise: SessionExercise, id: number) => Promise<void>; notify: (text: string, kind?: ToastKind) => void; ask: (title: string, detail: string, action: () => Promise<void>) => void;
}) {
  const [name, setName] = useState(""); const [routineId, setRoutineId] = useState(""); const [addExerciseId, setAddExerciseId] = useState("");
  const [newName, setNewName] = useState(""); const [newMuscle, setNewMuscle] = useState("");
  const start = async (fromRoutine: boolean) => { await onStart({ name, ...(fromRoutine && routineId ? { routine_id: Number(routineId) } : {}) }); setName(""); };
  return <PageTitle eyebrow="MÓDULO DE ENTRENAMIENTO" title="Sesión de fuerza" description="Registro rápido de carga, repeticiones y notas de entrenamiento." actions={null}>
    {!activeSession ? <section className="panel start-panel"><div><span className="eyebrow">NUEVA SESIÓN</span><h2>Empieza a registrar tu entrenamiento</h2><p>Elige una rutina o inicia una sesión libre.</p></div><div className="start-controls"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre opcional" /><select value={routineId} onChange={(event) => setRoutineId(event.target.value)}><option value="">Selecciona una rutina</option>{routines.map((routine) => <option value={routine.id} key={routine.id}>{routine.name}</option>)}</select><button className="button secondary" onClick={() => void start(false)}>Sesión libre</button><button className="button primary" disabled={!routineId} onClick={() => void start(true)}><Dumbbell size={16} />Desde rutina</button></div></section> : <ActiveSession session={activeSession} exercises={exercises} close={() => onSetActive(null)} onRefresh={onRefreshSession} onAddSet={onAddSet} onDeleteSet={onDeleteSet} notify={notify} ask={ask} />}
    <div className="split-grid"><section className="panel"><div className="section-heading"><div><h2>Catálogo de ejercicios</h2><p>{exercises.length} disponibles en tu base local.</p></div></div><form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (!newName.trim()) return; void onCreateExercise(newName.trim(), newMuscle.trim()).then(() => { setNewName(""); setNewMuscle(""); }); }}><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Nombre del ejercicio" /><input value={newMuscle} onChange={(event) => setNewMuscle(event.target.value)} placeholder="Grupo muscular" /><button className="icon-button primary" aria-label="Crear ejercicio"><Plus size={17} /></button></form><div className="exercise-chips">{exercises.map((exercise) => <span key={exercise.id}>{exercise.name}<small>{exercise.muscle_group || "General"}</small></span>)}</div></section>
    <section className="panel compact-note"><NotebookPen size={20} /><h3>Sesiones locales</h3><p>Las series se guardan directamente en SQLite a través de la API local.</p><button className="text-button" onClick={() => void onRefresh()}>Actualizar datos</button></section></div>
  </PageTitle>;
}

function ActiveSession({ session, exercises, close, onRefresh, onAddSet, onDeleteSet, notify, ask }: { session: WorkoutSession; exercises: Exercise[]; close: () => void; onRefresh: (id: number) => Promise<WorkoutSession>; onAddSet: (exercise: SessionExercise, weight: number, reps: number) => Promise<void>; onDeleteSet: (exercise: SessionExercise, id: number) => Promise<void>; notify: (text: string, kind?: ToastKind) => void; ask: (title: string, detail: string, action: () => Promise<void>) => void }) {
  const [notes, setNotes] = useState(session.notes); const [exerciseId, setExerciseId] = useState("");
  useEffect(() => setNotes(session.notes), [session.notes]);
  const saveNotes = async () => { try { await api.updateSession(session.id, { notes }); await onRefresh(session.id); notify("Nota guardada", "success"); } catch { notify("No se pudo guardar la nota", "error"); } };
  const addExercise = async () => { if (!exerciseId) return; try { await api.addSessionExercise(session.id, Number(exerciseId)); await onRefresh(session.id); setExerciseId(""); } catch { notify("No se pudo añadir el ejercicio", "error"); } };
  return <section className="active-session"><div className="active-header"><div><span className="eyebrow">SESIÓN ACTIVA</span><h2>{session.name}</h2><p>{formatDate(session.date)} · {session.routine_name || "Sesión libre"} · <b>{formatKg(session.total_volume)} kg</b></p></div><button className="button secondary" onClick={close}>Cerrar vista</button></div><div className="notes-row"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Bitácora de la sesión…" /><button className="button secondary" onClick={() => void saveNotes()}>Guardar nota</button></div>
    <div className="session-exercises">{session.exercises.length ? session.exercises.map((exercise) => <SessionExerciseCard key={exercise.id} exercise={exercise} onRefresh={onRefresh} sessionId={session.id} onAddSet={onAddSet} onDeleteSet={onDeleteSet} notify={notify} ask={ask} />) : <div className="empty-state">Sesión vacía. Añade un ejercicio para empezar.</div>}</div>
    <div className="add-row"><select value={exerciseId} onChange={(event) => setExerciseId(event.target.value)}><option value="">Añadir ejercicio a la sesión</option>{exercises.map((exercise) => <option value={exercise.id} key={exercise.id}>{exercise.name}</option>)}</select><button className="button primary" onClick={() => void addExercise()}><Plus size={16} />Añadir</button></div>
  </section>;
}

function SessionExerciseCard({ exercise, onRefresh, sessionId, onAddSet, onDeleteSet, notify, ask }: { exercise: SessionExercise; onRefresh: (id: number) => Promise<WorkoutSession>; sessionId: number; onAddSet: (exercise: SessionExercise, weight: number, reps: number) => Promise<void>; onDeleteSet: (exercise: SessionExercise, id: number) => Promise<void>; notify: (text: string, kind?: ToastKind) => void; ask: (title: string, detail: string, action: () => Promise<void>) => void }) {
  const [weight, setWeight] = useState(""); const [reps, setReps] = useState(""); const [notes, setNotes] = useState(exercise.notes);
  useEffect(() => setNotes(exercise.notes), [exercise.notes]);
  const save = async () => { try { await api.updateSessionExercise(exercise.id, notes); notify("Nota de ejercicio guardada", "success"); } catch { notify("No se pudo guardar la nota", "error"); } };
  return <article className="exercise-card"><div className="exercise-card-head"><div><h3>{exercise.exercise_name}</h3><span className="mono">{exercise.sets.length} SERIES · {formatKg(exercise.sets.reduce((sum, set) => sum + set.volume, 0))} KG VOL.</span></div><button className="icon-button" aria-label="Quitar ejercicio" onClick={() => ask("¿Quitar ejercicio?", "Se eliminarán también sus series de esta sesión.", async () => { await api.deleteSessionExercise(exercise.id); await onRefresh(sessionId); })}><X size={17} /></button></div><div className="exercise-notes"><input value={notes} onChange={(event) => setNotes(event.target.value)} onBlur={() => void save()} placeholder="Nota técnica del ejercicio…" /></div><table><thead><tr><th>SET</th><th>CARGA</th><th>REPS</th><th>VOLUMEN</th><th /></tr></thead><tbody>{exercise.sets.map((set) => <tr key={set.id} className={set.id < 0 ? "pending" : ""}><td>{set.set_number}</td><td>{formatKg(set.weight)} kg</td><td>{set.reps}</td><td>{formatKg(set.volume)} kg</td><td><button className="row-action" disabled={set.id < 0} onClick={() => void onDeleteSet(exercise, set.id)}><Trash2 size={14} /></button></td></tr>)}</tbody></table><div className="set-form"><input type="number" min="0" step="0.5" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="kg" /><input type="number" min="0" value={reps} onChange={(event) => setReps(event.target.value)} placeholder="reps" /><button className="button primary" onClick={() => { const kg = Number(weight); const count = Number(reps); if (Number.isNaN(kg) || Number.isNaN(count)) return; setWeight(""); setReps(""); void onAddSet(exercise, kg, count); }}><Plus size={15} />Serie</button></div></article>;
}

function RoutinesView({ exercises, routines, selected, onSelect, onCreate, onReload, onStart, ask, notify }: { exercises: Exercise[]; routines: Routine[]; selected: Routine | null; onSelect: (id: number) => void; onCreate: (name: string, description: string) => Promise<void>; onReload: () => Promise<void>; onStart: (data: { routine_id?: number }) => Promise<void>; ask: (title: string, detail: string, action: () => Promise<void>) => void; notify: (text: string, kind?: ToastKind) => void }) {
  const [creating, setCreating] = useState(false); const [exerciseId, setExerciseId] = useState(""); const [sets, setSets] = useState("3"); const [reps, setReps] = useState("10"); const [weight, setWeight] = useState("0"); const [query, setQuery] = useState("");
  const visibleExercises = exercises.filter((exercise) => `${exercise.name} ${exercise.muscle_group}`.toLowerCase().includes(query.toLowerCase()));
  const addExercise = async () => { if (!selected || !exerciseId) return; try { await api.addRoutineExercise(selected.id, { exercise_id: Number(exerciseId), target_sets: Number(sets) || 3, target_reps: Number(reps) || 10, target_weight: Number(weight) || 0 }); await onReload(); notify("Ejercicio añadido a la rutina", "success"); } catch { notify("No se pudo añadir el ejercicio", "error"); } };
  return <PageTitle eyebrow="MÓDULO DE PLANIFICACIÓN" title="Gestión de rutinas y ejercicios" description="Define plantillas reutilizables para tus sesiones de fuerza." actions={<button className="button primary" onClick={() => setCreating(true)}><Plus size={16} />Nueva rutina</button>}>
    {creating && <RoutineForm onClose={() => setCreating(false)} onCreate={async (name, description) => { await onCreate(name, description); setCreating(false); }} />}
    <section><div className="list-label">RUTINAS ACTIVAS</div><div className="routine-grid">{routines.map((routine) => <button className={selected?.id === routine.id ? "routine-tile selected" : "routine-tile"} onClick={() => onSelect(routine.id)} key={routine.id}><span className="mono">{routine.exercises.length} MOVS</span><h3>{routine.name}</h3><p>{routine.description || "Sin descripción"}</p><b>{routine.exercises.reduce((total, exercise) => total + exercise.target_sets, 0)} series objetivo</b></button>)}{!routines.length && <div className="empty-state">Crea tu primera rutina para empezar.</div>}</div></section>
    {selected && <div className="routine-layout"><section className="panel routine-detail"><div className="section-heading"><div><span className="eyebrow">RUTINA SELECCIONADA</span><h2>{selected.name}</h2><p>{selected.description || "Sin notas de preparación."}</p></div><div className="action-cluster"><button className="button primary" onClick={() => void onStart({ routine_id: selected.id })}><Dumbbell size={16} />Entrenar</button><button className="icon-button danger" aria-label="Eliminar rutina" onClick={() => ask("¿Eliminar rutina?", "Se borrará la plantilla y sus ejercicios planificados.", async () => { await api.deleteRoutine(selected.id); await onReload(); })}><Trash2 size={16} /></button></div></div><div className="routine-summary"><Metric label="EJERCICIOS" value={String(selected.exercises.length)} /><Metric label="TOTAL SERIES" value={String(selected.exercises.reduce((total, exercise) => total + exercise.target_sets, 0))} /><Metric label="CARGA OBJETIVO" value={`${formatKg(selected.exercises.reduce((total, exercise) => total + exercise.target_sets * exercise.target_reps * exercise.target_weight, 0))} kg`} /></div><div className="routine-exercises">{selected.exercises.map((exercise, index) => <article className="planned-exercise" key={exercise.id}><div className="position">{index + 1}</div><div className="planned-main"><h3>{exercise.exercise_name}</h3><span>{exercise.muscle_group || "General"}</span></div><div className="planned-data"><span>SERIES<b>{exercise.target_sets}</b></span><span>REPS<b>{exercise.target_reps}</b></span><span>CARGA<b>{formatKg(exercise.target_weight)} kg</b></span></div><button className="row-action" aria-label="Quitar de rutina" onClick={() => void api.removeRoutineExercise(selected.id, exercise.id).then(onReload).catch(() => notify("No se pudo quitar el ejercicio", "error"))}><X size={16} /></button></article>)}</div><div className="add-routine-exercise"><label className="routine-field routine-exercise-picker"><span>Ejercicio</span><select value={exerciseId} onChange={(event) => setExerciseId(event.target.value)}><option value="">Selecciona un ejercicio</option>{exercises.map((exercise) => <option value={exercise.id} key={exercise.id}>{exercise.name}</option>)}</select></label><label className="routine-field"><span>Series</span><input type="number" min="1" value={sets} onChange={(event) => setSets(event.target.value)} aria-label="Series objetivo" /></label><label className="routine-field"><span>Repeticiones</span><input type="number" min="1" value={reps} onChange={(event) => setReps(event.target.value)} aria-label="Repeticiones objetivo" /></label><label className="routine-field"><span>Carga (kg)</span><input type="number" min="0" step=".5" value={weight} onChange={(event) => setWeight(event.target.value)} aria-label="Carga objetivo en kilogramos" /></label><button className="button secondary" onClick={() => void addExercise()}><CirclePlus size={16} />Añadir</button></div></section>
      <aside className="panel exercise-library"><div className="section-heading"><div><h2>Biblioteca de ejercicios</h2><p>{exercises.length} disponibles</p></div></div><label className="search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar ejercicio o músculo…" /></label><div className="library-list">{visibleExercises.map((exercise) => <button key={exercise.id} onClick={() => setExerciseId(String(exercise.id))} className={exerciseId === String(exercise.id) ? "library-item chosen" : "library-item"}><Dumbbell size={16} /><span><b>{exercise.name}</b><small>{exercise.muscle_group || "General"}</small></span><Plus size={16} /></button>)}</div></aside></div>}
  </PageTitle>;
}

function RoutineForm({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, description: string) => Promise<void> }) {
  const [name, setName] = useState(""); const [description, setDescription] = useState("");
  return <div className="modal-backdrop"><form className="dialog" onSubmit={(event) => { event.preventDefault(); if (name.trim()) void onCreate(name.trim(), description.trim()); }}><div className="dialog-head"><h2>Nueva rutina</h2><button type="button" className="icon-button" onClick={onClose}><X size={17} /></button></div><label>Nombre<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Torso hipertrofia" /></label><label>Descripción<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Objetivo de la rutina" /></label><div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary">Crear rutina</button></div></form></div>;
}

function HistoryView({ sessions, routines, onReload, ask }: { sessions: WorkoutSession[]; routines: Routine[]; onReload: () => Promise<void>; ask: (title: string, detail: string, action: () => Promise<void>) => void }) {
  const [query, setQuery] = useState(""); const [routine, setRoutine] = useState("all"); const [period, setPeriod] = useState("all"); const [expanded, setExpanded] = useState<number | null>(sessions[0]?.id ?? null);
  const filtered = sessions.filter((session) => {
    const text = `${session.name} ${session.routine_name} ${session.exercises.map((exercise) => exercise.exercise_name).join(" ")}`.toLowerCase();
    const byText = text.includes(query.toLowerCase()); const byRoutine = routine === "all" || String(session.routine_id) === routine;
    const cutoff = period === "all" ? 0 : Date.now() - Number(period) * 86400000;
    return byText && byRoutine && new Date(session.date).getTime() >= cutoff;
  });
  const total = filtered.reduce((sum, session) => sum + session.total_volume, 0);
  return <PageTitle eyebrow="REGISTRO LOCAL" title="Historial de sesiones" description="Consulta, filtra y revisa tus entrenamientos registrados." actions={null}>
    <div className="metric-grid"><MetricCard label="SESIONES VISIBLES" value={String(filtered.length)} icon={BookOpen} /><MetricCard label="CARGA ACUMULADA" value={`${formatKg(total)} kg`} icon={Dumbbell} /><MetricCard label="SERIES REGISTRADAS" value={String(filtered.reduce((sum, session) => sum + session.exercises.reduce((n, exercise) => n + exercise.sets.length, 0), 0))} icon={Activity} /></div>
    <section className="filter-bar"><label className="search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrar por ejercicio o sesión…" /></label><select value={routine} onChange={(event) => setRoutine(event.target.value)}><option value="all">Todas las rutinas</option>{routines.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="all">Todo el historial</option><option value="30">Últimos 30 días</option><option value="90">Último trimestre</option><option value="365">Último año</option></select></section>
    <section className="history-list">{filtered.map((session) => <article className="history-item" key={session.id}><button className="history-head" onClick={() => setExpanded(expanded === session.id ? null : session.id)}><ChevronDown size={18} className={expanded === session.id ? "rotate" : ""} /><div><h2>{session.name}</h2><p>{formatDate(session.date)} · {session.routine_name || "Sesión libre"}</p></div><div className="history-totals"><span>VOLUMEN <b>{formatKg(session.total_volume)} kg</b></span><span>SERIES <b>{session.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)}</b></span></div></button>{expanded === session.id && <div className="history-detail">{session.notes && <div className="session-note"><FileText size={16} />{session.notes}</div>}{session.exercises.map((exercise) => <div className="history-exercise" key={exercise.id}><b>{exercise.exercise_name}</b><span>{exercise.sets.map((set) => `${formatKg(set.weight)} kg × ${set.reps}`).join(" · ") || "Sin series"}</span>{exercise.notes && <small>{exercise.notes}</small>}</div>)}<button className="text-danger" onClick={() => ask("¿Eliminar sesión?", "Se eliminarán la sesión y todas sus series registradas.", async () => { await api.deleteSession(session.id); await onReload(); })}><Trash2 size={15} />Eliminar registro</button></div>}</article>)}{!filtered.length && <div className="empty-state">No hay sesiones que coincidan con los filtros.</div>}</section>
  </PageTitle>;
}

function ProgressView({ exercises }: { exercises: Exercise[] }) {
  const [exerciseId, setExerciseId] = useState(""); const [window, setWindow] = useState("3"); const [points, setPoints] = useState<ProgressPoint[]>([]); const [last, setLast] = useState<LastExercise | null>(null); const [loading, setLoading] = useState(false);
  useEffect(() => { if (!exerciseId && exercises[0]) setExerciseId(String(exercises[0].id)); }, [exerciseId, exercises]);
  useEffect(() => { if (!exerciseId) return; setLoading(true); Promise.all([api.progress(Number(exerciseId)), api.last(Number(exerciseId))]).then(([nextPoints, nextLast]) => { setPoints(nextPoints); setLast(nextLast); }).finally(() => setLoading(false)); }, [exerciseId]);
  const scoped = filterProgress(points, window); const latest = scoped.at(-1); const max = scoped.reduce((value, point) => Math.max(value, point.max_weight), 0); const averageVolume = scoped.length ? scoped.reduce((sum, point) => sum + point.total_volume, 0) / scoped.length : 0;
  return <PageTitle eyebrow="MÓDULO DE TELEMETRÍA" title="Análisis y evolución de fuerza" description="Progreso real por ejercicio usando tus sesiones guardadas." actions={null}>
    <section className="progress-controls"><label>Ejercicio de referencia<select value={exerciseId} onChange={(event) => setExerciseId(event.target.value)}>{exercises.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}</select></label><div><span>Ventana temporal</span><div className="period-tabs">{[["1", "1M"], ["3", "3M"], ["6", "6M"], ["12", "1A"], ["all", "HISTÓRICO"]].map(([value, label]) => <button className={window === value ? "selected" : ""} key={value} onClick={() => setWindow(value)}>{label}</button>)}</div></div></section>
    <div className="metric-grid"><MetricCard label="1RM ESTIMADO ACTUAL" value={latest ? `${formatKg(latest.best_1rm)} kg` : "—"} icon={Activity} detail="Fórmula Epley" /><MetricCard label="CARGA MÁXIMA REAL" value={max ? `${formatKg(max)} kg` : "—"} icon={Dumbbell} detail={latest ? `${latest.total_reps} reps en la última sesión` : undefined} /><MetricCard label="VOLUMEN MEDIO / SESIÓN" value={scoped.length ? `${formatKg(averageVolume)} kg` : "—"} icon={BarChart3} detail={`${scoped.length} sesiones en el periodo`} /><MetricCard label="ÚLTIMO REGISTRO" value={last?.found ? `${last.sets.length} series` : "—"} icon={ClipboardList} detail={last?.found ? last.sets.map((set) => `${formatKg(set.weight)}×${set.reps}`).join(" · ") : "Sin registros"} /></div>
    {loading ? <Loading /> : <ProgressCharts points={scoped} />}
  </PageTitle>;
}

function PageTitle({ eyebrow, title, description, actions, children }: { eyebrow: string; title: string; description: string; actions: React.ReactNode; children: React.ReactNode }) { return <><section className="page-title"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{actions}</section>{children}</>; }
function MetricCard({ label, value, icon: Icon, detail }: { label: string; value: string; icon: typeof Activity; detail?: string }) { return <article className="metric-card"><div><span>{label}</span><h2>{value}</h2></div><Icon size={19} />{detail && <p>{detail}</p>}</article>; }
function ConfirmDialog({ confirm, close, notify }: { confirm: Exclude<ConfirmState, null>; close: () => void; notify: (text: string, kind?: ToastKind) => void }) { const [working, setWorking] = useState(false); const proceed = async () => { setWorking(true); try { await confirm.action(); notify("Cambios guardados", "success"); close(); } catch { notify("No se pudo completar la acción", "error"); setWorking(false); } }; return <div className="modal-backdrop"><div className="dialog"><h2>{confirm.title}</h2><p>{confirm.detail}</p><div className="dialog-actions"><button className="button secondary" onClick={close}>Cancelar</button><button className="button danger-button" disabled={working} onClick={() => void proceed()}>{working ? "Eliminando…" : "Confirmar"}</button></div></div></div>; }

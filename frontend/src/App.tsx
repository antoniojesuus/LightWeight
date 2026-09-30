import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDown, ArrowUp, BarChart3, BookOpen, Check, ChevronDown, CirclePlus, ClipboardList,
  Dumbbell, FileText, ListPlus, LoaderCircle, Menu, NotebookPen, Pencil, Plus, Search, Settings, Trash2, X
} from "lucide-react";
import { api } from "./api";
import { filterProgress, formatDate, formatKg, epley1RM, weeklyMetrics } from "./lib";
import { ProgressCharts } from "./ProgressCharts";
import type { Exercise, LastExercise, PbGroup, ProgressPoint, Route, Routine, SessionExercise, WorkoutSession } from "./types";

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
  const [pbGroups, setPbGroups] = useState<PbGroup[]>([]);
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
      const [nextExercises, nextPbGroups, nextRoutines, nextSessions] = await Promise.all([api.exercises(), api.pbGroups(), api.routines(), api.sessions()]);
      setExercises(nextExercises); setPbGroups(nextPbGroups); setRoutines(nextRoutines); setSessions(nextSessions); setOnline(true);
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
  const updateExercisePR = async (id: number, current_weight: number, current_reps: number, notes: string, pb_group_id: number | null) => {
    await api.updateExercise(id, { current_weight, current_reps, notes, pb_group_id });
    await reload();
    notify("Marca actualizada", "success");
    haptic([10, 30, 10]);
  };
  const deleteExercise = async (id: number) => {
    await api.deleteExercise(id); await reload(); notify("Ejercicio eliminado", "success"); haptic(20);
  };
  const createRoutine = async (name: string, description: string) => {
    const routine = await api.createRoutine(name, description); await reload(); setSelectedRoutineId(routine.id); notify("Rutina creada", "success");
  };
  const updateRoutine = async (id: number, name: string, description: string) => {
    await api.updateRoutine(id, { name, description }); await reload(); notify("Rutina actualizada", "success");
  };
  const deleteRoutine = async (id: number) => {
    await api.deleteRoutine(id); await reload();
    setSelectedRoutineId((current) => (current === id ? null : current));
    notify("Rutina eliminada", "success"); haptic(20);
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
    <BottomNav route={route} navigate={navigate} />
    <main className="main-area">
      <Topbar metrics={metrics} />
      <div className="page-content">
        {loading ? <Loading /> : route === "entrenar" ? <TrainView exercises={exercises} pbGroups={pbGroups} routines={routines} activeSession={activeSession} onStart={startSession} onCreateExercise={createExercise} onUpdateExercisePR={updateExercisePR} onDeleteExercise={deleteExercise} onRefresh={reload} onSetActive={setActiveSession} onRefreshSession={refreshSession} onAddSet={addSet} onDeleteSet={deleteSet} notify={notify} ask={ask} /> : null}
        {!loading && route === "rutinas" ? <RoutinesView exercises={exercises} routines={routines} selected={selectedRoutine} onSelect={setSelectedRoutineId} onCreate={createRoutine} onUpdate={updateRoutine} onDelete={deleteRoutine} onReload={reload} onStart={startSession} ask={ask} notify={notify} /> : null}
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

function BottomNav({ route, navigate }: { route: Route; navigate: (route: Route) => void }) {
  return <nav className="bottom-nav">
    {routes.map(({ id, label, icon: Icon }) => (
      <button key={id} className={route === id ? "bottom-nav-item active" : "bottom-nav-item"} onClick={() => navigate(id)}>
        <Icon size={22} />
        <span>{label.split(" ")[0]}</span>
      </button>
    ))}
  </nav>;
}


function Topbar({ metrics }: { metrics: { volume: number; sets: number } }) {
  return <header className="topbar"><div className="session-label">SESIÓN DE FUERZA <span>v2.0-OBSIDIAN</span></div><div className="header-metrics"><Metric label="VOLUMEN TOTAL (SEM)" value={`${formatKg(metrics.volume)} kg`} /><Metric label="SERIES COMPLETADAS" value={String(metrics.sets)} accent /></div><div className="athlete">Atleta Principal <span>Seguimiento local</span></div></header>;
}
function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <div className="header-metric"><span>{label}</span><b className={accent ? "accent" : ""}>{value}</b></div>; }
function Loading() { return <div className="loading"><LoaderCircle className="spin" size={24} />Cargando datos locales…</div>; }

function PersonalBestsWidget({
  exercises,
  pbGroups,
  onUpdatePR,
  onRefresh,
  notify,
  ask,
}: {
  exercises: Exercise[];
  pbGroups: PbGroup[];
  onUpdatePR: (id: number, weight: number, reps: number, notes: string, pbGroupId: number | null) => Promise<void>;
  onRefresh: () => Promise<void>;
  notify: (text: string, kind?: ToastKind) => void;
  ask: (title: string, detail: string, action: () => Promise<void>) => void;
}) {
  const [search, setSearch] = useState("");
  const [managingGroups, setManagingGroups] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editWeight, setEditWeight] = useState("");
  const [editReps, setEditReps] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editPbGroupId, setEditPbGroupId] = useState("");
  const [saving, setSaving] = useState(false);

  const startEdit = (ex: Exercise) => {
    setEditingId(ex.id);
    setEditWeight(ex.current_weight > 0 ? String(ex.current_weight) : "");
    setEditReps(ex.current_reps > 0 ? String(ex.current_reps) : "");
    setEditNotes(ex.notes ?? "");
    setEditPbGroupId(ex.pb_group_id === null ? "" : String(ex.pb_group_id));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditWeight("");
    setEditReps("");
    setEditNotes("");
    setEditPbGroupId("");
  };

  const handleSave = async (id: number) => {
    const w = parseFloat(editWeight) || 0;
    const r = parseInt(editReps, 10) || 0;
    setSaving(true);
    try {
      await onUpdatePR(id, w, r, editNotes, editPbGroupId ? Number(editPbGroupId) : null);
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  };

  const pbNames = new Map(pbGroups.map((group) => [group.id, group.name]));
  const filtered = exercises.filter((ex) =>
    `${ex.name} ${ex.muscle_group} ${ex.pb_group_id ? pbNames.get(ex.pb_group_id) ?? "" : ""}`.toLowerCase().includes(search.toLowerCase())
  );

  const groups = [
    ...pbGroups.map((group) => ({
      key: String(group.id), label: group.name, emoji: group.emoji,
      items: filtered.filter((exercise) => exercise.pb_group_id === group.id),
    })),
    { key: "ungrouped", label: "Sin grupo PB", emoji: "📋", items: filtered.filter((exercise) => exercise.pb_group_id === null) },
  ].filter((group) => group.items.length > 0);

  const renderCard = (ex: Exercise) => {
    const isEditing = editingId === ex.id;
    const hasRecord = ex.current_weight > 0 && ex.current_reps > 0;
    const est1RM = hasRecord ? epley1RM(ex.current_weight, ex.current_reps) : 0;

    return (
      <article className="pb-card" key={ex.id}>
        <div className="pb-card-top">
          <h3 className="pb-card-name">{ex.name}</h3>
          {!isEditing && (
            <button
              className="icon-button-sm"
              title="Actualizar marca"
              aria-label={`Editar marca de ${ex.name}`}
              onClick={() => startEdit(ex)}
            >
              <Pencil size={13} />
            </button>
          )}
        </div>

        {isEditing ? (
          <div className="pb-edit-box">
            <div className="pb-edit-inputs">
              <label className="pb-edit-field">
                <span>PESO</span>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={editWeight}
                  onChange={(e) => setEditWeight(e.target.value)}
                  placeholder="0"
                  autoFocus
                />
              </label>
              <label className="pb-edit-field">
                <span>REPS</span>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={editReps}
                  onChange={(e) => setEditReps(e.target.value)}
                  placeholder="0"
                />
              </label>
            </div>
            <label className="pb-edit-field pb-group-field">
              <span>GRUPO PB</span>
              <select value={editPbGroupId} onChange={(event) => setEditPbGroupId(event.target.value)}>
                <option value="">Sin grupo PB</option>
                {pbGroups.map((group) => <option value={group.id} key={group.id}>{group.emoji} {group.name}</option>)}
              </select>
            </label>
            <label className="pb-edit-field pb-notes-field">
              <span>NOTAS</span>
              <input
                type="text"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="ej: kg/lado, fichas, tempo lento…"
              />
            </label>
            <div className="pb-edit-actions">
              <button className="button secondary" onClick={cancelEdit} disabled={saving}>
                Cancelar
              </button>
              <button
                className="button primary"
                onClick={() => void handleSave(ex.id)}
                disabled={saving}
              >
                <Check size={13} />
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        ) : (
          <div className="pb-stats-row">
            {hasRecord ? (
              <>
                <div className="pb-badges">
                  <div className="pb-badge pb-badge-weight">
                    <span className="pb-badge-label">PESO</span>
                    <span className="pb-badge-value">{formatKg(ex.current_weight)} <small>kg</small></span>
                  </div>
                  <div className="pb-badge pb-badge-reps">
                    <span className="pb-badge-label">REPS</span>
                    <span className="pb-badge-value">{ex.current_reps}</span>
                  </div>
                </div>
                <div className="pb-card-footer">
                  {ex.notes ? <span className="pb-note">📝 {ex.notes}</span> : null}
                  {est1RM > 0 && <span className="pb-1rm">1RM ~{formatKg(est1RM)} kg</span>}
                </div>
              </>
            ) : (
              <div className="pb-no-record">
                <span className="pb-empty">Sin marca registrada</span>
                <button className="text-button" onClick={() => startEdit(ex)}>+ Añadir</button>
              </div>
            )}
          </div>
        )}
      </article>
    );
  };

  return (
    <section className="pb-widget">
      <div className="pb-widget-head">
        <div>
          <span className="eyebrow">MARCAS ACTUALES / RÉCORDS PERSONALES</span>
          <h2>Cargas y repeticiones por ejercicio</h2>
          <p>Tus marcas vigentes. Pulsa en editar para actualizar tu nuevo récord cuando progreses en el gimnasio.</p>
        </div>
        <div className="pb-widget-tools">
          <label className="search">
            <Search size={15} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar ejercicio…" />
          </label>
          <button
            className={`icon-button ${managingGroups ? "primary" : ""}`}
            aria-label="Configurar grupos PB"
            aria-expanded={managingGroups}
            title="Configurar grupos PB"
            onClick={() => setManagingGroups((open) => !open)}
          ><Settings size={17} /></button>
        </div>
      </div>

      {managingGroups && <PbGroupManager groups={pbGroups} exercises={exercises} onRefresh={onRefresh} notify={notify} ask={ask} />}

      {groups.length === 0 && (
        <div className="empty-state">No hay ejercicios que coincidan con la búsqueda.</div>
      )}

      {groups.map(({ key, label, emoji, items }) => (
        <div className="pb-group" key={key}>
          <div className="pb-group-header">
            <span className="pb-group-emoji">{emoji}</span>
            <span className="pb-group-label">{label}</span>
            <span className="pb-group-count">{items.length}</span>
          </div>
          <div className="pb-grid">
            {items.map(renderCard)}
          </div>
        </div>
      ))}
    </section>
  );
}

function PbGroupManager({ groups, exercises, onRefresh, notify, ask }: {
  groups: PbGroup[];
  exercises: Exercise[];
  onRefresh: () => Promise<void>;
  notify: (text: string, kind?: ToastKind) => void;
  ask: (title: string, detail: string, action: () => Promise<void>) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("💪");
  const [busy, setBusy] = useState(false);
  const [expandedGroupId, setExpandedGroupId] = useState<number | null>(null);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      await onRefresh();
      notify(success, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo guardar el grupo PB", "error");
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const move = async (index: number, offset: -1 | 1) => {
    const next = [...groups];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    await run(() => api.reorderPbGroups(next.map((group) => group.id)), "Orden PB actualizado");
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!newName.trim()) return;
    try {
      await run(() => api.createPbGroup(newName.trim(), newEmoji), "Grupo PB añadido");
      setNewName("");
      setNewEmoji("💪");
    } catch { /* run already reports the API error */ }
  };

  return <div className="group-manager">
    <div className="group-manager-heading">
      <h3>Organizar grupos PB</h3>
      <p>Estos grupos solo organizan tus marcas personales; no cambian el grupo muscular de los ejercicios.</p>
    </div>
    <div className="group-manager-list">
      {groups.map((group, index) => <PbGroupEditorRow
        key={group.id}
        group={group}
        exercises={exercises}
        groups={groups}
        first={index === 0}
        last={index === groups.length - 1}
        busy={busy}
        expanded={expandedGroupId === group.id}
        onToggle={() => setExpandedGroupId((current) => current === group.id ? null : group.id)}
        onMove={(offset) => void move(index, offset).catch(() => undefined)}
        onSave={async (name, emoji) => { await run(() => api.updatePbGroup(group.id, { name, emoji }), "Grupo PB actualizado"); }}
        onAssign={async (exerciseId) => { await run(() => api.updateExercise(exerciseId, { pb_group_id: group.id }), "Ejercicio añadido al grupo PB"); }}
        onRemove={async (exerciseId) => { await run(() => api.updateExercise(exerciseId, { pb_group_id: null }), "Ejercicio quitado del grupo PB"); }}
        onDelete={() => ask(
          "¿Eliminar grupo PB?",
          `Los ejercicios de “${group.name}” quedarán en Sin grupo PB. Su grupo muscular no cambiará.`,
          async () => { await run(() => api.deletePbGroup(group.id), "Grupo PB eliminado"); }
        )}
      />)}
      {groups.length === 0 && <p className="group-manager-empty">Todavía no hay grupos PB.</p>}
    </div>
    <form className="group-add-form" onSubmit={(event) => void create(event)}>
      <input className="group-emoji-input" value={newEmoji} onChange={(event) => setNewEmoji(event.target.value)} aria-label="Emoji del nuevo grupo PB" maxLength={10} />
      <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Nombre, por ejemplo Push Day" aria-label="Nombre del nuevo grupo PB" maxLength={50} />
      <button className="button primary" disabled={busy || !newName.trim()}><Plus size={15} />Añadir grupo</button>
    </form>
  </div>;
}

function PbGroupEditorRow({ group, exercises, groups, first, last, busy, expanded, onToggle, onMove, onSave, onAssign, onRemove, onDelete }: {
  group: PbGroup;
  exercises: Exercise[];
  groups: PbGroup[];
  first: boolean;
  last: boolean;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  onMove: (offset: -1 | 1) => void;
  onSave: (name: string, emoji: string) => Promise<void>;
  onAssign: (exerciseId: number) => Promise<void>;
  onRemove: (exerciseId: number) => Promise<void>;
  onDelete: () => void;
}) {
  const [name, setName] = useState(group.name);
  const [emoji, setEmoji] = useState(group.emoji);
  const [exerciseId, setExerciseId] = useState("");
  const changed = name.trim() !== group.name || emoji.trim() !== group.emoji;
  const assigned = exercises.filter((exercise) => exercise.pb_group_id === group.id);
  const available = exercises.filter((exercise) => exercise.pb_group_id !== group.id);
  const groupNames = new Map(groups.map((item) => [item.id, item.name]));
  useEffect(() => { setName(group.name); setEmoji(group.emoji); }, [group.name, group.emoji]);

  const assign = async () => {
    if (!exerciseId) return;
    try {
      await onAssign(Number(exerciseId));
      setExerciseId("");
    } catch { /* parent reports the API error */ }
  };

  return <div className={`group-manager-item ${expanded ? "expanded" : ""}`}>
    <div className="group-manager-row">
      <div className="group-order-actions">
        <button className="icon-button-sm" type="button" disabled={busy || first} onClick={() => onMove(-1)} aria-label={`Subir ${group.name}`}><ArrowUp size={14} /></button>
        <button className="icon-button-sm" type="button" disabled={busy || last} onClick={() => onMove(1)} aria-label={`Bajar ${group.name}`}><ArrowDown size={14} /></button>
      </div>
      <input className="group-emoji-input" value={emoji} onChange={(event) => setEmoji(event.target.value)} aria-label={`Emoji de ${group.name}`} maxLength={10} />
      <input value={name} onChange={(event) => setName(event.target.value)} aria-label={`Nombre de ${group.name}`} maxLength={50} />
      <span className="group-manager-count" title={`${assigned.length} ejercicios`}>{assigned.length}</span>
      <button className={`icon-button-sm ${expanded ? "primary" : ""}`} type="button" disabled={busy} onClick={onToggle} aria-label={`Gestionar ejercicios de ${group.name}`} aria-expanded={expanded}><ListPlus size={14} /></button>
      <button className="icon-button-sm primary" type="button" disabled={busy || !changed || !name.trim()} onClick={() => void onSave(name.trim(), emoji.trim() || "💪").catch(() => undefined)} aria-label={`Guardar ${group.name}`}><Check size={14} /></button>
      <button className="icon-button-sm danger" type="button" disabled={busy} onClick={onDelete} aria-label={`Eliminar ${group.name}`}><Trash2 size={14} /></button>
    </div>
    {expanded && <div className="group-exercise-manager">
      <div className="group-exercise-list">
        {assigned.map((exercise) => <div className="group-exercise-chip" key={exercise.id}>
          <span>{exercise.name}<small>{exercise.muscle_group || "Sin grupo muscular"}</small></span>
          <button type="button" disabled={busy} onClick={() => void onRemove(exercise.id).catch(() => undefined)} aria-label={`Quitar ${exercise.name} de ${group.name}`} title="Quitar del grupo PB"><X size={13} /></button>
        </div>)}
        {assigned.length === 0 && <span className="group-exercise-empty">No hay ejercicios en este grupo PB.</span>}
      </div>
      <div className="group-exercise-add">
        <select value={exerciseId} onChange={(event) => setExerciseId(event.target.value)} aria-label={`Añadir ejercicio a ${group.name}`}>
          <option value="">Añadir o mover ejercicio…</option>
          {available.map((exercise) => <option value={exercise.id} key={exercise.id}>
            {exercise.name} · {exercise.pb_group_id ? groupNames.get(exercise.pb_group_id) ?? "Otro grupo PB" : "Sin grupo PB"}
          </option>)}
        </select>
        <button className="button secondary" type="button" disabled={busy || !exerciseId} onClick={() => void assign()}><Plus size={14} />Añadir</button>
      </div>
    </div>}
  </div>;
}

function TrainView({ exercises, pbGroups, routines, activeSession, onStart, onCreateExercise, onUpdateExercisePR, onDeleteExercise, onRefresh, onSetActive, onRefreshSession, onAddSet, onDeleteSet, notify, ask }: {
  exercises: Exercise[]; pbGroups: PbGroup[]; routines: Routine[]; activeSession: WorkoutSession | null; onStart: (data: { name?: string; routine_id?: number }) => Promise<void>; onCreateExercise: (name: string, muscle: string) => Promise<void>; onUpdateExercisePR: (id: number, current_weight: number, current_reps: number, notes: string, pbGroupId: number | null) => Promise<void>; onDeleteExercise: (id: number) => Promise<void>; onRefresh: () => Promise<void>; onSetActive: (session: WorkoutSession | null) => void; onRefreshSession: (id: number) => Promise<WorkoutSession>; onAddSet: (exercise: SessionExercise, weight: number, reps: number) => Promise<void>; onDeleteSet: (exercise: SessionExercise, id: number) => Promise<void>; notify: (text: string, kind?: ToastKind) => void; ask: (title: string, detail: string, action: () => Promise<void>) => void;
}) {
  const [name, setName] = useState(""); const [routineId, setRoutineId] = useState(""); const [addExerciseId, setAddExerciseId] = useState("");
  const [newName, setNewName] = useState(""); const [newMuscle, setNewMuscle] = useState("");
  const start = async (fromRoutine: boolean) => { await onStart({ name, ...(fromRoutine && routineId ? { routine_id: Number(routineId) } : {}) }); setName(""); };
  return <PageTitle eyebrow="MÓDULO DE ENTRENAMIENTO" title="Sesión de fuerza" description="Registro rápido de carga, repeticiones y notas de entrenamiento." actions={null}>
    <PersonalBestsWidget exercises={exercises} pbGroups={pbGroups} onUpdatePR={onUpdateExercisePR} onRefresh={onRefresh} notify={notify} ask={ask} />
    {!activeSession ? <section className="panel start-panel"><div><span className="eyebrow">NUEVA SESIÓN</span><h2>Empieza a registrar tu entrenamiento</h2><p>Elige una rutina o inicia una sesión libre.</p></div><div className="start-controls"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre opcional" /><select value={routineId} onChange={(event) => setRoutineId(event.target.value)}><option value="">Selecciona una rutina</option>{routines.map((routine) => <option value={routine.id} key={routine.id}>{routine.name}</option>)}</select><button className="button secondary" onClick={() => void start(false)}>Sesión libre</button><button className="button primary" disabled={!routineId} onClick={() => void start(true)}><Dumbbell size={16} />Desde rutina</button></div></section> : <ActiveSession session={activeSession} exercises={exercises} close={() => onSetActive(null)} onRefresh={onRefreshSession} onAddSet={onAddSet} onDeleteSet={onDeleteSet} notify={notify} ask={ask} />}
    <div className="split-grid"><section className="panel"><div className="section-heading"><div><h2>Catálogo de ejercicios</h2><p>{exercises.length} disponibles en tu base local.</p></div></div><form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (!newName.trim()) return; void onCreateExercise(newName.trim(), newMuscle).then(() => { setNewName(""); setNewMuscle(""); }).catch((error: unknown) => notify(error instanceof Error ? error.message : "No se pudo crear el ejercicio", "error")); }}><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Nombre del ejercicio" aria-label="Nombre del ejercicio" /><select value={newMuscle} onChange={(event) => setNewMuscle(event.target.value)} aria-label="Grupo muscular"><option value="">Sin especificar</option><option value="Pecho">Pecho</option><option value="Espalda">Espalda</option><option value="Hombro">Hombro</option><option value="Brazo">Brazo</option><option value="Pierna">Pierna</option><option value="Core">Core</option><option value="Cuerpo completo">Cuerpo completo</option><option value="Cardio">Cardio</option><option value="Otro">Otro</option></select><button className="icon-button primary" aria-label="Crear ejercicio"><Plus size={17} /></button></form><div className="exercise-chips">{exercises.map((exercise) => <div className="exercise-chip" key={exercise.id}><span>{exercise.name}<small>{exercise.muscle_group || "General"}</small></span><button className="chip-delete" aria-label={`Eliminar ${exercise.name}`} onClick={() => ask("¿Eliminar ejercicio?", `Se eliminará “${exercise.name}” del catálogo. Solo se permite si aún no se ha usado en una rutina o sesión.`, async () => onDeleteExercise(exercise.id))}><Trash2 size={13} /></button></div>)}</div></section>
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

function RoutinesView({ exercises, routines, selected, onSelect, onCreate, onUpdate, onDelete, onReload, onStart, ask, notify }: {
  exercises: Exercise[]; routines: Routine[]; selected: Routine | null; onSelect: (id: number) => void;
  onCreate: (name: string, description: string) => Promise<void>; onUpdate: (id: number, name: string, description: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>; onReload: () => Promise<void>; onStart: (data: { routine_id?: number }) => Promise<void>;
  ask: (title: string, detail: string, action: () => Promise<void>) => void; notify: (text: string, kind?: ToastKind) => void;
}) {
  const [modalState, setModalState] = useState<{ mode: "create" } | { mode: "edit"; routine: Routine } | null>(null);
  const [exerciseId, setExerciseId] = useState(""); const [sets, setSets] = useState("3"); const [reps, setReps] = useState("10"); const [weight, setWeight] = useState("0"); const [query, setQuery] = useState("");
  const [editingTarget, setEditingTarget] = useState<{ id: number; sets: string; reps: string; weight: string } | null>(null);

  const visibleExercises = exercises.filter((exercise) => `${exercise.name} ${exercise.muscle_group}`.toLowerCase().includes(query.toLowerCase()));
  const addExercise = async () => {
    if (!selected || !exerciseId) return;
    try {
      await api.addRoutineExercise(selected.id, { exercise_id: Number(exerciseId), target_sets: Number(sets) || 3, target_reps: Number(reps) || 10, target_weight: Number(weight) || 0 });
      await onReload(); notify("Ejercicio añadido a la rutina", "success");
    } catch { notify("No se pudo añadir el ejercicio", "error"); }
  };

  const saveTarget = async (linkId: number) => {
    if (!selected || !editingTarget) return;
    try {
      await api.updateRoutineExercise(selected.id, linkId, {
        target_sets: Number(editingTarget.sets) || 1, target_reps: Number(editingTarget.reps) || 1, target_weight: Number(editingTarget.weight) || 0
      });
      await onReload(); setEditingTarget(null); notify("Objetivo actualizado", "success");
    } catch { notify("No se pudo actualizar el objetivo", "error"); }
  };

  const confirmDeleteRoutine = (routine: Routine) => {
    ask("¿Eliminar rutina?", `Se borrará la plantilla “${routine.name}” y sus ejercicios planificados. Las sesiones históricas ya registradas no se perderán.`, async () => {
      await onDelete(routine.id);
    });
  };

  return <PageTitle eyebrow="MÓDULO DE PLANIFICACIÓN" title="Gestión de rutinas y ejercicios" description="Define plantillas reutilizables para tus sesiones de fuerza." actions={<button className="button primary" onClick={() => setModalState({ mode: "create" })}><Plus size={16} />Nueva rutina</button>}>
    {modalState?.mode === "create" && <RoutineForm title="Nueva rutina" submitLabel="Crear rutina" onClose={() => setModalState(null)} onSubmit={async (name, description) => { await onCreate(name, description); setModalState(null); }} />}
    {modalState?.mode === "edit" && <RoutineForm title="Modificar rutina" submitLabel="Guardar cambios" initialName={modalState.routine.name} initialDescription={modalState.routine.description} onClose={() => setModalState(null)} onSubmit={async (name, description) => { await onUpdate(modalState.routine.id, name, description); setModalState(null); }} />}

    <section><div className="list-label">RUTINAS ACTIVAS</div><div className="routine-grid">{routines.map((routine) => <div className={selected?.id === routine.id ? "routine-tile selected" : "routine-tile"} onClick={() => onSelect(routine.id)} key={routine.id} role="button" tabIndex={0}><div className="routine-tile-top"><span className="mono">{routine.exercises.length} MOVS</span><div className="routine-tile-actions" onClick={(e) => e.stopPropagation()}><button className="icon-button-sm" title="Modificar rutina" aria-label={`Modificar ${routine.name}`} onClick={() => { onSelect(routine.id); setModalState({ mode: "edit", routine }); }}><Pencil size={13} /></button><button className="icon-button-sm danger" title="Eliminar rutina" aria-label={`Eliminar ${routine.name}`} onClick={() => confirmDeleteRoutine(routine)}><Trash2 size={13} /></button></div></div><h3>{routine.name}</h3><p>{routine.description || "Sin descripción"}</p><b>{routine.exercises.reduce((total, exercise) => total + exercise.target_sets, 0)} series objetivo</b></div>)}{!routines.length && <div className="empty-state">Crea tu primera rutina para empezar.</div>}</div></section>
    {selected && <div className="routine-layout"><section className="panel routine-detail"><div className="section-heading"><div><span className="eyebrow">RUTINA SELECCIONADA</span><h2>{selected.name}</h2><p>{selected.description || "Sin notas de preparación."}</p></div><div className="action-cluster"><button className="button primary" onClick={() => void onStart({ routine_id: selected.id })}><Dumbbell size={16} />Entrenar</button><button className="button secondary" onClick={() => setModalState({ mode: "edit", routine: selected })}><Pencil size={15} />Modificar</button><button className="button danger-button" aria-label="Eliminar rutina" onClick={() => confirmDeleteRoutine(selected)}><Trash2 size={15} />Eliminar</button></div></div><div className="routine-summary"><Metric label="EJERCICIOS" value={String(selected.exercises.length)} /><Metric label="TOTAL SERIES" value={String(selected.exercises.reduce((total, exercise) => total + exercise.target_sets, 0))} /><Metric label="CARGA OBJETIVO" value={`${formatKg(selected.exercises.reduce((total, exercise) => total + exercise.target_sets * exercise.target_reps * exercise.target_weight, 0))} kg`} /></div>
      <div className="routine-exercises">{selected.exercises.map((exercise, index) => {
        const isEditing = editingTarget?.id === exercise.id;
        return <article className="planned-exercise" key={exercise.id}><div className="position">{index + 1}</div><div className="planned-main"><h3>{exercise.exercise_name}</h3><span>{exercise.muscle_group || "General"}</span></div>
          {isEditing ? <div className="planned-edit-form">
            <label><span>Series</span><input type="number" min="1" value={editingTarget.sets} onChange={(e) => setEditingTarget({ ...editingTarget, sets: e.target.value })} aria-label="Series objetivo" /></label>
            <label><span>Reps</span><input type="number" min="1" value={editingTarget.reps} onChange={(e) => setEditingTarget({ ...editingTarget, reps: e.target.value })} aria-label="Repeticiones objetivo" /></label>
            <label><span>Carga kg</span><input type="number" min="0" step="0.5" value={editingTarget.weight} onChange={(e) => setEditingTarget({ ...editingTarget, weight: e.target.value })} aria-label="Carga objetivo en kilogramos" /></label>
            <div className="planned-edit-actions"><button className="icon-button-sm primary" title="Guardar objetivo" onClick={() => void saveTarget(exercise.id)}><Check size={14} /></button><button className="icon-button-sm" title="Cancelar" onClick={() => setEditingTarget(null)}><X size={14} /></button></div>
          </div> : <>
            <div className="planned-data"><span>SERIES<b>{exercise.target_sets}</b></span><span>REPS<b>{exercise.target_reps}</b></span><span>CARGA<b>{formatKg(exercise.target_weight)} kg</b></span></div>
            <div className="planned-actions">
              <button className="row-action" aria-label="Modificar objetivo" title="Modificar objetivo" onClick={() => setEditingTarget({ id: exercise.id, sets: String(exercise.target_sets), reps: String(exercise.target_reps), weight: String(exercise.target_weight) })}><Pencil size={14} /></button>
              <button className="row-action" aria-label="Quitar de rutina" title="Quitar de rutina" onClick={() => void api.removeRoutineExercise(selected.id, exercise.id).then(onReload).catch(() => notify("No se pudo quitar el ejercicio", "error"))}><X size={16} /></button>
            </div>
          </>}
        </article>;
      })}</div>
      <div className="add-routine-exercise"><label className="routine-field routine-exercise-picker"><span>Ejercicio</span><select value={exerciseId} onChange={(event) => setExerciseId(event.target.value)}><option value="">Selecciona un ejercicio</option>{exercises.map((exercise) => <option value={exercise.id} key={exercise.id}>{exercise.name}</option>)}</select></label><label className="routine-field"><span>Series</span><input type="number" min="1" value={sets} onChange={(event) => setSets(event.target.value)} aria-label="Series objetivo" /></label><label className="routine-field"><span>Repeticiones</span><input type="number" min="1" value={reps} onChange={(event) => setReps(event.target.value)} aria-label="Repeticiones objetivo" /></label><label className="routine-field"><span>Carga (kg)</span><input type="number" min="0" step=".5" value={weight} onChange={(event) => setWeight(event.target.value)} aria-label="Carga objetivo en kilogramos" /></label><button className="button secondary" onClick={() => void addExercise()}><CirclePlus size={16} />Añadir</button></div></section>
      <aside className="panel exercise-library"><div className="section-heading"><div><h2>Biblioteca de ejercicios</h2><p>{exercises.length} disponibles</p></div></div><label className="search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar ejercicio o músculo…" /></label><div className="library-list">{visibleExercises.map((exercise) => <button key={exercise.id} onClick={() => setExerciseId(String(exercise.id))} className={exerciseId === String(exercise.id) ? "library-item chosen" : "library-item"}><Dumbbell size={16} /><span><b>{exercise.name}</b><small>{exercise.muscle_group || "General"}</small></span><Plus size={16} /></button>)}</div></aside></div>}
  </PageTitle>;
}

function RoutineForm({ title, submitLabel, initialName = "", initialDescription = "", onClose, onSubmit }: {
  title: string; submitLabel: string; initialName?: string; initialDescription?: string; onClose: () => void; onSubmit: (name: string, description: string) => Promise<void>;
}) {
  const [name, setName] = useState(initialName); const [description, setDescription] = useState(initialDescription);
  return <div className="modal-backdrop"><form className="dialog" onSubmit={(event) => { event.preventDefault(); if (name.trim()) void onSubmit(name.trim(), description.trim()); }}><div className="dialog-head"><h2>{title}</h2><button type="button" className="icon-button" onClick={onClose}><X size={17} /></button></div><label>Nombre<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Torso hipertrofia" /></label><label>Descripción<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Objetivo de la rutina" /></label><div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary">{submitLabel}</button></div></form></div>;
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
function ConfirmDialog({ confirm, close, notify }: { confirm: Exclude<ConfirmState, null>; close: () => void; notify: (text: string, kind?: ToastKind) => void }) { const [working, setWorking] = useState(false); const proceed = async () => { setWorking(true); try { await confirm.action(); notify("Cambios guardados", "success"); close(); } catch (error) { notify(error instanceof Error ? error.message : "No se pudo completar la acción", "error"); setWorking(false); } }; return <div className="modal-backdrop"><div className="dialog"><h2>{confirm.title}</h2><p>{confirm.detail}</p><div className="dialog-actions"><button className="button secondary" onClick={close}>Cancelar</button><button className="button danger-button" disabled={working} onClick={() => void proceed()}>{working ? "Eliminando…" : "Confirmar"}</button></div></div></div>; }

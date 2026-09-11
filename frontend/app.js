/* LightWeight frontend — vanilla JS */
const API = "";
const $ = (id) => document.getElementById(id);
let exercises = [], routines = [], sessions = [];
let activeSessionId = null;
let chartMax = null, chartVol = null;

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---------- tabs (bottom nav app-nativa) ----------
function setActiveTab(btn) {
  document.querySelectorAll(".tab-btn").forEach((x) =>
    x.setAttribute("aria-selected", x === btn ? "true" : "false")
  );
  ["entrenar", "rutinas", "historial", "progreso"].forEach((t) =>
    $("tab-" + t).classList.toggle("hidden", t !== btn.dataset.tab)
  );
  if (btn.dataset.tab === "historial") loadHistory();
  if (btn.dataset.tab === "progreso") loadProgress();
  if (btn.dataset.tab === "rutinas") loadRoutines();
}
document.querySelectorAll(".tab-btn").forEach((b) =>
  b.addEventListener("click", () => setActiveTab(b))
);

// ---------- init ----------
(async function init() {
  try {
    await refreshAll();
    $("status").textContent = "● API conectada";
    $("status").className = "text-xs px-3 py-1 rounded-full bg-lime-400/15 text-lime-300";
  } catch (e) {
    $("status").textContent = "○ sin conexión — arranca uvicorn";
    $("status").className = "text-xs px-3 py-1 rounded-full bg-red-500/15 text-red-300";
    console.error(e);
  }
})();

async function refreshAll() {
  exercises = await api("/api/exercises");
  routines = await api("/api/routines");
  renderExercises();
  renderRoutineSelects();
  renderProgressSelect();
}

// ---------- ejercicios ----------
function renderExercises() {
  $("exerciseList").innerHTML = exercises
    .map((e) => `<span class="text-xs bg-zinc-800 rounded-full px-3 py-1">${e.name} <span class="text-zinc-500">· ${e.muscle_group || "—"}</span></span>`)
    .join("") || `<p class="text-sm text-zinc-500">Sin ejercicios.</p>`;
  $("addExSelect").innerHTML = exercises.map((e) => `<option value="${e.id}">${e.name}</option>`).join("");
}

async function createExercise() {
  const name = $("newExName").value.trim();
  if (!name) return alert("Ponle nombre al ejercicio");
  await api("/api/exercises", { method: "POST", body: JSON.stringify({ name, muscle_group: $("newExMuscle").value.trim() }) });
  $("newExName").value = ""; $("newExMuscle").value = "";
  await refreshAll();
}

// ---------- rutinas ----------
async function loadRoutines() {
  routines = await api("/api/routines");
  renderRoutineSelects();
}

function renderRoutineSelects() {
  $("routineSelect").innerHTML = routines.map((r) => `<option value="${r.id}">${r.name} (${r.exercises.length} ej.)</option>`).join("") || `<option value="">Sin rutinas</option>`;
  renderRoutineList();
}

function renderRoutineList() {
  $("routineList").innerHTML = routines.map((r) => `
    <div class="bg-zinc-900 rounded-2xl p-4">
      <div class="flex items-center justify-between">
        <div><h3 class="font-bold">${r.name}</h3><p class="text-xs text-zinc-400">${r.description || ""}</p></div>
        <div class="flex gap-2">
          <button onclick="startSessionFromRoutine(${r.id})" class="text-xs bg-lime-400 text-black font-bold rounded-lg px-3 py-1">▶ Entrenar</button>
          <button onclick="deleteRoutine(${r.id})" class="text-xs bg-zinc-800 rounded-lg px-3 py-1">✕</button>
        </div>
      </div>
      <table class="w-full text-sm mt-3">
        <thead><tr class="text-zinc-500 text-xs text-left"><th>Ejercicio</th><th>Series</th><th>Reps</th><th>Kg</th><th></th></tr></thead>
        <tbody>${r.exercises.map((e) => `<tr class="border-t border-zinc-800"><td class="py-1">${e.exercise_name}</td><td>${e.target_sets}</td><td>${e.target_reps}</td><td>${e.target_weight}</td><td class="text-right"><button onclick="removeRoutineEx(${r.id},${e.id})" class="text-zinc-500">✕</button></td></tr>`).join("") || `<tr><td colspan="5" class="text-zinc-500 text-xs py-2">Sin ejercicios. Añade abajo.</td></tr>`}</tbody>
      </table>
      <div class="flex gap-2 mt-3">
        <select id="rex-${r.id}" class="flex-1 bg-zinc-800 rounded-lg px-2 py-1 text-sm">${exercises.map((e) => `<option value="${e.id}">${e.name}</option>`).join("")}</select>
        <input id="rs-${r.id}" type="number" value="3" min="1" class="w-14 bg-zinc-800 rounded-lg px-2 py-1 text-sm" title="series" />
        <input id="rr-${r.id}" type="number" value="10" min="1" class="w-14 bg-zinc-800 rounded-lg px-2 py-1 text-sm" title="reps" />
        <input id="rw-${r.id}" type="number" value="0" step="0.5" class="w-16 bg-zinc-800 rounded-lg px-2 py-1 text-sm" title="kg" />
        <button onclick="addRoutineEx(${r.id})" class="bg-zinc-700 rounded-lg px-3 text-sm font-bold">＋</button>
      </div>
    </div>`).join("") || `<p class="text-zinc-500 text-sm">Crea tu primera rutina arriba.</p>`;
}

async function createRoutine() {
  const name = $("newRoutineName").value.trim();
  if (!name) return alert("Ponle nombre a la rutina");
  await api("/api/routines", { method: "POST", body: JSON.stringify({ name, description: $("newRoutineDesc").value }) });
  $("newRoutineName").value = ""; $("newRoutineDesc").value = "";
  routines = await api("/api/routines");
  renderRoutineSelects();
}

async function deleteRoutine(id) {
  if (!confirm("¿Eliminar rutina?")) return;
  await api(`/api/routines/${id}`, { method: "DELETE" });
  routines = await api("/api/routines");
  renderRoutineSelects();
}

async function addRoutineEx(routineId) {
  const exercise_id = Number($(`rex-${routineId}`).value);
  await api(`/api/routines/${routineId}/exercises`, { method: "POST", body: JSON.stringify({
    exercise_id, target_sets: Number($(`rs-${routineId}`).value) || 3,
    target_reps: Number($(`rr-${routineId}`).value) || 10,
    target_weight: Number($(`rw-${routineId}`).value) || 0,
  })});
  routines = await api("/api/routines");
  renderRoutineSelects();
}

async function removeRoutineEx(routineId, linkId) {
  await api(`/api/routines/${routineId}/exercises/${linkId}`, { method: "DELETE" });
  routines = await api("/api/routines");
  renderRoutineSelects();
}

// ---------- sesiones ----------
async function startSession(useRoutine) {
  const body = { name: $("sessionName").value.trim(), notes: "" };
  if (useRoutine) {
    if (!routines.length) return alert("Crea primero una rutina");
    body.routine_id = Number($("routineSelect").value);
  }
  const s = await api("/api/sessions", { method: "POST", body: JSON.stringify(body) });
  openSession(s.id);
}

async function startSessionFromRoutine(id) {
  const s = await api("/api/sessions", { method: "POST", body: JSON.stringify({ routine_id: id }) });
  document.querySelector('[data-tab="entrenar"]').click();
  openSession(s.id);
}

async function openSession(id) {
  activeSessionId = id;
  const s = await api(`/api/sessions/${id}`);
  $("activeSession").classList.remove("hidden");
  $("activeName").textContent = `${s.name}`;
  $("activeMeta").textContent = `${new Date(s.date).toLocaleString()} · ${s.routine_name || "libre"} · vol: ${s.total_volume} kg`;
  $("activeNotes").value = s.notes || "";
  $("activeExercises").innerHTML = s.exercises.map((se) => `
    <div class="bg-zinc-800/60 rounded-xl p-3">
      <div class="flex items-center justify-between gap-2">
        <strong class="text-sm">${se.exercise_name}</strong>
        <button onclick="removeSessionEx(${se.id})" class="text-xs text-zinc-400">quitar ✕</button>
      </div>
      <input value="${(se.notes || "").replace(/"/g, "&quot;")}" onblur="saveExNotes(${se.id}, this.value)" placeholder="Nota del ejercicio…" class="w-full mt-1 bg-zinc-800 rounded-lg px-2 py-1 text-xs" />
      <table class="w-full text-sm mt-2">
        <thead><tr class="text-zinc-500 text-xs text-left"><th>#</th><th>Kg</th><th>Reps</th><th>Vol</th><th></th></tr></thead>
        <tbody>${se.sets.map((t) => `<tr class="border-t border-zinc-700/50"><td>${t.set_number}</td><td>${t.weight}</td><td>${t.reps}</td><td class="text-zinc-400">${t.volume}</td><td class="text-right"><button onclick="deleteSet(${t.id})" class="text-zinc-500">✕</button></td></tr>`).join("")}</tbody>
      </table>
      <div class="flex gap-2 mt-2">
        <input id="w-${se.id}" type="number" step="0.5" min="0" placeholder="kg" class="w-20 bg-zinc-800 rounded-lg px-2 py-1 text-sm" />
        <input id="r-${se.id}" type="number" min="0" placeholder="reps" class="w-20 bg-zinc-800 rounded-lg px-2 py-1 text-sm" />
        <button onclick="addSet(${se.id})" class="flex-1 bg-lime-400 text-black text-sm font-bold rounded-lg">＋ Serie</button>
      </div>
    </div>`).join("") || `<p class="text-sm text-zinc-500">Sesión vacía. Añade ejercicios abajo.</p>`;
  $("activeSession").scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeSession() { activeSessionId = null; $("activeSession").classList.add("hidden"); loadHistory(); }

async function saveSessionNotes() {
  if (!activeSessionId) return;
  await api(`/api/sessions/${activeSessionId}`, { method: "PATCH", body: JSON.stringify({ notes: $("activeNotes").value }) });
  alert("Nota guardada");
}

async function saveExNotes(linkId, notes) {
  await api(`/api/session-exercises/${linkId}`, { method: "PATCH", body: JSON.stringify({ notes }) });
}

async function addExerciseToSession() {
  if (!activeSessionId) return alert("Inicia una sesión primero");
  await api(`/api/sessions/${activeSessionId}/exercises`, { method: "POST", body: JSON.stringify({ exercise_id: Number($("addExSelect").value) }) });
  openSession(activeSessionId);
}

async function removeSessionEx(linkId) {
  await api(`/api/session-exercises/${linkId}`, { method: "DELETE" });
  openSession(activeSessionId);
}

async function addSet(linkId) {
  const weight = Number($(`w-${linkId}`).value || 0);
  const reps = Number($(`r-${linkId}`).value || 0);
  await api(`/api/session-exercises/${linkId}/sets`, { method: "POST", body: JSON.stringify({ weight, reps }) });
  openSession(activeSessionId);
}

async function deleteSet(setId) {
  await api(`/api/sets/${setId}`, { method: "DELETE" });
  openSession(activeSessionId);
}

// ---------- historial ----------
async function loadHistory() {
  sessions = await api("/api/sessions?limit=20");
  $("historyList").innerHTML = sessions.map((s) => `
    <div class="bg-zinc-800/60 rounded-xl p-3">
      <div class="flex items-center justify-between">
        <div><strong class="text-sm">${s.name}</strong><p class="text-xs text-zinc-400">${new Date(s.date).toLocaleString()} · ${s.routine_name || "libre"} · vol total: <b class="text-lime-300">${s.total_volume} kg</b></p></div>
        <button onclick="deleteSession(${s.id})" class="text-xs text-zinc-500">✕</button>
      </div>
      ${s.notes ? `<p class="text-xs text-zinc-300 mt-1 italic">📝 ${s.notes}</p>` : ""}
      <div class="mt-2 space-y-1">${s.exercises.map((se) => `
        <div class="text-xs"><span class="font-semibold">${se.exercise_name}</span>
        <span class="text-zinc-400">${se.sets.map((t) => `${t.weight}×${t.reps}`).join(" · ")}</span>
        ${se.notes ? `<span class="text-zinc-500 italic"> (${se.notes})</span>` : ""}</div>`).join("")}
      </div>
    </div>`).join("") || `<p class="text-sm text-zinc-500">Sin sesiones todavía.</p>`;
}

async function deleteSession(id) {
  if (!confirm("¿Eliminar sesión?")) return;
  await api(`/api/sessions/${id}`, { method: "DELETE" });
  loadHistory();
}

// ---------- progreso ----------
function renderProgressSelect() {
  $("progressSelect").innerHTML = exercises.map((e) => `<option value="${e.id}">${e.name}</option>`).join("");
}

async function loadProgress() {
  const id = $("progressSelect").value;
  if (!id) return;
  const [data, last] = await Promise.all([api(`/api/progress/${id}`), api(`/api/last/${id}`)]);
  $("lastTime").innerHTML = last.found
    ? `<b>Última vez:</b> ${last.sets.map((s) => `${s.weight}kg × ${s.reps}`).join(" · ")}${last.notes ? ` <span class="italic">(${last.notes})</span>` : ""}`
    : `Sin registros para este ejercicio.`;
  const labels = data.map((p) => new Date(p.date).toLocaleDateString());
  if (chartMax) chartMax.destroy();
  if (chartVol) chartVol.destroy();
  chartMax = new Chart($("chartMax"), { type: "line", data: { labels, datasets: [
    { label: "Peso máx (kg)", data: data.map((p) => p.max_weight), borderColor: "#a3e635", tension: 0.3 },
    { label: "1RM est. (kg)", data: data.map((p) => p.best_1rm), borderColor: "#22d3ee", borderDash: [5, 5], tension: 0.3 },
  ]}, options: { plugins: { legend: { labels: { color: "#e4e4e7" } } }, scales: { x: { ticks: { color: "#a1a1aa" } }, y: { ticks: { color: "#a1a1aa" } } } } });
  chartVol = new Chart($("chartVol"), { type: "bar", data: { labels, datasets: [
    { label: "Volumen (kg)", data: data.map((p) => p.total_volume), backgroundColor: "#a3e63599" },
  ]}, options: { plugins: { legend: { labels: { color: "#e4e4e7" } } }, scales: { x: { ticks: { color: "#a1a1aa" } }, y: { ticks: { color: "#a1a1aa" } } } } });
}

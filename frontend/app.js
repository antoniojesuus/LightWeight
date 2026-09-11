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

// ---------- haptics (navigator.vibrate, no-op si no soportado) ----------
const haptic = {
  light() { try { navigator.vibrate?.(10); } catch (e) { /* sin hápticos */ } },
  medium() { try { navigator.vibrate?.(20); } catch (e) { /* sin hápticos */ } },
  success() { try { navigator.vibrate?.([10, 40, 10]); } catch (e) { /* sin hápticos */ } },
  error() { try { navigator.vibrate?.([40, 40, 40]); } catch (e) { /* sin hápticos */ } },
};

// ---------- bottom sheet (sustituye alert/confirm) ----------
let _sheetResolve = null;

function openSheet({ title = "", html = "", actions = [{ label: "Entendido" }] }) {
  const sheet = $("sheet");
  $("sheetTitle").textContent = title;
  $("sheetBody").innerHTML = html;
  const box = $("sheetActions");
  box.innerHTML = "";
  actions.forEach((a) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = a.label;
    b.className =
      a.kind === "danger"
        ? "flex-1 min-h-[44px] bg-red-600 font-bold rounded-xl px-3 py-2"
        : a.kind === "primary"
          ? "flex-1 min-h-[44px] bg-lime-400 text-black font-bold rounded-xl px-3 py-2"
          : "flex-1 min-h-[44px] bg-zinc-800 font-semibold rounded-xl px-3 py-2";
    b.addEventListener("click", () => {
      const val = a.value;
      if (a.keepOpen !== true) closeSheet(val);
      if (typeof a.onClick === "function") a.onClick(val);
    });
    box.appendChild(b);
  });
  sheet.classList.remove("hidden");
  // fuerza reflow para que la transición funcione
  void sheet.offsetWidth;
  sheet.classList.add("open");
  const first = box.querySelector("button");
  if (first) first.focus();
}

function closeSheet(value) {
  const sheet = $("sheet");
  if (sheet.classList.contains("hidden")) return;
  sheet.classList.remove("open");
  // espera a la transición (o la omite con reduced-motion)
  const done = () => {
    sheet.classList.add("hidden");
    if (_sheetResolve) {
      const r = _sheetResolve;
      _sheetResolve = null;
      r(value);
    }
  };
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) done();
  else setTimeout(done, 180);
}

/** Mensaje informativo (validaciones, avisos). */
function messageSheet(title, message) {
  openSheet({ title, html: `<p>${message}</p>`, actions: [{ label: "Entendido", kind: "primary" }] });
}

/** Confirmación que resuelve true/false. */
function confirmSheet({ title = "Confirmar", message = "", confirmLabel = "Eliminar", danger = true } = {}) {
  return new Promise((resolve) => {
    _sheetResolve = (v) => resolve(v === true);
    openSheet({
      title,
      html: `<p>${message}</p>`,
      actions: [
        { label: "Cancelar", value: false },
        { label: confirmLabel, value: true, kind: danger ? "danger" : "primary" },
      ],
    });
  });
}

$("sheetClose").addEventListener("click", () => closeSheet(false));
$("sheetBackdrop").addEventListener("click", () => closeSheet(false));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("sheet").classList.contains("hidden")) closeSheet(false);
});

// ---------- toasts (feedback no bloqueante, auto-dismiss 3s) ----------
function toast(msg, type = "info") {
  const box = $("toasts");
  if (!box) return;
  const styles = {
    success: "bg-lime-400/15 text-lime-300 border-lime-400/30",
    error: "bg-red-500/15 text-red-300 border-red-500/30",
    info: "bg-zinc-800/95 text-zinc-200 border-zinc-700",
  };
  const icons = { success: "✓", error: "⚠", info: "ℹ" };
  const el = document.createElement("div");
  el.className = `toast pointer-events-auto max-w-md w-full sm:w-auto px-4 py-2.5 rounded-xl border text-sm font-medium shadow-2xl ${styles[type] || styles.info}`;
  el.textContent = `${icons[type] || icons.info} ${msg}`;
  el.addEventListener("click", dismiss);
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  // doble rAF para que la transición de entrada funcione
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("toast-in")));
  const timer = setTimeout(dismiss, 3000);
  function dismiss() {
    clearTimeout(timer);
    el.classList.remove("toast-in");
    setTimeout(() => el.remove(), 200);
  }
}

// ---------- skeletons (solo primera carga; re-visitas reusan contenido) ----------
let routLoaded = false, histLoaded = false;
function skeletonCards(n = 3) {
  return Array.from({ length: n }, () => `<div class="bg-zinc-800/60 rounded-xl p-3 space-y-2"><div class="h-4 w-2/3 bg-zinc-800 rounded animate-pulse"></div><div class="h-3 w-full bg-zinc-800 rounded animate-pulse"></div><div class="h-3 w-1/2 bg-zinc-800 rounded animate-pulse"></div></div>`).join("");
}

// ---------- tabs (bottom nav app-nativa) ----------
function setActiveTab(btn) {
  document.querySelectorAll(".tab-btn").forEach((x) =>
    x.setAttribute("aria-selected", x === btn ? "true" : "false")
  );
  ["entrenar", "rutinas", "historial", "progreso"].forEach((t) =>
    $("tab-" + t).classList.toggle("hidden", t !== btn.dataset.tab)
  );
  const tabErr = () => toast("Sin conexión", "error");
  if (btn.dataset.tab === "historial") loadHistory().catch(tabErr);
  if (btn.dataset.tab === "progreso") loadProgress().catch(tabErr);
  if (btn.dataset.tab === "rutinas") loadRoutines().catch(tabErr);
}
document.querySelectorAll(".tab-btn").forEach((b) =>
  b.addEventListener("click", () => {
    haptic.light();
    setActiveTab(b);
  })
);

// ---------- pull-to-refresh (arrastra desde arriba con scroll a 0) ----------
function currentTab() {
  const b = document.querySelector('.tab-btn[aria-selected="true"]');
  return b ? b.dataset.tab : "entrenar";
}

async function refreshCurrentTab() {
  const t = currentTab();
  if (t === "historial") await loadHistory();
  else if (t === "rutinas") await loadRoutines();
  else if (t === "progreso") await loadProgress();
  else await refreshAll(); // entrenar: catálogo + rutinas + progreso
}

(function initPullToRefresh() {
  const THRESHOLD = 70;
  let startY = null, pulling = false, ready = false, refreshing = false;

  const pill = () => $("ptrPill");
  const sheetOpen = () => !$("sheet").classList.contains("hidden");

  function ptrShow(text, isReady) {
    const p = pill();
    if (!p) return;
    p.textContent = text;
    p.classList.add("ptr-show");
    p.classList.toggle("ptr-ready", !!isReady);
  }
  function ptrHide() {
    const p = pill();
    if (!p) return;
    p.classList.remove("ptr-show", "ptr-ready", "animate-pulse");
  }

  window.addEventListener("touchstart", (e) => {
    if (refreshing || sheetOpen() || window.scrollY > 0) { startY = null; return; }
    startY = e.touches[0].clientY;
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    if (startY === null || refreshing || sheetOpen()) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0 || window.scrollY > 0) {
      if (pulling) { pulling = false; ready = false; ptrHide(); }
      return;
    }
    if (dy > 10) {
      pulling = true;
      e.preventDefault(); // requiere passive:false; el body ya lleva overscroll-behavior:none
      if (dy >= THRESHOLD && !ready) {
        ready = true;
        haptic.light();
        ptrShow("↑ Suelta para actualizar", true);
      } else if (dy < THRESHOLD && ready) {
        ready = false;
        ptrShow("↓ Arrastra para actualizar", false);
      } else if (!ready && !$("ptrPill").classList.contains("ptr-show")) {
        ptrShow("↓ Arrastra para actualizar", false);
      }
    }
  }, { passive: false });

  window.addEventListener("touchend", async () => {
    if (!pulling) { startY = null; return; }
    pulling = false;
    startY = null;
    if (!ready || refreshing) { ready = false; ptrHide(); return; }
    ready = false;
    refreshing = true;
    ptrShow("↻ Actualizando…", true);
    pill().classList.add("animate-pulse");
    try {
      await refreshCurrentTab();
      haptic.success();
      setTimeout(ptrHide, 350);
    } catch (e) {
      console.warn("[PTR] refresh falló:", e);
      haptic.error();
      ptrShow("○ Sin conexión", false);
      setTimeout(ptrHide, 1500);
    } finally {
      refreshing = false;
    }
  });
})();

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
  if (!name) {
    haptic.light();
    messageSheet("Falta el nombre", "Ponle nombre al ejercicio (ej: Hip thrust).");
    $("newExName").focus();
    return;
  }
  await api("/api/exercises", { method: "POST", body: JSON.stringify({ name, muscle_group: $("newExMuscle").value.trim() }) });
  $("newExName").value = ""; $("newExMuscle").value = "";
  await refreshAll();
  haptic.success();
}

// ---------- rutinas ----------
async function loadRoutines() {
  if (!routLoaded) $("routineList").innerHTML = skeletonCards(2);
  try {
    routines = await api("/api/routines");
    renderRoutineSelects();
    routLoaded = true;
  } catch (e) {
    if (!routLoaded) $("routineList").innerHTML = `<p class="text-sm text-zinc-500">Sin conexión.</p>`;
    throw e;
  }
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
  if (!name) {
    haptic.light();
    messageSheet("Falta el nombre", "Ponle nombre a la rutina (ej: Push Day).");
    $("newRoutineName").focus();
    return;
  }
  await api("/api/routines", { method: "POST", body: JSON.stringify({ name, description: $("newRoutineDesc").value }) });
  $("newRoutineName").value = ""; $("newRoutineDesc").value = "";
  routines = await api("/api/routines");
  renderRoutineSelects();
  haptic.success();
}

async function deleteRoutine(id) {
  const ok = await confirmSheet({
    title: "¿Eliminar rutina?",
    message: "Se eliminará la rutina y sus ejercicios planificados. Esta acción no se puede deshacer.",
  });
  if (!ok) return;
  await api(`/api/routines/${id}`, { method: "DELETE" });
  routines = await api("/api/routines");
  renderRoutineSelects();
  haptic.success();
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
    if (!routines.length) {
      haptic.light();
      messageSheet("Sin rutinas", "Crea primero una rutina en la pestaña Rutinas.");
      return;
    }
    body.routine_id = Number($("routineSelect").value);
  }
  const s = await api("/api/sessions", { method: "POST", body: JSON.stringify(body) });
  openSession(s.id);
  haptic.success();
}

async function startSessionFromRoutine(id) {
  const s = await api("/api/sessions", { method: "POST", body: JSON.stringify({ routine_id: id }) });
  document.querySelector('[data-tab="entrenar"]').click();
  openSession(s.id);
  haptic.success();
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
        <tbody id="sets-${se.id}">${se.sets.map((t) => `<tr class="border-t border-zinc-700/50"><td>${t.set_number}</td><td>${t.weight}</td><td>${t.reps}</td><td class="text-zinc-400">${t.volume}</td><td class="text-right"><button onclick="deleteSet(${t.id}, this)" class="text-zinc-500 min-w-[44px] min-h-[44px]">✕</button></td></tr>`).join("")}</tbody>
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

async function saveSessionNotes(btn) {
  if (!activeSessionId) return;
  const el = btn instanceof HTMLElement ? btn : null;
  const prev = el ? el.textContent : "";
  try {
    await api(`/api/sessions/${activeSessionId}`, { method: "PATCH", body: JSON.stringify({ notes: $("activeNotes").value }) });
    // feedback inline no bloqueante (en lugar de alert)
    haptic.success();
    if (el) {
      el.textContent = "✓ Guardada";
      setTimeout(() => { el.textContent = prev || "💾 Guardar nota"; }, 2000);
    }
  } catch (e) {
    messageSheet("No se pudo guardar", "Revisa la conexión e inténtalo de nuevo.");
  }
}

async function saveExNotes(linkId, notes) {
  try {
    await api(`/api/session-exercises/${linkId}`, { method: "PATCH", body: JSON.stringify({ notes }) });
  } catch (e) {
    console.warn("[saveExNotes] falló:", e);
    haptic.error();
    toast("Sin conexión — nota no guardada", "error");
  }
}

async function addExerciseToSession() {
  if (!activeSessionId) {
    haptic.light();
    messageSheet("Sin sesión activa", "Inicia una sesión primero para añadir ejercicios.");
    return;
  }
  await api(`/api/sessions/${activeSessionId}/exercises`, { method: "POST", body: JSON.stringify({ exercise_id: Number($("addExSelect").value) }) });
  openSession(activeSessionId);
  haptic.success();
}

async function removeSessionEx(linkId) {
  await api(`/api/session-exercises/${linkId}`, { method: "DELETE" });
  openSession(activeSessionId);
  haptic.medium();
}

async function addSet(linkId) {
  const wInput = $(`w-${linkId}`);
  const rInput = $(`r-${linkId}`);
  const weight = Number(wInput.value || 0);
  const reps = Number(rInput.value || 0);
  const tbody = $(`sets-${linkId}`);

  // 1. Fila optimista instantánea (estado pendiente)
  let pendingRow = null;
  if (tbody) {
    const volume = Math.round(weight * reps * 100) / 100;
    pendingRow = document.createElement("tr");
    pendingRow.className = "border-t border-zinc-700/50 opacity-60 animate-pulse";
    pendingRow.innerHTML = `<td>${tbody.rows.length + 1}</td><td>${weight}</td><td>${reps}</td><td class="text-zinc-400">${volume}</td><td class="text-right text-zinc-600">…</td>`;
    tbody.appendChild(pendingRow);
    wInput.value = "";
    rInput.value = "";
    wInput.focus();
  }
  haptic.light(); // feedback inmediato al pulsar

  // 2. POST en background + reconciliación con el servidor
  try {
    await api(`/api/session-exercises/${linkId}/sets`, { method: "POST", body: JSON.stringify({ weight, reps }) });
    haptic.success();
    await openSession(activeSessionId);
  } catch (e) {
    console.warn("[addSet] falló, rollback:", e);
    haptic.error();
    toast("Sin conexión — serie no guardada", "error");
    try {
      await openSession(activeSessionId); // re-sincroniza con el servidor
    } catch {
      pendingRow?.remove(); // ni siquiera hay red para re-sincronizar: quita la fila optimista
    }
  }
}

async function deleteSet(setId, btn) {
  const row = btn instanceof HTMLElement ? btn.closest("tr") : null;
  const tbody = row ? row.parentElement : null;
  const index = tbody && row ? [...tbody.rows].indexOf(row) : -1;
  const rowHtml = row ? row.outerHTML : null;

  // 1. Quita la fila al instante
  row?.remove();
  haptic.medium();

  // 2. DELETE en background + reconciliación (renumera series)
  try {
    await api(`/api/sets/${setId}`, { method: "DELETE" });
    await openSession(activeSessionId);
  } catch (e) {
    console.warn("[deleteSet] falló, rollback:", e);
    haptic.error();
    toast("Sin conexión — no se pudo borrar", "error");
    try {
      await openSession(activeSessionId);
    } catch {
      // restaura la fila en su posición original
      if (tbody && rowHtml && index >= 0) {
        const tmp = document.createElement("tbody");
        tmp.innerHTML = rowHtml;
        const restored = tmp.firstElementChild;
        if (restored) {
          if (index >= tbody.rows.length) tbody.appendChild(restored);
          else tbody.insertBefore(restored, tbody.rows[index]);
        }
      }
    }
  }
}

// ---------- historial ----------
async function loadHistory() {
  if (!histLoaded) $("historyList").innerHTML = skeletonCards(3);
  try {
    sessions = await api("/api/sessions?limit=20");
  } catch (e) {
    if (!histLoaded) $("historyList").innerHTML = `<p class="text-sm text-zinc-500">Sin conexión.</p>`;
    throw e;
  }
  histLoaded = true;
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
  const ok = await confirmSheet({
    title: "¿Eliminar sesión?",
    message: "Se eliminará la sesión con todas sus series registradas. Esta acción no se puede deshacer.",
  });
  if (!ok) return;
  await api(`/api/sessions/${id}`, { method: "DELETE" });
  loadHistory();
  haptic.success();
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

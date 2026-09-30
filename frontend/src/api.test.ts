import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  it("reordena los grupos PB sin usar grupos musculares", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await api.reorderPbGroups([3, 1, 2]);
    expect(fetchMock).toHaveBeenCalledWith("/api/pb-groups/reorder", expect.objectContaining({
      method: "PUT", body: JSON.stringify({ ids: [3, 1, 2] })
    }));
  });

  it("asigna un ejercicio a un grupo PB independiente", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 1, pb_group_id: 4 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await api.updateExercise(1, { pb_group_id: 4 });
    expect(fetchMock).toHaveBeenCalledWith("/api/exercises/1", expect.objectContaining({
      method: "PATCH", body: JSON.stringify({ pb_group_id: 4 })
    }));
  });

  it("quita un ejercicio del grupo PB sin eliminarlo", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 1, pb_group_id: null }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await api.updateExercise(1, { pb_group_id: null });
    expect(fetchMock).toHaveBeenCalledWith("/api/exercises/1", expect.objectContaining({
      method: "PATCH", body: JSON.stringify({ pb_group_id: null })
    }));
  });

  it("envía una sesión nueva al endpoint existente", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 1, name: "Torso" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await api.createSession({ name: "Torso", routine_id: 4 });
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions", expect.objectContaining({
      method: "POST", body: JSON.stringify({ name: "Torso", routine_id: 4 })
    }));
  });

  it("actualiza una rutina existente correctamente", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 2, name: "Pierna Pro", description: "Enfocado en cuádriceps" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await api.updateRoutine(2, { name: "Pierna Pro", description: "Enfocado en cuádriceps" });
    expect(fetchMock).toHaveBeenCalledWith("/api/routines/2", expect.objectContaining({
      method: "PATCH", body: JSON.stringify({ name: "Pierna Pro", description: "Enfocado en cuádriceps" })
    }));
  });

  it("actualiza objetivos de un ejercicio en una rutina", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 2, exercises: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await api.updateRoutineExercise(2, 5, { target_sets: 4, target_reps: 12, target_weight: 80 });
    expect(fetchMock).toHaveBeenCalledWith("/api/routines/2/exercises/5", expect.objectContaining({
      method: "PATCH", body: JSON.stringify({ target_sets: 4, target_reps: 12, target_weight: 80 })
    }));
  });

  it("actualiza marcas personales de un ejercicio", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 1, name: "Press banca", current_weight: 90, current_reps: 8 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await api.updateExercise(1, { current_weight: 90, current_reps: 8 });
    expect(fetchMock).toHaveBeenCalledWith("/api/exercises/1", expect.objectContaining({
      method: "PATCH", body: JSON.stringify({ current_weight: 90, current_reps: 8 })
    }));
  });

  it("expone el detalle del backend cuando una mutación falla", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Rutina no encontrada" }), { status: 404 })));
    await expect(api.deleteRoutine(99)).rejects.toThrow("Rutina no encontrada");
  });
});

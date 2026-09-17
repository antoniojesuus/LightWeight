import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  it("envía una sesión nueva al endpoint existente", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 1, name: "Torso" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await api.createSession({ name: "Torso", routine_id: 4 });
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions", expect.objectContaining({
      method: "POST", body: JSON.stringify({ name: "Torso", routine_id: 4 })
    }));
  });

  it("expone el detalle del backend cuando una mutación falla", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Rutina no encontrada" }), { status: 404 })));
    await expect(api.deleteRoutine(99)).rejects.toThrow("Rutina no encontrada");
  });
});

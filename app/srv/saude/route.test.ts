import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /srv/saude", () => {
  it("responde ok sem chamar a rede", async () => {
    const rede = vi.fn();
    vi.stubGlobal("fetch", rede);
    const r = GET();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(rede).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

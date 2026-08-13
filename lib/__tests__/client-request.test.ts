import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchAdminJson, fetchJsonWithRetry } from "@/lib/client-request";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchJsonWithRetry", () => {
  it("retries once by default on network failure, then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ value: 1 }) } as Response);
    vi.stubGlobal("fetch", fetchImpl);

    const result = await fetchJsonWithRetry<{ value: number }>("/api/whatever");

    expect(result).toEqual({ value: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("fetchAdminJson with retries=0 (non-idempotent endpoints, e.g. /notify)", () => {
  it("does not retry when the request fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchImpl);

    await expect(
      fetchAdminJson("/api/admin/tournaments/notify", { method: "POST" }, 0)
    ).rejects.toThrow();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("still returns the payload normally on success with retries=0", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ successCount: 5 }) } as Response);
    vi.stubGlobal("fetch", fetchImpl);

    const result = await fetchAdminJson<{ successCount: number }>(
      "/api/admin/tournaments/notify",
      { method: "POST" },
      0
    );

    expect(result).toEqual({ successCount: 5 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

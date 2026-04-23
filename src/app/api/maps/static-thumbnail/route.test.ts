import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

// Mock the auth + db modules BEFORE importing the route, so the route's
// top-level imports resolve to our mocks. We control the return values
// per-test via vi.mocked(...).

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    auditFinding: { findFirst: vi.fn() },
  },
}));

// Route must be imported AFTER the mocks are registered.
import { GET } from "./route";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

const originalKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;

function makeRequest(query: string): Request {
  return new Request(`http://localhost/api/maps/static-thumbnail${query}`);
}

beforeEach(() => {
  process.env.GOOGLE_MAPS_SERVER_API_KEY = "test-server-key";
  vi.restoreAllMocks();
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.GOOGLE_MAPS_SERVER_API_KEY;
  else process.env.GOOGLE_MAPS_SERVER_API_KEY = originalKey;
});

describe("GET /api/maps/static-thumbnail", () => {
  it("rejects unauthenticated requests with 401", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(makeRequest("?findingId=abc"));
    expect(res.status).toBe(401);
  });

  it("rejects missing findingId with 400", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "u1",
      email: "t@x.com",
      name: null,
      role: "auditor",
      orgId: "org1",
      org: { id: "org1", name: "X", onboardingComplete: true },
    });
    const res = await GET(makeRequest(""));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the finding doesn't belong to the user's org", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "u1",
      email: "t@x.com",
      name: null,
      role: "auditor",
      orgId: "org1",
      org: { id: "org1", name: "X", onboardingComplete: true },
    });
    vi.mocked(db.auditFinding.findFirst).mockResolvedValue(null);

    const res = await GET(makeRequest("?findingId=other-tenant"));
    expect(res.status).toBe(404);
    // Tenancy leak check: don't echo the id back in a way that
    // confirms existence under another org. findFirst is scoped by
    // audit.orgId so it returns null for cross-tenant IDs the same
    // way it does for nonexistent IDs — 404 is indistinguishable.
  });

  it("returns 422 when the finding has no pin", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "u1",
      email: "t@x.com",
      name: null,
      role: "auditor",
      orgId: "org1",
      org: { id: "org1", name: "X", onboardingComplete: true },
    });
    vi.mocked(db.auditFinding.findFirst).mockResolvedValue({
      pinLat: null,
      pinLng: null,
    } as { pinLat: number | null; pinLng: number | null });

    const res = await GET(makeRequest("?findingId=f1"));
    expect(res.status).toBe(422);
  });

  it("returns 500 when GOOGLE_MAPS_SERVER_API_KEY is missing", async () => {
    delete process.env.GOOGLE_MAPS_SERVER_API_KEY;
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "u1",
      email: "t@x.com",
      name: null,
      role: "auditor",
      orgId: "org1",
      org: { id: "org1", name: "X", onboardingComplete: true },
    });
    vi.mocked(db.auditFinding.findFirst).mockResolvedValue({
      pinLat: 30.25,
      pinLng: -97.75,
    } as { pinLat: number | null; pinLng: number | null });

    const res = await GET(makeRequest("?findingId=f1"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("maps_server_key_not_configured");
  });

  it("proxies a valid pin, sets immutable cache headers, and forwards the image body", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "u1",
      email: "t@x.com",
      name: null,
      role: "auditor",
      orgId: "org1",
      org: { id: "org1", name: "X", onboardingComplete: true },
    });
    vi.mocked(db.auditFinding.findFirst).mockResolvedValue({
      pinLat: 30.25,
      pinLng: -97.75,
    } as { pinLat: number | null; pinLng: number | null });

    const fakeImage = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(fakeImage, {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
      );

    const res = await GET(makeRequest("?findingId=f1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/max-age=604800/);
    expect(res.headers.get("cache-control")).toMatch(/immutable/);
    expect(res.headers.get("content-type")).toBe("image/png");

    const buf = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(buf)).toEqual(Array.from(fakeImage));

    // Confirm the upstream URL contains the expected pieces — the
    // key is redacted in the assertion so if a test log ever leaks,
    // we don't have to rotate a real key.
    // URLSearchParams encodes commas / pipes in values — Google's
    // Static Maps endpoint accepts both literal and percent-encoded
    // forms, so both "30.25,-97.75" and "30.25%2C-97.75" are valid.
    // The test just checks the decoded value is present; we don't
    // care which encoding URLSearchParams picked.
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    const decoded = decodeURIComponent(calledUrl);
    expect(calledUrl).toMatch(/staticmap\?/);
    expect(decoded).toMatch(/center=30\.25,-97\.75/);
    expect(decoded).toMatch(/maptype=hybrid/);
    expect(decoded).toMatch(/markers=color:red\|30\.25,-97\.75/);
    expect(decoded).toMatch(/key=test-server-key/);
  });
});

import { beforeEach, describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { humanizeGeoError, useGeolocation } from "./use-geolocation";

// Minimal GeolocationPositionError shape. The real class constants
// (PERMISSION_DENIED = 1, POSITION_UNAVAILABLE = 2, TIMEOUT = 3) live
// on the prototype in browsers; fake them here so humanizeGeoError's
// switch branches resolve.
function fakeError(code: number, message = ""): GeolocationPositionError {
  return {
    code,
    message,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  } as GeolocationPositionError;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("humanizeGeoError", () => {
  it("maps PERMISSION_DENIED to a permission-settings message", () => {
    expect(humanizeGeoError(fakeError(1))).toMatch(/permission/i);
  });
  it("maps POSITION_UNAVAILABLE to a signal message", () => {
    expect(humanizeGeoError(fakeError(2))).toMatch(/signal/i);
  });
  it("maps TIMEOUT to a timed-out message", () => {
    expect(humanizeGeoError(fakeError(3))).toMatch(/timed out/i);
  });
  it("falls back to err.message for unknown codes", () => {
    expect(humanizeGeoError(fakeError(99, "custom"))).toBe("custom");
  });
  it("falls back to a generic message when err.message is empty", () => {
    expect(humanizeGeoError(fakeError(99, ""))).toMatch(
      /couldn.t get your location/i,
    );
  });
});

describe("useGeolocation", () => {
  it("starts in idle and transitions to pending then success", async () => {
    const mockGeo = {
      getCurrentPosition: vi.fn(
        (success: PositionCallback) => {
          success({
            coords: {
              latitude: 30.25,
              longitude: -97.75,
              accuracy: 7,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: 1_700_000_000_000,
          } as GeolocationPosition);
        },
      ),
    };
    vi.stubGlobal("navigator", { geolocation: mockGeo });

    const { result } = renderHook(() => useGeolocation());
    expect(result.current.state.status).toBe("idle");

    await act(async () => {
      result.current.capture();
    });

    expect(result.current.state.status).toBe("success");
    if (result.current.state.status === "success") {
      expect(result.current.state.coords.lat).toBe(30.25);
      expect(result.current.state.coords.lng).toBe(-97.75);
      expect(result.current.state.coords.accuracy).toBe(7);
    }
  });

  it("surfaces permission-denied as a user-readable error", async () => {
    const mockGeo = {
      getCurrentPosition: vi.fn(
        (_s: PositionCallback, error: PositionErrorCallback | null) => {
          error?.(fakeError(1));
        },
      ),
    };
    vi.stubGlobal("navigator", { geolocation: mockGeo });

    const { result } = renderHook(() => useGeolocation());
    await act(async () => {
      result.current.capture();
    });

    expect(result.current.state.status).toBe("error");
    if (result.current.state.status === "error") {
      expect(result.current.state.code).toBe(1);
      expect(result.current.state.error).toMatch(/permission/i);
    }
  });

  it("surfaces timeout as a user-readable error", async () => {
    const mockGeo = {
      getCurrentPosition: vi.fn(
        (_s: PositionCallback, error: PositionErrorCallback | null) => {
          error?.(fakeError(3));
        },
      ),
    };
    vi.stubGlobal("navigator", { geolocation: mockGeo });

    const { result } = renderHook(() => useGeolocation());
    await act(async () => {
      result.current.capture();
    });

    expect(result.current.state.status).toBe("error");
    if (result.current.state.status === "error") {
      expect(result.current.state.code).toBe(3);
      expect(result.current.state.error).toMatch(/timed out/i);
    }
  });

  it("errors out if navigator.geolocation is missing entirely", async () => {
    vi.stubGlobal("navigator", {});

    const { result } = renderHook(() => useGeolocation());
    await act(async () => {
      result.current.capture();
    });

    expect(result.current.state.status).toBe("error");
  });

  it("reset() returns to idle", async () => {
    const mockGeo = {
      getCurrentPosition: vi.fn(
        (_s: PositionCallback, error: PositionErrorCallback | null) => {
          error?.(fakeError(3));
        },
      ),
    };
    vi.stubGlobal("navigator", { geolocation: mockGeo });

    const { result } = renderHook(() => useGeolocation());
    await act(async () => {
      result.current.capture();
    });
    expect(result.current.state.status).toBe("error");

    act(() => {
      result.current.reset();
    });

    expect(result.current.state.status).toBe("idle");
  });
});

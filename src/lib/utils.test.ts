import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("merges tailwind classes and drops duplicates", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});

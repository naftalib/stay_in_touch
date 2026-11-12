import { describe, expect, it } from "vitest";
import { safeReturnPath } from "./safeReturnPath.ts";

describe("safeReturnPath", () => {
  it("keeps same-origin paths", () => {
    expect(safeReturnPath("/f/abc/s/def/messages")).toBe("/f/abc/s/def/messages");
  });

  it("rejects absolute and protocol-relative redirects", () => {
    expect(safeReturnPath("https://evil.example")).toBe("/");
    expect(safeReturnPath("//evil.example")).toBe("/");
    expect(safeReturnPath("/\\evil.example")).toBe("/");
    expect(safeReturnPath(undefined)).toBe("/");
  });
});

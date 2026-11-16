/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");

describe("Greptile config", () => {
  it("reviews open pull requests and lists real files", () => {
    const config = JSON.parse(readFileSync(path.join(root, ".greptile/config.json"), "utf8")) as {
      autoReview?: string[];
      strictness?: number;
      triggerOnDrafts?: boolean;
      triggerOnUpdates?: boolean;
      skipReview?: boolean;
      rules?: { id?: string; rule?: string; scope?: string | string[] }[];
    };
    expect(config.autoReview).toEqual(["open"]);
    expect(config.strictness).toBe(2);
    expect(config.triggerOnDrafts).toBeUndefined();
    expect(config.triggerOnUpdates).toBeUndefined();
    expect(config.skipReview).toBeUndefined();
    expect(config.rules?.length).toBeGreaterThan(0);
    for (const rule of config.rules ?? []) {
      expect(typeof rule.rule).toBe("string");
      if (rule.scope !== undefined) expect(Array.isArray(rule.scope)).toBe(true);
    }
    const pushRule = config.rules?.find((rule) => rule.id === "push-no-message-text");
    expect(pushRule?.scope).toEqual(["supabase/functions/**", "web/src/sw.ts"]);

    const files = JSON.parse(readFileSync(path.join(root, ".greptile/files.json"), "utf8")) as {
      files: { path: string; description: string }[];
    };
    expect(files.files.length).toBeGreaterThan(0);
    for (const file of files.files) {
      expect(file.path).not.toMatch(/[*?[\]]/);
      expect(existsSync(path.join(root, file.path))).toBe(true);
      expect(file.description.length).toBeGreaterThan(0);
    }
  });
});

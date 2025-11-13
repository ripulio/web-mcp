import { describe, expect, it } from "vitest";
import { AgentToolRegistry } from "../src/shared/agent-tool-registry.js";

describe("AgentToolRegistry", () => {
  it("stores frozen tool definitions", () => {
    const registry = new AgentToolRegistry();
    const tool = registry.define({
      name: "demo",
      execute: () => "ok",
      description: "Demo tool",
    });

    expect(tool.name).toBe("demo");
    expect(Object.isFrozen(tool)).toBe(true);
    expect(() => registry.define({ name: "demo", execute: () => {} })).toThrow(/already defined/);
  });

  it("lists and retrieves registered tools", () => {
    const registry = new AgentToolRegistry();

    const defined = registry.define({
      name: "list-tool",
      execute: () => "result",
    });

    expect(registry.get("list-tool")).toBe(defined);
    expect(registry.list()).toEqual([defined]);
  });

  it("resolves when tools are defined", async () => {
    const registry = new AgentToolRegistry();

    const immediate = registry.define({
      name: "immediate",
      execute: () => "now",
    });

    await expect(registry.whenDefined("immediate")).resolves.toBe(immediate);

    const pending = registry.whenDefined("delayed");
    registry.define({
      name: "delayed",
      execute: () => "later",
    });

    await expect(pending).resolves.toMatchObject({ name: "delayed" });
  });

  it("rejects invalid definitions", () => {
    const registry = new AgentToolRegistry();

    expect(() => registry.define({} as any)).toThrow(/must be an object/);
    expect(() => registry.define({ name: 42 } as any)).toThrow(/requires a string name/);
    expect(() => registry.define({ name: "bad" } as any)).toThrow(/missing an execute/);
  });
});

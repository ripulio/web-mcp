import { describe, expect, it } from "vitest";
import { agentInjectionConfigs } from "../src/config/injection-config.js";

describe("site configuration aggregation", () => {
  it("exposes configured site definitions", () => {
    expect(Array.isArray(agentInjectionConfigs)).toBe(true);

    const googleConfig = agentInjectionConfigs.find(
      (config) => config.id === "google-search-results",
    );

    expect(googleConfig).toBeDefined();
    expect(Array.isArray(googleConfig?.matchers) && googleConfig?.matchers.length).toBeTruthy();
    expect(typeof googleConfig?.code).toBe("string");
    expect(googleConfig?.code ?? "").toContain("google_search_list_results");
  });
});

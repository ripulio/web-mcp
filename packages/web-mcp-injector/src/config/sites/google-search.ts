import type { SiteInjectionConfig } from "../types.js";

export const googleSearchConfig: SiteInjectionConfig = {
  id: "google-search-results",
  description: "Tools for interacting with Google Search result pages.",
  matchers: [
    /^https?:\/\/(www\.)?google\.[^/]+\/search/i,
  ],
  code: `
    const TOOL_NAME = "google_search_list_results";

    if (!agent.tools.get(TOOL_NAME)) {
      agent.tools.define({
        name: TOOL_NAME,
        description: "List the organic search results currently visible on the page.",
        inputSchema: {
          type: "object",
          properties: {
            maxResults: {
              type: "number",
              description: "Maximum number of results to return.",
            },
          },
        },
        async execute(input = {}) {
          const maxResults =
            input && typeof input === "object" && typeof input.maxResults === "number"
              ? Math.max(1, Math.floor(input.maxResults))
              : null;

          const anchors = Array.from(document.querySelectorAll("#search a h3")).map((heading) => {
            const anchor = heading.closest("a");
            if (!anchor) {
              return null;
            }

            return {
              title: heading.textContent?.trim() ?? "",
              url: anchor.href,
            };
          });

          const results = anchors.filter(Boolean).filter((result) => {
            return result.title && result.url && !result.url.startsWith("javascript:");
          });

          const sliced = maxResults ? results.slice(0, maxResults) : results;

          const formattedList = sliced
            .map((item, index) => \`\${index + 1}. \${item.title}\\n   \${item.url}\`)
            .join("\\n");

          return {
            content: [
              {
                type: "text",
                text:
                  (sliced.length
                    ? "Here are the current Google search results:\\n"
                    : "No Google search results were found.") +
                  (formattedList ? "\\n" + formattedList : ""),
              },
            ],
            structuredContent: {
              results: sliced,
            },
          };
        },
      });
    }
  `,
};

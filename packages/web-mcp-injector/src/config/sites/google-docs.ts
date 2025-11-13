import type {SiteInjectionConfig} from '../types.js';

export const googleDocsConfig: SiteInjectionConfig = {
  id: 'google-docs',
  description: 'Tools for extracting content from Google Docs documents.',
  matchers: [/^https?:\/\/docs\.google\.com\/document\/d\//i],
  code: `
    const TOOL_NAME = "google_docs_get_content";

    function findModelChunkScript() {
      return (
        document.querySelector("body > script:nth-child(25)") ||
        Array.from(document.querySelectorAll("script")).find((script) => {
          const source = script?.textContent || "";
          return source.includes("DOCS_modelChunk");
        }) ||
        null
      );
    }

    function getGlobalModelChunk() {
      const chunk = window?.DOCS_modelChunk;
      if (chunk && typeof chunk === "object") {
        return chunk;
      }
      return null;
    }

    function parseModelChunkFromScript(scriptEl) {
      if (!scriptEl) {
        throw new Error("Selector didn't match any script.");
      }

      const source = scriptEl.textContent || "";
      const literalMatch = source.match(/DOCS_modelChunk\\s*=\\s*(\\{[\\s\\S]*?\\});/);
      if (literalMatch) {
        return JSON.parse(literalMatch[1]);
      }

      const jsonParseMatch = source.match(/DOCS_modelChunk\\s*=\\s*(JSON\\.parse\\(\\s*['"][\\s\\S]*?['"]\\s*\\))/);
      if (jsonParseMatch) {
        try {
          // Evaluate only the JSON.parse expression to safely decode the payload.
          return new Function("JSON", "return (" + jsonParseMatch[1] + ");")(JSON);
        } catch {
          throw new Error("Failed to evaluate DOCS_modelChunk JSON.parse expression.");
        }
      }

      throw new Error("Couldn't find DOCS_modelChunk assignment.");
    }

    function getDocsModelChunk() {
      const globalChunk = getGlobalModelChunk();
      if (globalChunk) {
        return globalChunk;
      }

      const scriptEl = findModelChunkScript();
      return parseModelChunkFromScript(scriptEl);
    }

    function ensureGetGoogleDocsContent() {
      if (typeof window.getGoogleDocsContent === "function") {
        return window.getGoogleDocsContent;
      }

      function getGoogleDocsContent() {
        const obj = getDocsModelChunk();
        const text = (obj.chunk || [])
          .filter((chunk) => chunk?.ty === "is" && typeof chunk.s === "string")
          .map((chunk) => chunk.s)
          .join("");

        const cleaned = text
          .replace(/[\\u0000-\\u001F]+/g, " ")
          .replace(/[ \\t]+\\n/g, "\\n")
          .replace(/\\n{3,}/g, "\\n\\n")
          .trim();

        console.log(cleaned);
        return cleaned;
      }

      window.getGoogleDocsContent = getGoogleDocsContent;
      return getGoogleDocsContent;
    }

    const getGoogleDocsContent = ensureGetGoogleDocsContent();

    if (!agent.tools.get(TOOL_NAME)) {
      agent.tools.define({
        name: TOOL_NAME,
        description: "Return the cleaned text content of the open Google Docs document.",
        async execute() {
          try {
            const text = getGoogleDocsContent();
            return {
              content: [
                {
                  type: "text",
                  text: text || "(Document body appears empty.)",
                },
              ],
              structuredContent: {
                text,
              },
            };
          } catch (error) {
            const message =
              error && typeof error.message === "string" ? error.message : "Failed to extract Google Docs content.";
            return {
              content: [
                {
                  type: "text",
                  text: message,
                },
              ],
              isError: true,
            };
          }
        },
      });
    }
  `
};

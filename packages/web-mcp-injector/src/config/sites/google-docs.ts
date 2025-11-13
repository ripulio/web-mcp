import type {SiteInjectionConfig} from '../types.js';

export const googleDocsConfig: SiteInjectionConfig = {
  id: 'google-docs',
  description: 'Tools for extracting content from Google Docs documents.',
  matchers: [/^https?:\/\/docs\.google\.com\/document\/d\//i],
  code: `
    const TOOL_NAME = "google_docs_get_content";

    function describeScriptElement(scriptEl) {
      if (!scriptEl) {
        return "null";
      }

      const src = scriptEl.getAttribute("src");
      if (src) {
        return '<script src="' + src + '">';
      }

      const snippet = (scriptEl.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 80);
      if (!snippet) {
        return "<script>(empty inline script)</script>";
      }

      return "<script>" + snippet + (snippet.length === 80 ? "..." : "") + "</script>";
    }

    function findModelChunkScript() {
      const selector = "body > script:nth-child(25)";
      const selectorMatch = document.querySelector(selector);
      if (selectorMatch) {
        return {
          script: selectorMatch,
          details: "Selector " + selector + " returned " + describeScriptElement(selectorMatch),
        };
      }

      const scripts = Array.from(document.querySelectorAll("script"));
      const fallbackIndex = scripts.findIndex((script) => {
        const source = script?.textContent || "";
        return source.includes("DOCS_modelChunk");
      });

      if (fallbackIndex >= 0) {
        const match = scripts[fallbackIndex];
        return {
          script: match,
          details:
            'Fallback document.querySelectorAll("script") found index ' +
            fallbackIndex +
            " => " +
            describeScriptElement(match),
        };
      }

      return {
        script: null,
        details:
          "Selector " +
          selector +
          " returned null and fallback search did not locate an inline DOCS_modelChunk script.",
      };
    }

    function getGlobalModelChunk() {
      const chunk = window?.DOCS_modelChunk;
      if (chunk && typeof chunk === "object") {
        return chunk;
      }
      return null;
    }

    function parseModelChunkFromScript(scriptEl, selectionDetails = "") {
      const detailSuffix = selectionDetails ? " " + selectionDetails : "";

      if (!scriptEl) {
        throw new Error("Selector didn't match any script." + detailSuffix);
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
          throw new Error("Failed to evaluate DOCS_modelChunk JSON.parse expression." + detailSuffix);
        }
      }

      throw new Error("Couldn't find DOCS_modelChunk assignment." + detailSuffix);
    }

    function getDocsModelChunk() {
      const globalChunk = getGlobalModelChunk();
      if (globalChunk) {
        return globalChunk;
      }

      const { script: scriptEl, details: scriptDetails } = findModelChunkScript();
      return parseModelChunkFromScript(scriptEl, scriptDetails);
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

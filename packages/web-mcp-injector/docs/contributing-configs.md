# Contributing Site Configurations

Extensions can register additional Web MCP tools by adding site-specific snippets. Follow this workflow when submitting a new configuration.

1. **Create a site module**
   - Add a new file under `src/config/sites/`, e.g. `src/config/sites/example-site.ts`.
   - Export a config object with:
     ```js
     export const exampleConfig = {
       id: "example-site",
       description: "Short description of what the tool does.",
       matchers: [/^https?:\\/\\/example\\.com\\//i],
       code: `
         if (!agent.tools.get("example.tool")) {
           agent.tools.define({ /* ... */ });
         }
       `,
     };
     ```
   - Use `matchers` to list one or more `RegExp` instances identifying matching URLs.
   - Ensure the injected snippet checks whether the tool already exists before defining it.

2. **Register the config**
   - Import and append the new export in `src/config/sites/index.ts` to surface it in the build.

3. **Add tests**
   - Extend `test/config-sites.test.ts` (or create a new file under `test/`) to assert that the config was added and the snippet references the expected tool name(s).

4. **Document validation steps**
   - Include manual testing instructions in your PR description (e.g. exact URL visited, console command run, observed result).

5. **Run the test suite**
   - Execute `npm run test --workspace web-mcp-injector -- --run` before opening the PR to ensure config aggregation stays healthy.

By keeping every site in its own module, review is limited to the code you introduce, and contributors can iterate without touching unrelated configurations.

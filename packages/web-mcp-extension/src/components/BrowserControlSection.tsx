export interface BrowserControlSectionProps {
  enabled: boolean;
  connectedPorts: number[];
  onToggle: (enabled: boolean) => void;
}

export function BrowserControlSection({
  enabled,
  connectedPorts,
  onToggle
}: BrowserControlSectionProps) {
  return (
    <div class="settings-section">
      <h2 class="section-title">Browser Control MCP Server</h2>
      <p class="section-desc">
        Allow MCP servers to control browser tabs and execute page tools via
        WebSocket. Scans ports 8765-8785 for available servers.
      </p>
      <div class="browser-control-setup">
        <p class="setup-title">Setup with Claude Code:</p>
        <ol class="setup-steps">
          <li>
            Run <code>/install-github-mcp ripulio/browser-mcp</code> in Claude
            Code
          </li>
          <li>Enable the toggle below</li>
          <li>
            Claude can now control your browser tabs and call any registered
            page tools
          </li>
        </ol>
      </div>
      <div class="browser-control-row">
        <label class="toggle-switch">
          <input
            type="checkbox"
            checked={enabled}
            onChange={() => onToggle(!enabled)}
          />
          <span class="toggle-slider"></span>
        </label>
        <span class="browser-control-label">
          {enabled ? 'Enabled' : 'Disabled'}
        </span>
        {enabled && connectedPorts.length > 0 && (
          <span class="browser-control-status">
            Connected to {connectedPorts.length} server
            {connectedPorts.length > 1 ? 's' : ''} (
            {connectedPorts.map((p) => `:${p}`).join(', ')})
          </span>
        )}
        {enabled && connectedPorts.length === 0 && (
          <span class="browser-control-status scanning">
            Scanning for servers...
          </span>
        )}
      </div>
    </div>
  );
}

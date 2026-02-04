import {signal} from '@preact/signals';
import type {BrowserControlStatus} from '../shared.js';

// Core signals
export const browserControlStatus = signal<BrowserControlStatus>({
  enabled: false,
  connectedPorts: [],
  detectedPorts: []
});

export const detectedServerPorts = signal<number[]>([]);

// Actions
export function refreshStatus(): void {
  chrome.runtime.sendMessage(
    {type: 'BROWSER_CONTROL_GET_STATUS'},
    (response: BrowserControlStatus) => {
      if (response) {
        browserControlStatus.value = response;
      }
    }
  );
}

function detectServers(): void {
  chrome.runtime.sendMessage(
    {type: 'BROWSER_CONTROL_DETECT_SERVERS'},
    (response: {detectedPorts: number[]}) => {
      if (response?.detectedPorts) {
        detectedServerPorts.value = response.detectedPorts;
      }
    }
  );
}

// Initialize polling and listeners (call from panel.tsx once)
let initialized = false;
export function initBrowserControlPolling(): () => void {
  if (initialized) return () => {};
  initialized = true;

  refreshStatus();
  detectServers();

  const listener = (message: {type: string; status?: BrowserControlStatus}) => {
    if (message.type === 'BROWSER_CONTROL_STATUS_UPDATE' && message.status) {
      browserControlStatus.value = message.status;
    }
  };
  chrome.runtime.onMessage.addListener(listener);

  const statusInterval = setInterval(refreshStatus, 2000);
  const detectInterval = setInterval(detectServers, 5000);

  return () => {
    chrome.runtime.onMessage.removeListener(listener);
    clearInterval(statusInterval);
    clearInterval(detectInterval);
    initialized = false;
  };
}

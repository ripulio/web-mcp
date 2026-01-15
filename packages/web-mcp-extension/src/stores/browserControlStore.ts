import {signal} from '@preact/signals';
import type {BrowserControlStatus} from '../shared.js';

// Core signal
export const browserControlStatus = signal<BrowserControlStatus>({
  enabled: false,
  connectedPorts: []
});

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

// Initialize polling and listeners (call from panel.tsx once)
let initialized = false;
export function initBrowserControlPolling(): () => void {
  if (initialized) return () => {};
  initialized = true;

  refreshStatus();

  const listener = (message: {type: string; status?: BrowserControlStatus}) => {
    if (message.type === 'BROWSER_CONTROL_STATUS_UPDATE' && message.status) {
      browserControlStatus.value = message.status;
    }
  };
  chrome.runtime.onMessage.addListener(listener);

  const interval = setInterval(refreshStatus, 2000);

  return () => {
    chrome.runtime.onMessage.removeListener(listener);
    clearInterval(interval);
    initialized = false;
  };
}

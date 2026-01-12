import {useState, useEffect} from 'preact/hooks';
import type {BrowserControlStatus} from '../shared.js';

export interface UseBrowserControlStatusReturn {
  status: BrowserControlStatus;
  refresh: () => void;
}

export function useBrowserControlStatus(): UseBrowserControlStatusReturn {
  const [status, setStatus] = useState<BrowserControlStatus>({
    enabled: false,
    connectedPorts: []
  });

  const refresh = () => {
    chrome.runtime.sendMessage(
      {type: 'BROWSER_CONTROL_GET_STATUS'},
      (response: BrowserControlStatus) => {
        if (response) {
          setStatus(response);
        }
      }
    );
  };

  useEffect(() => {
    // Initial fetch
    refresh();

    // Listen for status updates from background
    const listener = (message: {
      type: string;
      status?: BrowserControlStatus;
    }) => {
      if (message.type === 'BROWSER_CONTROL_STATUS_UPDATE' && message.status) {
        setStatus(message.status);
      }
    };
    chrome.runtime.onMessage.addListener(listener);

    // Poll for status updates every 2 seconds
    const interval = setInterval(refresh, 2000);

    return () => {
      chrome.runtime.onMessage.removeListener(listener);
      clearInterval(interval);
    };
  }, []);

  return {status, refresh};
}

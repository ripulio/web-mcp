import type {EnabledToolGroups} from './shared.js';

(async () => {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('user-tools-injector.js');
  script.type = 'module';
  script.onload = () => {
    console.log('[WebMCP Extension] User tools injector loaded');
    script.remove();
  };
  script.onerror = (error) => {
    console.error(
      '[WebMCP Extension] Failed to load user tools injector:',
      error
    );
  };

  (document.head || document.documentElement).appendChild(script);

  await new Promise<void>((resolve) => {
    const listener = (event: MessageEvent) => {
      if (event.data.type === 'WEBMCP_INJECTOR_READY') {
        window.removeEventListener('message', listener);
        resolve();
      }
    };
    window.addEventListener('message', listener);
  });

  const result = await chrome.storage.local.get<{
    enabledToolGroups: EnabledToolGroups;
  }>(['enabledToolGroups']);

  window.postMessage(
    {
      type: 'WEBMCP_UPDATE_TOOLS',
      enabledToolGroups: result.enabledToolGroups || {},
      currentPath: window.location.pathname,
      currentDomain: window.location.hostname
    },
    '*'
  );

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.enabledToolGroups) {
      console.log('[WebMCP Extension] Tool groups changed, updating tools');
      window.postMessage(
        {
          type: 'WEBMCP_UPDATE_TOOLS',
          enabledToolGroups: changes.enabledToolGroups.newValue || {},
          currentPath: window.location.pathname,
          currentDomain: window.location.hostname
        },
        '*'
      );
    }
  });
})();

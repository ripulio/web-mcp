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

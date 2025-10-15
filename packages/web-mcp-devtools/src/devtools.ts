// Create a DevTools panel
chrome.devtools.panels.create(
  'WebMCP',
  '',
  'panel.html',
  (panel) => {
    console.log('WebMCP DevTools panel created');
  }
);

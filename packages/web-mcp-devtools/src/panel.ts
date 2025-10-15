// Get references to UI elements
const elementCountEl = document.getElementById('elementCount');
const refreshBtn = document.getElementById('refreshBtn');
const errorEl = document.getElementById('error');

// Function to count elements in the inspected page
function countElements() {
  // Clear any previous error
  if (errorEl) {
    errorEl.style.display = 'none';
  }

  // Execute script in the context of the inspected page
  chrome.devtools.inspectedWindow.eval(
    'document.querySelectorAll("*").length',
    (result, isException) => {
      if (isException) {
        console.error('Error counting elements:', isException);
        if (errorEl) {
          errorEl.textContent = 'Error counting elements: ' + (isException.value || 'Unknown error');
          errorEl.style.display = 'block';
        }
        if (elementCountEl) {
          elementCountEl.textContent = '-';
        }
      } else {
        if (elementCountEl) {
          elementCountEl.textContent = result.toLocaleString();
        }
      }
    }
  );
}

// Count elements when the panel is opened
countElements();

// Refresh on button click
if (refreshBtn) {
  refreshBtn.addEventListener('click', countElements);
}

// Optional: Auto-refresh when the page is reloaded
chrome.devtools.network.onNavigated.addListener(() => {
  // Wait a bit for the page to load
  setTimeout(countElements, 500);
});

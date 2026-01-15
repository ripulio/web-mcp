import {signal, computed} from '@preact/signals';
import type {WebMCPSettings, PackageSource} from '../shared.js';
import {DEFAULT_SETTINGS, DEFAULT_PACKAGE_SOURCE} from '../shared.js';

// Core signals
export const settings = signal<WebMCPSettings>(DEFAULT_SETTINGS);
export const settingsLoading = signal(true);

// Computed values
export const browserControlEnabled = computed(
  () => settings.value.browserControlEnabled ?? false
);

export const derivedSources = computed((): PackageSource[] => [
  DEFAULT_PACKAGE_SOURCE,
  ...settings.value.customSources
]);

// Actions
export async function loadSettings(): Promise<void> {
  const result = await chrome.storage.local.get<{
    webmcpSettings: WebMCPSettings;
  }>(['webmcpSettings']);

  settings.value = result.webmcpSettings || DEFAULT_SETTINGS;
  settingsLoading.value = false;
}

export async function saveSettings(newSettings: WebMCPSettings): Promise<void> {
  settings.value = newSettings;
  await chrome.storage.local.set({webmcpSettings: newSettings});
}

export async function handleBrowserControlToggle(
  enabled: boolean
): Promise<void> {
  const newSettings = {...settings.value, browserControlEnabled: enabled};
  await saveSettings(newSettings);

  chrome.runtime.sendMessage({
    type: 'BROWSER_CONTROL_TOGGLE',
    enabled
  });
}

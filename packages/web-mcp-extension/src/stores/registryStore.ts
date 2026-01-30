import {signal} from '@preact/signals';
import type {PackageSource, SourceResult} from '../shared.js';
import {searchToolsGrouped} from '../tool-registry.js';

// Core signals
export const activeRegistry = signal<SourceResult[]>([]);
export const sourceErrors = signal<{[url: string]: string}>({});
export const registryLoading = signal(true);

// Actions
export async function loadRegistry(sources: PackageSource[]): Promise<void> {
  registryLoading.value = true;

  // Use session cache - manifest cached until browser restart
  const results = await searchToolsGrouped(sources, 'session');

  // Extract errors from results
  const errors: {[url: string]: string} = {};
  for (const r of results) {
    if (r.error) {
      errors[r.sourceUrl] = r.error;
    }
  }
  sourceErrors.value = errors;

  // Filter successful results
  activeRegistry.value = results.filter((r) => !r.error);
  registryLoading.value = false;
}

export function clearSourceError(url: string): void {
  const {[url]: _, ...rest} = sourceErrors.value;
  sourceErrors.value = rest;
}

export function setSourceError(url: string, error: string): void {
  sourceErrors.value = {...sourceErrors.value, [url]: error};
}

export function removeFromRegistries(sourceUrl: string): void {
  activeRegistry.value = activeRegistry.value.filter(
    (r) => r.sourceUrl !== sourceUrl
  );
}

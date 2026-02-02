import {signal, computed} from '@preact/signals';
import type {SourceResult} from '../shared.js';
import {filterGroupedRegistry} from '../utils/search.js';
import {activeRegistry} from './registryStore.js';

// Core signal
export const searchQuery = signal('');

// Computed filtered registry
export const filteredRegistry = computed((): SourceResult[] =>
  filterGroupedRegistry(activeRegistry.value, searchQuery.value)
);

// Action
export function setSearchQuery(query: string): void {
  searchQuery.value = query;
}

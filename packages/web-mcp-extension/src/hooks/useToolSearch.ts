import {useState} from 'preact/hooks';
import type {GroupedToolRegistryResult} from '../shared.js';
import {filterGroupedRegistry} from '../utils/search.js';

export interface UseToolSearchReturn {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filterRegistry: (
    sources: GroupedToolRegistryResult[]
  ) => GroupedToolRegistryResult[];
}

export function useToolSearch(): UseToolSearchReturn {
  const [searchQuery, setSearchQuery] = useState('');

  const filterRegistry = (
    sources: GroupedToolRegistryResult[]
  ): GroupedToolRegistryResult[] => {
    return filterGroupedRegistry(sources, searchQuery);
  };

  return {
    searchQuery,
    setSearchQuery,
    filterRegistry
  };
}

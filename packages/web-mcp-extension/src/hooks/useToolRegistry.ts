import {useState} from 'preact/hooks';
import type {
  CacheMode,
  PackageSource,
  GroupedToolRegistryResult
} from '../shared.js';
import {searchToolsGrouped} from '../tool-registry.js';

export interface UseToolRegistryReturn {
  activeRegistry: GroupedToolRegistryResult[];
  inactiveRegistry: GroupedToolRegistryResult[];
  sourceErrors: {[url: string]: string};
  loading: boolean;
  loadRegistry: (
    sources: PackageSource[],
    cacheMode: CacheMode
  ) => Promise<void>;
  clearSourceError: (url: string) => void;
  setSourceError: (url: string, error: string) => void;
  moveToActive: (sourceUrl: string, data: GroupedToolRegistryResult) => void;
  moveToInactive: (sourceUrl: string, data: GroupedToolRegistryResult) => void;
  removeFromRegistries: (sourceUrl: string) => void;
  updateSourceInRegistry: (
    sourceUrl: string,
    data: GroupedToolRegistryResult,
    isEnabled: boolean
  ) => void;
}

export function useToolRegistry(): UseToolRegistryReturn {
  const [activeRegistry, setActiveRegistry] = useState<
    GroupedToolRegistryResult[]
  >([]);
  const [inactiveRegistry, setInactiveRegistry] = useState<
    GroupedToolRegistryResult[]
  >([]);
  const [sourceErrors, setSourceErrors] = useState<{[url: string]: string}>({});
  const [loading, setLoading] = useState(true);

  const loadRegistry = async (
    sources: PackageSource[],
    cacheMode: CacheMode
  ) => {
    setLoading(true);
    const results = await searchToolsGrouped(sources, cacheMode);

    // Extract errors from results
    const errors: {[url: string]: string} = {};
    for (const r of results) {
      if (r.error) {
        errors[r.sourceUrl] = r.error;
      }
    }
    setSourceErrors(errors);

    // Partition results by source enabled state
    const successResults = results.filter((r) => !r.error);
    const active: GroupedToolRegistryResult[] = [];
    const inactive: GroupedToolRegistryResult[] = [];

    for (const result of successResults) {
      const source = sources.find((s) =>
        s.type === 'local'
          ? result.sourceUrl === 'local'
          : s.url === result.sourceUrl
      );
      // enabled defaults to true if undefined
      if (source?.enabled === false) {
        inactive.push(result);
      } else {
        active.push(result);
      }
    }

    setActiveRegistry(active);
    setInactiveRegistry(inactive);
    setLoading(false);
  };

  const clearSourceError = (url: string) => {
    setSourceErrors((prev) => {
      const {[url]: _, ...rest} = prev;
      return rest;
    });
  };

  const setSourceError = (url: string, error: string) => {
    setSourceErrors((prev) => ({...prev, [url]: error}));
  };

  const moveToActive = (
    sourceUrl: string,
    data: GroupedToolRegistryResult
  ) => {
    setInactiveRegistry((prev) => prev.filter((r) => r.sourceUrl !== sourceUrl));
    setActiveRegistry((prev) => [...prev, data]);
  };

  const moveToInactive = (
    sourceUrl: string,
    data: GroupedToolRegistryResult
  ) => {
    setActiveRegistry((prev) => prev.filter((r) => r.sourceUrl !== sourceUrl));
    setInactiveRegistry((prev) => [...prev, data]);
  };

  const removeFromRegistries = (sourceUrl: string) => {
    setActiveRegistry((prev) => prev.filter((r) => r.sourceUrl !== sourceUrl));
    setInactiveRegistry((prev) =>
      prev.filter((r) => r.sourceUrl !== sourceUrl)
    );
  };

  const updateSourceInRegistry = (
    sourceUrl: string,
    data: GroupedToolRegistryResult,
    isEnabled: boolean
  ) => {
    if (isEnabled) {
      setActiveRegistry((prev) => {
        const filtered = prev.filter((r) => r.sourceUrl !== sourceUrl);
        return [...filtered, data];
      });
      setInactiveRegistry((prev) =>
        prev.filter((r) => r.sourceUrl !== sourceUrl)
      );
    } else {
      setInactiveRegistry((prev) => {
        const filtered = prev.filter((r) => r.sourceUrl !== sourceUrl);
        return [...filtered, data];
      });
      setActiveRegistry((prev) =>
        prev.filter((r) => r.sourceUrl !== sourceUrl)
      );
    }
  };

  return {
    activeRegistry,
    inactiveRegistry,
    sourceErrors,
    loading,
    loadRegistry,
    clearSourceError,
    setSourceError,
    moveToActive,
    moveToInactive,
    removeFromRegistries,
    updateSourceInRegistry
  };
}

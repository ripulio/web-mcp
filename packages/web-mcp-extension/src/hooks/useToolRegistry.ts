import {useState} from 'preact/hooks';
import type {PackageSource, GroupedToolRegistryResult} from '../shared.js';
import {searchToolsGrouped} from '../tool-registry.js';

export interface UseToolRegistryReturn {
  activeRegistry: GroupedToolRegistryResult[];
  sourceErrors: {[url: string]: string};
  loading: boolean;
  loadRegistry: (sources: PackageSource[]) => Promise<void>;
  clearSourceError: (url: string) => void;
  setSourceError: (url: string, error: string) => void;
  removeFromRegistries: (sourceUrl: string) => void;
}

export function useToolRegistry(): UseToolRegistryReturn {
  const [activeRegistry, setActiveRegistry] = useState<
    GroupedToolRegistryResult[]
  >([]);
  const [sourceErrors, setSourceErrors] = useState<{[url: string]: string}>({});
  const [loading, setLoading] = useState(true);

  const loadRegistry = async (sources: PackageSource[]) => {
    setLoading(true);
    // Use session cache - manifest cached until browser restart
    const results = await searchToolsGrouped(sources, 'session');

    // Extract errors from results
    const errors: {[url: string]: string} = {};
    for (const r of results) {
      if (r.error) {
        errors[r.sourceUrl] = r.error;
      }
    }
    setSourceErrors(errors);

    // All sources in the input array are enabled
    const successResults = results.filter((r) => !r.error);
    setActiveRegistry(successResults);
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

  const removeFromRegistries = (sourceUrl: string) => {
    setActiveRegistry((prev) => prev.filter((r) => r.sourceUrl !== sourceUrl));
  };

  return {
    activeRegistry,
    sourceErrors,
    loading,
    loadRegistry,
    clearSourceError,
    setSourceError,
    removeFromRegistries
  };
}

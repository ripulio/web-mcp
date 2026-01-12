import {useState, useEffect, useRef} from 'preact/hooks';
import type {GroupedToolRegistryResult} from '../shared.js';

export type DescriptionRefsType = {current: Map<string, HTMLSpanElement>};

export interface UseExpandableUIReturn {
  expandedGroups: Set<string>;
  expandedDescriptions: Set<string>;
  overflowingDescriptions: Set<string>;
  descriptionRefs: DescriptionRefsType;
  toggleGroup: (groupId: string) => void;
  toggleDescription: (key: string) => void;
}

export function useExpandableUI(
  activeRegistry: GroupedToolRegistryResult[]
): UseExpandableUIReturn {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(
    new Set()
  );
  const [overflowingDescriptions, setOverflowingDescriptions] = useState<
    Set<string>
  >(new Set());
  const descriptionRefs = useRef<Map<string, HTMLSpanElement>>(new Map());

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const toggleDescription = (key: string) => {
    setExpandedDescriptions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Check which descriptions are overflowing after render
  useEffect(() => {
    const newOverflowing = new Set<string>();
    descriptionRefs.current.forEach((el, key) => {
      if (el && el.scrollWidth > el.clientWidth) {
        newOverflowing.add(key);
      }
    });
    setOverflowingDescriptions(newOverflowing);
  }, [activeRegistry]);

  return {
    expandedGroups,
    expandedDescriptions,
    overflowingDescriptions,
    descriptionRefs,
    toggleGroup,
    toggleDescription
  };
}

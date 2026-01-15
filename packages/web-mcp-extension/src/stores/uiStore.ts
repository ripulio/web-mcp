import {signal, effect} from '@preact/signals';
import {activeRegistry} from './registryStore.js';

// Core signals
export const expandedGroups = signal<Set<string>>(new Set());
export const expandedDescriptions = signal<Set<string>>(new Set());
export const overflowingDescriptions = signal<Set<string>>(new Set());

// Plain Map for DOM refs (not a signal - doesn't need reactivity)
export const descriptionRefs = new Map<string, HTMLSpanElement>();

// Actions
export function toggleGroup(groupId: string): void {
  const next = new Set(expandedGroups.value);
  if (next.has(groupId)) {
    next.delete(groupId);
  } else {
    next.add(groupId);
  }
  expandedGroups.value = next;
}

export function toggleDescription(key: string): void {
  const next = new Set(expandedDescriptions.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  expandedDescriptions.value = next;
}

// Set up overflow detection (call once from panel.tsx)
export function initOverflowDetection(): () => void {
  const dispose = effect(() => {
    // Access activeRegistry to track it as dependency
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    activeRegistry.value;

    // Run after render via microtask
    queueMicrotask(() => {
      const newOverflowing = new Set<string>();
      descriptionRefs.forEach((el, key) => {
        if (el && el.scrollWidth > el.clientWidth) {
          newOverflowing.add(key);
        }
      });
      overflowingDescriptions.value = newOverflowing;
    });
  });

  return dispose;
}

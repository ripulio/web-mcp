import type {ToolRegistryEntry} from './types.js';
import {companiesHouseTools} from './tools/companies-house.js';
import {googleDocsTools} from './tools/google-docs.js';
import {googleSearchTools} from './tools/google-search.js';
import {googleSheetsTools} from './tools/google-sheets.js';

export type {ToolRegistryEntry};

export const registry: ToolRegistryEntry[] = [
  companiesHouseTools,
  googleDocsTools,
  googleSearchTools,
  googleSheetsTools
];

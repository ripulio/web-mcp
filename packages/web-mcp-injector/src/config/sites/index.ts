import {googleDocsConfig} from './google-docs.js';
import {googleSearchConfig} from './google-search.js';
import {googleSheetsConfig} from './google-sheets.js';
import type {SiteInjectionConfig} from '../types.js';

/**
 * Collection of site-specific injection configurations.
 * Additional configs can be appended to this array via PRs.
 */
export const siteInjectionConfigs: SiteInjectionConfig[] = [
  googleDocsConfig,
  googleSheetsConfig,
  googleSearchConfig
];

#!/usr/bin/env node

import {start} from './lib/main.js';

start().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

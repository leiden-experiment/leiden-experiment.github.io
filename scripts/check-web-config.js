#!/usr/bin/env node
const { loadWebConfig } = require('./web-config');
try {
  const config = loadWebConfig();
  console.log(`Valid web configuration: ${config.mode}${config.mode === 'online' ? ` (Firebase project: ${config.firebase.projectId})` : ''}`);
} catch (error) { console.error(`Invalid web setup: ${error.message}`); process.exitCode = 1; }

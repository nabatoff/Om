#!/usr/bin/env node
/** Reads deploy-payload.json and prints JSON args for deploy_edge_function (stdout). */
const fs = require('fs');
const path = require('path');
const payloadPath = path.join(__dirname, '..', 'deploy-payload.json');
const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
if (!payload.files || payload.files.length !== 6) {
  console.error('Expected 6 files, got', payload.files?.length ?? 0);
  process.exit(1);
}
process.stdout.write(JSON.stringify(payload));

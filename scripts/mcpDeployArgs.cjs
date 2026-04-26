// node scripts/mcpDeployArgs.cjs <mcp-*.json> — печать JSON-аргументов для deploy_edge_function (без костылей вручную)
const fs = require('fs');
const p = process.argv[2];
if (!p) {
  console.error('usage: node mcpDeployArgs.cjs <path-to-json>');
  process.exit(1);
}
process.stdout.write(fs.readFileSync(p, 'utf8'));

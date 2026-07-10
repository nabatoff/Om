const fs = require('fs');
const path = require('path');

async function main() {
  const payload = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'deploy-payload.json'), 'utf8'),
  );

  const initRes = await fetch('https://mcp.supabase.com/mcp?project_ref=mgmywszwjvluritlymfa', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'deploy-script', version: '1.0.0' },
      },
    }),
  });

  const initText = await initRes.text();
  console.log('INIT_STATUS', initRes.status);
  console.log('INIT_BODY', initText.slice(0, 500));

  const toolRes = await fetch('https://mcp.supabase.com/mcp?project_ref=mgmywszwjvluritlymfa', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'deploy_edge_function',
        arguments: payload,
      },
    }),
  });

  const toolText = await toolRes.text();
  console.log('TOOL_STATUS', toolRes.status);
  console.log('TOOL_BODY', toolText);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

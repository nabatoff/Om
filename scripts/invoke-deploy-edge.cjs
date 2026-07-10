const fs = require('fs');
const path = require('path');
const payloadPath = path.join(__dirname, '..', 'deploy-payload.json');
const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
process.stdout.write(JSON.stringify(payload));

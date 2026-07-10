const fs = require('fs');
const path = require('path');
const payload = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'deploy-payload.json'), 'utf8'));
module.exports = payload;

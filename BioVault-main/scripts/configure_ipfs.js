const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Read current IPFS config
const configPath = path.join(os.homedir(), '.ipfs', 'config');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Set CORS headers
config.API = config.API || {};
config.API.HTTPHeaders = config.API.HTTPHeaders || {};
config.API.HTTPHeaders['Access-Control-Allow-Origin'] = ['*'];
config.API.HTTPHeaders['Access-Control-Allow-Methods'] = ['PUT', 'POST', 'GET'];
config.API.HTTPHeaders['Access-Control-Allow-Headers'] = ['Authorization'];

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('IPFS CORS configured successfully');
console.log('Restart IPFS daemon for changes to take effect');

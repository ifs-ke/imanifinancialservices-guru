const fs = require('fs');
let content = fs.readFileSync('src/hooks/useSyncManager.ts', 'utf8');

content = content.replace("            method: 'GET',\n            signal: controller.signal,\n            headers: { 'Cache-Control': 'no-cache' },\n          });", "            method: 'GET',\n            signal: controller.signal,\n            headers: { 'Cache-Control': 'no-cache' },\n            credentials: 'same-origin',\n          });");

fs.writeFileSync('src/hooks/useSyncManager.ts', content);

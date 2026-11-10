const fs = require('fs');
let content = fs.readFileSync('src/hooks/useSyncManager.ts', 'utf8');

content = content.replace("            method: 'POST',\n            signal: saveController.signal,\n            headers: { 'Content-Type': 'application/json' },", "            method: 'POST',\n            signal: saveController.signal,\n            headers: { 'Content-Type': 'application/json' },\n            credentials: 'same-origin',");

fs.writeFileSync('src/hooks/useSyncManager.ts', content);

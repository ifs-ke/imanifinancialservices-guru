const fs = require('fs');
let content = fs.readFileSync('src/services/adminUserService.ts', 'utf8');

// Replace logError('Failed to fetch users from Firestore', error);
content = content.replace(
  "logError('Failed to fetch users from Firestore', error);",
  "logError('Failed to fetch users from Firestore', error, undefined, typeof window !== 'undefined' ? (document.cookie.match(/(?:(?:^|.*;\\s*)uid\\s*=\\s*([^;]*).*$)|^.*$/)?.[1] || 'client_no_uid') : 'server');"
);

fs.writeFileSync('src/services/adminUserService.ts', content);

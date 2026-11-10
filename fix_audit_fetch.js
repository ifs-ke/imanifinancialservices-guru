const fs = require('fs');
let content = fs.readFileSync('src/hooks/useSyncManager.ts', 'utf8');

const oldFetchAudit = `      // Perform client-side verification to prevent data leaks
      if (!performSecurityAudit()) {
        return false;
      }`;

const newFetchAudit = `      // Perform client-side verification to prevent data leaks
      // If a leak is found, it will wipe the local store. We should continue fetching the correct data.
      performSecurityAudit();`;

content = content.replace(oldFetchAudit, newFetchAudit);
fs.writeFileSync('src/hooks/useSyncManager.ts', content);

const fs = require('fs');
const content = fs.readFileSync('src/hooks/useSyncManager.ts', 'utf8');

const newContent = content.replace("const currentUserId = userId;\n      if (!isClerkLoaded", "const currentUserId = userId;\n\n      // Perform client-side verification to prevent data leaks\n      if (!performSecurityAudit()) {\n        return false;\n      }\n\n      if (!isClerkLoaded");
fs.writeFileSync('src/hooks/useSyncManager.ts', newContent);

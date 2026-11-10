const fs = require('fs');
let content = fs.readFileSync('src/hooks/useSyncManager.ts', 'utf8');

// Extract performSecurityAudit
const auditRegex = /  const performSecurityAudit = useCallback\(\(\) => \{[\s\S]*?\}, \[userId, clearAllLocalStoreData\]\);\n\n/;
const auditMatch = content.match(auditRegex);

if (auditMatch) {
  content = content.replace(auditMatch[0], '');
  // Insert it after clearAllLocalStoreData
  const clearLocalStoreRegex = /  const clearAllLocalStoreData = useCallback\(\(\) => \{[\s\S]*?\}, \[.*?\]\);\n/;
  const clearMatch = content.match(clearLocalStoreRegex);
  if (clearMatch) {
    content = content.replace(clearMatch[0], clearMatch[0] + '\n' + auditMatch[0]);
  }
}

fs.writeFileSync('src/hooks/useSyncManager.ts', content);

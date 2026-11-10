const fs = require('fs');
let content = fs.readFileSync('src/hooks/useSyncManager.ts', 'utf8');

content = content.replace("await withTimeout(fetchAllUserDataFromFirestore(currentUserId), 800);", "await withTimeout(fetchAllUserDataFromFirestore(currentUserId), 10000);");
content = content.replace("await withTimeout(saveAllUserDataToFirestore(currentUserId, fullPayload as any), 800);", "await withTimeout(saveAllUserDataToFirestore(currentUserId, fullPayload as any), 10000);");

fs.writeFileSync('src/hooks/useSyncManager.ts', content);

const fs = require('fs');
let content = fs.readFileSync('src/hooks/useSyncManager.ts', 'utf8');

content = content.replace("          } catch (_fsErr) {\n            // Local store fallback", "          } catch (_fsErr) {\n            console.error('Firestore fallback failed:', _fsErr);\n            // Local store fallback");

fs.writeFileSync('src/hooks/useSyncManager.ts', content);

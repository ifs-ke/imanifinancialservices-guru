const fs = require('fs');

function patchFile(path, condition) {
  let content = fs.readFileSync(path, 'utf8');
  if (content.includes('if (!isLoaded) return')) return; // Already patched
  
  const authLine = "  const { user } = useAuth();";
  const newAuthLine = `  const { user, isAdmin, isAuditor, isLoaded } = useAuth();\n\n  if (!isLoaded) return <div className="p-8 text-center">Loading...</div>;\n  if (${condition}) return <div className="p-8 text-center text-destructive">Unauthorized access</div>;`;
  
  content = content.replace(authLine, newAuthLine);
  fs.writeFileSync(path, content);
}

patchFile('src/app/(dashboard)/admin/page.tsx', '!isAdmin');
patchFile('src/app/(dashboard)/auditor/page.tsx', '!(isAuditor || isAdmin)');

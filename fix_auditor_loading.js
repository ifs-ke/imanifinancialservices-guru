const fs = require('fs');

function patchFile(path, condition) {
  let content = fs.readFileSync(path, 'utf8');
  if (!content.includes('import { LoadingSpinner }')) {
    content = content.replace("import { useAuth }", "import { LoadingSpinner } from '@/components/ui/loading-spinner';\nimport { useAuth }");
  }
  
  const loadingLine = `  if (!isLoaded) return <div className="p-8 text-center">Loading...</div>;`;
  const newLoadingLine = `  if (!isLoaded) return <div className="flex items-center justify-center min-h-[50vh]"><LoadingSpinner size={48} text="Authenticating..." /></div>;`;
  
  content = content.replace(loadingLine, newLoadingLine);
  fs.writeFileSync(path, content);
}

patchFile('src/app/(dashboard)/admin/page.tsx', '!isAdmin');
patchFile('src/app/(dashboard)/auditor/page.tsx', '!(isAuditor || isAdmin)');

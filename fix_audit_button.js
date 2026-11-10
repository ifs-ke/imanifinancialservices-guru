const fs = require('fs');
let content = fs.readFileSync('src/components/ui/sidebar.tsx', 'utf8');

const oldAudit = `                    onClick={() => {
                      const passed = syncManager.performSecurityAudit();
                      if (passed) {
                        alert('Security Audit Passed: Local store is clean and securely isolated.');
                      } else {
                        alert('Security Audit Failed: Data leak detected! Leaked data has been securely wiped.');
                      }
                    }}`;

const newAudit = `                    onClick={() => {
                      const passed = syncManager.performSecurityAudit();
                      if (passed) {
                        toast({
                          title: 'Security Audit Passed',
                          description: 'Local store is clean and securely isolated.',
                          variant: 'default',
                        });
                      } else {
                        toast({
                          title: 'Security Audit Failed',
                          description: 'Data leak detected! Leaked data has been securely wiped.',
                          variant: 'destructive',
                        });
                      }
                    }}`;

content = content.replace(oldAudit, newAudit);

const oldHandleSyncClick = `  const handleSyncClick = React.useCallback(() => {
    if (isFetchDisabled) return; // Do nothing in local-only mode
    if (!isClerkLoaded || !isSignedIn) {
      logWarn("Sync click attempted but user not signed in or Clerk not loaded.", { isSignedIn, isClerkLoaded, userId: user?.id});
      return;
    }
  }, [isClerkLoaded, isSignedIn, user?.id, isFetchDisabled]);`;

const newHandleSyncClick = `  const handleSyncClick = React.useCallback(() => {
    if (isFetchDisabled) return; // Do nothing in local-only mode
    if (!isClerkLoaded || !isSignedIn) {
      logWarn("Sync click attempted but user not signed in or Clerk not loaded.", { isSignedIn, isClerkLoaded, userId: user?.id});
      return;
    }
    if (syncStatus === 'local_changes' || syncStatus === 'offline_changes' || syncStatus === 'error' || syncStatus === 'error_local') {
      syncManager.forceSave();
    } else {
      syncManager.forceFetch();
    }
  }, [isClerkLoaded, isSignedIn, user?.id, isFetchDisabled, syncStatus, syncManager]);`;

content = content.replace(oldHandleSyncClick, newHandleSyncClick);
fs.writeFileSync('src/components/ui/sidebar.tsx', content);

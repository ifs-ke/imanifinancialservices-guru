const fs = require('fs');
const content = fs.readFileSync('src/hooks/useSyncManager.ts', 'utf8');

const auditFn = `
  const performSecurityAudit = useCallback(() => {
    let leakFound = false;
    let leakedItems = 0;
    const currentUserId = userId;
    
    if (!currentUserId) return true;

    const txs = getTransactionsState().transactions;
    const debts = getDebtState().debts;
    const budgetItems = getBudgetState().budgetItems;
    const assetItems = getStatementState().assetItems;

    const checkLeak = (item: any) => {
      if (item && item.userId && item.userId !== currentUserId) {
        leakFound = true;
        leakedItems++;
      }
    };

    txs.forEach(checkLeak);
    debts.forEach(checkLeak);
    budgetItems.forEach(checkLeak);
    assetItems.forEach(checkLeak);

    if (leakFound) {
      logError('Security Audit Failed: Data leak detected! Items found belonging to another user.', { leakedItems, currentUserId });
      clearAllLocalStoreData(); // Wipe the leaked data
      return false; // Audit failed
    }
    
    logInfo('Security Audit Passed: Local store is clean.', { currentUserId });
    return true; // Audit passed
  }, [userId, clearAllLocalStoreData]);

`;

const insertionPoint = "  const forceFetch = () => fetchData();\n";
const newContent = content.replace("  const clearAllLocalStoreData = useCallback(() => {", auditFn + "  const clearAllLocalStoreData = useCallback(() => {");
fs.writeFileSync('src/hooks/useSyncManager.ts', newContent);

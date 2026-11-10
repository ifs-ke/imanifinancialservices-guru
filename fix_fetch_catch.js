const fs = require('fs');
let content = fs.readFileSync('src/hooks/useSyncManager.ts', 'utf8');

const oldCatch = `      } catch (error: any) {
        setHasSuccessfulConnection(false);
        clearTimeout(timeoutId);
        if (controller.signal.aborted) {
          if (controller.signal.reason === API_TIMEOUT_ABORT_REASON) {
            updateSyncState({ status: 'synced' });
            return FETCH_TIMEOUT_SYMBOL;
          }
          return FETCH_ABORTED_BENIGNLY_SYMBOL;
        }
        logWarn('Sync fetch graceful fallback to offline snapshot', { userId: currentUserId });
        const cached = loadOfflineSnapshot(currentUserId);
        if (cached) {
          rehydrateStores(cached);
        }
        updateSyncState({ status: 'synced', isInitialClientSyncPending: false });
        return 'local-active-hash';
      } finally {`;

const newCatch = `      } catch (error: any) {
        setHasSuccessfulConnection(false);
        clearTimeout(timeoutId);
        if (controller.signal.aborted) {
          if (controller.signal.reason === API_TIMEOUT_ABORT_REASON) {
            updateSyncState({ status: 'error_local' });
            return FETCH_TIMEOUT_SYMBOL;
          }
          return FETCH_ABORTED_BENIGNLY_SYMBOL;
        }
        logError('Sync fetch failed, falling back to offline snapshot', error, { userId: currentUserId });
        const cached = loadOfflineSnapshot(currentUserId);
        if (cached) {
          rehydrateStores(cached);
          updateSyncState({ status: 'offline_changes', isInitialClientSyncPending: false });
        } else {
          updateSyncState({ status: 'error', isInitialClientSyncPending: false });
        }
        return 'local-active-hash';
      } finally {`;

content = content.replace(oldCatch, newCatch);

const oldIfDataNull = `        if (!isPreCheck && data) {
          rehydrateStores(data);
          const syncedSnapshot: SyncedData = {`;

const newIfDataNull = `        if (!data) {
          throw new Error('No data received from sync fetch or Firestore fallback');
        }
        if (!isPreCheck && data) {
          rehydrateStores(data);
          const syncedSnapshot: SyncedData = {`;

content = content.replace(oldIfDataNull, newIfDataNull);

fs.writeFileSync('src/hooks/useSyncManager.ts', content);

/**
 * Core collector orchestrator for telemetry sync.
 */

/**
 * Filter only terminal process statuses with finalized durations.
 * @param {Array<IProcessRow>} myRows - Input processes.
 * @return {Array<IProcessRow>} Filtered list.
 */
function myFilterCompletedOnly_(myRows) {
  return myRows.filter(function (myRow) {
    return myRow.processStatus !== MY_PROCESS_STATUS.RUNNING &&
      myRow.processStatus !== MY_PROCESS_STATUS.PAUSED &&
      myRow.processStatus !== MY_PROCESS_STATUS.DELAYED;
  });
}

/**
 * Execute full telemetry collection pass.
 * @return {Object} Sync statistics report.
 */
function myRunCollector() {
  const myLock = LockService.getScriptLock();
  if (!myLock.tryLock(10000)) {
    throw new Error('Could not obtain script lock. Another sync is active.');
  }

  try {
    const mySettings = myGetSettings();
    const myCursor = myGetCursor();
    let myStartIso = '';
    let myOverlapStartIso = '';

    if (!myCursor) {
      myStartIso = myGetDateNDaysAgo(MY_BOOTSTRAP_DAYS);
      myOverlapStartIso = myStartIso;
    } else {
      const myOverlapMs = new Date(myCursor).getTime() - (MY_CURSOR_OVERLAP_SEC * 1000);
      myStartIso = new Date(myOverlapMs).toISOString();
      myOverlapStartIso = myStartIso;
    }

    const myRawProcesses = myFetchAllUserProcesses(myStartIso, '');
    const myTerminalProcesses = myFilterCompletedOnly_(myRawProcesses);
    const myAddedCount = myAppendProcessesBatch(myTerminalProcesses, myOverlapStartIso);

    if (myTerminalProcesses.length > 0) {
      let myLatestMs = 0;
      myTerminalProcesses.forEach(function (myProc) {
        const myMs = new Date(myProc.startTime).getTime();
        if (myMs > myLatestMs) myLatestMs = myMs;
      });
      if (myLatestMs > 0) {
        mySetCursor(new Date(myLatestMs).toISOString());
      }
    }

    const myPrunedCount = myPruneExpiredRows(mySettings.retentionDays);
    const myCollectionTimeIso = new Date().toISOString();
    PropertiesService.getScriptProperties().setProperty(
      MY_PROP_KEYS.LAST_COLLECTION_TIME,
      myCollectionTimeIso
    );

    return {
      success: true,
      fetchedCount: myRawProcesses.length,
      savedCount: myAddedCount,
      prunedCount: myPrunedCount,
      cursor: myGetCursor(),
      lastCollectionTime: myCollectionTimeIso
    };
  } finally {
    myLock.releaseLock();
  }
}

/**
 * Get timestamp of last telemetry collection from Script Properties.
 * @return {string} ISO timestamp or empty string.
 */
function myGetLastCollectionTime() {
  return PropertiesService.getScriptProperties().getProperty(MY_PROP_KEYS.LAST_COLLECTION_TIME) || '';
}


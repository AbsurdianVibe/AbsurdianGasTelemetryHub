/**
 * Boundary API layer for WebApp client-side RPC calls.
 */

/**
 * Validate current caller is script owner.
 */
function myAssertOwner_() {
  const myActive = Session.getActiveUser().getEmail();
  const myEffective = Session.getEffectiveUser().getEmail();
  if (!myActive || myActive !== myEffective) {
    throw new Error('403 Forbidden: Access restricted to script owner.');
  }
}

/**
 * Get aggregated dashboard data for global time window and resolution.
 * @param {string} myFromIso - Start ISO timestamp.
 * @param {string} myToIso - End ISO timestamp.
 * @param {string} [myResolution] - Target resolution (auto, 1d, 1h, 30m, 15m, 5m, 1m).
 * @return {Object} Dashboard payload.
 */
function myApiGetDashboardData(myFromIso, myToIso, myResolution) {
  myAssertOwner_();
  const mySettings = myGetSettings();
  let myStart = myParseTimestampIso(myFromIso);
  let myEnd = myParseTimestampIso(myToIso);

  if (!myStart) {
    myStart = myGetDateNDaysAgo(mySettings.retentionDays || MY_DEFAULT_RETENTION_DAYS);
  }

  const myRows = myReadProcessesRange(myStart, myEnd);
  const myAggregated = myAggregateDataset(
    myRows,
    mySettings.quotaLimitSec,
    MY_DEFAULT_TIMEZONE,
    myStart,
    myEnd,
    myResolution
  );
  return {
    dashboard: myAggregated,
    settings: mySettings,
    lastSync: myGetCursor(),
    timeWindow: {
      fromIso: myStart,
      toIso: myEnd || new Date().toISOString()
    }
  };
}

/**
 * Ultra-fast check of telemetry freshness using Script Properties.
 * @param {string} myClientLastSyncIso - Client last known collection timestamp.
 * @return {{ isStale: boolean, serverLastSync: string }} Freshness status.
 */
function myApiCheckTelemetryFreshness(myClientLastSyncIso) {
  myAssertOwner_();
  const myServerLast = myGetLastCollectionTime();
  const myServerMs = myServerLast ? new Date(myServerLast).getTime() : 0;
  const myClientMs = myClientLastSyncIso ? new Date(myClientLastSyncIso).getTime() : 0;

  return {
    isStale: myServerMs > myClientMs,
    serverLastSync: myServerLast
  };
}

/**
 * Get initial full dataset within retention window and settings.
 * @return {Object} Full dataset payload.
 */
function myApiGetInitialDataset() {
  myAssertOwner_();
  const mySettings = myGetSettings();
  const myCutoffIso = myGetDateNDaysAgo(mySettings.retentionDays || MY_DEFAULT_RETENTION_DAYS);
  const myRows = myReadProcessesRange(myCutoffIso, '');

  return {
    processes: myRows,
    settings: mySettings,
    lastSync: myGetCursor(),
    lastCollectionTime: myGetLastCollectionTime(),
    retentionCutoff: myCutoffIso
  };
}

/**
 * Get only new processes appended after given timestamp.
 * @param {string} mySinceIso - Timestamp threshold.
 * @return {Object} Delta payload.
 */
function myApiGetDeltaProcesses(mySinceIso) {
  myAssertOwner_();
  const myRows = myReadProcessesSince(mySinceIso);
  return {
    delta: myRows,
    lastSync: myGetCursor(),
    lastCollectionTime: myGetLastCollectionTime()
  };
}

/**
 * Trigger manual telemetry synchronization and return refreshed initial dataset.
 * @return {Object} Updated full dataset.
 */
function myApiTriggerManualSync() {
  myAssertOwner_();
  myRunCollector();
  return myApiGetInitialDataset();
}

/**
 * Update application settings.
 * @param {Object} myPatch - Settings patch.
 * @return {ISettings} Saved settings.
 */
function myApiUpdateSettings(myPatch) {
  myAssertOwner_();
  return mySaveSettings(myPatch);
}


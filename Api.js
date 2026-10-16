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
 * Trigger manual telemetry synchronization.
 * @param {string} myFromIso - Start ISO timestamp.
 * @param {string} myToIso - End ISO timestamp.
 * @param {string} [myResolution] - Target resolution.
 * @return {Object} Updated dashboard data.
 */
function myApiTriggerManualSync(myFromIso, myToIso, myResolution) {
  myAssertOwner_();
  myRunCollector();
  return myApiGetDashboardData(myFromIso, myToIso, myResolution);
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

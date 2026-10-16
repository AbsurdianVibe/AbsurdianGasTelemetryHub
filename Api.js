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
 * Get aggregated dashboard data for global time window.
 * @param {string} myFromIso - Start ISO timestamp.
 * @param {string} myToIso - End ISO timestamp.
 * @return {Object} Dashboard payload.
 */
function myApiGetDashboardData(myFromIso, myToIso) {
  myAssertOwner_();
  const mySettings = myGetSettings();
  let myStart = myParseTimestampIso(myFromIso);
  let myEnd = myParseTimestampIso(myToIso);

  if (!myStart) {
    myStart = myGetDateNDaysAgo(mySettings.retentionDays || MY_DEFAULT_RETENTION_DAYS);
  }

  const myRows = myReadProcessesRange(myStart, myEnd);
  const myAggregated = myAggregateDataset(myRows, mySettings.quotaLimitSec, MY_DEFAULT_TIMEZONE);
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
 * @return {Object} Updated dashboard data.
 */
function myApiTriggerManualSync(myFromIso, myToIso) {
  myAssertOwner_();
  myRunCollector();
  return myApiGetDashboardData(myFromIso, myToIso);
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

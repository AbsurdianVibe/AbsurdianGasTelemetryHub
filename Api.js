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
 * Get aggregated dashboard data.
 * @param {number} myDaysRange - Lookback days range.
 * @return {Object} Dashboard payload.
 */
function myApiGetDashboardData(myDaysRange) {
  myAssertOwner_();
  const myRange = Math.max(1, Math.min(180, Number(myDaysRange) || MY_DEFAULT_RETENTION_DAYS));
  const mySettings = myGetSettings();
  const myFromIso = myGetDateNDaysAgo(myRange);
  const myRows = myReadProcessesRange(myFromIso, '');
  const myAggregated = myAggregateDataset(myRows, mySettings.quotaLimitSec, MY_DEFAULT_TIMEZONE);
  return {
    dashboard: myAggregated,
    settings: mySettings,
    lastSync: myGetCursor()
  };
}

/**
 * Trigger manual telemetry synchronization.
 * @return {Object} Updated dashboard data.
 */
function myApiTriggerManualSync() {
  myAssertOwner_();
  myRunCollector();
  return myApiGetDashboardData(MY_DEFAULT_RETENTION_DAYS);
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

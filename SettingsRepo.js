/**
 * Repository for script settings and synchronization cursor.
 *
 * @typedef {Object} ISettings
 * @property {number} retentionDays - Data retention in days.
 * @property {number} quotaLimitSec - Daily trigger quota limit in seconds.
 */

/**
 * Read application settings from script properties.
 * @return {ISettings} Validated settings object.
 */
function myGetSettings() {
  const myRaw = PropertiesService.getScriptProperties().getProperty(MY_PROP_KEYS.SETTINGS_JSON);
  if (!myRaw) {
    return {
      retentionDays: MY_DEFAULT_RETENTION_DAYS,
      quotaLimitSec: MY_DEFAULT_QUOTA_LIMIT_SEC
    };
  }

  try {
    const myParsed = JSON.parse(myRaw);
    return {
      retentionDays: Number(myParsed.retentionDays) || MY_DEFAULT_RETENTION_DAYS,
      quotaLimitSec: Number(myParsed.quotaLimitSec) || MY_DEFAULT_QUOTA_LIMIT_SEC
    };
  } catch (myErr) {
    return {
      retentionDays: MY_DEFAULT_RETENTION_DAYS,
      quotaLimitSec: MY_DEFAULT_QUOTA_LIMIT_SEC
    };
  }
}

/**
 * Save application settings patch to script properties.
 * @param {Object} myPatch - Partial settings object.
 * @return {ISettings} Updated settings.
 */
function mySaveSettings(myPatch) {
  if (!myPatch || typeof myPatch !== 'object') {
    throw new Error('Invalid settings payload');
  }

  const myCurrent = myGetSettings();
  if (myPatch.retentionDays !== undefined) {
    const myDays = Number(myPatch.retentionDays);
    if (myDays < MY_MIN_RETENTION_DAYS || myDays > MY_MAX_RETENTION_DAYS) {
      throw new Error('Retention days out of range [' + MY_MIN_RETENTION_DAYS + '-' + MY_MAX_RETENTION_DAYS + ']');
    }
    myCurrent.retentionDays = myDays;
  }

  if (myPatch.quotaLimitSec !== undefined) {
    const myQuota = Number(myPatch.quotaLimitSec);
    if (myQuota > 0) myCurrent.quotaLimitSec = myQuota;
  }

  PropertiesService.getScriptProperties().setProperty(
    MY_PROP_KEYS.SETTINGS_JSON,
    JSON.stringify(myCurrent)
  );
  return myCurrent;
}

/**
 * Read last sync cursor timestamp.
 * @return {string} ISO timestamp or empty string.
 */
function myGetCursor() {
  return PropertiesService.getScriptProperties().getProperty(MY_PROP_KEYS.CURSOR_START_TIME) || '';
}

/**
 * Save last sync cursor timestamp.
 * @param {string} myIsoString - ISO timestamp.
 */
function mySetCursor(myIsoString) {
  if (!myIsoString) return;
  PropertiesService.getScriptProperties().setProperty(
    MY_PROP_KEYS.CURSOR_START_TIME,
    myIsoString
  );
}

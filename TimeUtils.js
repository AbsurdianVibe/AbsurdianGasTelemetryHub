/**
 * Date, time and duration helper utilities.
 */

/**
 * Convert date input to ISO 8601 string.
 * @param {string|Date} myInput - Date string or Date object.
 * @return {string} ISO string or empty string.
 */
function myParseTimestampIso(myInput) {
  if (!myInput) return '';
  const myDate = new Date(myInput);
  return isNaN(myDate.getTime()) ? '' : myDate.toISOString();
}

/**
 * Format duration seconds to readable string.
 * @param {number} mySec - Duration in seconds.
 * @return {string} Formatted string.
 */
function myFormatSeconds(mySec) {
  if (mySec < 60) return mySec.toFixed(2) + 's';
  const myMinutes = Math.floor(mySec / 60);
  const myRemainderSec = (mySec % 60).toFixed(1);
  if (myMinutes < 60) return myMinutes + 'm ' + myRemainderSec + 's';
  return Math.floor(myMinutes / 60) + 'h ' + (myMinutes % 60) + 'm ' + myRemainderSec + 's';
}

/**
 * Format date to YYYY-MM-DD key using target timezone.
 * @param {string|Date} myDateVal - Date value.
 * @param {string} myTz - Time zone string.
 * @return {string} Day key string.
 */
function myGetDayKey(myDateVal, myTz) {
  const myDate = new Date(myDateVal);
  if (isNaN(myDate.getTime())) return '';
  return Utilities.formatDate(myDate, myTz || MY_DEFAULT_TIMEZONE, 'yyyy-MM-dd');
}

/**
 * Get ISO timestamp N days ago from now.
 * @param {number} myDays - Number of days to look back.
 * @return {string} ISO date string.
 */
function myGetDateNDaysAgo(myDays) {
  const myDate = new Date();
  myDate.setDate(myDate.getDate() - myDays);
  return myDate.toISOString();
}

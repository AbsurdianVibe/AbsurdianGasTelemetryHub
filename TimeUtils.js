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

/**
 * Determine dynamic resolution based on duration range.
 * @param {string} myFromIso - Start ISO timestamp.
 * @param {string} myToIso - End ISO timestamp.
 * @return {string} Resolution code (1d, 1h, 30m, 15m, 5m, 1m).
 */
function myResolveAutoResolution(myFromIso, myToIso) {
  const myFromMs = myFromIso ? new Date(myFromIso).getTime() : 0;
  const myToMs = myToIso ? new Date(myToIso).getTime() : new Date().getTime();
  const myDiffHours = Math.max(0, (myToMs - myFromMs) / 3600000);

  if (myDiffHours > 336) return '1d';
  if (myDiffHours > 72) return '1h';
  if (myDiffHours > 24) return '30m';
  if (myDiffHours > 6) return '15m';
  if (myDiffHours > 2) return '5m';
  return '1m';
}

/**
 * Get bucket interval in milliseconds.
 * @param {string} myResolution - Resolution code.
 * @return {number} Milliseconds per bucket.
 */
function myGetBucketStepMs(myResolution) {
  if (myResolution === '1d') return 86400000;
  if (myResolution === '1h') return 3600000;
  if (myResolution === '30m') return 1800000;
  if (myResolution === '15m') return 900000;
  if (myResolution === '5m') return 300000;
  return 60000;
}

/**
 * Format timestamp into bucket key using target resolution and timezone.
 * @param {string|Date|number} myDateVal - Date value.
 * @param {string} myResolution - Target resolution (1d, 1h, 30m, 15m, 5m, 1m).
 * @param {string} myTz - Time zone string.
 * @return {string} Bucket key string.
 */
function myGetBucketKey(myDateVal, myResolution, myTz) {
  const myDate = new Date(myDateVal);
  if (isNaN(myDate.getTime())) return '';
  const myTimezone = myTz || MY_DEFAULT_TIMEZONE;

  if (myResolution === '1d') {
    return Utilities.formatDate(myDate, myTimezone, 'yyyy-MM-dd');
  }
  if (myResolution === '1h') {
    return Utilities.formatDate(myDate, myTimezone, 'yyyy-MM-dd HH:00');
  }

  const myDateStr = Utilities.formatDate(myDate, myTimezone, 'yyyy-MM-dd HH:mm');
  const myParts = myDateStr.split(' ');
  const myYmd = myParts[0];
  const myHm = myParts[1].split(':');
  const myH = myHm[0];
  const myM = parseInt(myHm[1], 10);

  let myStep = 1;
  if (myResolution === '30m') myStep = 30;
  else if (myResolution === '15m') myStep = 15;
  else if (myResolution === '5m') myStep = 5;

  const myBucketM = Math.floor(myM / myStep) * myStep;
  const myPaddedM = myBucketM < 10 ? '0' + myBucketM : '' + myBucketM;
  return myYmd + ' ' + myH + ':' + myPaddedM;
}

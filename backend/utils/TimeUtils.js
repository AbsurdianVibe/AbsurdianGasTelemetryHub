/**
 * Server-side date formatting, duration helpers, and time-series bucket calculations.
 *
 * Converts timestamps into ISO strings and timezone-aware calendar day keys (`yyyy-MM-dd`)
 * for daily quota calculations. Also selects automatic chart resolution from range length,
 * falls back to dynamic minute buckets when a fixed step would exceed 1000 continuous points,
 * and formats timestamps into matching bucket keys during server-side aggregation.
 *
 * Loaded early via `filePushOrder` because it defines top-level bucket limit constants.
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

const MY_MAX_CONTINUOUS_BUCKETS = 1000;

/**
 * Parse time range bounds into millisecond timestamps.
 * @param {string} myFromIso - Start ISO timestamp.
 * @param {string} myToIso - End ISO timestamp.
 * @return {Object} Start and end millisecond bounds.
 */
function myParseTimeRangeMs_(myFromIso, myToIso) {
  const myStartMs = myFromIso ? new Date(myFromIso).getTime() : 0;
  const myEndMs = myToIso ? new Date(myToIso).getTime() : Date.now();
  return {
    startMs: isNaN(myStartMs) ? 0 : myStartMs,
    endMs: isNaN(myEndMs) ? Date.now() : myEndMs
  };
}

/**
 * Get bucket interval in milliseconds.
 * @param {string} myResolution - Resolution code or dynamic minute string.
 * @return {number} Milliseconds per bucket.
 */
function myGetBucketStepMs(myResolution) {
  if (myResolution === '1d') return 86400000;
  if (myResolution === '1h') return 3600000;
  if (myResolution && myResolution.endsWith('m')) {
    const myMins = parseInt(myResolution, 10);
    if (!isNaN(myMins) && myMins > 0) return myMins * 60000;
  }
  return 60000;
}

/**
 * Count bucket intervals between start and end timestamps.
 * @param {string} myFromIso - Start ISO timestamp.
 * @param {string} myToIso - End ISO timestamp.
 * @param {string} myResolution - Target resolution code.
 * @return {number} Estimated bucket interval count.
 */
function myEstimateBucketSteps(myFromIso, myToIso, myResolution) {
  const myRange = myParseTimeRangeMs_(myFromIso, myToIso);
  if (!myFromIso || myRange.endMs <= myRange.startMs) return 0;
  return Math.floor((myRange.endMs - myRange.startMs) / myGetBucketStepMs(myResolution));
}

/**
 * Resolve dynamic minute step that keeps bucket count within MY_MAX_CONTINUOUS_BUCKETS.
 * @param {string} myFromIso - Start ISO timestamp.
 * @param {string} myToIso - End ISO timestamp.
 * @return {number} Whole-minute bucket step (at least 1).
 */
function myResolveMaxStepMinutes(myFromIso, myToIso) {
  const myRange = myParseTimeRangeMs_(myFromIso, myToIso);
  if (!myFromIso || myRange.endMs <= myRange.startMs) return 1;
  return Math.max(1, Math.ceil(((myRange.endMs - myRange.startMs) / 60000) / MY_MAX_CONTINUOUS_BUCKETS));
}

/**
 * Resolve effective aggregation parameters for auto, max, or fixed resolution.
 * @param {string} myFromIso - Start ISO timestamp.
 * @param {string} myToIso - End ISO timestamp.
 * @param {string} [myRequestedResolution] - Requested resolution code.
 * @return {Object} Effective resolution descriptor.
 */
function myResolveEffectiveAggregationSpec(myFromIso, myToIso, myRequestedResolution) {
  const myRange = myParseTimeRangeMs_(myFromIso, myToIso);
  const myRes = myRequestedResolution || 'auto';

  if (myRes === 'auto') {
    const myAutoRes = myResolveAutoResolution(myFromIso, myToIso);
    return {
      resolution: myAutoRes,
      label: myAutoRes,
      stepMs: myGetBucketStepMs(myAutoRes),
      originMs: myRange.startMs,
      endMs: myRange.endMs,
      hasRange: Boolean(myFromIso),
      isDynamic: false
    };
  }

  if (myRes === 'max' || myEstimateBucketSteps(myFromIso, myToIso, myRes) > MY_MAX_CONTINUOUS_BUCKETS) {
    const myStepMin = myResolveMaxStepMinutes(myFromIso, myToIso);
    return {
      resolution: 'max',
      label: myStepMin + 'm',
      stepMs: myStepMin * 60000,
      originMs: Math.floor(myRange.startMs / 60000) * 60000,
      endMs: myRange.endMs,
      hasRange: Boolean(myFromIso),
      isDynamic: true
    };
  }

  return {
    resolution: myRes,
    label: myRes,
    stepMs: myGetBucketStepMs(myRes),
    originMs: myRange.startMs,
    endMs: myRange.endMs,
    hasRange: Boolean(myFromIso),
    isDynamic: false
  };
}

/**
 * Format timestamp into fixed-calendar or origin-anchored dynamic bucket key.
 * @param {string|Date|number} myDateVal - Date value.
 * @param {string|Object} myResolutionOrSpec - Resolution code or aggregation spec.
 * @param {string} myTz - Time zone string.
 * @return {string} Bucket key string.
 */
function myGetBucketKey(myDateVal, myResolutionOrSpec, myTz) {
  const myDate = new Date(myDateVal);
  if (isNaN(myDate.getTime())) return '';
  const myTimezone = myTz || MY_DEFAULT_TIMEZONE;

  if (myResolutionOrSpec && typeof myResolutionOrSpec === 'object' && myResolutionOrSpec.isDynamic) {
    const myStepIndex = Math.max(0, Math.floor((myDate.getTime() - myResolutionOrSpec.originMs) / myResolutionOrSpec.stepMs));
    return Utilities.formatDate(new Date(myResolutionOrSpec.originMs + (myStepIndex * myResolutionOrSpec.stepMs)), myTimezone, 'yyyy-MM-dd HH:mm');
  }

  const myResolution = (myResolutionOrSpec && typeof myResolutionOrSpec === 'object') ? myResolutionOrSpec.resolution : myResolutionOrSpec;
  if (myResolution === '1d') {
    return Utilities.formatDate(myDate, myTimezone, 'yyyy-MM-dd');
  }
  if (myResolution === '1h') {
    return Utilities.formatDate(myDate, myTimezone, 'yyyy-MM-dd HH:00');
  }

  const myParts = Utilities.formatDate(myDate, myTimezone, 'yyyy-MM-dd HH:mm').split(' ');
  const myHm = myParts[1].split(':');
  const myStep = myResolution === '30m' ? 30 : (myResolution === '15m' ? 15 : (myResolution === '5m' ? 5 : 1));
  const myBucketM = Math.floor(parseInt(myHm[1], 10) / myStep) * myStep;
  return myParts[0] + ' ' + myHm[0] + ':' + (myBucketM < 10 ? '0' + myBucketM : '' + myBucketM);
}

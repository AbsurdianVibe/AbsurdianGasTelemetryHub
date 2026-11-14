/**
 * In-memory aggregation engine for processes telemetry.
 */

/**
 * Calculate percentile value from array of numbers.
 * @param {Array<number>} myNumbers - List of numbers.
 * @param {number} myPercentile - Target percentile (e.g. 95).
 * @return {number} Calculated percentile.
 */
function myCalculatePercentile_(myNumbers, myPercentile) {
  if (!myNumbers || myNumbers.length === 0) return 0;
  const mySorted = myNumbers.slice().sort(function (a, b) { return a - b; });
  const myIndex = Math.ceil((myPercentile / 100) * mySorted.length) - 1;
  return Number(mySorted[Math.max(0, myIndex)].toFixed(2));
}

/**
 * Initialize new project summary entry.
 * @param {string} myProjectName - Project identifier.
 * @return {Object} Empty project summary object.
 */
function myInitProjectSummary_(myProjectName) {
  return {
    projectName: myProjectName,
    totalSec: 0,
    count: 0,
    failCount: 0,
    functions: {}
  };
}

/**
 * Initialize new function summary entry.
 * @param {string} myFunctionName - Function identifier.
 * @return {Object} Empty function summary object.
 */
function myInitFunctionSummary_(myFunctionName) {
  return {
    functionName: myFunctionName,
    totalSec: 0,
    count: 0,
    minSec: Infinity,
    maxSec: 0,
    durations: [],
    statuses: {}
  };
}

/**
 * Initialize empty series bucket object.
 * @param {string} myBucketKey - Bucket identifier.
 * @return {Object} Empty series bucket.
 */
function myCreateSeriesBucket_(myBucketKey) {
  return {
    bucketKey: myBucketKey,
    triggerSec: 0,
    totalSec: 0,
    count: 0,
    byProject: {},
    byProjectMax: {},
    byProjectMaxFn: {}
  };
}

/**
 * Pre-fill empty continuous series buckets when count stays within safe limit.
 * @param {Object} mySeriesBuckets - Mutable map of series buckets keyed by label.
 * @param {Object} mySpec - Effective aggregation specification.
 * @param {string} myTimezone - Target timezone name.
 */
function myPrefillSeriesBuckets_(mySeriesBuckets, mySpec, myTimezone) {
  if (!mySpec.hasRange || mySpec.endMs < mySpec.originMs) return;
  const myStepsCount = Math.floor((mySpec.endMs - mySpec.originMs) / mySpec.stepMs);
  if (myStepsCount < 0 || myStepsCount > MY_MAX_CONTINUOUS_BUCKETS) return;

  for (let myCurrMs = mySpec.originMs; myCurrMs <= mySpec.endMs; myCurrMs += mySpec.stepMs) {
    const myFillKey = myGetBucketKey(new Date(myCurrMs), mySpec, myTimezone);
    if (myFillKey && !mySeriesBuckets[myFillKey]) {
      mySeriesBuckets[myFillKey] = myCreateSeriesBucket_(myFillKey);
    }
  }
}

/**
 * Clone project duration map with values rounded to one decimal place.
 * @param {Object} mySourceMap - Map of project name to duration seconds.
 * @return {Object} Rounded project duration map.
 */
function myRoundProjectMap_(mySourceMap) {
  const myResult = {};
  Object.keys(mySourceMap).forEach(function (myKey) {
    myResult[myKey] = Number(mySourceMap[myKey].toFixed(1));
  });
  return myResult;
}

/**
 * Sum numeric values inside a project duration map.
 * @param {Object} mySourceMap - Map of project name to duration seconds.
 * @return {number} Total seconds across all entries.
 */
function mySumProjectValues_(mySourceMap) {
  let mySum = 0;
  Object.keys(mySourceMap).forEach(function (myKey) {
    mySum += mySourceMap[myKey] || 0;
  });
  return mySum;
}

/**
 * Populate daily cumulative trigger quota totals and per-project maps on sorted buckets.
 * @param {Array<Object>} mySeriesList - Sorted time-series buckets.
 * @param {number} myQuotaLimitSec - Daily quota limit in seconds.
 * @param {string} [mySeedDayKey] - Calendar day key (YYYY-MM-DD) eligible for pre-window seed.
 * @param {Object} [mySeedByProject] - Pre-window trigger durations collected before myFromIso.
 */
function myAppendCumulativeQuota_(mySeriesList, myQuotaLimitSec, mySeedDayKey, mySeedByProject) {
  let myCurrentDay = '';
  let myRunningTotal = 0;
  let myRunningByProject = {};

  mySeriesList.forEach(function (myItem) {
    const myDay = (myItem.bucketKey || '').slice(0, 10);
    if (myDay !== myCurrentDay) {
      myCurrentDay = myDay;
      myRunningByProject = (mySeedDayKey && myDay === mySeedDayKey && mySeedByProject)
        ? Object.assign({}, mySeedByProject)
        : {};
      myRunningTotal = mySumProjectValues_(myRunningByProject);
    }
    myRunningTotal += myItem.triggerSec || 0;

    const myProjMap = myItem.byProject || {};
    Object.keys(myProjMap).forEach(function (myProjName) {
      myRunningByProject[myProjName] = (myRunningByProject[myProjName] || 0) + myProjMap[myProjName];
    });

    myItem.cumulativeTriggerSec = Number(myRunningTotal.toFixed(1));
    myItem.cumulativePercentUsed = myQuotaLimitSec > 0
      ? Number(((myRunningTotal / myQuotaLimitSec) * 100).toFixed(1))
      : 0;
    myItem.byProjectCumulative = myRoundProjectMap_(myRunningByProject);
  });
}

/**
 * Aggregate processes dataset into frontend DTO.
 * @param {Array<IProcessRow>} myRows - Raw process rows.
 * @param {number} myQuotaLimitSec - Quota limit in seconds.
 * @param {string} myTz - Timezone.
 * @param {string} [myFromIso] - Start ISO timestamp.
 * @param {string} [myToIso] - End ISO timestamp.
 * @param {string} [myRequestedResolution] - Target resolution (auto, max, 1d, 1h, 30m, 15m, 5m, 1m).
 * @param {Object} [mySeedByProject] - Optional pre-window trigger quota map for first day start.
 * @return {Object} Aggregated dashboard DTO.
 */
function myAggregateDataset(myRows, myQuotaLimitSec, myTz, myFromIso, myToIso, myRequestedResolution, mySeedByProject) {
  const myProjects = {};
  const mySeriesBuckets = {};
  let myTotalDurationSec = 0;
  let myTotalFailures = 0;
  let myLastFullDayQuotaSec = 0;

  const myTimezone = myTz || MY_DEFAULT_TIMEZONE;
  const myYesterday = new Date(Date.now() - 86400000);
  const myLastFullDayKey = myGetDayKey(myYesterday, myTimezone);

  const mySpec = myResolveEffectiveAggregationSpec(myFromIso, myToIso, myRequestedResolution);
  const myEffectiveResolution = mySpec.label;

  myPrefillSeriesBuckets_(mySeriesBuckets, mySpec, myTimezone);

  myRows.forEach(function (myRow) {
    myTotalDurationSec += myRow.durationSec;
    const myIsFail = myRow.processStatus === MY_PROCESS_STATUS.FAILED ||
      myRow.processStatus === MY_PROCESS_STATUS.TIMED_OUT;
    if (myIsFail) myTotalFailures++;

    const myIsQuotaType = myRow.processType === MY_PROCESS_TYPE.TIME_DRIVEN ||
      myRow.processType === MY_PROCESS_TYPE.TRIGGER;

    // Track last completed day quota independently of chart range
    const myRowDay = myGetDayKey(myRow.startTime, myTimezone);
    if (myRowDay === myLastFullDayKey && myIsQuotaType) {
      myLastFullDayQuotaSec += myRow.durationSec;
    }

    // 1. Time-series bucket accumulation
    const myBucketKey = myGetBucketKey(myRow.startTime, mySpec, myTimezone);
    if (myBucketKey) {
      if (!mySeriesBuckets[myBucketKey]) {
        mySeriesBuckets[myBucketKey] = myCreateSeriesBucket_(myBucketKey);
      }
      mySeriesBuckets[myBucketKey].totalSec += myRow.durationSec;
      mySeriesBuckets[myBucketKey].count++;
      const myPrevMax = mySeriesBuckets[myBucketKey].byProjectMax[myRow.projectName] || 0;
      if (myRow.durationSec >= myPrevMax) {
        mySeriesBuckets[myBucketKey].byProjectMax[myRow.projectName] = myRow.durationSec;
        mySeriesBuckets[myBucketKey].byProjectMaxFn[myRow.projectName] = myRow.functionName;
      }
      if (myIsQuotaType) {
        mySeriesBuckets[myBucketKey].triggerSec += myRow.durationSec;
        mySeriesBuckets[myBucketKey].byProject[myRow.projectName] =
          (mySeriesBuckets[myBucketKey].byProject[myRow.projectName] || 0) + myRow.durationSec;
      }
    }

    // 2. Project & function breakdown
    if (!myProjects[myRow.projectName]) {
      myProjects[myRow.projectName] = myInitProjectSummary_(myRow.projectName);
    }
    const myProj = myProjects[myRow.projectName];
    myProj.totalSec += myRow.durationSec;
    myProj.count++;
    if (myIsFail) myProj.failCount++;

    if (!myProj.functions[myRow.functionName]) {
      myProj.functions[myRow.functionName] = myInitFunctionSummary_(myRow.functionName);
    }
    const myFn = myProj.functions[myRow.functionName];
    myFn.totalSec += myRow.durationSec;
    myFn.count++;
    myFn.minSec = Math.min(myFn.minSec, myRow.durationSec);
    myFn.maxSec = Math.max(myFn.maxSec, myRow.durationSec);
    myFn.durations.push(myRow.durationSec);
    myFn.statuses[myRow.processStatus] = (myFn.statuses[myRow.processStatus] || 0) + 1;
  });

  const myProjectsList = Object.keys(myProjects).map(function (myProjName) {
    const myP = myProjects[myProjName];
    const myFunctionsList = Object.keys(myP.functions).map(function (myFnName) {
      const myF = myP.functions[myFnName];
      return {
        functionName: myF.functionName,
        count: myF.count,
        totalSec: Number(myF.totalSec.toFixed(2)),
        avgSec: Number((myF.totalSec / myF.count).toFixed(2)),
        minSec: myF.minSec === Infinity ? 0 : Number(myF.minSec.toFixed(2)),
        maxSec: Number(myF.maxSec.toFixed(2)),
        p95Sec: myCalculatePercentile_(myF.durations, 95),
        statuses: myF.statuses
      };
    }).sort(function (a, b) { return b.totalSec - a.totalSec; });

    return {
      projectName: myP.projectName,
      totalSec: Number(myP.totalSec.toFixed(2)),
      count: myP.count,
      failCount: myP.failCount,
      functions: myFunctionsList
    };
  }).sort(function (a, b) { return b.totalSec - a.totalSec; });

  const mySeriesList = Object.keys(mySeriesBuckets).sort().map(function (myK) {
    const myItem = mySeriesBuckets[myK];
    return {
      dayKey: myItem.bucketKey,
      bucketKey: myItem.bucketKey,
      triggerSec: Number(myItem.triggerSec.toFixed(1)),
      totalSec: Number(myItem.totalSec.toFixed(1)),
      count: myItem.count,
      percentUsed: Number(((myItem.triggerSec / myQuotaLimitSec) * 100).toFixed(1)),
      byProject: myItem.byProject,
      byProjectMax: myItem.byProjectMax,
      byProjectMaxFn: myItem.byProjectMaxFn
    };
  });
  const myFirstDayKey = myFromIso ? myGetDayKey(myFromIso, myTimezone) : '';
  myAppendCumulativeQuota_(mySeriesList, myQuotaLimitSec, myFirstDayKey, mySeedByProject);

  const myLastFullDayQuotaPercent = Number(((myLastFullDayQuotaSec / myQuotaLimitSec) * 100).toFixed(1));

  return {
    summary: {
      totalRuns: myRows.length,
      totalDurationSec: Number(myTotalDurationSec.toFixed(1)),
      totalFailures: myTotalFailures,
      failureRate: myRows.length > 0 ? Number(((myTotalFailures / myRows.length) * 100).toFixed(1)) : 0,
      todayQuotaSec: Number(myLastFullDayQuotaSec.toFixed(1)),
      todayQuotaLimitSec: myQuotaLimitSec,
      todayQuotaPercent: myLastFullDayQuotaPercent,
      lastFullDayKey: myLastFullDayKey,
      lastFullDayQuotaSec: Number(myLastFullDayQuotaSec.toFixed(1)),
      lastFullDayQuotaPercent: myLastFullDayQuotaPercent
    },
    dailySeries: mySeriesList,
    resolution: myRequestedResolution || 'auto',
    effectiveResolution: myEffectiveResolution,
    projects: myProjectsList
  };
}


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
 * Aggregate processes dataset into frontend DTO.
 * @param {Array<IProcessRow>} myRows - Raw process rows.
 * @param {number} myQuotaLimitSec - Quota limit in seconds.
 * @param {string} myTz - Timezone.
 * @param {string} [myFromIso] - Start ISO timestamp.
 * @param {string} [myToIso] - End ISO timestamp.
 * @param {string} [myRequestedResolution] - Target resolution (auto, 1d, 1h, 30m, 15m, 5m, 1m).
 * @return {Object} Aggregated dashboard DTO.
 */
function myAggregateDataset(myRows, myQuotaLimitSec, myTz, myFromIso, myToIso, myRequestedResolution) {
  const myProjects = {};
  const mySeriesBuckets = {};
  let myTotalDurationSec = 0;
  let myTotalFailures = 0;
  let myLastFullDayQuotaSec = 0;

  const myTimezone = myTz || MY_DEFAULT_TIMEZONE;
  const myYesterday = new Date(Date.now() - 86400000);
  const myLastFullDayKey = myGetDayKey(myYesterday, myTimezone);

  let myEffectiveResolution = myRequestedResolution;
  if (!myEffectiveResolution || myEffectiveResolution === 'auto') {
    myEffectiveResolution = myResolveAutoResolution(myFromIso, myToIso);
  }

  // Pre-fill continuous buckets if range is within safe visual limit (up to 1000 points)
  if (myFromIso && myToIso) {
    const myStartMs = new Date(myFromIso).getTime();
    const myEndMs = new Date(myToIso).getTime();
    const myStepMs = myGetBucketStepMs(myEffectiveResolution);
    const myStepsCount = Math.floor((myEndMs - myStartMs) / myStepMs);
    if (myStepsCount > 0 && myStepsCount <= 1000) {
      for (let myCurrMs = myStartMs; myCurrMs <= myEndMs; myCurrMs += myStepMs) {
        const myFillKey = myGetBucketKey(new Date(myCurrMs), myEffectiveResolution, myTimezone);
        if (myFillKey && !mySeriesBuckets[myFillKey]) {
          mySeriesBuckets[myFillKey] = myCreateSeriesBucket_(myFillKey);
        }
      }
    }
  }

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
    const myBucketKey = myGetBucketKey(myRow.startTime, myEffectiveResolution, myTimezone);
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


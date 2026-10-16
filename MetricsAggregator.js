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
 * Aggregate processes dataset into frontend DTO.
 * @param {Array<IProcessRow>} myRows - Raw process rows.
 * @param {number} myQuotaLimitSec - Quota limit in seconds.
 * @param {string} myTz - Timezone.
 * @return {Object} Aggregated dashboard DTO.
 */
function myAggregateDataset(myRows, myQuotaLimitSec, myTz) {
  const myProjects = {};
  const myDailyQuota = {};
  let myTotalDurationSec = 0;
  let myTotalFailures = 0;

  const myTodayKey = myGetDayKey(new Date(), myTz);

  myRows.forEach(function (myRow) {
    myTotalDurationSec += myRow.durationSec;
    const myIsFail = myRow.processStatus === MY_PROCESS_STATUS.FAILED ||
      myRow.processStatus === MY_PROCESS_STATUS.TIMED_OUT;
    if (myIsFail) myTotalFailures++;

    // 1. Quota accumulation per day
    const myDayKey = myGetDayKey(myRow.startTime, myTz);
    if (!myDailyQuota[myDayKey]) {
      myDailyQuota[myDayKey] = { dayKey: myDayKey, triggerSec: 0, totalSec: 0, count: 0 };
    }
    myDailyQuota[myDayKey].totalSec += myRow.durationSec;
    const myIsQuotaType = myRow.processType === MY_PROCESS_TYPE.TIME_DRIVEN ||
      myRow.processType === MY_PROCESS_TYPE.TRIGGER;
    if (myIsQuotaType) {
      myDailyQuota[myDayKey].triggerSec += myRow.durationSec;
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

  const myDailyList = Object.keys(myDailyQuota).sort().map(function (myK) {
    const myItem = myDailyQuota[myK];
    return {
      dayKey: myItem.dayKey,
      triggerSec: Number(myItem.triggerSec.toFixed(1)),
      totalSec: Number(myItem.totalSec.toFixed(1)),
      count: myItem.count,
      percentUsed: Number(((myItem.triggerSec / myQuotaLimitSec) * 100).toFixed(1))
    };
  });

  const myTodayItem = myDailyQuota[myTodayKey] || { triggerSec: 0, totalSec: 0, count: 0 };
  const myTodayQuotaPercent = Number(((myTodayItem.triggerSec / myQuotaLimitSec) * 100).toFixed(1));

  return {
    summary: {
      totalRuns: myRows.length,
      totalDurationSec: Number(myTotalDurationSec.toFixed(1)),
      totalFailures: myTotalFailures,
      failureRate: myRows.length > 0 ? Number(((myTotalFailures / myRows.length) * 100).toFixed(1)) : 0,
      todayQuotaSec: Number(myTodayItem.triggerSec.toFixed(1)),
      todayQuotaLimitSec: myQuotaLimitSec,
      todayQuotaPercent: myTodayQuotaPercent
    },
    dailySeries: myDailyList,
    projects: myProjectsList
  };
}

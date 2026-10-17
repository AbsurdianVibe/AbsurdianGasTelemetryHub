/**
 * Storage layer for telemetry processes using Google Sheets.
 */

/**
 * Get or create telemetry spreadsheet and ensure raw sheet headers.
 * @return {GoogleAppsScript.Spreadsheet.Sheet} Active raw processes sheet.
 */
function myEnsureSpreadsheet() {
  const myProps = PropertiesService.getScriptProperties();
  const mySavedId = myProps.getProperty(MY_PROP_KEYS.SPREADSHEET_ID);
  let mySs;

  if (mySavedId) {
    try {
      mySs = SpreadsheetApp.openById(mySavedId);
    } catch (myErr) {
      // Stale ID, recreate below
    }
  }

  if (!mySs) {
    mySs = SpreadsheetApp.create('AbsurdianGasTelemetryHub_Data');
    myProps.setProperty(MY_PROP_KEYS.SPREADSHEET_ID, mySs.getId());
  }

  let mySheet = mySs.getSheetByName(MY_SHEET_NAME_RAW);
  if (!mySheet) {
    mySheet = mySs.insertSheet(MY_SHEET_NAME_RAW);
    mySheet.appendRow(MY_RAW_HEADERS.slice());
    mySheet.setFrozenRows(1);
  }
  return mySheet;
}

/**
 * Read known deduplication keys from sheet for recent overlap window.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} mySheet - Target sheet.
 * @param {string} mySinceIso - Overlap start ISO.
 * @return {Object<string, boolean>} Set of keys.
 */
function myReadKeysSince_(mySheet, mySinceIso) {
  /** @type {Object<string, boolean>} */
  const myKeySet = {};
  const myLastRow = mySheet.getLastRow();
  if (myLastRow <= 1) return myKeySet;

  const myValues = mySheet.getRange(2, 1, myLastRow - 1, 6).getValues();
  const myThresholdMs = mySinceIso ? new Date(mySinceIso).getTime() : 0;

  myValues.forEach(function (myRow) {
    const myRowTimeMs = new Date(myRow[5]).getTime();
    if (myRowTimeMs >= myThresholdMs) {
      myKeySet[myRow[0]] = true;
    }
  });
  return myKeySet;
}

/**
 * Append unique process rows to sheet in a single batch.
 * @param {Array<IProcessRow>} myRows - List of process rows.
 * @param {string} myOverlapStartIso - Overlap start timestamp.
 * @return {number} Count of newly added rows.
 */
function myAppendProcessesBatch(myRows, myOverlapStartIso) {
  if (!myRows || myRows.length === 0) return 0;
  const mySheet = myEnsureSpreadsheet();
  const myExistingKeys = myReadKeysSince_(mySheet, myOverlapStartIso);

  const myNewValues = [];
  myRows.forEach(function (myRow) {
    if (myExistingKeys[myRow.key]) return;
    myExistingKeys[myRow.key] = true;
    myNewValues.push([
      myRow.key,
      myRow.projectName,
      myRow.functionName,
      myRow.processType,
      myRow.processStatus,
      myRow.startTime,
      myRow.durationSec,
      myRow.collectedAt
    ]);
  });

  if (myNewValues.length === 0) return 0;
  const myStartRow = mySheet.getLastRow() + 1;
  mySheet.getRange(myStartRow, 1, myNewValues.length, MY_RAW_HEADERS.length).setValues(myNewValues);
  return myNewValues.length;
}

/**
 * Read processes from sheet within time window.
 * @param {string} myFromIso - Start ISO.
 * @param {string} myToIso - End ISO.
 * @return {Array<IProcessRow>} Filtered rows.
 */
function myReadProcessesRange(myFromIso, myToIso) {
  const mySheet = myEnsureSpreadsheet();
  const myLastRow = mySheet.getLastRow();
  if (myLastRow <= 1) return [];

  const myValues = mySheet.getRange(2, 1, myLastRow - 1, MY_RAW_HEADERS.length).getValues();
  const myFromMs = myFromIso ? new Date(myFromIso).getTime() : 0;
  const myToMs = myToIso ? new Date(myToIso).getTime() : Infinity;

  const myRows = [];
  myValues.forEach(function (myV) {
    const myTimeMs = new Date(myV[5]).getTime();
    if (myTimeMs < myFromMs || myTimeMs > myToMs) return;
    myRows.push({
      key: myV[0],
      projectName: myV[1],
      functionName: myV[2],
      processType: myV[3],
      processStatus: myV[4],
      startTime: myV[5],
      durationSec: Number(myV[6]) || 0,
      collectedAt: myV[7]
    });
  });
  return myRows;
}

/**
 * Read processes from sheet newer than given ISO timestamp.
 * @param {string} mySinceIso - Threshold ISO timestamp.
 * @return {Array<IProcessRow>} New processes.
 */
function myReadProcessesSince(mySinceIso) {
  const mySheet = myEnsureSpreadsheet();
  const myLastRow = mySheet.getLastRow();
  if (myLastRow <= 1) return [];

  const mySinceMs = mySinceIso ? new Date(mySinceIso).getTime() : 0;
  const myValues = mySheet.getRange(2, 1, myLastRow - 1, MY_RAW_HEADERS.length).getValues();

  const myRows = [];
  myValues.forEach(function (myV) {
    const myTimeMs = new Date(myV[5]).getTime();
    if (myTimeMs <= mySinceMs) return;
    myRows.push({
      key: myV[0],
      projectName: myV[1],
      functionName: myV[2],
      processType: myV[3],
      processStatus: myV[4],
      startTime: myV[5],
      durationSec: Number(myV[6]) || 0,
      collectedAt: myV[7]
    });
  });
  return myRows;
}


/**
 * Prune rows older than retention threshold.
 * @param {number} myRetentionDays - Max age in days.
 * @return {number} Count of removed rows.
 */
function myPruneExpiredRows(myRetentionDays) {
  const mySheet = myEnsureSpreadsheet();
  const myLastRow = mySheet.getLastRow();
  if (myLastRow <= 1) return 0;

  const myCutoffMs = new Date(myGetDateNDaysAgo(myRetentionDays)).getTime();
  const myTimeValues = mySheet.getRange(2, 6, myLastRow - 1, 1).getValues();

  let myDeleteCount = 0;
  for (let myI = 0; myI < myTimeValues.length; myI++) {
    const myRowMs = new Date(myTimeValues[myI][0]).getTime();
    if (myRowMs < myCutoffMs) {
      myDeleteCount++;
    } else {
      break;
    }
  }

  if (myDeleteCount > 0) {
    mySheet.deleteRows(2, myDeleteCount);
  }
  return myDeleteCount;
}

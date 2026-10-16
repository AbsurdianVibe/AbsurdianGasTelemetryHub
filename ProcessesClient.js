/**
 * Client for Google Apps Script Processes API.
 *
 * @typedef {Object} IProcessRow
 * @property {string} key - Unique deduplication key.
 * @property {string} projectName - Name of the script project.
 * @property {string} functionName - Executed function name.
 * @property {string} processType - Process execution type.
 * @property {string} processStatus - Terminal status.
 * @property {string} startTime - Process start ISO timestamp.
 * @property {number} durationSec - Execution duration in seconds.
 * @property {string} collectedAt - Harvest ISO timestamp.
 */

/**
 * Build query URL for processes list endpoint.
 * @param {string} myStartIso - Start ISO timestamp.
 * @param {string} myEndIso - End ISO timestamp.
 * @param {string} myPageToken - Pagination token.
 * @return {string} Target URL.
 */
function myBuildListUrl_(myStartIso, myEndIso, myPageToken) {
  let myUrl = MY_PROCESSES_ENDPOINT + '?pageSize=' + MY_PAGE_SIZE;
  if (myStartIso) myUrl += '&userProcessFilter.startTime=' + encodeURIComponent(myStartIso);
  if (myEndIso) myUrl += '&userProcessFilter.endTime=' + encodeURIComponent(myEndIso);
  if (myPageToken) myUrl += '&pageToken=' + encodeURIComponent(myPageToken);
  return myUrl;
}

/**
 * Normalize raw process object from API to domain model.
 * @param {Object} myRaw - Raw process object from Google API.
 * @param {string} myCollectedAt - Harvest timestamp.
 * @return {IProcessRow} Normalized process row.
 */
function myNormalizeProcess_(myRaw, myCollectedAt) {
  const myDurationSec = parseFloat(myRaw.duration) || 0;
  const myProjectName = myRaw.projectName || 'UnnamedProject';
  const myFunctionName = myRaw.functionName || 'anonymous';
  const myProcessType = myRaw.processType || MY_PROCESS_TYPE.UNKNOWN;
  const myProcessStatus = myRaw.processStatus || MY_PROCESS_STATUS.UNKNOWN;
  const myStartTime = myRaw.startTime || myCollectedAt;
  const myKey = [myProjectName, myFunctionName, myProcessType, myStartTime].join('|');

  return {
    key: myKey,
    projectName: myProjectName,
    functionName: myFunctionName,
    processType: myProcessType,
    processStatus: myProcessStatus,
    startTime: myStartTime,
    durationSec: Number(myDurationSec.toFixed(3)),
    collectedAt: myCollectedAt
  };
}

/**
 * Fetch user processes across all projects with pagination.
 * @param {string} myStartIso - Start boundary.
 * @param {string} myEndIso - End boundary.
 * @return {Array<IProcessRow>} Harvested process list.
 */
function myFetchAllUserProcesses(myStartIso, myEndIso) {
  const myToken = ScriptApp.getOAuthToken();
  const myCollectedAt = new Date().toISOString();
  let myProcesses = [];
  let myPageToken = '';
  let myPageCount = 0;

  do {
    const myResponse = UrlFetchApp.fetch(myBuildListUrl_(myStartIso, myEndIso, myPageToken), {
      method: 'get',
      headers: { Authorization: 'Bearer ' + myToken },
      muteHttpExceptions: true
    });

    if (myResponse.getResponseCode() !== MY_HTTP_SUCCESS) {
      throw new Error('Processes API HTTP ' + myResponse.getResponseCode() + ': ' + myResponse.getContentText());
    }

    const myData = JSON.parse(myResponse.getContentText());
    const myBatch = myData.processes || [];
    myBatch.forEach(function (myRaw) {
      myProcesses.push(myNormalizeProcess_(myRaw, myCollectedAt));
    });

    myPageToken = myData.nextPageToken || '';
    myPageCount++;
  } while (myPageToken && myPageCount < MY_MAX_PAGES);

  return myProcesses;
}

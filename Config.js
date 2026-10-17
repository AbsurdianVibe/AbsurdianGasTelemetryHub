/**
 * System configuration, enums and global constants.
 */

const MY_PROCESSES_ENDPOINT = 'https://script.googleapis.com/v1/processes';
const MY_PAGE_SIZE = 100;
const MY_MAX_PAGES = 20;
const MY_HTTP_SUCCESS = 200;
const MY_CURSOR_OVERLAP_SEC = 300;
const MY_BOOTSTRAP_DAYS = 7;

const MY_DEFAULT_RETENTION_DAYS = 30;
const MY_MIN_RETENTION_DAYS = 7;
const MY_MAX_RETENTION_DAYS = 180;

const MY_DEFAULT_QUOTA_LIMIT_SEC = 5400; // 90 min for Consumer tier
const MY_DEFAULT_TIMEZONE = 'Europe/Warsaw';

const MY_PROCESS_TYPE = Object.freeze({
  TIME_DRIVEN: 'TIME_DRIVEN',
  TRIGGER: 'TRIGGER',
  WEBAPP: 'WEBAPP',
  EDITOR: 'EDITOR',
  SIMPLE_TRIGGER: 'SIMPLE_TRIGGER',
  EXECUTION_API: 'EXECUTION_API',
  MENU: 'MENU',
  ADD_ON: 'ADD_ON',
  BATCH_TASK: 'BATCH_TASK',
  UNKNOWN: 'UNKNOWN'
});

const MY_PROCESS_STATUS = Object.freeze({
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  TIMED_OUT: 'TIMED_OUT',
  CANCELED: 'CANCELED',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  DELAYED: 'DELAYED',
  UNKNOWN: 'UNKNOWN'
});

const MY_QUOTA_PROCESS_TYPES = Object.freeze([
  MY_PROCESS_TYPE.TIME_DRIVEN,
  MY_PROCESS_TYPE.TRIGGER
]);

const MY_PROP_KEYS = Object.freeze({
  SPREADSHEET_ID: 'ABSURDIAN_TELEMETRY_SHEET_ID',
  CURSOR_START_TIME: 'ABSURDIAN_CURSOR_START_TIME',
  SETTINGS_JSON: 'ABSURDIAN_SETTINGS_JSON',
  LAST_COLLECTION_TIME: 'ABSURDIAN_LAST_COLLECTION_TIME'
});

const MY_SHEET_NAME_RAW = 'raw_processes';
const MY_RAW_HEADERS = Object.freeze([
  'key',
  'projectName',
  'functionName',
  'processType',
  'processStatus',
  'startTime',
  'durationSec',
  'collectedAt'
]);

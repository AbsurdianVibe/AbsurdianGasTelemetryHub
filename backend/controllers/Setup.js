/**
 * Idempotent project initialization and daily trigger setup script.
 *
 * Intended to be executed once manually after deploying the script: initializes the backing
 * telemetry spreadsheet and default settings, replaces any existing collector time triggers
 * with a clean daily 02:00 schedule in the project timezone, and triggers an initial sync pass.
 */

/**
 * Install daily collector trigger for 02:00.
 */
function myInstallCollectorTrigger_() {
  const myTriggers = ScriptApp.getProjectTriggers();
  myTriggers.forEach(function (myTrig) {
    if (myTrig.getHandlerFunction() === 'myRunCollector') {
      ScriptApp.deleteTrigger(myTrig);
    }
  });

  ScriptApp.newTrigger('myRunCollector')
    .timeBased()
    .atHour(2)
    .everyDays(1)
    .inTimezone(MY_DEFAULT_TIMEZONE)
    .create();
}

/**
 * Run initial setup and seed initial telemetry.
 */
function myInitialSetup() {
  myEnsureSpreadsheet();
  myGetSettings();
  myInstallCollectorTrigger_();
  myRunCollector();
}

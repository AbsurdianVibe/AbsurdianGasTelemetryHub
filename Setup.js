/**
 * Idempotent initialization and trigger setup script.
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

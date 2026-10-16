/**
 * Web application serving entry point.
 */

/**
 * Serve HTML dashboard with security gate.
 * @param {Object} e - Event parameter.
 * @return {GoogleAppsScript.HTML.HtmlOutput} HTML page.
 */
function doGet(e) {
  const myActive = Session.getActiveUser().getEmail();
  const myEffective = Session.getEffectiveUser().getEmail();
  if (!myActive || myActive !== myEffective) {
    return HtmlService.createHtmlOutput('<h3>403 Forbidden</h3><p>Unauthorized access.</p>')
      .setTitle('403 Forbidden');
  }

  const myTemplate = HtmlService.createTemplateFromFile('index');
  return myTemplate.evaluate()
    .setTitle('Absurdian Telemetry Hub')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Include sub-template file into main template.
 * @param {string} myFilename - File name without extension.
 * @return {string} Raw HTML content.
 */
function myInclude(myFilename) {
  return HtmlService.createHtmlOutputFromFile(myFilename).getContent();
}

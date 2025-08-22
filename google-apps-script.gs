/** Google Apps Script: Code.gs
 *  File > New project (in Apps Script), paste this,
 *  then Deploy > New deployment > Type: Web app
 *  - Execute as: Me
 *  - Who has access: Anyone
 *  Copy the Web app URL into config.js as SHEETS_URL
 */

const SHEET_NAME = 'mrt_trials';

function getSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow([
      'timestamp_server',
      'version',
      'session_code',
      'participant_id',
      'user_agent',
      'block',
      'trial_index',
      'condition',
      'angle',
      'left_angle',
      'left_mirror',
      'right_angle',
      'right_mirror',
      'response',
      'correct_response',
      'accuracy',
      'rt_ms',
      'timestamp_client',
      'action'
    ]);
  }
  return sh;
}

function doPost(e) {
  try {
    const sh = getSheet_();
    const body = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    const ts = new Date();

    // For trial rows
    const row = [
      ts,
      body.version || '',
      body.session_code || '',
      body.participant_id || '',
      body.user_agent || '',
      body.block || '',
      body.trial_index || '',
      body.condition || '',
      body.angle || '',
      body.left_angle || '',
      body.left_mirror || '',
      body.right_angle || '',
      body.right_mirror || '',
      body.response || '',
      body.correct_response || '',
      body.accuracy || '',
      body.rt_ms || '',
      body.timestamp || body.timestamp_client || '',
      body.action || 'trial'
    ];
    sh.appendRow(row);

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
                        .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
                        .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Imperial Super Sixes — Apps Script backend for direct scorer-app submission.
 *
 * SETUP (one-time, done inside the actual Google Sheet — not this repo):
 *   1. Open the tournament Google Sheet.
 *   2. Extensions -> Apps Script.
 *   3. Delete any starter code in Code.gs, paste this whole file in instead.
 *   4. Deploy -> New deployment -> gear icon -> type "Web app".
 *        - Execute as: Me (your account)
 *        - Who has access: Anyone
 *   5. Click Deploy, authorize when Google prompts you (it will warn the app
 *      is unverified — that's expected for a script you wrote yourself; the
 *      warning is about Google not having reviewed it, not a real risk here),
 *      then copy the "Web app URL" (ends in /exec). Paste that URL into the
 *      scorer app's Export screen under "Apps Script URL" — a one-time step
 *      per scorer device, saved in that browser afterwards.
 *   6. If you edit this script later: Deploy -> Manage deployments -> pencil
 *      icon -> "New version" -> Deploy. Saving alone does NOT update the
 *      live /exec URL's behaviour — you must push a new version.
 *
 * WHAT THIS DOES: receives one match's worth of scorecard data as JSON from
 * the scorer app and writes it into Fixtures_Results / Batting / Bowling —
 * the exact same tabs and columns a scorer would otherwise paste into by
 * hand. Columns are located by their header text (row 1), not by hardcoded
 * letters, so it only ever writes the specific fields it's given — it never
 * touches the Batting Team / Bowling Team formula columns, since those
 * simply aren't in the payload. Batting/Bowling rows are upserted by
 * MatchNo + Innings + Player/Bowler, so re-submitting after a correction
 * updates the existing row instead of duplicating it. Existing rows are
 * never deleted — if a name needs removing entirely, that's still a manual
 * edit in the Sheet, same as it already was.
 */

function doGet(e) {
  return jsonResponse({ success: true, message: 'Imperial Super Sixes Apps Script is running.' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return jsonResponse({ success: false, error: 'Sheet is busy right now — please try again in a few seconds.' });
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, error: 'No data received.' });
    }
    var payload = JSON.parse(e.postData.contents);
    if (!payload.matchNo) {
      return jsonResponse({ success: false, error: 'Missing matchNo.' });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var details = [];

    if (payload.fixture) {
      details.push(updateFixture(ss, payload.matchNo, payload.fixture));
    }
    if (payload.batting && payload.batting.length) {
      details.push(upsertRows(ss, 'Batting', payload.matchNo, payload.batting, ['Innings', 'Player']));
    }
    if (payload.bowling && payload.bowling.length) {
      details.push(upsertRows(ss, 'Bowling', payload.matchNo, payload.bowling, ['Innings', 'Bowler']));
    }

    return jsonResponse({ success: true, matchNo: payload.matchNo, details: details });
  } catch (err) {
    return jsonResponse({ success: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Reads row 1 of a sheet into a {headerText: 1-based column index} map. */
function getHeaderMap(sheet) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i]).trim();
    if (h) map[h] = i + 1;
  }
  return map;
}

/** Finds the 1-based row number where column `colIndex` equals `value`
 * (row 2 onward — row 1 is headers), or null if not found. */
function findRow(sheet, colIndex, value) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var colVals = sheet.getRange(2, colIndex, lastRow - 1, 1).getValues();
  for (var i = 0; i < colVals.length; i++) {
    if (String(colVals[i][0]) === String(value)) return i + 2;
  }
  return null;
}

/** Finds the first row (from row 2 down) where `colIndex` is empty. NOT the
 * same as sheet.getLastRow() + 1 — getLastRow() reports the last row with
 * ANY content in ANY column, and on Batting/Bowling the Player/Bowler
 * dropdown helper columns have formulas pre-filled all the way down every
 * row (so the dependent dropdown works immediately on any row, before real
 * data exists) — so getLastRow() reports ~300 regardless of how many rows
 * actually have real data. Checking a genuine data column (MatchNo) for the
 * first blank cell is what actually finds the next free row. */
function findNextEmptyRow(sheet, colIndex) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 2;
  var colVals = sheet.getRange(2, colIndex, lastRow - 1, 1).getValues();
  for (var i = 0; i < colVals.length; i++) {
    var v = colVals[i][0];
    if (v === '' || v === null || v === undefined) return i + 2;
  }
  return lastRow + 1;
}

/** Same idea as findNextEmptyRow, but against an already-fetched `existing`
 * values array (existing[0] = sheet row 2) instead of re-reading the sheet —
 * used inside upsertRows, which already has the whole tab loaded in memory. */
function findNextEmptyRowInExisting(existing, colIndex) {
  for (var i = 0; i < existing.length; i++) {
    var v = existing[i][colIndex - 1];
    if (v === '' || v === null || v === undefined) return i + 2;
  }
  return existing.length + 2;
}

/** Writes {headerName: value} into the given row — silently skips any
 * header it doesn't recognise rather than guessing a column, so it can
 * never accidentally write into an unrelated or formula-driven column. */
function writeFields(sheet, rowIndex, headerMap, fields) {
  Object.keys(fields).forEach(function (header) {
    var col = headerMap[header];
    if (!col) return;
    var value = fields[header];
    if (value === undefined || value === null) return;
    sheet.getRange(rowIndex, col).setValue(value);
  });
}

/** Updates the Fixtures_Results row for this MatchNo (appending one if it
 * isn't already listed — e.g. an ad hoc match not in the pre-filled sheet). */
function updateFixture(ss, matchNo, fields) {
  var sheet = ss.getSheetByName('Fixtures_Results');
  if (!sheet) throw new Error('No "Fixtures_Results" tab found.');
  var headerMap = getHeaderMap(sheet);
  if (!headerMap['MatchNo']) throw new Error('Fixtures_Results has no "MatchNo" column.');

  var rowIndex = findRow(sheet, headerMap['MatchNo'], String(matchNo));
  var created = !rowIndex;
  if (!rowIndex) {
    rowIndex = findNextEmptyRow(sheet, headerMap['MatchNo']);
    sheet.getRange(rowIndex, headerMap['MatchNo']).setValue(matchNo);
  }
  writeFields(sheet, rowIndex, headerMap, fields);
  return { tab: 'Fixtures_Results', row: rowIndex, created: created };
}

/** Upserts each row in `rows` into `tabName`, matched by MatchNo plus every
 * header listed in `keyHeaders` (e.g. Innings + Player) — updates the
 * matching existing row if found, otherwise appends a new one. */
function upsertRows(ss, tabName, matchNo, rows, keyHeaders) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) throw new Error('No "' + tabName + '" tab found.');
  var headerMap = getHeaderMap(sheet);
  if (!headerMap['MatchNo']) throw new Error(tabName + ' has no "MatchNo" column.');

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var existing = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
  var nextEmptyRow = findNextEmptyRowInExisting(existing, headerMap['MatchNo']);

  var updated = 0, appended = 0;
  rows.forEach(function (fields) {
    var matchIndex = -1;
    for (var i = 0; i < existing.length; i++) {
      var rowVals = existing[i];
      if (!rowVals || String(rowVals[headerMap['MatchNo'] - 1]) !== String(matchNo)) continue;
      var allKeysMatch = keyHeaders.every(function (h) {
        if (!headerMap[h]) return false;
        return String(rowVals[headerMap[h] - 1]) === String(fields[h]);
      });
      if (allKeysMatch) { matchIndex = i; break; }
    }

    var fieldsWithMatchNo = Object.assign({ MatchNo: matchNo }, fields);
    if (matchIndex >= 0) {
      writeFields(sheet, matchIndex + 2, headerMap, fieldsWithMatchNo); // existing[] is 0-based starting at sheet row 2
      updated++;
    } else {
      writeFields(sheet, nextEmptyRow, headerMap, fieldsWithMatchNo);
      // Reflect the new row in `existing` AT ITS ACTUAL INDEX (not pushed to
      // the end — the target row can land in the middle of the sheet, e.g.
      // the first genuinely blank row among 300 pre-formatted ones) so
      // later rows in this same submission see it for duplicate-detection.
      var blankRow = new Array(lastCol).fill('');
      Object.keys(fieldsWithMatchNo).forEach(function (h) {
        if (headerMap[h]) blankRow[headerMap[h] - 1] = fieldsWithMatchNo[h];
      });
      existing[nextEmptyRow - 2] = blankRow;
      nextEmptyRow++;
      appended++;
    }
  });

  return { tab: tabName, updated: updated, appended: appended };
}

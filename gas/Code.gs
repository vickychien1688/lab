/**
 * PAS English Lab — 後端 API (Google Apps Script)
 * =====================================================
 * 一個 Web App 端點，同時服務「學生跟讀 App」與「老師後台」。
 *
 * 儲存架構：
 *   - Google Sheet 當資料庫（分頁：Classes / Lessons / Submissions / Config）
 *   - Google Drive 資料夾存學生錄音檔
 *
 * 部署步驟（只做一次）：
 *   1. 貼上這份程式碼到 script.google.com 的專案。
 *   2. 在編輯器選 setup 函式 → 按「執行」，第一次會要求授權，允許即可。
 *      這會自動建立 Sheet、Drive 資料夾，並填入 G7/G8 範例資料。
 *   3. 部署 → 新增部署作業 → 類型「網頁應用程式」
 *        - 執行身分：我
 *        - 具有存取權的使用者：所有人
 *      複製產生的 /exec 網址，貼到前端 assets/config.js 的 API_URL。
 *   4. 之後改課文/密碼都在後台或 Sheet 裡改，程式碼不用再動。
 *
 * 所有前端請求都用 POST + Content-Type: text/plain（避開 CORS 預檢），
 * 後端統一回傳 JSON，前端可讀取回應。
 */

var PROP = PropertiesService.getScriptProperties();
var DEFAULT_ADMIN_PASSWORD = '1234'; // 第一次 setup 用；之後可在後台改

// ============================================================
//  一次性安裝
// ============================================================
function setup() {
  // 1) 試算表
  var ss = SpreadsheetApp.create('PAS English Lab DB');
  PROP.setProperty('SHEET_ID', ss.getId());

  var classes = ss.getActiveSheet();
  classes.setName('Classes');
  classes.getRange(1, 1, 1, 5)
    .setValues([['classId', 'className', 'bookTitle', 'active', 'order']]);
  classes.getRange(2, 1, 2, 5).setValues([
    ['G7', 'G7 錄音教室', 'The Elephant Man', 'yes', 1],
    ['G8', 'G8 錄音教室', 'International Ghost', 'yes', 2]
  ]);

  var lessons = ss.insertSheet('Lessons');
  lessons.getRange(1, 1, 1, 11).setValues([
    ['classId', 'lessonId', 'lessonLabel', 'text', 'audioUrl', 'order', 'active', 'shadowMode', 'marks', 'gapMultiplier', 'audioFileId']
  ]);
  lessons.getRange(2, 1, 3, 7).setValues([
    ['G7', 'ch1', 'CH1',
      '　　I’d like to see the elephant man, please. I gave him the money and he opened a door at the back of the shop. We went into a little room. The room was cold and dark, and there was a horrible smell in it.\n\n　　A creature sat on the chair behind a table. I say a creature, because it was not a man or a woman, like you or me. The creature did not move or look at us. It sat very quietly on the chair in the cold, dark, dirty room.',
      'G7/g7_ch1.mp3', 1, 'yes'],
    ['G7', 'ch2', 'CH2',
      '　　For a minute, he stood by the door of the cab, and said nothing. Then he hit the cab with his stick. “STEPS!” he said loudly. “Help me up the steps!”\n\n　　Then I understood. There were three steps up into the cab, and he could not get up them. “Yes, I see. I’m sorry,” I said. “Let me help you.”\n\n　　I took his left hand and began to help him. My right hand was behind his back. I felt very strange. His left hand was like a young woman’s, but his back, under the coat, was horrible. I could feel the bags of old skin on his back under the coat.',
      'G7/g7_ch2.mp3', 2, 'yes'],
    ['G8', 'ch2', 'Shadowing',
      '　　He was waiting for a car to pass by, but the road was empty. There were no houses and no traffic. Abdul was angry with his car, because it did not go anymore.\n\n　　He was angry with himself, because he did not check the car before he left Buraimi. And he was angry with his mobile phone too, because there was no signal. He couldn’t use it to phone for help.',
      'G8/ch2-shadowing.mp3', 1, 'yes']
  ]);

  var subs = ss.insertSheet('Submissions');
  subs.getRange(1, 1, 1, 10).setValues([
    ['timestamp', 'classId', 'lessonId', 'studentName', 'fileId', 'fileName',
     'durationSec', 'score', 'comment', 'status']
  ]);

  var config = ss.insertSheet('Config');
  config.getRange(1, 1, 1, 2).setValues([['key', 'value']]);
  config.getRange(2, 1, 1, 2).setValues([['adminPassword', DEFAULT_ADMIN_PASSWORD]]);

  // 2) Drive 資料夾
  var folder = DriveApp.createFolder('PAS English Lab Recordings');
  PROP.setProperty('FOLDER_ID', folder.getId());

  Logger.log('安裝完成！');
  Logger.log('資料庫試算表： ' + ss.getUrl());
  Logger.log('錄音資料夾ID： ' + folder.getId());
  Logger.log('接著請「部署 > 新增部署作業 > 網頁應用程式」，把 /exec 網址填進前端 config.js');
}

// ============================================================
//  路由
// ============================================================
function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  return route(p);
}

function doPost(e) {
  var data = {};
  try { data = JSON.parse(e.postData.contents); } catch (err) { data = {}; }
  return route(data);
}

function route(d) {
  var action = d.action || 'ping';
  try {
    switch (action) {
      case 'ping':       return json({ ok: true, service: 'PAS English Lab' });
      case 'classes':    return json({ ok: true, classes: getClasses(true) });
      case 'lessons':    return json({ ok: true, lessons: getLessons(d.classId, true) });
      case 'lessonAudio':return json(lessonAudio(d));
      case 'submit':     return json(saveSubmission(d));
      // ---- 以下需要密碼 ----
      case 'uploadAudio':return needAuth(d) || json(uploadAudio(d));
      case 'adminData':  return needAuth(d) || json(adminData());
      case 'getAudio':   return needAuth(d) || json(getAudio(d.fileId));
      case 'saveClass':  return needAuth(d) || json(saveClass(d));
      case 'deleteClass':return needAuth(d) || json(deleteRowByKey('Classes', 'classId', d.classId));
      case 'saveLesson': return needAuth(d) || json(saveLesson(d));
      case 'deleteLesson':return needAuth(d) || json(deleteLesson(d));
      case 'grade':      return needAuth(d) || json(grade(d));
      case 'deleteSubmission': return needAuth(d) || json(deleteSubmission(d));
      case 'setPassword':return needAuth(d) || json(setPassword(d));
      default:           return json({ ok: false, error: 'unknown action: ' + action });
    }
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// ============================================================
//  驗證
// ============================================================
function adminPassword() {
  var rows = readSheet('Config');
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].key === 'adminPassword') return String(rows[i].value);
  }
  return DEFAULT_ADMIN_PASSWORD;
}
function needAuth(d) {
  if (String(d.password || '') !== adminPassword()) {
    return json({ ok: false, error: 'auth', message: '密碼錯誤' });
  }
  return null; // 通過
}
function setPassword(d) {
  var next = String(d.newPassword || '').trim();
  if (!next) return { ok: false, error: '密碼不可為空' };
  var ss = getSS(), sh = ss.getSheetByName('Config');
  var data = sh.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    if (data[r][0] === 'adminPassword') { sh.getRange(r + 1, 2).setValue(next); return { ok: true }; }
  }
  sh.appendRow(['adminPassword', next]);
  return { ok: true };
}

// ============================================================
//  資料讀取
// ============================================================
function getClasses(activeOnly) {
  return readSheet('Classes')
    .filter(function (c) { return c.classId && (!activeOnly || String(c.active).toLowerCase() !== 'no'); })
    .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
}
function getLessons(classId, activeOnly) {
  return readSheet('Lessons')
    .filter(function (l) {
      return l.lessonId && (!classId || l.classId === classId) &&
        (!activeOnly || String(l.active).toLowerCase() !== 'no');
    })
    .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
}

// ============================================================
//  學生繳交
// ============================================================
function saveSubmission(d) {
  if (!d.audio) return { ok: false, error: '沒有音檔資料' };
  var name = (d.studentName || 'unknown').toString().replace(/[\\/:*?"<>|]/g, '_').trim();
  var ext = (d.mime && d.mime.indexOf('webm') > -1) ? 'webm' : 'm4a';
  var stamp = Utilities.formatDate(new Date(), 'GMT+8', 'yyyyMMdd_HHmmss');
  var fileName = [d.classId || 'NA', d.lessonId || 'NA', name, stamp].join('_') + '.' + ext;
  var bytes = Utilities.base64Decode(d.audio);
  var blob = Utilities.newBlob(bytes, d.mime || 'audio/mp4', fileName);
  var file = getFolder().createFile(blob);

  var ss = getSS(), sh = ss.getSheetByName('Submissions');
  sh.appendRow([
    Utilities.formatDate(new Date(), 'GMT+8', 'yyyy-MM-dd HH:mm:ss'),
    d.classId || '', d.lessonId || '', name,
    file.getId(), fileName, Number(d.duration || 0), '', '', 'new'
  ]);
  return { ok: true, fileId: file.getId() };
}

// ============================================================
//  後台
// ============================================================
function adminData() {
  var classes = getClasses(false);
  var lessons = getLessons(null, false);
  var subs = readSheet('Submissions').map(function (s, i) { s._row = i + 2; return s; })
    .filter(function (s) { return s.fileId; })
    .reverse(); // 最新在上

  // 統計：每班每課的繳交人數 / 平均分
  var stats = {};
  subs.forEach(function (s) {
    var k = s.classId + '|' + s.lessonId;
    if (!stats[k]) stats[k] = { classId: s.classId, lessonId: s.lessonId, count: 0, graded: 0, scoreSum: 0 };
    stats[k].count++;
    if (s.score !== '' && s.score != null && !isNaN(Number(s.score))) {
      stats[k].graded++; stats[k].scoreSum += Number(s.score);
    }
  });
  var statList = Object.keys(stats).map(function (k) {
    var v = stats[k];
    v.avg = v.graded ? Math.round(v.scoreSum / v.graded * 10) / 10 : null;
    return v;
  });

  return { ok: true, classes: classes, lessons: lessons, submissions: subs, stats: statList };
}

function getAudio(fileId) {
  var file = DriveApp.getFileById(fileId);
  var blob = file.getBlob();
  return {
    ok: true,
    fileName: file.getName(),
    mime: blob.getContentType(),
    base64: Utilities.base64Encode(blob.getBytes())
  };
}

function saveClass(d) {
  return upsert('Classes', 'classId', d.classId, {
    classId: d.classId, className: d.className || d.classId,
    bookTitle: d.bookTitle || '', active: d.active || 'yes', order: d.order || 99
  });
}
function saveLesson(d) {
  // Lessons 用 classId+lessonId 當複合鍵
  ensureLessonColumns();
  var ss = getSS(), sh = ss.getSheetByName('Lessons');
  var data = sh.getDataRange().getValues(), head = data[0];
  var iC = head.indexOf('classId'), iL = head.indexOf('lessonId');
  for (var r = 1; r < data.length; r++) {
    if (data[r][iC] === d.classId && data[r][iL] === d.lessonId) {
      writeRow(sh, head, r + 1, lessonObj(d)); return { ok: true, updated: true };
    }
  }
  sh.appendRow(rowFromObj(head, lessonObj(d)));
  return { ok: true, created: true };
}
function lessonObj(d) {
  return {
    classId: d.classId, lessonId: d.lessonId, lessonLabel: d.lessonLabel || d.lessonId,
    text: d.text || '', audioUrl: d.audioUrl || '', order: d.order || 99, active: d.active || 'yes',
    shadowMode: d.shadowMode || 'no', marks: d.marks || '', gapMultiplier: d.gapMultiplier || '',
    audioFileId: d.audioFileId || ''
  };
}
// 讓既有的 Lessons 分頁補上跟讀相關欄位（升級用）
function ensureLessonColumns() {
  var sh = getSS().getSheetByName('Lessons');
  var lastCol = sh.getLastColumn();
  var head = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  ['shadowMode', 'marks', 'gapMultiplier', 'audioFileId'].forEach(function (col) {
    if (head.indexOf(col) === -1) { lastCol++; sh.getRange(1, lastCol).setValue(col); head.push(col); }
  });
}

// ---- 老師示範音檔：上傳到 Drive / 以資料流取回（避開跨網域混音問題）----
function getAudioFolder() {
  var id = PROP.getProperty('AUDIO_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var f = DriveApp.createFolder('PAS English Lab Lesson Audio');
  PROP.setProperty('AUDIO_FOLDER_ID', f.getId());
  return f;
}
function uploadAudio(d) {
  if (!d.audio) return { ok: false, error: '沒有音檔資料' };
  var mime = d.mime || 'audio/mpeg';
  var base = (d.filename || 'lesson_audio').toString().replace(/[\\/:*?"<>|]/g, '_');
  var bytes = Utilities.base64Decode(d.audio);
  var blob = Utilities.newBlob(bytes, mime, base);
  var file = getAudioFolder().createFile(blob);
  return { ok: true, fileId: file.getId(), fileName: file.getName() };
}
function lessonAudio(d) {
  if (!d.fileId) return { ok: false, error: 'no fileId' };
  var used = readSheet('Lessons').some(function (l) { return String(l.audioFileId) === String(d.fileId); });
  if (!used) return { ok: false, error: 'not a lesson audio' };
  var file = DriveApp.getFileById(d.fileId);
  var blob = file.getBlob();
  return { ok: true, mime: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()) };
}
function deleteLesson(d) {
  var ss = getSS(), sh = ss.getSheetByName('Lessons');
  var data = sh.getDataRange().getValues(), head = data[0];
  var iC = head.indexOf('classId'), iL = head.indexOf('lessonId');
  for (var r = data.length - 1; r >= 1; r--) {
    if (data[r][iC] === d.classId && data[r][iL] === d.lessonId) { sh.deleteRow(r + 1); return { ok: true }; }
  }
  return { ok: false, error: 'not found' };
}
function grade(d) {
  var ss = getSS(), sh = ss.getSheetByName('Submissions');
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var row = Number(d.row);
  if (!row || row < 2) return { ok: false, error: 'bad row' };
  var iScore = head.indexOf('score'), iComment = head.indexOf('comment'), iStatus = head.indexOf('status');
  if (d.score !== undefined)   sh.getRange(row, iScore + 1).setValue(d.score);
  if (d.comment !== undefined) sh.getRange(row, iComment + 1).setValue(d.comment);
  sh.getRange(row, iStatus + 1).setValue(d.status || 'reviewed');
  return { ok: true };
}
function deleteSubmission(d) {
  var ss = getSS(), sh = ss.getSheetByName('Submissions');
  var row = Number(d.row);
  if (!row || row < 2) return { ok: false, error: 'bad row' };
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var fileId = sh.getRange(row, head.indexOf('fileId') + 1).getValue();
  if (d.deleteFile && fileId) { try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) {} }
  sh.deleteRow(row);
  return { ok: true };
}

// ============================================================
//  試算表工具
// ============================================================
function getSS() {
  var id = PROP.getProperty('SHEET_ID');
  if (!id) throw '尚未安裝，請先執行 setup()';
  return SpreadsheetApp.openById(id);
}
function getFolder() {
  var id = PROP.getProperty('FOLDER_ID');
  if (!id) throw '尚未安裝，請先執行 setup()';
  return DriveApp.getFolderById(id);
}
function readSheet(name) {
  var sh = getSS().getSheetByName(name);
  if (!sh) return [];
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  var head = data[0];
  return data.slice(1).map(function (row) {
    var o = {};
    head.forEach(function (h, i) { o[h] = row[i]; });
    return o;
  });
}
function upsert(sheetName, keyCol, keyVal, obj) {
  var sh = getSS().getSheetByName(sheetName);
  var data = sh.getDataRange().getValues(), head = data[0], iKey = head.indexOf(keyCol);
  for (var r = 1; r < data.length; r++) {
    if (data[r][iKey] === keyVal) { writeRow(sh, head, r + 1, obj); return { ok: true, updated: true }; }
  }
  sh.appendRow(rowFromObj(head, obj));
  return { ok: true, created: true };
}
function deleteRowByKey(sheetName, keyCol, keyVal) {
  var sh = getSS().getSheetByName(sheetName);
  var data = sh.getDataRange().getValues(), head = data[0], iKey = head.indexOf(keyCol);
  for (var r = data.length - 1; r >= 1; r--) {
    if (data[r][iKey] === keyVal) { sh.deleteRow(r + 1); return { ok: true }; }
  }
  return { ok: false, error: 'not found' };
}
function rowFromObj(head, obj) { return head.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; }); }
function writeRow(sh, head, rowNum, obj) { sh.getRange(rowNum, 1, 1, head.length).setValues([rowFromObj(head, obj)]); }

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

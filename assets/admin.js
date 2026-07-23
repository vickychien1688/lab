/* 老師後台邏輯 */
let PW = sessionStorage.getItem('pas_pw') || '';
let DB = { classes: [], lessons: [], submissions: [], stats: [], rooms: [], students: [], assignments: [] };
let EDIT_MARKS = []; // 課文編輯中的分句點（秒）
let EDITING_EXISTING = false; // 目前彈窗是「編輯既有」還是「新增」

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 若已有暫存密碼，直接嘗試進入
if (PW) tryEnter(PW, true);

async function doLogin() {
  const pw = $('pwInput').value;
  if (!pw) return;
  $('loginMsg').innerText = '登入中…';
  await tryEnter(pw, false);
}
async function tryEnter(pw, silent) {
  try {
    const r = await apiCall({ action: 'adminData', password: pw });
    if (r.ok) {
      PW = pw; sessionStorage.setItem('pas_pw', pw);
      DB = r;
      $('loginView').classList.add('hidden');
      $('adminView').classList.remove('hidden');
      renderAll();
    } else {
      sessionStorage.removeItem('pas_pw');
      if (!silent) $('loginMsg').innerText = '❌ ' + (r.message || '密碼錯誤');
    }
  } catch (e) {
    if (!silent) $('loginMsg').innerText = '連線失敗，確認 config.js 的 API_URL。';
  }
}
function logout() { sessionStorage.removeItem('pas_pw'); location.reload(); }

async function refreshAll() {
  const r = await apiCall({ action: 'adminData', password: PW });
  if (r.ok) { DB = r; renderAll(); }
}
function renderAll() { renderSubs(); renderStudents(); renderStats(); renderLessons(); populateFilters(); renderRooms(); fillRoomSelects(); renderRoster(); renderAssignments(); }

function showTab(t) {
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === t));
  document.querySelectorAll('.tabpane').forEach(p => p.classList.add('hidden'));
  $('pane-' + t).classList.remove('hidden');
}

// 書本/年級小工具
function bookById(id) { return DB.classes.find(c => c.classId === id); }
function bookLabel(id) { const b = bookById(id); return b ? ((b.gradeName ? b.gradeName + ' · ' : '') + (b.bookTitle || b.classId)) : id; }
function gradeNameByGid(g) { const b = DB.classes.find(c => (c.gradeId || c.classId) === g); return b ? (b.gradeName || g) : g; }
function gradeIds() { return [...new Set(DB.classes.map(c => c.gradeId || c.classId).filter(Boolean))]; }
function autoGradeName() { const g = ($('cGradeId').value || '').trim(); const nm = gradeNameByGid(g); if (nm && nm !== g && !($('cGradeName').value || '').trim()) $('cGradeName').value = nm; }

// ---------------- 學生錄音 ----------------
function populateFilters() {
  const fc = $('fClass'), fl = $('fLesson');
  fc.innerHTML = '<option value="">全部書本</option>' + DB.classes.map(c => `<option value="${esc(c.classId)}">${esc(bookLabel(c.classId))}</option>`).join('');
  fl.innerHTML = '<option value="">全部課次</option>' + uniqueLessons().map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
}
function uniqueLessons() { return [...new Set(DB.submissions.map(s => s.lessonId).filter(Boolean))]; }

function renderSubs() {
  const fc = $('fClass').value, fl = $('fLesson').value, fn = ($('fName').value || '').toLowerCase();
  const rows = DB.submissions.filter(s =>
    (!fc || s.classId === fc) && (!fl || s.lessonId === fl) &&
    (!fn || String(s.studentName).toLowerCase().includes(fn)));
  $('subCount').innerText = `共 ${rows.length} 筆`;
  $('subsTable').innerHTML = `
    <tr><th>時間</th><th>年級·書</th><th>課次</th><th>學生</th><th>分數</th><th>狀態</th><th>操作</th></tr>
    ${rows.map(s => `
      <tr>
        <td>${esc(s.timestamp)}</td>
        <td>${esc(bookLabel(s.classId))}</td>
        <td>${esc(s.lessonId)}</td>
        <td><b>${esc(s.studentName)}</b></td>
        <td>${s.score === '' || s.score == null ? '—' : esc(s.score)}</td>
        <td><span class="pill ${s.status === 'reviewed' ? 'reviewed' : 'new'}">${s.status === 'reviewed' ? '已評' : '待評'}</span></td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="playSub('${s.fileId}', this)">▶ 播放</button>
          <button class="btn btn-ghost btn-sm" onclick="gradeSub(${s._row})">✍ 評分</button>
          <button class="btn btn-danger btn-sm" onclick="delSub(${s._row})">🗑</button>
          <div class="playerHolder"></div>
        </td>
      </tr>`).join('')}`;
}

async function playSub(fileId, btn) {
  const holder = btn.parentElement.querySelector('.playerHolder');
  if (holder.dataset.loaded) { holder.querySelector('audio').play(); return; }
  btn.innerText = '載入中…';
  const r = await apiCall({ action: 'getAudio', password: PW, fileId });
  btn.innerText = '▶ 播放';
  if (!r.ok) return alert('讀取失敗：' + (r.error || ''));
  const src = 'data:' + r.mime + ';base64,' + r.base64;
  holder.innerHTML = `<audio controls autoplay src="${src}"></audio>
    <a class="hint" href="${src}" download="${esc(r.fileName)}">⬇ 下載</a>`;
  holder.dataset.loaded = '1';
}

function gradeSub(row) {
  const s = DB.submissions.find(x => x._row === row);
  openModal(`
    <div class="title-badge">✍ 評分：${esc(s.studentName)} / ${esc(s.classId)}-${esc(s.lessonId)}</div>
    <label class="fld">分數（0–100，可留空）</label>
    <input id="gScore" type="number" min="0" max="100" value="${s.score === '' ? '' : esc(s.score)}">
    <label class="fld">評語</label>
    <textarea id="gComment">${esc(s.comment || '')}</textarea>
    <div style="height:14px"></div>
    <div class="row">
      <button class="btn btn-ghost" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveGrade(${row})">儲存</button>
    </div>`);
}
async function saveGrade(row) {
  const r = await apiCall({
    action: 'grade', password: PW, row,
    score: $('gScore').value, comment: $('gComment').value, status: 'reviewed'
  });
  if (r.ok) { closeModal(); await refreshAll(); } else alert('儲存失敗');
}
async function delSub(row) {
  if (!confirm('確定刪除這筆錄音？（含 Drive 檔案）')) return;
  const r = await apiCall({ action: 'deleteSubmission', password: PW, row, deleteFile: true });
  if (r.ok) await refreshAll(); else alert('刪除失敗');
}

// ---------------- 學生繳交彙整 ----------------
function renderStudents() {
  const map = {};
  DB.submissions.forEach(s => {
    const k = s.studentName || '(無名)';
    (map[k] = map[k] || []).push(s);
  });
  const names = Object.keys(map).sort();
  $('studentsTable').innerHTML = `
    <tr><th>學生</th><th>繳交次數</th><th>書·課次</th><th>最近繳交</th></tr>
    ${names.map(n => {
      const list = map[n];
      const tags = [...new Set(list.map(s => `${bookLabel(s.classId)}-${s.lessonId}`))].join('、');
      const latest = list.map(s => s.timestamp).sort().slice(-1)[0] || '';
      return `<tr><td><b>${esc(n)}</b></td><td>${list.length}</td><td>${esc(tags)}</td><td>${esc(latest)}</td></tr>`;
    }).join('')}`;
}

// ---------------- 統計 ----------------
function renderStats() {
  const totalSubs = DB.submissions.length;
  const students = new Set(DB.submissions.map(s => s.studentName)).size;
  const graded = DB.submissions.filter(s => s.status === 'reviewed').length;
  $('statCards').innerHTML = [
    ['總繳交數', totalSubs], ['學生人數', students], ['已評分', graded], ['待評分', totalSubs - graded]
  ].map(([l, n]) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('');

  $('statTable').innerHTML = `
    <tr><th>年級·書</th><th>課次</th><th>繳交數</th><th>已評</th><th>平均分</th></tr>
    ${DB.stats.map(v => `<tr>
      <td>${esc(bookLabel(v.classId))}</td><td>${esc(v.lessonId)}</td>
      <td>${v.count}</td><td>${v.graded}</td><td>${v.avg == null ? '—' : v.avg}</td></tr>`).join('') || '<tr><td colspan="5" class="hint">尚無資料</td></tr>'}`;
}

// ---------------- 課程管理 ----------------
function renderLessons() {
  // 書本：依年級分組
  const grades = {};
  DB.classes.forEach(c => { const g = c.gradeId || c.classId; (grades[g] = grades[g] || { name: c.gradeName || c.className || g, books: [] }).books.push(c); });
  const gkeys = Object.keys(grades).sort();
  $('classTable').innerHTML = `
    <tr><th>年級</th><th>書名</th><th>書本ID</th><th>顯示</th><th></th></tr>
    ${gkeys.map(g => grades[g].books.map((c, i) => `<tr>
      <td>${i === 0 ? '<b>' + esc(grades[g].name) + '</b>' : ''}</td>
      <td>${esc(c.bookTitle)}</td><td>${esc(c.classId)}</td>
      <td>${String(c.active).toLowerCase() === 'no' ? '隱藏' : '✅'}</td>
      <td><button class="btn btn-ghost btn-sm" onclick='editClass(${JSON.stringify(c)})'>編輯</button>
          <button class="btn btn-danger btn-sm" onclick="delClass('${esc(c.classId)}')">🗑</button></td>
    </tr>`).join('')).join('')}`;

  $('lessonTable').innerHTML = `
    <tr><th>年級·書</th><th>課次</th><th>標題</th><th>課文</th><th>音檔</th><th>顯示</th><th></th></tr>
    ${DB.lessons.map(l => `<tr>
      <td>${esc(bookLabel(l.classId))}</td><td>${esc(l.lessonId)}</td><td>${esc(l.lessonLabel)}</td>
      <td>${esc(String(l.text).slice(0, 24))}…</td>
      <td>${(l.audioUrl || l.audioFileId) ? '🎵' : '—'}${String(l.shadowMode).toLowerCase() === 'yes' ? ' 🎧逐句' : ''}</td>
      <td>${String(l.active).toLowerCase() === 'no' ? '隱藏' : '✅'}</td>
      <td><button class="btn btn-ghost btn-sm" onclick='editLesson(${JSON.stringify(l)})'>編輯</button>
          <button class="btn btn-danger btn-sm" onclick="delLesson('${esc(l.classId)}','${esc(l.lessonId)}')">🗑</button></td>
    </tr>`).join('')}`;
}

function editClass(c) {
  EDITING_EXISTING = !!(c && c.classId);
  c = c || { classId: '', className: '', bookTitle: '', active: 'yes', order: 99, gradeId: '', gradeName: '' };
  const gopts = gradeIds().map(g => { const nm = gradeNameByGid(g); return `<option value="${esc(g)}">${nm && nm !== g ? esc(nm) : esc(g)}</option>`; }).join('');
  openModal(`
    <div class="title-badge">${c.classId ? '編輯' : '新增'}書本</div>
    <div class="grid2">
      <div><label class="fld">年級ID（例：G7）</label>
        <input id="cGradeId" list="gradeIdList" value="${esc(c.gradeId || '')}" oninput="autoGradeName()" placeholder="G7">
        <datalist id="gradeIdList">${gopts}</datalist></div>
      <div><label class="fld">年級名稱（學生看到的標題）</label><input id="cGradeName" value="${esc(c.gradeName || '')}" placeholder="例：G7 錄音教室"></div>
    </div>
    <label class="fld">書名（例：Wonder）</label><input id="cBook" value="${esc(c.bookTitle)}">
    <label class="fld">書本ID（每本書都要不同，例：g7-wonder，建立後勿改）</label>
    <input id="cId" value="${esc(c.classId)}" ${c.classId ? 'readonly' : ''} placeholder="g7-wonder">
    <div class="grid2">
      <div><label class="fld">排序</label><input id="cOrder" type="number" value="${esc(c.order || 99)}"></div>
      <div><label class="fld">顯示給學生</label>
        <select id="cActive"><option value="yes" ${c.active !== 'no' ? 'selected' : ''}>是</option><option value="no" ${c.active === 'no' ? 'selected' : ''}>否</option></select></div>
    </div>
    <p class="hint">💡 同一個「年級ID」底下可以放多本書（每本書用不同的書本ID）；學生首頁會依年級把書分組。</p>
    <div style="height:12px"></div>
    <div class="row"><button class="btn btn-ghost" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveClass()">儲存</button></div>`);
}
async function saveClass() {
  const id = $('cId').value.trim();
  const gradeId = ($('cGradeId').value || '').trim();
  const gradeName = ($('cGradeName').value || '').trim();
  if (!id) return alert('請填書本ID');
  if (!gradeId) return alert('請填年級ID');
  if (!EDITING_EXISTING && DB.classes.some(c => c.classId === id)) {
    if (!confirm('⚠️ 書本ID「' + id + '」已經存在！\n\n繼續會覆蓋原本那本書（書名等會被改掉；課文不會被刪）。\n\n要新增「另一本書」請按取消，改用不同的書本ID。\n\n確定要覆蓋嗎？')) return;
  }
  const r = await apiCall({ action: 'saveClass', password: PW, classId: id,
    className: gradeName || gradeId, bookTitle: $('cBook').value,
    gradeId: gradeId, gradeName: gradeName || gradeId,
    order: $('cOrder').value, active: $('cActive').value });
  if (r.ok) { closeModal(); await refreshAll(); } else alert('儲存失敗');
}
async function delClass(id) {
  if (!confirm('刪除書本 ' + id + '？（不會刪已繳交錄音）')) return;
  const r = await apiCall({ action: 'deleteClass', password: PW, classId: id });
  if (r.ok) await refreshAll(); else alert('刪除失敗');
}

function editLesson(l) {
  EDITING_EXISTING = !!(l && l.classId && l.lessonId);
  l = l || { classId: '', lessonId: '', lessonLabel: '', text: '', audioUrl: '', order: 99, active: 'yes', shadowMode: 'no', marks: '', gapMultiplier: '1.5', audioFileId: '' };
  EDIT_MARKS = parseMarkStr(l.marks);
  const shadowOn = String(l.shadowMode).toLowerCase() === 'yes';
  const opts = DB.classes.map(c => `<option value="${esc(c.classId)}" ${c.classId === l.classId ? 'selected' : ''}>${esc(bookLabel(c.classId))}</option>`).join('');
  openModal(`
    <div class="title-badge">${l.lessonId && l.classId ? '編輯' : '新增'}課文</div>
    <div class="grid2">
      <div><label class="fld">書本</label><select id="lClass">${opts}</select></div>
      <div><label class="fld">課次ID（例：ch1，同班不可重複）</label><input id="lId" value="${esc(l.lessonId)}"></div>
    </div>
    <label class="fld">顯示標題（例：CH1）</label><input id="lLabel" value="${esc(l.lessonLabel)}">
    <label class="fld">課文</label><textarea id="lText">${esc(l.text)}</textarea>
    <label class="fld">示範音檔（擇一即可）</label>
    <input type="file" id="lAudioFile" accept="audio/*" onchange="uploadAudioFile()" style="padding:8px">
    <input type="hidden" id="lAudioFileId" value="${esc(l.audioFileId || '')}">
    <div id="audioStatus" class="hint" style="margin:6px 0">${l.audioFileId ? '✅ 已有上傳的音檔（可直接用，或重新上傳覆蓋）' : '從電腦選 mp3/m4a 直接上傳；或改用下面的網址。'}</div>
    <input id="lAudio" value="${esc(l.audioUrl)}" onblur="reloadMarkAudio()" placeholder="或貼音檔網址（相對路徑 G7/x.mp3 或 https://…）">
    <div class="grid2">
      <div><label class="fld">排序</label><input id="lOrder" type="number" value="${esc(l.order || 99)}"></div>
      <div><label class="fld">顯示給學生</label>
        <select id="lActive"><option value="yes" ${l.active !== 'no' ? 'selected' : ''}>是</option><option value="no" ${l.active === 'no' ? 'selected' : ''}>否</option></select></div>
    </div>

    <div style="border-top:1px solid var(--line); margin-top:16px; padding-top:12px">
      <label class="fld" style="display:flex; align-items:center; gap:8px; cursor:pointer; margin:0 0 6px">
        <input type="checkbox" id="lShadow" ${shadowOn ? 'checked' : ''} onchange="toggleShadow()" style="width:auto"> 🎧 開啟逐句交錯跟讀（播一句 → 留空白給學生錄音 → 下一句）
      </label>
      <div id="shadowBox" class="${shadowOn ? '' : 'hidden'}" style="background:var(--card2); border:1px solid var(--line); border-radius:12px; padding:14px">
        <p class="hint">① 按 ▶ 播放音檔，<b>每聽完一句就按一次「✂ 在這裡分句」</b> — 停頓位置完全由你決定。<br>② 空白時間 = 該句長度 × 下方倍數（程度較弱的班級可調高）。</p>
        <audio id="markAudio" controls style="width:100%; margin:6px 0"></audio>
        <div class="row" style="gap:8px; flex-wrap:wrap">
          <button type="button" class="btn btn-primary btn-sm" onclick="addMark()">✂ 在這裡分句</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="undoMark()">↩ 復原</button>
          <button type="button" class="btn btn-danger btn-sm" onclick="clearMarks()">🗑 清除</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="reloadMarkAudio()">🔄 重新載入音檔</button>
        </div>
        <div id="markList" style="margin-top:10px"></div>
        <label class="fld">空白倍數（數字越大空白越久，例：1.5）</label>
        <input id="lGapMult" type="number" step="0.1" min="0.2" value="${esc(l.gapMultiplier || '1.5')}" style="max-width:140px">
      </div>
    </div>

    <p class="hint" style="margin-top:12px">⚠ 外部音檔網址需支援 CORS，否則混音錄不進老師聲音；建議把 mp3 放進同個 repo 用相對路徑最穩。</p>
    <div style="height:10px"></div>
    <div class="row"><button class="btn btn-ghost" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveLesson()">儲存</button></div>`);
  reloadMarkAudio();
  renderMarks();
}

// ---- 分句標記工具 ----
function parseMarkStr(s) {
  return String(s || '').split(',').map(x => parseFloat(x.trim()))
    .filter(x => !isNaN(x) && x > 0).sort((a, b) => a - b);
}
function toggleShadow() {
  const on = $('lShadow').checked;
  $('shadowBox').classList.toggle('hidden', !on);
  if (on) reloadMarkAudio();
}
async function reloadMarkAudio() {
  const a = $('markAudio'); if (!a) return;
  // 1) 若剛選了本機檔案，直接用它（最即時）
  const inp = $('lAudioFile');
  if (inp && inp.files && inp.files[0]) { a.src = URL.createObjectURL(inp.files[0]); a.load(); return; }
  // 2) 已上傳的音檔：向後端要回來
  const fid = ($('lAudioFileId') && $('lAudioFileId').value || '').trim();
  if (fid) {
    try {
      const r = await apiCall({ action: 'lessonAudio', fileId: fid });
      if (r.ok) { a.src = 'data:' + r.mime + ';base64,' + r.base64; a.load(); return; }
    } catch (e) {}
  }
  // 3) 退回音檔網址
  const src = ($('lAudio').value || '').trim();
  if (src) { a.src = src; a.load(); }
}
async function uploadAudioFile() {
  const inp = $('lAudioFile');
  if (!inp || !inp.files || !inp.files[0]) return;
  const file = inp.files[0];
  $('audioStatus').innerText = '上傳中…（' + file.name + '）請稍候';
  try {
    const base64 = await fileToBase64(file);
    const r = await apiCall({ action: 'uploadAudio', password: PW, audio: base64, mime: file.type || 'audio/mpeg', filename: file.name });
    if (!r.ok) throw new Error(r.error || 'fail');
    $('lAudioFileId').value = r.fileId;
    $('audioStatus').innerText = '✅ 已上傳：' + (r.fileName || file.name) + '（記得按最下面「儲存」才生效）';
    const a = $('markAudio'); if (a) { a.src = URL.createObjectURL(file); a.load(); } // 立即可用來分句
  } catch (e) {
    $('audioStatus').innerText = '❌ 上傳失敗：' + (e.message || e);
  }
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result.split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function addMark() {
  const a = $('markAudio');
  if (!a || !a.duration) return alert('請先按 ▶ 播放音檔，再標記分句點');
  const t = Math.round(a.currentTime * 100) / 100;
  if (t <= 0) return;
  EDIT_MARKS.push(t);
  EDIT_MARKS = [...new Set(EDIT_MARKS)].sort((x, y) => x - y);
  renderMarks();
}
function undoMark() { EDIT_MARKS.pop(); renderMarks(); }
function removeMark(i) { EDIT_MARKS.splice(i, 1); renderMarks(); }
function clearMarks() { if (confirm('清除所有分句點？')) { EDIT_MARKS = []; renderMarks(); } }
function fmtT(s) { const m = Math.floor(s / 60), ss = s % 60; return m + ':' + (ss < 10 ? '0' : '') + ss.toFixed(1); }
function renderMarks() {
  const box = $('markList'); if (!box) return;
  if (!EDIT_MARKS.length) { box.innerHTML = '<span class="hint">尚無分句點。播放後按「✂ 在這裡分句」。</span>'; return; }
  box.innerHTML = '<span class="hint">共 ' + EDIT_MARKS.length + ' 句停頓：</span> ' +
    EDIT_MARKS.map((t, i) => `<span class="pill reviewed" style="margin:3px; display:inline-block">${i + 1}. ${fmtT(t)} <a onclick="removeMark(${i})" style="cursor:pointer;color:var(--danger);font-weight:700">✕</a></span>`).join('');
}
async function saveLesson() {
  const classId = $('lClass').value, lessonId = $('lId').value.trim();
  if (!classId || !lessonId) return alert('請選班級並填課次ID');
  if (!EDITING_EXISTING && DB.lessons.some(l => l.classId === classId && l.lessonId === lessonId)) {
    if (!confirm('⚠️ 這個班級已經有課次ID「' + lessonId + '」，繼續會覆蓋原本那一課的內容。\n\n要新增「另一課」請按取消，改用不同的課次ID（例如 ch2、ch3）。\n\n確定要覆蓋嗎？')) return;
  }
  const shadowOn = $('lShadow') && $('lShadow').checked;
  const r = await apiCall({ action: 'saveLesson', password: PW, classId, lessonId,
    lessonLabel: $('lLabel').value, text: $('lText').value, audioUrl: $('lAudio').value,
    audioFileId: ($('lAudioFileId') && $('lAudioFileId').value) || '',
    order: $('lOrder').value, active: $('lActive').value,
    shadowMode: shadowOn ? 'yes' : 'no',
    marks: EDIT_MARKS.join(','),
    gapMultiplier: ($('lGapMult') && $('lGapMult').value) || '1.5' });
  if (r.ok) { closeModal(); await refreshAll(); } else alert('儲存失敗');
}
async function delLesson(classId, lessonId) {
  if (!confirm(`刪除課文 ${classId}-${lessonId}？`)) return;
  const r = await apiCall({ action: 'deleteLesson', password: PW, classId, lessonId });
  if (r.ok) await refreshAll(); else alert('刪除失敗');
}

// ---------------- 設定 ----------------
async function changePassword() {
  const a = $('np1').value, b = $('np2').value;
  if (!a || a !== b) { $('pwMsg').innerText = '兩次密碼不一致'; return; }
  const r = await apiCall({ action: 'setPassword', password: PW, newPassword: a });
  if (r.ok) { PW = a; sessionStorage.setItem('pas_pw', a); $('pwMsg').innerText = '✅ 已更新'; $('np1').value = $('np2').value = ''; }
  else $('pwMsg').innerText = '更新失敗';
}

// ---------------- 班級 / 學生名單 / 派作業 ----------------
function roomById(id) { return DB.rooms.find(r => r.roomId === id); }
function roomName(id) { const r = roomById(id); return r ? (r.roomName || r.roomId) : id; }
function lessonLabelOf(classId, lessonId) { const l = DB.lessons.find(x => x.classId === classId && x.lessonId === lessonId); return l ? (l.lessonLabel || lessonId) : lessonId; }

function fillRoomSelects() {
  const opts = DB.rooms.map(r => `<option value="${esc(r.roomId)}">${esc(r.roomName)}（${esc(r.code)}）</option>`).join('');
  ['rRoom', 'aRoom'].forEach(id => { const el = $(id); if (el) { const cur = el.value; el.innerHTML = opts || '<option value="">（尚無班級，先到「班級」分頁新增）</option>'; if (cur) el.value = cur; } });
}
function renderRooms() {
  const t = $('roomTable'); if (!t) return;
  t.innerHTML = `
    <tr><th>班級名稱</th><th>班級代碼</th><th>學生數</th><th>顯示</th><th></th></tr>
    ${DB.rooms.map(r => `<tr>
      <td><b>${esc(r.roomName)}</b></td>
      <td><span class="pill reviewed">${esc(r.code)}</span></td>
      <td>${DB.students.filter(s => s.roomId === r.roomId).length}</td>
      <td>${String(r.active).toLowerCase() === 'no' ? '隱藏' : '✅'}</td>
      <td><button class="btn btn-ghost btn-sm" onclick='editRoom(${JSON.stringify(r)})'>編輯</button>
          <button class="btn btn-danger btn-sm" onclick="delRoom('${esc(r.roomId)}')">🗑</button></td>
    </tr>`).join('') || '<tr><td colspan="5" class="hint">還沒有班級，按右上「＋ 新增班級」。</td></tr>'}`;
}
function editRoom(r) {
  r = r || { roomId: '', roomName: '', code: '', active: 'yes' };
  openModal(`
    <div class="title-badge">${r.roomId ? '編輯' : '新增'}班級</div>
    <label class="fld">班級名稱</label><input id="kName" value="${esc(r.roomName)}" placeholder="例：週三晚班">
    <label class="fld">班級代碼（發給學生登入用，英數字，例 abc123）</label>
    <input id="kCode" value="${esc(r.code)}" placeholder="abc123">
    <label class="fld">顯示</label>
    <select id="kActive"><option value="yes" ${r.active !== 'no' ? 'selected' : ''}>是</option><option value="no" ${r.active === 'no' ? 'selected' : ''}>否</option></select>
    <input type="hidden" id="kId" value="${esc(r.roomId)}">
    <div style="height:12px"></div>
    <div class="row"><button class="btn btn-ghost" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveRoom()">儲存</button></div>`);
}
async function saveRoom() {
  const code = ($('kCode').value || '').trim(), name = ($('kName').value || '').trim();
  if (!name) return alert('請填班級名稱');
  if (!code) return alert('請填班級代碼');
  if (DB.rooms.some(r => r.roomId !== $('kId').value && String(r.code).trim().toLowerCase() === code.toLowerCase()))
    return alert('這個班級代碼已被其他班級使用，請換一個');
  const r = await apiCall({ action: 'saveRoom', password: PW, roomId: $('kId').value, roomName: name, code, active: $('kActive').value });
  if (r.ok) { closeModal(); await refreshAll(); } else alert('儲存失敗');
}
async function delRoom(id) {
  if (!confirm('刪除這個班級？（學生名單與已派作業會留著）')) return;
  const r = await apiCall({ action: 'deleteRoom', password: PW, roomId: id });
  if (r.ok) await refreshAll(); else alert('刪除失敗');
}

function renderRoster() {
  const t = $('rosterTable'); if (!t) return;
  const roomId = $('rRoom') ? $('rRoom').value : '';
  const list = DB.students.filter(s => s.roomId === roomId).sort((a, b) => (a.order || 0) - (b.order || 0));
  t.innerHTML = `
    <tr><th>學生姓名</th><th>PIN（可空）</th><th>顯示</th><th></th></tr>
    ${list.map(s => `<tr>
      <td><b>${esc(s.name)}</b></td><td>${esc(s.pin) || '—'}</td>
      <td>${String(s.active).toLowerCase() === 'no' ? '隱藏' : '✅'}</td>
      <td><button class="btn btn-ghost btn-sm" onclick='editStudent(${JSON.stringify(s)})'>編輯</button>
          <button class="btn btn-danger btn-sm" onclick="delStudent('${esc(s.studentId)}')">🗑</button></td>
    </tr>`).join('') || `<tr><td colspan="4" class="hint">${DB.rooms.length ? '這個班還沒有學生，按「＋ 新增學生」或「批次貼上名單」。' : '請先到「班級」分頁新增班級。'}</td></tr>`}`;
}
function editStudent(s) {
  const roomId = (s && s.roomId) || ($('rRoom') ? $('rRoom').value : '');
  s = s || { studentId: '', roomId: roomId, name: '', pin: '', active: 'yes' };
  const ropts = DB.rooms.map(r => `<option value="${esc(r.roomId)}" ${r.roomId === s.roomId ? 'selected' : ''}>${esc(r.roomName)}</option>`).join('');
  openModal(`
    <div class="title-badge">${s.studentId ? '編輯' : '新增'}學生</div>
    <label class="fld">班級</label><select id="sRoom">${ropts}</select>
    <label class="fld">學生姓名</label><input id="sName" value="${esc(s.name)}">
    <label class="fld">PIN 碼（4 位數，可留空＝不用 PIN）</label><input id="sPin" value="${esc(s.pin)}" maxlength="6">
    <input type="hidden" id="sId" value="${esc(s.studentId)}">
    <div style="height:12px"></div>
    <div class="row"><button class="btn btn-ghost" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveStudent()">儲存</button></div>`);
}
async function saveStudent() {
  const name = ($('sName').value || '').trim();
  if (!name) return alert('請填學生姓名');
  const r = await apiCall({ action: 'saveStudent', password: PW, studentId: $('sId').value, roomId: $('sRoom').value, name, pin: ($('sPin').value || '').trim() });
  if (r.ok) { closeModal(); await refreshAll(); } else alert('儲存失敗');
}
async function delStudent(id) {
  if (!confirm('刪除這個學生？')) return;
  const r = await apiCall({ action: 'deleteStudent', password: PW, studentId: id });
  if (r.ok) await refreshAll(); else alert('刪除失敗');
}
function bulkStudents() {
  const roomId = $('rRoom') ? $('rRoom').value : '';
  if (!roomId) return alert('請先在上面選一個班級');
  openModal(`
    <div class="title-badge">批次新增學生到「${esc(roomName(roomId))}」</div>
    <p class="hint">一行一個名字，貼上後按新增。</p>
    <textarea id="bNames" style="min-height:180px" placeholder="小明&#10;小華&#10;小美"></textarea>
    <div style="height:12px"></div>
    <div class="row"><button class="btn btn-ghost" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveBulk('${esc(roomId)}')">新增</button></div>`);
}
async function saveBulk(roomId) {
  const names = ($('bNames').value || '').split('\n').map(x => x.trim()).filter(Boolean);
  if (!names.length) return alert('請至少輸入一個名字');
  const r = await apiCall({ action: 'saveStudentsBulk', password: PW, roomId, names });
  if (r.ok) { closeModal(); await refreshAll(); alert('已新增 ' + r.created + ' 位學生'); } else alert('新增失敗');
}

function renderAssignments() {
  const t = $('assignTable'); if (!t) return;
  const roomId = $('aRoom') ? $('aRoom').value : '';
  const list = DB.assignments.filter(a => a.roomId === roomId).sort((a, b) => (a.order || 0) - (b.order || 0));
  t.innerHTML = `
    <tr><th>指派內容（書 · 課次）</th><th>截止日</th><th>顯示</th><th></th></tr>
    ${list.map(a => `<tr>
      <td><b>${esc(bookLabel(a.classId))}</b> · ${esc(lessonLabelOf(a.classId, a.lessonId))}</td>
      <td>${esc(a.dueDate) || '—'}</td>
      <td>${String(a.active).toLowerCase() === 'no' ? '隱藏' : '✅'}</td>
      <td><button class="btn btn-ghost btn-sm" onclick='editAssignment(${JSON.stringify(a)})'>編輯</button>
          <button class="btn btn-danger btn-sm" onclick="delAssignment('${esc(a.assignId)}')">🗑</button></td>
    </tr>`).join('') || `<tr><td colspan="4" class="hint">${DB.rooms.length ? '這個班還沒派作業，按「＋ 指派作業」。' : '請先到「班級」分頁新增班級。'}</td></tr>`}`;
}
function editAssignment(a) {
  const roomId = (a && a.roomId) || ($('aRoom') ? $('aRoom').value : '');
  a = a || { assignId: '', roomId: roomId, classId: '', lessonId: '', dueDate: '', active: 'yes', note: '' };
  const ropts = DB.rooms.map(r => `<option value="${esc(r.roomId)}" ${r.roomId === a.roomId ? 'selected' : ''}>${esc(r.roomName)}</option>`).join('');
  const bopts = DB.classes.map(c => `<option value="${esc(c.classId)}" ${c.classId === a.classId ? 'selected' : ''}>${esc(bookLabel(c.classId))}</option>`).join('');
  openModal(`
    <div class="title-badge">${a.assignId ? '編輯' : '指派'}作業</div>
    <label class="fld">指派給哪個班級</label><select id="gRoom">${ropts}</select>
    <label class="fld">選書本</label><select id="gBook" onchange="fillAssignLessons()">${bopts}</select>
    <label class="fld">選課次</label><select id="gLesson"></select>
    <label class="fld">截止日（可空）</label><input id="gDue" type="date" value="${esc(a.dueDate)}">
    <input type="hidden" id="gId" value="${esc(a.assignId)}">
    <input type="hidden" id="gLessonCur" value="${esc(a.lessonId)}">
    <div style="height:12px"></div>
    <div class="row"><button class="btn btn-ghost" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveAssignment()">儲存</button></div>`);
  fillAssignLessons();
}
function fillAssignLessons() {
  const classId = $('gBook') ? $('gBook').value : '';
  const cur = $('gLessonCur') ? $('gLessonCur').value : '';
  const ls = DB.lessons.filter(l => l.classId === classId).sort((a, b) => (a.order || 0) - (b.order || 0));
  $('gLesson').innerHTML = ls.map(l => `<option value="${esc(l.lessonId)}" ${l.lessonId === cur ? 'selected' : ''}>${esc(l.lessonLabel || l.lessonId)}</option>`).join('') || '<option value="">（這本書還沒有課文）</option>';
}
async function saveAssignment() {
  const roomId = $('gRoom').value, classId = $('gBook').value, lessonId = $('gLesson').value;
  if (!roomId || !classId || !lessonId) return alert('請選班級、書本、課次');
  const r = await apiCall({ action: 'saveAssignment', password: PW, assignId: $('gId').value, roomId, classId, lessonId, dueDate: $('gDue').value });
  if (r.ok) { closeModal(); await refreshAll(); } else alert('儲存失敗');
}
async function delAssignment(id) {
  if (!confirm('取消這個作業指派？（不會刪學生已交的錄音）')) return;
  const r = await apiCall({ action: 'deleteAssignment', password: PW, assignId: id });
  if (r.ok) await refreshAll(); else alert('刪除失敗');
}

// ---------------- Modal ----------------
function openModal(html) { $('modalBody').innerHTML = html; $('modal').classList.remove('hidden'); }
function closeModal() { $('modal').classList.add('hidden'); }

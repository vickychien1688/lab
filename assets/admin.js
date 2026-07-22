/* 老師後台邏輯 */
let PW = sessionStorage.getItem('pas_pw') || '';
let DB = { classes: [], lessons: [], submissions: [], stats: [] };

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
function renderAll() { renderSubs(); renderStudents(); renderStats(); renderLessons(); populateFilters(); }

function showTab(t) {
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === t));
  document.querySelectorAll('.tabpane').forEach(p => p.classList.add('hidden'));
  $('pane-' + t).classList.remove('hidden');
}

// ---------------- 學生錄音 ----------------
function populateFilters() {
  const fc = $('fClass'), fl = $('fLesson');
  fc.innerHTML = '<option value="">全部班級</option>' + DB.classes.map(c => `<option value="${esc(c.classId)}">${esc(c.className || c.classId)}</option>`).join('');
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
    <tr><th>時間</th><th>班級</th><th>課次</th><th>學生</th><th>分數</th><th>狀態</th><th>操作</th></tr>
    ${rows.map(s => `
      <tr>
        <td>${esc(s.timestamp)}</td>
        <td>${esc(s.classId)}</td>
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
    <tr><th>學生</th><th>繳交次數</th><th>班級/課次</th><th>最近繳交</th></tr>
    ${names.map(n => {
      const list = map[n];
      const tags = [...new Set(list.map(s => `${s.classId}-${s.lessonId}`))].join('、');
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
    <tr><th>班級</th><th>課次</th><th>繳交數</th><th>已評</th><th>平均分</th></tr>
    ${DB.stats.map(v => `<tr>
      <td>${esc(v.classId)}</td><td>${esc(v.lessonId)}</td>
      <td>${v.count}</td><td>${v.graded}</td><td>${v.avg == null ? '—' : v.avg}</td></tr>`).join('') || '<tr><td colspan="5" class="hint">尚無資料</td></tr>'}`;
}

// ---------------- 課程管理 ----------------
function renderLessons() {
  $('classTable').innerHTML = `
    <tr><th>班級ID</th><th>班級名稱</th><th>書名/主題</th><th>顯示</th><th></th></tr>
    ${DB.classes.map(c => `<tr>
      <td>${esc(c.classId)}</td><td>${esc(c.className)}</td><td>${esc(c.bookTitle)}</td>
      <td>${String(c.active).toLowerCase() === 'no' ? '隱藏' : '✅'}</td>
      <td><button class="btn btn-ghost btn-sm" onclick='editClass(${JSON.stringify(c)})'>編輯</button>
          <button class="btn btn-danger btn-sm" onclick="delClass('${esc(c.classId)}')">🗑</button></td>
    </tr>`).join('')}`;

  $('lessonTable').innerHTML = `
    <tr><th>班級</th><th>課次</th><th>標題</th><th>課文</th><th>音檔</th><th>顯示</th><th></th></tr>
    ${DB.lessons.map(l => `<tr>
      <td>${esc(l.classId)}</td><td>${esc(l.lessonId)}</td><td>${esc(l.lessonLabel)}</td>
      <td>${esc(String(l.text).slice(0, 30))}…</td>
      <td>${l.audioUrl ? '🎵' : '—'}</td>
      <td>${String(l.active).toLowerCase() === 'no' ? '隱藏' : '✅'}</td>
      <td><button class="btn btn-ghost btn-sm" onclick='editLesson(${JSON.stringify(l)})'>編輯</button>
          <button class="btn btn-danger btn-sm" onclick="delLesson('${esc(l.classId)}','${esc(l.lessonId)}')">🗑</button></td>
    </tr>`).join('')}`;
}

function editClass(c) {
  c = c || { classId: '', className: '', bookTitle: '', active: 'yes', order: 99 };
  openModal(`
    <div class="title-badge">${c.classId ? '編輯' : '新增'}班級</div>
    <label class="fld">班級ID（例：G7，建立後勿改）</label>
    <input id="cId" value="${esc(c.classId)}" ${c.classId ? 'readonly' : ''}>
    <label class="fld">班級名稱</label><input id="cName" value="${esc(c.className)}">
    <label class="fld">書名/主題</label><input id="cBook" value="${esc(c.bookTitle)}">
    <div class="grid2">
      <div><label class="fld">排序</label><input id="cOrder" type="number" value="${esc(c.order || 99)}"></div>
      <div><label class="fld">顯示給學生</label>
        <select id="cActive"><option value="yes" ${c.active !== 'no' ? 'selected' : ''}>是</option><option value="no" ${c.active === 'no' ? 'selected' : ''}>否</option></select></div>
    </div>
    <div style="height:14px"></div>
    <div class="row"><button class="btn btn-ghost" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveClass()">儲存</button></div>`);
}
async function saveClass() {
  const id = $('cId').value.trim();
  if (!id) return alert('請填班級ID');
  const r = await apiCall({ action: 'saveClass', password: PW, classId: id,
    className: $('cName').value, bookTitle: $('cBook').value, order: $('cOrder').value, active: $('cActive').value });
  if (r.ok) { closeModal(); await refreshAll(); } else alert('儲存失敗');
}
async function delClass(id) {
  if (!confirm('刪除班級 ' + id + '？（不會刪已繳交錄音）')) return;
  const r = await apiCall({ action: 'deleteClass', password: PW, classId: id });
  if (r.ok) await refreshAll(); else alert('刪除失敗');
}

function editLesson(l) {
  l = l || { classId: '', lessonId: '', lessonLabel: '', text: '', audioUrl: '', order: 99, active: 'yes' };
  const opts = DB.classes.map(c => `<option value="${esc(c.classId)}" ${c.classId === l.classId ? 'selected' : ''}>${esc(c.className || c.classId)}</option>`).join('');
  openModal(`
    <div class="title-badge">${l.lessonId && l.classId ? '編輯' : '新增'}課文</div>
    <div class="grid2">
      <div><label class="fld">班級</label><select id="lClass">${opts}</select></div>
      <div><label class="fld">課次ID（例：ch1，同班不可重複）</label><input id="lId" value="${esc(l.lessonId)}"></div>
    </div>
    <label class="fld">顯示標題（例：CH1）</label><input id="lLabel" value="${esc(l.lessonLabel)}">
    <label class="fld">課文</label><textarea id="lText">${esc(l.text)}</textarea>
    <label class="fld">示範音檔網址（同網域相對路徑如 G7/g7_ch1.mp3，或完整 https 網址）</label>
    <input id="lAudio" value="${esc(l.audioUrl)}">
    <div class="grid2">
      <div><label class="fld">排序</label><input id="lOrder" type="number" value="${esc(l.order || 99)}"></div>
      <div><label class="fld">顯示給學生</label>
        <select id="lActive"><option value="yes" ${l.active !== 'no' ? 'selected' : ''}>是</option><option value="no" ${l.active === 'no' ? 'selected' : ''}>否</option></select></div>
    </div>
    <p class="hint">⚠ 外部音檔網址需支援 CORS，否則混音錄不進老師聲音；建議把 mp3 放進同個 repo 用相對路徑最穩。</p>
    <div style="height:10px"></div>
    <div class="row"><button class="btn btn-ghost" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveLesson()">儲存</button></div>`);
}
async function saveLesson() {
  const classId = $('lClass').value, lessonId = $('lId').value.trim();
  if (!classId || !lessonId) return alert('請選班級並填課次ID');
  const r = await apiCall({ action: 'saveLesson', password: PW, classId, lessonId,
    lessonLabel: $('lLabel').value, text: $('lText').value, audioUrl: $('lAudio').value,
    order: $('lOrder').value, active: $('lActive').value });
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

// ---------------- Modal ----------------
function openModal(html) { $('modalBody').innerHTML = html; $('modal').classList.remove('hidden'); }
function closeModal() { $('modal').classList.add('hidden'); }

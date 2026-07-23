/* 學生跟讀 App 邏輯 —— 資料驅動（課程來自後端），錄音為「老師示範 + 學生聲音」混音 */
(() => {
  const qs = new URLSearchParams(location.search);
  const classId = qs.get('class') || 'G7';
  const lessonParam = qs.get('lesson');
  const assignParam = qs.get('assign');
  const STU = (() => { try { return JSON.parse(localStorage.getItem('pas_student') || 'null'); } catch (e) { return null; } })();

  const el = id => document.getElementById(id);
  const select = el('lessonSelect');
  let lessons = [];
  let recStartMs = 0;

  // ---- 已登入學生：帶入身分、鎖定姓名、顯示回作業列表 ----
  if (STU) {
    const n = el('studentName'); if (n) { n.value = STU.name; n.readOnly = true; }
    const brand = document.querySelector('.brand');
    if (brand) brand.innerHTML = 'PAS ENGLISH LAB · <a href="my.html" style="color:var(--primary)">← 回我的作業</a>';
  }

  // ---- 偵測 LINE / FB 等內建瀏覽器（常無法錄音）----
  const UA = navigator.userAgent || '';
  const isIOS = () => /iPhone|iPad|iPod/i.test(UA);
  const inApp = () => /\bLine\/[\d.]+/i.test(UA) || /FBAN|FBAV|FB_IAB|Instagram|Messenger|MicroMessenger/i.test(UA);
  (function warnInApp() {
    if (!inApp()) return;
    const steps = isIOS()
      ? '📱 <b>iPhone</b>：點畫面<b>右下角</b>的分享圖示，選「<b>用 Safari 開啟</b>」'
      : '🤖 <b>Android</b>：點右上角選單「⋮」，選「<b>用其他瀏覽器開啟</b>」';
    const b = el('inappWarn');
    b.innerHTML = '⚠️ <b>你正在用 LINE 開啟，通常無法錄音！</b><br>請改用手機瀏覽器（Safari／Chrome）：<br>' + steps +
      '<br>或按 <button id="copyUrlBtn" class="btn" style="background:#f6ad55;color:#3a2a12;padding:6px 12px;font-size:13px;margin-top:8px">📋 複製網址</button> 再貼到瀏覽器網址列打開。';
    b.classList.remove('hidden');
    const c = el('copyUrlBtn');
    if (c) c.onclick = async () => {
      try { await navigator.clipboard.writeText(location.href); c.innerText = '✅ 已複製'; }
      catch (e) { prompt('複製這個網址，貼到 Safari／Chrome：', location.href); }
    };
  })();

  // ---- 載入該班課程 ----
  (async () => {
    try {
      const [cls, les] = await Promise.all([
        apiCall({ action: 'classes' }),
        apiCall({ action: 'lessons', classId })
      ]);
      const cinfo = (cls.classes || []).find(c => c.classId === classId);
      el('bookTitle').innerText = cinfo ? (cinfo.bookTitle || cinfo.classId) : classId;
      lessons = les.lessons || [];
      if (!lessons.length) { el('lessonText').innerText = '這個班級還沒有課文，請聯絡老師。'; return; }
      select.innerHTML = lessons.map(l => `<option value="${l.lessonId}">${escAttr(l.lessonLabel || l.lessonId)}</option>`).join('');
      select.onchange = switchLesson;
      if (lessonParam && lessons.some(l => l.lessonId === lessonParam)) { select.value = lessonParam; if (assignParam) select.disabled = true; }
      switchLesson();
    } catch (e) {
      el('lessonText').innerText = '連線失敗，請確認 config.js 的 API_URL。';
    }
  })();

  function currentLesson() { return lessons.find(l => l.lessonId === select.value) || lessons[0]; }

  function switchLesson() {
    const l = currentLesson();
    el('lessonText').innerText = l.text || '';
    el('audioPlayer').classList.add('hidden');
    el('uploadBtn').classList.add('hidden');
    // 音檔直接串流（CDN 或同網域檔案），不再等整包下載
    const t = el('teacherAudio');
    t.src = l.audioUrl || '';
    t.load();
    el('status').innerText = 'READY';
  }

  // ---- 錄音 ----
  let audioCtx, recorder, chunks = [], animationId, dest, analyser, tSource, recMime = 'audio/mp4';

  el('startBtn').onclick = async () => {
    if (!el('studentName').value.trim()) return alert('請先輸入名字 Enter Name!');
    stopMicTest();
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') await audioCtx.resume();

      const tAudio = el('teacherAudio');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      dest = audioCtx.createMediaStreamDestination();
      analyser = audioCtx.createAnalyser();

      const mic = audioCtx.createMediaStreamSource(stream);
      mic.connect(analyser);
      mic.connect(dest);

      if (!tSource) {
        tSource = audioCtx.createMediaElementSource(tAudio);
        tSource.connect(dest);                 // 老師音檔混入錄音
        tSource.connect(audioCtx.destination); // 同時放給學生聽
      }

      drawWave();

      recMime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      recorder = new MediaRecorder(dest.stream, { mimeType: recMime });
      chunks = [];
      recorder.ondataavailable = e => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recMime });
        const p = el('audioPlayer');
        p.src = URL.createObjectURL(blob);
        p.classList.remove('hidden');
        el('uploadBtn').classList.remove('hidden');
        el('uploadBtn')._blob = blob;
        cancelAnimationFrame(animationId);
      };

      recorder.start();
      recStartMs = Date.now();
      el('startBtn').disabled = true;
      el('stopBtn').disabled = false;

      const l = currentLesson();
      const marks = parseMarks(l.marks);
      const shadow = String(l.shadowMode).toLowerCase() === 'yes' && marks.length > 0;
      if (shadow) {
        runShadow(tAudio, marks, parseFloat(l.gapMultiplier) || 1.5);
      } else {
        tAudio.currentTime = 0;
        tAudio.play();
        el('status').innerText = 'RECORDING…';
      }
    } catch (e) {
      alert(inApp()
        ? '無法使用麥克風。\n\n請改用手機的 Safari 或 Chrome 開啟這個網頁，不要用 LINE 內建瀏覽器。\n（可用畫面上的「複製網址」貼到瀏覽器）'
        : ('麥克風錯誤 Mic Error: ' + (e.message || e)));
    }
  };

  el('stopBtn').onclick = () => stopRecording('DONE — 可試聽後送出');

  function stopRecording(msg) {
    shadowAbort = true;
    if (shadowTimer) { clearTimeout(shadowTimer); shadowTimer = null; }
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    el('teacherAudio').pause();
    el('startBtn').disabled = false;
    el('stopBtn').disabled = true;
    el('status').innerText = msg || 'DONE';
  }

  // ---- 逐句交錯跟讀：依老師標記的「分句點」，播一句→留空白→下一句 ----
  let shadowAbort = false, shadowTimer = null;
  function parseMarks(s) {
    return String(s || '').split(',').map(x => parseFloat(x.trim()))
      .filter(x => !isNaN(x) && x > 0).sort((a, b) => a - b);
  }
  async function runShadow(a, marks, mult) {
    shadowAbort = false;
    let start = 0;
    for (let i = 0; i < marks.length; i++) {
      if (shadowAbort) return;
      const end = marks[i];
      el('status').innerText = `▶ 播放第 ${i + 1}/${marks.length} 句…`;
      await playSeg(a, start, end);
      if (shadowAbort) return;
      const gap = Math.max((end - start) * mult, 0.8);
      el('status').innerText = `🎤 換你唸！(${i + 1}/${marks.length})`;
      await sleep(gap * 1000);
      start = end;
    }
    if (!shadowAbort) stopRecording('✅ 完成 — 可試聽後送出');
  }
  function playSeg(a, start, end) {
    return new Promise(res => {
      let done = false;
      const finish = () => {
        if (done) return; done = true;
        a.pause();
        a.removeEventListener('timeupdate', onTime);
        a.removeEventListener('ended', finish);
        res();
      };
      const onTime = () => { if (shadowAbort || a.currentTime >= end - 0.03) finish(); };
      a.addEventListener('timeupdate', onTime);
      a.addEventListener('ended', finish);
      a.currentTime = start;
      const p = a.play();
      if (p && p.catch) p.catch(() => finish());
    });
  }
  function sleep(ms) { return new Promise(r => { shadowTimer = setTimeout(r, ms); }); }

  el('uploadBtn').onclick = async () => {
    const btn = el('uploadBtn');
    const blob = btn._blob;
    if (!blob) return;
    btn.disabled = true;
    el('status').innerText = 'UPLOADING…';
    try {
      const base64 = await blobToBase64(blob);
      const l = currentLesson();
      const r = await apiCall({
        action: 'submit',
        classId,
        lessonId: l.lessonId,
        studentName: STU ? STU.name : el('studentName').value.trim(),
        roomId: STU ? STU.roomId : '',
        studentId: STU ? STU.studentId : '',
        assignId: assignParam || '',
        mime: recMime,
        duration: Math.round((Date.now() - recStartMs) / 1000),
        audio: base64
      });
      if (r.ok) { el('status').innerText = '✅ 已送出給老師！'; alert('送出成功 Success!'); if (STU) location.href = 'my.html'; }
      else { throw new Error(r.error || 'fail'); }
    } catch (e) {
      el('status').innerText = '❌ 送出失敗，請再試一次';
      alert('送出失敗 Upload Fail: ' + (e.message || e));
    } finally {
      btn.disabled = false;
    }
  };

  // ---- 錄音前測試麥克風（讓學生確認有收音）----
  let testStream = null, testCtx = null, testRaf = null;
  el('testMicBtn').onclick = async () => {
    if (testStream) { stopMicTest(); return; }
    try {
      testStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      testCtx = new (window.AudioContext || window.webkitAudioContext)();
      const an = testCtx.createAnalyser();
      testCtx.createMediaStreamSource(testStream).connect(an);
      el('testMicBtn').innerText = '⏹ 停止測試';
      const canvas = el('visualizer'), ctx = canvas.getContext('2d');
      const data = new Uint8Array(an.frequencyBinCount);
      const draw = () => {
        testRaf = requestAnimationFrame(draw);
        an.getByteTimeDomainData(data);
        let peak = 0;
        for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128));
        const on = peak > 6;
        el('micHint').innerText = on ? '✅ 有收到你的聲音！' : '🎤 對著麥克風說話看看…';
        el('micHint').style.color = on ? '#00ff88' : '#8a93a2';
        ctx.fillStyle = '#111'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.lineWidth = 2; ctx.strokeStyle = on ? '#00ff88' : '#4a5568'; ctx.beginPath();
        let x = 0; const slice = canvas.width / data.length;
        for (let i = 0; i < data.length; i++) {
          const v = data[i] / 128.0, y = v * canvas.height / 2;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          x += slice;
        }
        ctx.stroke();
      };
      draw();
    } catch (e) {
      el('micHint').innerText = inApp()
        ? '❌ LINE 內建瀏覽器無法錄音，請改用 Safari／Chrome 開啟（見上方橘色提示）'
        : '❌ 拿不到麥克風，請按瀏覽器的「允許」麥克風';
      el('micHint').style.color = '#e53e3e';
    }
  };
  function stopMicTest() {
    if (testRaf) { cancelAnimationFrame(testRaf); testRaf = null; }
    if (testStream) { testStream.getTracks().forEach(t => t.stop()); testStream = null; }
    if (testCtx) { try { testCtx.close(); } catch (e) {} testCtx = null; }
    const b = el('testMicBtn'); if (b) b.innerText = '🎤 測試麥克風';
    const h = el('micHint'); if (h) { h.innerText = '按這裡先確認麥克風有收到你的聲音'; h.style.color = '#8a93a2'; }
  }

  // ---- 工具 ----
  function drawWave() {
    const canvas = el('visualizer'), ctx = canvas.getContext('2d');
    const draw = () => {
      animationId = requestAnimationFrame(draw);
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(data);
      ctx.fillStyle = '#111'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2; ctx.strokeStyle = '#00ff88'; ctx.beginPath();
      let x = 0; const slice = canvas.width / data.length;
      for (let i = 0; i < data.length; i++) {
        const v = data[i] / 128.0, y = v * canvas.height / 2;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        x += slice;
      }
      ctx.stroke();
    };
    draw();
  }
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result.split(',')[1]);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }
  function escAttr(s){ return String(s==null?'':s).replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
})();

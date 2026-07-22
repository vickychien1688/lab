/* 學生跟讀 App 邏輯 —— 資料驅動（課程來自後端），錄音為「老師示範 + 學生聲音」混音 */
(() => {
  const qs = new URLSearchParams(location.search);
  const classId = qs.get('class') || 'G7';

  const el = id => document.getElementById(id);
  const select = el('lessonSelect');
  let lessons = [];
  let recStartMs = 0;

  // ---- 載入該班課程 ----
  (async () => {
    try {
      const [cls, les] = await Promise.all([
        apiCall({ action: 'classes' }),
        apiCall({ action: 'lessons', classId })
      ]);
      const cinfo = (cls.classes || []).find(c => c.classId === classId);
      el('bookTitle').innerText = cinfo ? (cinfo.bookTitle || cinfo.className || classId) : classId;
      lessons = les.lessons || [];
      if (!lessons.length) { el('lessonText').innerText = '這個班級還沒有課文，請聯絡老師。'; return; }
      select.innerHTML = lessons.map(l => `<option value="${l.lessonId}">${escAttr(l.lessonLabel || l.lessonId)}</option>`).join('');
      select.onchange = switchLesson;
      switchLesson();
    } catch (e) {
      el('lessonText').innerText = '連線失敗，請確認 config.js 的 API_URL。';
    }
  })();

  function currentLesson() { return lessons.find(l => l.lessonId === select.value) || lessons[0]; }

  function switchLesson() {
    const l = currentLesson();
    el('lessonText').innerText = l.text || '';
    const t = el('teacherAudio');
    t.src = l.audioUrl || '';
    t.load();
    el('audioPlayer').classList.add('hidden');
    el('uploadBtn').classList.add('hidden');
    el('status').innerText = 'READY';
  }

  // ---- 錄音 ----
  let audioCtx, recorder, chunks = [], animationId, dest, analyser, tSource, recMime = 'audio/mp4';

  el('startBtn').onclick = async () => {
    if (!el('studentName').value.trim()) return alert('請先輸入名字 Enter Name!');
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

      tAudio.currentTime = 0;
      tAudio.play();
      recorder.start();
      recStartMs = Date.now();

      el('startBtn').disabled = true;
      el('stopBtn').disabled = false;
      el('status').innerText = 'RECORDING…';
    } catch (e) {
      alert('麥克風錯誤 Mic Error: ' + (e.message || e));
    }
  };

  el('stopBtn').onclick = () => {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    el('teacherAudio').pause();
    el('startBtn').disabled = false;
    el('stopBtn').disabled = true;
    el('status').innerText = 'DONE — 可試聽後送出';
  };

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
        studentName: el('studentName').value.trim(),
        mime: recMime,
        duration: Math.round((Date.now() - recStartMs) / 1000),
        audio: base64
      });
      if (r.ok) { el('status').innerText = '✅ 已送出給老師！'; alert('送出成功 Success!'); }
      else { throw new Error(r.error || 'fail'); }
    } catch (e) {
      el('status').innerText = '❌ 送出失敗，請再試一次';
      alert('送出失敗 Upload Fail: ' + (e.message || e));
    } finally {
      btn.disabled = false;
    }
  };

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

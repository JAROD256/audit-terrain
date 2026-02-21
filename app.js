/* ═══════════════════════════════════════════════
   OPTINOTE — Application principale
   ═══════════════════════════════════════════════ */

const App = (() => {
  // ─── State ───
  let db = null;
  let currentStream = null;
  let capturedImageData = null;
  let annotatedImageData = null;
  let selectedCategory = null;
  let currentTool = 'draw';
  let isDrawing = false;
  let drawHistory = [];
  let arrowStart = null;
  let currentTab = 'pending';
  let alarmFired = false;

  // ─── DOM refs (lazy) ───
  const $ = (id) => document.getElementById(id);

  // ═══════ INIT ═══════
  function init() {
    openDB().then(() => {
      updatePendingBadge();
      startClock();
      startAlarmCheck();
      registerSW();
      requestNotificationPermission();
    });
  }

  // ═══════ IndexedDB ═══════
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('OptiNoteDB', 1);
      req.onupgradeneeded = (e) => {
        const store = e.target.result;
        if (!store.objectStoreNames.contains('entries')) {
          const os = store.createObjectStore('entries', { keyPath: 'id' });
          os.createIndex('status', 'status', { unique: false });
          os.createIndex('type', 'type', { unique: false });
          os.createIndex('date', 'date', { unique: false });
        }
      };
      req.onsuccess = (e) => { db = e.target.result; resolve(); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function dbAdd(entry) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('entries', 'readwrite');
      tx.objectStore('entries').add(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  function dbGetAll() {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('entries', 'readonly');
      const req = tx.objectStore('entries').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function dbUpdate(entry) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('entries', 'readwrite');
      tx.objectStore('entries').put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  function dbDelete(id) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('entries', 'readwrite');
      tx.objectStore('entries').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // ═══════ NAVIGATION ═══════
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    $(id).classList.add('active');
    updateNavActive(id);
  }

  function updateNavActive(screenId) {
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
    if (screenId === 'screen-home') document.querySelectorAll('.nav-btn')[0]?.classList.add('active');
    if (screenId === 'screen-list') document.querySelectorAll('.nav-btn')[1]?.classList.add('active');
    if (screenId === 'screen-report') document.querySelectorAll('.nav-btn')[2]?.classList.add('active');
  }

  function goHome() {
    stopCamera();
    showScreen('screen-home');
    updatePendingBadge();
  }

  function showList() {
    showScreen('screen-list');
    renderList();
  }

  function showReport() {
    showScreen('screen-report');
    renderReport();
  }

  // ═══════ AUDIT FLOW ═══════
  async function startAudit() {
    showScreen('screen-capture');
    await startCamera();
  }

  async function startCamera() {
    try {
      const constraints = {
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      };
      currentStream = await navigator.mediaDevices.getUserMedia(constraints);
      $('camera-feed').srcObject = currentStream;
    } catch (err) {
      toast('Impossible d\'accéder à la caméra');
      goHome();
    }
  }

  function stopCamera() {
    if (currentStream) {
      currentStream.getTracks().forEach((t) => t.stop());
      currentStream = null;
    }
    const feed = $('camera-feed');
    if (feed) feed.srcObject = null;
  }

  function capturePhoto() {
    const video = $('camera-feed');
    const canvas = $('camera-canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    capturedImageData = canvas.toDataURL('image/jpeg', 0.85);
    stopCamera();
    openAnnotator();
  }

  // ═══════ ANNOTATION ═══════
  function openAnnotator() {
    showScreen('screen-annotate');
    const canvas = $('annotate-canvas');
    const img = new Image();
    img.onload = () => {
      const zone = document.querySelector('.annotate-zone');
      const maxW = zone.clientWidth;
      const maxH = zone.clientHeight;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      drawHistory = [ctx.getImageData(0, 0, canvas.width, canvas.height)];
      setupCanvasEvents(canvas);
    };
    img.src = capturedImageData;
    currentTool = 'draw';
    document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('tool-active'));
    document.querySelector('[data-tool="draw"]')?.classList.add('tool-active');
  }

  function setupCanvasEvents(canvas) {
    const ctx = canvas.getContext('2d');

    canvas.onpointerdown = null;
    canvas.onpointermove = null;
    canvas.onpointerup = null;

    canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
    canvas.addEventListener('pointermove', onPointerMove, { passive: false });
    canvas.addEventListener('pointerup', onPointerUp, { passive: false });
    canvas.addEventListener('pointercancel', onPointerUp, { passive: false });

    function getPos(e) {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function onPointerDown(e) {
      e.preventDefault();
      isDrawing = true;
      const p = getPos(e);
      const color = $('annotate-color').value;

      if (currentTool === 'draw') {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      } else if (currentTool === 'arrow') {
        arrowStart = p;
      } else if (currentTool === 'text') {
        isDrawing = false;
        const txt = prompt('Texte à ajouter :');
        if (txt) {
          ctx.font = 'bold 20px sans-serif';
          ctx.fillStyle = color;
          ctx.fillText(txt, p.x, p.y);
          saveDrawState(ctx, canvas);
        }
      }
    }

    function onPointerMove(e) {
      if (!isDrawing) return;
      e.preventDefault();
      const p = getPos(e);
      if (currentTool === 'draw') {
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }

    function onPointerUp(e) {
      if (!isDrawing) return;
      e.preventDefault();
      isDrawing = false;
      const p = getPos(e);

      if (currentTool === 'draw') {
        ctx.closePath();
      } else if (currentTool === 'arrow' && arrowStart) {
        drawArrow(ctx, arrowStart.x, arrowStart.y, p.x, p.y, $('annotate-color').value);
        arrowStart = null;
      }
      saveDrawState(ctx, canvas);
    }
  }

  function drawArrow(ctx, x1, y1, x2, y2, color) {
    const headLen = 18;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  function saveDrawState(ctx, canvas) {
    drawHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (drawHistory.length > 30) drawHistory.shift();
  }

  function undoAnnotation() {
    const canvas = $('annotate-canvas');
    const ctx = canvas.getContext('2d');
    if (drawHistory.length > 1) {
      drawHistory.pop();
      ctx.putImageData(drawHistory[drawHistory.length - 1], 0, 0);
    }
  }

  function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('tool-active'));
    document.querySelector(`[data-tool="${tool}"]`)?.classList.add('tool-active');
  }

  function finishAnnotation() {
    const canvas = $('annotate-canvas');
    annotatedImageData = canvas.toDataURL('image/jpeg', 0.85);
    showScreen('screen-audit-form');
    $('preview-thumb').innerHTML = `<img src="${annotatedImageData}" alt="Aperçu">`;
    $('audit-comment').value = '';
    selectedCategory = null;
    document.querySelectorAll('.cat-btn').forEach((b) => b.classList.remove('selected'));
  }

  function backToCapture() {
    startAudit();
  }

  function backToAnnotate() {
    openAnnotator();
  }

  function pickCategory(btn) {
    document.querySelectorAll('.cat-btn').forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedCategory = btn.dataset.cat;
  }

  // ═══════ SAVE AUDIT ═══════
  async function saveAudit() {
    const comment = $('audit-comment').value.trim();
    if (!comment) { toast('Ajoutez un commentaire'); return; }
    if (!selectedCategory) { toast('Choisissez une catégorie'); return; }

    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      type: 'audit',
      status: 'pending',
      date: new Date().toISOString(),
      comment,
      category: selectedCategory,
      image: annotatedImageData
    };

    await dbAdd(entry);
    toast('Audit enregistré ✓');
    capturedImageData = null;
    annotatedImageData = null;
    selectedCategory = null;
    goHome();
  }

  // ═══════ NOTE FLOW ═══════
  function startNote() {
    showScreen('screen-note');
    $('note-text').value = '';
    setTimeout(() => $('note-text').focus(), 200);
  }

  async function saveNote() {
    const text = $('note-text').value.trim();
    if (!text) { toast('Écrivez quelque chose'); return; }

    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      type: 'note',
      status: 'pending',
      date: new Date().toISOString(),
      comment: text,
      category: null,
      image: null
    };

    await dbAdd(entry);
    toast('Note enregistrée ✓');
    goHome();
  }

  // ═══════ LIST RENDERING ═══════
  function switchTab(tab) {
    currentTab = tab;
    $('tab-pending').classList.toggle('active', tab === 'pending');
    $('tab-validated').classList.toggle('active', tab === 'validated');
    renderList();
  }

  async function renderList() {
    const all = await dbGetAll();
    const filtered = all
      .filter((e) => currentTab === 'pending' ? e.status === 'pending' : e.status === 'validated')
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    const container = $('list-container');
    if (filtered.length === 0) {
      container.innerHTML = `<p class="empty-msg">${currentTab === 'pending' ? 'Aucun élément en attente.' : 'Aucun élément validé.'}</p>`;
      return;
    }

    container.innerHTML = filtered.map((e) => `
      <div class="list-item list-item--${e.status}">
        ${e.image ? `<img class="item-thumb" src="${e.image}" alt="">` : ''}
        <div class="item-body">
          <span class="item-type item-type--${e.type}">${e.type === 'audit' ? '📷 Audit' : '📝 Note'}</span>
          ${e.category ? `<div class="item-cat">${e.category}</div>` : ''}
          <div class="item-text">${escapeHtml(e.comment)}</div>
          <div class="item-time">${formatDate(e.date)}</div>
        </div>
        <div class="item-actions">
          ${e.status === 'pending' ? `
            <button class="validate-btn" onclick="App.validateEntry('${e.id}')">✓ Valider</button>
            <button class="delete-btn" onclick="App.deleteEntry('${e.id}')">Suppr.</button>
          ` : ''}
        </div>
      </div>
    `).join('');
  }

  async function validateEntry(id) {
    const all = await dbGetAll();
    const entry = all.find((e) => e.id === id);
    if (entry) {
      entry.status = 'validated';
      entry.validatedAt = new Date().toISOString();
      await dbUpdate(entry);
      toast('Élément validé ✓');
      renderList();
      updatePendingBadge();
    }
  }

  async function deleteEntry(id) {
    if (!confirm('Supprimer cet élément ?')) return;
    await dbDelete(id);
    toast('Supprimé');
    renderList();
    updatePendingBadge();
  }

  // ═══════ REPORT ═══════
  async function renderReport() {
    const all = await dbGetAll();
    const validated = all
      .filter((e) => e.status === 'validated')
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    const body = $('report-body');
    if (validated.length === 0) {
      body.innerHTML = '<p class="empty-msg">Aucun élément validé pour le moment.</p>';
      return;
    }

    body.innerHTML = `
      <div style="margin-bottom:16px;color:var(--text-dim);font-size:13px;">
        ${validated.length} élément(s) — Généré le ${formatDate(new Date().toISOString())}
      </div>
      ${validated.map((e, i) => `
        <div class="report-item">
          <h3>#${i + 1} — ${e.type === 'audit' ? '📷 Audit' : '📝 Note'}${e.category ? ' / ' + e.category : ''}</h3>
          <p>${escapeHtml(e.comment)}</p>
          <p style="font-size:12px">📅 ${formatDate(e.date)}${e.validatedAt ? ' — ✓ Validé le ' + formatDate(e.validatedAt) : ''}</p>
          ${e.image ? `<img src="${e.image}" alt="Photo audit">` : ''}
        </div>
      `).join('')}
    `;
  }

  async function exportJSON() {
    const all = await dbGetAll();
    const validated = all.filter((e) => e.status === 'validated');
    const clean = validated.map(({ id, type, category, comment, date, validatedAt }) => ({
      id, type, category, comment, date, validatedAt
    }));
    const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rapport-optinote-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('JSON exporté ✓');
  }

  function printReport() {
    renderReport().then(() => window.print());
  }

  // ═══════ ALARM (14h30) ═══════
  function startAlarmCheck() {
    checkAlarm();
    setInterval(checkAlarm, 30000);
  }

  async function checkAlarm() {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();

    if (h === 14 && m === 30 && !alarmFired) {
      alarmFired = true;
      const all = await dbGetAll();
      const pendingCount = all.filter((e) => e.status === 'pending').length;

      if (pendingCount > 0) {
        showAlarmModal(pendingCount);
        playAlarmSound();
        sendNotification(pendingCount);
      }

      setTimeout(() => { alarmFired = false; }, 120000);
    }

    if (!(h === 14 && m === 30)) {
      alarmFired = false;
    }
  }

  function showAlarmModal(count) {
    $('alarm-msg').textContent = `Vous avez ${count} note(s) non validée(s) à traiter.`;
    $('alarm-modal').style.display = 'flex';
  }

  function dismissAlarm() {
    $('alarm-modal').style.display = 'none';
  }

  function playAlarmSound() {
    try { $('alarm-sound')?.play(); } catch (_) { /* silencieux si bloqué */ }
  }

  function sendNotification(count) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Rappel OptiNote – 14h30', {
        body: `Vous avez ${count} note(s) non validée(s) à traiter.`,
        icon: 'icons/icon-192.png',
        vibrate: [200, 100, 200]
      });
    }
  }

  function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  // ═══════ BADGE & CLOCK ═══════
  async function updatePendingBadge() {
    const all = await dbGetAll();
    const count = all.filter((e) => e.status === 'pending').length;
    const banner = $('pending-banner');
    const badge = $('badge-count');
    $('pending-count').textContent = count;
    banner.style.display = count > 0 ? 'block' : 'none';
    badge.style.display = count > 0 ? 'flex' : 'none';
    badge.textContent = count;
  }

  function startClock() {
    const tick = () => {
      const now = new Date();
      $('clock').textContent = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    };
    tick();
    setInterval(tick, 10000);
  }

  // ═══════ SERVICE WORKER ═══════
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    }
  }

  // ═══════ HELPERS ═══════
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  // ═══════ SPLASH SCREEN ═══════
  function dismissSplash() {
    const splash = $('splash');
    if (splash) {
      splash.classList.add('hide');
      setTimeout(() => splash.remove(), 600);
    }
  }

  // ─── Boot ───
  document.addEventListener('DOMContentLoaded', init);

  // ─── Public API ───
  return {
    startAudit, startNote, goHome, showList, showReport,
    capturePhoto, backToCapture, backToAnnotate,
    finishAnnotation, undoAnnotation, setTool, pickCategory,
    saveAudit, saveNote,
    switchTab, validateEntry, deleteEntry,
    exportJSON, printReport,
    dismissAlarm, dismissSplash
  };
})();

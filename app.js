/* =========================================================
   Tensio — Vérnyomás napló (app.js)
   ========================================================= */

// ---------- IndexedDB Wrapper ----------
const DB_NAME = 'tensio';
const DB_VERSION = 1;
const STORE = 'readings';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        os.createIndex('ts', 'ts', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbAdd(reading) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    const r = tx.objectStore(STORE).add(reading);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function dbAll() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).getAll();
    r.onsuccess = () => res(r.result.sort((a,b)=>b.ts-a.ts));
    r.onerror = () => rej(r.error);
  });
}
async function dbDelete(id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    const r = tx.objectStore(STORE).delete(id);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}
async function dbClear() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    const r = tx.objectStore(STORE).clear();
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

// ---------- Settings (localStorage) ----------
const SETTINGS_KEY = 'tensio-settings';
const defaultSettings = {
  remindersOn: false,
  remindAM: '07:00',
  remindPM: '19:00'
};
function getSettings() {
  try { return { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return { ...defaultSettings }; }
}
function setSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

// ---------- BP Classification (ESH 2023) ----------
// Koncentrálva otthoni mérésre. Az otthoni küszöb ≥135/85 = magas.
// A kategória a kettő közül a rosszabbikat veszi (szis vagy dia).
function classify(sys, dia) {
  if (sys < 90 || dia < 60) return {
    key: 'low', label: 'Alacsony vérnyomás',
    desc: 'A 90/60 alatti érték hipotenziónak számít. Ha szédülést, gyengeséget tapasztalsz, érdemes orvoshoz fordulni.'
  };
  const sCat = sys < 120 ? 0 : sys < 130 ? 1 : sys < 140 ? 2 : sys < 160 ? 3 : sys < 180 ? 4 : 5;
  const dCat = dia < 80 ? 0 : dia < 85 ? 1 : dia < 90 ? 2 : dia < 100 ? 3 : dia < 110 ? 4 : 5;
  const cat = Math.max(sCat, dCat);
  switch(cat) {
    case 0: return { key:'ok', label:'Optimális', desc:'A vérnyomás az ideális tartományban van. Tartsd meg az egészséges életmódot.' };
    case 1: return { key:'ok', label:'Normális', desc:'A vérnyomás egészséges tartományban. Rendszeres mozgás, kiegyensúlyozott étrend javasolt.' };
    case 2: return { key:'warn', label:'Emelkedett (magas-normál)', desc:'Az érték a magas-normál tartományba esik. Érdemes rendszeresen mérni és életmódbeli tényezőket (só, stressz, mozgás) figyelni.' };
    case 3: return { key:'bad', label:'I. fokú hipertónia', desc:'Enyhén magas vérnyomás. Ha több mérésen is ismétlődik, beszélj az orvosoddal.' };
    case 4: return { key:'bad', label:'II. fokú hipertónia', desc:'Középsúlyos magas vérnyomás. Orvosi konzultáció ajánlott.' };
    case 5: return { key:'crit', label:'III. fokú hipertónia', desc:'Súlyos magas vérnyomás. Mérd meg újra 5 perc pihenés után, és keresd fel az orvosodat. Mellkasi fájdalom, látászavar vagy erős fejfájás esetén azonnali ellátás szükséges.' };
  }
}

// ---------- Helpers ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function mean(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }
function round(n) { return Math.round(n); }

function fmtDateHu(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('hu-HU', { year:'numeric', month:'2-digit', day:'2-digit' });
}
function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('hu-HU', { hour:'2-digit', minute:'2-digit' });
}
function fmtDateTimeShort(ts) {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const yest = new Date(today); yest.setDate(yest.getDate()-1);
  const isYest = d.toDateString() === yest.toDateString();
  if (sameDay) return `Ma · ${fmtTime(ts)}`;
  if (isYest) return `Tegnap · ${fmtTime(ts)}`;
  return `${fmtDateHu(ts)} · ${fmtTime(ts)}`;
}
function fmtCsvDateTime(ts) {
  const d = new Date(ts);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  return `${year}.${month}.${day}. ${hour}:${minute}`;
}

function withinDays(ts, days) {
  return ts >= Date.now() - days * 86400000;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- Navigation ----------
function go(view) {
  $$('.view').forEach(v => v.classList.toggle('active', v.dataset.view === view));
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.goto === view));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (view === 'add') initAddForm();
  if (view === 'history') renderHistory();
  if (view === 'dashboard') renderDashboard();
}
$$('.tab').forEach(t => t.addEventListener('click', () => go(t.dataset.goto)));

// ---------- Add form ----------
function initAddForm() {
  const now = new Date();
  now.setSeconds(0,0);
  const tz = now.getTimezoneOffset()*60000;
  $('#ts').value = new Date(now - tz).toISOString().slice(0,16);
  $('#addTimestamp').textContent = `Mostani időpont: ${fmtDateTimeShort(now.getTime())}`;
  $('#sys').value = ''; $('#dia').value = ''; $('#pulse').value = '';
  setTimeout(() => $('#sys').focus(), 200);
}

$('#addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const sys = parseInt($('#sys').value, 10);
  const dia = parseInt($('#dia').value, 10);
  const pulse = parseInt($('#pulse').value, 10);
  const ts = new Date($('#ts').value).getTime();
  if (!sys || !dia || !pulse || isNaN(ts)) { toast('Hiányzó vagy érvénytelen adat'); return; }
  if (sys <= dia) { toast('A szisztolés értéknek nagyobbnak kell lennie a diasztolésnál'); return; }
  await dbAdd({ sys, dia, pulse, ts });
  toast('Mérés elmentve');
  go('dashboard');
});

$('#cancelAdd').addEventListener('click', () => go('dashboard'));

// ---------- History ----------
async function renderHistory() {
  const list = await dbAll();
  const el = $('#historyList');
  $('#historyCount').textContent = `${list.length} bejegyzés`;
  if (!list.length) {
    el.innerHTML = `<div class="history-empty">Még nincs rögzített mérés.</div>`;
    return;
  }
  el.innerHTML = list.map(r => {
    const c = classify(r.sys, r.dia);
    return `
      <div class="history-item" data-id="${r.id}">
        <div class="history-marker ${c.key}"></div>
        <div class="history-date">
          <div class="history-date-main">${fmtDateTimeShort(r.ts)}</div>
          <div>${c.label}</div>
        </div>
        <div>
          <div class="history-vals">${r.sys}<span class="slash">/</span>${r.dia}</div>
          <div class="history-pulse">♥ ${r.pulse}</div>
        </div>
        <button class="history-del" data-del="${r.id}" aria-label="Törlés">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7 H20 M10 11 V17 M14 11 V17 M6 7 L7 20 H17 L18 7 M9 7 V4 H15 V7"/></svg>
        </button>
      </div>`;
  }).join('');
  $$('[data-del]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = parseInt(e.currentTarget.dataset.del, 10);
      if (!confirm('Biztosan törlöd ezt a mérést?')) return;
      await dbDelete(id);
      toast('Mérés törölve');
      renderHistory();
    });
  });
}

// ---------- Dashboard ----------
let trendChart = null;
let amPmChart = null;

async function renderDashboard() {
  const all = await dbAll();

  // Today
  const today0 = new Date(); today0.setHours(0,0,0,0);
  const today = all.filter(r => r.ts >= today0.getTime());
  if (today.length) {
    const sys = round(mean(today.map(r=>r.sys)));
    const dia = round(mean(today.map(r=>r.dia)));
    $('#todayAvg').textContent = `${sys}/${dia}`;
    $('#todaySub').textContent = `${today.length} mérés ma · átlag pulzus ${round(mean(today.map(r=>r.pulse)))}/perc`;
  } else {
    $('#todayAvg').textContent = '—';
    $('#todaySub').textContent = 'Még nincs mérés ma. Vegyél fel egyet.';
  }

  // Category (based on 7-day avg, or latest if few data)
  const last7 = all.filter(r => withinDays(r.ts, 7));
  const catSource = last7.length >= 3 ? last7 : all.slice(0, 3);
  if (catSource.length) {
    const sys = round(mean(catSource.map(r=>r.sys)));
    const dia = round(mean(catSource.map(r=>r.dia)));
    const c = classify(sys, dia);
    $('#catBar').className = `cat-bar ${c.key}`;
    $('#catLabel').textContent = c.label;
    $('#catDesc').textContent = c.desc;
  } else {
    $('#catBar').className = 'cat-bar';
    $('#catLabel').textContent = 'Nincs elég adat';
    $('#catDesc').textContent = 'Vegyél fel legalább néhány mérést az értékeléshez.';
  }

  // Averages
  const last30 = all.filter(r => withinDays(r.ts, 30));
  if (last7.length) {
    $('#avg7').textContent = `${round(mean(last7.map(r=>r.sys)))}/${round(mean(last7.map(r=>r.dia)))}`;
    $('#avg7n').textContent = `${last7.length} mérés`;
  } else { $('#avg7').textContent = '—'; $('#avg7n').textContent = '0 mérés'; }
  if (last30.length) {
    $('#avg30').textContent = `${round(mean(last30.map(r=>r.sys)))}/${round(mean(last30.map(r=>r.dia)))}`;
    $('#avg30n').textContent = `${last30.length} mérés`;
  } else { $('#avg30').textContent = '—'; $('#avg30n').textContent = '0 mérés'; }

  // Pulse pressure & MAP
  if (last7.length) {
    const pp = round(mean(last7.map(r => r.sys - r.dia)));
    const map = round(mean(last7.map(r => r.dia + (r.sys - r.dia)/3)));
    $('#ppAvg').textContent = `${pp}`;
    $('#mapAvg').textContent = `${map}`;
  } else {
    $('#ppAvg').textContent = '—';
    $('#mapAvg').textContent = '—';
  }

  // Trend chart
  const activeChip = $('#rangeTabs .chip.active');
  const days = parseInt(activeChip?.dataset.range || '30', 10);
  drawTrendChart(all, days);

  // AM/PM
  drawAmPmChart(all);
}

function drawTrendChart(all, days) {
  const data = all.filter(r => withinDays(r.ts, days)).sort((a,b)=>a.ts-b.ts);
  const ctx = $('#trendChart').getContext('2d');
  if (trendChart) trendChart.destroy();

  const labels = data.map(r => new Date(r.ts));
  const sysData = data.map(r => r.sys);
  const diaData = data.map(r => r.dia);

  // Range bands (reference zones)
  const annotations = [];

  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Szisztolés',
          data: sysData,
          borderColor: '#0b1220',
          backgroundColor: 'rgba(11,18,32,0.06)',
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#0b1220',
          pointHoverRadius: 5,
        },
        {
          label: 'Diasztolés',
          data: diaData,
          borderColor: '#c8432a',
          backgroundColor: 'rgba(200,67,42,0.06)',
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#c8432a',
          pointHoverRadius: 5,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { family: 'Inter Tight', size: 11, weight: '600' },
            color: '#5c6479',
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 14,
          }
        },
        tooltip: {
          backgroundColor: '#0b1220',
          titleFont: { family: 'Inter Tight', weight: '600' },
          bodyFont: { family: 'JetBrains Mono', size: 12 },
          padding: 10,
          cornerRadius: 6,
          displayColors: true,
          callbacks: {
            title: (items) => {
              const ts = items[0].parsed.x;
              return new Date(ts).toLocaleString('hu-HU', {
                year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'
              });
            },
            label: (item) => `  ${item.dataset.label}: ${item.parsed.y} Hgmm`
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: days <= 7 ? 'day' : days <= 30 ? 'day' : 'week',
            displayFormats: { day: 'MMM d', week: 'MMM d' }
          },
          grid: { color: 'rgba(11,18,32,0.04)' },
          ticks: {
            font: { family: 'JetBrains Mono', size: 10 },
            color: '#8892a6',
            maxRotation: 0,
            autoSkipPadding: 20
          }
        },
        y: {
          beginAtZero: false,
          grid: { color: 'rgba(11,18,32,0.05)' },
          ticks: {
            font: { family: 'JetBrains Mono', size: 10 },
            color: '#8892a6',
          }
        }
      }
    }
  });

  // If no data
  if (!data.length) {
    const canvas = $('#trendChart');
    const c = canvas.getContext('2d');
    c.save();
    c.fillStyle = '#8892a6';
    c.font = 'italic 14px Fraunces, serif';
    c.textAlign = 'center';
    c.fillText('Nincs adat ebben az időszakban', canvas.width/2/window.devicePixelRatio, canvas.height/2/window.devicePixelRatio);
    c.restore();
  }
}

function drawAmPmChart(all) {
  const last7 = all.filter(r => withinDays(r.ts, 7));
  const morning = last7.filter(r => {
    const h = new Date(r.ts).getHours();
    return h >= 4 && h < 12;
  });
  const evening = last7.filter(r => {
    const h = new Date(r.ts).getHours();
    return h >= 17 && h < 24;
  });

  const amSys = morning.length ? round(mean(morning.map(r=>r.sys))) : 0;
  const amDia = morning.length ? round(mean(morning.map(r=>r.dia))) : 0;
  const pmSys = evening.length ? round(mean(evening.map(r=>r.sys))) : 0;
  const pmDia = evening.length ? round(mean(evening.map(r=>r.dia))) : 0;

  const ctx = $('#amPmChart').getContext('2d');
  if (amPmChart) amPmChart.destroy();

  amPmChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Szisztolés', 'Diasztolés'],
      datasets: [
        {
          label: `Reggel (${morning.length})`,
          data: [amSys, amDia],
          backgroundColor: '#0b1220',
          borderRadius: 4,
          barThickness: 28,
        },
        {
          label: `Este (${evening.length})`,
          data: [pmSys, pmDia],
          backgroundColor: '#c8432a',
          borderRadius: 4,
          barThickness: 28,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { family: 'Inter Tight', size: 11, weight: '600' },
            color: '#5c6479',
            usePointStyle: true,
            pointStyle: 'rect',
            padding: 14,
          }
        },
        tooltip: {
          backgroundColor: '#0b1220',
          titleFont: { family: 'Inter Tight', weight: '600' },
          bodyFont: { family: 'JetBrains Mono', size: 12 },
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label: (item) => `  ${item.dataset.label}: ${item.parsed.y} Hgmm`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Inter Tight', size: 12, weight: '500' }, color: '#5c6479' }
        },
        y: {
          beginAtZero: false,
          grid: { color: 'rgba(11,18,32,0.05)' },
          ticks: { font: { family: 'JetBrains Mono', size: 10 }, color: '#8892a6' }
        }
      }
    }
  });

  // Note: morning surge?
  const note = $('#ampmNote');
  if (morning.length >= 2 && evening.length >= 2) {
    const diff = amSys - pmSys;
    if (diff >= 15) {
      note.textContent = `A reggeli szisztolés átlag ${diff} Hgmm-rel magasabb, mint az esti. Jelentős reggeli emelkedés („morning surge") figyelhető meg — érdemes az orvosoddal megbeszélni.`;
      note.classList.add('show');
    } else if (diff <= -15) {
      note.textContent = `Az esti átlag ${Math.abs(diff)} Hgmm-rel magasabb, mint a reggeli. Ez kevésbé jellemző mintázat — ha tartós, érdemes megbeszélni orvossal.`;
      note.classList.add('show');
    } else {
      note.textContent = `A reggeli és esti átlagok különbsége ${Math.abs(diff)} Hgmm — jellemző, egészséges napi ritmus.`;
      note.classList.add('show');
    }
  } else {
    note.classList.remove('show');
  }
}

// Range tab buttons
$('#rangeTabs').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  $$('#rangeTabs .chip').forEach(c => c.classList.toggle('active', c === chip));
  renderDashboard();
});

// ---------- Settings Modal ----------
const settingsModal = $('#settingsModal');
$('#settingsBtn').addEventListener('click', openSettings);
$$('[data-close-modal]').forEach(el => el.addEventListener('click', closeSettings));

function openSettings() {
  const s = getSettings();
  $('#remindersOn').checked = s.remindersOn;
  $('#remindAM').value = s.remindAM;
  $('#remindPM').value = s.remindPM;
  updateNotifStatus();
  settingsModal.classList.add('open');
}
function closeSettings() { settingsModal.classList.remove('open'); }

$('#remindersOn').addEventListener('change', async (e) => {
  const s = getSettings();
  s.remindersOn = e.target.checked;
  if (s.remindersOn) {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        s.remindersOn = false;
        e.target.checked = false;
        toast('Értesítési engedély szükséges');
      }
    } else {
      toast('Ez a böngésző nem támogat értesítéseket');
      s.remindersOn = false;
      e.target.checked = false;
    }
  }
  setSettings(s);
  scheduleReminders();
  updateNotifStatus();
});
$('#remindAM').addEventListener('change', (e) => {
  const s = getSettings(); s.remindAM = e.target.value; setSettings(s); scheduleReminders();
});
$('#remindPM').addEventListener('change', (e) => {
  const s = getSettings(); s.remindPM = e.target.value; setSettings(s); scheduleReminders();
});
$('#testNotif').addEventListener('click', async () => {
  if (!('Notification' in window)) { toast('Nem támogatott'); return; }
  if (Notification.permission !== 'granted') {
    const p = await Notification.requestPermission();
    if (p !== 'granted') { toast('Engedély megtagadva'); return; }
  }
  new Notification('Tensio', {
    body: 'Ideje megmérni a vérnyomásodat ✓',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: 'test'
  });
});

function updateNotifStatus() {
  const el = $('#notifStatus');
  if (!('Notification' in window)) { el.textContent = 'A böngésző nem támogat értesítéseket.'; return; }
  const p = Notification.permission;
  if (p === 'granted') el.textContent = 'Értesítések engedélyezve. A reggeli és esti időpontokban jelzést kapsz.';
  else if (p === 'denied') el.textContent = 'Értesítések letiltva a böngészőben. Engedélyezd a böngésző beállításaiban.';
  else el.textContent = 'Az engedély kéréséhez kapcsold be a fenti kapcsolót.';
}

// ---------- Export ----------
$('#exportJson').addEventListener('click', async () => {
  const data = await dbAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  download(blob, `tensio-export-${todayStr()}.json`);
});

$('#exportCsv').addEventListener('click', async () => {
  const data = await dbAll();
  // Excel Android gyakran dátumként kezeli az első oszlopot,
  // és ha nem fér ki, ########-et ír. Ezért az időpontot
  // szövegként adjuk át Excelnek: ="2026.05.09. 10:47".
  let csv = '\uFEFFidopont;szisztoles;diasztoles;pulzus\n';
  for (const r of data) {
    const d = fmtCsvDateTime(r.ts);
    csv += `="${d}";${r.sys};${r.dia};${r.pulse}\n`;
  }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  download(blob, `tensio-export-${todayStr()}.csv`);
});

$('#exportPdf').addEventListener('click', exportPdf);

async function exportPdf() {
  if (!window.pdfMake) {
    toast('A PDF export könyvtár nem töltődött be. Ellenőrizd az internetkapcsolatot.');
    return;
  }

  const data = (await dbAll()).sort((a, b) => a.ts - b.ts);
  if (!data.length) {
    toast('Nincs exportálható mérés');
    return;
  }

  toast('PDF készítése...');
  try {
    const stats = buildPdfStats(data);
    const [trendImg, dailyAvgImg, amPmImg] = await Promise.all([
      createTrendChartImage(data),
      createDailyAverageChartImage(data),
      createAmPmChartImage(data),
    ]);

    const docDefinition = buildPdfDocument(data, stats, { trendImg, dailyAvgImg, amPmImg });
    pdfMake.createPdf(docDefinition).download(`tensio-jelentes-${todayStr()}.pdf`);
    toast('PDF export elindult');
  } catch (err) {
    console.error('PDF export failed', err);
    toast('PDF export sikertelen');
  }
}

function buildPdfStats(data) {
  const sorted = [...data].sort((a, b) => a.ts - b.ts);
  const ranges = [
    { label: 'Összes mérés', readings: sorted },
    { label: 'Utolsó 7 nap', readings: sorted.filter(r => withinDays(r.ts, 7)) },
    { label: 'Utolsó 30 nap', readings: sorted.filter(r => withinDays(r.ts, 30)) },
    { label: 'Utolsó 90 nap', readings: sorted.filter(r => withinDays(r.ts, 90)) },
  ];

  const allAvg = summarizeReadings(sorted);
  const latest = sorted[sorted.length - 1];
  return {
    firstTs: sorted[0].ts,
    lastTs: latest.ts,
    latest,
    allAvg,
    category: allAvg ? classify(allAvg.sys, allAvg.dia) : null,
    summaryRows: ranges.map(r => ({ label: r.label, ...summarizeReadings(r.readings) })),
    amPmRows: buildAmPmRows(sorted),
  };
}

function summarizeReadings(readings) {
  if (!readings.length) {
    return { count: 0, sys: null, dia: null, pulse: null, pp: null, map: null, minSys: null, maxSys: null, minDia: null, maxDia: null };
  }
  return {
    count: readings.length,
    sys: round(mean(readings.map(r => r.sys))),
    dia: round(mean(readings.map(r => r.dia))),
    pulse: round(mean(readings.map(r => r.pulse))),
    pp: round(mean(readings.map(r => r.sys - r.dia))),
    map: round(mean(readings.map(r => r.dia + (r.sys - r.dia) / 3))),
    minSys: Math.min(...readings.map(r => r.sys)),
    maxSys: Math.max(...readings.map(r => r.sys)),
    minDia: Math.min(...readings.map(r => r.dia)),
    maxDia: Math.max(...readings.map(r => r.dia)),
  };
}

function buildAmPmRows(readings) {
  const groups = [
    { label: 'Reggel (04:00-11:59)', readings: readings.filter(r => { const h = new Date(r.ts).getHours(); return h >= 4 && h < 12; }) },
    { label: 'Napközben (12:00-16:59)', readings: readings.filter(r => { const h = new Date(r.ts).getHours(); return h >= 12 && h < 17; }) },
    { label: 'Este (17:00-23:59)', readings: readings.filter(r => { const h = new Date(r.ts).getHours(); return h >= 17 && h < 24; }) },
    { label: 'Éjszaka (00:00-03:59)', readings: readings.filter(r => { const h = new Date(r.ts).getHours(); return h >= 0 && h < 4; }) },
  ];
  return groups.map(g => ({ label: g.label, ...summarizeReadings(g.readings) }));
}

function dash(v, suffix = '') {
  return v === null || v === undefined || Number.isNaN(v) ? '—' : `${v}${suffix}`;
}

function fmtPdfDateTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString('hu-HU', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
}

function fmtPdfPeriod(firstTs, lastTs) {
  return `${fmtDateHu(firstTs)} - ${fmtDateHu(lastTs)}`;
}

function buildPdfDocument(data, stats, images) {
  const generatedAt = new Date().toLocaleString('hu-HU', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
  const latestClass = classify(stats.latest.sys, stats.latest.dia);
  const avgText = stats.allAvg
    ? `${stats.allAvg.sys}/${stats.allAvg.dia} Hgmm, átlag pulzus ${stats.allAvg.pulse}/perc, pulzusnyomás ${stats.allAvg.pp} Hgmm, MAP ${stats.allAvg.map} Hgmm.`
    : 'Nincs elég adat.';

  return {
    pageSize: 'A4',
    pageMargins: [34, 44, 34, 44],
    info: {
      title: 'Tensio vérnyomás jelentés',
      author: 'Tensio',
      subject: 'Vérnyomás mérések, átlagok és grafikonok',
    },
    defaultStyle: { font: 'Roboto', fontSize: 9, color: '#0b1220' },
    footer: (currentPage, pageCount) => ({
      text: `Tensio vérnyomás jelentés · ${currentPage}/${pageCount}`,
      alignment: 'center',
      fontSize: 8,
      color: '#8892a6',
      margin: [0, 10, 0, 0]
    }),
    styles: {
      h1: { fontSize: 22, bold: true, margin: [0, 0, 0, 4] },
      h2: { fontSize: 14, bold: true, margin: [0, 18, 0, 8] },
      h3: { fontSize: 11, bold: true, margin: [0, 10, 0, 5] },
      meta: { fontSize: 9, color: '#5c6479' },
      muted: { fontSize: 8, color: '#5c6479' },
      tableHeader: { bold: true, fillColor: '#f1f3f6', color: '#0b1220' },
      smallTable: { fontSize: 8 },
    },
    content: [
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'Tensio vérnyomás jelentés', style: 'h1' },
              { text: `Készült: ${generatedAt}` , style: 'meta' },
              { text: `Időszak: ${fmtPdfPeriod(stats.firstTs, stats.lastTs)} · ${data.length} mérés`, style: 'meta' },
            ]
          },
          {
            width: 170,
            text: 'Tájékoztató jellegű napló. Nem helyettesíti az orvosi vizsgálatot vagy diagnózist.',
            alignment: 'right',
            style: 'muted'
          }
        ]
      },
      { canvas: [{ type: 'line', x1: 0, y1: 12, x2: 527, y2: 12, lineWidth: 0.7, lineColor: '#e3e7ee' }], margin: [0, 0, 0, 12] },

      { text: 'Összefoglaló', style: 'h2' },
      {
        table: {
          headerRows: 1,
          widths: ['*', 42, 52, 52, 45, 55, 42],
          body: [
            [
              { text: 'Időszak', style: 'tableHeader' },
              { text: 'Mérés', style: 'tableHeader' },
              { text: 'Sziszt.', style: 'tableHeader' },
              { text: 'Diaszt.', style: 'tableHeader' },
              { text: 'Pulzus', style: 'tableHeader' },
              { text: 'Pulzusny.', style: 'tableHeader' },
              { text: 'MAP', style: 'tableHeader' },
            ],
            ...stats.summaryRows.map(row => [
              row.label,
              String(row.count),
              dash(row.sys, ' Hgmm'),
              dash(row.dia, ' Hgmm'),
              dash(row.pulse, '/perc'),
              dash(row.pp, ' Hgmm'),
              dash(row.map, ' Hgmm'),
            ])
          ]
        },
        layout: 'lightHorizontalLines'
      },
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'Teljes időszak átlaga', style: 'h3' },
              { text: avgText },
              { text: `Átlag alapján: ${stats.category.label}. ${stats.category.desc}`, margin: [0, 4, 0, 0] },
            ]
          },
          {
            width: 185,
            stack: [
              { text: 'Legutóbbi mérés', style: 'h3' },
              { text: `${stats.latest.sys}/${stats.latest.dia} Hgmm · pulzus ${stats.latest.pulse}/perc` },
              { text: `${fmtPdfDateTime(stats.latest.ts)} · ${latestClass.label}`, style: 'muted', margin: [0, 4, 0, 0] },
            ]
          }
        ],
        columnGap: 18,
        margin: [0, 8, 0, 0]
      },

      { text: 'Napszak szerinti átlagok', style: 'h2' },
      {
        table: {
          headerRows: 1,
          widths: ['*', 42, 55, 55, 45, 55, 42],
          body: [
            [
              { text: 'Napszak', style: 'tableHeader' },
              { text: 'Mérés', style: 'tableHeader' },
              { text: 'Sziszt.', style: 'tableHeader' },
              { text: 'Diaszt.', style: 'tableHeader' },
              { text: 'Pulzus', style: 'tableHeader' },
              { text: 'Pulzusny.', style: 'tableHeader' },
              { text: 'MAP', style: 'tableHeader' },
            ],
            ...stats.amPmRows.map(row => [
              row.label,
              String(row.count),
              dash(row.sys, ' Hgmm'),
              dash(row.dia, ' Hgmm'),
              dash(row.pulse, '/perc'),
              dash(row.pp, ' Hgmm'),
              dash(row.map, ' Hgmm'),
            ])
          ]
        },
        layout: 'lightHorizontalLines'
      },

      { text: 'Grafikonok', style: 'h2' },
      { text: 'Szisztolés és diasztolés trend - összes mérés', style: 'h3' },
      { image: images.trendImg, width: 520, margin: [0, 0, 0, 8] },
      { text: 'Napi átlagok - származtatott értékek', style: 'h3' },
      { image: images.dailyAvgImg, width: 520, margin: [0, 0, 0, 8] },
      { text: 'Napszak szerinti átlag - összes mérés', style: 'h3' },
      { image: images.amPmImg, width: 440, alignment: 'center', margin: [0, 0, 0, 6] },

      { text: 'Összes mérés', style: 'h2', pageBreak: 'before' },
      {
        table: {
          headerRows: 1,
          widths: [90, 48, 48, 42, 38, 38, '*'],
          body: [
            [
              { text: 'Dátum / idő', style: 'tableHeader' },
              { text: 'Sziszt.', style: 'tableHeader' },
              { text: 'Diaszt.', style: 'tableHeader' },
              { text: 'Pulzus', style: 'tableHeader' },
              { text: 'PP', style: 'tableHeader' },
              { text: 'MAP', style: 'tableHeader' },
              { text: 'Kategória', style: 'tableHeader' },
            ],
            ...[...data].sort((a, b) => b.ts - a.ts).map(r => {
              const pp = r.sys - r.dia;
              const map = round(r.dia + pp / 3);
              const c = classify(r.sys, r.dia);
              return [
                fmtPdfDateTime(r.ts),
                `${r.sys} Hgmm`,
                `${r.dia} Hgmm`,
                `${r.pulse}/perc`,
                String(pp),
                String(map),
                c.label,
              ];
            })
          ]
        },
        layout: 'lightHorizontalLines',
        style: 'smallTable'
      }
    ]
  };
}

function groupDailyAverages(readings) {
  const groups = new Map();
  for (const r of readings) {
    const d = new Date(r.ts);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  return [...groups.entries()].map(([key, rows]) => ({
    key,
    label: fmtDateHu(rows[0].ts),
    count: rows.length,
    sys: round(mean(rows.map(r => r.sys))),
    dia: round(mean(rows.map(r => r.dia))),
    pulse: round(mean(rows.map(r => r.pulse))),
  })).sort((a, b) => a.key.localeCompare(b.key));
}

async function renderChartImage(config, width = 980, height = 460) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const chart = new Chart(canvas.getContext('2d'), config);
  await new Promise(resolve => requestAnimationFrame(resolve));
  const image = canvas.toDataURL('image/png', 1.0);
  chart.destroy();
  return image;
}

function basePdfChartOptions(title = '') {
  return {
    responsive: false,
    animation: false,
    plugins: {
      title: { display: !!title, text: title, font: { size: 16, weight: 'bold' }, color: '#0b1220', padding: { bottom: 14 } },
      legend: { position: 'bottom', labels: { color: '#5c6479', boxWidth: 12, padding: 14 } },
    },
    scales: {
      x: { grid: { color: 'rgba(11,18,32,0.04)' }, ticks: { color: '#5c6479', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
      y: { beginAtZero: false, grid: { color: 'rgba(11,18,32,0.08)' }, ticks: { color: '#5c6479' } }
    }
  };
}

function createTrendChartImage(readings) {
  const rows = [...readings].sort((a, b) => a.ts - b.ts);
  return renderChartImage({
    type: 'line',
    data: {
      labels: rows.map(r => fmtDateHu(r.ts)),
      datasets: [
        {
          label: 'Szisztolés',
          data: rows.map(r => r.sys),
          borderColor: '#0b1220',
          backgroundColor: 'rgba(11,18,32,0.06)',
          borderWidth: 2,
          pointRadius: rows.length > 80 ? 0 : 2,
          tension: 0.25,
        },
        {
          label: 'Diasztolés',
          data: rows.map(r => r.dia),
          borderColor: '#c8432a',
          backgroundColor: 'rgba(200,67,42,0.06)',
          borderWidth: 2,
          pointRadius: rows.length > 80 ? 0 : 2,
          tension: 0.25,
        }
      ]
    },
    options: basePdfChartOptions('Trend - összes mérés')
  });
}

function createDailyAverageChartImage(readings) {
  const days = groupDailyAverages(readings);
  return renderChartImage({
    type: 'line',
    data: {
      labels: days.map(d => d.label),
      datasets: [
        {
          label: 'Napi szisztolés átlag',
          data: days.map(d => d.sys),
          borderColor: '#0b1220',
          backgroundColor: 'rgba(11,18,32,0.06)',
          borderWidth: 2,
          pointRadius: days.length > 80 ? 0 : 2,
          tension: 0.25,
        },
        {
          label: 'Napi diasztolés átlag',
          data: days.map(d => d.dia),
          borderColor: '#c8432a',
          backgroundColor: 'rgba(200,67,42,0.06)',
          borderWidth: 2,
          pointRadius: days.length > 80 ? 0 : 2,
          tension: 0.25,
        },
        {
          label: 'Napi pulzus átlag',
          data: days.map(d => d.pulse),
          borderColor: '#5c6479',
          backgroundColor: 'rgba(92,100,121,0.06)',
          borderWidth: 1.8,
          pointRadius: days.length > 80 ? 0 : 2,
          tension: 0.25,
        }
      ]
    },
    options: basePdfChartOptions('Napi átlagok')
  });
}

function createAmPmChartImage(readings) {
  const rows = buildAmPmRows(readings);
  return renderChartImage({
    type: 'bar',
    data: {
      labels: rows.map(r => r.label.replace(/ \(.+\)/, '')),
      datasets: [
        {
          label: 'Szisztolés átlag',
          data: rows.map(r => r.sys || 0),
          backgroundColor: '#0b1220',
          borderRadius: 4,
        },
        {
          label: 'Diasztolés átlag',
          data: rows.map(r => r.dia || 0),
          backgroundColor: '#c8432a',
          borderRadius: 4,
        }
      ]
    },
    options: {
      ...basePdfChartOptions('Napszak szerinti átlagok'),
      scales: {
        x: { grid: { display: false }, ticks: { color: '#5c6479' } },
        y: { beginAtZero: true, grid: { color: 'rgba(11,18,32,0.08)' }, ticks: { color: '#5c6479' } }
      }
    }
  }, 880, 420);
}
$('#clearAll').addEventListener('click', async () => {
  if (!confirm('Biztosan törlöd az ÖSSZES bejegyzést? Ez nem visszavonható.')) return;
  await dbClear();
  toast('Minden adat törölve');
  closeSettings();
  renderDashboard();
});
function download(blob, filename) {
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}

// ---------- Reminders (setTimeout-based, while app is open + SW fallback) ----------
let reminderTimers = [];
function clearReminders() {
  reminderTimers.forEach(t => clearTimeout(t));
  reminderTimers = [];
}
function scheduleReminders() {
  clearReminders();
  const s = getSettings();
  if (!s.remindersOn) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  [s.remindAM, s.remindPM].forEach((time, idx) => {
    const [h, m] = time.split(':').map(Number);
    const now = new Date();
    const target = new Date();
    target.setHours(h, m, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    const ms = target - now;
    const label = idx === 0 ? 'reggeli' : 'esti';
    const t = setTimeout(() => {
      showReminder(label);
      scheduleReminders();
    }, ms);
    reminderTimers.push(t);
  });
}
async function showReminder(label) {
  const today0 = new Date(); today0.setHours(0,0,0,0);
  const all = await dbAll();
  const todayReadings = all.filter(r => r.ts >= today0.getTime());
  const h = new Date().getHours();
  const isMorningSlot = label === 'reggeli';
  const already = todayReadings.some(r => {
    const rh = new Date(r.ts).getHours();
    return isMorningSlot ? (rh >= 4 && rh < 12) : (rh >= 17 && rh < 24);
  });
  if (already) return; // Ne zavarjuk, ha már mért ma abban a sávban

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    const reg = await navigator.serviceWorker.ready;
    reg.showNotification('Tensio', {
      body: `Ideje a ${label} vérnyomás mérésnek`,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: 'bp-reminder',
      requireInteraction: false,
    });
  } else {
    new Notification('Tensio', { body: `Ideje a ${label} vérnyomás mérésnek`, icon:'icon-192.png' });
  }
}

// ---------- Service Worker + Update handling ----------
const CURRENT_VERSION = '1.0.3'; // az app jelenlegi verziója (a release script írja át)
let pendingWorker = null;
let pendingVersionInfo = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');

      // Ha már most vár egy új SW (pl. újranyitáskor)
      if (reg.waiting) {
        pendingWorker = reg.waiting;
        await checkAndShowUpdate();
      }

      // Ha új SW telepítődik
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', async () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            // Régi SW aktív → van új, ami vár
            pendingWorker = nw;
            await checkAndShowUpdate();
          }
        });
      });

      // Amikor a controller változik, reload
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });

      // 60 percenként ellenőrzés + visibility váltáskor
      setInterval(() => reg.update().catch(()=>{}), 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) reg.update().catch(()=>{});
      });

      // Időszakos version.json check (akkor is ha SW nem változott — pl. cache-ben maradt)
      setTimeout(checkVersionJson, 2000);

    } catch (err) {
      console.warn('SW registration failed', err);
    }
  });
}

async function checkVersionJson() {
  try {
    const res = await fetch('version.json', { cache: 'no-store' });
    if (!res.ok) return;
    const info = await res.json();
    if (info.version && info.version !== CURRENT_VERSION) {
      pendingVersionInfo = info;
      // Ha már van pending worker, mutassuk a bannert a changelog-gal
      if (pendingWorker) showUpdateBanner();
      // Ha nincs pending worker, akkor csak a changelog info van meg — meg fog érkezni a SW is
    }
  } catch {}
}

async function checkAndShowUpdate() {
  if (!pendingVersionInfo) {
    // Próbáljuk frissen lekérni a version.json-t
    try {
      const res = await fetch('version.json', { cache: 'no-store' });
      if (res.ok) pendingVersionInfo = await res.json();
    } catch {}
  }
  showUpdateBanner();
}

function showUpdateBanner() {
  const banner = $('#updateBanner');
  const sub = $('#updateBannerSub');
  if (pendingVersionInfo?.version) {
    sub.textContent = `v${CURRENT_VERSION} → v${pendingVersionInfo.version}`;
  } else {
    sub.textContent = 'Koppints a frissítéshez';
  }
  banner.classList.add('show');
}

$('#updateApply').addEventListener('click', applyUpdate);
$('#changelogApply').addEventListener('click', applyUpdate);
$('#updateViewChanges').addEventListener('click', showChangelog);
$$('[data-close-changelog]').forEach(el => el.addEventListener('click', () => {
  $('#changelogModal').classList.remove('open');
}));

function showChangelog() {
  const v = pendingVersionInfo;
  if (!v) { toast('Nincs részletes információ'); return; }
  $('#changelogVersion').textContent = `v${v.version}${v.released ? ' · ' + v.released : ''}`;
  const list = $('#changelogList');
  list.innerHTML = (v.notes || ['Részletek nem elérhetők.']).map(n => `<li>${escapeHtml(n)}</li>`).join('');
  $('#changelogModal').classList.add('open');
}

function applyUpdate() {
  if (!pendingWorker) {
    // Fallback: egyszerű reload, hátha megold mindent
    window.location.reload();
    return;
  }
  pendingWorker.postMessage('SKIP_WAITING');
  // A controllerchange listener fogja újratölteni
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

// ---------- Boot ----------
window.addEventListener('DOMContentLoaded', async () => {
  await renderDashboard();
  scheduleReminders();
});

// Re-schedule reminders on visibility change (phone wake)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    scheduleReminders();
    renderDashboard();
  }
});

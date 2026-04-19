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
  let csv = 'idopont;szisztoles;diasztoles;pulzus\n';
  for (const r of data) {
    const d = new Date(r.ts).toISOString();
    csv += `${d};${r.sys};${r.dia};${r.pulse}\n`;
  }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  download(blob, `tensio-export-${todayStr()}.csv`);
});
$('#clearAll').addEventListener('click', async () => {
  if (!confirm('Biztosan törlöd az ÖSSZES bejegyzést? Ez nem visszavonható.')) return;
  await dbClear();
  toast('Minden adat törölve');
  closeSettings();
  renderDashboard();
});
function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
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

// ---------- Service Worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed', err));
  });
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

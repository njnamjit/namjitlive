const dayOrder = ['จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์','อาทิตย์'];
const API = (window.APP_CONFIG || {}).API_URL || '';
let token = '';
try { token = sessionStorage.getItem('adminToken') || ''; } catch (e) {}
let weeks = [], curId = null, serverIds = new Set(), editingIndex = null, pendingImage = '', toastTimer;
const dirtyIds = new Set(), deletedIds = [];
const $ = id => document.getElementById(id);
const form = $('schedule-form');
const isDirty = () => dirtyIds.size > 0 || deletedIds.length > 0;

/* ---------- ตัวช่วยทั่วไป ---------- */
function escapeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}
const toInputDate = v => { const m = String(v || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
const displayDate = v => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
function shiftDate(v, days) {
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return '';
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + days)).toISOString().slice(0, 10);
}
function todayISO() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function showToast(message, kind = 'success') {
  const t = $('toast');
  t.textContent = message; t.className = `toast ${kind}`; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4200);
}
function setStatus(m) { $('save-status').textContent = m; }
window.addEventListener('beforeunload', e => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- เชื่อมต่อ API / ล็อกอิน ---------- */
async function api(action, payload = {}) {
  const res = await fetch(API, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({action, token, ...payload})});
  const out = await res.json();
  if (out.code === 'unauthorized') logout(true);
  return out;
}
function showView(on) { $('login-view').hidden = on; $('dashboard').hidden = !on; $('logout-button').hidden = !on; }
function logout(expired) {
  token = '';
  try { sessionStorage.removeItem('adminToken'); } catch (e) {}
  showView(false); setStatus('ยังไม่ได้เข้าสู่ระบบ');
  if (expired === true) showToast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง', 'error');
}
const netMsg = m => m === 'Failed to fetch' ? 'เชื่อมต่อ Google Sheet ไม่ได้ ตรวจสอบอินเทอร์เน็ตและ API_URL ใน config.js' : m;

/* ---------- สัปดาห์ ---------- */
const cur = () => weeks.find(w => w.id === curId);
const byStart = (a, b) => (a.start || '9999').localeCompare(b.start || '9999');
const newId = () => (Math.random().toString(36) + '00000000').slice(2, 10);
const toLocal = w => ({id:w.id, week:Number(w.week) || 1, start:toInputDate(w.start_date), end:toInputDate(w.end_date), schedule:(w.schedule || []).map(i => ({...i}))});
const toServer = w => ({id:w.id, week:w.week, start_date:displayDate(w.start), end_date:displayDate(w.end), schedule:w.schedule});

function weekLabel(w) {
  const s = displayDate(w.start), e = displayDate(w.end), t0 = todayISO();
  let t = `สัปดาห์ที่ ${w.week}` + (s ? ` · ${s.slice(0, 5)} – ${e || '?'}` : ' · ยังไม่ระบุวันที่');
  if (w.start && w.start <= t0 && t0 <= (w.end || w.start)) t += ' ★ สัปดาห์นี้';
  if (dirtyIds.has(w.id)) t += ' ● ยังไม่บันทึก';
  return t;
}
function renderWeekSelect() {
  weeks.sort(byStart);
  $('week-select').innerHTML = weeks.map(w => `<option value="${w.id}"${w.id === curId ? ' selected' : ''}>${escapeText(weekLabel(w))}</option>`).join('');
}
function loadWeekFields() { const w = cur(); $('week').value = w.week; $('start-date').value = w.start; $('end-date').value = w.end; }
function pickCurrent() {
  const t0 = todayISO();
  const now = weeks.find(w => w.start && w.start <= t0 && t0 <= (w.end || w.start));
  const next = weeks.find(w => w.start && w.start > t0);
  return (now || next || weeks[weeks.length - 1]).id;
}
function selectWeek(id) { curId = id; clearForm(); renderWeekSelect(); loadWeekFields(); renderList(); }
function markDirty() { if (curId) dirtyIds.add(curId); setStatus('มีการเปลี่ยนแปลงที่ยังไม่บันทึก'); renderWeekSelect(); }

function addWeek(copy) {
  weeks.sort(byStart);
  const src = cur(), last = weeks[weeks.length - 1];
  let start;
  if (last && last.start) start = shiftDate(last.start, 7);
  else start = shiftDate(todayISO(), -((new Date().getDay() + 6) % 7)); // วันจันทร์ของสัปดาห์นี้
  const num = weeks.reduce((m, w) => Math.max(m, Number(w.week) || 0), 0) + 1;
  const w = {id:newId(), week:num, start, end:shiftDate(start, 6), schedule: copy && src ? src.schedule.map(i => ({...i})) : []};
  weeks.push(w); dirtyIds.add(w.id); curId = w.id;
  return w;
}
$('add-week').addEventListener('click', () => { addWeek(false); selectWeek(curId); markDirty(); showToast('เพิ่มสัปดาห์ใหม่แล้ว เริ่มเพิ่มรายการได้เลย'); });
$('copy-week').addEventListener('click', () => { addWeek(true); selectWeek(curId); markDirty(); showToast('เพิ่มสัปดาห์ใหม่พร้อมคัดลอกรายการแล้ว ปรับแก้ได้เลย'); });
$('del-week').addEventListener('click', () => {
  if (!confirm(`ต้องการลบ “${weekLabel(cur()).replace(' ● ยังไม่บันทึก', '')}” พร้อมรายการทั้งหมดในสัปดาห์นี้ใช่หรือไม่?`)) return;
  const id = curId;
  weeks = weeks.filter(w => w.id !== id); dirtyIds.delete(id);
  if (serverIds.has(id)) deletedIds.push(id);
  if (!weeks.length) addWeek(false);
  selectWeek(weeks.some(w => w.id === curId) ? curId : pickCurrent());
  setStatus('มีการเปลี่ยนแปลงที่ยังไม่บันทึก'); showToast('ลบสัปดาห์แล้ว อย่าลืมบันทึกการเปลี่ยนแปลง');
});
$('week-select').addEventListener('change', e => selectWeek(e.target.value));
$('week').addEventListener('input', () => { cur().week = parseInt($('week').value, 10) || 0; markDirty(); });
$('start-date').addEventListener('change', () => {
  const w = cur(); w.start = $('start-date').value;
  if (w.start && (!w.end || w.end < w.start)) { w.end = shiftDate(w.start, 6); $('end-date').value = w.end; }
  markDirty();
});
$('end-date').addEventListener('change', () => { cur().end = $('end-date').value; markDirty(); });

/* ---------- รายการไลฟ์ ---------- */
function renderList() {
  const w = cur(), items = w.schedule, body = $('schedule-list');
  body.replaceChildren();
  $('item-count').textContent = items.length;
  $('admin-empty').hidden = items.length > 0;
  $('table-wrap').hidden = items.length === 0;
  const types = [...new Set(weeks.flatMap(x => x.schedule.map(i => i.type)).filter(Boolean))];
  $('recent-types').innerHTML = types.map(v => `<option value="${escapeText(v)}">`).join('');
  items.map((item, index) => ({item, index})).sort((a, b) =>
    (dayOrder.indexOf(a.item.day) - dayOrder.indexOf(b.item.day)) || String(a.item.time).localeCompare(String(b.item.time))
  ).forEach(({item, index}) => {
    const img = /^data:image\//.test(item.image || '') ? `<img class="thumb" alt="" src="${escapeText(item.image)}">` : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeText(item.day)}</strong><span class="table-sub">${escapeText(item.time)}</span></td>
      <td class="details-cell">${escapeText(item.details)}${img}</td>
      <td>${item.type ? `<span class="type-label">${escapeText(item.type)}</span>` : '<span class="muted">-</span>'}</td>
      <td><div class="row-actions"><button class="icon-button edit-action" type="button" data-action="edit" data-index="${index}">แก้ไข</button><button class="icon-button dup-action" type="button" data-action="dup" data-index="${index}">คัดลอก</button><button class="icon-button delete-action" type="button" data-action="delete" data-index="${index}">ลบ</button></div></td>`;
    body.append(tr);
  });
}

/* ---------- รูปภาพ ---------- */
function updatePreview() {
  const box = $('image-preview');
  box.replaceChildren();
  if (pendingImage) { const im = document.createElement('img'); im.src = pendingImage; im.alt = 'ตัวอย่างรูป'; box.append(im); }
  else box.textContent = 'ไม่มีรูป';
  $('image-clear').hidden = !pendingImage;
}
function loadImg(file) {
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(file), im = new Image();
    im.onload = () => { URL.revokeObjectURL(u); res(im); };
    im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('เปิดไฟล์รูปไม่ได้ ลองใช้ไฟล์ PNG หรือ JPG')); };
    im.src = u;
  });
}
// ย่อรูปให้เล็กพอเก็บใน 1 เซลล์ของ Google Sheet (ไม่เกิน 45,000 ตัวอักษร)
async function shrinkImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('กรุณาเลือกไฟล์รูปภาพ');
  const im = await loadImg(file), W = im.naturalWidth || 300, H = im.naturalHeight || 300;
  let max = 480;
  for (let i = 0; i < 10; i++) {
    const sc = Math.min(1, max / Math.max(W, H)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(W * sc)); c.height = Math.max(1, Math.round(H * sc));
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    let url = c.toDataURL('image/webp', 0.8);
    if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/png');
    if (url.length <= 45000) return url;
    max = Math.round(max * 0.8);
  }
  throw new Error('รูปนี้ย่อแล้วยังใหญ่เกินไป ลองใช้รูปที่เรียบง่ายกว่านี้');
}
$('image-file').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try { pendingImage = await shrinkImage(f); updatePreview(); }
  catch (err) { showToast(err.message, 'error'); }
});
$('image-clear').addEventListener('click', () => { pendingImage = ''; updatePreview(); });

/* ---------- ฟอร์ม ---------- */
function clearForm() {
  form.reset(); editingIndex = null; pendingImage = ''; updatePreview();
  $('form-heading').textContent = 'เพิ่มรายการไลฟ์';
  $('submit-button').textContent = '＋ เพิ่มรายการ';
  $('cancel-edit').hidden = true;
}
form.addEventListener('submit', e => {
  e.preventDefault();
  const item = {day:$('day').value, details:$('details').value.trim(), time:$('time').value, type:$('type').value.trim(), image:pendingImage};
  if (!item.details || !item.time) { showToast('กรุณากรอกวัน เวลา และรายละเอียดให้ครบ', 'error'); return; }
  const list = cur().schedule;
  if (editingIndex === null) { list.push(item); showToast('เพิ่มรายการแล้ว อย่าลืมบันทึกการเปลี่ยนแปลง'); }
  else { list[editingIndex] = item; showToast('แก้ไขรายการแล้ว อย่าลืมบันทึกการเปลี่ยนแปลง'); }
  clearForm(); renderList(); markDirty();
});
$('schedule-list').addEventListener('click', e => {
  const btn = e.target.closest('button[data-action]'); if (!btn) return;
  const list = cur().schedule, index = Number(btn.dataset.index);
  if (!list[index]) return;
  if (btn.dataset.action === 'edit') {
    const it = list[index]; editingIndex = index;
    $('day').value = it.day || dayOrder[0]; $('details').value = it.details || ''; $('time').value = it.time || ''; $('type').value = it.type || '';
    pendingImage = it.image || ''; updatePreview();
    $('form-heading').textContent = 'แก้ไขรายการไลฟ์'; $('submit-button').textContent = 'บันทึกการแก้ไข'; $('cancel-edit').hidden = false;
    form.scrollIntoView({behavior:'smooth', block:'center'}); $('details').focus();
  } else if (btn.dataset.action === 'dup') {
    list.push({...list[index]}); renderList(); markDirty();
    showToast('คัดลอกรายการแล้ว กด “แก้ไข” เพื่อเปลี่ยนวันหรือเวลา');
  } else if (btn.dataset.action === 'delete') {
    if (!confirm(`ต้องการลบรายการ “${list[index].details}” ใช่หรือไม่?`)) return;
    list.splice(index, 1);
    if (editingIndex === index) clearForm(); else if (editingIndex !== null && editingIndex > index) editingIndex--;
    renderList(); markDirty(); showToast('ลบรายการแล้ว อย่าลืมบันทึกการเปลี่ยนแปลง');
  }
});
$('cancel-edit').addEventListener('click', clearForm);

/* ---------- บันทึก ---------- */
async function saveAll() {
  if (!isDirty()) { showToast('ยังไม่มีการเปลี่ยนแปลงให้บันทึก'); return; }
  for (const id of dirtyIds) {
    const w = weeks.find(x => x.id === id); if (!w) continue;
    const problem = !(w.week >= 1) ? 'กรุณาระบุหมายเลขสัปดาห์ตั้งแต่ 1 ขึ้นไป'
      : (!w.start || !w.end) ? 'กรุณาระบุวันเริ่มต้นและวันสิ้นสุด'
      : w.start > w.end ? 'วันเริ่มต้นต้องไม่อยู่หลังวันสิ้นสุด' : '';
    if (problem) { selectWeek(id); showToast(`${problem} (สัปดาห์ที่ ${w.week || '?'})`, 'error'); return; }
  }
  const payload = {weeks:[...dirtyIds].map(id => weeks.find(x => x.id === id)).filter(Boolean).map(toServer), deleted:deletedIds};
  const btn = $('save-button');
  btn.disabled = true; btn.innerHTML = '<span class="loader tiny"></span> กำลังบันทึก...'; setStatus('กำลังบันทึก...');
  try {
    const r = await api('save', payload);
    if (!r.success) throw new Error(r.message || 'บันทึกไม่สำเร็จ');
    dirtyIds.clear(); deletedIds.length = 0; weeks.forEach(w => serverIds.add(w.id));
    renderWeekSelect(); setStatus('บันทึกแล้ว'); showToast('บันทึกตารางเรียบร้อยแล้ว');
  } catch (err) {
    setStatus('บันทึกไม่สำเร็จ');
    if (token) showToast(netMsg(err.message) || 'เกิดข้อผิดพลาดในการบันทึก', 'error');
  } finally { btn.disabled = false; btn.innerHTML = 'บันทึกการเปลี่ยนแปลง <span>→</span>'; }
}
$('save-button').addEventListener('click', saveAll);
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveAll(); } });

/* ---------- โหลดข้อมูล / เริ่มระบบ ---------- */
async function loadData() {
  setStatus('กำลังโหลดข้อมูล...');
  try {
    const r = await api('list');
    if (r.code === 'unauthorized') return;
    if (!r.success) throw new Error(r.message || 'โหลดข้อมูลไม่สำเร็จ');
    weeks = (r.weeks || []).map(toLocal); weeks.sort(byStart);
    serverIds = new Set(weeks.map(w => w.id)); dirtyIds.clear(); deletedIds.length = 0;
    if (!weeks.length) addWeek(false);
    selectWeek(weeks.some(w => w.id === curId) ? curId : pickCurrent());
    setStatus(dirtyIds.size ? 'มีการเปลี่ยนแปลงที่ยังไม่บันทึก' : 'โหลดข้อมูลแล้ว');
  } catch (err) {
    setStatus('ยังโหลดข้อมูลไม่ได้');
    showToast(netMsg(err.message) || 'โหลดข้อมูลจาก Google Sheet ไม่สำเร็จ', 'error');
  }
}
$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('login-button');
  btn.disabled = true; btn.textContent = 'กำลังตรวจสอบ...';
  try {
    const r = await api('login', {password:$('password').value});
    if (!r.success) throw new Error(r.message || 'เข้าสู่ระบบไม่สำเร็จ');
    token = r.token;
    try { sessionStorage.setItem('adminToken', token); } catch (e2) {}
    $('password').value = ''; showView(true); loadData();
  } catch (err) { showToast(netMsg(err.message), 'error'); }
  finally { btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ'; }
});
$('logout-button').addEventListener('click', async () => {
  if (isDirty() && !confirm('มีการแก้ไขที่ยังไม่บันทึก ต้องการออกจากระบบใช่หรือไม่?')) return;
  try { await api('logout'); } catch (e) {}
  dirtyIds.clear(); deletedIds.length = 0; logout();
});
async function init() {
  if (!API || API.includes('PASTE')) { showView(false); showToast('ยังไม่ได้ตั้งค่า API_URL ใน config.js', 'error'); return; }
  if (token) { try { const r = await api('verify'); if (r.success) { showView(true); loadData(); return; } } catch (e) {} }
  showView(false); setStatus('ยังไม่ได้เข้าสู่ระบบ');
}
init();

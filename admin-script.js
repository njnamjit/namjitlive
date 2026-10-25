const dayOrder = ['จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์','อาทิตย์'];
let schedule = [];
let currentWeek = 1;
let startDate = '';
let endDate = '';
let editingIndex = null;
let toastTimer;
let dirty = false;
const API = (window.APP_CONFIG || {}).API_URL || '';
let token = '';
try { token = sessionStorage.getItem('adminToken') || ''; } catch (e) {}
async function api(action, payload = {}) {
  const res = await fetch(API, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({action, token, ...payload})});
  const out = await res.json();
  if (out.code === 'unauthorized') logout(true);
  return out;
}
function showView(loggedIn) { $('login-view').hidden = loggedIn; $('dashboard').hidden = !loggedIn; $('logout-button').hidden = !loggedIn; }
function logout(expired) {
  token = ''; dirty = false;
  try { sessionStorage.removeItem('adminToken'); } catch (e) {}
  showView(false); setStatus('ยังไม่ได้เข้าสู่ระบบ');
  if (expired === true) showToast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง', 'error');
}
const netMsg = m => m === 'Failed to fetch' ? 'เชื่อมต่อ Google Sheet ไม่ได้ ตรวจสอบอินเทอร์เน็ตและ API_URL ใน config.js' : m;

const $ = id => document.getElementById(id);
const form = $('schedule-form');

function escapeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[char]);
}
function toInputDate(value) {
  if (!value) return '';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return value;
  const thai = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (thai) return `${thai[3]}-${thai[2].padStart(2,'0')}-${thai[1].padStart(2,'0')}`;
  return '';
}
function displayDate(value) {
  if (!value) return '';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}
function showToast(message, kind = 'success') {
  const toast = $('toast');
  toast.textContent = message;
  toast.className = `toast ${kind}`;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3600);
}
function setStatus(message) { $('save-status').textContent = message; dirty = message.includes('ยังไม่บันทึก'); }
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
function fillSuggestions() {
  const uniq = k => [...new Set(schedule.map(i => i[k]).filter(Boolean))];
  $('recent-types').innerHTML = uniq('type').map(v => `<option value="${escapeText(v)}">`).join('');
}
function shiftDate(v, days) {
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2]-1, +m[3] + days));
  return d.toISOString().slice(0, 10);
}
$('next-week').addEventListener('click', () => {
  $('week').value = (Number($('week').value) || 0) + 1;
  $('start-date').value = shiftDate($('start-date').value, 7);
  $('end-date').value = shiftDate($('end-date').value, 7);
  setStatus('มีการเปลี่ยนแปลงที่ยังไม่บันทึก');
  showToast('เลื่อนเป็นสัปดาห์ถัดไปแล้ว ปรับรายการแล้วกดบันทึก');
});
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); $('save-button').click(); } });

async function loadData() {
  setStatus('กำลังโหลดข้อมูล...');
  try {
    const response = await fetch(`${API}?v=${Date.now()}`);
    if (!response.ok) throw new Error('โหลดข้อมูลไม่สำเร็จ');
    const txt = (await response.text()).trim();
    const data = txt ? JSON.parse(txt) : {};
    schedule = Array.isArray(data.schedule) ? data.schedule : [];
    currentWeek = Number(data.week) || 1;
    startDate = data.start_date || '';
    endDate = data.end_date || '';
    $('week').value = currentWeek;
    $('start-date').value = toInputDate(startDate);
    $('end-date').value = toInputDate(endDate);
    renderList();
    setStatus('โหลดข้อมูลแล้ว');
  } catch (error) {
    schedule = [];
    renderList();
    setStatus('ยังโหลดข้อมูลไม่ได้');
    showToast('โหลดข้อมูลจาก Google Sheet ไม่สำเร็จ ตรวจสอบ API_URL ใน config.js', 'error');
  }
}
function renderList() {
  const body = $('schedule-list');
  body.replaceChildren();
  const sorted = schedule.map((item,index)=>({item,index})).sort((a,b)=>{
    const d = dayOrder.indexOf(a.item.day)-dayOrder.indexOf(b.item.day);
    return d || String(a.item.time||'').localeCompare(String(b.item.time||''));
  });
  $('item-count').textContent = schedule.length;
  fillSuggestions();
  $('admin-empty').hidden = schedule.length > 0;
  $('table-wrap').hidden = schedule.length === 0;
  sorted.forEach(({item,index}) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeText(item.day)}</strong><span class="table-sub">${escapeText(item.time)}</span></td>
      <td class="details-cell">${escapeText(item.details)}</td>
      <td>${item.type ? `<span class="type-label">${escapeText(item.type)}</span>` : '<span class="muted">-</span>'}</td>
      <td><div class="row-actions"><button class="icon-button edit-action" type="button" data-action="edit" data-index="${index}" aria-label="แก้ไขรายการ">แก้ไข</button><button class="icon-button dup-action" type="button" data-action="dup" data-index="${index}" aria-label="ทำสำเนารายการ">คัดลอก</button><button class="icon-button delete-action" type="button" data-action="delete" data-index="${index}" aria-label="ลบรายการ">ลบ</button></div></td>`;
    body.append(tr);
  });
}
function clearForm() {
  form.reset();
  editingIndex = null;
  $('form-heading').textContent = 'เพิ่มรายการไลฟ์';
  $('submit-button').textContent = '＋ เพิ่มรายการ';
  $('cancel-edit').hidden = true;
}
form.addEventListener('submit', event => {
  event.preventDefault();
  const item = {
    day: $('day').value,
    details: $('details').value.trim(),
    time: $('time').value,
    type: $('type').value.trim()
  };
  if (!item.details || !item.time) {
    showToast('กรุณากรอกข้อมูลให้ครบทุกช่อง', 'error'); return;
  }
  if (editingIndex === null) {
    schedule.push(item);
    showToast('เพิ่มรายการแล้ว อย่าลืมบันทึกการเปลี่ยนแปลง');
  } else {
    schedule[editingIndex] = item;
    showToast('แก้ไขรายการแล้ว อย่าลืมบันทึกการเปลี่ยนแปลง');
  }
  clearForm();
  renderList();
  setStatus('มีการเปลี่ยนแปลงที่ยังไม่บันทึก');
});
$('schedule-list').addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const index = Number(button.dataset.index);
  if (!Number.isInteger(index) || !schedule[index]) return;
  if (button.dataset.action === 'edit') {
    const item = schedule[index];
    editingIndex = index;
    $('day').value = item.day || dayOrder[0];
    $('details').value = item.details || '';
    $('time').value = item.time || '';
    $('type').value = item.type || '';
    $('form-heading').textContent = 'แก้ไขรายการไลฟ์';
    $('submit-button').textContent = 'บันทึกการแก้ไข';
    $('cancel-edit').hidden = false;
    form.scrollIntoView({behavior:'smooth', block:'center'});
    $('details').focus();
  } else if (button.dataset.action === 'dup') {
    schedule.push({...schedule[index]});
    renderList(); setStatus('มีการเปลี่ยนแปลงที่ยังไม่บันทึก');
    showToast('คัดลอกรายการแล้ว กด “แก้ไข” เพื่อเปลี่ยนวันหรือเวลา');
  } else if (button.dataset.action === 'delete') {
    if (!confirm(`ต้องการลบรายการ “${schedule[index].details}” ใช่หรือไม่?`)) return;
    schedule.splice(index, 1);
    if (editingIndex === index) clearForm();
    else if (editingIndex !== null && editingIndex > index) editingIndex--;
    renderList();
    setStatus('มีการเปลี่ยนแปลงที่ยังไม่บันทึก');
    showToast('ลบรายการแล้ว อย่าลืมบันทึกการเปลี่ยนแปลง');
  }
});
$('cancel-edit').addEventListener('click', clearForm);
$('week').addEventListener('input', () => setStatus('มีการเปลี่ยนแปลงที่ยังไม่บันทึก'));
$('start-date').addEventListener('change', () => setStatus('มีการเปลี่ยนแปลงที่ยังไม่บันทึก'));
$('end-date').addEventListener('change', () => setStatus('มีการเปลี่ยนแปลงที่ยังไม่บันทึก'));

$('save-button').addEventListener('click', async () => {
  const week = Number($('week').value);
  const start = $('start-date').value;
  const end = $('end-date').value;
  if (!Number.isInteger(week) || week < 1) { showToast('กรุณาระบุหมายเลขสัปดาห์ตั้งแต่ 1 ขึ้นไป', 'error'); $('week').focus(); return; }
  if (start && end && start > end) { showToast('วันเริ่มต้นต้องไม่อยู่หลังวันสิ้นสุด', 'error'); $('end-date').focus(); return; }
  const payload = {week, start_date: displayDate(start), end_date: displayDate(end), schedule};
  const button = $('save-button');
  button.disabled = true;
  button.innerHTML = '<span class="loader tiny"></span> กำลังบันทึก...';
  setStatus('กำลังบันทึก...');
  try {
    const result = await api('save', payload);
    if (!result.success) throw new Error(result.message || 'บันทึกไม่สำเร็จ');
    currentWeek = week; startDate = payload.start_date; endDate = payload.end_date;
    setStatus('บันทึกแล้ว'); dirty = false;
    showToast('บันทึกตารางเรียบร้อยแล้ว');
  } catch (error) {
    setStatus('บันทึกไม่สำเร็จ');
    if (token) showToast(netMsg(error.message) || 'เกิดข้อผิดพลาดในการบันทึก', 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = 'บันทึกการเปลี่ยนแปลง <span>→</span>';
  }
});
$('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const btn = $('login-button');
  btn.disabled = true; btn.textContent = 'กำลังตรวจสอบ...';
  try {
    const r = await api('login', {password: $('password').value});
    if (!r.success) throw new Error(r.message || 'เข้าสู่ระบบไม่สำเร็จ');
    token = r.token;
    try { sessionStorage.setItem('adminToken', token); } catch (e) {}
    $('password').value = '';
    showView(true); loadData();
  } catch (err) { showToast(netMsg(err.message), 'error'); }
  finally { btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ'; }
});
$('logout-button').addEventListener('click', async () => {
  if (dirty && !confirm('มีการแก้ไขที่ยังไม่บันทึก ต้องการออกจากระบบใช่หรือไม่?')) return;
  try { await api('logout'); } catch (e) {}
  logout();
});
async function init() {
  if (!API || API.includes('PASTE')) { showView(false); showToast('ยังไม่ได้ตั้งค่า API_URL ใน config.js', 'error'); return; }
  if (token) {
    try { const r = await api('verify'); if (r.success) { showView(true); loadData(); return; } } catch (e) {}
  }
  showView(false); setStatus('ยังไม่ได้เข้าสู่ระบบ');
}
init();

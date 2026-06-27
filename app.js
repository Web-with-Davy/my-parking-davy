const SUPABASE_URL = 'https://haeuukipjehwqwpnmqpc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_aGZiCX-Ol2GibEJr6d8bUw_jpGbW5iU';

let sb = null;
let photoBase64 = null;
let allComplaints = [];
let filteredComplaints = [];
let currentPage = 1;
const PAGE_SIZE = 10;

const loginAttempts = JSON.parse(localStorage.getItem('_lka') || '[]');
const isConfigured = SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';

function saveAttempts() { localStorage.setItem('_lka', JSON.stringify(loginAttempts)); }

function isLockedOut() {
  const lockUntil = parseInt(localStorage.getItem('_lku') || '0');
  if (Date.now() < lockUntil) return lockUntil;
  return false;
}

function recordFailedAttempt() {
  const now = Date.now();
  loginAttempts.push(now);
  const recent = loginAttempts.filter(t => now - t < 120000);
  loginAttempts.length = 0;
  recent.forEach(t => loginAttempts.push(t));
  saveAttempts();
  if (recent.length >= 5) { localStorage.setItem('_lku', now + 600000); return true; }
  return false;
}

function clearAttempts() { loginAttempts.length = 0; saveAttempts(); localStorage.removeItem('_lku'); }

function show(id) { const el = document.getElementById(id); if (el) el.classList.add('show'); }
function hide(id) { const el = document.getElementById(id); if (el) el.classList.remove('show'); }
function setMsg(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'msg msg-' + type + ' show';
}
function clearMsg(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'msg';
  el.textContent = '';
}

function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + page);
  if (target) target.classList.add('active');
  history.pushState(null, '', '#' + page);
}

function parseHash() {
  const raw = location.hash.slice(1).split('?')[0];
  return raw || 'home';
}

async function getSession() {
  if (!sb) return null;
  try { const { data: { session } } = await sb.auth.getSession(); return session; }
  catch { return null; }
}

async function router() {
  const page = parseHash();
  if (page === 'admin') {
    const session = await getSession();
    if (!session) { window.navigate('login'); return; }
    window.navigate('admin');
    loadComplaints();
    return;
  }
  if (page === 'login') {
    const session = await getSession();
    if (session) { window.navigate('admin'); loadComplaints(); return; }
    window.navigate('login');
    return;
  }
  window.navigate('home');
  initHomePage();
}

const COOLDOWN_MS = 5 * 60 * 1000;
let cooldownInterval = null;

async function initHomePage() {
  const loading = document.getElementById('home-loading');
  const banError = document.getElementById('home-ban-error');
  const cooldownEl = document.getElementById('home-cooldown');
  const formContent = document.getElementById('home-form-content');

  loading.style.display = 'block';
  banError.style.display = 'none';
  cooldownEl.style.display = 'none';
  formContent.style.display = 'none';
  if (cooldownInterval) { clearInterval(cooldownInterval); cooldownInterval = null; }

  const lastSubmit = parseInt(localStorage.getItem('last_submit') || '0');
  const remaining = COOLDOWN_MS - (Date.now() - lastSubmit);

  if (remaining > 0) {
    loading.style.display = 'none';
    cooldownEl.style.display = 'block';
    startCountdown(remaining, cooldownEl, formContent);
    return;
  }

  if (isConfigured) {
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const json = await res.json();
      const ip = json.ip;
      if (ip) {
        const { data: banned } = await sb.from('banned_ips').select('ip').eq('ip', ip).maybeSingle();
        if (banned) {
          loading.style.display = 'none';
          banError.style.display = 'block';
          return;
        }
        window._userIp = ip;
      }
    } catch { }
  } else {
    window._userIp = null;
  }

  loading.style.display = 'none';
  formContent.style.display = 'block';
}

function startCountdown(remainingMs, cooldownEl, formContent) {
  function tick() {
    const lastSubmit = parseInt(localStorage.getItem('last_submit') || '0');
    const ms = COOLDOWN_MS - (Date.now() - lastSubmit);
    if (ms <= 0) {
      clearInterval(cooldownInterval);
      cooldownInterval = null;
      cooldownEl.style.display = 'none';
      formContent.style.display = 'block';
      document.getElementById('complaint-form').style.display = '';
      document.getElementById('success-screen').classList.remove('show');
      return;
    }
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    document.getElementById('cooldown-timer').textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }
  tick();
  cooldownInterval = setInterval(tick, 1000);
}

async function doLogin() {
  const lockUntil = isLockedOut();
  if (lockUntil) {
    const mins = Math.ceil((lockUntil - Date.now()) / 60000);
    setMsg('login-lockout', `Blocat pentru încă ${mins} minute.`, 'error');
    return;
  }
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) { setMsg('login-error', 'Completează email-ul și parola.', 'error'); return; }
  clearMsg('login-error'); clearMsg('login-lockout');
  show('login-spinner');
  document.getElementById('login-btn').disabled = true;
  try {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      if (recordFailedAttempt()) setMsg('login-lockout', 'Prea multe încercări. Blocat 10 minute.', 'error');
      else setMsg('login-error', 'Email sau parolă incorectă.', 'error');
    } else {
      clearAttempts();
      navigate('admin');
      loadComplaints();
      initNotifButton();
      startRealtimeListener();
    }
  } catch { setMsg('login-error', 'Eroare de conexiune. Încearcă din nou.', 'error'); }
  hide('login-spinner');
  document.getElementById('login-btn').disabled = false;
}

async function doLogout() {
  if (sb) await sb.auth.signOut();
  navigate('home');
  initHomePage();
}

async function loadComplaints() {
  show('table-spinner');
  clearMsg('complaints-msg');
  document.getElementById('empty-state').style.display = 'none';
  try {
    const { data, error } = await sb
      .from('complaints')
      .select('*')
      .order('submitted_at', { ascending: false });
    if (error) throw error;
    allComplaints = data || [];
    filteredComplaints = [...allComplaints];
    currentPage = 1;
    renderTable();
  } catch (e) {
    setMsg('complaints-msg', 'Eroare la încărcare: ' + (e.message || ''), 'info');
  }
  hide('table-spinner');
}


function renderTable() {
  const tbody = document.getElementById('complaints-tbody');
  tbody.innerHTML = '';
  const total = filteredComplaints.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = (currentPage - 1) * PAGE_SIZE;
  const slice = filteredComplaints.slice(start, start + PAGE_SIZE);
  document.getElementById('page-info').textContent = `${currentPage} / ${totalPages}`;
  document.getElementById('prev-page').disabled = currentPage <= 1;
  document.getElementById('next-page').disabled = currentPage >= totalPages;
  document.getElementById('empty-state').style.display = total === 0 ? 'block' : 'none';
  document.getElementById('complaints-table').style.display = total === 0 ? 'none' : '';
  slice.forEach(c => {
    const tr = document.createElement('tr');
    if (c.is_banned) tr.classList.add('banned');
    const date = c.submitted_at ? new Date(c.submitted_at).toLocaleString('ro-RO') : '—';
    const type = c.complaint_type || '—';
    const desc = (c.description || '').substring(0, 80) + ((c.description || '').length > 80 ? '…' : '');
    const ip = c.ip_address || '—';
    const ua = (c.user_agent || '').substring(0, 45) + '…';
    const status = c.is_banned
      ? '<span class="badge badge-banned">Blocat</span>'
      : '<span class="badge badge-active">Activ</span>';
    const banBtn = c.is_banned
      ? `<button class="btn btn-sm btn-danger" onclick="unbanIp('${c.ip_address}')">Deblochează</button>`
      : `<button class="btn btn-sm btn-danger" onclick="banIp('${c.ip_address}')">Blochează</button>`;
    const photoBtn = c.photo_url
      ? `<button class="btn btn-sm" style="margin-top:.4rem;" onclick="viewPhoto('${c.id}')">&#128247; Foto</button>`
      : '';
    const deleteBtn = `<button class="btn btn-sm" style="margin-top:.4rem;color:var(--red);border-color:var(--red);" onclick="deleteComplaint('${c.id}')">&#128465; Șterge</button>`;
    tr.innerHTML = `
      <td>${date}</td>
      <td>${type}</td>
      <td title="${(c.description || '').replace(/"/g, '&quot;')}">${desc}</td>
      <td style="font-family:monospace;font-size:.75rem;white-space:nowrap;">${ip}</td>
      <td title="${(c.user_agent || '').replace(/"/g, '&quot;')}" style="font-size:.7rem;color:rgba(255,255,255,.35);">${ua}</td>
      <td>${status}</td>
      <td style="white-space:nowrap;display:flex;flex-direction:column;gap:.3rem;">${banBtn}${photoBtn}${deleteBtn}</td>
    `;
    tbody.appendChild(tr);
  });
}

function changePage(dir) {
  const total = Math.max(1, Math.ceil(filteredComplaints.length / PAGE_SIZE));
  currentPage = Math.min(Math.max(1, currentPage + dir), total);
  renderTable();
}

async function banIp(ip) {
  if (!ip || ip === '—') return;
  show('table-spinner');
  try {
    await sb.from('banned_ips').upsert({ ip, reason: 'Blocat din panoul admin' });
    await sb.from('complaints').update({ is_banned: true }).eq('ip_address', ip);
    allComplaints = allComplaints.map(c => c.ip_address === ip ? { ...c, is_banned: true } : c);
    filteredComplaints = filteredComplaints.map(c => c.ip_address === ip ? { ...c, is_banned: true } : c);
    renderTable();
  } catch (e) { alert('Eroare la blocare: ' + e.message); }
  hide('table-spinner');
}

async function deleteComplaint(id) {
  if (!confirm('Ești sigur că vrei să ștergi această sesizare?')) return;
  show('table-spinner');
  try {
    await sb.from('complaints').delete().eq('id', id);
    allComplaints = allComplaints.filter(c => c.id !== id);
    filteredComplaints = filteredComplaints.filter(c => c.id !== id);
    renderTable();
  } catch (e) { alert('Eroare la ștergere: ' + e.message); }
  hide('table-spinner');
}

async function unbanIp(ip) {
  if (!ip || ip === '—') return;
  show('table-spinner');
  try {
    await sb.from('banned_ips').delete().eq('ip', ip);
    await sb.from('complaints').update({ is_banned: false }).eq('ip_address', ip);
    allComplaints = allComplaints.map(c => c.ip_address === ip ? { ...c, is_banned: false } : c);
    filteredComplaints = filteredComplaints.map(c => c.ip_address === ip ? { ...c, is_banned: false } : c);
    renderTable();
  } catch (e) { alert('Eroare la deblocare: ' + e.message); }
  hide('table-spinner');
}

function viewPhoto(id) {
  const complaint = allComplaints.find(c => c.id === id);
  if (!complaint || !complaint.photo_url) return;
  const w = window.open('', '_blank');
  w.document.write(`<body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img src="${complaint.photo_url}" style="max-width:100%;max-height:100vh;" /></body>`);
}

function updateCharCount() {
  document.getElementById('char-count').textContent = document.getElementById('desc-input').value.length;
}

function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    photoBase64 = e.target.result;
    const preview = document.getElementById('photo-preview');
    preview.src = photoBase64;
    preview.classList.add('show');
    document.getElementById('photo-label').textContent = '✓ ' + file.name;
  };
  reader.readAsDataURL(file);
}

async function submitComplaint() {
  const type = document.getElementById('type-select').value;
  const desc = document.getElementById('desc-input').value.trim();
  if (!type) { setMsg('form-error', 'Selectează tipul problemei.', 'error'); return; }
  clearMsg('form-error');
  show('submit-spinner');
  document.getElementById('submit-btn').disabled = true;
  try {
    let ip = window._userIp || null;
    if (!ip) {
      try { const r = await fetch('https://api.ipify.org?format=json'); ip = (await r.json()).ip; } catch { }
    }
    const payload = {
      complaint_type: type,
      description: desc,
      photo_url: photoBase64 || null,
      ip_address: ip,
      user_agent: navigator.userAgent,
      screen_resolution: `${screen.width}x${screen.height}`,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      submitted_at: new Date().toISOString(),
      is_banned: false
    };
    if (isConfigured) {
      const { error } = await sb.from('complaints').insert(payload);
      if (error) throw error;
    }
    localStorage.setItem('last_submit', Date.now().toString());
    document.getElementById('complaint-form').style.display = 'none';
    document.getElementById('success-screen').classList.add('show');
    setTimeout(() => {
      document.getElementById('success-screen').classList.remove('show');
      const cooldownEl = document.getElementById('home-cooldown');
      const formContent = document.getElementById('home-form-content');
      formContent.style.display = 'none';
      cooldownEl.style.display = 'block';
      startCountdown(COOLDOWN_MS, cooldownEl, formContent);
    }, 3000);
  } catch (e) {
    setMsg('form-error', 'Eroare la trimitere: ' + (e.message || 'necunoscută'), 'error');
    document.getElementById('submit-btn').disabled = false;
  }
  hide('submit-spinner');
}

async function init() {
  if (!isConfigured) {
    navigate('home');
    initHomePage();
    document.addEventListener('DOMContentLoaded', () => {
      const pw = document.getElementById('login-password');
      if (pw) pw.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    });
    return;
  }
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
  script.onload = async () => {
    try {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false
        }
      });
      sb.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
          if (parseHash() === 'login' || parseHash() === 'home') {
            window.navigate('admin');
            loadComplaints();
          }
        } else if (event === 'SIGNED_OUT') {
          stopRealtimeListener();
          window.navigate('home');
          initHomePage();
        } else if (event === 'TOKEN_REFRESHED') {
          console.log('[Auth] Token reînnoit automat.');
        }
      });
    }
    catch { navigate('home'); initHomePage(); return; }
    const pw = document.getElementById('login-password');
    if (pw) pw.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    await router();
  };
  script.onerror = () => { navigate('home'); initHomePage(); };
  document.head.appendChild(script);
}

window.addEventListener('hashchange', () => {
  const page = parseHash();
  if (page === 'home') { navigate('home'); initHomePage(); }
  else router();
});

init();

let deferredInstallPrompt = null;
let swRegistration = null;
let realtimeChannel = null;
let toastTimeout = null;
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    swRegistration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    console.log('[SW] Înregistrat cu succes.');
  } catch (e) {
    console.warn('[SW] Eroare la înregistrare:', e);
  }
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const banner = document.getElementById('install-banner');
  if (banner) banner.style.display = 'flex';
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const banner = document.getElementById('install-banner');
  if (banner) banner.style.display = 'none';
  showToast('Aplicație instalată! ✓', 'My Parking Davy a fost instalat pe dispozitivul tău.');
});

async function installPWA() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  const banner = document.getElementById('install-banner');
  if (banner) banner.style.display = 'none';
}

async function requestNotifPermission() {
  if (!('Notification' in window)) {
    alert('Browserul tău nu suportă notificări.');
    return;
  }
  const perm = await Notification.requestPermission();
  updateNotifButton(perm);
  if (perm === 'granted') {
    showToast('Notificări activate! 🔔', 'Vei primi notificări când primești sesizări noi.');
    startRealtimeListener();
  } else {
    showToast('Notificări blocate', 'Activează notificările din setările browserului.');
  }
}

function updateNotifButton(permission) {
  const btn = document.getElementById('notif-btn');
  if (!btn) return;
  if (permission === 'granted') {
    btn.textContent = '🔔 Notificări Active';
    btn.style.color = 'var(--green)';
    btn.style.borderColor = 'var(--green)';
    btn.onclick = null;
    btn.style.cursor = 'default';
  } else if (permission === 'denied') {
    btn.style.display = 'none';
  } else {
    btn.textContent = '🔔 Notificări';
    btn.style.color = '';
    btn.style.borderColor = '';
    btn.onclick = requestNotifPermission;
  }
}

function initNotifButton() {
  const btn = document.getElementById('notif-btn');
  if (!btn) return;
  if (!('Notification' in window)) { btn.style.display = 'none'; return; }
  btn.style.display = '';
  updateNotifButton(Notification.permission);
}

function startRealtimeListener() {
  if (!sb) return;
  if (realtimeChannel) {
    console.log('[Realtime] Channel deja activ, skip.');
    return;
  }

  console.log('[Realtime] Pornire canal complaints...');
  realtimeChannel = sb
    .channel('complaints-realtime', { config: { broadcast: { self: false } } })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'complaints' }, payload => {
      console.log('[Realtime] Sesizare nouă primită:', payload.new);
      handleNewComplaint(payload.new);
    })
    .subscribe(status => {
      console.log('[Realtime] Status:', status);
      if (status === 'SUBSCRIBED') {
        console.log('[Realtime] ✅ Conectat și ascultă sesizări noi.');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        console.warn('[Realtime] ⚠️ Canal căzut:', status, '— reîncercare în 5s...');
        realtimeChannel = null;
        setTimeout(() => {
          getSession().then(session => {
            if (session && parseHash() === 'admin') startRealtimeListener();
          });
        }, 5000);
      }
    });
}

function stopRealtimeListener() {
  if (realtimeChannel && sb) {
    const ch = realtimeChannel;
    realtimeChannel = null;
    sb.removeChannel(ch).then(() => console.log('[Realtime] Canal oprit.'));
  }
}

function handleNewComplaint(complaint) {
  const type = complaint.complaint_type || 'Sesizare';
  const desc = (complaint.description || '').substring(0, 80);
  const body = `${type}${desc ? ': ' + desc : ''}`;

  showToast('🚗 Sesizare Nouă!', body);

  if (Notification.permission === 'granted') {
    sendSystemNotif('🚗 Sesizare Nouă!', body);
  }
  if (parseHash() === 'admin') {
    loadComplaints();
  }
}

function sendSystemNotif(title, body) {
  if (swRegistration && swRegistration.active) {
    swRegistration.active.postMessage({
      type: 'SHOW_NOTIFICATION',
      title,
      body,
      url: location.origin + location.pathname + '#admin'
    });
  } else if (Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: 'new-complaint-' + Date.now()
    });
  }
}

function showToast(title, msg) {
  const toast = document.getElementById('notif-toast');
  if (!toast) return;
  const titleEl = toast.querySelector('.toast-title');
  const msgEl = document.getElementById('toast-msg-text');
  const timeEl = document.getElementById('toast-msg-time');
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = msg;
  if (timeEl) timeEl.textContent = new Date().toLocaleTimeString('ro-RO');

  toast.classList.add('show');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => closeToast(), 7000);
}

function closeToast() {
  const toast = document.getElementById('notif-toast');
  if (toast) toast.classList.remove('show');
  if (toastTimeout) clearTimeout(toastTimeout);
}

const _origNavigate = navigate;
window.navigate = function (page) {
  _origNavigate(page);
  if (page === 'admin') {
    initNotifButton();
    startRealtimeListener();
  } else if (page !== 'login') {
    stopRealtimeListener();
  }
};

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && parseHash() === 'admin') {
    getSession().then(session => {
      if (session && sb && !realtimeChannel) {
        console.log('[Realtime] Reconectare după revenire în prim-plan.');
        startRealtimeListener();
      }
    });
  }
});

registerSW();

/**
 * auth.js — Autenticação e controle de sessão
 */

const Auth = (() => {

  const SESSION_KEY = 'mnt_session';
  const TOKEN_KEY   = 'token';

  function getSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
  }

  function setSession(userData, token) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(userData));
    sessionStorage.setItem(TOKEN_KEY, token);
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  }

  async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function requireAuth(allowedRoles = []) {
    const session = getSession();
    if (!session) { window.location.href = 'index.html'; return null; }
    if (allowedRoles.length && !allowedRoles.includes(session.perfil)) {
      window.location.href = 'app.html';
      return null;
    }
    return session;
  }

  function initUserUI(session) {
    const nameEl  = document.getElementById('user-name');
    const roleEl  = document.getElementById('user-role');
    const avatarEl = document.getElementById('user-avatar');
    if (nameEl) nameEl.textContent = session.nome;
    if (roleEl) roleEl.textContent = { admin: 'Administrador', supervisor: 'Supervisor', tecnico: 'Técnico' }[session.perfil] || session.perfil;
    if (avatarEl) avatarEl.textContent = session.nome.split(' ').slice(0,2).map(p => p[0]).join('').toUpperCase();
  }

  return { getSession, setSession, clearSession, sha256, requireAuth, initUserUI };
})();

// ── Login page ──────────────────────────────────────────────────
if (document.getElementById('login-form')) {
  (async () => {
    // Se já tem sessão, redireciona
    const session = Auth.getSession();
    if (session) {
      window.location.href = 'home.html';
    }

    const form    = document.getElementById('login-form');
    const errEl   = document.getElementById('login-error');
    const btnEl   = document.getElementById('btn-login');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errEl.textContent = '';
      const usuario = document.getElementById('usuario').value.trim();
      const senha   = document.getElementById('senha').value;
      if (!usuario || !senha) { errEl.textContent = 'Preencha todos os campos.'; return; }

      btnEl.disabled = true;
      btnEl.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span> Entrando...';

      try {
        const res  = await API.login(usuario, senha);
        Auth.setSession(res.usuario, res.token);
        window.location.href = 'home.html';
      } catch (err) {
        errEl.textContent = 'Usuário ou senha inválidos.';
        btnEl.disabled = false;
        btnEl.innerHTML = 'Entrar';
      }
    });
  })();
}

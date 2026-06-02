/**
 * utils.js — Funções auxiliares globais
 */

const Utils = (() => {

  // ── Formatação de datas ──
  function fmtDate(str) {
    if (!str) return '—';
    const d = new Date(str);
    return isNaN(d) ? str : d.toLocaleDateString('pt-BR');
  }

  function fmtDateTime(str) {
    if (!str) return '—';
    const d = new Date(str);
    return isNaN(d) ? str : d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  }

  function fmtTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map(v => String(v).padStart(2,'0')).join(':');
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function weekRange(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(d.setDate(diff));
    const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
    return { start: mon.toISOString().slice(0,10), end: fri.toISOString().slice(0,10) };
  }

  // ── Strings ──
  function initials(name = '') {
    return name.split(' ').slice(0,2).map(p => p[0]).join('').toUpperCase();
  }

  function slugify(str) {
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
  }

  function truncate(str, len = 60) {
    return str && str.length > len ? str.slice(0, len) + '…' : str;
  }

  // ── DOM ──
  function el(id) { return document.getElementById(id); }

  function show(id) { const e = el(id); if (e) e.classList.remove('hidden'); }
  function hide(id) { const e = el(id); if (e) e.classList.add('hidden'); }

  function setHTML(id, html) { const e = el(id); if (e) e.innerHTML = html; }

  function showLoading(msg = 'Carregando...') {
    let ov = document.getElementById('global-loading');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'global-loading';
      ov.className = 'loading-overlay';
      ov.innerHTML = `<div class="spinner" style="width:32px;height:32px;border-width:3px;"></div><p>${msg}</p>`;
      document.body.appendChild(ov);
    }
    ov.querySelector('p').textContent = msg;
    ov.style.display = 'flex';
  }

  function hideLoading() {
    const ov = document.getElementById('global-loading');
    if (ov) ov.style.display = 'none';
  }

  // ── Toast ──
  function toast(msg, type = 'info', duration = 3500) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    container.appendChild(t);
    setTimeout(() => t.remove(), duration);
  }

  // ── Modal ──
  function openModal(id) {
    const m = el(id);
    if (!m) return;
    m.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeModal(id) {
    const m = el(id);
    if (!m) return;
    m.style.display = 'none';
    document.body.style.overflow = '';
  }

  // ── Arquivo para base64 ──
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ── Badge de status ──
  function statusBadge(status) {
    const map = {
      concluida:        ['badge-success', 'Concluída'],
      nao_realizada:    ['badge-danger', 'Não realizada'],
      parcial:          ['badge-warning', 'Parcial'],
      pendente:         ['badge-warning', 'Pendente'],
      fora_programacao: ['badge-info', 'Fora programação'],
      ver_e_agir:       ['badge', 'Ver e Agir'],
    };
    const [cls, label] = map[status] || ['badge-gray', status];
    return `<span class="badge ${cls}">${label}</span>`;
  }

  function tipoBadge(tipo) {
    const map = {
      programada:       ['badge-primary', 'Programada'],
      fora_programacao: ['badge-info', 'Fora prog.'],
      ver_e_agir:       ['badge', 'Ver e Agir'],
    };
    const [cls, label] = map[tipo] || ['badge-gray', tipo];
    return `<span class="badge ${cls}">${label}</span>`;
  }

  function prioridadeBadge(p) {
    const map = { Alta: 'badge-danger', Normal: 'badge-gray', Urgente: 'badge-danger' };
    return `<span class="badge ${map[p] || 'badge-gray'}">${p}</span>`;
  }

  // ── Confirmar ──
  function confirm(msg) { return window.confirm(msg); }

  // ── Sidebar mobile ──
  function initSidebar() {
    const sidebar  = document.querySelector('.sidebar');
    const overlay  = document.querySelector('.sidebar-overlay');
    const hamburger = document.querySelector('.topbar-hamburger');
    if (!sidebar) return;
    hamburger?.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay?.classList.toggle('show');
    });
    overlay?.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
    });
    // logout
    document.querySelectorAll('.logout-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        Auth.clearSession();
        window.location.href = 'index.html';
      });
    });
  }

  // ── Número formatado ──
  function fmtHH(h) { return parseFloat(h || 0).toFixed(1) + ' h'; }

  return {
    fmtDate, fmtDateTime, fmtTime, todayISO, weekRange,
    initials, slugify, truncate,
    el, show, hide, setHTML,
    showLoading, hideLoading,
    toast, openModal, closeModal,
    fileToBase64,
    statusBadge, tipoBadge, prioridadeBadge,
    confirm, initSidebar, fmtHH,
  };
})();

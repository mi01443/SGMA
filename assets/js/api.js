/**
 * api.js — Comunicação com Google Apps Script
 * Todas as chamadas ao backend passam por este módulo.
 *
 * CONFIGURAÇÃO: defina a URL do seu Apps Script deployado em CONFIG abaixo.
 */

const API = (() => {

  // ── CONFIGURAÇÃO ──────────────────────────────────────────────
  const CONFIG = {
    // Após publicar o Apps Script como Web App, cole a URL aqui:
    SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzDl8dmoi22hCgoLrEuAkHnnv2y0voigAHrQvfg94DECR1bMzeEeFvbPvfmLRnkHOv8sA/exec',

    // ID da planilha do Google Sheets
    SHEET_ID: '1_PB62JPwuM-uRA-_4T6T25JQHny4AKOfr71RcJ43Tds',

    // ID da pasta raiz no Google Drive
    DRIVE_ROOT_ID: '1rwfnNUfV_R9ts2mSf7WcMYrX7TeTS0no',
  };
  // ──────────────────────────────────────────────────────────────

  const token = () => sessionStorage.getItem('token') || '';

  async function request(action, params = {}, method = 'GET') {
    const url = new URL(CONFIG.SCRIPT_URL);
    url.searchParams.set('action', action);
    url.searchParams.set('token', token());

    const opts = { method };

    if (method === 'GET') {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    } else {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify({ ...params, token: token() });
    }

    const res = await fetch(url.toString(), opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  return {
    CONFIG,

    // ── Auth ──
    login: (usuario, senhaHash) =>
      request('login', { usuario, senhaHash }, 'POST'),

    // ── Atividades ──
    getAtividades: (filtros = {}) =>
      request('getAtividades', filtros, 'GET'),

    saveAtividade: (dados) =>
      request('saveAtividade', dados, 'POST'),

    deleteAtividade: (id) =>
      request('deleteAtividade', { id }, 'POST'),

    importAtividades: (lista) =>
      request('importAtividades', { lista }, 'POST'),

    // ── Passos / checklist ──
    updatePasso: (atividadeId, passoId, concluido) =>
      request('updatePasso', { atividadeId, passoId, concluido }, 'POST'),

    // ── Execuções ──
    saveExecucao: (dados) =>
      request('saveExecucao', dados, 'POST'),

    getExecucoes: (filtros = {}) =>
      request('getExecucoes', filtros, 'GET'),

    // ── Fotos ──
    uploadFoto: (base64, mimeType, equipamentoId, atividadeId, lado) =>
      request('uploadFoto', { base64, mimeType, equipamentoId, atividadeId, lado }, 'POST'),

    // ── Equipamentos ──
    getEquipamentos: () =>
      request('getEquipamentos', {}, 'GET'),

    saveEquipamento: (dados) =>
      request('saveEquipamento', dados, 'POST'),

    toggleEquipamento: (id, ativo) =>
      request('toggleEquipamento', { id, ativo }, 'POST'),

    // ── Profissionais ──
    getProfissionais: () =>
      request('getProfissionais', {}, 'GET'),

    saveProfissional: (dados) =>
      request('saveProfissional', dados, 'POST'),

    toggleProfissional: (id, ativo) =>
      request('toggleProfissional', { id, ativo }, 'POST'),

    // ── Semanas ──
    getSemanas: () =>
      request('getSemanas', {}, 'GET'),

    getSemana: (id) =>
      request('getSemana', { id }, 'GET'),

    saveSemana: (dados) =>
      request('saveSemana', dados, 'POST'),

    // ── Motivos ──
    getMotivos: () =>
      request('getMotivos', {}, 'GET'),

    saveMotivo: (dados) =>
      request('saveMotivo', dados, 'POST'),

    deleteMotivo: (id) =>
      request('deleteMotivo', { id }, 'POST'),

    // ── Relatório ──
    getRelatorio: (filtros = {}) =>
      request('getRelatorio', filtros, 'GET'),

    gerarPDF: (filtros = {}) =>
      request('gerarPDF', filtros, 'POST'),
  };
})();

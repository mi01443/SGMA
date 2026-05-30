/**
 * api.js — Comunicação com Google Apps Script
 * TODAS as requisições usam GET para evitar CORS preflight.
 *
 * CONFIGURAÇÃO: preencha SCRIPT_URL com a URL do seu Apps Script deployado.
 */

const API = (() => {

  // ── CONFIGURAÇÃO ──────────────────────────────────────────────
  const CONFIG = {
    SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyZhZqQ3fmQ2wU_BZeDubfdTXSniZqaBNYXVRP9Eko6IR2T2XMTi3DPqk-9W1SUjKbb4g/exec',
  };
  // ──────────────────────────────────────────────────────────────

  const token = () => sessionStorage.getItem('token') || '';

  async function request(action, params = {}) {
    const url = new URL(CONFIG.SCRIPT_URL);
    url.searchParams.set('action', action);
    url.searchParams.set('token', token());

    // Serializa cada parâmetro — objetos/arrays viram JSON string
    Object.entries(params).forEach(([k, v]) => {
      url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : v);
    });

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  return {
    CONFIG,

    // ── Auth ──
    login: (usuario, senha) =>
      request('login', { usuario, senha }),

    // ── Atividades ──
    getAtividades: (filtros = {}) =>
      request('getAtividades', filtros),

    saveAtividade: (dados) =>
      request('saveAtividade', dados),

    deleteAtividade: (id) =>
      request('deleteAtividade', { id }),

    importAtividades: (lista) =>
      request('importAtividades', { lista: JSON.stringify(lista) }),

    // ── Passos / checklist ──
    updatePasso: (atividadeId, passoId, concluido) =>
      request('updatePasso', { atividadeId, passoId, concluido }),

    // ── Execuções ──
    saveExecucao: (dados) =>
      request('saveExecucao', dados),

    getExecucoes: (filtros = {}) =>
      request('getExecucoes', filtros),

    // ── Fotos ──
    uploadFoto: (base64, mimeType, equipamentoId, atividadeId, lado) =>
      request('uploadFoto', { base64, mimeType, equipamentoId, atividadeId, lado }),

    // ── Equipamentos ──
    getEquipamentos: () =>
      request('getEquipamentos'),

    saveEquipamento: (dados) =>
      request('saveEquipamento', dados),

    toggleEquipamento: (id, ativo) =>
      request('toggleEquipamento', { id, ativo }),

    // ── Profissionais ──
    getProfissionais: () =>
      request('getProfissionais'),

    saveProfissional: (dados) =>
      request('saveProfissional', dados),

    toggleProfissional: (id, ativo) =>
      request('toggleProfissional', { id, ativo }),

    // ── Semanas ──
    getSemanas: () =>
      request('getSemanas'),

    getSemana: (id) =>
      request('getSemana', { id }),

    saveSemana: (dados) =>
      request('saveSemana', dados),

    // ── Motivos ──
    getMotivos: () =>
      request('getMotivos'),

    saveMotivo: (dados) =>
      request('saveMotivo', dados),

    deleteMotivo: (id) =>
      request('deleteMotivo', { id }),

    // ── Relatório ──
    getRelatorio: (filtros = {}) =>
      request('getRelatorio', filtros),

    gerarPDF: (filtros = {}) =>
      request('gerarPDF', filtros),
  };
})();

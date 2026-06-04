/**
 * api.js — Comunicação com Google Apps Script
 * TODAS as requisições usam GET para evitar CORS preflight.
 *
 * CONFIGURAÇÃO: preencha SCRIPT_URL com a URL do seu Apps Script deployado.
 */

const API = (() => {

  // ── CONFIGURAÇÃO ──────────────────────────────────────────────
  const CONFIG = {
    SCRIPT_URL:    'https://script.google.com/macros/s/AKfycbyK1rJcdU45kgzGn17CxF7I1iZ9PLVBA4u0ijybCx_6yhxITbyC_8adXcJz38H4W2yedg/exec',
    PA_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbybesfaHL_c1NX6KT8xS9vhK9x6p01aIHEuhVwFKS6srSWxzvhAai9W0P3GSwCqZzxMsw/exec',
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

  // Requisição para a planilha do Plano de Ação (separada)
  async function paRequest(action, params = {}) {
    const url = new URL(CONFIG.PA_SCRIPT_URL);
    url.searchParams.set('action', action);
    url.searchParams.set('token', token());
    Object.entries(params).forEach(([k, v]) => {
      url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : v);
    });
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error('HTTP ' + res.status);
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

    // ── Progresso ──
    saveProgresso: (dados) =>
      request('saveProgresso', dados),

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

    // ── Sub Sistemas ──
    getSubSistemas: (equipamentoId) =>
      request('getSubSistemas', equipamentoId ? { equipamentoId } : {}),

    saveSubSistema: (dados) =>
      request('saveSubSistema', dados),

    deletarSubSistema: (id) =>
      request('deletarSubSistema', { id }),

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

    deletarProfissional: (id) =>
      request('deletarProfissional', { id }),

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

    // ── Plano de Ação (planilha separada — PA_SCRIPT_URL) ──
    getPlanos: () =>
      paRequest('getPlanos'),

    savePlano: (dados) =>
      paRequest('savePlano', dados),

    mudarStatusPlano: (dados) =>
      paRequest('mudarStatusPlano', dados),

    encerrarPlano: (dados) =>
      paRequest('encerrarPlano', dados),

    getAtividadesPA: (filtros = {}) =>
      paRequest('getAtividadesPA', filtros),

    saveAtividadePA: (dados) =>
      paRequest('saveAtividadePA', { ...dados, _supervisor: 'true' }),

    registrarProgressoPA: (dados) =>
      paRequest('registrarProgressoPA', dados),

    deletarAtividadePA: (id) =>
      paRequest('deletarAtividadePA', { id }),

    getAprovacoesPA: () =>
      paRequest('getAprovacoesPA'),

    registrarAprovacaoPA: (dados) =>
      paRequest('registrarAprovacaoPA', dados),

    uploadFotoPA: (base64, mimeType, planoId) =>
      paRequest('uploadFotoPA', { base64, mimeType, planoId }),

    setupPA: () =>
      paRequest('setupPA'),

    // ── Relatório ──
    getRelatorio: (filtros = {}) =>
      request('getRelatorio', filtros),

    gerarPDF: (filtros = {}) =>
      request('gerarPDF', filtros),
  };
})();

/**
 * GestManu — Google Apps Script Backend
 * Deploy: Extensões → Apps Script → Publicar → Implantar como Web App
 *   - Executar como: "Eu" (sua conta Google)
 *   - Acesso: "Qualquer pessoa"
 *
 * Após publicar, copie a URL gerada para API_CONFIG.SCRIPT_URL em assets/js/api.js
 */

// ════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO — ajuste os IDs abaixo
// ════════════════════════════════════════════════════════════════
const CFG = {
  SHEET_ID:      'SEU_GOOGLE_SHEET_ID',
  DRIVE_ROOT_ID: 'SEU_DRIVE_FOLDER_ID',  // pasta raiz "Manutenção" no Drive
  TOKEN_SECRET:  'TROQUE_POR_STRING_ALEATORIA', // string aleatória para assinar tokens
};

// ════════════════════════════════════════════════════════════════
// ENTRYPOINTS
// ════════════════════════════════════════════════════════════════

function doGet(e)  { return handle(e); }
function doPost(e) { return handle(e); }

function handle(e) {
  try {
    const params = e.parameter || {};
    const body   = e.postData?.contents ? JSON.parse(e.postData.contents) : {};
    const merged = { ...params, ...body };
    const action = merged.action;

    // login não precisa de token
    if (action !== 'login') verifyToken(merged.token);

    const result = dispatch(action, merged);
    return jsonOk(result);
  } catch (err) {
    return jsonErr(err.message);
  }
}

function dispatch(action, p) {
  switch (action) {
    // Auth
    case 'login':           return login(p);

    // Atividades
    case 'getAtividades':   return getAtividades(p);
    case 'saveAtividade':   return saveAtividade(p);
    case 'deleteAtividade': return deleteAtividade(p);
    case 'importAtividades':return importAtividades(p);
    case 'updatePasso':     return updatePasso(p);

    // Execuções
    case 'saveExecucao':    return saveExecucao(p);
    case 'getExecucoes':    return getExecucoes(p);

    // Upload foto
    case 'uploadFoto':      return uploadFoto(p);

    // Equipamentos
    case 'getEquipamentos': return getEquipamentos(p);
    case 'saveEquipamento': return saveEquipamento(p);
    case 'toggleEquipamento':return toggleEquipamento(p);

    // Profissionais
    case 'getProfissionais':return getProfissionais(p);
    case 'saveProfissional':return saveProfissional(p);
    case 'toggleProfissional':return toggleProfissional(p);

    // Semanas
    case 'getSemanas':      return getSemanas(p);
    case 'getSemana':       return getSemana(p);
    case 'saveSemana':      return saveSemana(p);

    // Motivos
    case 'getMotivos':      return getMotivos(p);
    case 'saveMotivo':      return saveMotivo(p);
    case 'deleteMotivo':    return deleteMotivo(p);

    // Relatório
    case 'getRelatorio':    return getRelatorio(p);
    case 'gerarPDF':        return gerarPDF(p);

    default: throw new Error('Ação desconhecida: ' + action);
  }
}

// ════════════════════════════════════════════════════════════════
// HELPERS — Sheets
// ════════════════════════════════════════════════════════════════

function getSheet(name) {
  const ss = SpreadsheetApp.openById(CFG.SHEET_ID);
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function sheetToObjects(name) {
  const sh = getSheet(name);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function appendRow(name, obj) {
  const sh = getSheet(name);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const row = headers.map(h => obj[h] !== undefined ? obj[h] : '');
  sh.appendRow(row);
}

function updateRowById(name, id, updates) {
  const sh = getSheet(name);
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const idCol   = headers.indexOf('id');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      Object.entries(updates).forEach(([key, val]) => {
        const col = headers.indexOf(key);
        if (col >= 0) sh.getRange(i + 1, col + 1).setValue(val);
      });
      return true;
    }
  }
  return false;
}

function deleteRowById(name, id) {
  const sh = getSheet(name);
  const data = sh.getDataRange().getValues();
  const idCol = data[0].indexOf('id');
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][idCol]) === String(id)) { sh.deleteRow(i + 1); return true; }
  }
  return false;
}

function genId(prefix) {
  return prefix + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,5).toUpperCase();
}

// ════════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════════

function login(p) {
  const users = sheetToObjects('usuarios');
  const user  = users.find(u =>
    (u.email === p.usuario || u.usuario === p.usuario) &&
    u.senha_hash === p.senhaHash &&
    u.ativo == 'true'
  );
  if (!user) throw new Error('Credenciais inválidas');

  const token = Utilities.base64Encode(
    JSON.stringify({ id: user.id, perfil: user.perfil, exp: Date.now() + 8*3600*1000 })
  );
  return { usuario: { id: user.id, nome: user.nome, email: user.email, perfil: user.perfil }, token };
}

function verifyToken(token) {
  if (!token) throw new Error('Token ausente');
  try {
    const payload = JSON.parse(Utilities.newBlob(Utilities.base64Decode(token)).getDataAsString());
    if (payload.exp < Date.now()) throw new Error('Token expirado');
    return payload;
  } catch { throw new Error('Token inválido'); }
}

// ════════════════════════════════════════════════════════════════
// ATIVIDADES
// ════════════════════════════════════════════════════════════════

function getAtividades(p) {
  let atividades = sheetToObjects('atividades');
  const passos   = sheetToObjects('passos_atividade');
  const equips   = sheetToObjects('equipamentos');
  const profs    = sheetToObjects('usuarios');

  if (p.tecnicoId) atividades = atividades.filter(a => a.tecnico_id === p.tecnicoId);
  if (p.semanaId)  atividades = atividades.filter(a => a.semana_id  === p.semanaId);
  if (p.tipo)      atividades = atividades.filter(a => a.tipo       === p.tipo);

  return { atividades: atividades.map(a => ({
    ...a,
    equipamento_nome: equips.find(e => e.id === a.equipamento_id)?.nome || '',
    equip_tag:        equips.find(e => e.id === a.equipamento_id)?.tag  || '',
    area:             equips.find(e => e.id === a.equipamento_id)?.area || '',
    tecnico_nome:     profs.find(u  => u.id === a.tecnico_id)?.nome || '',
    passos:           passos.filter(p => p.atividade_id === a.id).sort((a,b) => a.ordem - b.ordem)
      .map(p => ({ ...p, concluido: p.concluido === 'true' || p.concluido === true })),
  }))};
}

function saveAtividade(p) {
  const isNew = !p.id;
  const id    = isNew ? genId('AT') : p.id;
  const passos = typeof p.passos === 'string' ? JSON.parse(p.passos) : (p.passos || []);

  const ativ = {
    id, semana_id: p.semanaId || '', equipamento_id: p.equipamentoId,
    descricao: p.descricao, tipo: p.tipo || 'programada',
    tecnico_id: p.tecnicoId || '', hh_estimado: p.hhEstimado || 1,
    data_programada: p.dataProgramada || '', prioridade: p.prioridade || 'Normal',
    status: p.status || 'pendente', ordem: p.ordem || '',
  };

  if (isNew) {
    ensureHeaders('atividades', Object.keys(ativ));
    appendRow('atividades', ativ);
    // Salvar passos
    passos.forEach((desc, i) => {
      const passo = {
        id: genId('PS'), atividade_id: id, ordem: i + 1,
        descricao: typeof desc === 'string' ? desc : desc.descricao,
        concluido: false, concluido_em: '', concluido_por: '',
      };
      ensureHeaders('passos_atividade', Object.keys(passo));
      appendRow('passos_atividade', passo);
    });
  } else {
    updateRowById('atividades', id, ativ);
    // Remover passos antigos e recriar
    if (passos.length) {
      const sh = getSheet('passos_atividade');
      const data = sh.getDataRange().getValues();
      const atCol = data[0].indexOf('atividade_id');
      for (let i = data.length - 1; i >= 1; i--) {
        if (data[i][atCol] === id) sh.deleteRow(i + 1);
      }
      passos.forEach((desc, i) => {
        const passo = {
          id: genId('PS'), atividade_id: id, ordem: i + 1,
          descricao: typeof desc === 'string' ? desc : desc.descricao,
          concluido: false, concluido_em: '', concluido_por: '',
        };
        appendRow('passos_atividade', passo);
      });
    }
  }
  return { id, ok: true };
}

function deleteAtividade(p) {
  deleteRowById('atividades', p.id);
  // remover passos
  const sh = getSheet('passos_atividade');
  const data = sh.getDataRange().getValues();
  const col  = data[0].indexOf('atividade_id');
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][col] === p.id) sh.deleteRow(i + 1);
  }
  return { ok: true };
}

function importAtividades(p) {
  const lista  = typeof p.lista === 'string' ? JSON.parse(p.lista) : p.lista;
  const equips = sheetToObjects('equipamentos');
  const profs  = sheetToObjects('usuarios');
  let criadas  = 0;

  lista.forEach(item => {
    const eq   = equips.find(e => e.nome.toLowerCase().includes((item.equipamentoRef||'').toLowerCase()) || e.tag.toLowerCase() === (item.equipamentoRef||'').toLowerCase());
    const prof = profs.find(u  => u.nome.toLowerCase().includes((item.tecnicoRef||'').toLowerCase()) || u.id === item.tecnicoRef);
    if (!item.descricao) return;
    saveAtividade({
      tipo:           item.tipo || 'programada',
      semanaId:       item.semanaId || '',
      equipamentoId:  eq?.id  || '',
      descricao:      item.descricao,
      tecnicoId:      prof?.id || item.tecnicoRef || '',
      dataProgramada: item.dataProgramada || '',
      hhEstimado:     parseFloat(item.hhEstimado) || 1,
      prioridade:     item.prioridade || 'Normal',
      passos:         [],
    });
    criadas++;
  });

  return { criadas, ok: true };
}

function updatePasso(p) {
  const payload = verifyToken(p.token);
  updateRowById('passos_atividade', p.passoId, {
    concluido:    p.concluido === 'true' || p.concluido === true,
    concluido_em: p.concluido ? new Date().toISOString() : '',
    concluido_por: payload.id,
  });
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════
// EXECUÇÕES
// ════════════════════════════════════════════════════════════════

function saveExecucao(p) {
  const id = genId('EX');
  const now = new Date().toISOString();
  const exec = {
    id, atividade_id: p.atividadeId, tecnico_id: p.tecnicoId,
    status: p.status, dt_inicio: p.dtInicio || now, dt_fim: now,
    hh_real: p.hhReal || 0, observacao: p.obs || '',
    motivo_id: p.motivoId || '',
    foto_antes_1: (p.fotosAntes && p.fotosAntes[0]) || '',
    foto_antes_2: (p.fotosAntes && p.fotosAntes[1]) || '',
    foto_antes_3: (p.fotosAntes && p.fotosAntes[2]) || '',
    foto_antes_4: (p.fotosAntes && p.fotosAntes[3]) || '',
    foto_depois_1: (p.fotosDepois && p.fotosDepois[0]) || '',
    foto_depois_2: (p.fotosDepois && p.fotosDepois[1]) || '',
    foto_depois_3: (p.fotosDepois && p.fotosDepois[2]) || '',
    foto_depois_4: (p.fotosDepois && p.fotosDepois[3]) || '',
  };
  ensureHeaders('execucoes', Object.keys(exec));
  appendRow('execucoes', exec);
  updateRowById('atividades', p.atividadeId, { status: p.status });
  return { id, ok: true };
}

function getExecucoes(p) {
  let execs  = sheetToObjects('execucoes');
  const ativs = sheetToObjects('atividades');
  const equips = sheetToObjects('equipamentos');
  const profs  = sheetToObjects('usuarios');
  const motivos = sheetToObjects('motivos_nao_execucao');

  if (p.tecnicoId) execs = execs.filter(e => e.tecnico_id === p.tecnicoId);

  return { execucoes: execs.map(ex => {
    const at  = ativs.find(a => a.id === ex.atividade_id);
    const eq  = equips.find(e => e.id === at?.equipamento_id);
    const tec = profs.find(u => u.id === ex.tecnico_id);
    const mot = motivos.find(m => m.id === ex.motivo_id);
    return {
      ...ex,
      atividade_desc: at?.descricao || '',
      equipamento_nome: eq?.nome || '',
      equip_tag: eq?.tag || '',
      tecnico_nome: tec?.nome || '',
      motivo_desc: mot?.descricao || '',
      fotos_antes:  [ex.foto_antes_1, ex.foto_antes_2, ex.foto_antes_3, ex.foto_antes_4].filter(Boolean),
      fotos_depois: [ex.foto_depois_1,ex.foto_depois_2,ex.foto_depois_3,ex.foto_depois_4].filter(Boolean),
    };
  })};
}

// ════════════════════════════════════════════════════════════════
// UPLOAD DE FOTO
// ════════════════════════════════════════════════════════════════

function uploadFoto(p) {
  const equips = sheetToObjects('equipamentos');
  const eq     = equips.find(e => e.id === p.equipamentoId);

  // Pasta do equipamento
  let rootFolder = DriveApp.getFolderById(CFG.DRIVE_ROOT_ID);
  let eqFolder;
  const eqFolderName = (eq?.tag || p.equipamentoId) + '_' + (eq?.nome || '');

  const eqFolders = rootFolder.getFoldersByName(eqFolderName);
  if (eqFolders.hasNext()) {
    eqFolder = eqFolders.next();
  } else {
    eqFolder = rootFolder.createFolder(eqFolderName);
    if (eq) updateRowById('equipamentos', eq.id, { drive_folder_id: eqFolder.getId() });
  }

  // Subpasta por data + atividade
  const subName = new Date().toISOString().slice(0,10) + '_' + (p.atividadeId || 'sem-at');
  let subFolder;
  const subs = eqFolder.getFoldersByName(subName);
  subFolder   = subs.hasNext() ? subs.next() : eqFolder.createFolder(subName);

  // Salvar arquivo
  const bytes    = Utilities.base64Decode(p.base64);
  const blob     = Utilities.newBlob(bytes, p.mimeType || 'image/jpeg');
  const ext      = (p.mimeType || '').includes('png') ? '.png' : '.jpg';
  const filename = p.lado + '_' + Date.now() + ext;
  const file     = subFolder.createFile(blob.setName(filename));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return { url: 'https://drive.google.com/uc?id=' + file.getId(), fileId: file.getId() };
}

// ════════════════════════════════════════════════════════════════
// EQUIPAMENTOS
// ════════════════════════════════════════════════════════════════

function getEquipamentos() {
  return { equipamentos: sheetToObjects('equipamentos').filter(e => e.ativo !== 'false') };
}

function saveEquipamento(p) {
  const isNew = !p.id;
  const id    = isNew ? genId('EQ') : p.id;
  const eq = { id, nome: p.nome, tag: p.tag, area: p.area || '', categoria: p.categoria || '', drive_folder_id: p.drive_folder_id || '', ativo: true };
  if (isNew) { ensureHeaders('equipamentos', Object.keys(eq)); appendRow('equipamentos', eq); }
  else        updateRowById('equipamentos', id, eq);
  return { id, ok: true };
}

function toggleEquipamento(p) {
  updateRowById('equipamentos', p.id, { ativo: p.ativo === 'true' || p.ativo === true });
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════
// PROFISSIONAIS
// ════════════════════════════════════════════════════════════════

function getProfissionais() {
  return { profissionais: sheetToObjects('usuarios') };
}

function saveProfissional(p) {
  const isNew = !p.id;
  const id    = isNew ? genId('US') : p.id;
  const user  = { id, nome: p.nome, email: p.email || '', usuario: p.usuario || p.email || '', perfil: p.perfil || 'tecnico', hh_semana: p.hh_semana || 44, ativo: true };
  if (p.senhaHash) user.senha_hash = p.senhaHash;
  if (isNew) { ensureHeaders('usuarios', ['id','nome','email','usuario','senha_hash','perfil','hh_semana','ativo']); appendRow('usuarios', user); }
  else        updateRowById('usuarios', id, user);
  return { id, ok: true };
}

function toggleProfissional(p) {
  updateRowById('usuarios', p.id, { ativo: p.ativo === 'true' || p.ativo === true });
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════
// SEMANAS
// ════════════════════════════════════════════════════════════════

function getSemanas() {
  return { semanas: sheetToObjects('semanas').sort((a, b) => b.id.localeCompare(a.id)) };
}

function getSemana(p) {
  const semanas = sheetToObjects('semanas');
  const s = semanas.find(x => x.id === p.id);
  return { semana: s || null };
}

function saveSemana(p) {
  // ID automático se não fornecido
  let id = p.id;
  if (!id && p.data_inicio) {
    const d = new Date(p.data_inicio);
    const week = getWeekNumber(d);
    id = d.getFullYear() + '-W' + String(week).padStart(2,'0');
  }
  if (!id) id = genId('SW');

  const semana = { id, data_inicio: p.data_inicio, data_fim: p.data_fim, hh_disponivel: p.hh_disponivel || 0, hh_programado: p.hh_programado || 0, hh_realizado: 0, status: p.status || 'planejamento' };

  const existing = sheetToObjects('semanas').find(s => s.id === id);
  if (existing) updateRowById('semanas', id, semana);
  else { ensureHeaders('semanas', Object.keys(semana)); appendRow('semanas', semana); }

  return { id, ok: true };
}

function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

// ════════════════════════════════════════════════════════════════
// MOTIVOS
// ════════════════════════════════════════════════════════════════

function getMotivos() {
  let motivos = sheetToObjects('motivos_nao_execucao');
  if (!motivos.length) motivos = seedMotivos();
  return { motivos };
}

function seedMotivos() {
  const defaults = [
    { id:'M001', descricao:'Equipamento em operação',            categoria:'Disponibilidade' },
    { id:'M002', descricao:'Falta de material / peça',           categoria:'Suprimento' },
    { id:'M003', descricao:'Falta de ferramenta específica',     categoria:'Suprimento' },
    { id:'M004', descricao:'Mão de obra insuficiente',           categoria:'Recursos' },
    { id:'M005', descricao:'Documentação técnica indisponível',  categoria:'Informação' },
    { id:'M006', descricao:'Aguardando liberação do operador',   categoria:'Processo' },
    { id:'M007', descricao:'Condição de segurança não atendida', categoria:'Segurança' },
    { id:'M008', descricao:'Outros',                             categoria:'Outros' },
  ];
  ensureHeaders('motivos_nao_execucao', ['id','descricao','categoria']);
  defaults.forEach(m => appendRow('motivos_nao_execucao', m));
  return defaults;
}

function saveMotivo(p) {
  const isNew = !p.id;
  const id    = isNew ? genId('MO') : p.id;
  const mot   = { id, descricao: p.descricao, categoria: p.categoria };
  if (isNew) { ensureHeaders('motivos_nao_execucao', Object.keys(mot)); appendRow('motivos_nao_execucao', mot); }
  else         updateRowById('motivos_nao_execucao', id, mot);
  return { id, ok: true };
}

function deleteMotivo(p) {
  deleteRowById('motivos_nao_execucao', p.id);
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════
// RELATÓRIO
// ════════════════════════════════════════════════════════════════

function getRelatorio(p) {
  let ativs   = sheetToObjects('atividades');
  let execs   = sheetToObjects('execucoes');
  const equips = sheetToObjects('equipamentos');
  const profs  = sheetToObjects('usuarios');
  const motivos= sheetToObjects('motivos_nao_execucao');

  // Filtros
  if (p.semanaId)   ativs = ativs.filter(a => a.semana_id === p.semanaId);
  if (p.dataInicio) ativs = ativs.filter(a => a.data_programada >= p.dataInicio);
  if (p.dataFim)    ativs = ativs.filter(a => a.data_programada <= p.dataFim);
  if (p.tecnicoId)  ativs = ativs.filter(a => a.tecnico_id === p.tecnicoId);

  const atIds = ativs.map(a => a.id);
  execs = execs.filter(e => atIds.includes(e.atividade_id));

  function enrich(list) {
    return list.map(a => {
      const eq  = equips.find(e => e.id === a.equipamento_id) || {};
      const tec = profs.find(u => u.id === a.tecnico_id) || {};
      const ex  = execs.find(e => e.atividade_id === a.id) || {};
      const mot = motivos.find(m => m.id === ex.motivo_id) || {};
      return {
        ...a,
        equipamento_nome: eq.nome || '', equip_tag: eq.tag || '', area: eq.area || '',
        tecnico_nome: tec.nome || '',
        hh_real:      ex.hh_real || 0, obs: ex.observacao || '',
        motivo_desc:  mot.descricao || '', motivo_categoria: mot.categoria || '',
        fotos_antes:  [ex.foto_antes_1, ex.foto_antes_2, ex.foto_antes_3, ex.foto_antes_4].filter(Boolean),
        fotos_depois: [ex.foto_depois_1,ex.foto_depois_2,ex.foto_depois_3,ex.foto_depois_4].filter(Boolean),
      };
    });
  }

  const programadas        = enrich(ativs.filter(a => a.tipo === 'programada'));
  const executadasProg     = programadas.filter(a => a.status === 'concluida');
  const naoRealizadas      = programadas.filter(a => a.status === 'nao_realizada');
  const foraProgramacao    = enrich(ativs.filter(a => a.tipo === 'fora_programacao'));
  const verEAgir           = enrich(ativs.filter(a => a.tipo === 'ver_e_agir'));

  // HH da semana
  let semana = null;
  if (p.semanaId) semana = sheetToObjects('semanas').find(s => s.id === p.semanaId);
  const hhDisponivel = semana ? parseFloat(semana.hh_disponivel) || 0 : 0;
  const hhProgramado = semana ? parseFloat(semana.hh_programado) || 0 : ativs.reduce((s,a) => s + (parseFloat(a.hh_estimado)||0), 0);
  const hhRealizado  = execs.reduce((s, e) => s + (parseFloat(e.hh_real)||0), 0);

  // Análise de motivos
  const motCnt = {};
  naoRealizadas.forEach(a => {
    const key = a.motivo_desc || 'Sem motivo';
    if (!motCnt[key]) motCnt[key] = { descricao: key, categoria: a.motivo_categoria || 'Outros', quantidade: 0, hh_impacto: 0 };
    motCnt[key].quantidade++;
    motCnt[key].hh_impacto += parseFloat(a.hh_estimado) || 0;
  });
  const analiseMOtivos = Object.values(motCnt).sort((a, b) => b.quantidade - a.quantidade);

  return {
    semana, dataInicio: p.dataInicio || '', dataFim: p.dataFim || '',
    tecnico: p.tecnicoId ? (profs.find(u => u.id === p.tecnicoId)?.nome || '') : '',
    hhDisponivel, hhProgramado, hhRealizado: Math.round(hhRealizado * 100) / 100,
    totalProgramadas: programadas.length,
    totalExecutadas:  executadasProg.length,
    executadasProgramadas: executadasProg,
    naoRealizadas, foraProgramacao, verEAgir, analiseMOtivos,
  };
}

// ════════════════════════════════════════════════════════════════
// GERAR PDF
// ════════════════════════════════════════════════════════════════

function gerarPDF(p) {
  const d    = getRelatorio(p);
  const pct  = d.totalProgramadas ? Math.round(d.totalExecutadas / d.totalProgramadas * 100) : 0;

  let html = `<html><head><meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; font-size: 13px; color: #1f2937; padding: 24px; }
    h1 { font-size: 20px; color: #111; margin-bottom: 4px; }
    h2 { font-size: 15px; color: #374151; margin: 20px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    .meta { color: #6b7280; font-size: 12px; margin-bottom: 20px; }
    .kpi { display: inline-block; margin: 0 16px 16px 0; }
    .kpi-num { font-size: 22px; font-weight: bold; }
    .kpi-lbl { font-size: 11px; color: #6b7280; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    th { background: #f3f4f6; text-align: left; padding: 7px 10px; font-size: 11px; color: #6b7280; }
    td { padding: 8px 10px; border-bottom: 1px solid #f3f4f6; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 600; }
    .ok  { background: #def7ec; color: #057a55; }
    .nok { background: #fde8e8; color: #c81e1e; }
    .obs { background: #f9fafb; padding: 6px 10px; border-left: 3px solid #d1d5db; font-size: 12px; margin: 4px 0; }
    .foto { display: inline-block; width: 80px; height: 80px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; margin: 2px; }
    .foto img { width: 100%; height: 100%; object-fit: cover; }
    .motivo-bar { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
    .bar { height: 8px; background: #c81e1e; border-radius: 4px; }
  </style></head><body>`;

  html += `<h1>Relatório de Manutenção</h1>
  <div class="meta">${d.semana ? 'Semana ' + d.semana.id + ' — ' : ''}${d.dataInicio} a ${d.dataFim}
    ${d.tecnico ? ' | Técnico: ' + d.tecnico : ''} | Gerado em: ${new Date().toLocaleString('pt-BR')}</div>

  <h2>Horas-Homem</h2>
  <div>
    <div class="kpi"><div class="kpi-num">${d.hhDisponivel}h</div><div class="kpi-lbl">Disponível</div></div>
    <div class="kpi"><div class="kpi-num" style="color:#1a56db">${d.hhProgramado}h</div><div class="kpi-lbl">Programado</div></div>
    <div class="kpi"><div class="kpi-num" style="color:#057a55">${d.hhRealizado}h</div><div class="kpi-lbl">Realizado</div></div>
    <div class="kpi"><div class="kpi-num" style="color:${pct>=80?'#057a55':pct>=60?'#92400e':'#c81e1e'}">${pct}%</div><div class="kpi-lbl">Execução (${d.totalExecutadas}/${d.totalProgramadas})</div></div>
  </div>`;

  function secaoTabela(titulo, lista, badge) {
    if (!lista.length) return '';
    let s = `<h2>${titulo} (${lista.length})</h2><table><tr><th>Equipamento</th><th>Atividade</th><th>Técnico</th><th>Data</th><th>HH</th></tr>`;
    lista.forEach(a => {
      s += `<tr><td>${a.equipamento_nome} <small style="color:#6b7280">${a.equip_tag}</small></td>
        <td>${a.descricao}${a.obs ? `<div class="obs">${a.obs}</div>` : ''}</td>
        <td>${a.tecnico_nome}</td><td>${a.data_programada}</td><td>${a.hh_real || a.hh_estimado}h</td></tr>`;
      const fotos = [...(a.fotos_antes||[]).map(u=>[u,'Antes']), ...(a.fotos_depois||[]).map(u=>[u,'Depois'])];
      if (fotos.length) {
        s += `<tr><td colspan="5" style="padding:6px 10px;">${fotos.map(([u,l])=>`<div class="foto" title="${l}"><img src="${u}"></div>`).join('')}</td></tr>`;
      }
    });
    return s + '</table>';
  }

  html += secaoTabela('✅ Executadas — Programadas', d.executadasProgramadas, 'ok');

  if (d.naoRealizadas.length) {
    html += `<h2>❌ Não Realizadas (${d.naoRealizadas.length})</h2><table>
      <tr><th>Equipamento</th><th>Atividade</th><th>Técnico</th><th>Motivo</th></tr>`;
    d.naoRealizadas.forEach(a => {
      html += `<tr><td>${a.equipamento_nome} <small>${a.equip_tag}</small></td>
        <td>${a.descricao}</td><td>${a.tecnico_nome}</td>
        <td><span class="badge nok">${a.motivo_desc || '—'}</span> <small style="color:#6b7280">${a.motivo_categoria}</small></td></tr>`;
    });
    html += '</table>';
  }

  html += secaoTabela('🔧 Fora de Programação', d.foraProgramacao, 'ok');
  html += secaoTabela('👁 Ver e Agir', d.verEAgir, 'ok');

  if (d.analiseMOtivos.length) {
    const max = d.analiseMOtivos[0].quantidade;
    html += `<h2>📈 Análise de Impacto — Motivos</h2>`;
    d.analiseMOtivos.forEach(m => {
      const w = Math.round(m.quantidade / max * 200);
      html += `<div class="motivo-bar">
        <div style="min-width:240px;">${m.descricao} <small style="color:#6b7280">(${m.categoria})</small></div>
        <div class="bar" style="width:${w}px"></div>
        <div><b>${m.quantidade}x</b> <small>${m.hh_impacto.toFixed(1)}h impacto</small></div>
      </div>`;
    });
  }

  html += '</body></html>';

  // Criar arquivo no Drive
  const blob   = Utilities.newBlob(html, 'text/html', 'relatorio.html');
  const folder = DriveApp.getFolderById(CFG.DRIVE_ROOT_ID);

  let relFolder;
  const rfs = folder.getFoldersByName('Relatórios');
  relFolder  = rfs.hasNext() ? rfs.next() : folder.createFolder('Relatórios');

  const file = relFolder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return { url: file.getDownloadUrl(), fileId: file.getId(), ok: true };
}

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════

function ensureHeaders(sheetName, fields) {
  const sh = getSheet(sheetName);
  if (sh.getLastColumn() === 0 || sh.getRange(1,1).getValue() === '') {
    sh.getRange(1, 1, 1, fields.length).setValues([fields]);
  }
}

function jsonOk(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, ...data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonErr(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

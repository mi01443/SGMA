/**
 * admin.js — Painel de administração
 */

(async () => {
  const session = Auth.requireAuth(['admin', 'supervisor']);
  if (!session) return;
  Auth.initUserUI(session);
  Utils.initSidebar();

  // ── Estado global ──
  let profissionais = [];
  let equipamentos  = [];
  let semanas       = [];
  let motivos       = [];
  let atividades    = [];
  let activeTab     = 'profissionais';

  // ── Tabs ──
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('hidden', c.dataset.tab !== activeTab));
      loadTab(activeTab);
    });
  });

  // ── Helpers de data (escopo global do módulo) ──
  function toInputDate(val) {
    if (!val || String(val).trim() === '') return '';
    const s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (s.includes('T') || s.includes('Z')) {
      const d = new Date(s);
      if (!isNaN(d)) {
        return d.getUTCFullYear() + '-' +
               String(d.getUTCMonth()+1).padStart(2,'0') + '-' +
               String(d.getUTCDate()).padStart(2,'0');
      }
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      const p = s.split('/');
      return p[2]+'-'+p[1]+'-'+p[0];
    }
    return '';
  }

  function fmtDataBR(val) {
    if (!val || String(val).trim() === '') return '';
    const s = String(val).trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
    if (s.includes('T') || s.includes('Z')) {
      const d = new Date(s);
      if (!isNaN(d)) {
        return String(d.getUTCDate()).padStart(2,'0') + '/' +
               String(d.getUTCMonth()+1).padStart(2,'0') + '/' +
               d.getUTCFullYear();
      }
    }
    const parts = s.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return parts[2].slice(0,2)+'/'+parts[1]+'/'+parts[0];
    }
    return s;
  }

  // Expor globalmente para uso em onclick inline
  window.toInputDate = toInputDate;
  window.fmtDataBR   = fmtDataBR;

  async function loadTab(tab, silent = false) {
    if (!silent) Utils.showLoading();
    try {
      if (tab === 'profissionais') { await loadProfissionais(); }
      if (tab === 'equipamentos')  { await loadEquipamentos(); }
      if (tab === 'semanas')       { await loadSemanas(); }
      if (tab === 'atividades')    { await loadAtividades(); }
      if (tab === 'importar')      { renderImportar(); }
      if (tab === 'motivos')       { await loadMotivos(); }
    } catch (e) {
      if (!silent) Utils.toast('Erro ao carregar: ' + e.message, 'error');
    } finally {
      if (!silent) Utils.hideLoading();
    }
  }

  // ═══════════════════════════════════════
  // PROFISSIONAIS
  // ═══════════════════════════════════════
  async function loadProfissionais() {
    const res = await API.getProfissionais();
    profissionais = res.profissionais || [];
    renderProfissionais();
  }

  function renderProfissionais() {
    const tbody = Utils.el('prof-tbody');
    if (!tbody) return;
    if (!profissionais.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:2rem;">Nenhum profissional cadastrado</td></tr>';
      return;
    }
    tbody.innerHTML = profissionais.map(p => `
      <tr style="cursor:pointer;" onclick="openProfDetail('${p.id}')">
        <td><span class="badge badge-gray" style="font-family:var(--mono);">${p.id}</span></td>
        <td>
          <div class="fw-500">${p.nome}</div>
          <div class="text-xs text-muted">${p.email || '—'}</div>
        </td>
        <td style="font-size:.82rem;">${p.funcao || '—'}</td>
        <td><span class="badge badge-info" style="font-size:.68rem;">${p.regime || '—'}</span></td>
        <td><span class="badge ${p.perfil === 'admin' ? 'badge-danger' : p.perfil === 'supervisor' ? 'badge-primary' : 'badge-gray'}">${p.perfil}</span></td>
        <td>
          <label class="toggle" onclick="event.stopPropagation()">
            <input type="checkbox" ${String(p.ativo).toLowerCase() !== 'false' ? 'checked' : ''} onchange="toggleProf('${p.id}', this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </td>
        <td>
          <button class="btn btn-ghost btn-sm btn-icon" onclick="event.stopPropagation();openProfModal('${p.id}')" title="Editar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
        </td>
      </tr>`).join('');

  // Highlight da linha selecionada
  tbody.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('mouseenter', () => tr.style.background = 'var(--primary-light)');
    tr.addEventListener('mouseleave', () => tr.style.background = '');
  });
  }

  // Converte qualquer formato de data para YYYY-MM-DD (para input type=date)
  window.openProfDetail = (id) => {
    const p = profissionais.find(x => x.id === id);
    if (!p) return;

    const isAtivo = String(p.ativo).toLowerCase() !== 'false';
    const initials = p.nome ? p.nome.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase() : '??';

    Utils.el('pd-avatar').textContent   = initials;
    Utils.el('pd-nome').textContent     = p.nome || '—';
    Utils.el('pd-funcao').textContent   = p.funcao || '—';
    Utils.el('pd-badges').innerHTML = `
      <span class="badge ${p.perfil==='admin'?'badge-danger':p.perfil==='supervisor'?'badge-primary':'badge-gray'}" style="margin-right:4px;">${p.perfil}</span>
      <span class="badge badge-info">${p.regime || '—'}</span>
      <span class="badge ${isAtivo?'badge-success':'badge-danger'}" style="margin-left:4px;">${isAtivo?'Ativo':'Inativo'}</span>`;

    const row = (label, val) => val
      ? `<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid var(--gray-100);">
           <span style="color:var(--gray-500);font-size:.775rem;">${label}</span>
           <span style="font-weight:500;text-align:right;word-break:break-word;">${val}</span>
         </div>` : '';

    Utils.el('pd-pessoais').innerHTML = [
      row('Matrícula',       p.id),
      row('E-mail',          p.email),
      row('Telefone',        p.telefone),
      row('Endereço',        p.endereco),
      row('Nascimento',      fmtDataBR(p.dt_nascimento)),
    ].join('') || '<span class="text-muted">—</span>';

    Utils.el('pd-profissionais').innerHTML = [
      row('Função',          p.funcao),
      row('Regime',          p.regime),
      row('Admissão',        fmtDataBR(p.dt_admissao)),
      row('HH/semana',       p.hh_semana ? p.hh_semana + 'h' : ''),
    ].join('') || '<span class="text-muted">—</span>';

    Utils.el('pd-acesso').innerHTML = [
      row('Usuário',         p.usuario),
      row('Perfil',          p.perfil),
    ].join('');

    // Botões
    Utils.el('pd-btn-editar').onclick  = () => window.openProfModal(id);
    Utils.el('pd-btn-toggle').textContent = isAtivo ? '🔴 Desativar' : '🟢 Ativar';
    Utils.el('pd-btn-toggle').onclick  = async () => {
      await window.toggleProf(id, !isAtivo);
      await loadProfissionais();
      window.openProfDetail(id);
    };

    // Mostrar painel
    Utils.el('prof-detail-panel').style.display = 'block';
  };

  window.toggleProf = async (id, ativo) => {
    try { await API.toggleProfissional(id, ativo); Utils.toast('Atualizado!', 'success'); }
    catch (e) { Utils.toast('Erro: ' + e.message, 'error'); }
  };

  window.openProfModal = (id = null) => {
    const p = id ? profissionais.find(x => x.id === id) : null;
    Utils.el('prof-modal-title').textContent = p ? 'Editar Profissional' : 'Novo Profissional';
    Utils.el('prof-id').value         = p?.id || '';
    Utils.el('prof-matricula').value  = p?.id || '';
    Utils.el('prof-nome').value       = p?.nome || '';
    Utils.el('prof-email').value      = p?.email || '';
    Utils.el('prof-telefone').value   = p?.telefone || '';
    Utils.el('prof-endereco').value   = p?.endereco || '';
    Utils.el('prof-nascimento').value = toInputDate(p?.dt_nascimento);
    Utils.el('prof-admissao').value   = toInputDate(p?.dt_admissao);
    Utils.el('prof-funcao').value     = p?.funcao || '';
    Utils.el('prof-regime').value     = p?.regime || '';
    Utils.el('prof-usuario').value    = p?.usuario || '';
    Utils.el('prof-perfil').value     = p?.perfil || 'tecnico';
    Utils.el('prof-hh').value         = p?.hh_semana || 44;
    Utils.el('prof-senha').value      = '';
    Utils.el('prof-senha').placeholder = p ? 'Deixe em branco para manter' : 'Nova senha obrigatória';
    Utils.openModal('prof-modal');
  };

  Utils.el('btn-nova-prof')?.addEventListener('click', () => window.openProfModal());
  Utils.el('btn-prof-cancel')?.addEventListener('click', () => Utils.closeModal('prof-modal'));

  Utils.el('prof-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = Utils.el('btn-prof-save');
    btn.disabled = true;
    try {
      const senha      = Utils.el('prof-senha').value.trim();
      const matricula  = Utils.el('prof-matricula').value.trim();
      if (!matricula) { Utils.toast('Matrícula é obrigatória', 'error'); btn.disabled = false; return; }
      const dados = {
        id:           matricula,
        nome:         Utils.el('prof-nome').value.trim(),
        email:        Utils.el('prof-email').value.trim(),
        telefone:     Utils.el('prof-telefone').value.trim(),
        endereco:     Utils.el('prof-endereco').value.trim(),
        dt_nascimento:Utils.el('prof-nascimento').value,
        dt_admissao:  Utils.el('prof-admissao').value,
        funcao:       Utils.el('prof-funcao').value,
        regime:       Utils.el('prof-regime').value,
        usuario:      Utils.el('prof-usuario').value.trim(),
        perfil:       Utils.el('prof-perfil').value,
        hh_semana:    parseInt(Utils.el('prof-hh').value) || 44,
      };
      if (!dados.id && !senha) { Utils.toast('Informe a senha', 'error'); btn.disabled = false; return; }
      if (senha) dados.senha = senha;
      await API.saveProfissional(dados);
      Utils.closeModal('prof-modal');
      Utils.toast('Profissional salvo!', 'success');
      await loadProfissionais();
    } catch (err) {
      Utils.toast('Erro: ' + err.message, 'error');
    } finally { btn.disabled = false; }
  });

  // ═══════════════════════════════════════
  // EQUIPAMENTOS
  // ═══════════════════════════════════════
  async function loadEquipamentos() {
    const res = await API.getEquipamentos();
    equipamentos = res.equipamentos || [];
    renderEquipamentos();
  }

  function renderEquipamentos() {
    const tbody = Utils.el('eq-tbody');
    if (!tbody) return;
    if (!equipamentos.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:2rem;">Nenhum equipamento cadastrado</td></tr>';
      return;
    }
    tbody.innerHTML = equipamentos.map(e => `
      <tr>
        <td><span class="badge badge-primary" style="font-family:var(--mono);font-size:.7rem;">${e.tag}</span></td>
        <td class="fw-500">${e.nome}</td>
        <td>${e.area || '—'}</td>
        <td><span class="badge badge-gray">${e.categoria || '—'}</span></td>
        <td>
          <label class="toggle">
            <input type="checkbox" ${e.ativo ? 'checked' : ''} onchange="toggleEq('${e.id}', this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </td>
        <td>
          <button class="btn btn-ghost btn-sm btn-icon" onclick="openEqModal('${e.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
        </td>
      </tr>`).join('');
  }

  window.toggleEq = async (id, ativo) => {
    try { await API.toggleEquipamento(id, ativo); Utils.toast('Atualizado!', 'success'); }
    catch (e) { Utils.toast('Erro: ' + e.message, 'error'); }
  };

  window.openEqModal = (id = null) => {
    const e = id ? equipamentos.find(x => x.id === id) : null;
    Utils.el('eq-modal-title').textContent = e ? 'Editar Equipamento' : 'Novo Equipamento';
    Utils.el('eq-id').value        = e?.id || '';
    Utils.el('eq-nome').value      = e?.nome || '';
    Utils.el('eq-tag').value       = e?.tag || '';
    Utils.el('eq-area').value      = e?.area || '';
    Utils.el('eq-categoria').value = e?.categoria || '';
    Utils.openModal('eq-modal');
  };

  Utils.el('btn-novo-eq')?.addEventListener('click', () => window.openEqModal());
  Utils.el('btn-eq-cancel')?.addEventListener('click', () => Utils.closeModal('eq-modal'));

  Utils.el('eq-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = Utils.el('btn-eq-save');
    btn.disabled = true;
    try {
      await API.saveEquipamento({
        id:        Utils.el('eq-id').value,
        nome:      Utils.el('eq-nome').value.trim(),
        tag:       Utils.el('eq-tag').value.trim().toUpperCase(),
        area:      Utils.el('eq-area').value.trim(),
        categoria: Utils.el('eq-categoria').value,
      });
      Utils.closeModal('eq-modal');
      Utils.toast('Equipamento salvo!', 'success');
      await loadEquipamentos();
    } catch (err) {
      Utils.toast('Erro: ' + err.message, 'error');
    } finally { btn.disabled = false; }
  });

  // ═══════════════════════════════════════
  // SEMANAS / HH
  // ═══════════════════════════════════════
  async function loadSemanas() {
    const res = await API.getSemanas();
    semanas = res.semanas || [];
    renderSemanas();
  }

  function renderSemanas() {
    const list = Utils.el('semanas-list');
    if (!list) return;
    if (!semanas.length) { list.innerHTML = '<p class="text-muted">Nenhuma semana cadastrada.</p>'; return; }

    list.innerHTML = semanas.map(s => {
      const pct = s.hh_disponivel ? Math.round(s.hh_programado / s.hh_disponivel * 100) : 0;
      const realPct = s.hh_disponivel ? Math.round((s.hh_realizado || 0) / s.hh_disponivel * 100) : 0;
      return `
      <div class="card mb-3">
        <div class="card-header">
          <div>
            <div class="card-title">${s.id}</div>
            <div class="text-xs text-muted">${Utils.fmtDate(s.data_inicio)} — ${Utils.fmtDate(s.data_fim)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="badge ${s.status === 'aberta' ? 'badge-success' : 'badge-gray'}">${s.status}</span>
            <button class="btn btn-ghost btn-sm btn-icon" onclick="openSemanaModal('${s.id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
          </div>
        </div>
        <div class="hh-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px;">
          <div><div class="text-xs text-muted">HH Disponível</div><div style="font-size:1.3rem;font-weight:600;">${s.hh_disponivel}h</div></div>
          <div><div class="text-xs text-muted">HH Programado</div><div style="font-size:1.3rem;font-weight:600;color:var(--primary);">${s.hh_programado}h</div></div>
          <div><div class="text-xs text-muted">HH Realizado</div><div style="font-size:1.3rem;font-weight:600;color:var(--success);">${s.hh_realizado || 0}h</div></div>
        </div>
        <div class="hh-bar-wrap">
          <div class="hh-labels"><span>Programado ${pct}%</span><span>Realizado ${realPct}%</span></div>
          <div class="hh-bar-track">
            <div class="hh-bar-prog" style="width:${pct}%"></div>
            <div class="hh-bar-real" style="width:${realPct}%"></div>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  window.openSemanaModal = (id = null) => {
    const s = id ? semanas.find(x => x.id === id) : null;
    const { start, end } = Utils.weekRange();
    Utils.el('sem-id').value          = s?.id || '';
    Utils.el('sem-inicio').value      = s?.data_inicio || start;
    Utils.el('sem-fim').value         = s?.data_fim || end;
    Utils.el('sem-hh-disp').value     = s?.hh_disponivel || '';
    Utils.el('sem-hh-prog').value     = s?.hh_programado || '';
    Utils.el('sem-status').value      = s?.status || 'planejamento';
    Utils.el('sem-modal-title').textContent = s ? 'Editar Semana' : 'Nova Semana';
    Utils.openModal('sem-modal');
  };

  Utils.el('btn-nova-semana')?.addEventListener('click', () => window.openSemanaModal());
  Utils.el('btn-sem-cancel')?.addEventListener('click', () => Utils.closeModal('sem-modal'));

  Utils.el('sem-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = Utils.el('btn-sem-save');
    btn.disabled = true;
    try {
      await API.saveSemana({
        id:            Utils.el('sem-id').value,
        data_inicio:   Utils.el('sem-inicio').value,
        data_fim:      Utils.el('sem-fim').value,
        hh_disponivel: parseFloat(Utils.el('sem-hh-disp').value) || 0,
        hh_programado: parseFloat(Utils.el('sem-hh-prog').value) || 0,
        status:        Utils.el('sem-status').value,
      });
      Utils.closeModal('sem-modal');
      Utils.toast('Semana salva!', 'success');
      await loadSemanas();
    } catch (err) {
      Utils.toast('Erro: ' + err.message, 'error');
    } finally { btn.disabled = false; }
  });

  // ═══════════════════════════════════════
  // ATIVIDADES (admin)
  // ═══════════════════════════════════════
  async function loadAtividades() {
    const [atRes, eqRes, profRes, semRes] = await Promise.all([
      API.getAtividades({}),
      API.getEquipamentos(),
      API.getProfissionais(),
      API.getSemanas(),
    ]);
    atividades   = atRes.atividades || [];
    equipamentos = eqRes.equipamentos || [];
    profissionais = profRes.profissionais || [];
    semanas      = semRes.semanas || [];
    renderAtividadesAdmin();
  }

  function renderAtividadesAdmin() {
    const tbody = Utils.el('at-tbody');
    if (!tbody) return;
    tbody.innerHTML = atividades.slice(0, 50).map(a => `
      <tr>
        <td class="text-xs text-muted" style="font-family:var(--mono);">${a.id}</td>
        <td>${Utils.tipoBadge(a.tipo)}</td>
        <td><div class="fw-500">${a.equipamento_nome || '—'}</div><div class="text-xs text-muted">${a.equip_tag || ''}</div></td>
        <td>${Utils.truncate(a.descricao, 50)}</td>
        <td>${a.tecnico_nome || '—'}</td>
        <td>${Utils.fmtDate(a.data_programada)}</td>
        <td>${Utils.statusBadge(a.status)}</td>
        <td>
          <button class="btn btn-ghost btn-sm btn-icon" onclick="openAtModal('${a.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn btn-ghost btn-sm btn-icon" onclick="deleteAt('${a.id}')" style="color:var(--danger);">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          </button>
        </td>
      </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--gray-400);padding:2rem;">Nenhuma atividade</td></tr>';
  }

  window.openAtModal = (id = null) => {
    const a = id ? atividades.find(x => x.id === id) : null;
    const eqOpts   = equipamentos.map(e => `<option value="${e.id}" ${a?.equipamento_id === e.id ? 'selected' : ''}>${e.nome} (${e.tag})</option>`).join('');
    const profOpts  = profissionais.map(p => `<option value="${p.id}" ${a?.tecnico_id === p.id ? 'selected' : ''}>${p.nome}</option>`).join('');
    const semOpts   = semanas.map(s => `<option value="${s.id}" ${a?.semana_id === s.id ? 'selected' : ''}>${s.id}</option>`).join('');

    Utils.el('at-modal-title').textContent = a ? 'Editar Atividade' : 'Nova Atividade';
    Utils.el('at-modal-body').innerHTML = `
      <input type="hidden" id="at-id" value="${a?.id || ''}">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Tipo</label>
          <select class="form-control" id="at-tipo">
            <option value="programada" ${a?.tipo==='programada'?'selected':''}>Programada</option>
            <option value="fora_programacao" ${a?.tipo==='fora_programacao'?'selected':''}>Fora de programação</option>
            <option value="ver_e_agir" ${a?.tipo==='ver_e_agir'?'selected':''}>Ver e Agir</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Prioridade</label>
          <select class="form-control" id="at-prio">
            <option ${a?.prioridade==='Normal'?'selected':''}>Normal</option>
            <option ${a?.prioridade==='Alta'?'selected':''}>Alta</option>
            <option ${a?.prioridade==='Urgente'?'selected':''}>Urgente</option>
          </select>
        </div>
      </div>
      <div class="form-group"><label class="form-label">Semana</label><select class="form-control" id="at-semana"><option value="">—</option>${semOpts}</select></div>
      <div class="form-group"><label class="form-label">Equipamento <span>*</span></label><select class="form-control" id="at-eq"><option value="">Selecione...</option>${eqOpts}</select></div>
      <div class="form-group"><label class="form-label">Descrição <span>*</span></label><textarea class="form-control" id="at-desc" rows="2">${a?.descricao || ''}</textarea></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Técnico responsável</label><select class="form-control" id="at-tecnico"><option value="">—</option>${profOpts}</select></div>
        <div class="form-group"><label class="form-label">Data programada</label><input type="date" class="form-control" id="at-data" value="${a?.data_programada?.slice(0,10) || Utils.todayISO()}"></div>
      </div>
      <div class="form-group"><label class="form-label">HH Estimado</label><input type="number" class="form-control" id="at-hh" step=".25" min=".25" value="${a?.hh_estimado || 1}"></div>
      <div class="form-group">
        <label class="form-label">Passos do checklist</label>
        <ul class="passos-list" id="at-passos-list">
          ${(a?.passos || []).map((p,i) => `
            <li class="passo-item">
              <span class="passo-num">${i+1}</span>
              <input class="passo-input" type="text" value="${p.descricao || p}">
              <button class="passo-remove" type="button" onclick="this.closest('li').remove()">✕</button>
            </li>`).join('')}
        </ul>
        <button class="btn btn-ghost btn-sm mt-2" type="button" onclick="addPassoAt()">+ Adicionar passo</button>
      </div>
    `;
    Utils.openModal('at-modal');
  };

  window.addPassoAt = () => {
    const list = Utils.el('at-passos-list');
    const n = list.children.length + 1;
    const li = document.createElement('li');
    li.className = 'passo-item';
    li.innerHTML = `<span class="passo-num">${n}</span><input class="passo-input" type="text" placeholder="Passo ${n}..."><button class="passo-remove" type="button" onclick="this.closest('li').remove()">✕</button>`;
    list.appendChild(li);
  };

  window.deleteAt = async (id) => {
    if (!Utils.confirm('Excluir esta atividade?')) return;
    try {
      await API.deleteAtividade(id);
      Utils.toast('Atividade excluída', 'success');
      await loadAtividades();
    } catch (e) { Utils.toast('Erro: ' + e.message, 'error'); }
  };

  Utils.el('btn-nova-at')?.addEventListener('click', () => window.openAtModal());
  Utils.el('btn-at-cancel')?.addEventListener('click', () => Utils.closeModal('at-modal'));
  Utils.el('btn-at-save')?.addEventListener('click', async () => {
    const eq   = Utils.el('at-eq').value;
    const desc = Utils.el('at-desc').value.trim();
    if (!eq || !desc) { Utils.toast('Equipamento e descrição são obrigatórios', 'error'); return; }
    const btn = Utils.el('btn-at-save');
    btn.disabled = true;
    try {
      const passos = [...document.querySelectorAll('.passo-input')].map(i => i.value.trim()).filter(Boolean);
      await API.saveAtividade({
        id:             Utils.el('at-id').value,
        tipo:           Utils.el('at-tipo').value,
        prioridade:     Utils.el('at-prio').value,
        semanaId:       Utils.el('at-semana').value,
        equipamentoId:  eq,
        descricao:      desc,
        tecnicoId:      Utils.el('at-tecnico').value,
        dataProgramada: Utils.el('at-data').value,
        hhEstimado:     parseFloat(Utils.el('at-hh').value) || 1,
        passos,
      });
      Utils.closeModal('at-modal');
      Utils.toast('Atividade salva!', 'success');
      await loadAtividades();
    } catch (err) { Utils.toast('Erro: ' + err.message, 'error'); }
    finally { btn.disabled = false; }
  });

  // ═══════════════════════════════════════
  // IMPORTAR EXCEL
  // ═══════════════════════════════════════
  function renderImportar() {
    const area = Utils.el('import-area');
    if (!area || area.dataset.init) return;
    area.dataset.init = '1';

    const fileInput = Utils.el('import-file');
    const dropzone  = Utils.el('import-dropzone');

    dropzone?.addEventListener('click', () => fileInput?.click());
    dropzone?.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
    dropzone?.addEventListener('drop', e => { e.preventDefault(); dropzone.classList.remove('drag-over'); handleFile(e.dataTransfer.files[0]); });
    fileInput?.addEventListener('change', () => handleFile(fileInput.files[0]));
  }

  async function handleFile(file) {
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls)$/i)) { Utils.toast('Use um arquivo Excel (.xlsx)', 'error'); return; }

    Utils.showLoading('Lendo planilha...');
    try {
      const XLSX = window.XLSX;
      const data = await file.arrayBuffer();
      const wb   = XLSX.read(data, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      Utils.hideLoading();
      renderImportPreview(rows);
    } catch (e) {
      Utils.hideLoading();
      Utils.toast('Erro ao ler arquivo: ' + e.message, 'error');
    }
  }

  function renderImportPreview(rows) {
    const preview = Utils.el('import-preview');
    if (!preview) return;
    preview.classList.remove('hidden');

    // Detectar colunas
    const cols = Object.keys(rows[0] || {});
    const eqOpts = equipamentos.map(e => `<option value="${e.id}">${e.nome} (${e.tag})</option>`).join('');
    const profOpts = profissionais.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');

    preview.innerHTML = `
      <div class="import-preview-header">
        <span>📊 ${rows.length} atividades encontradas — Configure o mapeamento de colunas</span>
        <button class="btn btn-ghost btn-sm" onclick="this.closest('#import-preview').classList.add('hidden')">✕</button>
      </div>
      <div style="padding:1rem;">
        <div class="form-row mb-3" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));">
          ${[['col-eq','Equipamento'],['col-desc','Atividade/Descrição'],['col-tecnico','Técnico'],['col-data','Data programada'],['col-hh','HH Estimado'],['col-prio','Prioridade']].map(([id,label]) => `
            <div class="form-group">
              <label class="form-label">${label}</label>
              <select class="form-control" id="${id}">
                <option value="">— ignorar —</option>
                ${cols.map(c => `<option value="${c}">${c}</option>`).join('')}
              </select>
            </div>`).join('')}
        </div>
        <div class="form-row mb-3" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));">
          <div class="form-group">
            <label class="form-label">Semana padrão</label>
            <select class="form-control" id="import-semana">
              <option value="">—</option>
              ${semanas.map(s => `<option value="${s.id}">${s.id}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Técnico padrão (se não mapeado)</label>
            <select class="form-control" id="import-tecnico-padrao"><option value="">—</option>${profOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Tipo padrão</label>
            <select class="form-control" id="import-tipo">
              <option value="programada">Programada</option>
              <option value="fora_programacao">Fora de programação</option>
            </select>
          </div>
        </div>

        <div class="table-wrap" style="max-height:250px;overflow-y:auto;border:1px solid var(--gray-200);border-radius:var(--radius);margin-bottom:1rem;">
          <table>
            <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
            <tbody>${rows.slice(0,10).map(r => `<tr>${cols.map(c => `<td>${r[c]}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
          ${rows.length > 10 ? `<div class="text-xs text-muted" style="padding:8px 14px;">... e mais ${rows.length-10} linhas</div>` : ''}
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button class="btn btn-secondary" onclick="Utils.el('import-preview').classList.add('hidden')">Cancelar</button>
          <button class="btn btn-primary" id="btn-confirmar-import">📥 Importar ${rows.length} atividades</button>
        </div>
      </div>
    `;

    Utils.el('btn-confirmar-import').addEventListener('click', () => confirmarImport(rows, cols));
  }

  async function confirmarImport(rows, cols) {
    const get = id => Utils.el(id)?.value || '';
    const mapa = {
      eq:      get('col-eq'),
      desc:    get('col-desc'),
      tecnico: get('col-tecnico'),
      data:    get('col-data'),
      hh:      get('col-hh'),
      prio:    get('col-prio'),
    };

    const lista = rows.map(r => ({
      tipo:           get('import-tipo'),
      semanaId:       get('import-semana'),
      equipamentoRef: mapa.eq    ? r[mapa.eq]    : '',
      descricao:      mapa.desc  ? r[mapa.desc]  : '',
      tecnicoRef:     mapa.tecnico ? r[mapa.tecnico] : get('import-tecnico-padrao'),
      dataProgramada: mapa.data  ? r[mapa.data]  : '',
      hhEstimado:     mapa.hh    ? parseFloat(r[mapa.hh]) || 1 : 1,
      prioridade:     mapa.prio  ? r[mapa.prio]  : 'Normal',
    })).filter(r => r.descricao);

    if (!lista.length) { Utils.toast('Nenhuma linha válida para importar', 'error'); return; }

    const btn = Utils.el('btn-confirmar-import');
    btn.disabled = true;
    Utils.showLoading(`Importando ${lista.length} atividades...`);
    try {
      const res = await API.importAtividades(lista);
      Utils.toast(`${res.criadas || lista.length} atividades importadas!`, 'success');
      Utils.el('import-preview')?.classList.add('hidden');
    } catch (e) {
      Utils.toast('Erro na importação: ' + e.message, 'error');
      btn.disabled = false;
    } finally { Utils.hideLoading(); }
  }

  // ═══════════════════════════════════════
  // MOTIVOS
  // ═══════════════════════════════════════
  async function loadMotivos() {
    const res = await API.getMotivos();
    motivos = res.motivos || [];
    renderMotivos();
  }

  function renderMotivos() {
    const list = Utils.el('motivos-list');
    if (!list) return;
    list.innerHTML = motivos.map(m => `
      <div class="motivo-item">
        <span class="motivo-cat">${m.categoria}</span>
        <span class="flex-1">${m.descricao}</span>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="openMotivoModal('${m.id}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="deleteMotivo('${m.id}')" style="color:var(--danger);">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
        </button>
      </div>`).join('') || '<p class="text-muted">Nenhum motivo cadastrado.</p>';
  }

  window.openMotivoModal = (id = null) => {
    const m = id ? motivos.find(x => x.id === id) : null;
    Utils.el('mot-id').value        = m?.id || '';
    Utils.el('mot-desc').value      = m?.descricao || '';
    Utils.el('mot-categoria').value = m?.categoria || 'Disponibilidade';
    Utils.el('mot-modal-title').textContent = m ? 'Editar Motivo' : 'Novo Motivo';
    Utils.openModal('mot-modal');
  };

  window.deleteMotivo = async (id) => {
    if (!Utils.confirm('Excluir este motivo?')) return;
    try { await API.deleteMotivo(id); Utils.toast('Motivo excluído', 'success'); await loadMotivos(); }
    catch (e) { Utils.toast('Erro: ' + e.message, 'error'); }
  };

  Utils.el('btn-novo-motivo')?.addEventListener('click', () => window.openMotivoModal());
  Utils.el('btn-mot-cancel')?.addEventListener('click', () => Utils.closeModal('mot-modal'));
  Utils.el('mot-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = Utils.el('btn-mot-save');
    btn.disabled = true;
    try {
      await API.saveMotivo({ id: Utils.el('mot-id').value, descricao: Utils.el('mot-desc').value.trim(), categoria: Utils.el('mot-categoria').value });
      Utils.closeModal('mot-modal');
      Utils.toast('Motivo salvo!', 'success');
      await loadMotivos();
    } catch (err) { Utils.toast('Erro: ' + err.message, 'error'); }
    finally { btn.disabled = false; }
  });

  // ── Init ──
  await loadTab('profissionais');

  // ── Auto-refresh a cada 5s (silencioso) ──
  setInterval(async () => {
    // Não atualiza abas que não fazem sentido ou podem conflitar com ação do usuário
    if (activeTab === 'importar') return;
    try { await loadTab(activeTab, true); } catch {}
  }, 5000);

})();

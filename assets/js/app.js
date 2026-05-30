/**
 * app.js — App principal: Dashboard técnico + Dashboard supervisor
 */

(async () => {
  const session = Auth.requireAuth(['tecnico', 'supervisor', 'admin']);
  if (!session) return;
  Auth.initUserUI(session);
  Utils.initSidebar();

  const isSupervisor = session.perfil === 'supervisor' || session.perfil === 'admin';

  let atividades    = [];
  let equipamentos  = [];
  let motivos       = [];
  let profissionais = [];
  let semanaAtual   = null;
  let currentAtiv   = null;
  let timerInterval = null;
  let timerSeconds  = 0;
  let fotosBefore   = [];
  let fotosAfter    = [];
  let activeFilter  = 'todas';
  let filtroTecnico = session.id; // supervisor pode mudar

  // ── Navegação ──
  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.addEventListener('click', () => setView(item.dataset.view));
  });

  function setView(view) {
    document.querySelectorAll('.nav-item[data-view]').forEach(i =>
      i.classList.toggle('active', i.dataset.view === view));
    document.querySelectorAll('.view-section').forEach(s =>
      s.classList.toggle('hidden', s.dataset.section !== view));
    const titles = { dashboard:'Dashboard', atividades:'Atividades', nova:'Nova Atividade', historico:'Histórico' };
    Utils.el('topbar-title').textContent = titles[view] || '';
    if (view === 'dashboard')  renderDashboard();
    if (view === 'atividades') renderAtividades();
    if (view === 'historico')  renderHistorico();
    if (view === 'nova')       renderNovaAtividade();
  }

  // ── Carregar dados ──
  async function loadAll() {
    Utils.showLoading('Carregando...');
    try {
      const promises = [
        API.getAtividades(isSupervisor ? {} : { tecnicoId: session.id }),
        API.getEquipamentos(),
        API.getMotivos(),
        API.getSemanas(),
      ];
      if (isSupervisor) promises.push(API.getProfissionais());

      const [atRes, eqRes, motRes, semRes, profRes] = await Promise.all(promises);
      atividades    = atRes.atividades || [];
      equipamentos  = eqRes.equipamentos || [];
      motivos       = motRes.motivos || [];
      profissionais = profRes?.profissionais || [];

      // Semana atual = a mais recente com status aberta ou a primeira
      const semanas = semRes.semanas || [];
      semanaAtual   = semanas.find(s => s.status === 'aberta') || semanas[0] || null;

    } catch (e) {
      Utils.toast('Erro ao carregar: ' + e.message, 'error');
    } finally { Utils.hideLoading(); }
  }

  // ══════════════════════════════════════════════════════
  // DASHBOARD
  // ══════════════════════════════════════════════════════
  function renderDashboard() {
    if (isSupervisor) renderDashboardSupervisor();
    else              renderDashboardTecnico();
  }

  // ── Dashboard Técnico ──
  function renderDashboardTecnico() {
    const container = Utils.el('dashboard-content');
    if (!container) return;

    const minhas = atividades.filter(a => a.tecnico_id === session.id);
    const semana = getSemanaStats(minhas, session.id);

    container.innerHTML = `
      <!-- Boas vindas -->
      <div style="margin-bottom:1.5rem;">
        <h2 style="font-size:1.2rem;">Olá, ${session.nome.split(' ')[0]} 👋</h2>
        <p class="text-muted text-sm">${semanaAtual ? `Semana ${semanaAtual.id} · ${Utils.fmtDate(semanaAtual.data_inicio)} a ${Utils.fmtDate(semanaAtual.data_fim)}` : 'Sem semana ativa'}</p>
      </div>

      <!-- KPIs HH -->
      <div class="stat-cards" style="grid-template-columns:repeat(3,1fr);margin-bottom:1.5rem;">
        <div class="stat-card">
          <div class="stat-card-label">HH Disponível</div>
          <div class="stat-card-value">${semanaAtual?.hh_disponivel ? parseFloat(semanaAtual.hh_disponivel)/countTecnicos() : 44}h</div>
          <div class="stat-card-sub">na semana</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">HH Executado</div>
          <div class="stat-card-value" style="color:var(--success);">${semana.hhRealizado}h</div>
          <div class="stat-card-sub">${semana.pctHH}% do programado</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">HH Pendente</div>
          <div class="stat-card-value" style="color:var(--warning);">${semana.hhPendente}h</div>
          <div class="stat-card-sub">estimado restante</div>
        </div>
      </div>

      <!-- Barra de progresso HH -->
      <div class="card mb-3">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span class="text-sm fw-500">Progresso da semana</span>
          <span class="text-sm text-muted">${semana.concluidas}/${semana.total} atividades</span>
        </div>
        <div class="progress" style="height:12px;margin-bottom:8px;">
          <div class="progress-bar success" style="width:${semana.pctAtividades}%"></div>
        </div>
        <div style="display:flex;gap:16px;font-size:.75rem;">
          <span style="color:var(--success);">✅ ${semana.concluidas} concluídas</span>
          <span style="color:var(--danger);">❌ ${semana.naoRealizadas} não realizadas</span>
          <span style="color:var(--warning);">⏳ ${semana.pendentes} pendentes</span>
        </div>
      </div>

      <!-- Atividades de hoje -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">📅 Hoje — ${formatDayLabel(Utils.todayISO())}</span>
          <button class="btn btn-primary btn-sm" onclick="setView('atividades')">Ver todas</button>
        </div>
        ${renderAtividadesMini(minhas.filter(a => a.data_programada?.slice(0,10) === Utils.todayISO()))}
      </div>
    `;
  }

  // ── Dashboard Supervisor ──
  function renderDashboardSupervisor() {
    const container = Utils.el('dashboard-content');
    if (!container) return;

    // Filtro de técnico
    const tecOpts = [
      '<option value="">Toda a equipe</option>',
      ...profissionais.map(p => `<option value="${p.id}" ${filtroTecnico===p.id?'selected':''}>${p.nome}</option>`)
    ].join('');

    const atFiltradas = filtroTecnico
      ? atividades.filter(a => a.tecnico_id === filtroTecnico)
      : atividades;

    const semana = getSemanaStats(atFiltradas);
    const tecnicos = profissionais.filter(p => p.perfil === 'tecnico' || p.perfil === 'supervisor');

    container.innerHTML = `
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:1.5rem;">
        <div>
          <h2 style="font-size:1.2rem;">Dashboard da Equipe</h2>
          <p class="text-muted text-sm">${semanaAtual ? `Semana ${semanaAtual.id} · ${Utils.fmtDate(semanaAtual.data_inicio)} a ${Utils.fmtDate(semanaAtual.data_fim)}` : 'Sem semana ativa'}</p>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <label class="form-label" style="margin:0;white-space:nowrap;">Filtrar técnico:</label>
          <select class="form-control" id="filtro-tecnico-dash" style="width:200px;">
            ${tecOpts}
          </select>
        </div>
      </div>

      <!-- KPIs gerais -->
      <div class="stat-cards" style="grid-template-columns:repeat(4,1fr);margin-bottom:1.5rem;">
        <div class="stat-card">
          <div class="stat-card-label">Total atividades</div>
          <div class="stat-card-value">${semana.total}</div>
          <div class="stat-card-sub">na semana</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">Concluídas</div>
          <div class="stat-card-value" style="color:var(--success);">${semana.concluidas}</div>
          <div class="stat-card-sub">${semana.pctAtividades}% execução</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">Não realizadas</div>
          <div class="stat-card-value" style="color:var(--danger);">${semana.naoRealizadas}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">HH Realizado</div>
          <div class="stat-card-value" style="color:var(--primary);">${semana.hhRealizado}h</div>
          <div class="stat-card-sub">de ${semana.hhProgramado}h programado</div>
        </div>
      </div>

      <!-- Barra geral -->
      <div class="card mb-3">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span class="fw-500 text-sm">Progresso geral da equipe</span>
          <span class="text-sm text-muted">${semana.pctAtividades}%</span>
        </div>
        <div class="progress" style="height:14px;">
          <div class="progress-bar ${semana.pctAtividades>=80?'success':''}" style="width:${semana.pctAtividades}%;background:${semana.pctAtividades>=80?'var(--success)':semana.pctAtividades>=60?'var(--primary)':'var(--danger)'}"></div>
        </div>
      </div>

      <!-- Performance por técnico -->
      ${!filtroTecnico ? `
      <div class="card mb-3">
        <div class="card-header"><span class="card-title">👥 Performance Individual</span></div>
        ${tecnicos.map(tec => {
          const atTec = atividades.filter(a => a.tecnico_id === tec.id);
          const s = getSemanaStats(atTec);
          return `
          <div style="padding:12px 0;border-bottom:1px solid var(--gray-100);display:flex;align-items:center;gap:12px;">
            <div class="user-avatar" style="width:36px;height:36px;font-size:.8rem;flex-shrink:0;">${Utils.initials(tec.nome)}</div>
            <div style="flex:1;min-width:0;">
              <div class="fw-500">${tec.nome}</div>
              <div class="text-xs text-muted">${s.concluidas} concluídas · ${s.naoRealizadas} não realizadas · ${s.pendentes} pendentes</div>
              <div class="progress" style="height:6px;margin-top:6px;">
                <div class="progress-bar" style="width:${s.pctAtividades}%;background:${s.pctAtividades>=80?'var(--success)':s.pctAtividades>=60?'var(--primary)':'var(--danger)'}"></div>
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div class="fw-600" style="color:${s.pctAtividades>=80?'var(--success)':s.pctAtividades>=60?'var(--primary)':'var(--danger)'};">${s.pctAtividades}%</div>
              <div class="text-xs text-muted">${s.hhRealizado}h real.</div>
            </div>
          </div>`;
        }).join('') || '<p class="text-muted text-sm">Nenhum técnico encontrado.</p>'}
      </div>` : ''}

      <!-- Atividades do filtro -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">${filtroTecnico ? 'Atividades do técnico' : 'Todas as atividades'}</span>
          <button class="btn btn-primary btn-sm" onclick="setView('atividades')">Ver detalhes</button>
        </div>
        ${renderAtividadesMini(atFiltradas.slice(0, 8))}
      </div>
    `;

    // Listener do filtro de técnico
    Utils.el('filtro-tecnico-dash')?.addEventListener('change', (e) => {
      filtroTecnico = e.target.value;
      renderDashboardSupervisor();
    });
  }

  // ── Mini lista de atividades (usada no dashboard) ──
  function renderAtividadesMini(lista) {
    if (!lista.length) return '<div class="empty-state" style="padding:24px;"><p>Nenhuma atividade</p></div>';
    return lista.slice(0,6).map(a => `
      <div class="activity-card" data-id="${a.id}" style="margin-bottom:8px;">
        <div class="activity-type-dot type-${a.tipo}"></div>
        <div class="activity-body">
          <div class="activity-equip">${a.equipamento_nome || '—'}</div>
          <div class="activity-desc" style="font-size:.8rem;">${Utils.truncate(a.descricao, 60)}</div>
          <div class="activity-meta">
            <span>👤 ${a.tecnico_nome || '—'}</span>
            <span>⏱ ${Utils.fmtHH(a.hh_estimado)}</span>
          </div>
        </div>
        <div>${Utils.statusBadge(a.status)}</div>
      </div>`).join('');
  }

  // ── Calcular stats da semana ──
  function getSemanaStats(lista) {
    const concluidas    = lista.filter(a => a.status === 'concluida').length;
    const naoRealizadas = lista.filter(a => a.status === 'nao_realizada').length;
    const pendentes     = lista.filter(a => a.status === 'pendente').length;
    const total         = lista.length;
    const pctAtividades = total ? Math.round(concluidas / total * 100) : 0;
    const hhProgramado  = lista.reduce((s, a) => s + (parseFloat(a.hh_estimado) || 0), 0).toFixed(1);
    const hhRealizado   = lista.filter(a => a.status === 'concluida')
                               .reduce((s, a) => s + (parseFloat(a.hh_estimado) || 0), 0).toFixed(1);
    const hhPendente    = lista.filter(a => a.status === 'pendente')
                               .reduce((s, a) => s + (parseFloat(a.hh_estimado) || 0), 0).toFixed(1);
    const pctHH         = hhProgramado > 0 ? Math.round(hhRealizado / hhProgramado * 100) : 0;
    return { concluidas, naoRealizadas, pendentes, total, pctAtividades, hhProgramado, hhRealizado, hhPendente, pctHH };
  }

  function countTecnicos() {
    return Math.max(1, profissionais.filter(p => p.perfil === 'tecnico').length);
  }

  // ══════════════════════════════════════════════════════
  // LISTA DE ATIVIDADES
  // ══════════════════════════════════════════════════════
  function renderAtividades() {
    const minhas = isSupervisor ? atividades : atividades.filter(a => a.tecnico_id === session.id);
    const filtradas = minhas.filter(a => {
      if (activeFilter === 'todas')          return true;
      if (activeFilter === 'pendentes')      return a.status === 'pendente';
      if (activeFilter === 'concluidas')     return a.status === 'concluida';
      if (activeFilter === 'nao_realizadas') return a.status === 'nao_realizada';
      if (activeFilter === 'fora_prog')      return a.tipo === 'fora_programacao';
      if (activeFilter === 'ver_agir')       return a.tipo === 'ver_e_agir';
      return true;
    });

    const container = Utils.el('atividades-list');
    if (!container) return;

    if (!filtradas.length) {
      container.innerHTML = `<div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
        <p>Nenhuma atividade encontrada</p></div>`;
      return;
    }

    const grupos = {};
    filtradas.forEach(a => {
      const key = a.data_programada?.slice(0, 10) || 'sem-data';
      if (!grupos[key]) grupos[key] = [];
      grupos[key].push(a);
    });

    container.innerHTML = Object.keys(grupos).sort().reverse().map(data => {
      const cards = grupos[data].map(renderAtividadeCard).join('');
      return `<div class="mb-3">
        <div class="text-xs fw-600" style="color:var(--gray-400);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;padding-left:2px;">${formatDayLabel(data)}</div>
        ${cards}
      </div>`;
    }).join('');

    container.querySelectorAll('.activity-card[data-id]').forEach(card => {
      card.addEventListener('click', () => openDetail(card.dataset.id));
    });
  }

  function renderAtividadeCard(a) {
    const passos     = a.passos || [];
    const concluidos = passos.filter(p => p.concluido).length;
    const progPct    = passos.length ? Math.round(concluidos / passos.length * 100) : 0;
    return `<div class="activity-card ${a.status !== 'pendente' ? 'done' : ''}" data-id="${a.id}">
      <div class="activity-type-dot type-${a.tipo}"></div>
      <div class="activity-body">
        <div class="activity-equip">${a.equipamento_nome || '—'}</div>
        <div class="activity-desc">${Utils.truncate(a.descricao, 70)}</div>
        <div class="activity-meta">
          <span>👤 ${a.tecnico_nome || '—'}</span>
          <span>⏱ ${Utils.fmtHH(a.hh_estimado)}</span>
          ${Utils.tipoBadge(a.tipo)}
        </div>
        ${passos.length ? `
        <div style="margin-top:8px;">
          <div class="checklist-progress" style="margin-bottom:4px;">✔ ${concluidos}/${passos.length} passos</div>
          <div class="progress"><div class="progress-bar ${a.status==='concluida'?'success':''}" style="width:${progPct}%"></div></div>
        </div>` : ''}
      </div>
      <div class="activity-right">
        ${Utils.statusBadge(a.status)}
        ${a.prioridade === 'Alta' || a.prioridade === 'Urgente' ? `<span class="badge badge-danger" style="font-size:.65rem;">${a.prioridade}</span>` : ''}
      </div>
    </div>`;
  }

  // Filtros
  document.querySelectorAll('.filter-chip[data-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip[data-filter]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.filter;
      renderAtividades();
    });
  });

  // ══════════════════════════════════════════════════════
  // PAINEL DE DETALHE
  // ══════════════════════════════════════════════════════
  function openDetail(id) {
    currentAtiv  = atividades.find(a => a.id === id);
    if (!currentAtiv) return;
    fotosBefore  = [];
    fotosAfter   = [];
    timerSeconds = 0;
    clearInterval(timerInterval);
    document.querySelector('.detail-panel')?.classList.add('open');
    renderDetailPanel();
  }

  function closeDetailPanel() {
    document.querySelector('.detail-panel')?.classList.remove('open');
    stopTimer();
    currentAtiv = null;
  }

  Utils.el('detail-close')?.addEventListener('click', closeDetailPanel);

  function renderDetailPanel() {
    if (!currentAtiv) return;
    const a = currentAtiv;
    Utils.setHTML('detail-equip', a.equipamento_nome || '—');
    Utils.setHTML('detail-desc',  a.descricao || '—');

    Utils.setHTML('detail-info', `
      <div class="detail-section">
        <div class="detail-section-title">Informações</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.825rem;">
          <div><span class="text-muted">Tag:</span> <strong>${a.equip_tag||'—'}</strong></div>
          <div><span class="text-muted">Área:</span> <strong>${a.area||'—'}</strong></div>
          <div><span class="text-muted">Tipo:</span> ${Utils.tipoBadge(a.tipo)}</div>
          <div><span class="text-muted">Prioridade:</span> ${Utils.prioridadeBadge(a.prioridade||'Normal')}</div>
          <div><span class="text-muted">Data:</span> <strong>${Utils.fmtDate(a.data_programada)}</strong></div>
          <div><span class="text-muted">HH est.:</span> <strong>${Utils.fmtHH(a.hh_estimado)}</strong></div>
          <div><span class="text-muted">Técnico:</span> <strong>${a.tecnico_nome||'—'}</strong></div>
          <div><span class="text-muted">Status:</span> ${Utils.statusBadge(a.status)}</div>
        </div>
      </div>`);

    renderChecklist();
    renderExecForm();
  }

  function renderChecklist() {
    const passos = currentAtiv.passos || [];
    const el     = Utils.el('detail-checklist');
    if (!el) return;
    if (!passos.length) { el.innerHTML = '<p class="text-muted text-sm">Sem passos cadastrados.</p>'; return; }

    el.innerHTML = `
      <div class="detail-section-title">Checklist</div>
      ${passos.map(p => `
        <div class="checklist-item">
          <input type="checkbox" class="checklist-cb" id="passo-${p.id}" data-passo-id="${p.id}" ${p.concluido?'checked':''}>
          <label class="checklist-text" for="passo-${p.id}">${p.descricao}</label>
          ${p.concluido && p.concluido_em ? `<span class="text-xs text-muted">${Utils.fmtDateTime(p.concluido_em)}</span>` : ''}
        </div>`).join('')}`;

    el.querySelectorAll('.checklist-cb').forEach(cb => {
      cb.addEventListener('change', async () => {
        try {
          await API.updatePasso(currentAtiv.id, cb.dataset.passoId, cb.checked);
          const p = currentAtiv.passos.find(p => p.id === cb.dataset.passoId);
          if (p) { p.concluido = cb.checked; p.concluido_em = new Date().toISOString(); }
        } catch {
          cb.checked = !cb.checked;
          Utils.toast('Erro ao salvar passo', 'error');
        }
      });
    });
  }

  function renderExecForm() {
    const el = Utils.el('detail-exec-form');
    if (!el) return;
    const motOpts = motivos.map(m => `<option value="${m.id}">${m.descricao}</option>`).join('');
    let selectedStatus = currentAtiv.status !== 'pendente' ? currentAtiv.status : null;

    el.innerHTML = `
      <div class="detail-section">
        <div class="detail-section-title">Registro de Execução</div>

        <!-- Timer -->
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:1rem;padding:10px 12px;background:var(--gray-50);border-radius:var(--radius);border:1px solid var(--gray-200);">
          <div>
            <div class="text-xs text-muted">Tempo decorrido</div>
            <div class="timer-display" id="timer-display">00:00:00</div>
          </div>
          <div style="margin-left:auto;display:flex;gap:6px;">
            <button class="btn btn-secondary btn-sm" id="btn-timer-start">▶ Iniciar</button>
            <button class="btn btn-ghost btn-sm" id="btn-timer-stop">⏹ Parar</button>
          </div>
        </div>

        <!-- Status -->
        <div class="form-group">
          <label class="form-label">Status <span>*</span></label>
          <div style="display:flex;gap:8px;">
            <button class="btn flex-1 ${selectedStatus==='concluida'?'btn-success':'btn-secondary'}" id="btn-status-ok" data-status="concluida">✅ Concluída</button>
            <button class="btn flex-1 ${selectedStatus==='nao_realizada'?'btn-danger':'btn-secondary'}" id="btn-status-nok" data-status="nao_realizada">❌ Não realizada</button>
          </div>
        </div>

        <div class="form-group ${selectedStatus==='nao_realizada'?'':'hidden'}" id="motivo-group">
          <label class="form-label">Motivo <span>*</span></label>
          <select class="form-control" id="exec-motivo"><option value="">Selecione...</option>${motOpts}</select>
        </div>

        <div class="form-group">
          <label class="form-label">Observações</label>
          <textarea class="form-control" id="exec-obs" rows="3" placeholder="Descreva o que foi realizado..."></textarea>
        </div>

        <!-- Fotos Antes -->
        <div class="form-group">
          <label class="form-label">📷 Foto — Antes</label>
          <div class="photo-upload-area" onclick="document.getElementById('file-before').click()">
            <input type="file" id="file-before" accept="image/*" multiple>
            <p class="text-sm text-muted">Toque para adicionar foto</p>
          </div>
          <div class="photo-grid" id="photos-before-grid"></div>
        </div>

        <!-- Fotos Depois -->
        <div class="form-group">
          <label class="form-label">📷 Foto — Depois</label>
          <div class="photo-upload-area" onclick="document.getElementById('file-after').click()">
            <input type="file" id="file-after" accept="image/*" multiple>
            <p class="text-sm text-muted">Toque para adicionar foto</p>
          </div>
          <div class="photo-grid" id="photos-after-grid"></div>
        </div>
      </div>`;

    // Timer
    Utils.el('btn-timer-start')?.addEventListener('click', startTimer);
    Utils.el('btn-timer-stop')?.addEventListener('click', stopTimer);

    // Status buttons
    function updateStatusUI() {
      Utils.el('btn-status-ok')?.classList.toggle('btn-success',    selectedStatus === 'concluida');
      Utils.el('btn-status-ok')?.classList.toggle('btn-secondary',  selectedStatus !== 'concluida');
      Utils.el('btn-status-nok')?.classList.toggle('btn-danger',     selectedStatus === 'nao_realizada');
      Utils.el('btn-status-nok')?.classList.toggle('btn-secondary',  selectedStatus !== 'nao_realizada');
      Utils.el('motivo-group')?.classList.toggle('hidden', selectedStatus !== 'nao_realizada');
    }
    Utils.el('btn-status-ok')?.addEventListener('click',  () => { selectedStatus = 'concluida';     updateStatusUI(); });
    Utils.el('btn-status-nok')?.addEventListener('click', () => { selectedStatus = 'nao_realizada'; updateStatusUI(); });

    // Fotos
    setupPhotoUpload('file-before', 'photos-before-grid', fotosBefore);
    setupPhotoUpload('file-after',  'photos-after-grid',  fotosAfter);

    // Submit
    const btnSave = Utils.el('btn-save-exec');
    if (btnSave) {
      btnSave.onclick = async () => {
        if (!selectedStatus) { Utils.toast('Selecione o status', 'error'); return; }
        if (selectedStatus === 'nao_realizada' && !Utils.el('exec-motivo').value) {
          Utils.toast('Selecione o motivo', 'error'); return;
        }
        btnSave.disabled = true;
        btnSave.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span> Salvando...';
        stopTimer();
        try {
          Utils.showLoading('Enviando fotos...');
          const linksAntes  = await uploadFotos(fotosBefore, 'antes');
          const linksDepois = await uploadFotos(fotosAfter,  'depois');
          Utils.showLoading('Salvando execução...');
          await API.saveExecucao({
            atividadeId:  currentAtiv.id,
            tecnicoId:    session.id,
            status:       selectedStatus,
            motivoId:     Utils.el('exec-motivo')?.value || '',
            obs:          Utils.el('exec-obs')?.value || '',
            hhReal:       +(timerSeconds / 3600).toFixed(2),
            fotosAntes:   JSON.stringify(linksAntes),
            fotosDepois:  JSON.stringify(linksDepois),
          });
          const idx = atividades.findIndex(a => a.id === currentAtiv.id);
          if (idx >= 0) atividades[idx].status = selectedStatus;
          Utils.toast('Execução registrada!', 'success');
          closeDetailPanel();
          renderDashboard();
        } catch (e) {
          Utils.toast('Erro: ' + e.message, 'error');
        } finally {
          Utils.hideLoading();
          btnSave.disabled = false;
          btnSave.innerHTML = '💾 Registrar';
        }
      };
    }
  }

  // ── Timer ──
  function startTimer() {
    if (timerInterval) return;
    timerInterval = setInterval(() => {
      timerSeconds++;
      const el = Utils.el('timer-display');
      if (el) el.textContent = Utils.fmtTime(timerSeconds);
    }, 1000);
  }
  function stopTimer() { clearInterval(timerInterval); timerInterval = null; }

  // ── Fotos ──
  function setupPhotoUpload(inputId, gridId, store) {
    const input = Utils.el(inputId);
    const grid  = Utils.el(gridId);
    if (!input || !grid) return;
    input.addEventListener('change', async () => {
      const files = Array.from(input.files).slice(0, 4 - store.length);
      for (const file of files) {
        if (store.length >= 4) break;
        const base64 = await Utils.fileToBase64(file);
        store.push({ base64, mimeType: file.type });
        const url = URL.createObjectURL(file);
        const wrap = document.createElement('div');
        wrap.className = 'photo-thumb-wrap';
        wrap.innerHTML = `<img src="${url}" class="photo-thumb"><button class="remove-photo">✕</button>`;
        const idx = store.length - 1;
        wrap.querySelector('.remove-photo').addEventListener('click', () => { store.splice(idx, 1); wrap.remove(); });
        grid.appendChild(wrap);
      }
      input.value = '';
    });
  }

  async function uploadFotos(fotos, lado) {
    const links = [];
    for (const f of fotos) {
      try {
        const res = await API.uploadFoto(f.base64, f.mimeType, currentAtiv.equipamento_id, currentAtiv.id, lado);
        links.push(res.url);
      } catch { links.push(''); }
    }
    return links.filter(Boolean);
  }

  // ── Nova Atividade ──
  function renderNovaAtividade() {
    const form = Utils.el('nova-form');
    if (!form) return;
    const eqOpts = equipamentos.map(e => `<option value="${e.id}">${e.nome} (${e.tag})</option>`).join('');
    form.innerHTML = `
      <div class="card" style="max-width:600px;">
        <div class="card-header"><span class="card-title">Nova Atividade</span></div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Tipo <span>*</span></label>
            <select class="form-control" id="nova-tipo">
              <option value="fora_programacao">Fora de programação</option>
              <option value="ver_e_agir">Ver e Agir</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Prioridade</label>
            <select class="form-control" id="nova-prio"><option>Normal</option><option>Alta</option><option>Urgente</option></select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Equipamento <span>*</span></label>
          <select class="form-control" id="nova-eq"><option value="">Selecione...</option>${eqOpts}</select>
        </div>
        <div class="form-group">
          <label class="form-label">Descrição <span>*</span></label>
          <textarea class="form-control" id="nova-desc" rows="3" placeholder="Descreva o que foi feito..."></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Data <span>*</span></label>
            <input type="date" class="form-control" id="nova-data" value="${Utils.todayISO()}">
          </div>
          <div class="form-group">
            <label class="form-label">HH estimado</label>
            <input type="number" class="form-control" id="nova-hh" min="0.25" step="0.25" value="1">
          </div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:.5rem;">
          <button class="btn btn-secondary" type="button" onclick="setView('dashboard')">Cancelar</button>
          <button class="btn btn-primary" id="btn-nova-save">Criar atividade</button>
        </div>
      </div>`;

    Utils.el('btn-nova-save')?.addEventListener('click', async () => {
      const eqId = Utils.el('nova-eq').value;
      const desc = Utils.el('nova-desc').value.trim();
      if (!eqId || !desc) { Utils.toast('Preencha equipamento e descrição', 'error'); return; }
      const btn = Utils.el('btn-nova-save');
      btn.disabled = true;
      Utils.showLoading('Criando...');
      try {
        await API.saveAtividade({
          tipo:           Utils.el('nova-tipo').value,
          equipamentoId:  eqId,
          descricao:      desc,
          tecnicoId:      session.id,
          prioridade:     Utils.el('nova-prio').value,
          dataProgramada: Utils.el('nova-data').value,
          hhEstimado:     parseFloat(Utils.el('nova-hh').value) || 1,
          passos:         '[]',
        });
        Utils.toast('Atividade criada!', 'success');
        await loadAll();
        setView('dashboard');
      } catch (e) {
        Utils.toast('Erro: ' + e.message, 'error');
        btn.disabled = false;
      } finally { Utils.hideLoading(); }
    });
  }

  // ── Histórico ──
  async function renderHistorico() {
    const container = Utils.el('historico-list');
    if (!container) return;
    container.innerHTML = '<div class="text-muted text-sm" style="padding:1rem;">Carregando...</div>';
    try {
      const res   = await API.getExecucoes(isSupervisor ? {} : { tecnicoId: session.id });
      const execs = res.execucoes || [];
      if (!execs.length) { container.innerHTML = '<div class="empty-state"><p>Nenhuma execução registrada.</p></div>'; return; }
      container.innerHTML = execs.map(ex => `
        <div class="activity-card">
          <div class="activity-body">
            <div class="activity-equip">${ex.equipamento_nome || '—'}</div>
            <div class="activity-desc">${ex.atividade_desc || '—'}</div>
            <div class="activity-meta">
              <span>📅 ${Utils.fmtDateTime(ex.dt_fim)}</span>
              <span>⏱ ${Utils.fmtHH(ex.hh_real)}</span>
              <span>👤 ${ex.tecnico_nome}</span>
            </div>
          </div>
          <div>${Utils.statusBadge(ex.status)}</div>
        </div>`).join('');
    } catch (e) {
      container.innerHTML = `<div class="alert alert-danger">Erro: ${e.message}</div>`;
    }
  }

  // ── Helpers ──
  function formatDayLabel(isoDate) {
    const today = Utils.todayISO();
    if (isoDate === today) return 'Hoje';
    const d    = new Date(isoDate + 'T00:00:00');
    const diff = Math.floor((new Date(today) - d) / 86400000);
    if (diff === 1) return 'Ontem';
    const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    return `${dias[d.getDay()]}, ${Utils.fmtDate(isoDate)}`;
  }

  // expor setView globalmente para o HTML
  window.setView = setView;

  // ── Init ──
  await loadAll();
  setView('dashboard');

})();

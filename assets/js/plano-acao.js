/**
 * plano-acao.js — Módulo completo de Plano de Ação
 */
(async () => {
  const session = Auth.requireAuth(['tecnico','supervisor','admin']);
  if (!session) return;
  Auth.initUserUI(session);
  Utils.initSidebar();

  // Mostrar admin só para admin/supervisor
  if (session.perfil === 'tecnico') {
    Utils.el('nav-admin')?.style && (Utils.el('nav-admin').style.display = 'none');
  }

  // ── Estado ──
  let planos        = [];
  let profissionais = [];
  let atividadesPA  = [];
  let aprovacoes    = [];
  let planoAtual    = null;
  let filtroAtivo   = 'todos';
  let decidedStatus = null;
  let evidenciasTemp = [];

  // ── Init ──
  await carregarTudo();
  bindEvents();
  renderLista();

  // Auto-refresh 10s
  setInterval(async () => {
    await carregarTudo(true);
    if (planoAtual) renderDetalhe(planoAtual);
    else renderLista();
  }, 10000);

  // ──────────────────────────────────────────
  // CARREGAR DADOS
  // ──────────────────────────────────────────
  async function carregarTudo(silent = false) {
    if (!silent) Utils.showLoading('Carregando...');
    try {
      const [pRes, profRes, atRes, apRes] = await Promise.all([
        API.getPlanos(),
        API.getProfissionais(),
        API.getAtividadesPA(),
        API.getAprovacoesPA(),
      ]);
      planos        = pRes.planos         || [];
      profissionais = profRes.profissionais || [];
      atividadesPA  = atRes.atividades    || [];
      aprovacoes    = apRes.aprovacoes    || [];
    } catch (e) {
      if (!silent) Utils.toast('Erro: ' + e.message, 'error');
    } finally {
      if (!silent) Utils.hideLoading();
    }
  }

  // ──────────────────────────────────────────
  // BIND EVENTS
  // ──────────────────────────────────────────
  function bindEvents() {
    // Filtros lista
    document.querySelectorAll('.filter-chip[data-filter]').forEach(c => {
      c.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip[data-filter]').forEach(x => x.classList.remove('active'));
        c.classList.add('active');
        filtroAtivo = c.dataset.filter;
        renderLista();
      });
    });

    // Busca
    Utils.el('pa-search')?.addEventListener('input', renderLista);

    // Novo plano — só supervisor/admin
    if (session.perfil === 'tecnico') {
      Utils.el('btn-novo-plano')?.style && (Utils.el('btn-novo-plano').style.display = 'none');
    } else {
      Utils.el('btn-novo-plano')?.addEventListener('click', () => abrirModalPlano());
    }

    // Form plano
    Utils.el('form-plano')?.addEventListener('submit', async e => {
      e.preventDefault();
      await salvarPlano();
    });

    // Form atividade PA
    Utils.el('form-atpa')?.addEventListener('submit', async e => {
      e.preventDefault();
      await salvarAtividadePA();
    });

    // Aprovação
    Utils.el('btn-confirmar-aprovacao')?.addEventListener('click', confirmarAprovacao);

    // Evidências upload
    Utils.el('atpa-fotos')?.addEventListener('change', handleEvidencias);
  }

  // ──────────────────────────────────────────
  // DASHBOARD STATS
  // ──────────────────────────────────────────
  function renderStats() {
    const total     = planos.length;
    const abertos   = planos.filter(p => p.status === 'Aberto').length;
    const andamento = planos.filter(p => p.status === 'Em andamento').length;
    const concluidos= planos.filter(p => p.status === 'Concluído').length;
    const atrasados = planos.filter(p => calcPrazo(p).tipo === 'atraso').length;

    Utils.setHTML('pa-stats', `
      <div class="stat-card">
        <div class="stat-card-label">Total</div>
        <div class="stat-card-value">${total}</div>
        <div class="stat-card-sub">planos cadastrados</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Abertos</div>
        <div class="stat-card-value" style="color:var(--info);">${abertos}</div>
        <div class="stat-card-sub">${andamento} em andamento</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Concluídos</div>
        <div class="stat-card-value" style="color:var(--success);">${concluidos}</div>
        <div class="stat-card-sub">${total ? Math.round(concluidos/total*100) : 0}% do total</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Atrasados</div>
        <div class="stat-card-value" style="color:var(--danger);">${atrasados}</div>
        <div class="stat-card-sub">requerem atenção</div>
      </div>
    `);
  }

  // ──────────────────────────────────────────
  // LISTA DE PLANOS
  // ──────────────────────────────────────────
  function renderLista() {
    renderStats();

    let lista = [...planos];

    // Técnico vê apenas planos que têm atividades atribuídas a ele
    if (session.perfil === 'tecnico') {
      const meusPlanosIds = new Set(
        atividadesPA.filter(a => String(a.responsavel_id) === String(session.id))
                    .map(a => String(a.plano_id))
      );
      lista = lista.filter(p => meusPlanosIds.has(String(p.id)));
    }

    const busca = (Utils.el('pa-search')?.value || '').toLowerCase().trim();

    // Filtro status
    if (filtroAtivo !== 'todos') {
      if (filtroAtivo === 'atrasado') {
        lista = lista.filter(p => calcPrazo(p).tipo === 'atraso');
      } else {
        lista = lista.filter(p => p.status === filtroAtivo);
      }
    }

    // Busca
    if (busca) {
      lista = lista.filter(p =>
        (p.titulo||'').toLowerCase().includes(busca) ||
        (p.descricao||'').toLowerCase().includes(busca) ||
        (p.id||'').toLowerCase().includes(busca)
      );
    }

    // Ordenar: atrasados primeiro, depois por prazo
    lista.sort((a, b) => {
      const pa = calcPrazo(a), pb = calcPrazo(b);
      if (pa.tipo === 'atraso' && pb.tipo !== 'atraso') return -1;
      if (pa.tipo !== 'atraso' && pb.tipo === 'atraso') return 1;
      return (a.prazo || '').localeCompare(b.prazo || '');
    });

    const container = Utils.el('pa-lista');
    if (!container) return;

    if (!lista.length) {
      container.innerHTML = `<div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
        <h3>Nenhum plano encontrado</h3>
        <p>Crie um novo plano ou ajuste os filtros</p>
      </div>`;
      return;
    }

    container.innerHTML = lista.map(p => renderPlanoCard(p)).join('');

    container.querySelectorAll('.pa-card-header').forEach(h => {
      h.addEventListener('click', () => abrirDetalhe(h.dataset.id));
    });
  }

  function renderPlanoCard(p) {
    const prazo   = calcPrazo(p);
    const ats     = atividadesPA.filter(a => a.plano_id === p.id);
    const pct     = calcPctPlano(ats);
    const criador = profissionais.find(u => String(u.id) === String(p.criado_por));

    return `
    <div class="pa-card">
      <div class="pa-card-header" data-id="${p.id}">
        <div class="pa-prio-stripe prio-${p.prioridade}"></div>
        <div class="pa-card-info">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap;">
            <div>
              <div style="font-size:.65rem;font-family:var(--mono);color:var(--gray-400);margin-bottom:3px;">${p.id}</div>
              <div class="pa-titulo">${p.titulo}</div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
              ${prioridadeBadgePA(p.prioridade)}
              ${statusBadgePA(p.status)}
            </div>
          </div>
          <div class="pa-meta">
            <span>📂 ${p.origem || '—'}</span>
            <span>🏭 ${p.setor || '—'}</span>
            <span>👤 ${criador?.nome || '—'}</span>
            <span>📋 ${ats.length} atividade${ats.length !== 1 ? 's' : ''}</span>
            <span class="${prazo.cls}">${prazo.label}</span>
          </div>
          <div class="pa-progresso-wrap">
            <div class="pa-progresso-label">
              <span>Progresso</span>
              <span style="font-weight:600;">${pct}%</span>
            </div>
            <div class="progress">
              <div class="progress-bar ${pct >= 100 ? 'success' : ''}" style="width:${pct}%"></div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }

  // ──────────────────────────────────────────
  // DETALHE DO PLANO
  // ──────────────────────────────────────────
  function abrirDetalhe(id) {
    planoAtual = planos.find(p => String(p.id) === String(id));
    if (!planoAtual) return;
    Utils.el('view-lista').classList.add('hidden');
    Utils.el('view-detalhe').classList.remove('hidden');
    Utils.el('topbar-title').textContent = 'Detalhe do Plano';
    renderDetalhe(planoAtual);
  }

  function renderDetalhe(p) {
    const ats       = atividadesPA.filter(a => a.plano_id === p.id);
    const pct       = calcPctPlano(ats);
    const prazo     = calcPrazo(p);
    const criador   = profissionais.find(u => String(u.id) === String(p.criado_por));
    const aprovador = profissionais.find(u => String(u.id) === String(p.aprovador));
    const aprov     = aprovacoes.find(a => String(a.plano_id) === String(p.id));
    const isSup   = session.perfil === 'supervisor' || session.perfil === 'admin';
    const canEdit = isSup; // técnico NUNCA edita o plano nem adiciona atividades

    Utils.setHTML('pa-detalhe-content', `
      <!-- Voltar -->
      <div style="margin-bottom:1rem;">
        <button class="btn btn-ghost btn-sm" id="btn-voltar-lista">← Voltar à lista</button>
      </div>

      <!-- Header do plano -->
      <div class="pa-detail-header">
        <div class="pa-detail-id">${p.id} · ${p.classificacao || '—'} · ${p.setor || '—'}</div>
        <div class="pa-detail-title">${p.titulo}</div>
        <div class="pa-detail-desc">${p.descricao || '—'}</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;align-items:center;">
          ${prioridadeBadgePA(p.prioridade)}
          ${statusBadgePA(p.status)}
          <span class="${prazo.cls}">${prazo.label}</span>
          <span style="font-size:.72rem;color:var(--gray-400);">Criado por ${criador?.nome || '—'} · ${Utils.fmtDate(p.dt_criacao)}</span>
        </div>
        <!-- Progresso geral -->
        <div style="margin-top:14px;">
          <div style="display:flex;justify-content:space-between;font-size:.72rem;color:rgba(255,255,255,.6);margin-bottom:5px;">
            <span>Progresso geral</span><span style="font-weight:700;color:#fff;">${pct}%</span>
          </div>
          <div style="height:8px;background:rgba(255,255,255,.15);border-radius:99px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${pct>=100?'var(--success)':'rgba(255,255,255,.8)'};border-radius:99px;transition:width .4s;"></div>
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 340px;gap:1.25rem;">
        <!-- Coluna principal -->
        <div>
          <!-- Atividades -->
          <div class="card mb-3">
            <div class="card-header">
              <span class="card-title">📋 Atividades do Plano</span>
              ${isSup ? `<button class="btn btn-primary btn-sm" id="btn-nova-atpa">+ Atividade</button>` : ''}
            </div>
            ${ats.length ? ats.map((a, i) => renderAtividadePAItem(a, i)).join('') : `
              <div class="empty-state" style="padding:24px;">
                <p>${isSup ? 'Nenhuma atividade cadastrada' : 'Nenhuma atividade atribuída a você neste plano'}</p>
              </div>`}
          </div>

          <!-- Aprovação -->
          <div class="card mb-3">
            <div class="card-header"><span class="card-title">✅ Aprovação</span></div>
            ${aprov ? `
              <div class="aprov-box ${aprov.decisao === 'Aprovado' ? 'aprovado' : 'reprovado'}">
                <div style="font-size:1.5rem;">${aprov.decisao === 'Aprovado' ? '✅' : '❌'}</div>
                <div>
                  <div style="font-weight:600;font-size:.875rem;">${aprov.decisao}</div>
                  <div style="font-size:.775rem;color:var(--gray-500);margin-top:2px;">
                    Por ${profissionais.find(u=>String(u.id)===String(aprov.aprovador_id))?.nome || '—'} · ${Utils.fmtDate(aprov.dt_aprovacao)}
                  </div>
                  ${aprov.comentario ? `<div style="font-size:.8rem;margin-top:6px;">${aprov.comentario}</div>` : ''}
                </div>
              </div>` : `
              <div class="aprov-box">
                <div style="font-size:1.25rem;">⏳</div>
                <div>
                  <div style="font-weight:500;font-size:.875rem;">Aguardando aprovação</div>
                  <div style="font-size:.775rem;color:var(--gray-400);margin-top:2px;">
                    Aprovador: ${aprovador?.nome || 'Não definido'}
                  </div>
                </div>
              </div>`}
            ${isSup && !aprov ? `
              <button class="btn btn-primary btn-sm" id="btn-aprovar-plano" style="margin-top:12px;">
                Registrar Aprovação
              </button>` : ''}
          </div>
        </div>

        <!-- Coluna lateral -->
        <div>
          <!-- Info do plano -->
          <div class="card mb-3">
            <div class="card-header">
              <span class="card-title">ℹ️ Informações</span>
              ${canEdit ? `<button class="btn btn-ghost btn-sm btn-icon" id="btn-editar-plano">✏️</button>` : ''}
            </div>
            ${infoRow('Origem',      p.origem)}
            ${infoRow('Classificação', p.classificacao)}
            ${infoRow('Prioridade',  prioridadeBadgePA(p.prioridade))}
            ${infoRow('Setor',       p.setor)}
            ${infoRow('Prazo final', Utils.fmtDate(p.prazo))}
            ${infoRow('Aprovador',   aprovador?.nome || '—')}
            ${p.hh_previsto ? infoRow('HH Previsto', p.hh_previsto + 'h') : ''}
            ${p.mat_previsto ? infoRow('Material Prev.', 'R$ ' + parseFloat(p.mat_previsto).toLocaleString('pt-BR')) : ''}
          </div>

          <!-- Indicadores de prazo -->
          <div class="card mb-3">
            <div class="card-header"><span class="card-title">⏱ Controle de Prazo</span></div>
            ${renderIndicadoresPrazo(ats)}
          </div>

          <!-- Ações -->
          ${isSup ? `
          <div class="card">
            <div class="card-header"><span class="card-title">⚙️ Ações</span></div>
            <div style="display:grid;gap:6px;">
              ${renderBotoesStatus(p.status, isSup)}
            </div>
          </div>` : ''}
        </div>
      </div>
    `);

    // Eventos
    Utils.el('btn-voltar-lista')?.addEventListener('click', voltarLista);
    Utils.el('btn-nova-atpa')?.addEventListener('click', () => abrirModalAtividadePA(p.id));
    Utils.el('btn-editar-plano')?.addEventListener('click', () => abrirModalPlano(p.id));
    Utils.el('btn-aprovar-plano')?.addEventListener('click', () => abrirModalAprovacao(p.id));

    document.querySelectorAll('.btn-editar-atpa').forEach(btn => {
      btn.addEventListener('click', () => abrirModalAtividadePA(p.id, btn.dataset.atId));
    });
    document.querySelectorAll('.btn-del-atpa').forEach(btn => {
      btn.addEventListener('click', () => deletarAtividadePA(btn.dataset.atId));
    });
    // Técnico registra progresso na SUA atividade
    document.querySelectorAll('.btn-registrar-atpa').forEach(btn => {
      btn.addEventListener('click', () => abrirModalRegistroTecnico(p.id, btn.dataset.atId));
    });
    document.querySelectorAll('.btn-mudar-status').forEach(btn => {
      btn.addEventListener('click', () => mudarStatusPlano(p.id, btn.dataset.status));
    });
  }

  function renderAtividadePAItem(a, idx) {
    const resp  = profissionais.find(u => String(u.id) === String(a.responsavel_id));
    const prazo = calcPrazoAt(a);
    const pct   = parseInt(a.pct_concluida) || 0;
    const done  = a.status === 'Concluída';
    const late  = prazo.tipo === 'atraso' && !done;
    // Técnico: pode editar APENAS atividades atribuídas a ele (para registrar progresso %)
    // Supervisor/Admin: pode editar e excluir qualquer atividade
    const canEditAt  = isSup;
    const canFillAt  = !isSup && String(a.responsavel_id) === String(session.id);

    return `
    <div class="atpa-item">
      <div class="atpa-num ${done ? 'done' : late ? 'late' : ''}">${done ? '✓' : late ? '!' : idx+1}</div>
      <div class="atpa-body">
        <div class="atpa-desc ${done ? 'text-muted' : ''}" style="${done ? 'text-decoration:line-through;' : ''}">${a.descricao}</div>
        <div class="atpa-info">
          <span>👤 ${resp?.nome || '—'}</span>
          <span>📅 ${Utils.fmtDate(a.prazo)}</span>
          ${a.dt_conclusao ? `<span>✅ ${Utils.fmtDate(a.dt_conclusao)}</span>` : ''}
          <span class="${prazo.cls}" style="padding:1px 7px;border-radius:99px;font-size:.67rem;font-weight:600;">${prazo.label}</span>
          <span class="badge ${a.status === 'Concluída' ? 'badge-success' : a.status === 'Em andamento' ? 'badge-primary' : 'badge-gray'}">${a.status}</span>
        </div>
        <div class="pct-bar-wrap">
          <div class="pct-bar"><div class="pct-fill ${done ? 'done' : ''}" style="width:${pct}%"></div></div>
          <div class="pct-label">${pct}%</div>
        </div>
        ${a.comentarios ? `<div style="font-size:.75rem;color:var(--gray-500);margin-top:4px;padding:5px 8px;background:var(--gray-50);border-radius:var(--radius-sm);border-left:2px solid var(--gray-300);">${a.comentarios}</div>` : ''}
        ${a.evidencias ? renderEvidenciasRow(a.evidencias) : ''}
      </div>
      <div class="atpa-actions">
        ${canEditAt ? `
          <button class="btn btn-ghost btn-sm btn-icon btn-editar-atpa" data-at-id="${a.id}" title="Editar">✏️</button>
          <button class="btn btn-ghost btn-sm btn-icon btn-del-atpa" data-at-id="${a.id}" title="Excluir" style="color:var(--danger);">🗑</button>
        ` : canFillAt ? `
          <button class="btn btn-primary btn-sm btn-registrar-atpa" data-at-id="${a.id}">Registrar</button>
        ` : ''}
      </div>
    </div>`;
  }

  function renderEvidenciasRow(evStr) {
    try {
      const evs = typeof evStr === 'string' ? JSON.parse(evStr) : evStr;
      if (!evs || !evs.length) return '';
      return `<div class="evidencias-grid">${evs.map(url =>
        url.match(/\.(jpg|jpeg|png|gif|webp)/i)
          ? `<div class="evidencia-item"><img src="${url}" onclick="window.open('${url}','_blank')"></div>`
          : `<div class="evidencia-pdf" onclick="window.open('${url}','_blank')"><span>📄</span><span>PDF</span></div>`
      ).join('')}</div>`;
    } catch { return ''; }
  }

  function renderIndicadoresPrazo(ats) {
    const total   = ats.length;
    const concl   = ats.filter(a => a.status === 'Concluída').length;
    const atras   = ats.filter(a => calcPrazoAt(a).tipo === 'atraso' && a.status !== 'Concluída').length;
    const urgente = ats.filter(a => calcPrazoAt(a).tipo === 'urgente' && a.status !== 'Concluída').length;
    const prazoPlano = calcPrazo(planoAtual);

    return `
      <div style="display:grid;gap:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--gray-100);">
          <span style="font-size:.775rem;color:var(--gray-500);">Plano</span>
          <span class="${prazoPlano.cls}">${prazoPlano.label}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--gray-100);">
          <span style="font-size:.775rem;color:var(--gray-500);">🟢 No prazo</span>
          <span style="font-weight:600;">${total - atras - urgente - concl}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--gray-100);">
          <span style="font-size:.775rem;color:var(--gray-500);">🟡 Vence em 3 dias</span>
          <span style="font-weight:600;color:var(--warning);">${urgente}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--gray-100);">
          <span style="font-size:.775rem;color:var(--gray-500);">🔴 Atrasadas</span>
          <span style="font-weight:600;color:var(--danger);">${atras}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;">
          <span style="font-size:.775rem;color:var(--gray-500);">✅ Concluídas</span>
          <span style="font-weight:600;color:var(--success);">${concl}/${total}</span>
        </div>
      </div>`;
  }

  function renderBotoesStatus(statusAtual, isSup) {
    const fluxo = {
      'Aberto':               ['Em andamento'],
      'Em andamento':         ['Aguardando aprovação','Cancelado'],
      'Aguardando aprovação': isSup ? ['Concluído','Em andamento'] : [],
      'Concluído':            [],
      'Cancelado':            ['Aberto'],
    };
    const proximos = fluxo[statusAtual] || [];
    if (!proximos.length) return '<p class="text-muted text-sm">Nenhuma ação disponível para o status atual.</p>';
    return proximos.map(s => `
      <button class="btn btn-secondary btn-sm btn-mudar-status" data-status="${s}">
        ${s === 'Em andamento' ? '▶' : s === 'Aguardando aprovação' ? '📤' : s === 'Concluído' ? '✅' : s === 'Cancelado' ? '❌' : '↩️'} ${s}
      </button>`).join('');
  }

  function infoRow(label, val) {
    return `<div class="info-row" style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--gray-50);">
      <span style="font-size:.72rem;color:var(--gray-400);">${label}</span>
      <span style="font-size:.8rem;font-weight:500;text-align:right;">${val || '—'}</span>
    </div>`;
  }

  function voltarLista() {
    planoAtual = null;
    Utils.el('view-detalhe').classList.add('hidden');
    Utils.el('view-lista').classList.remove('hidden');
    Utils.el('topbar-title').textContent = 'Planos de Ação';
    renderLista();
  }

  // ──────────────────────────────────────────
  // MODAL PLANO
  // ──────────────────────────────────────────
  function abrirModalPlano(id = null) {
    const p = id ? planos.find(x => String(x.id) === String(id)) : null;

    // Preencher aprovadores
    const sel = Utils.el('plano-aprovador');
    if (sel) {
      sel.innerHTML = '<option value="">— Selecione —</option>' +
        profissionais.filter(u => u.perfil === 'supervisor' || u.perfil === 'admin')
          .map(u => `<option value="${u.id}" ${p?.aprovador === u.id ? 'selected' : ''}>${u.nome}</option>`).join('');
    }

    Utils.el('plano-id').value        = p?.id || '';
    Utils.el('plano-titulo').value    = p?.titulo || '';
    Utils.el('plano-desc').value      = p?.descricao || '';
    Utils.el('plano-origem').value    = p?.origem || 'Manutenção';
    Utils.el('plano-classif').value   = p?.classificacao || 'Manutenção';
    Utils.el('plano-prio').value      = p?.prioridade || 'Média';
    Utils.el('plano-prazo').value     = p?.prazo || '';
    Utils.el('plano-setor').value     = p?.setor || 'Elétrica';
    Utils.el('plano-hh-prev').value   = p?.hh_previsto || '';
    Utils.el('plano-mat-prev').value  = p?.mat_previsto || '';

    Utils.el('modal-plano-title').textContent = p ? 'Editar Plano' : 'Novo Plano de Ação';
    Utils.openModal('modal-plano');
  }

  async function salvarPlano() {
    const btn = Utils.el('btn-salvar-plano');
    btn.disabled = true;
    try {
      const dados = {
        id:           Utils.el('plano-id').value,
        titulo:       Utils.el('plano-titulo').value.trim(),
        descricao:    Utils.el('plano-desc').value.trim(),
        origem:       Utils.el('plano-origem').value,
        classificacao:Utils.el('plano-classif').value,
        prioridade:   Utils.el('plano-prio').value,
        prazo:        Utils.el('plano-prazo').value,
        setor:        Utils.el('plano-setor').value,
        aprovador:    Utils.el('plano-aprovador').value,
        hh_previsto:  Utils.el('plano-hh-prev').value,
        mat_previsto: Utils.el('plano-mat-prev').value,
        criado_por:   session.id,
      };
      await API.savePlano(dados);
      Utils.closeModal('modal-plano');
      Utils.toast('Plano salvo!', 'success');
      await carregarTudo(true);
      if (planoAtual && dados.id) renderDetalhe(planos.find(p => String(p.id) === String(dados.id)) || planoAtual);
      else renderLista();
    } catch (e) {
      Utils.toast('Erro: ' + e.message, 'error');
    } finally { btn.disabled = false; }
  }

  // ──────────────────────────────────────────
  // MODAL REGISTRO TÉCNICO (simplificado)
  // ──────────────────────────────────────────
  function abrirModalRegistroTecnico(planoId, atId) {
    const at = atividadesPA.find(x => String(x.id) === String(atId));
    if (!at) return;

    // Reutiliza o modal de atividade mas com campos restritos
    evidenciasTemp = [];

    Utils.el('atpa-id').value          = at.id;
    Utils.el('atpa-plano-id').value    = planoId;
    Utils.el('atpa-desc').value        = at.descricao || '';
    Utils.el('atpa-desc').readOnly     = true;
    Utils.el('atpa-pct').value         = at.pct_concluida || 0;
    Utils.el('atpa-inicio').value      = at.dt_inicio || '';
    Utils.el('atpa-prazo').value       = at.prazo || '';
    Utils.el('atpa-conclusao').value   = at.dt_conclusao || '';
    Utils.el('atpa-status').value      = at.status || 'Não iniciada';
    Utils.el('atpa-comentarios').value = at.comentarios || '';
    Utils.el('atpa-fotos-grid').innerHTML = '';

    // Bloquear campos que técnico não pode alterar
    Utils.el('atpa-desc').style.background   = 'var(--gray-50)';
    Utils.el('atpa-inicio').readOnly          = true;
    Utils.el('atpa-prazo').readOnly           = true;

    // Esconder campo de responsável (técnico não troca responsável)
    const respGroup = Utils.el('atpa-resp')?.closest('.form-group');
    if (respGroup) respGroup.style.display = 'none';

    Utils.el('modal-atpa-title').textContent = '📋 Registrar Andamento';
    Utils.openModal('modal-atividade-pa');
  }

  // ──────────────────────────────────────────
  // MODAL ATIVIDADE PA
  // ──────────────────────────────────────────
  function abrirModalAtividadePA(planoId, atId = null) {
    const at = atId ? atividadesPA.find(x => String(x.id) === String(atId)) : null;
    evidenciasTemp = [];

    // Garantir campos desbloqueados para supervisor/admin
    ['atpa-desc','atpa-inicio','atpa-prazo'].forEach(id => {
      const el = Utils.el(id);
      if (el) { el.readOnly = false; el.style.background = ''; }
    });
    const respGroup = Utils.el('atpa-resp')?.closest('.form-group');
    if (respGroup) respGroup.style.display = '';

    // Responsáveis
    const sel = Utils.el('atpa-resp');
    if (sel) {
      sel.innerHTML = '<option value="">— Selecione —</option>' +
        profissionais.map(u => `<option value="${u.id}" ${at?.responsavel_id === u.id ? 'selected':''}>${u.nome}</option>`).join('');
    }

    Utils.el('atpa-id').value          = at?.id || '';
    Utils.el('atpa-plano-id').value    = planoId;
    Utils.el('atpa-desc').value        = at?.descricao || '';
    Utils.el('atpa-pct').value         = at?.pct_concluida || 0;
    Utils.el('atpa-inicio').value      = at?.dt_inicio || '';
    Utils.el('atpa-prazo').value       = at?.prazo || '';
    Utils.el('atpa-conclusao').value   = at?.dt_conclusao || '';
    Utils.el('atpa-status').value      = at?.status || 'Não iniciada';
    Utils.el('atpa-comentarios').value = at?.comentarios || '';
    Utils.el('atpa-fotos-grid').innerHTML = '';

    Utils.el('modal-atpa-title').textContent = at ? 'Editar Atividade' : 'Nova Atividade';
    Utils.openModal('modal-atividade-pa');
  }

  async function salvarAtividadePA() {
    const btn = Utils.el('btn-salvar-atpa');
    btn.disabled = true;
    Utils.showLoading('Salvando...');
    try {
      // Upload evidências
      const links = [];
      for (const ev of evidenciasTemp) {
        try {
          const res = await API.uploadFotoPA(ev.base64, ev.mimeType, Utils.el('atpa-plano-id').value);
          links.push(res.url);
        } catch {}
      }

      await API.saveAtividadePA({
        id:             Utils.el('atpa-id').value,
        plano_id:       Utils.el('atpa-plano-id').value,
        descricao:      Utils.el('atpa-desc').value.trim(),
        responsavel_id: Utils.el('atpa-resp').value,
        pct_concluida:  parseInt(Utils.el('atpa-pct').value) || 0,
        dt_inicio:      Utils.el('atpa-inicio').value,
        prazo:          Utils.el('atpa-prazo').value,
        dt_conclusao:   Utils.el('atpa-conclusao').value,
        status:         Utils.el('atpa-status').value,
        comentarios:    Utils.el('atpa-comentarios').value.trim(),
        evidencias:     JSON.stringify(links),
      });

      Utils.closeModal('modal-atividade-pa');
      Utils.toast('Atividade salva!', 'success');
      await carregarTudo(true);
      if (planoAtual) renderDetalhe(planos.find(p => String(p.id) === String(planoAtual.id)) || planoAtual);
    } catch (e) {
      Utils.toast('Erro: ' + e.message, 'error');
    } finally {
      Utils.hideLoading();
      btn.disabled = false;
    }
  }

  async function deletarAtividadePA(id) {
    if (!confirm('Excluir esta atividade?')) return;
    try {
      await API.deletarAtividadePA(id);
      Utils.toast('Excluída!', 'success');
      await carregarTudo(true);
      if (planoAtual) renderDetalhe(planos.find(p => String(p.id) === String(planoAtual.id)) || planoAtual);
    } catch (e) { Utils.toast('Erro: ' + e.message, 'error'); }
  }

  async function mudarStatusPlano(planoId, novoStatus) {
    try {
      await API.mudarStatusPlano({ id: planoId, status: novoStatus });
      Utils.toast(`Plano movido para: ${novoStatus}`, 'success');
      await carregarTudo(true);
      const pAtualizado = planos.find(p => String(p.id) === String(planoId));
      if (pAtualizado) { planoAtual = pAtualizado; renderDetalhe(pAtualizado); }
    } catch (e) { Utils.toast('Erro: ' + e.message, 'error'); }
  }

  // ──────────────────────────────────────────
  // APROVAÇÃO
  // ──────────────────────────────────────────
  function abrirModalAprovacao(planoId) {
    decidedStatus = null;
    Utils.el('aprov-plano-id').value    = planoId;
    Utils.el('aprov-comentario').value  = '';
    document.querySelectorAll('#btn-aprovar, #btn-reprovar').forEach(b => b.className = 'status-btn');
    Utils.openModal('modal-aprovacao');
  }

  window.selecionarDecisao = (d) => {
    decidedStatus = d;
    Utils.el('btn-aprovar').className  = 'status-btn' + (d === 'Aprovado'  ? ' active-ok'  : '');
    Utils.el('btn-reprovar').className = 'status-btn' + (d === 'Reprovado' ? ' active-nok' : '');
  };

  async function confirmarAprovacao() {
    if (!decidedStatus) { Utils.toast('Selecione Aprovar ou Reprovar', 'error'); return; }
    const btn = Utils.el('btn-confirmar-aprovacao');
    btn.disabled = true;
    try {
      await API.registrarAprovacaoPA({
        plano_id:     Utils.el('aprov-plano-id').value,
        aprovador_id: session.id,
        decisao:      decidedStatus,
        comentario:   Utils.el('aprov-comentario').value.trim(),
        dt_aprovacao: new Date().toISOString().slice(0,10),
      });
      if (decidedStatus === 'Aprovado') {
        await API.mudarStatusPlano({ id: Utils.el('aprov-plano-id').value, status: 'Concluído' });
      }
      Utils.closeModal('modal-aprovacao');
      Utils.toast('Aprovação registrada!', 'success');
      await carregarTudo(true);
      if (planoAtual) renderDetalhe(planos.find(p => String(p.id) === String(planoAtual.id)) || planoAtual);
    } catch (e) { Utils.toast('Erro: ' + e.message, 'error'); }
    finally { btn.disabled = false; }
  }

  // ──────────────────────────────────────────
  // EVIDÊNCIAS
  // ──────────────────────────────────────────
  async function handleEvidencias() {
    const input = Utils.el('atpa-fotos');
    const grid  = Utils.el('atpa-fotos-grid');
    if (!input || !grid) return;
    const files = Array.from(input.files).slice(0, 5);
    for (const file of files) {
      const base64 = await Utils.fileToBase64(file);
      evidenciasTemp.push({ base64, mimeType: file.type, name: file.name });
      const isPDF = file.type === 'application/pdf';
      const wrap  = document.createElement('div');
      if (isPDF) {
        wrap.className = 'evidencia-pdf';
        wrap.innerHTML = '<span>📄</span><span style="font-size:.6rem;">' + file.name.slice(0,10) + '</span>';
      } else {
        wrap.className = 'evidencia-item';
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        wrap.appendChild(img);
      }
      grid.appendChild(wrap);
    }
    input.value = '';
  }

  // ──────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────
  function calcPrazo(p) {
    if (!p.prazo || p.status === 'Concluído' || p.status === 'Cancelado')
      return { label: p.status === 'Concluído' ? '✅ Concluído' : p.status || '—', cls: 'prazo-ok', tipo: 'ok' };
    const dias = Math.ceil((new Date(p.prazo) - new Date()) / 86400000);
    if (dias < 0)  return { label: `🔴 ${Math.abs(dias)}d atraso`, cls: 'prazo-atraso', tipo: 'atraso' };
    if (dias <= 3) return { label: `🟡 Vence em ${dias}d`,         cls: 'prazo-urgente', tipo: 'urgente' };
    return             { label: `🟢 ${dias}d restantes`,           cls: 'prazo-ok', tipo: 'ok' };
  }

  function calcPrazoAt(a) {
    if (!a.prazo || a.status === 'Concluída')
      return { label: a.status === 'Concluída' ? '✅' : '—', cls: 'prazo-ok', tipo: 'ok' };
    const dias = Math.ceil((new Date(a.prazo) - new Date()) / 86400000);
    if (dias < 0)  return { label: `${Math.abs(dias)}d atraso`, cls: 'prazo-atraso', tipo: 'atraso' };
    if (dias <= 3) return { label: `${dias}d`,                  cls: 'prazo-urgente', tipo: 'urgente' };
    return             { label: `${dias}d`,                     cls: 'prazo-ok', tipo: 'ok' };
  }

  function calcPctPlano(ats) {
    if (!ats.length) return 0;
    return Math.round(ats.reduce((s, a) => s + (parseInt(a.pct_concluida) || 0), 0) / ats.length);
  }

  function prioridadeBadgePA(p) {
    const m = { Baixa:'badge-success', Média:'badge-info', Alta:'badge-warning', Crítica:'badge-danger' };
    return `<span class="badge ${m[p]||'badge-gray'}">${p||'—'}</span>`;
  }

  function statusBadgePA(s) {
    const m = {
      'Aberto':               'badge-info',
      'Em andamento':         'badge-primary',
      'Aguardando aprovação': 'badge-warning',
      'Concluído':            'badge-success',
      'Cancelado':            'badge-gray',
    };
    return `<span class="badge ${m[s]||'badge-gray'}">${s||'—'}</span>`;
  }

})();

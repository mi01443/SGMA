/**
 * plano-acao.js — Módulo Plano de Ação SGMA
 * Planilha separada via PA_SCRIPT_URL
 */
(async () => {
  const session = Auth.requireAuth(['tecnico','supervisor','admin']);
  if (!session) return;
  Auth.initUserUI(session);
  Utils.initSidebar();

  const isSup = session.perfil === 'supervisor' || session.perfil === 'admin';

  let planos        = [];
  let profissionais = [];
  let atividadesPA  = [];
  let aprovacoes    = [];
  let planoAtual    = null;
  let filtroAtivo   = 'todos';
  let decidedStatus = null;
  let evidenciasTemp= [];

  // Esconder "Novo Plano" para técnico
  if (!isSup) {
    const btn = Utils.el('btn-novo-plano');
    if (btn) btn.style.display = 'none';
  }

  await carregarTudo();
  bindEvents();
  renderLista();

  setInterval(async () => {
    await carregarTudo(true);
    if (planoAtual) {
      planoAtual = planos.find(p => String(p.id) === String(planoAtual.id)) || planoAtual;
      renderDetalhe(planoAtual);
    } else {
      renderLista();
    }
  }, 10000);

  // ════════════════════════════════════════
  // DADOS
  // ════════════════════════════════════════
  async function carregarTudo(silent = false) {
    if (!silent) Utils.showLoading('Carregando...');
    try {
      const [pRes, profRes, atRes, apRes] = await Promise.all([
        API.getPlanos(),
        API.getProfissionais(),
        API.getAtividadesPA(),
        API.getAprovacoesPA(),
      ]);
      planos        = pRes.planos          || [];
      profissionais = profRes.profissionais || [];
      atividadesPA  = atRes.atividades     || [];
      aprovacoes    = apRes.aprovacoes     || [];
    } catch(e) {
      if (!silent) Utils.toast('Erro: ' + e.message, 'error');
    } finally {
      if (!silent) Utils.hideLoading();
    }
  }

  // ════════════════════════════════════════
  // BIND EVENTS
  // ════════════════════════════════════════
  function bindEvents() {
    document.querySelectorAll('.filter-chip[data-filter]').forEach(c => {
      c.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip[data-filter]').forEach(x => x.classList.remove('active'));
        c.classList.add('active');
        filtroAtivo = c.dataset.filter;
        renderLista();
      });
    });

    Utils.el('pa-search')?.addEventListener('input', renderLista);

    if (isSup) {
      Utils.el('btn-novo-plano')?.addEventListener('click', () => abrirModalPlano());
      Utils.el('form-plano')?.addEventListener('submit', async e => { e.preventDefault(); await salvarPlano(); });
      Utils.el('btn-confirmar-aprovacao')?.addEventListener('click', confirmarAprovacao);
    }

    // form-atpa usa onsubmit dinâmico (definido em abrirModalAtPA / abrirModalProgresso)
    Utils.el('atpa-fotos')?.addEventListener('change', handleEvidencias);
  }

  // ════════════════════════════════════════
  // STATS
  // ════════════════════════════════════════
  function renderStats(lista) {
    const total    = lista.length;
    const abertos  = lista.filter(p => p.status === 'Aberto').length;
    const andamento= lista.filter(p => p.status === 'Em andamento').length;
    const conc     = lista.filter(p => p.status === 'Concluído').length;
    const atras    = lista.filter(p => calcPrazo(p).tipo === 'atraso' && p.status !== 'Concluído' && p.status !== 'Cancelado').length;
    const agAprov  = lista.filter(p => p.status === 'Aguardando aprovação').length;

    Utils.setHTML('pa-stats', `
      <div class="pa-stat-card" onclick="setFiltro('todos')">
        <div class="pa-stat-num">${total}</div>
        <div class="pa-stat-lbl">Total</div>
      </div>
      <div class="pa-stat-card pa-stat-info" onclick="setFiltro('Aberto')">
        <div class="pa-stat-num">${abertos}</div>
        <div class="pa-stat-lbl">Abertos</div>
      </div>
      <div class="pa-stat-card pa-stat-primary" onclick="setFiltro('Em andamento')">
        <div class="pa-stat-num">${andamento}</div>
        <div class="pa-stat-lbl">Em andamento</div>
      </div>
      <div class="pa-stat-card pa-stat-warning" onclick="setFiltro('Aguardando aprovação')">
        <div class="pa-stat-num">${agAprov}</div>
        <div class="pa-stat-lbl">Ag. aprovação</div>
      </div>
      <div class="pa-stat-card pa-stat-success" onclick="setFiltro('Concluído')">
        <div class="pa-stat-num">${conc}</div>
        <div class="pa-stat-lbl">Concluídos</div>
      </div>
      <div class="pa-stat-card pa-stat-danger" onclick="setFiltro('atrasado')">
        <div class="pa-stat-num">${atras}</div>
        <div class="pa-stat-lbl">🔴 Atrasados</div>
      </div>
    `);
    document.querySelectorAll('.pa-stat-card').forEach(c => {
      c.style.cursor = 'pointer';
    });
  }

  window.setFiltro = (f) => {
    filtroAtivo = f;
    document.querySelectorAll('.filter-chip[data-filter]').forEach(c => {
      c.classList.toggle('active', c.dataset.filter === f || (f === 'todos' && c.dataset.filter === 'todos'));
    });
    renderLista();
  };

  // ════════════════════════════════════════
  // LISTA
  // ════════════════════════════════════════
  function renderLista() {
    let lista = [...planos];

    // Técnico vê apenas planos com atividades atribuídas a ele
    if (!isSup) {
      const meus = new Set(atividadesPA.filter(a => String(a.responsavel_id) === String(session.id)).map(a => String(a.plano_id)));
      lista = lista.filter(p => meus.has(String(p.id)));
    }

    // Filtro
    if (filtroAtivo !== 'todos') {
      if (filtroAtivo === 'atrasado') lista = lista.filter(p => calcPrazo(p).tipo === 'atraso' && p.status !== 'Concluído' && p.status !== 'Cancelado');
      else lista = lista.filter(p => p.status === filtroAtivo);
    }

    // Busca
    const busca = (Utils.el('pa-search')?.value || '').toLowerCase().trim();
    if (busca) lista = lista.filter(p => (p.titulo||'').toLowerCase().includes(busca) || (p.id||'').toLowerCase().includes(busca));

    // Ordenar: atrasados e ag.aprovação primeiro
    lista.sort((a, b) => {
      const pa = calcPrazo(a), pb = calcPrazo(b);
      const pa_score = a.status === 'Aguardando aprovação' ? 0 : pa.tipo === 'atraso' ? 1 : pa.tipo === 'urgente' ? 2 : 3;
      const pb_score = b.status === 'Aguardando aprovação' ? 0 : pb.tipo === 'atraso' ? 1 : pb.tipo === 'urgente' ? 2 : 3;
      return pa_score - pb_score || (a.prazo||'').localeCompare(b.prazo||'');
    });

    renderStats(lista);

    const container = Utils.el('pa-lista');
    if (!container) return;

    if (!lista.length) {
      container.innerHTML = `<div class="pa-empty">
        <div class="pa-empty-icon">📋</div>
        <div class="pa-empty-title">${!isSup ? 'Nenhum plano atribuído a você' : 'Nenhum plano encontrado'}</div>
        <div class="pa-empty-sub">${!isSup ? 'Quando um plano for atribuído, aparecerá aqui.' : 'Crie um novo plano de ação.'}</div>
        ${isSup ? `<button class="btn btn-primary" onclick="abrirModalPlano()" style="margin-top:1rem;">+ Novo Plano</button>` : ''}
      </div>`;
      return;
    }

    container.innerHTML = lista.map(p => renderPlanoCard(p)).join('');
    container.querySelectorAll('.pa-card-click').forEach(el => {
      el.addEventListener('click', () => abrirDetalhe(el.dataset.id));
    });
  }

  function renderPlanoCard(p) {
    const prazo   = calcPrazo(p);
    const ats     = atividadesPA.filter(a => String(a.plano_id) === String(p.id));
    const minhasAt= !isSup ? ats.filter(a => String(a.responsavel_id) === String(session.id)) : ats;
    const pct     = calcPct(ats);
    const concl   = ats.filter(a => a.status === 'Concluída').length;
    const finalizado = p.status === 'Concluído' || p.status === 'Cancelado';

    return `
    <div class="pa-card ${finalizado ? 'pa-card-done' : ''}" data-id="${p.id}">
      <div class="pa-card-stripe prio-${p.prioridade}"></div>
      <div class="pa-card-body pa-card-click" data-id="${p.id}">
        <div class="pa-card-top">
          <div class="pa-card-left">
            <div class="pa-card-id">${p.id}</div>
            <div class="pa-card-titulo">${p.titulo}</div>
            <div class="pa-card-meta">
              <span>📂 ${p.origem||'—'}</span>
              <span>🏭 ${p.setor||'—'}</span>
              <span>📋 ${ats.length} atividade${ats.length!==1?'s':''}</span>
              ${!isSup ? `<span>👤 Você tem ${minhasAt.length} atividade${minhasAt.length!==1?'s':''}</span>` : ''}
            </div>
          </div>
          <div class="pa-card-right">
            ${badgePrio(p.prioridade)}
            ${badgeStatus(p.status)}
            <div class="pa-prazo-badge ${prazo.cls}">${prazo.label}</div>
          </div>
        </div>
        <div class="pa-card-progress">
          <div class="pa-card-progress-info">
            <span>${concl}/${ats.length} concluídas</span>
            <span class="pa-card-pct">${pct}%</span>
          </div>
          <div class="pa-progress-bar">
            <div class="pa-progress-fill ${pct>=100?'done':prazo.tipo==='atraso'?'danger':''}" style="width:${pct}%"></div>
          </div>
        </div>
      </div>
      ${isSup ? `
      <div class="pa-card-actions">
        <button class="btn btn-ghost btn-icon" onclick="event.stopPropagation();abrirModalPlano('${p.id}')" title="Editar" ${finalizado?'disabled':''}>✏️</button>
      </div>` : ''}
    </div>`;
  }

  // ════════════════════════════════════════
  // DETALHE DO PLANO
  // ════════════════════════════════════════
  window.abrirDetalhe = async (id) => {
    planoAtual = planos.find(p => String(p.id) === String(id));
    if (!planoAtual) return;
    Utils.el('view-lista').classList.add('hidden');
    Utils.el('view-detalhe').classList.remove('hidden');
    Utils.el('topbar-title').textContent = 'Detalhe do Plano';
    renderDetalhe(planoAtual);
  };

  function renderDetalhe(p) {
    const ats       = atividadesPA.filter(a => String(a.plano_id) === String(p.id));
    const minhasAt  = !isSup ? ats.filter(a => String(a.responsavel_id) === String(session.id)) : ats;
    const pct       = calcPct(ats);
    const prazo     = calcPrazo(p);
    const aprov     = aprovacoes.find(a => String(a.plano_id) === String(p.id));
    const aprovador = profissionais.find(u => String(u.id) === String(p.aprovador_id));
    const criador   = profissionais.find(u => String(u.id) === String(p.criado_por));
    const finalizado= p.status === 'Concluído' || p.status === 'Cancelado';

    Utils.setHTML('pa-detalhe-content', `
      <!-- Voltar -->
      <button class="pa-btn-voltar" id="btn-voltar">← Voltar</button>

      <!-- Hero do plano -->
      <div class="pa-hero ${finalizado ? 'pa-hero-done' : ''}">
        <div class="pa-hero-top">
          <div>
            <div class="pa-hero-id">${p.id} · ${p.classificacao||'—'} · ${p.setor||'—'}</div>
            <div class="pa-hero-titulo">${p.titulo}</div>
            <div class="pa-hero-desc">${p.descricao||'—'}</div>
          </div>
          <div class="pa-hero-badges">
            ${badgePrio(p.prioridade)}
            ${badgeStatus(p.status)}
            <div class="pa-prazo-badge ${prazo.cls}">${prazo.label}</div>
            ${finalizado ? '<span class="pa-locked-badge">🔒 Finalizado</span>' : ''}
          </div>
        </div>
        <div class="pa-hero-progress">
          <div class="pa-hero-pct-row">
            <span>Progresso geral</span>
            <span class="pa-hero-pct-num">${pct}%</span>
          </div>
          <div class="pa-hero-bar">
            <div class="pa-hero-bar-fill ${pct>=100?'done':''}" style="width:${pct}%"></div>
          </div>
          <div class="pa-hero-counts">
            <span>✅ ${ats.filter(a=>a.status==='Concluída').length} concluídas</span>
            <span>⏳ ${ats.filter(a=>a.status==='Em andamento').length} em andamento</span>
            <span>🔲 ${ats.filter(a=>a.status==='Não iniciada').length} não iniciadas</span>
            ${ats.filter(a=>calcPrazoAt(a).tipo==='atraso'&&a.status!=='Concluída').length ? `<span class="text-danger">🔴 ${ats.filter(a=>calcPrazoAt(a).tipo==='atraso'&&a.status!=='Concluída').length} atrasadas</span>` : ''}
          </div>
        </div>
      </div>

      <!-- Grid principal -->
      <div class="pa-detail-grid">
        <!-- Coluna principal: atividades -->
        <div class="pa-detail-main">

          <!-- Atividades -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">📋 ${isSup ? 'Atividades do Plano' : 'Minhas Atividades'}</span>
              ${isSup && !finalizado ? `<button class="btn btn-primary btn-sm" id="btn-nova-atpa">+ Nova Atividade</button>` : ''}
            </div>

            ${(isSup ? ats : minhasAt).length === 0 ? `
              <div class="pa-empty" style="padding:1.5rem;">
                <div class="pa-empty-icon" style="font-size:1.5rem;">📭</div>
                <div class="pa-empty-title">${isSup ? 'Nenhuma atividade cadastrada' : 'Nenhuma atividade atribuída a você'}</div>
              </div>
            ` : (isSup ? ats : minhasAt).map((a, i) => renderAtItem(a, i, finalizado)).join('')}
          </div>

          <!-- Aprovação -->
          ${isSup ? renderBoxAprovacao(p, aprov, aprovador, finalizado) : ''}


        </div>

        <!-- Coluna lateral: info -->
        <div class="pa-detail-side">
          <!-- Informações -->
          <div class="card pa-info-card">
            <div class="card-header">
              <span class="card-title">ℹ️ Informações</span>
              ${isSup && !finalizado ? `<button class="btn btn-ghost btn-sm" id="btn-edit-plano">✏️ Editar</button>` : ''}
            </div>
            ${paInfoRow('Origem',       p.origem)}
            ${paInfoRow('Classificação',p.classificacao)}
            ${paInfoRow('Prioridade',   badgePrio(p.prioridade))}
            ${paInfoRow('Setor',        p.setor)}
            ${paInfoRow('Criado por',   criador?.nome || '—')}
            ${paInfoRow('Criado em',    Utils.fmtDate(p.dt_criacao))}
            ${paInfoRow('Prazo final',  `<strong>${Utils.fmtDate(p.prazo)}</strong>`)}
            ${paInfoRow('Aprovador',    aprovador?.nome || '—')}
            ${p.hh_previsto  ? paInfoRow('HH Previsto',     p.hh_previsto + 'h') : ''}
            ${p.mat_previsto ? paInfoRow('Material Prev.',  'R$ ' + parseFloat(p.mat_previsto||0).toLocaleString('pt-BR')) : ''}
            ${p.obs_encerramento ? `<div style="margin-top:10px;padding:8px 10px;background:var(--gray-50);border-radius:var(--radius);border-left:3px solid var(--gray-300);font-size:.8rem;">${p.obs_encerramento}</div>` : ''}
          </div>

          <!-- Controle de prazo por atividade -->
          <div class="card">
            <div class="card-header"><span class="card-title">⏱ Prazo por atividade</span></div>
            ${ats.length ? ats.map(a => {
              const pr = calcPrazoAt(a);
              const resp = profissionais.find(u => String(u.id) === String(a.responsavel_id));
              return `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--gray-100);">
                <div style="min-width:0;flex:1;">
                  <div style="font-size:.775rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${a.descricao||'—'}</div>
                  <div style="font-size:.68rem;color:var(--gray-400);">${resp?.nome||'—'}</div>
                </div>
                <span class="pa-prazo-badge ${pr.cls}" style="margin-left:8px;flex-shrink:0;">${pr.label}</span>
              </div>`;
            }).join('') : '<p class="text-muted text-sm">Sem atividades</p>'}
          </div>

          <!-- Ações (só supervisor) -->
          ${isSup && !finalizado ? `
          <div class="card">
            <div class="card-header"><span class="card-title">⚙️ Ações do Plano</span></div>
            <div style="display:grid;gap:8px;">
              ${renderBotoesFluxo(p.status)}
              <button class="btn btn-danger btn-sm" id="btn-encerrar-plano">🔒 Encerrar definitivamente</button>
            </div>
          </div>` : ''}
        </div>
      </div>
    `);

    // ── Eventos ──
    Utils.el('btn-voltar')?.addEventListener('click', voltarLista);
    Utils.el('btn-nova-atpa')?.addEventListener('click', () => abrirModalAtPA(p.id));
    Utils.el('btn-edit-plano')?.addEventListener('click', () => abrirModalPlano(p.id));
    Utils.el('btn-aprovar-plano')?.addEventListener('click', () => abrirModalAprovacao(p.id));


    // Atividades: editar (sup) ou registrar progresso (tec)
    document.querySelectorAll('.btn-edit-at').forEach(btn => {
      btn.addEventListener('click', () => abrirModalAtPA(p.id, btn.dataset.id));
    });
    document.querySelectorAll('.btn-del-at').forEach(btn => {
      btn.addEventListener('click', () => deletarAt(btn.dataset.id));
    });
    document.querySelectorAll('.btn-progresso-at').forEach(btn => {
      btn.addEventListener('click', () => abrirModalProgresso(btn.dataset.id));
    });

    // Status flow
    document.querySelectorAll('.btn-fluxo').forEach(btn => {
      btn.addEventListener('click', () => mudarStatus(p.id, btn.dataset.status));
    });

    // Encerrar
    Utils.el('btn-encerrar-plano')?.addEventListener('click', () => abrirEncerramento(p.id));
  }

  // ── Renderizar item de atividade ──
  function renderAtItem(a, idx, finalizado) {
    const resp  = profissionais.find(u => String(u.id) === String(a.responsavel_id));
    const prazo = calcPrazoAt(a);
    const pct   = parseInt(a.pct_concluida) || 0;
    const done  = a.status === 'Concluída';
    const canc  = a.status === 'Cancelada';
    const atFinalizada = done || canc;
    const isMinha = String(a.responsavel_id) === String(session.id);
    const canReg   = !isSup && isMinha && !atFinalizada && !finalizado;
    const canEdit  = isSup && !finalizado;
    const canDel   = isSup && !atFinalizada && !finalizado;

    let evids = [];
    try { evids = JSON.parse(a.evidencias || '[]'); } catch{}

    return `
    <div class="pa-at-item ${done?'pa-at-done':''} ${canc?'pa-at-canc':''}">
      <div class="pa-at-num ${done?'num-done':prazo.tipo==='atraso'&&!atFinalizada?'num-late':''}">${done?'✓':prazo.tipo==='atraso'&&!atFinalizada?'!':idx+1}</div>
      <div class="pa-at-body">
        <div class="pa-at-header">
          <div class="pa-at-desc ${done||canc?'text-done':''}">${a.descricao}</div>
          <div class="pa-at-btns">
            ${canEdit  ? `<button class="btn btn-ghost btn-sm btn-icon btn-edit-at" data-id="${a.id}" title="Editar">✏️</button>` : ''}
            ${canDel   ? `<button class="btn btn-ghost btn-sm btn-icon btn-del-at"  data-id="${a.id}" title="Excluir" style="color:var(--danger);">🗑</button>` : ''}
            ${canReg   ? `<button class="btn btn-primary btn-sm btn-progresso-at" data-id="${a.id}">📝 Registrar</button>` : ''}
          </div>
        </div>
        <div class="pa-at-meta">
          <span>👤 ${resp?.nome||'—'}</span>
          <span>📅 Prazo: ${Utils.fmtDate(a.prazo)}</span>
          ${a.dt_conclusao ? `<span>✅ Concluída: ${Utils.fmtDate(a.dt_conclusao)}</span>` : ''}
          <span class="pa-prazo-badge ${prazo.cls}" style="font-size:.65rem;">${prazo.label}</span>
          <span class="badge ${done?'badge-success':canc?'badge-gray':a.status==='Em andamento'?'badge-primary':'badge-gray'}">${a.status}</span>
          ${atFinalizada ? '<span style="font-size:.65rem;color:var(--gray-400);">🔒 campos bloqueados</span>' : ''}
        </div>
        <!-- Barra de progresso -->
        <div class="pa-at-pct-row">
          <div class="pa-at-pct-bar">
            <div class="pa-at-pct-fill ${done?'done':''}" style="width:${pct}%"></div>
          </div>
          <span class="pa-at-pct-num">${pct}%</span>
        </div>
        ${a.comentarios ? `<div class="pa-at-comentario">${a.comentarios}</div>` : ''}
        ${evids.length ? `<div class="pa-at-evidencias">${evids.map(url =>
          url.match(/\.(jpg|jpeg|png|gif|webp)/i)
            ? `<img src="${url}" class="pa-ev-img" onclick="window.open('${url}','_blank')">`
            : `<div class="pa-ev-pdf" onclick="window.open('${url}','_blank')">📄 PDF</div>`
        ).join('')}</div>` : ''}
      </div>
    </div>`;
  }

  // ── Box aprovação ──
  function renderBoxAprovacao(p, aprov, aprovador, finalizado) {
    const agAprov = p.status === 'Aguardando aprovação';
    return `
    <div class="card">
      <div class="card-header"><span class="card-title">✅ Aprovação</span></div>
      ${aprov ? `
        <div class="pa-aprov-box ${aprov.decisao==='Aprovado'?'aprov-ok':'aprov-nok'}">
          <div class="pa-aprov-icon">${aprov.decisao==='Aprovado'?'✅':'❌'}</div>
          <div>
            <div class="pa-aprov-decisao">${aprov.decisao}</div>
            <div class="pa-aprov-meta">Por ${profissionais.find(u=>String(u.id)===String(aprov.aprovador_id))?.nome||'—'} · ${Utils.fmtDate(aprov.dt_aprovacao)}</div>
            ${aprov.comentario?`<div class="pa-aprov-comentario">${aprov.comentario}</div>`:''}
          </div>
        </div>
      ` : `
        <div class="pa-aprov-box aprov-pending">
          <div class="pa-aprov-icon">⏳</div>
          <div>
            <div class="pa-aprov-decisao">Aguardando aprovação</div>
            <div class="pa-aprov-meta">Aprovador: ${aprovador?.nome||'Não definido'}</div>
          </div>
        </div>
      `}
      ${agAprov && !aprov && !finalizado ? `
        <button class="btn btn-primary btn-sm" id="btn-aprovar-plano" style="margin-top:12px;width:100%;">
          Registrar Aprovação
        </button>` : ''}
    </div>`;
  }

  function renderBotoesFluxo(status) {
    const fluxo = {
      'Aberto':               [['Em andamento','▶ Iniciar']],
      'Em andamento':         [['Aguardando aprovação','📤 Enviar para aprovação'],['Cancelado','❌ Cancelar']],
      'Aguardando aprovação': [['Em andamento','↩ Reabrir'],['Concluído','✅ Concluir']],
      'Concluído':            [],
      'Cancelado':            [['Aberto','↩ Reabrir']],
    };
    const proximos = fluxo[status] || [];
    if (!proximos.length) return '<p class="text-muted text-sm">Plano finalizado.</p>';
    return proximos.map(([s, label]) =>
      `<button class="btn btn-secondary btn-sm btn-fluxo" data-status="${s}">${label}</button>`
    ).join('');
  }

  // ════════════════════════════════════════
  // MODAL PLANO (supervisor/admin)
  // ════════════════════════════════════════
  window.abrirModalPlano = (id = null) => {
    if (!isSup) return;
    const p = id ? planos.find(x => String(x.id) === String(id)) : null;
    if (p && (p.status === 'Concluído' || p.status === 'Cancelado')) {
      Utils.toast('Plano finalizado — não pode ser editado.', 'error'); return;
    }

    const aprovSel = Utils.el('plano-aprovador');
    if (aprovSel) {
      aprovSel.innerHTML = '<option value="">— Selecione —</option>' +
        profissionais.filter(u => u.perfil === 'supervisor' || u.perfil === 'admin')
          .map(u => `<option value="${u.id}" ${p?.aprovador_id===u.id?'selected':''}>${u.nome}</option>`).join('');
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
  };

  async function salvarPlano() {
    const btn = Utils.el('btn-salvar-plano');
    btn.disabled = true;
    try {
      await API.savePlano({
        id:           Utils.el('plano-id').value,
        titulo:       Utils.el('plano-titulo').value.trim(),
        descricao:    Utils.el('plano-desc').value.trim(),
        origem:       Utils.el('plano-origem').value,
        classificacao:Utils.el('plano-classif').value,
        prioridade:   Utils.el('plano-prio').value,
        prazo:        Utils.el('plano-prazo').value,
        setor:        Utils.el('plano-setor').value,
        aprovador_id: Utils.el('plano-aprovador').value,
        hh_previsto:  Utils.el('plano-hh-prev').value,
        mat_previsto: Utils.el('plano-mat-prev').value,
        criado_por:   session.id,
      });
      Utils.closeModal('modal-plano');
      Utils.toast('Plano salvo!', 'success');
      await carregarTudo(true);
      if (planoAtual) { planoAtual = planos.find(p => String(p.id) === String(planoAtual.id)) || planoAtual; renderDetalhe(planoAtual); }
      else renderLista();
    } catch(e) { Utils.toast('Erro: ' + e.message, 'error'); }
    finally { btn.disabled = false; }
  }

  // ════════════════════════════════════════
  // MODAL ATIVIDADE (supervisor adiciona)
  // ════════════════════════════════════════
  function abrirModalAtPA(planoId, atId = null) {
    const at = atId ? atividadesPA.find(x => String(x.id) === String(atId)) : null;
    evidenciasTemp = [];

    // Desbloquear campos e restaurar required
    ['atpa-desc','atpa-inicio','atpa-prazo'].forEach(id => {
      const el = Utils.el(id); if (el) { el.readOnly = false; el.style.background = ''; }
    });
    const respEl2 = Utils.el('atpa-resp');
    if (respEl2) respEl2.required = true;
    const prazoEl2 = Utils.el('atpa-prazo');
    if (prazoEl2) prazoEl2.required = true;
    const descEl2 = Utils.el('atpa-desc');
    if (descEl2) descEl2.required = true;
    const respGroup = Utils.el('atpa-resp')?.closest('.form-group');
    if (respGroup) respGroup.style.display = '';

    const sel = Utils.el('atpa-resp');
    if (sel) {
      sel.innerHTML = '<option value="">— Selecione —</option>' +
        profissionais.map(u => `<option value="${u.id}" ${at?.responsavel_id===u.id?'selected':''}>${u.nome} (${u.funcao||u.perfil})</option>`).join('');
    }

    Utils.el('atpa-id').value           = at?.id || '';
    Utils.el('atpa-plano-id').value     = planoId;
    Utils.el('atpa-desc').value         = at?.descricao || '';
    Utils.el('atpa-pct').value          = at?.pct_concluida || 0;
    Utils.el('atpa-inicio').value       = at?.dt_inicio || '';
    Utils.el('atpa-prazo').value        = at?.prazo || '';
    Utils.el('atpa-conclusao').value    = at?.dt_conclusao || '';
    Utils.el('atpa-status').value       = at?.status || 'Não iniciada';
    Utils.el('atpa-comentarios').value  = at?.comentarios || '';
    Utils.el('atpa-fotos-grid').innerHTML = '';

    Utils.el('modal-atpa-title').textContent = at ? 'Editar Atividade' : 'Nova Atividade';

    // Definir submit para supervisor/admin
    Utils.el('form-atpa').onsubmit = async (e) => {
      e.preventDefault();
      await salvarAtividadePA();
    };

    Utils.openModal('modal-atividade-pa');
  }

  async function salvarAtividadePA() {
    const btn = Utils.el('btn-salvar-atpa');
    btn.disabled = true;
    Utils.showLoading('Salvando...');
    try {
      const links = [];
      for (const ev of evidenciasTemp) {
        try { const r = await API.uploadFotoPA(ev.base64, ev.mimeType, Utils.el('atpa-plano-id').value); links.push(r.url); } catch {}
      }
      await API.saveAtividadePA({
        id:             Utils.el('atpa-id').value,
        plano_id:       Utils.el('atpa-plano-id').value,
        descricao:      Utils.el('atpa-desc').value.trim(),
        responsavel_id: Utils.el('atpa-resp').value,
        pct_concluida:  parseInt(Utils.el('atpa-pct').value)||0,
        dt_inicio:      Utils.el('atpa-inicio').value,
        prazo:          Utils.el('atpa-prazo').value,
        dt_conclusao:   Utils.el('atpa-conclusao').value,
        status:         Utils.el('atpa-status').value,
        comentarios:    Utils.el('atpa-comentarios').value.trim(),
        evidencias:     JSON.stringify(links),
        criado_por:     session.id,
      });
      Utils.closeModal('modal-atividade-pa');
      Utils.toast('Atividade salva!', 'success');
      await carregarTudo(true);
      if (planoAtual) { planoAtual = planos.find(p=>String(p.id)===String(planoAtual.id))||planoAtual; renderDetalhe(planoAtual); }
    } catch(e) { Utils.toast('Erro: ' + e.message, 'error'); }
    finally { Utils.hideLoading(); btn.disabled = false; }
  }

  // ════════════════════════════════════════
  // MODAL PROGRESSO TÉCNICO
  // ════════════════════════════════════════
  // Converte qualquer formato de data para YYYY-MM-DD (para input type=date)
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

  function abrirModalProgresso(atId) {
    const at = atividadesPA.find(x => String(x.id) === String(atId));
    if (!at) return;
    evidenciasTemp = [];

    // ── 1. Preencher TODOS os valores primeiro ──
    Utils.el('atpa-id').value          = at.id;
    Utils.el('atpa-plano-id').value    = at.plano_id;
    Utils.el('atpa-pct').value         = at.pct_concluida || 0;
    Utils.el('atpa-conclusao').value   = toInputDate(at.dt_conclusao);
    Utils.el('atpa-status').value      = at.status || 'Não iniciada';
    Utils.el('atpa-comentarios').value = at.comentarios || '';
    Utils.el('atpa-fotos-grid').innerHTML = '';

    // Datas: converter para YYYY-MM-DD que o input[type=date] exige
    const inicioVal = toInputDate(at.dt_inicio);
    const prazoVal  = toInputDate(at.prazo);

    const descEl   = Utils.el('atpa-desc');
    const inicioEl = Utils.el('atpa-inicio');
    const prazoEl  = Utils.el('atpa-prazo');

    if (descEl)   descEl.value   = at.descricao || '';
    if (inicioEl) inicioEl.value = inicioVal;
    if (prazoEl)  prazoEl.value  = prazoVal;

    // ── 2. Bloquear campos APÓS setar os valores ──
    if (descEl)   { descEl.readOnly   = true; descEl.style.background   = 'var(--gray-50)'; }
    if (inicioEl) { inicioEl.readOnly = true; inicioEl.style.background = 'var(--gray-50)'; }
    if (prazoEl)  { prazoEl.readOnly  = true; prazoEl.style.background  = 'var(--gray-50)'; }

    // Esconder responsável e remover required para não bloquear submit
    const respGroup = Utils.el('atpa-resp')?.closest('.form-group');
    if (respGroup) respGroup.style.display = 'none';
    const respEl = Utils.el('atpa-resp');
    if (respEl) respEl.required = false;

    // Remover required dos campos bloqueados (browser bloqueia submit em readonly+required em alguns casos)
    const prazoElReq = Utils.el('atpa-prazo');
    if (prazoElReq) prazoElReq.required = false;
    const descElReq = Utils.el('atpa-desc');
    if (descElReq) descElReq.required = false;

    Utils.el('modal-atpa-title').textContent = '📝 Registrar Andamento — ' + (at.descricao||'').slice(0,40);
    Utils.openModal('modal-atividade-pa');

    // Override submit para usar registrarProgressoPA
    Utils.el('form-atpa').onsubmit = async (e) => {
      e.preventDefault();
      const btn = Utils.el('btn-salvar-atpa');
      btn.disabled = true;
      Utils.showLoading('Salvando...');
      try {
        const links = [];
        for (const ev of evidenciasTemp) {
          try { const r = await API.uploadFotoPA(ev.base64, ev.mimeType, at.plano_id); links.push(r.url); } catch {}
        }
        await API.registrarProgressoPA({
          id:           at.id,
          pct_concluida:parseInt(Utils.el('atpa-pct').value)||0,
          status:       Utils.el('atpa-status').value,
          comentarios:  Utils.el('atpa-comentarios').value.trim(),
          dt_conclusao: Utils.el('atpa-conclusao').value,
          evidencias:   links.length ? JSON.stringify(links) : undefined,
        });
        Utils.closeModal('modal-atividade-pa');
        Utils.toast('Andamento registrado!', 'success');
        Utils.el('form-atpa').onsubmit = null;
        await carregarTudo(true);
        if (planoAtual) { planoAtual = planos.find(p=>String(p.id)===String(planoAtual.id))||planoAtual; renderDetalhe(planoAtual); }
      } catch(e) { Utils.toast('Erro: ' + e.message, 'error'); }
      finally { Utils.hideLoading(); btn.disabled = false; }
    };
  }

  async function deletarAt(atId) {
    if (!confirm('Excluir esta atividade?')) return;
    try {
      await API.deletarAtividadePA(atId);
      Utils.toast('Excluída!', 'success');
      await carregarTudo(true);
      if (planoAtual) { planoAtual = planos.find(p=>String(p.id)===String(planoAtual.id))||planoAtual; renderDetalhe(planoAtual); }
    } catch(e) { Utils.toast('Erro: ' + e.message, 'error'); }
  }

  // ════════════════════════════════════════
  // APROVAÇÃO
  // ════════════════════════════════════════
  function abrirModalAprovacao(planoId) {
    decidedStatus = null;
    Utils.el('aprov-plano-id').value   = planoId;
    Utils.el('aprov-comentario').value = '';
    ['btn-aprovar','btn-reprovar'].forEach(id => {
      const el = Utils.el(id); if (el) el.className = 'status-btn';
    });
    Utils.openModal('modal-aprovacao');
  }

  window.selecionarDecisao = (d) => {
    decidedStatus = d;
    const ok  = Utils.el('btn-aprovar');
    const nok = Utils.el('btn-reprovar');
    if (ok)  ok.className  = 'status-btn' + (d==='Aprovado'  ? ' active-ok'  : '');
    if (nok) nok.className = 'status-btn' + (d==='Reprovado' ? ' active-nok' : '');
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
      });
      Utils.closeModal('modal-aprovacao');
      Utils.toast('Aprovação registrada!', 'success');
      await carregarTudo(true);
      if (planoAtual) { planoAtual = planos.find(p=>String(p.id)===String(planoAtual.id))||planoAtual; renderDetalhe(planoAtual); }
    } catch(e) { Utils.toast('Erro: ' + e.message, 'error'); }
    finally { btn.disabled = false; }
  }

  // ════════════════════════════════════════
  // STATUS / ENCERRAMENTO
  // ════════════════════════════════════════
  async function mudarStatus(planoId, novoStatus) {
    try {
      await API.mudarStatusPlano({ id: planoId, status: novoStatus });
      Utils.toast('Status atualizado: ' + novoStatus, 'success');
      await carregarTudo(true);
      if (planoAtual) { planoAtual = planos.find(p=>String(p.id)===String(planoAtual.id))||planoAtual; renderDetalhe(planoAtual); }
    } catch(e) { Utils.toast('Erro: ' + e.message, 'error'); }
  }

  function abrirEncerramento(planoId) {
    const obs = prompt('Observação de encerramento (opcional):') ?? null;
    if (obs === null) return;
    const tipo = confirm('Encerrar como CONCLUÍDO?\n\nOK = Concluído\nCancelar = Cancelado');
    if (!confirm(`Confirmar encerramento definitivo?\n\nEsta ação bloqueia o plano e todas as atividades para edição.`)) return;
    API.encerrarPlano({ id: planoId, status: tipo ? 'Concluído' : 'Cancelado', obs_encerramento: obs })
      .then(async () => {
        Utils.toast('Plano encerrado!', 'success');
        await carregarTudo(true);
        if (planoAtual) { planoAtual = planos.find(p=>String(p.id)===String(planoAtual.id))||planoAtual; renderDetalhe(planoAtual); }
      })
      .catch(e => Utils.toast('Erro: ' + e.message, 'error'));
  }



  // ════════════════════════════════════════
  // EVIDÊNCIAS
  // ════════════════════════════════════════
  async function handleEvidencias() {
    const input = Utils.el('atpa-fotos');
    const grid  = Utils.el('atpa-fotos-grid');
    if (!input || !grid) return;
    for (const file of Array.from(input.files).slice(0, 5)) {
      const base64 = await Utils.fileToBase64(file);
      evidenciasTemp.push({ base64, mimeType: file.type });
      const wrap = document.createElement('div');
      wrap.className = 'photo-thumb-wrap';
      if (file.type === 'application/pdf') {
        wrap.innerHTML = `<div class="evidencia-pdf">📄</div>`;
      } else {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.className = 'photo-thumb';
        wrap.appendChild(img);
      }
      grid.appendChild(wrap);
    }
    input.value = '';
  }

  // ════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════
  function voltarLista() {
    planoAtual = null;
    Utils.el('view-detalhe').classList.add('hidden');
    Utils.el('view-lista').classList.remove('hidden');
    Utils.el('topbar-title').textContent = 'Planos de Ação';
    renderLista();
  }

  function calcPrazo(p) {
    if (!p.prazo || p.status==='Concluído'||p.status==='Cancelado')
      return { label: p.status||'—', cls:'prazo-ok', tipo:'ok' };
    const dias = Math.ceil((new Date(p.prazo) - new Date()) / 86400000);
    if (dias < 0)  return { label: `🔴 ${Math.abs(dias)}d atraso`, cls:'prazo-atraso', tipo:'atraso' };
    if (dias <= 3) return { label: `🟡 ${dias}d`,                   cls:'prazo-urgente', tipo:'urgente' };
    return             { label: `🟢 ${dias}d`,                      cls:'prazo-ok', tipo:'ok' };
  }

  function calcPrazoAt(a) {
    if (!a.prazo || a.status==='Concluída'||a.status==='Cancelada')
      return { label: a.status==='Concluída'?'✅':'—', cls:'prazo-ok', tipo:'ok' };
    const dias = Math.ceil((new Date(a.prazo) - new Date()) / 86400000);
    if (dias < 0)  return { label: `${Math.abs(dias)}d atraso`, cls:'prazo-atraso', tipo:'atraso' };
    if (dias <= 3) return { label: `${dias}d`,                   cls:'prazo-urgente', tipo:'urgente' };
    return             { label: `${dias}d`,                      cls:'prazo-ok', tipo:'ok' };
  }

  function calcPct(ats) {
    if (!ats.length) return 0;
    return Math.round(ats.reduce((s,a) => s + (parseInt(a.pct_concluida)||0), 0) / ats.length);
  }

  function badgePrio(p) {
    const m = {Baixa:'badge-success',Média:'badge-info',Alta:'badge-warning',Crítica:'badge-danger'};
    return `<span class="badge ${m[p]||'badge-gray'}">${p||'—'}</span>`;
  }

  function badgeStatus(s) {
    const m = {'Aberto':'badge-info','Em andamento':'badge-primary','Aguardando aprovação':'badge-warning','Concluído':'badge-success','Cancelado':'badge-gray'};
    return `<span class="badge ${m[s]||'badge-gray'}">${s||'—'}</span>`;
  }

  function paInfoRow(label, val) {
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--gray-50);">
      <span style="font-size:.72rem;color:var(--gray-400);">${label}</span>
      <span style="font-size:.8rem;font-weight:500;text-align:right;">${val||'—'}</span>
    </div>`;
  }
})();

/**
 * equipe-ferias.js — Módulo Gestão da Equipe > Férias
 */
(async () => {
  const session = Auth.requireAuth(['tecnico','supervisor','admin']);
  if (!session) return;
  Auth.initUserUI(session);
  Utils.initSidebar();

  const isSup = session.perfil === 'supervisor' || session.perfil === 'admin';

  // ── Estado ──
  let ferias        = [];
  let profissionais = [];
  let moduloAtual   = null;
  let abaAtual      = 'dashboard';
  let filtroSol     = 'todos';
  let calAno        = new Date().getFullYear();

  // ──────────────────────────────────────────
  // NAVEGAÇÃO
  // ──────────────────────────────────────────
  window.abrirModulo = async (mod) => {
    moduloAtual = mod;
    Utils.el('view-landing').classList.add('hidden');
    // esconder todas as views de módulo
    document.querySelectorAll('.page-content[id^="view-"]').forEach(v => v.classList.add('hidden'));
    Utils.el('view-' + mod)?.classList.remove('hidden');
    const titles = { ferias:'🏖️ Férias', treinamentos:'📚 Treinamentos' };
    Utils.el('topbar-title').textContent = titles[mod] || mod;
    if (mod === 'ferias')        iniciarFerias();
    if (mod === 'treinamentos')  window.initTreinamentos?.();
  };

  window.voltarLanding = () => {
    moduloAtual = null;
    document.querySelectorAll('.page-content').forEach(el => el.classList.add('hidden'));
    Utils.el('view-landing').classList.remove('hidden');
    Utils.el('topbar-title').textContent = 'Gestão da Equipe';
    Utils.el('topbar-actions').innerHTML = '';
  };

  // Sub-abas
  document.querySelectorAll('.eq-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.eq-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      abaAtual = tab.dataset.tab;
      document.querySelectorAll('.eq-tab-content').forEach(el => el.classList.add('hidden'));
      document.querySelector(`.eq-tab-content[data-tab="${abaAtual}"]`)?.classList.remove('hidden');
      renderAba(abaAtual);
    });
  });

  // Filtros solicitações
  document.querySelectorAll('.filter-chip[data-sf]').forEach(c => {
    c.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip[data-sf]').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      filtroSol = c.dataset.sf;
      renderSolicitacoes();
    });
  });

  // Botão solicitar
  Utils.el('btn-solicitar')?.addEventListener('click', () => abrirModalFerias());

  // Form férias
  Utils.el('form-ferias')?.addEventListener('submit', async e => {
    e.preventDefault();
    await salvarFerias();
  });

  // Calcular dias ao mudar datas
  ['ferias-inicio','ferias-fim'].forEach(id => {
    Utils.el(id)?.addEventListener('change', calcularDias);
  });

  // Aprovação
  Utils.el('btn-aprovar-ferias')?.addEventListener('click',  () => processarFerias('aprovado'));
  Utils.el('btn-reprovar-ferias')?.addEventListener('click', () => processarFerias('reprovado'));

  // Calendário nav
  Utils.el('btn-ano-ant')?.addEventListener('click',  () => { calAno--; renderCalendario(); });
  Utils.el('btn-ano-prox')?.addEventListener('click', () => { calAno++; renderCalendario(); });

  // Gantt filtros
  Utils.el('gantt-ano')?.addEventListener('change', renderGantt);
  Utils.el('gantt-mes')?.addEventListener('change', renderGantt);

  // ──────────────────────────────────────────
  // INIT FÉRIAS
  // ──────────────────────────────────────────
  async function iniciarFerias() {
    Utils.showLoading('Carregando férias...');
    try {
      const [fRes, profRes] = await Promise.all([
        API.getFerias(),
        API.getProfissionais(),
      ]);
      ferias        = fRes.ferias        || [];
      profissionais = profRes.profissionais || [];

      // Preencher ano do Gantt
      const ganttAno = Utils.el('gantt-ano');
      if (ganttAno) {
        const anoAtual = new Date().getFullYear();
        ganttAno.innerHTML = [anoAtual-1, anoAtual, anoAtual+1]
          .map(a => `<option value="${a}" ${a===anoAtual?'selected':''}>${a}</option>`).join('');
      }

      // Botão novo no topbar
      if (isSup) {
        Utils.el('topbar-actions').innerHTML =
          `<button class="btn btn-primary btn-sm" onclick="abrirModalFerias()">+ Nova Solicitação</button>`;
      }

      renderAba('dashboard');
    } catch(e) {
      Utils.toast('Erro: ' + e.message, 'error');
    } finally {
      Utils.hideLoading();
    }

    // Auto-refresh 15s
    setInterval(async () => {
      try {
        const [fRes] = await Promise.all([API.getFerias()]);
        ferias = fRes.ferias || [];
        renderAba(abaAtual);
      } catch {}
    }, 15000);
  }

  function renderAba(aba) {
    if (aba === 'dashboard')    renderDashboard();
    if (aba === 'calendario')   renderCalendario();
    if (aba === 'gantt')        renderGantt();
    if (aba === 'solicitacoes') renderSolicitacoes();
    if (aba === 'historico')    renderHistorico();
  }

  // ──────────────────────────────────────────
  // DASHBOARD
  // ──────────────────────────────────────────
  function renderDashboard() {
    const hoje   = new Date().toISOString().slice(0,10);
    const emFerias   = ferias.filter(f => f.status==='aprovado' && f.dt_inicio<=hoje && f.dt_fim>=hoje);
    const pendentes  = ferias.filter(f => f.status==='pendente');
    const aprovadas  = ferias.filter(f => f.status==='aprovado');
    const proximas   = ferias.filter(f => f.status==='aprovado' && f.dt_inicio>hoje)
                            .sort((a,b)=>a.dt_inicio.localeCompare(b.dt_inicio));

    // Minha férias (técnico)
    const minhasFerias = ferias.filter(f => String(f.profissional_id)===String(session.id));

    // Stats
    Utils.setHTML('ferias-stats', `
      <div class="stat-card">
        <div class="stat-card-label">Colaboradores</div>
        <div class="stat-card-value">${profissionais.filter(p=>String(p.ativo).toLowerCase()!=='false').length}</div>
        <div class="stat-card-sub">ativos</div>
      </div>
      <div class="stat-card" style="border-top:3px solid var(--success);">
        <div class="stat-card-label">Em Férias Hoje</div>
        <div class="stat-card-value" style="color:var(--success);">${emFerias.length}</div>
        <div class="stat-card-sub">${emFerias.map(f=>nomeProf(f.profissional_id)).join(', ')||'nenhum'}</div>
      </div>
      <div class="stat-card" style="border-top:3px solid var(--warning);">
        <div class="stat-card-label">Pendentes</div>
        <div class="stat-card-value" style="color:var(--warning);">${pendentes.length}</div>
        <div class="stat-card-sub">aguardando aprovação</div>
      </div>
      <div class="stat-card" style="border-top:3px solid var(--primary);">
        <div class="stat-card-label">Aprovadas</div>
        <div class="stat-card-value" style="color:var(--primary);">${aprovadas.length}</div>
        <div class="stat-card-sub">no ano</div>
      </div>
    `);

    // Gráfico mensal (barras)
    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const contMes = Array(12).fill(0);
    ferias.filter(f=>f.status==='aprovado').forEach(f => {
      const m = new Date(f.dt_inicio).getUTCMonth();
      contMes[m]++;
    });
    const maxM = Math.max(...contMes, 1);

    Utils.setHTML('ferias-chart-mensal', `
      <div class="card-header"><span class="card-title">📈 Férias por Mês</span></div>
      <div class="eq-chart-bar">
        ${contMes.map((v,i) => `
          <div class="eq-bar-col">
            <div class="eq-bar-val">${v||''}</div>
            <div class="eq-bar-fill" style="height:${Math.round(v/maxM*90)+3}px;background:${v===maxM?'var(--primary)':'var(--primary-mid)'}"></div>
            <div class="eq-bar-lbl">${meses[i]}</div>
          </div>`).join('')}
      </div>
      <div style="margin-top:12px;">
        <div class="card-header" style="padding-top:8px;"><span class="card-title" style="font-size:.75rem;">Concentração por mês</span></div>
        <div class="eq-heatmap">
          ${contMes.map((v,i) => {
            const int = Math.round(v/maxM*100);
            const bg  = v===0?'var(--gray-100)':v===maxM?'#dc2626':int>60?'#f59e0b':int>30?'#22c55e':'#86efac';
            return `<div class="eq-heat-cell" style="background:${bg};">
              <div class="eq-heat-mes">${meses[i]}</div>
              <div class="eq-heat-num" style="color:${v>0?'white':'#cbd5e1'}">${v}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
    `);

    // Alertas
    const alertas = [];

    // Verificar vencimento (simulado — admissão + 1 ano = direito a férias)
    profissionais.filter(p=>String(p.ativo).toLowerCase()!=='false').forEach(p => {
      if (!p.dt_admissao) return;
      const admissao = new Date(p.dt_admissao);
      const hoje     = new Date();
      const diasEmpresa = Math.floor((hoje - admissao) / 86400000);
      const temFerias   = ferias.filter(f=>String(f.profissional_id)===String(p.id)&&f.status==='aprovado');
      const tirou       = temFerias.some(f=>new Date(f.dt_inicio).getFullYear()===hoje.getFullYear());
      if (diasEmpresa >= 365 && !tirou) {
        const diasVenc = diasEmpresa - 365;
        alertas.push({
          tipo: diasVenc > 60 ? 'danger' : 'warn',
          icon: diasVenc > 60 ? '🔴' : '⚠️',
          texto: `${p.nome} — ${diasVenc > 60 ? 'Férias vencidas!' : 'Férias a vencer em breve'}`,
          sub: `${diasEmpresa} dias de empresa · ${diasVenc > 0 ? diasVenc + 'd em atraso' : 'Vence em breve'}`,
        });
      }
    });

    // Pendentes há mais de 3 dias
    pendentes.forEach(f => {
      const criado = new Date(f.dt_criacao);
      const dias   = Math.floor((new Date() - criado) / 86400000);
      if (dias >= 3) alertas.push({
        tipo:'warn', icon:'⏳',
        texto:`Solicitação de ${nomeProf(f.profissional_id)} pendente há ${dias} dias`,
        sub:`${Utils.fmtDate(f.dt_inicio)} a ${Utils.fmtDate(f.dt_fim)}`,
      });
    });

    Utils.setHTML('ferias-alertas',
      `<div class="card-header"><span class="card-title">🔔 Alertas e Pendências</span></div>` +
      (alertas.length
        ? alertas.map(a => `<div class="eq-alerta ${a.tipo}">
            <div class="eq-alerta-icon">${a.icon}</div>
            <div><div class="eq-alerta-texto">${a.texto}</div><div class="eq-alerta-sub">${a.sub}</div></div>
          </div>`).join('')
        : '<p class="text-muted text-sm">Nenhum alerta no momento. ✅</p>')
    );

    // Próximas férias
    Utils.setHTML('ferias-proximas',
      `<div class="card-header"><span class="card-title">📅 Próximas Férias Aprovadas</span></div>` +
      (proximas.length
        ? proximas.slice(0,8).map(f => {
            const diasRest = Math.ceil((new Date(f.dt_inicio) - new Date()) / 86400000);
            const urgencia = diasRest<=7?'badge-warning':diasRest<=30?'badge-info':'badge-gray';
            return `<div class="eq-hist-card">
              <div class="eq-hist-avatar">${nomeProf(f.profissional_id).charAt(0)}</div>
              <div class="eq-hist-body">
                <div class="eq-hist-nome">${nomeProf(f.profissional_id)}</div>
                <div class="eq-hist-periodo">
                  📅 ${Utils.fmtDate(f.dt_inicio)} → ${Utils.fmtDate(f.dt_fim)}
                  <span class="badge badge-gray">${f.dias_corridos}d</span>
                </div>
              </div>
              <div class="eq-hist-right">
                <span class="badge ${urgencia}">${diasRest}d</span>
                <div style="font-size:.65rem;color:var(--gray-400);margin-top:2px;">restantes</div>
              </div>
            </div>`;
          }).join('')
        : '<p class="text-muted text-sm" style="padding:.5rem 0;">Nenhuma férias aprovada futura.</p>')
    );
  }

  // ──────────────────────────────────────────
  // CALENDÁRIO ANUAL
  // ──────────────────────────────────────────
  function renderCalendario() {
    Utils.el('cal-ano-label').textContent = calAno;
    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const hoje  = new Date().toISOString().slice(0,10);

    // Profissionais ativos
    const profs = profissionais.filter(p => String(p.ativo).toLowerCase() !== 'false');

    // Para cada prof, quais meses têm férias?
    // Célula = mês inteiro com cor dominante
    let html = `<table class="eq-cal-table"><thead><tr>
      <th class="col-nome">Colaborador</th>
      ${meses.map((m,i) => `<th class="col-mes">${m}</th>`).join('')}
    </tr></thead><tbody>`;

    profs.forEach(p => {
      const minhasF = ferias.filter(f => String(f.profissional_id) === String(p.id));
      html += `<tr><td class="col-nome">${p.nome}</td>`;
      meses.forEach((_, mesIdx) => {
        // Verificar se tem férias neste mês/ano
        const mesF = minhasF.filter(f => {
          const ini = new Date(f.dt_inicio);
          const fim = new Date(f.dt_fim);
          return (ini.getUTCFullYear()===calAno && ini.getUTCMonth()===mesIdx) ||
                 (fim.getUTCFullYear()===calAno && fim.getUTCMonth()===mesIdx) ||
                 (ini <= new Date(calAno, mesIdx, 1) && fim >= new Date(calAno, mesIdx+1, 0));
        });

        let cls = 'livre', titulo = '';
        if (mesF.length) {
          const f = mesF[0];
          cls    = f.status === 'aprovado' ? 'aprovado' : 'pendente';
          titulo = `${Utils.fmtDate(f.dt_inicio)} – ${Utils.fmtDate(f.dt_fim)} (${f.dias_corridos}d)`;
          // Verificar conflito: mais de 1 pessoa aprovada no mesmo mês
          const outrosAprov = ferias.filter(of =>
            String(of.profissional_id) !== String(p.id) &&
            of.status === 'aprovado' &&
            ((new Date(of.dt_inicio).getUTCMonth()===mesIdx) || (new Date(of.dt_fim).getUTCMonth()===mesIdx))
          );
          if (outrosAprov.length > 0 && f.status === 'aprovado') cls = 'conflito';
        }

        html += `<td><div class="eq-cal-cell ${cls}" title="${titulo}">${mesF.length ? (cls==='aprovado'?'✓':cls==='conflito'?'!':'⏳') : ''}</div></td>`;
      });
      html += '</tr>';
    });

    html += '</tbody></table>';
    Utils.el('ferias-calendario').innerHTML = html;
  }

  // ──────────────────────────────────────────
  // GANTT
  // ──────────────────────────────────────────
  function renderGantt() {
    const ano = parseInt(Utils.el('gantt-ano')?.value || new Date().getFullYear());
    const mes = parseInt(Utils.el('gantt-mes')?.value || 0);
    const hoje = new Date().toISOString().slice(0,10);

    let dtIni, dtFim;
    if (mes === 0) {
      dtIni = new Date(ano, 0, 1);
      dtFim = new Date(ano, 11, 31);
    } else {
      dtIni = new Date(ano, mes-1, 1);
      dtFim = new Date(ano, mes, 0);
    }

    const totalDias = Math.ceil((dtFim - dtIni) / 86400000) + 1;
    const profs     = profissionais.filter(p => String(p.ativo).toLowerCase() !== 'false');

    // Header com dias
    let diasHtml = '';
    for (let d = 0; d < totalDias; d++) {
      const dt  = new Date(dtIni); dt.setDate(dt.getDate() + d);
      const isW = dt.getDay()===0||dt.getDay()===6;
      const dsStr = dt.toISOString().slice(0,10);
      diasHtml += `<div class="eq-gantt-day-lbl${isW?' weekend':''}" ${dsStr===hoje?'style="color:var(--primary);font-weight:700;"':''}>${dt.getDate()}</div>`;
    }

    let rowsHtml = '';
    profs.forEach(p => {
      const minhasF = ferias.filter(f => String(f.profissional_id)===String(p.id) &&
        new Date(f.dt_fim)>=dtIni && new Date(f.dt_inicio)<=dtFim);

      let cellsHtml = '';
      for (let d = 0; d < totalDias; d++) {
        const dt    = new Date(dtIni); dt.setDate(dt.getDate() + d);
        const dsStr = dt.toISOString().slice(0,10);
        const fObj  = minhasF.find(f => f.dt_inicio <= dsStr && f.dt_fim >= dsStr);
        let cls = '', tip = '';
        if (fObj) {
          // Conflito: outro aprovado no mesmo dia
          const outrosAprov = ferias.filter(of =>
            String(of.profissional_id)!==String(p.id) &&
            of.status==='aprovado' && of.dt_inicio<=dsStr && of.dt_fim>=dsStr
          );
          cls = outrosAprov.length && fObj.status==='aprovado' ? 'conflito' : fObj.status;
          tip = `${p.nome}: ${Utils.fmtDate(fObj.dt_inicio)}→${Utils.fmtDate(fObj.dt_fim)} (${fObj.status})`;
        }
        cellsHtml += `<div class="eq-gantt-cell ${cls}${dsStr===hoje?' hoje-line':''}" data-tip="${tip}"></div>`;
      }

      rowsHtml += `<div class="eq-gantt-row">
        <div class="eq-gantt-row-nome" title="${p.nome}">${p.nome.split(' ')[0]}</div>
        <div class="eq-gantt-track">${cellsHtml}</div>
      </div>`;
    });

    Utils.el('ferias-gantt').innerHTML = `
      <div class="eq-gantt-wrap">
        <div class="eq-gantt-header">
          <div class="eq-gantt-nome-col">Colaborador</div>
          <div class="eq-gantt-days">${diasHtml}</div>
        </div>
        ${rowsHtml}
        <div style="display:flex;gap:14px;margin-top:12px;flex-wrap:wrap;font-size:.75rem;color:var(--gray-500);">
          <span><span style="display:inline-block;width:14px;height:14px;background:#86efac;border-radius:3px;vertical-align:middle;margin-right:4px;"></span>Aprovado</span>
          <span><span style="display:inline-block;width:14px;height:14px;background:#fde68a;border-radius:3px;vertical-align:middle;margin-right:4px;"></span>Pendente</span>
          <span><span style="display:inline-block;width:14px;height:14px;background:#fca5a5;border-radius:3px;vertical-align:middle;margin-right:4px;"></span>Conflito</span>
        </div>
      </div>`;
  }

  // ──────────────────────────────────────────
  // SOLICITAÇÕES
  // ──────────────────────────────────────────
  function renderSolicitacoes() {
    let lista = [...ferias];

    // Técnico vê apenas as próprias
    if (!isSup) lista = lista.filter(f => String(f.profissional_id)===String(session.id));

    if (filtroSol !== 'todos') lista = lista.filter(f => f.status === filtroSol);
    lista.sort((a,b) => b.dt_criacao.localeCompare(a.dt_criacao));

    const container = Utils.el('ferias-lista');
    if (!container) return;

    if (!lista.length) {
      container.innerHTML = `<div class="empty-state">
        <div style="font-size:2.5rem;margin-bottom:12px;">🏖️</div>
        <h3>Nenhuma solicitação encontrada</h3>
        <p>${!isSup?'Clique em "Solicitar Férias" para fazer sua solicitação.':'Nenhuma solicitação com este filtro.'}</p>
        ${!isSup?`<button class="btn btn-primary" style="margin-top:1rem;" onclick="abrirModalFerias()">Solicitar Férias</button>`:''}
      </div>`;
      return;
    }

    container.innerHTML = lista.map(f => {
      const finalizado = f.status==='aprovado'||f.status==='reprovado';
      return `<div class="eq-sol-card">
        <div class="eq-sol-stripe stripe-${f.status}"></div>
        <div class="eq-sol-body">

          <!-- Linha 1: nome + badges -->
          <div class="eq-sol-header">
            <div class="eq-sol-nome">${nomeProf(f.profissional_id)}</div>
            <div class="eq-sol-badges">
              ${badgeStatus(f.status)}
              ${String(f.conflito)==='true' ? '<span class="badge badge-danger">⚠ Conflito</span>' : ''}
            </div>
          </div>

          <!-- Linha 2: período em destaque -->
          <div class="eq-sol-periodo">
            📅 ${Utils.fmtDate(f.dt_inicio)}
            <span style="color:var(--gray-300);margin:0 4px;">→</span>
            ${Utils.fmtDate(f.dt_fim)}
            <span class="eq-sol-dias-badge">${f.dias_corridos}d</span>
          </div>

          <!-- Linha 3: meta info -->
          <div class="eq-sol-meta-row">
            <span>🗓 Solicitado: ${Utils.fmtDate(f.dt_criacao)}</span>
            ${f.aprovado_por ? '<span>👤 ' + nomeProf(f.aprovado_por) + '</span>' : ''}
          </div>

          <!-- Observações -->
          ${f.observacao ? `<div class="eq-sol-obs">${f.observacao}</div>` : ''}
          ${f.obs_aprovacao ? `<div class="eq-sol-obs" style="border-left-color:${f.status==='aprovado'?'var(--success)':'var(--danger)'};">💬 ${f.obs_aprovacao}</div>` : ''}

          <!-- Ações -->
          <div class="eq-sol-actions">
            ${isSup && f.status==='pendente' ? `<button class="btn btn-primary btn-sm eq-sol-btn" onclick="abrirModalAprovar('${f.id}')">✅ Analisar</button>` : ''}
            ${(isSup || (String(f.profissional_id)===String(session.id))) && !finalizado ? `<button class="btn btn-secondary btn-sm eq-sol-btn" onclick="abrirModalFerias('${f.id}')">✏️ Editar</button>` : ''}
            ${!finalizado ? `<button class="btn btn-ghost btn-sm eq-sol-btn" style="color:var(--danger);" onclick="cancelarFerias('${f.id}')">🗑</button>` : ''}
          </div>

        </div>
      </div>`;
    }).join('');
  }

  // ──────────────────────────────────────────
  // HISTÓRICO
  // ──────────────────────────────────────────
  function renderHistorico() {
    const lista = [...ferias]
      .filter(f => !isSup ? String(f.profissional_id)===String(session.id) : true)
      .sort((a,b) => b.dt_inicio.localeCompare(a.dt_inicio));

    Utils.el('ferias-historico').innerHTML = lista.length
      ? lista.map(f => {
          const obs = f.obs_aprovacao || f.observacao || '';
          return `<div class="eq-hist-card">
            <div class="eq-hist-avatar ${f.status}">${nomeProf(f.profissional_id).charAt(0)}</div>
            <div class="eq-hist-body">
              <div class="eq-hist-nome">${nomeProf(f.profissional_id)}</div>
              <div class="eq-hist-periodo">
                📅 ${Utils.fmtDate(f.dt_inicio)} → ${Utils.fmtDate(f.dt_fim)}
                <span class="badge badge-gray">${f.dias_corridos}d</span>
              </div>
              ${f.aprovado_por ? `<div class="eq-hist-aprov">👤 ${nomeProf(f.aprovado_por)}</div>` : ''}
              ${obs ? `<div class="eq-hist-obs">${obs}</div>` : ''}
            </div>
            <div class="eq-hist-right">
              ${badgeStatus(f.status)}
            </div>
          </div>`;
        }).join('')
      : '<p class="text-muted text-sm" style="padding:1rem;">Nenhum histórico.</p>';
  }

  // ──────────────────────────────────────────
  // MODAL SOLICITAR / EDITAR FÉRIAS
  // ──────────────────────────────────────────
  window.abrirModalFerias = (id = null) => {
    const f = id ? ferias.find(x => String(x.id)===String(id)) : null;

    // Colaborador select
    const colabSel = Utils.el('ferias-colab');
    const colabGrp = Utils.el('ferias-colab-group');
    if (colabSel) {
      if (isSup) {
        colabSel.innerHTML = profissionais
          .filter(p=>String(p.ativo).toLowerCase()!=='false')
          .map(p => `<option value="${p.id}" ${f?.profissional_id===p.id?'selected':''}>${p.nome}</option>`).join('');
        colabGrp.style.display = '';
      } else {
        colabSel.innerHTML = `<option value="${session.id}">${session.nome}</option>`;
        colabGrp.style.display = 'none';
      }
    }

    Utils.el('ferias-id').value    = f?.id || '';
    Utils.el('ferias-inicio').value= f?.dt_inicio || '';
    Utils.el('ferias-fim').value   = f?.dt_fim    || '';
    Utils.el('ferias-obs').value   = f?.observacao|| '';
    Utils.el('ferias-dias-info').style.display = 'none';
    Utils.el('modal-ferias-title').textContent = f ? 'Editar Solicitação' : 'Solicitar Férias';
    Utils.el('btn-salvar-ferias').textContent  = f ? 'Atualizar' : 'Solicitar';

    if (f?.dt_inicio) calcularDias();
    Utils.openModal('modal-ferias');
  };

  function calcularDias() {
    const ini = Utils.el('ferias-inicio')?.value;
    const fim = Utils.el('ferias-fim')?.value;
    if (!ini || !fim) return;

    const dIni = new Date(ini), dFim = new Date(fim);
    if (dFim < dIni) { Utils.toast('Data fim deve ser após a data início', 'error'); return; }

    const dias = Math.ceil((dFim - dIni) / 86400000) + 1;
    Utils.el('ferias-dias-count').textContent = dias;
    Utils.el('ferias-dias-info').style.display = 'block';

    // Verificar conflitos com período atual
    const idAtual = Utils.el('ferias-id').value;
    const conflitos = ferias.filter(f =>
      String(f.id) !== idAtual &&
      (f.status==='aprovado' || f.status==='pendente') &&
      String(f.profissional_id) !== String(Utils.el('ferias-colab')?.value || session.id) &&
      f.dt_inicio <= fim && f.dt_fim >= ini
    );
    const warnEl  = Utils.el('ferias-conflito-warn');
    const msgEl   = Utils.el('ferias-conflito-msg');
    if (warnEl && msgEl) {
      if (conflitos.length) {
        const nomes = [...new Set(conflitos.map(f=>nomeProf(f.profissional_id)))].join(', ');
        msgEl.textContent = `Conflito com: ${nomes} no mesmo período.`;
        warnEl.classList.remove('hidden');
      } else {
        warnEl.classList.add('hidden');
      }
    }
  }

  async function salvarFerias() {
    const btn = Utils.el('btn-salvar-ferias');
    btn.disabled = true;
    try {
      const ini  = Utils.el('ferias-inicio').value;
      const fim  = Utils.el('ferias-fim').value;
      const dias = Math.ceil((new Date(fim)-new Date(ini))/86400000)+1;

      await API.saveFerias({
        id:              Utils.el('ferias-id').value,
        profissional_id: Utils.el('ferias-colab').value || session.id,
        dt_inicio:       ini,
        dt_fim:          fim,
        dias_corridos:   dias,
        observacao:      Utils.el('ferias-obs').value.trim(),
        solicitado_por:  session.id,
      });
      Utils.closeModal('modal-ferias');
      Utils.toast('Solicitação enviada!', 'success');
      const fRes = await API.getFerias();
      ferias = fRes.ferias || [];
      renderSolicitacoes();
    } catch(e) {
      Utils.toast('Erro: ' + e.message, 'error');
    } finally { btn.disabled = false; }
  }

  window.cancelarFerias = async (id) => {
    if (!confirm('Cancelar esta solicitação de férias?')) return;
    try {
      await API.cancelarFerias(id);
      Utils.toast('Solicitação cancelada.', 'success');
      const fRes = await API.getFerias();
      ferias = fRes.ferias || [];
      renderSolicitacoes();
    } catch(e) { Utils.toast('Erro: ' + e.message, 'error'); }
  };

  // ──────────────────────────────────────────
  // MODAL APROVAR / REPROVAR
  // ──────────────────────────────────────────
  window.abrirModalAprovar = (id) => {
    const f    = ferias.find(x => String(x.id)===String(id));
    if (!f) return;
    Utils.el('aprov-ferias-id').value = id;
    Utils.el('aprov-ferias-obs').value = '';

    // Verificar cobertura: quantos aprovados no mesmo período?
    const mesmoHorario = ferias.filter(of =>
      String(of.id) !== String(id) &&
      of.status==='aprovado' &&
      of.dt_inicio<=f.dt_fim && of.dt_fim>=f.dt_inicio
    );

    Utils.setHTML('modal-aprovar-body', `
      <div style="padding:12px;background:var(--gray-50);border-radius:var(--radius);border:1px solid var(--gray-200);">
        <div style="font-weight:700;font-size:.9375rem;margin-bottom:6px;">${nomeProf(f.profissional_id)}</div>
        <div style="font-size:.8125rem;color:var(--primary);font-weight:600;">
          📅 ${Utils.fmtDate(f.dt_inicio)} → ${Utils.fmtDate(f.dt_fim)}
        </div>
        <div style="font-size:.75rem;color:var(--gray-400);margin-top:3px;">${f.dias_corridos} dias corridos</div>
        ${f.observacao?`<div class="eq-sol-obs" style="margin-top:8px;">${f.observacao}</div>`:''}
        ${mesmoHorario.length?`
          <div style="margin-top:10px;padding:8px 12px;background:var(--warning-light);border-radius:var(--radius);border-left:3px solid var(--warning);">
            <div style="font-size:.775rem;font-weight:700;color:var(--warning);">⚠️ Atenção: ${mesmoHorario.length} colaborador(es) com férias aprovadas no mesmo período</div>
            <div style="font-size:.72rem;color:var(--gray-500);margin-top:3px;">${mesmoHorario.map(of=>nomeProf(of.profissional_id)).join(', ')}</div>
          </div>`:''
        }
      </div>
    `);
    Utils.openModal('modal-aprovar-ferias');
  };

  async function processarFerias(decisao) {
    const id  = Utils.el('aprov-ferias-id').value;
    const obs = Utils.el('aprov-ferias-obs').value.trim();
    const btn = decisao==='aprovado'?Utils.el('btn-aprovar-ferias'):Utils.el('btn-reprovar-ferias');
    btn.disabled = true;
    try {
      const res = await API.processarFerias({ id, status: decisao, obs_aprovacao: obs, aprovado_por: session.id });
      Utils.closeModal('modal-aprovar-ferias');
      Utils.toast(decisao==='aprovado'?'✅ Férias aprovadas!':'❌ Férias reprovadas.', decisao==='aprovado'?'success':'error');

      // Enviar WhatsApp se aprovado
      if (decisao === 'aprovado') {
        const f    = ferias.find(x=>String(x.id)===String(id));
        const prof = profissionais.find(p=>String(p.id)===String(f?.profissional_id));
        if (prof?.telefone) enviarWhatsAppFerias(prof, f, res.supervisor_nome||session.nome);
      }

      const fRes = await API.getFerias();
      ferias = fRes.ferias || [];
      renderAba(abaAtual);
    } catch(e) { Utils.toast('Erro: ' + e.message, 'error'); }
    finally { btn.disabled = false; }
  }

  function enviarWhatsAppFerias(prof, f, supNome) {
    const tel = String(prof.telefone).replace(/\D/g,'');
    if (!tel) return;
    const msg = [
      '🏖️ *SGMA — Férias Aprovadas!*',
      '',
      `Olá *${prof.nome.split(' ')[0]}*,`,
      'Suas férias foram *aprovadas!* ✅',
      '',
      '📅 *Período:*',
      `${Utils.fmtDate(f.dt_inicio)} até ${Utils.fmtDate(f.dt_fim)}`,
      `📋 ${f.dias_corridos} dias corridos`,
      '',
      `👤 Aprovado por: ${supNome}`,
      '',
      '🌴 Bom descanso!',
      '',
      '— SGMA Sistema de Manutenção',
    ].join('\n');
    const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
    const waUrl = isMobile
      ? `whatsapp://send?phone=55${tel}&text=${encodeURIComponent(msg)}`
      : `https://wa.me/55${tel}?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');
  }

  // ──────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────
  function nomeProf(id) {
    return profissionais.find(p=>String(p.id)===String(id))?.nome || id || '—';
  }

  function badgeStatus(s) {
    const m = {
      pendente: 'badge-warning',
      aprovado: 'badge-success',
      reprovado:'badge-danger',
      cancelado:'badge-gray',
    };
    const l = { pendente:'🟡 Pendente', aprovado:'🟢 Aprovado', reprovado:'🔴 Reprovado', cancelado:'Cancelado' };
    return `<span class="badge ${m[s]||'badge-gray'}">${l[s]||s}</span>`;
  }

})();

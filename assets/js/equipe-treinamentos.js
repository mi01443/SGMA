/**
 * equipe-treinamentos.js — Módulo Treinamentos
 * Chamado por equipe.html ao clicar no card Treinamentos
 */
(async () => {
  // Exportar função init para equipe.html
  window.initTreinamentos = initTreinamentos;

  const session = window._session || Auth.getSession();
  if (!session) return;

  const isSup = session.perfil === 'supervisor' || session.perfil === 'admin';

  let catalogo    = [];
  let matriz      = [];
  let registros   = [];
  let histTecnico = [];
  let profissionais = [];
  let dashItens   = [];
  let abaAtual    = 'dashboard';

  // ────────────────────────────────────────
  async function initTreinamentos() {
    Utils.showLoading('Carregando treinamentos...');
    try {
      const [catRes, matRes, profRes] = await Promise.all([
        API.getCatalogoTR(),
        API.getMatrizTR({}),
        API.getProfissionais(),
      ]);
      catalogo      = catRes.catalogo     || [];
      matriz        = matRes.matriz       || [];
      profissionais = profRes.profissionais|| [];

      // Botão novo na topbar (supervisor)
      const tb = Utils.el('topbar-actions');
      if (tb && isSup) {
        tb.innerHTML = `<button class="btn btn-primary btn-sm" onclick="abrirModalCatalogo()">+ Treinamento</button>`;
      }

      renderAbaTR(abaAtual);
    } catch(e) {
      Utils.toast('Erro: ' + e.message, 'error');
    } finally {
      Utils.hideLoading();
    }

    // Auto-refresh 30s
    setInterval(async () => {
      try {
        const r = await API.getDashboardTR({ profissional_id: session.id, funcao: session.funcao });
        dashItens = r.itens || [];
        if (abaAtual === 'dashboard') renderDashboardTR();
      } catch {}
    }, 30000);
  }

  // ── Abas ──
  window.setTabTR = (aba) => {
    abaAtual = aba;
    document.querySelectorAll('.tr-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === aba));
    document.querySelectorAll('.tr-content').forEach(el => el.classList.toggle('hidden', el.dataset.tab !== aba));
    renderAbaTR(aba);
  };

  async function renderAbaTR(aba) {
    if (aba === 'dashboard')  await renderDashboardTR();
    if (aba === 'matriz')     await renderMatrizTR();
    if (aba === 'catalogo')   renderCatalogoTR();
    if (aba === 'historico')  await renderHistoricoTR();
  }

  // ════════════════════════════════════════
  // DASHBOARD
  // ════════════════════════════════════════
  async function renderDashboardTR() {
    const container = Utils.el('tr-dashboard');
    if (!container) return;
    container.innerHTML = '<div class="text-muted text-sm">Carregando...</div>';
    try {
      const profId = isSup ? (Utils.el('tr-filtro-prof')?.value || '') : session.id;
      const prof   = profissionais.find(p => String(p.id) === String(profId || session.id));
      const funcao = prof?.funcao || session.funcao || '';

      const res = await API.getDashboardTR({ profissional_id: profId || session.id, funcao });
      dashItens = res.itens || [];

      const vencidos   = dashItens.filter(i => i.status === 'vencido');
      const aVencer    = dashItens.filter(i => i.status === 'a_vencer');
      const validos    = dashItens.filter(i => i.status === 'valido');
      const pendentes  = dashItens.filter(i => i.status === 'pendente');

      container.innerHTML = `
        <!-- Filtro supervisor -->
        ${isSup ? `
        <div style="margin-bottom:1rem;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <select class="form-control" id="tr-filtro-prof" style="max-width:220px;" onchange="renderAbaTR('dashboard')">
            <option value="">Selecione o profissional</option>
            ${profissionais.map(p=>`<option value="${p.id}" ${String(p.id)===String(profId)?'selected':''}>${p.nome}</option>`).join('')}
          </select>
          <span class="text-muted text-sm">${funcao ? '· Função: ' + funcao : ''}</span>
        </div>` : ''}

        <!-- KPI cards -->
        <div class="stat-cards mb-3">
          <div class="stat-card" style="border-top:3px solid var(--danger);">
            <div class="stat-card-label">Vencidos</div>
            <div class="stat-card-value" style="color:var(--danger);">${vencidos.length}</div>
            <div class="stat-card-sub">requer ação imediata</div>
          </div>
          <div class="stat-card" style="border-top:3px solid var(--warning);">
            <div class="stat-card-label">A vencer</div>
            <div class="stat-card-value" style="color:var(--warning);">${aVencer.length}</div>
            <div class="stat-card-sub">próximos 30 dias</div>
          </div>
          <div class="stat-card" style="border-top:3px solid var(--success);">
            <div class="stat-card-label">Válidos</div>
            <div class="stat-card-value" style="color:var(--success);">${validos.length}</div>
            <div class="stat-card-sub">em dia</div>
          </div>
          <div class="stat-card" style="border-top:3px solid var(--gray-400);">
            <div class="stat-card-label">Pendentes</div>
            <div class="stat-card-value" style="color:var(--gray-500);">${pendentes.length}</div>
            <div class="stat-card-sub">não realizados</div>
          </div>
        </div>

        <!-- Lista de treinamentos da matriz -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">📋 Situação dos Treinamentos — ${prof?.nome || session.nome}</span>
          </div>
          ${dashItens.length
            ? dashItens.map(i => renderItemDash(i, profId || session.id)).join('')
            : '<div class="empty-state" style="padding:2rem;"><p>Nenhum treinamento na matriz para esta função.</p></div>'}
        </div>`;

      // Re-bind filtro
      Utils.el('tr-filtro-prof')?.addEventListener('change', () => renderDashboardTR());

    } catch(e) {
      container.innerHTML = `<div class="alert alert-danger">Erro: ${e.message}</div>`;
    }
  }

  function renderItemDash(i, profId) {
    const statusCfg = {
      vencido:  { cls:'tr-status-vencido',  icon:'🔴', label:'Vencido',   cor:'var(--danger)' },
      a_vencer: { cls:'tr-status-avencer',  icon:'🟡', label:'A vencer',  cor:'var(--warning)' },
      valido:   { cls:'tr-status-valido',   icon:'🟢', label:'Válido',    cor:'var(--success)' },
      pendente: { cls:'tr-status-pendente', icon:'⬜', label:'Pendente',  cor:'var(--gray-400)' },
    };
    const sc = statusCfg[i.status] || statusCfg.pendente;

    let diasLabel = '';
    if (i.dias_diff !== null) {
      if (i.dias_diff < 0) diasLabel = `<span style="color:var(--danger);font-size:.72rem;font-weight:700;">${Math.abs(i.dias_diff)}d vencido</span>`;
      else if (i.status === 'a_vencer') diasLabel = `<span style="color:var(--warning);font-size:.72rem;font-weight:700;">vence em ${i.dias_diff}d</span>`;
      else diasLabel = `<span style="color:var(--success);font-size:.72rem;">${i.dias_diff}d restantes</span>`;
    }

    const canReg = (isSup || String(session.id) === String(profId));

    return `<div class="tr-dash-item">
      <div class="tr-dash-status-dot" style="background:${sc.cor};" title="${sc.label}"></div>
      <div class="tr-dash-body">
        <div class="tr-dash-nome">${i.nome} ${i.obrigatorio==='true'?'<span class="badge badge-danger" style="font-size:.58rem;">Obrigatório</span>':''}</div>
        <div class="tr-dash-meta">
          <span class="badge badge-gray" style="font-size:.6rem;">${i.categoria}</span>
          ${i.dt_realizacao ? `<span>Realizado: ${Utils.fmtDate(i.dt_realizacao)}</span>` : '<span class="text-muted">Não realizado</span>'}
          ${i.dt_vencimento ? `<span>Vence: ${Utils.fmtDate(i.dt_vencimento)}</span>` : (i.validade_dias > 0 ? '' : '<span class="text-muted">Sem validade</span>')}
          ${diasLabel}
        </div>
      </div>
      <div class="tr-dash-right">
        <span class="tr-status-badge ${sc.cls}">${sc.icon} ${sc.label}</span>
        ${canReg && isSup ? `<button class="btn btn-ghost btn-sm" style="margin-top:4px;font-size:.7rem;" onclick="abrirModalRegistro('${profId}','${i.treinamento_id}','${i.registro_id}')">Registrar</button>` : ''}
      </div>
    </div>`;
  }

  // ════════════════════════════════════════
  // MATRIZ DE TREINAMENTO
  // ════════════════════════════════════════
  async function renderMatrizTR() {
    if (!isSup) return;
    const container = Utils.el('tr-matriz');
    if (!container) return;

    const funcoes = [...new Set(profissionais.map(p=>p.funcao).filter(Boolean))].sort();
    const funcaoSel = Utils.el('tr-filtro-funcao')?.value || funcoes[0] || '';

    const matrizFuncao = matriz.filter(m => m.funcao === funcaoSel);

    container.innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:1rem;">
        <select class="form-control" id="tr-filtro-funcao" style="max-width:220px;" onchange="renderAbaTR('matriz')">
          ${funcoes.map(f=>`<option value="${f}" ${f===funcaoSel?'selected':''}>${f}</option>`).join('')}
        </select>
        <button class="btn btn-primary btn-sm" onclick="abrirModalMatriz('${funcaoSel}')">+ Adicionar treinamento</button>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">🎯 Matriz — ${funcaoSel}</span>
          <span class="badge badge-gray">${matrizFuncao.length} treinamentos</span>
        </div>
        ${matrizFuncao.length
          ? matrizFuncao.map(m => {
              const tr = catalogo.find(t=>String(t.id)===String(m.treinamento_id));
              if (!tr) return '';
              return `<div class="tr-matriz-item">
                <div class="tr-matriz-body">
                  <div class="tr-matriz-nome">${tr.nome}</div>
                  <div class="tr-matriz-meta">
                    <span class="badge badge-gray">${tr.categoria}</span>
                    <span class="badge ${tr.tipo==='reciclagem'?'badge-info':'badge-primary'}">${tr.tipo}</span>
                    ${tr.validade_dias>0?`<span class="badge badge-warning">${Math.round(tr.validade_dias/30)}m validade</span>`:'<span class="badge badge-gray">sem validade</span>'}
                    ${m.obrigatorio==='true'?'<span class="badge badge-danger">Obrigatório</span>':'<span class="badge badge-gray">Opcional</span>'}
                  </div>
                </div>
                <button class="btn btn-ghost btn-sm btn-icon" onclick="deleteMatrizItemTR('${m.id}')" style="color:var(--danger);">🗑</button>
              </div>`;
            }).join('')
          : '<div class="empty-state" style="padding:1.5rem;"><p>Nenhum treinamento na matriz para esta função.</p></div>'}
      </div>`;

    Utils.el('tr-filtro-funcao')?.addEventListener('change', () => renderMatrizTR());
  }

  window.deleteMatrizItemTR = async (id) => {
    if (!confirm('Remover este treinamento da matriz?')) return;
    try {
      await API.deleteMatrizItemTR(id);
      Utils.toast('Removido!', 'success');
      const res = await API.getMatrizTR({});
      matriz = res.matriz || [];
      renderMatrizTR();
    } catch(e) { Utils.toast('Erro: ' + e.message, 'error'); }
  };

  // ════════════════════════════════════════
  // CATÁLOGO
  // ════════════════════════════════════════
  function renderCatalogoTR() {
    const container = Utils.el('tr-catalogo');
    if (!container) return;
    container.innerHTML = `
      ${isSup?`<div style="margin-bottom:1rem;display:flex;justify-content:flex-end;"><button class="btn btn-primary btn-sm" onclick="abrirModalCatalogo()">+ Novo treinamento</button></div>`:''}
      <div class="card">
        <div class="card-header"><span class="card-title">📚 Catálogo de Treinamentos</span><span class="badge badge-gray">${catalogo.length}</span></div>
        ${catalogo.map(t => `
          <div class="tr-matriz-item">
            <div class="tr-matriz-body">
              <div class="tr-matriz-nome">${t.nome}</div>
              <div class="tr-matriz-meta">
                <span class="badge badge-gray">${t.categoria}</span>
                <span class="badge ${t.tipo==='reciclagem'?'badge-info':t.tipo==='formacao'?'badge-primary':'badge-success'}">${t.tipo}</span>
                ${t.validade_dias>0?`<span class="badge badge-warning">Validade: ${t.validade_dias}d</span>`:'<span class="badge badge-gray">Sem validade</span>'}
              </div>
              ${t.descricao?`<div style="font-size:.72rem;color:var(--gray-400);margin-top:3px;">${t.descricao}</div>`:''}
            </div>
            ${isSup?`<div style="display:flex;gap:4px;">
              <button class="btn btn-ghost btn-sm btn-icon" onclick="abrirModalCatalogo('${t.id}')">✏️</button>
              <button class="btn btn-ghost btn-sm btn-icon" onclick="deleteCatalogoTR('${t.id}')" style="color:var(--danger);">🗑</button>
            </div>`:''}
          </div>`).join('')}
      </div>`;
  }

  window.deleteCatalogoTR = async (id) => {
    if (!confirm('Desativar este treinamento do catálogo?')) return;
    try {
      await API.deleteCatalogoTR(id);
      Utils.toast('Desativado!', 'success');
      const res = await API.getCatalogoTR();
      catalogo = res.catalogo || [];
      renderCatalogoTR();
    } catch(e) { Utils.toast('Erro: ' + e.message, 'error'); }
  };

  // ════════════════════════════════════════
  // HISTÓRICO TÉCNICO
  // ════════════════════════════════════════
  async function renderHistoricoTR() {
    const container = Utils.el('tr-historico');
    if (!container) return;
    container.innerHTML = '<div class="text-muted text-sm">Carregando...</div>';
    try {
      const profId = isSup ? (Utils.el('tr-hist-prof')?.value || '') : session.id;
      const res = await API.getHistoricoTecnicoTR({ profissional_id: profId });
      histTecnico = res.historico || [];

      container.innerHTML = `
        ${isSup?`<div style="margin-bottom:1rem;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <select class="form-control" id="tr-hist-prof" style="max-width:220px;" onchange="renderAbaTR('historico')">
            <option value="">Todos os profissionais</option>
            ${profissionais.map(p=>`<option value="${p.id}" ${String(p.id)===String(profId)?'selected':''}>${p.nome}</option>`).join('')}
          </select>
          <button class="btn btn-primary btn-sm" onclick="abrirModalHistTecnico()">+ Registrar treinamento técnico</button>
        </div>`:`<div style="margin-bottom:1rem;display:flex;justify-content:flex-end;"><button class="btn btn-primary btn-sm" onclick="abrirModalHistTecnico()">+ Registrar treinamento técnico</button></div>`}
        <div class="card">
          <div class="card-header"><span class="card-title">🏆 Histórico de Treinamentos Técnicos</span></div>
          ${histTecnico.length
            ? histTecnico.map(h => {
                const tr   = catalogo.find(t=>String(t.id)===String(h.treinamento_id));
                const prof = profissionais.find(p=>String(p.id)===String(h.profissional_id));
                const notaColor = parseFloat(h.nota_avaliacao||0) >= 7 ? 'var(--success)' : parseFloat(h.nota_avaliacao||0) >= 5 ? 'var(--warning)' : 'var(--danger)';
                return `<div class="tr-hist-card">
                  <div class="tr-hist-left">
                    <div style="font-weight:700;font-size:.875rem;">${tr?.nome||h.treinamento_id}</div>
                    ${isSup?`<div style="font-size:.75rem;color:var(--gray-400);">👤 ${prof?.nome||'—'}</div>`:''}
                    <div class="tr-hist-meta">
                      <span>📅 ${Utils.fmtDate(h.dt_realizacao)}</span>
                      ${h.carga_horaria?`<span>⏱ ${h.carga_horaria}h</span>`:''}
                      ${h.instrutor?`<span>🎓 ${h.instrutor}</span>`:''}
                      ${h.local?`<span>📍 ${h.local}</span>`:''}
                    </div>
                    ${h.obs?`<div class="tr-hist-obs">${h.obs}</div>`:''}
                  </div>
                  <div class="tr-hist-right">
                    ${h.nota_avaliacao?`<div style="font-size:1.5rem;font-weight:800;color:${notaColor};line-height:1;">${parseFloat(h.nota_avaliacao).toFixed(1)}</div><div style="font-size:.65rem;color:var(--gray-400);">nota</div>`:''}
                    ${h.resultado?`<div><span class="badge ${h.resultado==='Aprovado'?'badge-success':h.resultado==='Reprovado'?'badge-danger':'badge-gray'}">${h.resultado}</span></div>`:''}
                    ${isSup?`<button class="btn btn-ghost btn-sm btn-icon" onclick="deleteTecnicoTR('${h.id}')" style="color:var(--danger);margin-top:4px;">🗑</button>`:''}
                  </div>
                </div>`;
              }).join('')
            : '<div class="empty-state" style="padding:1.5rem;"><p>Nenhum treinamento técnico registrado.</p></div>'}
        </div>`;

      Utils.el('tr-hist-prof')?.addEventListener('change', () => renderHistoricoTR());
    } catch(e) { container.innerHTML = `<div class="alert alert-danger">Erro: ${e.message}</div>`; }
  }

  window.deleteTecnicoTR = async (id) => {
    if (!confirm('Excluir este registro de treinamento técnico?')) return;
    try {
      await API.deleteHistoricoTecnicoTR(id);
      Utils.toast('Excluído!', 'success');
      renderHistoricoTR();
    } catch(e) { Utils.toast('Erro: ' + e.message, 'error'); }
  };

  // ════════════════════════════════════════
  // MODAIS
  // ════════════════════════════════════════

  // Modal Catálogo
  window.abrirModalCatalogo = (id = null) => {
    const t = id ? catalogo.find(x=>String(x.id)===String(id)) : null;
    const modal = document.getElementById('modal-tr-catalogo');
    if (!modal) return;
    document.getElementById('tr-cat-id').value           = t?.id || '';
    document.getElementById('tr-cat-nome').value         = t?.nome || '';
    document.getElementById('tr-cat-categoria').value    = t?.categoria || 'NR';
    document.getElementById('tr-cat-tipo').value         = t?.tipo || 'reciclagem';
    document.getElementById('tr-cat-validade').value     = t?.validade_dias || '';
    document.getElementById('tr-cat-descricao').value    = t?.descricao || '';
    document.getElementById('tr-cat-title').textContent  = t ? 'Editar Treinamento' : 'Novo Treinamento';
    Utils.openModal('modal-tr-catalogo');
  };

  document.getElementById('form-tr-catalogo')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('btn-salvar-tr-cat');
    btn.disabled = true;
    try {
      await API.saveCatalogoTR({
        id:           document.getElementById('tr-cat-id').value,
        nome:         document.getElementById('tr-cat-nome').value.trim(),
        categoria:    document.getElementById('tr-cat-categoria').value,
        tipo:         document.getElementById('tr-cat-tipo').value,
        validade_dias:parseInt(document.getElementById('tr-cat-validade').value)||0,
        descricao:    document.getElementById('tr-cat-descricao').value.trim(),
      });
      Utils.closeModal('modal-tr-catalogo');
      Utils.toast('Treinamento salvo!', 'success');
      const res = await API.getCatalogoTR();
      catalogo = res.catalogo || [];
      renderAbaTR(abaAtual);
    } catch(e) { Utils.toast('Erro: ' + e.message, 'error'); }
    finally { btn.disabled = false; }
  });

  // Modal Matriz
  window.abrirModalMatriz = (funcao) => {
    const modal = document.getElementById('modal-tr-matriz');
    if (!modal) return;
    document.getElementById('tr-mat-funcao').value = funcao;
    const sel = document.getElementById('tr-mat-treinamento');
    sel.innerHTML = catalogo.map(t=>`<option value="${t.id}">${t.nome} (${t.categoria})</option>`).join('');
    Utils.openModal('modal-tr-matriz');
  };

  document.getElementById('form-tr-matriz')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('btn-salvar-tr-mat');
    btn.disabled = true;
    try {
      await API.saveMatrizItemTR({
        funcao:         document.getElementById('tr-mat-funcao').value,
        treinamento_id: document.getElementById('tr-mat-treinamento').value,
        obrigatorio:    document.getElementById('tr-mat-obrig').value,
      });
      Utils.closeModal('modal-tr-matriz');
      Utils.toast('Adicionado à matriz!', 'success');
      const res = await API.getMatrizTR({});
      matriz = res.matriz || [];
      renderMatrizTR();
    } catch(e) { Utils.toast('Erro: ' + e.message, 'error'); }
    finally { btn.disabled = false; }
  });

  // Modal Registro (segurança/ASO)
  window.abrirModalRegistro = (profId, trId, regId) => {
    const modal = document.getElementById('modal-tr-registro');
    if (!modal) return;
    document.getElementById('tr-reg-prof').value     = profId || session.id;
    document.getElementById('tr-reg-treina').value   = trId || '';
    document.getElementById('tr-reg-id').value       = regId || '';
    document.getElementById('tr-reg-data').value     = '';
    document.getElementById('tr-reg-carga').value    = '';
    document.getElementById('tr-reg-instrutor').value= '';
    document.getElementById('tr-reg-local').value    = '';
    document.getElementById('tr-reg-obs').value      = '';
    // popular select de treinamentos
    const selTr = document.getElementById('tr-reg-treina');
    if (selTr) {
      selTr.innerHTML = catalogo.map(t=>`<option value="${t.id}" ${t.id===trId?'selected':''}>${t.nome}</option>`).join('');
    }
    const selProf = document.getElementById('tr-reg-prof');
    if (selProf && isSup) {
      selProf.innerHTML = profissionais.map(p=>`<option value="${p.id}" ${String(p.id)===String(profId)?'selected':''}>${p.nome}</option>`).join('');
    }
    Utils.openModal('modal-tr-registro');
  };

  document.getElementById('form-tr-registro')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('btn-salvar-tr-reg');
    btn.disabled = true;
    try {
      await API.saveRegistroTR({
        profissional_id: document.getElementById('tr-reg-prof').value,
        treinamento_id:  document.getElementById('tr-reg-treina').value,
        dt_realizacao:   document.getElementById('tr-reg-data').value,
        carga_horaria:   document.getElementById('tr-reg-carga').value,
        instrutor:       document.getElementById('tr-reg-instrutor').value,
        local:           document.getElementById('tr-reg-local').value,
        obs:             document.getElementById('tr-reg-obs').value,
      });
      Utils.closeModal('modal-tr-registro');
      Utils.toast('Registro salvo!', 'success');
      renderDashboardTR();
    } catch(e) { Utils.toast('Erro: ' + e.message, 'error'); }
    finally { btn.disabled = false; }
  });

  // Modal Histórico Técnico
  window.abrirModalHistTecnico = (id = null) => {
    const modal = document.getElementById('modal-tr-tecnico');
    if (!modal) return;
    const h = id ? histTecnico.find(x=>String(x.id)===String(id)) : null;
    document.getElementById('tr-tec-id').value        = h?.id || '';
    document.getElementById('tr-tec-data').value      = h?.dt_realizacao || '';
    document.getElementById('tr-tec-carga').value     = h?.carga_horaria || '';
    document.getElementById('tr-tec-instrutor').value = h?.instrutor || '';
    document.getElementById('tr-tec-local').value     = h?.local || '';
    document.getElementById('tr-tec-nota').value      = h?.nota_avaliacao || '';
    document.getElementById('tr-tec-result').value    = h?.resultado || 'Aprovado';
    document.getElementById('tr-tec-obs').value       = h?.obs || '';
    document.getElementById('tr-tec-title').textContent = h ? 'Editar Treinamento Técnico' : 'Registrar Treinamento Técnico';
    // Selects
    const selProf = document.getElementById('tr-tec-prof');
    const selTr   = document.getElementById('tr-tec-treina');
    if (selProf) {
      if (isSup) {
        selProf.innerHTML = profissionais.map(p=>`<option value="${p.id}" ${String(p.id)===(h?.profissional_id||session.id)?'selected':''}>${p.nome}</option>`).join('');
        selProf.closest('.form-group').style.display = '';
      } else {
        selProf.innerHTML = `<option value="${session.id}">${session.nome}</option>`;
        selProf.closest('.form-group').style.display = 'none';
      }
    }
    if (selTr) selTr.innerHTML = catalogo.filter(t=>t.tipo==='tecnico'||true)
      .map(t=>`<option value="${t.id}" ${t.id===h?.treinamento_id?'selected':''}>${t.nome}</option>`).join('');
    Utils.openModal('modal-tr-tecnico');
  };

  document.getElementById('form-tr-tecnico')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('btn-salvar-tr-tec');
    btn.disabled = true;
    try {
      await API.saveHistoricoTecnicoTR({
        id:              document.getElementById('tr-tec-id').value,
        profissional_id: document.getElementById('tr-tec-prof').value || session.id,
        treinamento_id:  document.getElementById('tr-tec-treina').value,
        dt_realizacao:   document.getElementById('tr-tec-data').value,
        carga_horaria:   document.getElementById('tr-tec-carga').value,
        instrutor:       document.getElementById('tr-tec-instrutor').value,
        local:           document.getElementById('tr-tec-local').value,
        nota_avaliacao:  document.getElementById('tr-tec-nota').value,
        resultado:       document.getElementById('tr-tec-result').value,
        obs:             document.getElementById('tr-tec-obs').value,
      });
      Utils.closeModal('modal-tr-tecnico');
      Utils.toast('Treinamento técnico registrado!', 'success');
      renderHistoricoTR();
    } catch(e) { Utils.toast('Erro: ' + e.message, 'error'); }
    finally { btn.disabled = false; }
  });

})();

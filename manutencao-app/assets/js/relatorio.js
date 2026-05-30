/**
 * relatorio.js — Geração e visualização de relatório
 */

(async () => {
  const session = Auth.requireAuth(['admin', 'supervisor']);
  if (!session) return;
  Auth.initUserUI(session);
  Utils.initSidebar();

  let dadosRelatorio = null;
  let filtros = { semanaId: '', dataInicio: '', dataFim: '', tecnicoId: '' };

  // Carregar selects de filtro
  async function initFiltros() {
    try {
      const [semRes, profRes] = await Promise.all([API.getSemanas(), API.getProfissionais()]);
      const semanas = semRes.semanas || [];
      const profs   = profRes.profissionais || [];

      const semSel = Utils.el('filtro-semana');
      if (semSel) {
        semSel.innerHTML = '<option value="">Todas as semanas</option>' +
          semanas.map(s => `<option value="${s.id}">${s.id} (${Utils.fmtDate(s.data_inicio)} — ${Utils.fmtDate(s.data_fim)})</option>`).join('');
      }
      const profSel = Utils.el('filtro-tecnico');
      if (profSel) {
        profSel.innerHTML = '<option value="">Todos os técnicos</option>' +
          profs.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
      }
    } catch (e) { Utils.toast('Erro ao carregar filtros', 'error'); }
  }

  Utils.el('btn-gerar')?.addEventListener('click', gerarRelatorio);
  Utils.el('btn-pdf')?.addEventListener('click', gerarPDF);
  Utils.el('btn-whatsapp')?.addEventListener('click', compartilharWhatsApp);

  async function gerarRelatorio() {
    filtros = {
      semanaId:    Utils.el('filtro-semana')?.value  || '',
      dataInicio:  Utils.el('filtro-inicio')?.value  || '',
      dataFim:     Utils.el('filtro-fim')?.value     || '',
      tecnicoId:   Utils.el('filtro-tecnico')?.value || '',
    };

    const btn = Utils.el('btn-gerar');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span> Gerando...';
    Utils.showLoading('Buscando dados...');

    try {
      const res = await API.getRelatorio(filtros);
      dadosRelatorio = res;
      renderRelatorio(res);
      Utils.el('rel-actions')?.classList.remove('hidden');
    } catch (e) {
      Utils.toast('Erro ao gerar relatório: ' + e.message, 'error');
    } finally {
      Utils.hideLoading();
      btn.disabled = false;
      btn.innerHTML = '📊 Gerar Relatório';
    }
  }

  function renderRelatorio(d) {
    const container = Utils.el('relatorio-output');
    if (!container) return;

    const pctExec = d.totalProgramadas ? Math.round(d.totalExecutadas / d.totalProgramadas * 100) : 0;

    container.innerHTML = `
      <div id="rel-print-area">
        <!-- Cabeçalho -->
        <div class="card mb-3">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;">
            <div>
              <h2 style="font-size:1.3rem;margin-bottom:4px;">Relatório de Manutenção</h2>
              <div class="text-muted text-sm">
                ${d.semana ? `Semana ${d.semana.id} — ` : ''}
                ${Utils.fmtDate(d.dataInicio)} a ${Utils.fmtDate(d.dataFim)}
              </div>
              ${d.tecnico ? `<div class="text-sm mt-1">Técnico: <strong>${d.tecnico}</strong></div>` : ''}
            </div>
            <div style="text-align:right;">
              <div class="text-xs text-muted">Gerado em</div>
              <div class="text-sm fw-500">${Utils.fmtDateTime(new Date().toISOString())}</div>
            </div>
          </div>
        </div>

        <!-- Resumo HH -->
        <div class="card mb-3">
          <div class="card-header"><span class="card-title">⏱ Resumo de Horas-Homem</span></div>
          <div class="stat-cards" style="margin-bottom:0;">
            <div class="stat-card">
              <div class="stat-card-label">HH Disponível</div>
              <div class="stat-card-value">${d.hhDisponivel || 0}h</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-label">HH Programado</div>
              <div class="stat-card-value" style="color:var(--primary);">${d.hhProgramado || 0}h</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-label">HH Realizado</div>
              <div class="stat-card-value" style="color:var(--success);">${d.hhRealizado || 0}h</div>
              <div class="stat-card-sub">${d.hhDisponivel ? Math.round((d.hhRealizado||0)/d.hhDisponivel*100) : 0}% do disponível</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-label">% Execução</div>
              <div class="stat-card-value" style="color:${pctExec >= 80 ? 'var(--success)' : pctExec >= 60 ? 'var(--warning)' : 'var(--danger)'};">${pctExec}%</div>
              <div class="stat-card-sub">${d.totalExecutadas}/${d.totalProgramadas} atividades</div>
            </div>
          </div>
        </div>

        <!-- Barra visual -->
        <div class="card mb-3">
          <div class="card-header"><span class="card-title">📊 Visão Geral</span></div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:14px;">
            ${[
              ['Programadas executadas', d.executadasProgramadas?.length || 0, 'var(--success)'],
              ['Não realizadas',         d.naoRealizadas?.length || 0,         'var(--danger)'],
              ['Fora de programação',    d.foraProgramacao?.length || 0,       '#0891b2'],
              ['Ver e Agir',             d.verEAgir?.length || 0,              '#7c3aed'],
            ].map(([label, val, cor]) => `
              <div style="text-align:center;padding:14px;background:var(--gray-50);border-radius:var(--radius);border:1px solid var(--gray-200);">
                <div style="font-size:1.8rem;font-weight:600;color:${cor};">${val}</div>
                <div style="font-size:.75rem;color:var(--gray-500);margin-top:2px;">${label}</div>
              </div>`).join('')}
          </div>
          <div class="hh-bar-wrap">
            <div class="hh-labels"><span>Programado ${d.hhProgramado}h</span><span>Realizado ${d.hhRealizado}h</span></div>
            <div class="hh-bar-track" style="height:14px;">
              <div class="hh-bar-prog" style="width:${d.hhDisponivel ? Math.min(100,d.hhProgramado/d.hhDisponivel*100) : 0}%"></div>
              <div class="hh-bar-real" style="width:${d.hhDisponivel ? Math.min(100,(d.hhRealizado||0)/d.hhDisponivel*100) : 0}%"></div>
            </div>
          </div>
        </div>

        <!-- Atividades executadas (programadas) -->
        ${renderSecao('✅ Atividades Programadas — Executadas', d.executadasProgramadas, true)}

        <!-- Atividades não realizadas -->
        ${renderSecaoNaoRealizadas(d.naoRealizadas)}

        <!-- Fora de programação -->
        ${renderSecao('🔧 Fora de Programação', d.foraProgramacao, true)}

        <!-- Ver e Agir -->
        ${renderSecao('👁 Ver e Agir', d.verEAgir, true)}

        <!-- Análise de motivos -->
        ${renderAnaliseMotivoS(d.analiseMOtivos)}
      </div>
    `;
  }

  function renderSecao(titulo, items, comFotos = false) {
    if (!items || !items.length) return '';
    return `
      <div class="card mb-3">
        <div class="card-header"><span class="card-title">${titulo}</span><span class="badge badge-gray">${items.length}</span></div>
        ${items.map(item => `
          <div style="padding:12px 0;border-bottom:1px solid var(--gray-100);">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
              <div>
                <div class="fw-500">${item.equipamento_nome || '—'} <span class="text-xs text-muted">${item.equip_tag || ''}</span></div>
                <div class="text-sm text-muted">${item.descricao}</div>
                <div class="text-xs text-muted mt-1">
                  👤 ${item.tecnico_nome || '—'} · 📅 ${Utils.fmtDate(item.data_programada)} · ⏱ ${Utils.fmtHH(item.hh_real || item.hh_estimado)}
                </div>
                ${item.obs ? `<div class="text-sm mt-1" style="background:var(--gray-50);padding:6px 10px;border-radius:var(--radius-sm);border-left:3px solid var(--gray-300);">${item.obs}</div>` : ''}
              </div>
              ${Utils.statusBadge(item.status)}
            </div>
            ${comFotos && (item.fotos_antes?.length || item.fotos_depois?.length) ? `
              <div style="margin-top:10px;display:flex;gap:16px;flex-wrap:wrap;">
                ${item.fotos_antes?.length ? `
                  <div>
                    <div class="text-xs text-muted mb-1">Antes:</div>
                    <div style="display:flex;gap:6px;">
                      ${item.fotos_antes.map(url => `<img src="${url}" style="width:80px;height:80px;object-fit:cover;border-radius:var(--radius);border:1px solid var(--gray-200);">`).join('')}
                    </div>
                  </div>` : ''}
                ${item.fotos_depois?.length ? `
                  <div>
                    <div class="text-xs text-muted mb-1">Depois:</div>
                    <div style="display:flex;gap:6px;">
                      ${item.fotos_depois.map(url => `<img src="${url}" style="width:80px;height:80px;object-fit:cover;border-radius:var(--radius);border:1px solid var(--gray-200);">`).join('')}
                    </div>
                  </div>` : ''}
              </div>` : ''}
          </div>`).join('')}
      </div>`;
  }

  function renderSecaoNaoRealizadas(items) {
    if (!items || !items.length) return '';
    return `
      <div class="card mb-3">
        <div class="card-header"><span class="card-title">❌ Não Realizadas</span><span class="badge badge-danger">${items.length}</span></div>
        ${items.map(item => `
          <div style="padding:12px 0;border-bottom:1px solid var(--gray-100);">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
              <div>
                <div class="fw-500">${item.equipamento_nome || '—'} <span class="text-xs text-muted">${item.equip_tag || ''}</span></div>
                <div class="text-sm text-muted">${item.descricao}</div>
                <div class="text-xs text-muted mt-1">👤 ${item.tecnico_nome || '—'} · 📅 ${Utils.fmtDate(item.data_programada)}</div>
                <div style="margin-top:8px;display:inline-flex;align-items:center;gap:6px;background:var(--danger-light);padding:5px 10px;border-radius:99px;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <span style="font-size:.78rem;font-weight:600;color:var(--danger);">${item.motivo_desc || 'Sem motivo informado'}</span>
                  <span class="badge badge-danger" style="font-size:.65rem;">${item.motivo_categoria || ''}</span>
                </div>
                ${item.obs ? `<div class="text-sm mt-2">${item.obs}</div>` : ''}
              </div>
              ${Utils.statusBadge(item.status)}
            </div>
          </div>`).join('')}
      </div>`;
  }

  function renderAnaliseMotivoS(analise) {
    if (!analise || !analise.length) return '';
    const max = analise[0].quantidade;
    return `
      <div class="card mb-3">
        <div class="card-header"><span class="card-title">📈 Análise de Impacto — Motivos de Não Execução</span></div>
        ${analise.map(m => `
          <div style="padding:10px 0;border-bottom:1px solid var(--gray-100);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
              <div>
                <span class="fw-500">${m.descricao}</span>
                <span class="badge badge-gray" style="margin-left:6px;">${m.categoria}</span>
              </div>
              <div style="text-align:right;">
                <span class="fw-500" style="color:var(--danger);">${m.quantidade}x</span>
                <span class="text-xs text-muted"> · ${Utils.fmtHH(m.hh_impacto)} de impacto</span>
              </div>
            </div>
            <div class="progress">
              <div class="progress-bar" style="width:${Math.round(m.quantidade/max*100)}%;background:var(--danger);"></div>
            </div>
          </div>`).join('')}
      </div>`;
  }

  // ── PDF ──
  async function gerarPDF() {
    if (!dadosRelatorio) { Utils.toast('Gere o relatório primeiro', 'error'); return; }
    const btn = Utils.el('btn-pdf');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span> Gerando PDF...';
    try {
      const res = await API.gerarPDF(filtros);
      if (res.url) {
        window.open(res.url, '_blank');
        Utils.toast('PDF gerado! Abrindo...', 'success');
      }
    } catch (e) {
      Utils.toast('Erro ao gerar PDF: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '📄 Exportar PDF';
    }
  }

  // ── WhatsApp ──
  function compartilharWhatsApp() {
    if (!dadosRelatorio) { Utils.toast('Gere o relatório primeiro', 'error'); return; }
    const d = dadosRelatorio;
    const pct = d.totalProgramadas ? Math.round(d.totalExecutadas / d.totalProgramadas * 100) : 0;

    const msg = [
      `📋 *Relatório de Manutenção*`,
      `📅 ${Utils.fmtDate(d.dataInicio)} a ${Utils.fmtDate(d.dataFim)}`,
      ``,
      `⏱ *Horas-Homem*`,
      `• Disponível: ${d.hhDisponivel}h`,
      `• Programado: ${d.hhProgramado}h`,
      `• Realizado: ${d.hhRealizado}h`,
      ``,
      `📊 *Execução: ${pct}%* (${d.totalExecutadas}/${d.totalProgramadas})`,
      ``,
      `✅ Executadas: ${d.executadasProgramadas?.length || 0}`,
      `❌ Não realizadas: ${d.naoRealizadas?.length || 0}`,
      `🔧 Fora de programação: ${d.foraProgramacao?.length || 0}`,
      `👁 Ver e Agir: ${d.verEAgir?.length || 0}`,
      d.pdfUrl ? `\n📎 Relatório completo:\n${d.pdfUrl}` : '',
    ].filter(l => l !== undefined).join('\n');

    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  }

  await initFiltros();
})();

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
      const ra = Utils.el('rel-actions');
      if (ra) ra.style.display = 'flex';
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
      <!-- Botões de ação no topo do relatório -->
      <div style="display:flex;gap:10px;margin-bottom:1rem;flex-wrap:wrap;">
        <button class="btn btn-danger" onclick="document.getElementById('btn-pdf').click()" style="gap:8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          Exportar PDF
        </button>
        <button class="btn btn-success" onclick="document.getElementById('btn-whatsapp').click()" style="gap:8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.121 1.533 5.848L.054 23.27l5.538-1.454A11.938 11.938 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.012-1.374l-.36-.213-3.288.863.878-3.207-.233-.37A9.818 9.818 0 012.182 12C2.182 6.571 6.571 2.182 12 2.182S21.818 6.571 21.818 12 17.429 21.818 12 21.818z"/></svg>
          Enviar WhatsApp
        </button>
      </div>
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

  // ── Auto-refresh dos selects de filtro a cada 30s ──
  // (Relatório não regera automaticamente, só os selects de semana/técnico)
  setInterval(async () => {
    try { await initFiltros(); } catch {}
  }, 30000);

})();

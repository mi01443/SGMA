/**
 * relatorio.js — Módulo de Relatório SGMA
 */
(async () => {
  const session = Auth.requireAuth(['admin','supervisor']);
  if (!session) return;
  Auth.initUserUI(session);
  Utils.initSidebar();

  let dadosRelatorio = null;
  let dadosPlanos    = null;

  // ── Carregar selects ──
  async function initFiltros() {
    try {
      const [semRes, profRes] = await Promise.all([
        API.getSemanas(),
        API.getProfissionais(),
      ]);
      const semanas = semRes.semanas || [];
      const profs   = profRes.profissionais || [];

      const semSel = Utils.el('filtro-semana');
      if (semSel) {
        semSel.innerHTML = '<option value="">Todas as semanas</option>' +
          semanas.map(s =>
            '<option value="' + s.id + '">' + s.id +
            ' (' + Utils.fmtDate(s.data_inicio) + ' — ' + Utils.fmtDate(s.data_fim) + ')</option>'
          ).join('');
      }

      const profSel = Utils.el('filtro-tecnico');
      if (profSel) {
        profSel.innerHTML = '<option value="">Todos os técnicos</option>' +
          profs.map(p => '<option value="' + p.id + '">' + p.nome + '</option>').join('');
      }
    } catch(e) {
      Utils.toast('Erro ao carregar filtros: ' + e.message, 'error');
    }
  }

  // ── Seções toggle ──
  document.querySelectorAll('.rel-section-toggle').forEach(lbl => {
    lbl.addEventListener('click', function() {
      const cb = this.querySelector('input[type=checkbox]');
      // toggle é feito pelo browser; só atualizar a classe
      setTimeout(() => {
        this.classList.toggle('active', cb.checked);
      }, 0);
    });
  });

  function secAtiva(id) {
    const el = Utils.el(id);
    return el ? el.checked : false;
  }

  // ── Eventos ──
  Utils.el('btn-gerar')?.addEventListener('click', gerarRelatorio);
  Utils.el('btn-pdf')?.addEventListener('click', gerarPDF);
  Utils.el('btn-whatsapp')?.addEventListener('click', compartilharWhatsApp);

  // ══════════════════════════════════════════
  // GERAR RELATÓRIO
  // ══════════════════════════════════════════
  async function gerarRelatorio() {
    const btn = Utils.el('btn-gerar');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;margin-right:6px;"></span> Gerando...';
    Utils.showLoading('Buscando dados...');

    const filtros = {
      semanaId:   Utils.el('filtro-semana')?.value  || '',
      dataInicio: Utils.el('filtro-inicio')?.value  || '',
      dataFim:    Utils.el('filtro-fim')?.value     || '',
      tecnicoId:  Utils.el('filtro-tecnico')?.value || '',
    };

    try {
      // Buscar dados de manutenção
      const res = await API.getRelatorio(filtros);
      dadosRelatorio = res;

      // Buscar planos de ação se seção ativa
      dadosPlanos = null;
      if (secAtiva('sec-planos')) {
        try {
          const paRes  = await API.getPlanos();
          const atRes  = await API.getAtividadesPA();
          dadosPlanos  = { planos: paRes.planos || [], atividades: atRes.atividades || [] };
        } catch(e) { console.warn('Planos de ação não disponíveis:', e.message); }
      }

      renderRelatorio(res, filtros);

      // Mostrar botões de ação
      const ra = Utils.el('rel-actions');
      if (ra) ra.style.display = 'flex';

      Utils.el('rel-placeholder')?.classList.add('hidden');
      Utils.el('relatorio-output')?.classList.remove('hidden');

    } catch(e) {
      Utils.toast('Erro ao gerar relatório: ' + e.message, 'error');
    } finally {
      Utils.hideLoading();
      btn.disabled = false;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg> Gerar Relatório';
    }
  }

  // ══════════════════════════════════════════
  // RENDERIZAR RELATÓRIO
  // ══════════════════════════════════════════
  function renderRelatorio(d, filtros) {
    const container = Utils.el('relatorio-output');
    if (!container) return;

    const pct = d.totalProgramadas ? Math.round((d.totalExecutadas||0) / d.totalProgramadas * 100) : 0;
    const periodo = d.semana
      ? 'Semana ' + d.semana.id + ' · ' + Utils.fmtDate(d.semana.data_inicio) + ' a ' + Utils.fmtDate(d.semana.data_fim)
      : (Utils.fmtDate(d.dataInicio)||'—') + ' a ' + (Utils.fmtDate(d.dataFim)||'—');

    let html = '<div id="rel-print-area">';

    // ── Hero ──
    html += '<div class="rel-hero">' +
      '<div class="rel-hero-title">Relatório de Manutenção</div>' +
      '<div class="rel-hero-sub">' + periodo + (d.tecnico ? ' · ' + d.tecnico : '') + ' · Gerado em ' + Utils.fmtDateTime(new Date().toISOString()) + '</div>' +
      '<div class="rel-hero-kpis">' +
        kpiHero(pct + '%', 'Taxa Execução', pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444') +
        kpiHero((d.hhRealizado||0) + 'h', 'HH Realizado', '#60a5fa') +
        kpiHero((d.totalExecutadas||0), 'Executadas', '#22c55e') +
        kpiHero((d.naoRealizadas||[]).length, 'Não realizadas', '#ef4444') +
        kpiHero((d.foraProgramacao||[]).length + (d.verEAgir||[]).length, 'Extra prog.', '#a78bfa') +
      '</div>' +
    '</div>';

    // Botões de ação dentro do relatório
    html += '<div class="rel-action-bar">' +
      '<button class="btn btn-danger" onclick="document.getElementById(\'btn-pdf\').click()">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
        'Exportar PDF' +
      '</button>' +
      '<button class="btn btn-success" onclick="document.getElementById(\'btn-whatsapp\').click()">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.121 1.533 5.848L.054 23.27l5.538-1.454A11.938 11.938 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.012-1.374l-.36-.213-3.288.863.878-3.207-.233-.37A9.818 9.818 0 012.182 12C2.182 6.571 6.571 2.182 12 2.182S21.818 6.571 21.818 12 17.429 21.818 12 21.818z"/></svg>' +
        'Enviar WhatsApp' +
      '</button>' +
    '</div>';

    // ── Resumo HH ──
    if (secAtiva('sec-resumo')) {
      const hhProg = parseFloat(d.hhProgramado||0);
      const hhReal = parseFloat(d.hhRealizado||0);
      const hhDisp = parseFloat(d.hhDisponivel||0);
      const pctProg = hhDisp ? Math.min(100, Math.round(hhProg/hhDisp*100)) : 0;
      const pctReal = hhDisp ? Math.min(100, Math.round(hhReal/hhDisp*100)) : 0;

      html += relSecao('📊 Resumo de Horas-Homem',
        '<div class="rel-kpi-grid">' +
          '<div class="rel-kpi"><div class="rel-kpi-num">' + hhDisp + 'h</div><div class="rel-kpi-lbl">Disponível</div></div>' +
          '<div class="rel-kpi info"><div class="rel-kpi-num">' + hhProg + 'h</div><div class="rel-kpi-lbl">Programado</div></div>' +
          '<div class="rel-kpi success"><div class="rel-kpi-num">' + hhReal + 'h</div><div class="rel-kpi-lbl">Realizado</div></div>' +
          '<div class="rel-kpi ' + (pct >= 80 ? 'success' : pct >= 60 ? 'warning' : 'danger') + '"><div class="rel-kpi-num">' + pct + '%</div><div class="rel-kpi-lbl">Taxa execução</div></div>' +
        '</div>' +
        '<div class="card" style="margin-top:0;">' +
          '<div style="margin-bottom:8px;"><span style="font-size:.75rem;color:var(--gray-500);">HH Programado (' + pctProg + '% do disponível)</span>' +
          '<div class="rel-hh-bar"><div class="rel-hh-prog" style="width:' + pctProg + '%;background:var(--primary);opacity:.5;"></div></div></div>' +
          '<div><span style="font-size:.75rem;color:var(--gray-500);">HH Realizado (' + pctReal + '% do disponível)</span>' +
          '<div class="rel-hh-bar"><div class="rel-hh-prog" style="width:' + pctReal + '%;background:var(--success);"></div></div></div>' +
        '</div>'
      );
    }

    // ── Executadas ──
    if (secAtiva('sec-executadas') && (d.executadasProgramadas||[]).length) {
      html += relSecao('✅ Atividades Executadas', tabelaAtividades(d.executadasProgramadas, false), (d.executadasProgramadas||[]).length);
    }

    // ── Não realizadas ──
    if (secAtiva('sec-nao-realizadas') && (d.naoRealizadas||[]).length) {
      html += relSecao('❌ Não Realizadas', tabelaAtividades(d.naoRealizadas, true), (d.naoRealizadas||[]).length);
    }

    // ── Fora de programação ──
    if (secAtiva('sec-fora-prog') && (d.foraProgramacao||[]).length) {
      html += relSecao('🔧 Fora de Programação', tabelaAtividades(d.foraProgramacao, false), (d.foraProgramacao||[]).length);
    }

    // ── Ver e Agir ──
    if (secAtiva('sec-ver-agir') && (d.verEAgir||[]).length) {
      html += relSecao('👁 Ver e Agir', tabelaAtividades(d.verEAgir, false), (d.verEAgir||[]).length);
    }

    // ── Análise de motivos ──
    if (secAtiva('sec-motivos') && (d.analiseMOtivos||[]).length) {
      const max = d.analiseMOtivos[0].quantidade;
      html += relSecao('📈 Análise de Motivos de Não Execução',
        d.analiseMOtivos.map(m =>
          '<div class="rel-motivo-bar">' +
            '<div style="min-width:200px;">' +
              '<div style="font-size:.8rem;font-weight:600;">' + m.descricao + '</div>' +
              '<div style="font-size:.68rem;color:var(--gray-400);">' + m.categoria + '</div>' +
            '</div>' +
            '<div style="flex:1;">' +
              '<div class="rel-hh-bar" style="height:10px;">' +
                '<div class="rel-motivo-fill" style="width:' + Math.round(m.quantidade/max*100) + '%;"></div>' +
              '</div>' +
            '</div>' +
            '<div class="rel-motivo-num">' + m.quantidade + 'x · ' + parseFloat(m.hh_impacto||0).toFixed(1) + 'h</div>' +
          '</div>'
        ).join('')
      );
    }

    // ── Planos de Ação ──
    if (secAtiva('sec-planos') && dadosPlanos) {
      const { planos, atividades } = dadosPlanos;
      const statusOrder = ['Em andamento','Aguardando aprovação','Aberto','Concluído','Cancelado'];
      const planosSorted = [...planos].sort((a,b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));

      html += relSecao('🗂 Planos de Ação',
        '<div class="rel-kpi-grid" style="margin-bottom:1rem;">' +
          '<div class="rel-kpi"><div class="rel-kpi-num">' + planos.length + '</div><div class="rel-kpi-lbl">Total</div></div>' +
          '<div class="rel-kpi info"><div class="rel-kpi-num">' + planos.filter(p=>p.status==='Em andamento').length + '</div><div class="rel-kpi-lbl">Em andamento</div></div>' +
          '<div class="rel-kpi warning"><div class="rel-kpi-num">' + planos.filter(p=>p.status==='Aguardando aprovação').length + '</div><div class="rel-kpi-lbl">Ag. aprovação</div></div>' +
          '<div class="rel-kpi success"><div class="rel-kpi-num">' + planos.filter(p=>p.status==='Concluído').length + '</div><div class="rel-kpi-lbl">Concluídos</div></div>' +
        '</div>' +
        planosSorted.map(p => {
          const ats  = atividades.filter(a => String(a.plano_id) === String(p.id));
          const pct  = ats.length ? Math.round(ats.reduce((s,a)=>s+(parseInt(a.pct_concluida)||0),0)/ats.length) : 0;
          const dias = p.prazo ? Math.ceil((new Date(p.prazo) - new Date())/86400000) : null;
          const prazoLabel = !dias && dias !== 0 ? '' : dias < 0 ? '🔴 ' + Math.abs(dias) + 'd atraso' : dias <= 3 ? '🟡 ' + dias + 'd' : '🟢 ' + dias + 'd';
          const borderColor = p.status==='Concluído'?'var(--success)':p.status==='Cancelado'?'var(--gray-300)':p.status==='Aguardando aprovação'?'var(--warning)':'var(--primary)';
          return '<div class="rel-plano-card" style="border-left-color:' + borderColor + ';">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">' +
              '<div>' +
                '<div style="font-size:.62rem;font-family:monospace;color:var(--gray-400);margin-bottom:2px;">' + p.id + '</div>' +
                '<div class="rel-plano-titulo">' + (p.titulo||'—') + '</div>' +
              '</div>' +
              '<div style="display:flex;gap:6px;flex-shrink:0;">' +
                '<span class="badge ' + (p.status==='Concluído'?'badge-success':p.status==='Em andamento'?'badge-primary':p.status==='Aguardando aprovação'?'badge-warning':'badge-gray') + '">' + p.status + '</span>' +
                (prazoLabel ? '<span class="badge ' + (dias<0?'badge-danger':dias<=3?'badge-warning':'badge-success') + '">' + prazoLabel + '</span>' : '') +
              '</div>' +
            '</div>' +
            '<div class="rel-plano-meta" style="margin-top:6px;">' +
              '<span>📂 ' + (p.origem||'—') + '</span>' +
              '<span>🏭 ' + (p.setor||'—') + '</span>' +
              '<span>📅 Prazo: ' + Utils.fmtDate(p.prazo) + '</span>' +
              '<span>📋 ' + ats.length + ' atividade' + (ats.length!==1?'s':'') + '</span>' +
            '</div>' +
            '<div style="margin-top:8px;">' +
              '<div style="display:flex;justify-content:space-between;font-size:.7rem;color:var(--gray-400);margin-bottom:3px;"><span>Progresso</span><span class="rel-plano-pct">' + pct + '%</span></div>' +
              '<div style="height:6px;background:var(--gray-100);border-radius:99px;overflow:hidden;"><div style="height:100%;width:' + pct + '%;background:' + (pct>=100?'var(--success)':'var(--primary)') + ';border-radius:99px;"></div></div>' +
            '</div>' +
          '</div>';
        }).join('')
      , planos.length);
    }

    html += '</div>'; // rel-print-area
    container.innerHTML = html;
  }

  // ── Helpers de renderização ──
  function relSecao(titulo, conteudo, count) {
    return '<div class="rel-section card">' +
      '<div class="rel-section-header">' +
        '<h2>' + titulo + '</h2>' +
        (count !== undefined ? '<span class="rel-badge">' + count + '</span>' : '') +
      '</div>' +
      conteudo +
    '</div>';
  }

  function kpiHero(val, label, color) {
    return '<div class="rel-hero-kpi">' +
      '<div class="rel-hero-kpi-num" style="color:' + color + ';">' + val + '</div>' +
      '<div class="rel-hero-kpi-lbl">' + label + '</div>' +
    '</div>';
  }

  function tabelaAtividades(lista, comMotivo) {
    if (!lista || !lista.length) return '<p class="text-muted text-sm">Nenhuma atividade.</p>';
    return '<table class="rel-table">' +
      '<thead><tr>' +
        '<th>Equipamento</th>' +
        '<th>Atividade</th>' +
        '<th>Técnico</th>' +
        '<th>Data</th>' +
        '<th>HH</th>' +
        (comMotivo ? '<th>Motivo</th>' : '<th>Status</th>') +
      '</tr></thead>' +
      '<tbody>' +
      lista.map(a =>
        '<tr>' +
          '<td><strong>' + (a.equipamento_nome||'—') + '</strong><br><span style="font-size:.68rem;color:var(--gray-400);">' + (a.equip_tag||'') + '</span></td>' +
          '<td>' + (a.descricao||'—') + (a.obs ? '<div class="rel-at-obs">' + a.obs + '</div>' : '') + '</td>' +
          '<td>' + (a.tecnico_nome||'—') + '</td>' +
          '<td style="white-space:nowrap;">' + Utils.fmtDate(a.data_programada) + '</td>' +
          '<td style="white-space:nowrap;">' + Utils.fmtHH(a.hh_real||a.hh_estimado) + '</td>' +
          (comMotivo
            ? '<td><span class="rel-at-motivo">⚠ ' + (a.motivo_desc||'Sem motivo') + '</span><br><span style="font-size:.68rem;color:var(--gray-400);">' + (a.motivo_categoria||'') + '</span></td>'
            : '<td>' + Utils.statusBadge(a.status) + '</td>') +
        '</tr>'
      ).join('') +
      '</tbody></table>';
  }

  // ══════════════════════════════════════════
  // PDF — IMPRESSÃO DO BROWSER
  // ══════════════════════════════════════════
  async function gerarPDF() {
    if (!dadosRelatorio) { Utils.toast('Gere o relatório primeiro', 'error'); return; }

    const btn = Utils.el('btn-pdf');
    btn.disabled = true;
    btn.textContent = 'Abrindo...';

    const printContent = Utils.el('rel-print-area')?.innerHTML || '';

    const printWin = window.open('', '_blank', 'width=900,height=700');
    printWin.document.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">' +
      '<title>Relatório SGMA</title><style>' +
      'body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:20px;margin:0;}' +
      'h2{font-size:14px;border-bottom:2px solid #1d4ed8;padding-bottom:4px;margin-top:16px;margin-bottom:10px;}' +
      '.rel-hero{background:#1e293b;color:#fff;padding:16px;border-radius:8px;margin-bottom:16px;}' +
      '.rel-hero-title{font-size:18px;font-weight:bold;margin-bottom:4px;}' +
      '.rel-hero-sub{font-size:11px;color:#94a3b8;margin-bottom:12px;}' +
      '.rel-hero-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;}' +
      '.rel-hero-kpi{background:rgba(255,255,255,.1);padding:8px;border-radius:6px;text-align:center;}' +
      '.rel-hero-kpi-num{font-size:20px;font-weight:bold;}' +
      '.rel-hero-kpi-lbl{font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;}' +
      '.card{border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:12px;}' +
      '.rel-section-header{display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #1d4ed8;}' +
      '.rel-section-header h2{font-size:13px;margin:0;border:none;padding:0;}' +
      '.rel-badge{background:#1d4ed8;color:#fff;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:bold;}' +
      '.rel-kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px;}' +
      '.rel-kpi{border:1px solid #e2e8f0;border-radius:6px;padding:8px;text-align:center;border-top:3px solid #1d4ed8;}' +
      '.rel-kpi-num{font-size:18px;font-weight:bold;}' +
      '.rel-kpi-lbl{font-size:9px;color:#64748b;text-transform:uppercase;}' +
      '.rel-kpi.success{border-top-color:#059669;}.rel-kpi.success .rel-kpi-num{color:#059669;}' +
      '.rel-kpi.danger{border-top-color:#dc2626;}.rel-kpi.danger .rel-kpi-num{color:#dc2626;}' +
      '.rel-kpi.warning{border-top-color:#d97706;}.rel-kpi.warning .rel-kpi-num{color:#d97706;}' +
      '.rel-kpi.info{border-top-color:#0284c7;}.rel-kpi.info .rel-kpi-num{color:#0284c7;}' +
      '.rel-table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px;}' +
      '.rel-table th{background:#1e293b;color:#fff;padding:6px 10px;text-align:left;font-size:9px;text-transform:uppercase;}' +
      '.rel-table td{padding:6px 10px;border-bottom:1px solid #f1f5f9;vertical-align:top;}' +
      '.rel-hh-bar{height:10px;background:#f1f5f9;border-radius:99px;overflow:hidden;margin:4px 0;}' +
      '.rel-hh-prog{height:100%;border-radius:99px;}' +
      '.rel-motivo-bar{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f1f5f9;}' +
      '.rel-motivo-fill{height:8px;border-radius:99px;background:#dc2626;}' +
      '.rel-motivo-num{font-size:10px;font-weight:bold;color:#dc2626;white-space:nowrap;}' +
      '.rel-at-obs{font-size:10px;background:#f8fafc;padding:4px 8px;border-left:2px solid #cbd5e1;margin-top:4px;}' +
      '.rel-at-motivo{display:inline-flex;align-items:center;gap:4px;background:#fef2f2;color:#dc2626;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:bold;}' +
      '.rel-plano-card{border:1px solid #e2e8f0;border-radius:6px;padding:8px;margin-bottom:6px;border-left:4px solid #1d4ed8;}' +
      '.rel-plano-titulo{font-weight:bold;font-size:11px;}' +
      '.rel-plano-meta{font-size:10px;color:#64748b;display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;}' +
      '.badge{display:inline-block;padding:1px 7px;border-radius:99px;font-size:9px;font-weight:bold;}' +
      '.badge-success{background:#ecfdf5;color:#059669;}' +
      '.badge-danger{background:#fef2f2;color:#dc2626;}' +
      '.badge-warning{background:#fffbeb;color:#d97706;}' +
      '.badge-primary{background:#eff6ff;color:#1d4ed8;}' +
      '.badge-gray{background:#f1f5f9;color:#475569;}' +
      '.rel-action-bar{display:none;}' +
      '@media print{body{padding:10px;}}' +
      '</style></head><body>' + printContent +
      '<script>window.onload=function(){window.print();window.onafterprint=function(){window.close();};}<\/script>' +
      '</body></html>');
    printWin.document.close();
    Utils.toast('Janela de impressão aberta — use "Salvar como PDF"', 'info');

    btn.disabled = false;
    btn.textContent = '📄 PDF';
  }

  // ══════════════════════════════════════════
  // WHATSAPP
  // ══════════════════════════════════════════
  function compartilharWhatsApp() {
    if (!dadosRelatorio) { Utils.toast('Gere o relatório primeiro', 'error'); return; }
    const d = dadosRelatorio;
    const pct = d.totalProgramadas ? Math.round((d.totalExecutadas||0) / d.totalProgramadas * 100) : 0;

    const periodo = d.semana
      ? 'Semana ' + d.semana.id + ' (' + Utils.fmtDate(d.semana.data_inicio) + ' a ' + Utils.fmtDate(d.semana.data_fim) + ')'
      : (Utils.fmtDate(d.dataInicio)||'—') + ' a ' + (Utils.fmtDate(d.dataFim)||'—');

    // Motivos (top 3)
    let motivosText = '';
    if ((d.analiseMOtivos||[]).length) {
      motivosText = '\n\n*Principais motivos:*\n' +
        d.analiseMOtivos.slice(0,3).map(function(m,i){
          return (i+1) + '. ' + m.descricao + ' (' + m.quantidade + 'x)';
        }).join('\n');
    }

    // Não realizadas (top 5)
    const naoReal = d.naoRealizadas || [];
    let naoRealText = '';
    if (naoReal.length) {
      naoRealText = '\n\n*Não realizadas (' + naoReal.length + '):*\n' +
        naoReal.slice(0,5).map(function(a){
          return '• ' + (a.equipamento_nome||'—') + ': ' + (a.descricao||'').slice(0,35) +
                 (a.motivo_desc ? ' [' + a.motivo_desc + ']' : '');
        }).join('\n') +
        (naoReal.length > 5 ? '\n  + ' + (naoReal.length-5) + ' outras' : '');
    }

    // Planos de ação
    let planosText = '';
    if (dadosPlanos && dadosPlanos.planos.length) {
      const p = dadosPlanos.planos;
      planosText = '\n\n*Planos de Ação:*\n' +
        '• Em andamento: ' + p.filter(function(x){return x.status==='Em andamento';}).length + '\n' +
        '• Ag. aprovação: ' + p.filter(function(x){return x.status==='Aguardando aprovação';}).length + '\n' +
        '• Concluídos: ' + p.filter(function(x){return x.status==='Concluído';}).length;
    }

    const linhas = [
      '🔧 *SGMA — Relatório de Manutenção*',
      '📅 ' + periodo,
      d.tecnico ? '👤 ' + d.tecnico : '',
      '',
      '⏱ *Horas-Homem*',
      '• Disponível:  ' + (d.hhDisponivel||0) + 'h',
      '• Programado:  ' + (d.hhProgramado||0) + 'h',
      '• Realizado:   ' + (d.hhRealizado||0) + 'h',
      '',
      '📊 *Taxa de execução: ' + pct + '%*',
      '✅ Executadas:     ' + ((d.executadasProgramadas||[]).length),
      '❌ Não realizadas: ' + naoReal.length,
      '🔧 Fora de prog.: ' + ((d.foraProgramacao||[]).length),
      '👁 Ver e Agir:    ' + ((d.verEAgir||[]).length),
      motivosText,
      naoRealText,
      planosText,
    ].filter(function(l){ return l !== null && l !== undefined && l !== ''; });

    const msg = linhas.join('\n');
    const msgFinal = msg.length > 3800 ? msg.slice(0,3800) + '\n...' : msg;
    window.open('https://wa.me/?text=' + encodeURIComponent(msgFinal), '_blank');
    Utils.toast('WhatsApp aberto!', 'success');
  }

  // ── Init ──
  await initFiltros();

})();

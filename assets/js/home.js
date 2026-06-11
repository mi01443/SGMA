/**
 * home.js — Dashboard de entrada (resumo pessoal do colaborador)
 */
(async () => {
  const session = Auth.requireAuth(['tecnico','supervisor','admin']);
  if (!session) return;
  Auth.initUserUI(session);
  Utils.initSidebar();

  const isSup = session.perfil === 'supervisor' || session.perfil === 'admin';

  // Mostrar links extras conforme perfil
  if (isSup) {
    Utils.el('nav-rel-link')?.style && (Utils.el('nav-rel-link').style.display = '');
  }
  if (session.perfil === 'admin') {
    Utils.el('nav-admin-link')?.style && (Utils.el('nav-admin-link').style.display = '');
  }

  // ── Saudação ──
  const hora = new Date().getHours();
  const saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  Utils.el('home-saudacao').textContent = `${saud}, ${session.nome.split(' ')[0]}! 👋`;
  Utils.el('home-data-hoje').textContent = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });

  // ── Carregar tudo em paralelo ──
  Utils.showLoading?.('Carregando seu resumo...');

  const results = await Promise.allSettled([
    API.getAtividades?.({}),                  // 0
    API.getPlanos?.(),                        // 1
    API.getAtividadesPA?.(),                  // 2
    API.getFerias?.(),                        // 3
    API.getProfissionais?.(),                 // 4
  ]);

  const [atividadesRes, planosRes, atPaRes, feriasRes, profRes] = results.map(r => r.status === 'fulfilled' ? r.value : null);

  const todasAtividades = atividadesRes?.atividades || [];
  const planos          = planosRes?.planos || [];
  const atividadesPA    = atPaRes?.atividades || [];
  const ferias          = feriasRes?.ferias || [];
  const profissionais   = profRes?.profissionais || [];

  // Treinamentos — pode falhar se módulo não configurado ainda
  let dashTreina = [];
  try {
    const prof = profissionais.find(p => String(p.id) === String(session.id));
    const r = await API.getDashboardTR?.({ profissional_id: session.id, funcao: prof?.funcao || session.funcao || '' });
    dashTreina = r?.itens || [];
  } catch(e) { /* módulo treinamentos pode não estar configurado */ }

  Utils.hideLoading?.();
  Utils.el('home-loading')?.classList.add('hidden');
  Utils.el('home-content')?.classList.remove('hidden');

  // ════════════════════════════════════════
  // 1. ATIVIDADES PENDENTES (minhas)
  // ════════════════════════════════════════
  const minhasAtividades = todasAtividades.filter(a =>
    String(a.tecnico_id) === String(session.id) &&
    a.status !== 'concluida' && a.status !== 'nao_realizada' && a.status !== 'parcial'
  );
  const atividadesUrgentes = minhasAtividades.filter(a => {
    if (!a.data_programada) return false;
    const dias = Math.ceil((new Date(a.data_programada) - new Date())/86400000);
    return dias <= 1;
  });

  // ════════════════════════════════════════
  // 2. PLANO DE AÇÃO PENDENTE (minhas atividades)
  // ════════════════════════════════════════
  const minhasAtPA = atividadesPA.filter(a =>
    String(a.responsavel_id) === String(session.id) &&
    a.status !== 'Concluída' && a.status !== 'Cancelada'
  );
  const atPaAtrasadas = minhasAtPA.filter(a => {
    if (!a.prazo) return false;
    return new Date(a.prazo) < new Date();
  });

  // ════════════════════════════════════════
  // 3. FÉRIAS — status da minha solicitação
  // ════════════════════════════════════════
  const minhasFerias    = ferias.filter(f => String(f.profissional_id) === String(session.id));
  const feriasPendentes = minhasFerias.filter(f => f.status === 'pendente');
  const feriasAprovadas = minhasFerias.filter(f => f.status === 'aprovado');
  const hoje            = new Date().toISOString().slice(0,10);
  const proximaFerias   = feriasAprovadas
    .filter(f => f.dt_inicio >= hoje)
    .sort((a,b) => a.dt_inicio.localeCompare(b.dt_inicio))[0];

  // ════════════════════════════════════════
  // 4. TREINAMENTOS — vencidos / a vencer
  // ════════════════════════════════════════
  const trVencidos = dashTreina.filter(i => i.status === 'vencido');
  const trAVencer  = dashTreina.filter(i => i.status === 'a_vencer');
  const trPendente = dashTreina.filter(i => i.status === 'pendente' && i.obrigatorio === 'true');

  // ════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════
  let html = '<div class="home-grid">';

  // ── Card: Atividades ──
  html += homeCard({
    href: 'app.html',
    color: atividadesUrgentes.length ? 'var(--danger)' : minhasAtividades.length ? 'var(--primary)' : 'var(--success)',
    icon: '🔧',
    count: minhasAtividades.length,
    title: 'Atividades Pendentes',
    sub: atividadesUrgentes.length ? `${atividadesUrgentes.length} para hoje/atrasada(s)` : 'na sua semana',
    list: minhasAtividades.slice(0,3).map(a => `${a.equipamento_nome||a.om} — ${(a.descricao||'').slice(0,30)}`),
    empty: 'Nenhuma atividade pendente ✅',
  });

  // ── Card: Plano de Ação ──
  html += homeCard({
    href: 'plano-acao.html',
    color: atPaAtrasadas.length ? 'var(--danger)' : minhasAtPA.length ? 'var(--warning)' : 'var(--success)',
    icon: '📋',
    count: minhasAtPA.length,
    title: 'Plano de Ação',
    sub: atPaAtrasadas.length ? `${atPaAtrasadas.length} atrasada(s)` : 'ações sob sua responsabilidade',
    list: minhasAtPA.slice(0,3).map(a => {
      const plano = planos.find(p => String(p.id) === String(a.plano_id));
      return `${plano?.titulo || a.plano_id}: ${(a.descricao||'').slice(0,30)}`;
    }),
    empty: 'Nenhuma ação pendente ✅',
  });

  // ── Card: Férias ──
  let feriasSub = 'sem solicitações';
  let feriasList = [];
  let feriasColor = 'var(--gray-300)';
  if (feriasPendentes.length) {
    feriasColor = 'var(--warning)';
    feriasSub = `${feriasPendentes.length} aguardando aprovação`;
    feriasList = feriasPendentes.map(f => `${Utils.fmtDate(f.dt_inicio)} → ${Utils.fmtDate(f.dt_fim)} (${f.dias_corridos}d)`);
  } else if (proximaFerias) {
    feriasColor = 'var(--success)';
    const dias = Math.ceil((new Date(proximaFerias.dt_inicio) - new Date())/86400000);
    feriasSub = `próximas em ${dias} dia${dias!==1?'s':''}`;
    feriasList = [`${Utils.fmtDate(proximaFerias.dt_inicio)} → ${Utils.fmtDate(proximaFerias.dt_fim)}`];
  }
  html += homeCard({
    href: 'equipe.html',
    color: feriasColor,
    icon: '🏖️',
    count: feriasPendentes.length || (proximaFerias ? '✓' : '—'),
    title: 'Férias',
    sub: feriasSub,
    list: feriasList,
    empty: '',
  });

  // ── Card: Treinamentos ──
  const trTotal = trVencidos.length + trAVencer.length + trPendente.length;
  html += homeCard({
    href: 'equipe.html',
    color: trVencidos.length ? 'var(--danger)' : trAVencer.length || trPendente.length ? 'var(--warning)' : 'var(--success)',
    icon: '📚',
    count: trTotal,
    title: 'Treinamentos',
    sub: trVencidos.length ? `${trVencidos.length} vencido(s)` : trAVencer.length ? `${trAVencer.length} a vencer` : 'situação regular',
    list: [
      ...trVencidos.slice(0,2).map(t => `🔴 ${t.nome} — vencido`),
      ...trAVencer.slice(0,2).map(t => `🟡 ${t.nome} — ${t.dias_diff}d restantes`),
      ...trPendente.slice(0,1).map(t => `⬜ ${t.nome} — pendente`),
    ].slice(0,3),
    empty: 'Tudo em dia ✅',
  });

  html += '</div>';

  // ── Resumo geral / ações rápidas ──
  html += `
    <div class="home-section-title">⚡ Acesso Rápido</div>
    <div class="home-grid">
      <a href="app.html" class="home-card" style="--card-color:var(--primary);">
        <div class="home-card-header"><span class="home-card-icon">🔧</span></div>
        <div class="home-card-title">Ver Atividades</div>
        <div class="home-card-sub">Dashboard e checklist da semana</div>
      </a>
      <a href="plano-acao.html" class="home-card" style="--card-color:var(--info);">
        <div class="home-card-header"><span class="home-card-icon">📋</span></div>
        <div class="home-card-title">Plano de Ação</div>
        <div class="home-card-sub">Acompanhar planos e tratativas</div>
      </a>
      <a href="equipe.html" class="home-card" style="--card-color:#059669;">
        <div class="home-card-header"><span class="home-card-icon">👥</span></div>
        <div class="home-card-title">Gestão da Equipe</div>
        <div class="home-card-sub">Férias, treinamentos e mais</div>
      </a>
      ${isSup ? `<a href="relatorio.html" class="home-card" style="--card-color:#7c3aed;">
        <div class="home-card-header"><span class="home-card-icon">📊</span></div>
        <div class="home-card-title">Relatórios</div>
        <div class="home-card-sub">Gerar relatório semanal</div>
      </a>` : ''}
    </div>`;

  Utils.el('home-content').innerHTML = html;

  // ── Helper ──
  function homeCard({ href, color, icon, count, title, sub, list, empty }) {
    const isEmpty = (count === 0 || count === '0') && empty;
    return `<a href="${href}" class="home-card" style="--card-color:${color};">
      <div class="home-card-header">
        <span class="home-card-icon">${icon}</span>
        <span class="home-card-count">${count}</span>
      </div>
      <div class="home-card-title">${title}</div>
      <div class="home-card-sub ${isEmpty?'home-card-empty':''}">${isEmpty ? empty : sub}</div>
      ${!isEmpty && list && list.length ? `<div class="home-card-list">${list.map(l=>`<div class="home-card-list-item">${l}</div>`).join('')}</div>` : ''}
    </a>`;
  }
})();

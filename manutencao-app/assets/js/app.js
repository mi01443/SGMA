/**
 * app.js — Lógica principal do app do técnico
 */

(async () => {
  const session = Auth.requireAuth(['tecnico', 'supervisor', 'admin']);
  if (!session) return;

  Auth.initUserUI(session);
  Utils.initSidebar();

  // ── Estado ──
  let atividades    = [];
  let equipamentos  = [];
  let motivos       = [];
  let currentAtiv   = null;
  let timerInterval = null;
  let timerSeconds  = 0;
  let fotosBefore   = [];
  let fotosAfter    = [];
  let activeFilter  = 'todas';
  let activeView    = 'atividades'; // atividades | historico | nova

  // ── Inicialização ──
  await loadAll();
  renderNav();

  async function loadAll() {
    Utils.showLoading('Carregando atividades...');
    try {
      const [atResp, eqResp, motResp] = await Promise.all([
        API.getAtividades({ tecnico: session.id }),
        API.getEquipamentos(),
        API.getMotivos(),
      ]);
      atividades   = atResp.atividades || [];
      equipamentos = eqResp.equipamentos || [];
      motivos      = motResp.motivos || [];
      renderAtividades();
      renderStats();
    } catch (e) {
      Utils.toast('Erro ao carregar dados: ' + e.message, 'error');
    } finally {
      Utils.hideLoading();
    }
  }

  // ── Navegação ──
  function renderNav() {
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      item.addEventListener('click', () => {
        const view = item.dataset.view;
        setView(view);
      });
    });
  }

  function setView(view) {
    activeView = view;
    document.querySelectorAll('.nav-item[data-view]').forEach(i => {
      i.classList.toggle('active', i.dataset.view === view);
    });
    document.querySelectorAll('.view-section').forEach(s => {
      s.classList.toggle('hidden', s.dataset.section !== view);
    });
    Utils.el('topbar-title').textContent = {
      atividades: 'Minhas Atividades',
      historico:  'Histórico',
      nova:       'Nova Atividade',
    }[view] || '';

    if (view === 'atividades') renderAtividades();
    if (view === 'historico')  renderHistorico();
    if (view === 'nova')       renderNovaAtividade();
  }

  // ── Stats do dia ──
  function renderStats() {
    const hoje = Utils.todayISO();
    const doDia = atividades.filter(a => a.data_programada?.slice(0,10) === hoje);
    const concluidas = doDia.filter(a => a.status === 'concluida').length;
    const pendentes  = doDia.filter(a => a.status === 'pendente').length;
    const pct = doDia.length ? Math.round(concluidas / doDia.length * 100) : 0;

    Utils.setHTML('stat-total',     doDia.length);
    Utils.setHTML('stat-concluidas', concluidas);
    Utils.setHTML('stat-pendentes',  pendentes);
    Utils.setHTML('stat-pct',        pct + '%');

    const prog = Utils.el('hh-bar-prog');
    if (prog) prog.style.width = pct + '%';
  }

  // ── Lista de atividades ──
  function renderAtividades() {
    const filtradas = atividades.filter(a => {
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

    // Agrupar por data
    const grupos = {};
    filtradas.forEach(a => {
      const key = a.data_programada?.slice(0,10) || 'sem-data';
      if (!grupos[key]) grupos[key] = [];
      grupos[key].push(a);
    });

    container.innerHTML = Object.keys(grupos).sort().reverse().map(data => {
      const label = formatDayLabel(data);
      const cards = grupos[data].map(renderAtividadeCard).join('');
      return `<div class="mb-3"><div class="text-xs fw-600" style="color:var(--gray-400);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;padding-left:2px;">${label}</div>${cards}</div>`;
    }).join('');

    container.querySelectorAll('.activity-card').forEach(card => {
      card.addEventListener('click', () => openDetail(card.dataset.id));
    });
  }

  function renderAtividadeCard(a) {
    const passos = a.passos || [];
    const concluidos = passos.filter(p => p.concluido).length;
    const progPct = passos.length ? Math.round(concluidos / passos.length * 100) : 0;
    const tipoCls = `type-${a.tipo}`;

    return `<div class="activity-card ${a.status !== 'pendente' ? 'done' : ''}" data-id="${a.id}">
      <div class="activity-type-dot ${tipoCls}"></div>
      <div class="activity-body">
        <div class="activity-equip">${a.equipamento_nome || '—'}</div>
        <div class="activity-desc">${Utils.truncate(a.descricao, 70)}</div>
        <div class="activity-meta">
          <span>👤 ${a.tecnico_nome || '—'}</span>
          <span>⏱ ${Utils.fmtHH(a.hh_estimado)}</span>
          <span>${a.equip_tag || ''}</span>
          ${Utils.tipoBadge(a.tipo)}
        </div>
        ${passos.length ? `
        <div style="margin-top:8px;">
          <div class="checklist-progress" style="margin-bottom:4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
            ${concluidos}/${passos.length} passos
          </div>
          <div class="progress"><div class="progress-bar ${a.status === 'concluida' ? 'success' : ''}" style="width:${progPct}%"></div></div>
        </div>` : ''}
      </div>
      <div class="activity-right">
        ${Utils.statusBadge(a.status)}
        ${a.prioridade === 'Alta' || a.prioridade === 'Urgente' ? `<span class="badge badge-danger" style="font-size:.65rem;">${a.prioridade}</span>` : ''}
      </div>
    </div>`;
  }

  // ── Filtros ──
  document.querySelectorAll('.filter-chip[data-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip[data-filter]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.filter;
      renderAtividades();
    });
  });

  // ── Detalhe / painel lateral ──
  function openDetail(id) {
    currentAtiv = atividades.find(a => a.id === id);
    if (!currentAtiv) return;
    fotosBefore = [];
    fotosAfter  = [];
    timerSeconds = 0;
    clearInterval(timerInterval);

    const panel = document.querySelector('.detail-panel');
    panel?.classList.add('open');
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

    // Info
    Utils.setHTML('detail-info', `
      <div class="detail-section">
        <div class="detail-section-title">Informações</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.825rem;">
          <div><span class="text-muted">Tag:</span> <strong>${a.equip_tag || '—'}</strong></div>
          <div><span class="text-muted">Área:</span> <strong>${a.area || '—'}</strong></div>
          <div><span class="text-muted">Tipo:</span> ${Utils.tipoBadge(a.tipo)}</div>
          <div><span class="text-muted">Prioridade:</span> ${Utils.prioridadeBadge(a.prioridade || 'Normal')}</div>
          <div><span class="text-muted">Data:</span> <strong>${Utils.fmtDate(a.data_programada)}</strong></div>
          <div><span class="text-muted">HH est.:</span> <strong>${Utils.fmtHH(a.hh_estimado)}</strong></div>
          <div><span class="text-muted">Técnico:</span> <strong>${a.tecnico_nome || '—'}</strong></div>
          <div><span class="text-muted">Status:</span> ${Utils.statusBadge(a.status)}</div>
        </div>
      </div>
    `);

    // Checklist
    renderChecklist();

    // Formulário de execução
    renderExecForm();
  }

  function renderChecklist() {
    const a = currentAtiv;
    const passos = a.passos || [];
    const el = Utils.el('detail-checklist');
    if (!el) return;

    if (!passos.length) { el.innerHTML = '<p class="text-muted text-sm">Sem passos cadastrados.</p>'; return; }

    el.innerHTML = `
      <div class="detail-section-title">Checklist de Execução</div>
      ${passos.map(p => `
        <div class="checklist-item">
          <input type="checkbox" class="checklist-cb" id="passo-${p.id}"
            data-passo-id="${p.id}" ${p.concluido ? 'checked' : ''}>
          <label class="checklist-text" for="passo-${p.id}">${p.descricao}</label>
          ${p.concluido && p.concluido_em ? `<span class="text-xs text-muted">${Utils.fmtDateTime(p.concluido_em)}</span>` : ''}
        </div>`).join('')}
    `;

    el.querySelectorAll('.checklist-cb').forEach(cb => {
      cb.addEventListener('change', async () => {
        const passoId = cb.dataset.passoId;
        try {
          await API.updatePasso(a.id, passoId, cb.checked);
          const passo = a.passos.find(p => p.id === passoId);
          if (passo) { passo.concluido = cb.checked; passo.concluido_em = new Date().toISOString(); }
          renderStats();
          renderAtividades();
        } catch (e) {
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
            <button class="btn btn-secondary flex-1" id="btn-status-ok" data-status="concluida">
              ✅ Concluída
            </button>
            <button class="btn btn-secondary flex-1" id="btn-status-nok" data-status="nao_realizada">
              ❌ Não realizada
            </button>
          </div>
        </div>

        <!-- Motivo (só aparece se não realizada) -->
        <div class="form-group hidden" id="motivo-group">
          <label class="form-label">Motivo <span>*</span></label>
          <select class="form-control" id="exec-motivo">
            <option value="">Selecione o motivo...</option>
            ${motOpts}
          </select>
        </div>

        <!-- Observação -->
        <div class="form-group">
          <label class="form-label">Observações</label>
          <textarea class="form-control" id="exec-obs" rows="3" placeholder="Descreva o que foi realizado, anomalias encontradas..."></textarea>
        </div>

        <!-- Fotos antes -->
        <div class="form-group">
          <label class="form-label">📷 Foto — Antes</label>
          <div class="photo-upload-area" id="upload-before" onclick="document.getElementById('file-before').click()">
            <input type="file" id="file-before" accept="image/*" multiple>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:6px;color:var(--gray-400)"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <p class="text-sm text-muted">Toque para adicionar foto do estado anterior</p>
          </div>
          <div class="photo-grid" id="photos-before-grid"></div>
        </div>

        <!-- Fotos depois -->
        <div class="form-group">
          <label class="form-label">📷 Foto — Depois</label>
          <div class="photo-upload-area" id="upload-after" onclick="document.getElementById('file-after').click()">
            <input type="file" id="file-after" accept="image/*" multiple>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:6px;color:var(--gray-400)"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <p class="text-sm text-muted">Toque para adicionar foto do estado final</p>
          </div>
          <div class="photo-grid" id="photos-after-grid"></div>
        </div>
      </div>
    `;

    // Timer
    Utils.el('btn-timer-start')?.addEventListener('click', startTimer);
    Utils.el('btn-timer-stop')?.addEventListener('click', stopTimer);

    // Status buttons
    let selectedStatus = currentAtiv.status !== 'pendente' ? currentAtiv.status : null;

    function updateStatusButtons() {
      ['ok','nok'].forEach(s => {
        const btn = Utils.el(`btn-status-${s}`);
        btn?.classList.remove('btn-success','btn-danger','btn-secondary');
        if (s === 'ok') btn?.classList.add(selectedStatus === 'concluida' ? 'btn-success' : 'btn-secondary');
        else btn?.classList.add(selectedStatus === 'nao_realizada' ? 'btn-danger' : 'btn-secondary');
      });
      const motivoGrp = Utils.el('motivo-group');
      if (selectedStatus === 'nao_realizada') motivoGrp?.classList.remove('hidden');
      else motivoGrp?.classList.add('hidden');
    }

    Utils.el('btn-status-ok')?.addEventListener('click', () => { selectedStatus = 'concluida'; updateStatusButtons(); });
    Utils.el('btn-status-nok')?.addEventListener('click', () => { selectedStatus = 'nao_realizada'; updateStatusButtons(); });
    updateStatusButtons();

    // Fotos
    setupPhotoUpload('file-before', 'photos-before-grid', fotosBefore);
    setupPhotoUpload('file-after',  'photos-after-grid',  fotosAfter);

    // Submit via footer button
    const btnSave = Utils.el('btn-save-exec');
    if (btnSave) {
      btnSave.onclick = async () => {
        if (!selectedStatus) { Utils.toast('Selecione o status da execução', 'error'); return; }
        if (selectedStatus === 'nao_realizada' && !Utils.el('exec-motivo').value) {
          Utils.toast('Selecione o motivo da não execução', 'error'); return;
        }

        btnSave.disabled = true;
        btnSave.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span> Salvando...';
        stopTimer();

        try {
          // Upload de fotos
          Utils.showLoading('Enviando fotos...');
          const linksAntes  = await uploadFotos(fotosBefore, 'antes');
          const linksDepois = await uploadFotos(fotosAfter, 'depois');

          Utils.showLoading('Salvando execução...');
          await API.saveExecucao({
            atividadeId: currentAtiv.id,
            tecnicoId:   session.id,
            status:      selectedStatus,
            motivoId:    Utils.el('exec-motivo')?.value || null,
            obs:         Utils.el('exec-obs')?.value || '',
            hhReal:      +(timerSeconds / 3600).toFixed(2),
            fotosAntes:  linksAntes,
            fotosDepois: linksDepois,
          });

          const idx = atividades.findIndex(a => a.id === currentAtiv.id);
          if (idx >= 0) atividades[idx].status = selectedStatus;

          Utils.toast('Execução registrada com sucesso!', 'success');
          closeDetailPanel();
          renderAtividades();
          renderStats();
        } catch (e) {
          Utils.toast('Erro ao salvar: ' + e.message, 'error');
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
  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  // ── Fotos ──
  function setupPhotoUpload(inputId, gridId, store) {
    const input = Utils.el(inputId);
    const grid  = Utils.el(gridId);
    if (!input || !grid) return;

    input.addEventListener('change', async () => {
      const files = Array.from(input.files).slice(0, 4 - store.length);
      for (const file of files) {
        if (store.length >= 4) { Utils.toast('Máximo de 4 fotos por lado', 'error'); break; }
        const base64 = await Utils.fileToBase64(file);
        store.push({ base64, mimeType: file.type, name: file.name });
        const url = URL.createObjectURL(file);
        addThumb(grid, url, store, store.length - 1);
      }
      input.value = '';
    });
  }

  function addThumb(grid, src, store, idx) {
    const wrap = document.createElement('div');
    wrap.className = 'photo-thumb-wrap';
    wrap.innerHTML = `<img src="${src}" class="photo-thumb"><button class="remove-photo" data-idx="${idx}">✕</button>`;
    wrap.querySelector('.remove-photo').addEventListener('click', (e) => {
      e.stopPropagation();
      store.splice(idx, 1);
      wrap.remove();
    });
    grid.appendChild(wrap);
  }

  async function uploadFotos(fotos, lado) {
    const links = [];
    for (const f of fotos) {
      try {
        const res = await API.uploadFoto(f.base64, f.mimeType, currentAtiv.equipamento_id, currentAtiv.id, lado);
        links.push(res.url);
      } catch { links.push(null); }
    }
    return links.filter(Boolean);
  }

  // ── Nova atividade ──
  function renderNovaAtividade() {
    const form = Utils.el('nova-form');
    if (!form) return;

    const eqOpts = equipamentos.map(e => `<option value="${e.id}">${e.nome} (${e.tag})</option>`).join('');
    const tecOpts = `<option value="${session.id}">${session.nome}</option>`;

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
            <select class="form-control" id="nova-prio">
              <option>Normal</option><option>Alta</option><option>Urgente</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Equipamento <span>*</span></label>
          <select class="form-control" id="nova-eq"><option value="">Selecione...</option>${eqOpts}</select>
        </div>

        <div class="form-group">
          <label class="form-label">Descrição da atividade <span>*</span></label>
          <textarea class="form-control" id="nova-desc" rows="3" placeholder="Descreva o que precisa ser feito..."></textarea>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Data <span>*</span></label>
            <input type="date" class="form-control" id="nova-data" value="${Utils.todayISO()}">
          </div>
          <div class="form-group">
            <label class="form-label">HH estimado</label>
            <input type="number" class="form-control" id="nova-hh" min="0.25" step="0.25" value="1" placeholder="1.5">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Passos (opcional)</label>
          <ul class="passos-list" id="nova-passos"></ul>
          <button class="btn btn-ghost btn-sm mt-2" type="button" id="btn-add-passo">+ Adicionar passo</button>
        </div>

        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:.5rem;">
          <button class="btn btn-secondary" type="button" onclick="setView('atividades')">Cancelar</button>
          <button class="btn btn-primary" id="btn-nova-save">Criar atividade</button>
        </div>
      </div>
    `;

    let passoCnt = 0;
    Utils.el('btn-add-passo')?.addEventListener('click', () => {
      passoCnt++;
      const li = document.createElement('li');
      li.className = 'passo-item';
      li.innerHTML = `
        <span class="passo-num">${passoCnt}</span>
        <input class="passo-input" type="text" placeholder="Descrição do passo...">
        <button class="passo-remove" type="button">✕</button>`;
      li.querySelector('.passo-remove').addEventListener('click', () => li.remove());
      Utils.el('nova-passos').appendChild(li);
    });

    Utils.el('btn-nova-save')?.addEventListener('click', async () => {
      const eqId  = Utils.el('nova-eq').value;
      const desc  = Utils.el('nova-desc').value.trim();
      const data  = Utils.el('nova-data').value;
      if (!eqId || !desc || !data) { Utils.toast('Preencha os campos obrigatórios', 'error'); return; }

      const passos = [...document.querySelectorAll('.passo-input')]
        .map(i => i.value.trim()).filter(Boolean);

      const btn = Utils.el('btn-nova-save');
      btn.disabled = true;
      Utils.showLoading('Criando atividade...');
      try {
        await API.saveAtividade({
          tipo:           Utils.el('nova-tipo').value,
          equipamentoId:  eqId,
          descricao:      desc,
          tecnicoId:      session.id,
          prioridade:     Utils.el('nova-prio').value,
          dataProgramada: data,
          hhEstimado:     parseFloat(Utils.el('nova-hh').value) || 1,
          passos,
          semanaId:       '', // o Apps Script resolve
        });
        Utils.toast('Atividade criada!', 'success');
        await loadAll();
        setView('atividades');
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
      const res = await API.getExecucoes({ tecnico: session.id });
      const execs = res.execucoes || [];
      if (!execs.length) {
        container.innerHTML = '<div class="empty-state"><p>Nenhuma execução registrada ainda.</p></div>';
        return;
      }
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
            ${ex.obs ? `<div class="text-sm text-muted mt-2">${ex.obs}</div>` : ''}
          </div>
          <div class="activity-right">${Utils.statusBadge(ex.status)}</div>
        </div>`).join('');
    } catch (e) {
      container.innerHTML = `<div class="alert alert-danger">Erro ao carregar histórico: ${e.message}</div>`;
    }
  }

  // ── Helpers ──
  function formatDayLabel(isoDate) {
    const today = Utils.todayISO();
    if (isoDate === today) return 'Hoje';
    const d = new Date(isoDate + 'T00:00:00');
    const diff = Math.floor((new Date(today) - d) / 86400000);
    if (diff === 1) return 'Ontem';
    const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    return `${dias[d.getDay()]}, ${Utils.fmtDate(isoDate)}`;
  }

  // ── Init view ──
  setView('atividades');

})();

(() => {
  'use strict';

  const ROADMAP_TODAY = new Date();
  const EXEC_MONTHS = Array.from({ length: 49 }, (_, index) => {
    const date = new Date(ROADMAP_TODAY.getFullYear(), ROADMAP_TODAY.getMonth() - 24 + index, 1);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'][date.getMonth()],
      year: String(date.getFullYear()).slice(-2)
    };
  });
  const PROJECT_MONTHS = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(2026, 5 + index, 1);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'][date.getMonth()],
      year: String(date.getFullYear()).slice(-2)
    };
  });
  const MONTH_ORDER = { Jan:0, Fev:1, Mar:2, Abr:3, Mai:4, Jun:5, Jul:6, Ago:7, Set:8, Out:9, Nov:10, Dez:11 };
  const STATUS_COLORS = ['#530b03', '#bfbfbf', '#ffc000', '#df3232', '#ed7d31', '#7f7f7f'];
  const state = {
    projects: [],
    selectedId: null,
    scheduleMode: 'macro',
    loadMode: '',
    failedFiles: 0,
    updatedAt: null,
    refreshing: false
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const clean = value => String(value ?? '').trim();
  const n = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const idNumber = value => { const match = String(value ?? '').match(/(\d+)(?:\.(\d+))?/); return match ? Number(match[1]) + (match[2] ? Number(match[2]) / 1000 : 0) : 0; };
  const pct = (part, total) => total ? Math.round(part * 100 / total) : 0;
  const compact = (value, max = 160) => {
    const text = clean(value).replace(/\s+/g, ' ');
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  };
  const arrayOf = value => Array.isArray(value) ? value : (value == null ? [] : [value]);
  const first = (object, keys, fallback = '') => {
    for (const key of keys) {
      const value = object?.[key];
      if (value !== undefined && value !== null && clean(value)) return value;
    }
    return fallback;
  };

  function formatDate(iso) {
    const match = clean(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : 'Não informado';
  }

  function shortDate(iso) {
    const match = clean(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return 'S/D';
    return `${match[3]} ${['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'][Number(match[2]) - 1]}`;
  }

  function monthYear(iso) {
    const match = clean(iso).match(/^(\d{4})-(\d{2})/);
    if (!match) return 'não informado';
    return `${['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'][Number(match[2]) - 1]}/${match[1].slice(-2)}`;
  }

  function moneyMM(value) {
    const amount = n(value);
    const absolute = Math.abs(amount);
    const formatted = absolute.toLocaleString('pt-BR', {
      minimumFractionDigits: absolute < 10 ? 2 : 1,
      maximumFractionDigits: 2
    });
    return `${amount < 0 ? '- ' : ''}R$ ${formatted}M`;
  }

  function savingField(project, field) {
    const saving = project?.saving;
    if (saving && typeof saving === 'object') return n(saving[field]);
    const aliases = {
      opex12M: ['savingOpex12M','savingOpex','saving_opex_12m'],
      capex12M: ['savingCapex12M','savingCapex','saving_capex_12m'],
      total12M: ['savingTotal12M','savingTotal','saving_total','saving12m'],
      total2026: ['saving2026','savingTotal2026','saving_total_2026']
    };
    return n(first(project, aliases[field] || []));
  }

  function savingLabel(project) {
    const amount = savingField(project, 'total12M');
    if (amount || clean(project.ganhoProjeto).toLocaleLowerCase('pt-BR') === 'quantitativo') return moneyMM(amount);
    return clean(project.ganhoProjeto) || 'Não informado';
  }

  function situationOf(project) {
    return clean(first(project, ['situacao','situação','andamento','health','saude'])) || 'Não informado';
  }

  function normalizedSituation(project) {
    return situationOf(project).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  }

  function isDone(project) {
    return /concluido|concluida|finalizado|finalizada/.test(normalizedSituation(project));
  }

  function isInactive(project) {
    return isDone(project) || /cancelado|cancelada|duplicado|duplicada/.test(normalizedSituation(project));
  }

  function isRisk(project) {
    const situation = normalizedSituation(project);
    const risk = clean(project.risco).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
    return /em risco|critico|critica/.test(situation) || /alto|critico|critica/.test(risk);
  }

  function countsBy(list, getter) {
    return list.reduce((counts, item) => {
      const key = clean(getter(item)) || 'Não informado';
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
  }

  function topKey(counts) {
    return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))[0]?.[0] || 'Não informado';
  }

  function flattenProjects(values) {
    return values.flatMap(value => Array.isArray(value) ? value : [value]).filter(Boolean);
  }

  function loadFallbackScript(force = false) {
    if (!force && Array.isArray(window.PORTFOLIO_DATA) && window.PORTFOLIO_DATA.length) {
      return Promise.resolve(window.PORTFOLIO_DATA);
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `json/projects.data.js${force ? `?v=${Date.now()}` : ''}`;
      script.onload = () => resolve(Array.isArray(window.PORTFOLIO_DATA) ? window.PORTFOLIO_DATA : []);
      script.onerror = () => reject(new Error('Não foi possível carregar json/projects.data.js.'));
      document.head.appendChild(script);
    });
  }

  async function loadProjectIndex() {
    if (location.protocol === 'file:') return;
    try {
      const response = await fetch(`json/projects.index.json?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`projects.index.json: HTTP ${response.status}`);
      const index = await response.json();
      const files = Array.isArray(index) ? index : index?.arquivos;
      if (Array.isArray(files) && files.length) window.PORTFOLIO_JSON_FILES = files.map(clean).filter(Boolean);
    } catch (error) {
      console.warn('Lista de projetos não relida; usando a lista já carregada.', error);
    }
  }

  async function loadProjects({ force = false } = {}) {
    if (force) await loadProjectIndex();
    const files = Array.isArray(window.PORTFOLIO_JSON_FILES) ? window.PORTFOLIO_JSON_FILES : [];
    state.failedFiles = 0;

    if (location.protocol !== 'file:' && files.length) {
      const suffix = force ? `?v=${Date.now()}` : '';
      const results = await Promise.allSettled(files.map(file =>
        fetch(`json/${encodeURIComponent(file)}${suffix}`, { cache: 'no-store' }).then(response => {
          if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
          return response.json();
        })
      ));
      const loaded = flattenProjects(results.filter(result => result.status === 'fulfilled').map(result => result.value));
      state.failedFiles = results.length - results.filter(result => result.status === 'fulfilled').length;
      if (loaded.length) {
        state.loadMode = 'JSON';
        try { window.PORTFOLIO_DATA = loaded; } catch (_) { /* integração opcional com scripts do HTML */ }
        return loaded;
      }
    }

    state.loadMode = 'contingência local';
    return flattenProjects(await loadFallbackScript(force));
  }

  function projectPolicy(project) {
    return typeof window.isDashboardProjectAllowed === 'function'
      ? window.isDashboardProjectAllowed(project)
      : true;
  }

  function normalizeGerencia(value) {
    const key = clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return /^(analytics|des\.? sistemico|desenvolvimento sistemico|int\.? logistica)$/.test(key) ? 'Int. Logística' : value;
  }

  function prepareProjects(projects) {
    return flattenProjects(projects)
      .map(project => project && typeof project === 'object' ? { ...project, area: normalizeGerencia(project.area) } : project)
      .filter(project => project && /^LOG-\d+(?:\.\d+)?$/i.test(clean(project.id)) && projectPolicy(project))
      .sort((a, b) => idNumber(a.id) - idNumber(b.id));
  }

  function syncPortfolioStatusOptions() {
    const select = $('#portfolioStatusFilter');
    if (!select) return;
    const selected = select.value;
    const situations = [...new Set(filteredProjects().map(situationOf))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    select.innerHTML = '<option value="">Todos os status</option>' + situations.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
    if (situations.includes(selected)) select.value = selected;
  }

  function syncAdditionalFilterOptions() {
    const definitions = [
      { selector: '#filterIniciativa', emptyLabel: 'Todas', getter: project => clean(first(project, ['iniciativa','forum','fórum'])) },
      { selector: '#filterPontoFocal', emptyLabel: 'Todos', getter: project => clean(first(project, ['pontoFocal','ponto_focal','ponto focal'])) }
    ];
    definitions.forEach(({ selector, emptyLabel, getter }) => {
      const select = $(selector);
      if (!select) return;
      const selected = select.value;
      const values = [...new Set(state.projects.map(getter).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      select.innerHTML = `<option value="">${emptyLabel}</option>` + values.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
      if (values.includes(selected)) select.value = selected;
    });
  }
  function currentFilters() {
    return {
      ano: $('#filterAno')?.value || '',
      gerencia: $('#filterGerencia')?.value || '',
      status: $('#filterStatus')?.value || '',
      ganho: $('#filterGanho')?.value || '',
      tipo: $('#filterTipo')?.value || '',
      iniciativa: $('#filterIniciativa')?.value || '',
      pontoFocal: $('#filterPontoFocal')?.value || ''
    };
  }

  const projectInYear = (project, year) => {
    if (!year) return true;
    const y = Number(year);
    const start = Number(String(project.inicio || '').slice(0, 4)) || 0;
    const end = Number(String(project.termino || '').slice(0, 4)) || start;
    if (!start && !end) return false;
    return (start || end) <= y && y <= (end || start);
  };
  window.projectInYear = projectInYear;

  function filteredProjects() {
    const filters = currentFilters();
    return state.projects.filter(project =>
      projectInYear(project, filters.ano) &&
      (!filters.gerencia || clean(project.area) === filters.gerencia) &&
      (!filters.status || clean(project.status) === filters.status) &&
      (!filters.ganho || clean(project.ganhoProjeto) === filters.ganho) &&
      (!filters.tipo || arrayOf(project.tipos).map(clean).includes(filters.tipo)) &&
      (!filters.iniciativa || clean(first(project, ['iniciativa','forum','fórum'])) === filters.iniciativa) &&
      (!filters.pontoFocal || clean(first(project, ['pontoFocal','ponto_focal','ponto focal'])) === filters.pontoFocal)
    );
  }

  function renderHero(projects) {
    const topArea = topKey(countsBy(state.projects, project => project.area));
    const updateDate = state.updatedAt || new Date();
    const dateLabel = new Intl.DateTimeFormat('pt-BR').format(updateDate);
    const timeLabel = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(updateDate);
    const meta = $('.hero-meta');
    if (meta) meta.innerHTML = `<div><b>2026–2027</b>Período do roadmap</div><div><b>${esc(dateLabel)}</b>Última atualização</div><div><b>${esc(topArea)}</b>Gerência predominante</div>`;
    const notice = $('.notice');
    if (notice) notice.innerHTML = `<b>Dados integrados:</b> ${state.projects.length} projeto(s) carregado(s); ${projects.length} no recorte atual.`;
    const updated = $('.updated');
    if (updated) updated.textContent = `${state.projects.length} projeto(s) • ${state.loadMode}${state.failedFiles ? ` • ${state.failedFiles} falha(s)` : ''} • ${dateLabel} ${timeLabel}`;
    const sideFoot = $('.side-foot');
    if (sideFoot) sideFoot.innerHTML = `Dashboard integrado<br>${state.projects.length} projeto(s) disponível(is).`;
  }

  function renderKpis(projects) {
    const grid = $('.kpi-grid');
    if (!grid) return;
    const active = projects.filter(project => !isInactive(project));
    const risk = active.filter(isRisk);
    const done = projects.filter(isDone);
    const saving = projects.reduce((sum, project) => sum + savingField(project, 'total12M'), 0);
    const savingOpex = projects.reduce((sum, project) => sum + savingField(project, 'opex12M'), 0);
    const savingCapex = projects.reduce((sum, project) => sum + savingField(project, 'capex12M'), 0);
    grid.innerHTML = `
      <article class="card kpi" style="--accent:#3569e8"><div class="kpi-label">Projetos ativos</div><div class="kpi-value">${active.length}</div><div class="kpi-foot">${projects.length} projeto(s) no recorte</div></article>
      <article class="card kpi" style="--accent:#da291c"><div class="kpi-label">Em risco</div><div class="kpi-value">${risk.length}</div><div class="kpi-foot"><span class="danger">${pct(risk.length, active.length)}%</span> da carteira ativa</div></article>
      <article class="card kpi" style="--accent:#17875b"><div class="kpi-label">Concluídos</div><div class="kpi-value">${done.length}</div><div class="kpi-foot"><span class="positive">${pct(done.length, projects.length)}%</span> da carteira</div></article>
      <article class="card kpi" style="--accent:#f39c12"><div class="kpi-label">Saving potencial</div><div class="kpi-value">${moneyMM(saving)}</div><div class="kpi-foot">Opex ${moneyMM(savingOpex)} · Capex ${moneyMM(savingCapex)}</div></article>`;
  }

  function renderHealth(projects) {
    const active = projects.filter(project => !isInactive(project));
    const situationCounts = countsBy(active, situationOf);
    const preferredOrder = ['Em execução','Planejado','Atenção','Em risco'];
    const situations = [
      ...preferredOrder.filter(value => situationCounts[value]),
      ...Object.keys(situationCounts).filter(value => !preferredOrder.includes(value)).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    ];
    const total = active.length;
    let cursor = 0;
    const stops = [];
    situations.forEach((key, index) => {
      const start = total ? cursor * 100 / total : 0;
      cursor += situationCounts[key] || 0;
      const end = total ? cursor * 100 / total : 0;
      stops.push(`${STATUS_COLORS[index % STATUS_COLORS.length]} ${start}% ${end}%`);
    });
    const donut = $('.donut');
    if (donut) {
      donut.dataset.total = total;
      donut.classList.add('donut-v2');
      donut.style.background = 'none';
      const radius = 78;
      const circumference = 2 * Math.PI * radius;
      const gap = situations.length > 1 ? 7 : 0;
      let offset = 0;
      const arcs = situations.map((key, index) => {
        const value = situationCounts[key] || 0;
        const length = total ? value * circumference / total : 0;
        const visible = Math.max(0.01, length - gap);
        const arc = `<circle class="donut-arc" cx="100" cy="100" r="${radius}" fill="none" stroke="${STATUS_COLORS[index % STATUS_COLORS.length]}" stroke-width="20" stroke-linecap="round" stroke-dasharray="${visible.toFixed(2)} ${circumference.toFixed(2)}" stroke-dashoffset="${(-offset - gap / 2).toFixed(2)}" transform="rotate(-90 100 100)"><title>${esc(key)}: ${value}</title></circle>`;
        offset += length;
        return arc;
      }).join('');
      donut.innerHTML = `<svg viewBox="0 0 200 200" aria-hidden="true"><defs><filter id="donutShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#18212f" flood-opacity=".12"/></filter></defs><circle cx="100" cy="100" r="${radius}" fill="none" stroke="#eef1f5" stroke-width="20"/><g filter="url(#donutShadow)">${arcs}</g><circle cx="100" cy="100" r="58" fill="#fff"/><text x="100" y="99" text-anchor="middle" class="donut-total">${total}</text><text x="100" y="122" text-anchor="middle" class="donut-caption">PROJETOS ATIVOS</text></svg>`;
    }
    const legend = $('.legend');
    if (legend) legend.innerHTML = situations.map((key, index) => `<div><i style="background:${STATUS_COLORS[index % STATUS_COLORS.length]}"></i>${esc(key)} <b>${situationCounts[key]}</b><em>${pct(situationCounts[key], total)}%</em></div>`).join('') || '<div>Sem projetos ativos no recorte.</div>';

    const stageCounts = countsBy(projects, project => project.status);
    const stages = ['L0','L1','L2','L3','L4','L5'];
    const STAGE_NAMES = { L0: 'Ideia / Conceito', L1: 'Em Análise', L2: 'Planejamento', L3: 'Em Execução', L4: 'Implantação', L5: 'Concluído' };
    const max = Math.max(1, ...stages.map(stage => stageCounts[stage] || 0));
    const bars = $('.bars');
    if (bars) bars.innerHTML = stages.map(stage => {
      const value = stageCounts[stage] || 0;
      const height = value ? Math.max(10, value * 100 / max) : 3;
      return `<div class="bar-group"><div class="vbar" style="--h:${height}%" data-v="${value}"></div><span>${stage}<small class="stage-name">${STAGE_NAMES[stage]}</small></span></div>`;
    }).join('');
  }

  function renderManagerForum(projects) {
    const host = $('#destaques .card');
    if (!host) return;
    const valid = projects.filter(project => clean(project.area) && clean(project.area) !== 'Não informado');
    const forumOf = project => clean(first(project, ['iniciativa','forum','fórum'])) || 'Não informado';
    const forums = Object.entries(countsBy(valid, forumOf))
      .filter(([key]) => key !== 'Não informado')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([key]) => key);
    const managers = Object.entries(countsBy(valid, project => project.area))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([key]) => key);
    const colors = ['#530b03', '#df3232', '#bfbfbf'];
    const max = Math.max(1, ...managers.flatMap(manager => forums.map(forum => valid.filter(project => project.area === manager && forumOf(project) === forum).length)));
    host.innerHTML = `<h3 style="text-align:center;margin-bottom:22px">Demandas por Gerência x Fórum</h3><div class="manager-scroll"><div class="manager-chart">${managers.map(manager => {
      const values = forums.map(forum => valid.filter(project => project.area === manager && forumOf(project) === forum).length);
      return `<div class="manager-group"><div class="manager-bars">${values.map((value, index) => `<div title="${esc(forums[index])}: ${value}" style="position:relative;height:${value ? Math.max(10, value * 220 / max) : 0}px;background:${colors[index]}">${value > 0 ? `<span style="position:absolute;left:50%;top:-24px;transform:translateX(-50%);z-index:5;display:block;font-size:12px;font-weight:800;color:#111827;line-height:1;white-space:nowrap;pointer-events:none">${value}</span>` : ''}</div>`).join('')}</div><b>${values.reduce((sum, value) => sum + value, 0)}</b><span>${esc(manager)}</span></div>`;
    }).join('')}</div></div><div class="manager-legend">${forums.map((forum, index) => `<div><span style="background:${colors[index]}"></span>${esc(forum)}</div>`).join('') || '<div>Sem fóruns disponíveis no recorte.</div>'}</div>`;
  }

  function monthRange(key) {
    const [year, month] = key.split('-').map(Number);
    return [new Date(year, month - 1, 1), new Date(year, month, 0, 23, 59, 59)];
  }

  function overlaps(item, monthKey) {
    if (!item.inicio && !item.fim) return false;
    const start = new Date(`${clean(item.inicio || item.fim).slice(0, 10)}T12:00:00`);
    const end = new Date(`${clean(item.fim || item.inicio).slice(0, 10)}T12:00:00`);
    const [monthStart, monthEnd] = monthRange(monthKey);
    return !Number.isNaN(start.valueOf()) && !Number.isNaN(end.valueOf()) && start <= monthEnd && end >= monthStart;
  }

  function priorityKey(value) {
    const key = String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
    if (['P0','P1','P2'].includes(key)) return key;
    if (key.startsWith('CONGELAD')) return 'Congelado';
    if (key.startsWith('CANCELAD')) return 'Cancelado';
    return '';
  }

  const PRIORITY_RANK = { P0: 0, P1: 1, P2: 2, Congelado: 3, Cancelado: 4, '': 5 };
  const priorityRank = value => PRIORITY_RANK[priorityKey(value)];
  const byPriority = (a, b) => priorityRank(a.prioridade) - priorityRank(b.prioridade) || clean(a.inicio || '9999').localeCompare(clean(b.inicio || '9999')) || idNumber(a.id) - idNumber(b.id);
  const roadmapPrioritySelected = item => Boolean(priorityKey(item.prioridade)) && (!Array.isArray(window.roadmapPriorityFilter) || window.roadmapPriorityFilter.includes(priorityKey(item.prioridade)));

  function executiveMonthsHeader() {
    return `<div class="months"><div>Projeto e período</div>${EXEC_MONTHS.map(month => `<div class="month-label">${month.label}<span>${month.year}</span></div>`).join('')}</div>`;
  }

  function todayLayer() {
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const index = EXEC_MONTHS.findIndex(month => month.key === key);
    if (index < 0) return '';
    const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const ratio = Math.max(0, Math.min(1, (today.getDate() - 1) / days));
    const label = new Intl.DateTimeFormat('pt-BR').format(today);
    return `<div class="today-layer" aria-hidden="true"><div></div>${EXEC_MONTHS.map((month, monthIndex) => `<div class="today-cell">${monthIndex === index ? `<i class="today-line" style="left:${(ratio * 100).toFixed(3)}%"><span>Hoje · ${label}</span></i>` : ''}</div>`).join('')}</div>`;
  }

  function executiveRoadmapRows(items) {
    return items.map(item => {
      const priority = priorityKey(item.prioridade);
      const end = item.fim || item.termino;
      const label = `<b>${esc(item.id || 'SEM LOG')} · ${esc(compact(item.projeto, 52))}</b><small>${esc(monthYear(item.inicio))} → ${esc(monthYear(end))} · ${priority}</small><button class="road-open" type="button" data-project-id="${esc(item.id || '')}" onclick="event.stopPropagation();if(typeof openProject==='function')openProject(this.dataset.projectId)">Abrir visão</button>`;
      return `<div class="road-row priority-${priority.replace('/', '-').toLowerCase()}"><div class="road-name" ${typeof window.roadmapTipAttr === 'function' ? window.roadmapTipAttr(item) : `title="${esc(`${item.id || ''} ${item.projeto || ''}`)}"`}>${label}</div>${EXEC_MONTHS.map(month => overlaps({ inicio: item.inicio, fim: end }, month.key) ? `<div class="road-block" title="${priority}"></div>` : '<div class="road-cell"></div>').join('')}</div>`;
    }).join('');
  }

  function renderRoadmap(projects) {
    const card = $('#roadmap .roadmap-card');
    if (!card) return;
    const candidates = projects
      .filter(project => project.inicio || project.termino)
      .filter(roadmapPrioritySelected)
      .map(project => ({ ...project, fim: project.termino }))
      .sort(byPriority);
    card.innerHTML = `<div class="roadmap-legend"><span><i class="legend-p0"></i>P0</span><span><i class="legend-p1"></i>P1</span><span><i class="legend-p2"></i>P2</span><span><i class="legend-congelado"></i>Congelado</span><span><i class="legend-cancelado"></i>Cancelado</span><span class="today-legend"><i></i>Data atual</span></div><div class="roadmap-scroll"><div class="roadmap-grid">${executiveMonthsHeader()}${executiveRoadmapRows(candidates) || '<div class="empty-state">Sem cronograma no recorte.</div>'}${todayLayer()}</div></div>`;
    if (typeof window.layoutRoadmapTimeline === 'function') window.layoutRoadmapTimeline(card);
  }

  function aggregateFinancial(projects) {
    const series = { Budget: Array(12).fill(0), Fcst: Array(12).fill(0), Real: Array(12).fill(0) };
    projects.forEach(project => arrayOf(project.financeiro).forEach(record => {
      if (Number(record?.ano) !== 2026 || clean(record?.tipoDespesa) !== 'Total' || !(record?.icg in series)) return;
      const index = MONTH_ORDER[record.mes];
      if (index !== undefined) series[record.icg][index] += n(record.resultado);
    }));
    return series;
  }

  const cumulative = values => values.reduce((result, value, index) => {
    result.push(value + (result[index - 1] || 0));
    return result;
  }, []);

  function chartPolyline(series) {
    const lines = { Budget: cumulative(series.Budget), Fcst: cumulative(series.Fcst), Real: cumulative(series.Real) };
    const values = Object.values(lines).flat();
    let min = Math.min(0, ...values);
    let max = Math.max(0, ...values);
    if (max === min) max = min + 1;
    const points = valuesList => valuesList.map((value, index) => `${(index * 900 / 11).toFixed(1)},${(190 - (value - min) * 160 / (max - min)).toFixed(1)}`).join(' ');
    return `<g stroke="#e8ebf0" stroke-width="1"><line x1="0" y1="30" x2="900" y2="30"/><line x1="0" y1="83" x2="900" y2="83"/><line x1="0" y1="136" x2="900" y2="136"/><line x1="0" y1="190" x2="900" y2="190"/></g><polyline fill="none" stroke="#bfbfbf" stroke-width="3" points="${points(lines.Budget)}"/><polyline fill="none" stroke="#ed7d31" stroke-width="4" points="${points(lines.Fcst)}"/><polyline fill="none" stroke="#c00000" stroke-width="4" points="${points(lines.Real)}"/>`;
  }

  function projectFinanceChart(project) {
    const LABELS = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
    const endMatch = clean(project.termino).match(/^(\d{4})-(\d{2})/);
    const end = endMatch ? new Date(Number(endMatch[1]), Number(endMatch[2]) - 1, 1) : null;
    const base = end ? new Date(end.getFullYear(), end.getMonth() + 1, 1) : new Date(new Date().getFullYear(), 0, 1);
    const months = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(base.getFullYear(), base.getMonth() + index, 1);
      return { key: `${date.getFullYear()}-${date.getMonth()}`, label: LABELS[date.getMonth()], year: String(date.getFullYear()).slice(-2) };
    });
    const indexOf = Object.fromEntries(months.map((month, index) => [month.key, index]));
    const kindOf = value => {
      const key = clean(value).toLowerCase();
      if (/budget|meta/.test(key)) return 'meta';
      if (/real/.test(key)) return 'real';
      if (/fcst|forecast/.test(key)) return 'fcst';
      if (/baseline|base line|^bl$|ano anterior|ano passado|^ly$|last year/.test(key)) return 'base';
      return '';
    };
    const series = { meta: Array(12).fill(0), real: Array(12).fill(0), fcst: Array(12).fill(0), base: Array(12).fill(0) };
    const has = { meta: false, real: false, fcst: false, base: false };
    arrayOf(project.financeiro).forEach(record => {
      if (clean(record?.tipoDespesa) && clean(record?.tipoDespesa) !== 'Total') return;
      const kind = kindOf(record?.icg);
      const month = MONTH_ORDER[clean(record?.mes).slice(0, 1).toUpperCase() + clean(record?.mes).slice(1, 3).toLowerCase()];
      const index = indexOf[`${Number(record?.ano)}-${month}`];
      if (!kind || index === undefined) return;
      series[kind][index] += n(record.resultado);
      has[kind] = true;
    });
    const lines = { meta: cumulative(series.meta), real: cumulative(series.real), fcst: cumulative(series.fcst), base: cumulative(series.base) };
    const visible = ['meta','real','fcst'].concat(has.base ? ['base'] : []);
    const values = visible.map(key => lines[key]).flat();
    const min = Math.min(0, ...values);
    let max = Math.max(0, ...values);
    if (max === min) max = min + 1;
    const x = index => (index + 0.5) * 900 / 12;
    const points = list => list.map((value, index) => `${x(index).toFixed(1)},${(190 - (value - min) * 160 / (max - min)).toFixed(1)}`).join(' ');
    const COLORS = { meta: '#2f6fe4', real: '#111111', fcst: '#17875b', base: '#f08a00' };
    const NAMES = { meta: 'Meta', real: 'Realizado', fcst: 'Forecast', base: 'Baseline / ano anterior' };
    const svg = `<svg viewBox="0 0 900 200" preserveAspectRatio="none"><g stroke="#e8ebf0" stroke-width="1"><line x1="0" y1="30" x2="900" y2="30"/><line x1="0" y1="83" x2="900" y2="83"/><line x1="0" y1="136" x2="900" y2="136"/><line x1="0" y1="190" x2="900" y2="190"/></g>${visible.slice().reverse().map(key => `<polyline fill="none" stroke="${COLORS[key]}" stroke-width="3" vector-effect="non-scaling-stroke" points="${points(lines[key])}"/>`).join('')}</svg>`;
    const legend = `<div class="pf-legend">${visible.map(key => `<span><i style="background:${COLORS[key]}"></i>${NAMES[key]}</span>`).join('')}</div>`;
    const axis = `<div class="pf-axis">${months.map(month => `<span>${month.label}<small>${month.year}</small></span>`).join('')}</div>`;
    const sub = end ? `Captura de 12 meses após o término previsto (${months[0].label}/${months[0].year} a ${months[11].label}/${months[11].year})` : 'Término não informado · exibindo o ano corrente';
    return { sub, body: `${legend}${svg}${axis}` };
  }

  function renderFinance(projects) {
    const series = aggregateFinancial(projects);
    const total = key => series[key].reduce((sum, value) => sum + value, 0);
    const budget = total('Budget');
    const forecast = total('Fcst');
    const real = total('Real');
    const gapMeta = real - budget;
    const gapForecast = real - forecast;
    const opex = projects.reduce((sum, project) => sum + savingField(project, 'opex12M'), 0);
    const capex = projects.reduce((sum, project) => sum + savingField(project, 'capex12M'), 0);
    const all = projects.reduce((sum, project) => sum + savingField(project, 'total12M'), 0);
    const year = projects.reduce((sum, project) => sum + savingField(project, 'total2026'), 0);
    const grid = $('#financeiro .finance-grid');
    if (grid) grid.innerHTML = `<article class="card finance-kpi"><small>Meta</small><b>${moneyMM(budget)}</b></article><article class="card finance-kpi"><small>Forecast</small><b>${moneyMM(forecast)}</b></article><article class="card finance-kpi"><small>Realizado</small><b>${moneyMM(real)}</b></article><article class="card finance-kpi gap-kpi"><div class="gap-split"><div><span>Real x Meta</span><b style="color:${gapMeta < 0 ? 'var(--claro)' : 'var(--green)'}">${moneyMM(gapMeta)}</b></div><div><span>Real x Forecast</span><b style="color:${gapForecast < 0 ? 'var(--claro)' : 'var(--green)'}">${moneyMM(gapForecast)}</b></div></div></article><article class="card finance-kpi"><small>Saving Opex</small><b>${moneyMM(opex)}</b></article><article class="card finance-kpi"><small>Saving Capex</small><b>${moneyMM(capex)}</b></article><article class="card finance-kpi"><small>Saving Total</small><b>${moneyMM(all)}</b></article><article class="card finance-kpi"><small>Saving 2026</small><b>${moneyMM(year)}</b></article>`;
    const svg = $('#financeiro .line-chart svg');
    if (svg) svg.innerHTML = chartPolyline(series);
  }

  function riskClass(risk) {
    const normalized = clean(risk).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
    if (/alto|critico|critica/.test(normalized)) return 'red';
    if (/baixo|nao/.test(normalized)) return 'green';
    return '';
  }

  function renderTable() {
    const query = clean($('#tableSearch')?.value).toLocaleLowerCase('pt-BR');
    const selectedSituation = $('#portfolioStatusFilter')?.value || '';
    const rows = filteredProjects()
      .filter(project => !selectedSituation || situationOf(project) === selectedSituation)
      .filter(project => !query || `${project.id} ${project.projeto} ${project.pontoFocal} ${project.area} ${situationOf(project)} ${project.status}`.toLocaleLowerCase('pt-BR').includes(query))
      .sort(byPriority);
    const body = $('#portfolioRows');
    if (!body) return;
    body.innerHTML = rows.map(project => {
      const id = clean(project.id) || 'Sem ID';
      const name = clean(project.projeto) || 'Projeto sem nome';
      const focal = clean(project.pontoFocal) || 'Não informado';
      const management = clean(project.area) || 'Não informado';
      const situation = situationOf(project);
      const stage = clean(project.status) || 'Não informado';
      const risk = clean(project.risco) || 'Não informado';
      return `<tr data-status="${esc(situation)}"><td title="${esc(`${id} · ${name}`)}"><span class="portfolio-project"><b>${esc(id)}</b> · ${esc(name)}</span></td><td class="portfolio-detail" title="${esc(formatDate(project.inicio))}">${esc(formatDate(project.inicio))}</td><td class="portfolio-detail" title="${esc(formatDate(project.termino))}">${esc(formatDate(project.termino))}</td><td class="portfolio-detail" title="${esc(focal)}">${esc(focal)}</td><td class="portfolio-detail" title="${esc(management)}">${esc(management)}</td><td title="${esc(situation)}">${esc(situation)}</td><td title="${esc(stage)}">${esc(stage)}</td><td title="${esc(risk)}"><span class="chip ${riskClass(risk)}">${esc(risk)}</span></td><td title="${esc(savingLabel(project))}">${esc(savingLabel(project))}</td></tr>`;
    }).join('') || '<tr><td colspan="9" class="empty-state">Nenhum projeto corresponde aos filtros.</td></tr>';
  }

  const SCHEDULE_STATUS = [
    { label: 'Não iniciado', className: 'schedule-status-0' },
    { label: 'Iniciado', className: 'schedule-status-1' },
    { label: 'Em risco', className: 'schedule-status-2' },
    { label: 'Atrasado', className: 'schedule-status-3' },
    { label: 'Concluído', className: 'schedule-status-4' }
  ];

  function scheduleTopicNumber(item, index) {
    const recorded = clean(first(item, [
      'numero', 'número', 'num', 'numeroTopico', 'numeroTópico', 'númeroTopico', 'númeroTópico',
      'topicoNumero', 'tópicoNumero', 'numeroAtividade', 'númeroAtividade', 'numeroEtapa', 'númeroEtapa',
      'idTopico', 'idTópico', 'ordem', 'sequencia', 'sequência', 'id'
    ]));
    return recorded || String(index + 1);
  }

  function scheduleStatusCode(item) {
    const raw = first(item, [
      'status', 'statusNumero', 'statusNúmero', 'statusCodigo', 'codigoStatus', 'statusEtapa', 'status_etapa',
      'situacao', 'situação', 'andamento'
    ], 0);
    const numeric = Number(clean(raw).replace(',', '.'));
    if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 4) return numeric;
    const normalized = clean(raw).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
    if (/concluido|concluida|finalizado|finalizada/.test(normalized)) return 4;
    if (/atrasado|atrasada/.test(normalized)) return 3;
    if (/em risco|risco|atencao|critico|critica/.test(normalized)) return 2;
    if (/iniciado|iniciada|em andamento|execucao/.test(normalized)) return 1;
    return 0;
  }

  function scheduleDate(value) {
    const match = clean(value).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3] || 1), 12);
    return Number.isNaN(date.valueOf()) ? null : date;
  }

  function scheduleMonths(project, items) {
    const dates = [project.inicio, project.termino];
    items.forEach(item => dates.push(item.inicio, item.fim || item.termino));
    const validDates = dates.map(scheduleDate).filter(Boolean).sort((a, b) => a - b);
    if (!validDates.length) return PROJECT_MONTHS;
    const start = validDates[0];
    const end = validDates[validDates.length - 1];
    const months = [];
    for (let cursor = new Date(start.getFullYear(), start.getMonth(), 1, 12); cursor <= end; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1, 12)) {
      months.push({
        key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
        label: ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'][cursor.getMonth()],
        year: String(cursor.getFullYear()).slice(-2)
      });
    }
    while (months.length < 12) {
      const last = months[months.length - 1];
      const [year, month] = last.key.split('-').map(Number);
      const next = new Date(year, month, 1, 12);
      months.push({
        key: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`,
        label: ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'][next.getMonth()],
        year: String(next.getFullYear()).slice(-2)
      });
    }
    return months;
  }

  function scheduleTodayLayer(months) {
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const index = months.findIndex(month => month.key === key);
    if (index < 0) return '';
    const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const ratio = Math.max(0, Math.min(1, (today.getDate() - 1) / days));
    const label = new Intl.DateTimeFormat('pt-BR').format(today);
    return `<div class="schedule-today-layer" aria-hidden="true"><div></div>${months.map((month, monthIndex) => `<div class="schedule-today-cell">${monthIndex === index ? `<i class="schedule-today-line" style="left:${(ratio * 100).toFixed(3)}%"><span>Hoje · ${label}</span></i>` : ''}</div>`).join('')}</div>`;
  }

  function projectScheduleRows(items, months) {
    return items.map((item, index) => {
      const topicNumber = scheduleTopicNumber(item, index);
      const statusCode = scheduleStatusCode(item);
      const status = SCHEDULE_STATUS[statusCode];
      const activity = clean(item.projeto) || 'Tópico sem descrição';
      const topicLabel = `${topicNumber} · ${activity}`;
      const period = `${formatDate(item.inicio)} → ${formatDate(item.fim || item.termino)}`;
      const barTitle = `${topicLabel} · ${period} · Status ${statusCode}: ${status.label}`;
      return `<div class="road-row"><div class="road-name" title="${esc(topicLabel)}"><b>${esc(topicNumber)}</b><span>${esc(activity)}</span></div>${months.map(month => overlaps(item, month.key) ? `<div class="road-block ${status.className}" title="${esc(barTitle)}" aria-label="${esc(barTitle)}"></div>` : '<div class="road-cell"></div>').join('')}</div>`;
    }).join('');
  }

  function scheduleLegend() {
    return `<div class="project-schedule-legend" aria-label="Legenda de status das etapas">${SCHEDULE_STATUS.map((status, code) => `<span><i class="${status.className}"></i>${code} · ${status.label}</span>`).join('')}<span class="schedule-today-legend"><i></i>Data atual</span></div>`;
  }

  function scheduleCard(project, mode) {
    const source = mode === 'detalhado' ? arrayOf(project.cronogramaDetalhado) : arrayOf(project.macroAtividades);
    const items = source
      .filter(item => item && item.atividade && item.atividade !== 0 && item.atividade !== '0')
      .map(item => ({ ...item, projeto: item.atividade, fim: item.fim || item.termino }));
    const months = scheduleMonths(project, items);
    const rows = projectScheduleRows(items, months);
    const gridWidth = Math.max(850, 420 + months.length * 64);
    return `${scheduleLegend()}<div class="project-schedule-scroll schedule-${mode}"><div class="project-schedule-grid" style="--schedule-month-count:${months.length};--schedule-grid-width:${gridWidth}px"><div class="months"><div>Tópico e etapa</div>${months.map(month => `<div class="month-label">${month.label}<span>${month.year}</span></div>`).join('')}</div>${rows || '<div class="empty-state">Cronograma não preenchido no arquivo de origem.</div>'}${scheduleTodayLayer(months)}</div></div>`;
  }

  function splitTimelineDate(value) {
    const text = clean(value);
    const match = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})(?:\s*[-–—|:]\s*|\s+)/);
    if (!match) return { data: '', texto: text };

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    const validDate = new Date(year, month - 1, day);
    if (validDate.getFullYear() !== year || validDate.getMonth() !== month - 1 || validDate.getDate() !== day) {
      return { data: '', texto: text };
    }

    return {
      data: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      texto: text.slice(match[0].length).trim()
    };
  }

  function normalizeTimelineItem(item) {
    const detail = splitTimelineDate(item?.detalhe);
    const action = splitTimelineDate(item?.acoes);
    return {
      ...item,
      data: clean(item?.data) || detail.data || action.data,
      detalhe: detail.texto,
      acoes: action.texto
    };
  }

  function projectTimeline(project) {
    // Fonte única: campo "Status do Projeto" do One_Page. Cada linha iniciada por data é uma atualização.
    const today = new Date();
    const entries = [];
    clean(project.statusProjeto).split(/\r?\n+/).forEach(rawLine => {
      const line = clean(rawLine.replace(/\u00a0/g, ' '));
      if (!line || /^risco\s*:?$/i.test(line) || /^data\s*[-–—:]\s*pontos relevantes/i.test(line)) return;
      const match = line.match(/^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2}|\d{4}))?(?=\s|[-–—|:]|$)\s*[-–—|:]?\s*/);
      if (match) {
        const day = Number(match[1]);
        const month = Number(match[2]);
        const year = match[3] ? Number(match[3].length === 2 ? `20${match[3]}` : match[3]) : today.getFullYear();
        const valid = new Date(year, month - 1, day);
        if (valid.getFullYear() === year && valid.getMonth() === month - 1 && valid.getDate() === day) {
          entries.push({ data: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, detalhe: clean(line.slice(match[0].length)), ordem: entries.length });
          return;
        }
      }
      if (entries.length) entries[entries.length - 1].detalhe = clean(`${entries[entries.length - 1].detalhe} ${line}`);
      else entries.push({ data: '', detalhe: line, ordem: entries.length });
    });
    return entries
      .filter(item => item.detalhe)
      .sort((a, b) => clean(b.data).localeCompare(clean(a.data)) || a.ordem - b.ordem)
      .slice(0, 3);
  }


  function renderProject(project) {
    const view = $('#projectView');
    if (!view) return;
    const deliverables = arrayOf(project.entregaveis).filter(Boolean);
    const timeline = projectTimeline(project);
    const projectFinance = projectFinanceChart(project);
    const initiative = clean(first(project, ['iniciativa','forum','fórum'])) || 'Iniciativa não informada';
    view.innerHTML = `
      <button class="back" type="button" onclick="closeProject()">← Voltar ao portfólio</button>
      <section class="project-hero hero-v9"><div class="hero-main"><div class="pid">${esc(project.id)} · ${esc(project.area || 'Não informado')} · ${esc(initiative)}</div><h1>${esc(project.projeto || 'Projeto sem nome')}</h1><div class="hero-tags-row"><div class="meta-row"><span class="chip">${esc(project.status || 'Sem stage')}</span><span class="chip">${esc(project.prioridade || 'S/P')}</span><span class="chip green">${esc(project.ganhoProjeto || 'Não informado')}</span></div><select class="project-selector" onchange="openProject(this.value)">${state.projects.map(item => `<option value="${esc(item.id)}" ${item.id === project.id ? 'selected' : ''}>${esc(item.id)} · ${esc(item.projeto)}</option>`).join('')}</select></div><p class="chart-sub hero-risk">Risco: ${esc(project.risco || 'não informado')}</p></div></section>
      <section class="detail-grid"><article class="card detail"><small>Início</small><b>${formatDate(project.inicio)}</b></article><article class="card detail"><small>Término</small><b>${formatDate(project.termino)}</b></article><article class="card detail"><small>Ponto focal</small><b title="${esc(project.pontoFocal)}">${esc(compact(project.pontoFocal || 'Não informado', 25))}</b></article><article class="card detail"><small>PMO</small><b title="${esc(project.pmo)}">${esc(compact(project.pmo || 'Não informado', 25))}</b></article></section>
      <section class="detail-grid"><article class="card detail"><small>Saving Opex 12M</small><b>${moneyMM(savingField(project, 'opex12M'))}</b></article><article class="card detail"><small>Saving Capex 12M</small><b>${moneyMM(savingField(project, 'capex12M'))}</b></article><article class="card detail"><small>Saving total 12M</small><b>${moneyMM(savingField(project, 'total12M'))}</b></article><article class="card detail"><small>Saving 2026</small><b>${moneyMM(savingField(project, 'total2026'))}</b></article></section>
      <section class="section two-col"><article class="card text-card scroll-card"><div class="chart-title">Escopo do projeto</div><p class="scroll-content">${esc(project.escopo || 'Escopo não preenchido no arquivo de origem.')}</p></article><article class="card text-card scroll-card"><div class="chart-title">Principais entregáveis</div><ul class="checklist scroll-content">${deliverables.length ? deliverables.map(item => `<li>${esc(item)}</li>`).join('') : '<li>Entregáveis não preenchidos no arquivo de origem.</li>'}</ul></article></section>
      <section class="section"><div class="section-head"><div><h2>Cronograma do projeto</h2><p>Alternância entre visão executiva e detalhada.</p></div></div><div class="tabs"><button class="tab ${state.scheduleMode === 'macro' ? 'active' : ''}" type="button" onclick="switchSchedule('macro')">Macrocronograma</button><button class="tab ${state.scheduleMode === 'detalhado' ? 'active' : ''}" type="button" onclick="switchSchedule('detalhado')">Cronograma detalhado</button></div><article class="card roadmap-card" id="projectSchedule">${scheduleCard(project, state.scheduleMode)}</article></section>
      <section class="section two-col"><article class="card line-chart project-finance-chart"><div class="chart-title">Desempenho financeiro do projeto</div><div class="chart-sub">${esc(projectFinance.sub)}</div>${projectFinance.body}</article><article class="card timeline"><div class="chart-title" style="margin-bottom:18px">Histórico de atualizações</div>${timeline.length ? timeline.map(item => `<div class="time-item"><div class="time-date">${shortDate(item.data)}</div><div class="time-line"></div><div class="time-copy"><b>Atualização registrada</b><p>${esc(item.detalhe)}</p></div></div>`).join('') : '<div class="empty-state">Sem atualizações registradas no Status do Projeto.</div>'}</article></section>`;
  }

  function renderDashboard() {
    syncAdditionalFilterOptions();
    const projects = filteredProjects();
    renderHero(projects);
    renderKpis(projects);
    renderHealth(projects);
    renderManagerForum(projects);
    renderRoadmap(projects);
    renderFinance(projects);
    syncPortfolioStatusOptions();
    renderTable();
  }

  window.applyGlobalFilters = () => {
    window.dashboardFilters = currentFilters();
    document.dispatchEvent(new CustomEvent('dashboardFiltersChanged', { detail: window.dashboardFilters }));
    renderDashboard();
  };

  window.refreshRoadmapPriority = () => {
    if (state.projects.length) renderRoadmap(filteredProjects());
    else document.dispatchEvent(new CustomEvent('roadmapPriorityChanged'));
  };

  window.filterPortfolioTable = renderTable;
  window.filterTable = renderTable;

  window.openProject = id => {
    const project = state.projects.find(item => item.id === id) || state.projects[0];
    if (!project) return;
    state.selectedId = project.id;
    state.scheduleMode = 'macro';
    renderProject(project);
    document.body.classList.add('project-open');
    $('#home')?.classList.add('hide');
    $('#projectView')?.classList.add('show');
    const crumb = $('#crumbName');
    if (crumb) crumb.textContent = `${project.id} · Visão do Projeto`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.closeProject = () => {
    document.body.classList.remove('project-open');
    $('#home')?.classList.remove('hide');
    $('#projectView')?.classList.remove('show');
    const crumb = $('#crumbName');
    if (crumb) crumb.textContent = 'Visão Geral';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.switchSchedule = mode => {
    state.scheduleMode = mode === 'detalhado' ? 'detalhado' : 'macro';
    const project = state.projects.find(item => item.id === state.selectedId);
    if (project) renderProject(project);
  };

  async function refreshDashboard() {
    if (state.refreshing) return;
    const button = $('#btnAtualizarDashboard');
    const originalText = button?.textContent;
    state.refreshing = true;
    document.body.classList.add('loading-data');
    if (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = '↻ Atualizando…';
    }
    try {
      const projects = prepareProjects(await loadProjects({ force: true }));
      if (!projects.length) throw new Error('Nenhum projeto compatível foi carregado.');
      state.projects = projects;
      state.updatedAt = new Date();
      renderDashboard();
      if (state.selectedId) {
        const selected = state.projects.find(project => project.id === state.selectedId);
        if (selected) renderProject(selected);
        else window.closeProject();
      }
    } catch (error) {
      console.error(error);
      const updated = $('.updated');
      if (updated) updated.textContent = `Falha ao atualizar: ${error.message}`;
    } finally {
      state.refreshing = false;
      document.body.classList.remove('loading-data');
      if (button) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.textContent = originalText || '↻ Atualizar dados';
      }
    }
  }

  function bindEvents() {
    const searchMini = $('.search-mini');
    if (searchMini) searchMini.addEventListener('input', event => {
      const tableSearch = $('#tableSearch');
      if (tableSearch) tableSearch.value = event.target.value;
      renderTable();
    });
    $('#btnAtualizarDashboard')?.addEventListener('click', refreshDashboard);
    $$('.nav a').forEach(link => link.addEventListener('click', () => {
      $$('.nav a').forEach(item => item.classList.remove('active'));
      link.classList.add('active');
      if (document.body.classList.contains('project-open')) window.closeProject();
    }));
  }

  async function init() {
    try {
      const projects = prepareProjects(await loadProjects());
      if (!projects.length) throw new Error('Nenhum projeto compatível foi carregado.');
      state.projects = projects;
      state.updatedAt = new Date();
      window.dashboardFilters = currentFilters();
      renderDashboard();
      bindEvents();
    } catch (error) {
      console.error(error);
      const updated = $('.updated');
      if (updated) updated.textContent = 'Falha ao carregar os dados';
      const notice = $('.notice');
      if (notice) notice.innerHTML = `<b>Falha de integração:</b> ${esc(error.message)} Execute o dashboard por servidor local ou mantenha a pasta <code>json</code> ao lado do HTML.`;
      bindEvents();
    }
  }

  init();
})();
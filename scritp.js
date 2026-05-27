/* ================================================================
   FinanSys v3.0 — script.js
   Sistema Financeiro Completo
   ================================================================ */

/* ─── ESTADO GLOBAL ─── */
let state = {
  movimentacoes: [],
  transferencias: [],
  contas: [],
  categorias: [],
  reserva: { movimentos: [], meta: 0 },
  provisoes: [],
  lixeira: [],
  auditoria: [],
  usuarios: [],
  saldoInicial: 0,
  config: { nomeSistema: 'FinanSys', metaReservas: 0 },
  filtro: { inicio: null, fim: null },
  dashboardMes: null,
  provisaoMes: null
};

let currentUser = null;
let undoStack   = [];
let charts      = {};

/* ─── CATEGORIAS PADRÃO ─── */
const CATEGORIAS_PADRAO = [
  { id:'c1',  nome:'Salário',               tipo:'entrada'  },
  { id:'c2',  nome:'Freelance',             tipo:'entrada'  },
  { id:'c3',  nome:'Investimentos',         tipo:'entrada'  },
  { id:'c4',  nome:'Prestação de Serviços', tipo:'entrada'  },
  { id:'c5',  nome:'Outros (Entrada)',       tipo:'entrada'  },
  { id:'c6',  nome:'Moradia',               tipo:'despesa'  },
  { id:'c7',  nome:'Alimentação',           tipo:'despesa'  },
  { id:'c8',  nome:'Transporte',            tipo:'despesa'  },
  { id:'c9',  nome:'Saúde',                 tipo:'despesa'  },
  { id:'c10', nome:'Educação',              tipo:'despesa'  },
  { id:'c11', nome:'Lazer',                 tipo:'despesa'  },
  { id:'c12', nome:'Outros (Despesa)',       tipo:'despesa'  },
];

const PALETTE_D = ['#e53e56','#f58c2a','#f7d05b','#7c3aed','#2e75f0','#0f9d6e','#c0392b','#e67e22','#9b59b6','#1abc9c'];
const PALETTE_E = ['#0f9d6e','#4361ee','#60a5fa','#34d399','#a3e635','#fbbf24','#818cf8','#f472b6'];
const EMOJI     = { 'Moradia':'🏠','Alimentação':'🛒','Transporte':'🚗','Saúde':'❤️','Educação':'📚','Lazer':'🎉','Salário':'💼','Freelance':'💻','Investimentos':'📈','Prestação de Serviços':'🤝','Outros (Entrada)':'📥','Outros (Despesa)':'📦' };

/* ================================================================
   PERSISTÊNCIA
   ================================================================ */
function salvarState() {
  localStorage.setItem('finansys_v3', JSON.stringify(state));
}

function carregarState() {
  const raw = localStorage.getItem('finansys_v3');
  if (raw) {
    try { state = Object.assign({}, state, JSON.parse(raw)); } catch(e) {}
  } else {
    state.categorias = [...CATEGORIAS_PADRAO];
    state.contas     = [{ id: uid(), nome:'Conta Principal', tipo:'corrente', saldo:0, cor:'#4361ee', principal:true }];
    state.usuarios   = [{ id:'u1', nome:'Administrador', login:'admin', senha:'admin123', nivel:5 }];
  }
  /* Garantias de campos obrigatórios */
  if (!state.usuarios  || !state.usuarios.length)  state.usuarios  = [{ id:'u1', nome:'Administrador', login:'admin', senha:'admin123', nivel:5 }];
  if (!state.reserva)    state.reserva   = { movimentos:[], meta:0 };
  if (!state.provisoes)  state.provisoes = [];
  if (!state.lixeira)    state.lixeira   = [];
  if (!state.auditoria)  state.auditoria = [];
  if (!state.config)     state.config    = { nomeSistema:'FinanSys', metaReservas:0 };
  if (typeof state.lixeiraNova === 'undefined') state.lixeiraNova = false;
  if (!state.dashboardMes) state.dashboardMes = today().slice(0,7);
  if (!state.provisaoMes) state.provisaoMes = state.dashboardMes;
  if (!state.conciliacaoArquivo) state.conciliacaoArquivo = [];
  if (!state.categorias || !state.categorias.length) state.categorias = [...CATEGORIAS_PADRAO];

  /* Migração de provisões antigas para recebimento por mês */
  const mesRefMig = state.dashboardMes || today().slice(0,7);
  state.provisoes = (state.provisoes || []).map(p => {
    if (!p.inicio) p.inicio = mesRefMig;
    if (!p.recorrencia) p.recorrencia = 'mensal';
    if (!('repeticoes' in p)) p.repeticoes = '';
    if (!p.recebimentos) p.recebimentos = {};
    if (p.recebido === true && Object.keys(p.recebimentos).length === 0) p.recebimentos[mesRefMig] = true;
    p.recebido = false;
    return p;
  });

  /* Limpar lixeira com mais de 90 dias */
  const limite90 = Date.now() - 90 * 24 * 60 * 60 * 1000;
  state.lixeira = state.lixeira.filter(i => new Date(i.dataExclusao).getTime() > limite90);
}

/* ================================================================
   UTILITÁRIOS
   ================================================================ */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

function fmt(v) {
  return 'R$ ' + Math.abs(+v || 0).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

function fmtData(s) {
  if (!s) return '';
  const [y,m,d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function today() { return new Date().toISOString().split('T')[0]; }

function agora() { return new Date().toLocaleString('pt-BR'); }

function mesAnoAtual() {
  const d = new Date();
  const ns = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${ns[d.getMonth()]}/${d.getFullYear()}`;
}

function mesAtualISO() {
  return new Date().toISOString().slice(0,7);
}

function getDashboardMes() {
  if (!state.dashboardMes) state.dashboardMes = mesAtualISO();
  return state.dashboardMes;
}

function nomeMesAno(ym) {
  const [ano, mes] = ym.split('-').map(Number);
  const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${nomes[mes - 1]} de ${ano}`;
}

function addMeses(ym, qtd) {
  const [ano, mes] = ym.split('-').map(Number);
  const d = new Date(ano, mes - 1 + qtd, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
}

function definirMesDashboard(ym) {
  if (!ym) return;
  state.dashboardMes = ym;
  salvarState();
  renderDashboard();
}

function alterarMesDashboard(delta) {
  state.dashboardMes = addMeses(getDashboardMes(), delta);
  salvarState();
  renderDashboard();
}

function irParaMesAtual() {
  state.dashboardMes = mesAtualISO();
  salvarState();
  renderDashboard();
}

function getProvisaoMes() {
  if (!state.provisaoMes) state.provisaoMes = getDashboardMes();
  return state.provisaoMes;
}

function definirMesProvisao(ym) {
  if (!ym) return;
  state.provisaoMes = ym;
  salvarState();
  renderProvisao();
}

function alterarMesProvisao(delta) {
  state.provisaoMes = addMeses(getProvisaoMes(), delta);
  salvarState();
  renderProvisao();
}

function irParaMesAtualProvisao() {
  state.provisaoMes = mesAtualISO();
  salvarState();
  renderProvisao();
}

function getConciliacaoMes() {
  if (!state.conciliacaoMes) state.conciliacaoMes = getDashboardMes();
  return state.conciliacaoMes;
}

function definirMesConciliacao(ym) {
  if (!ym) return;
  state.conciliacaoMes = ym;
  salvarState();
  renderConciliacao();
}

function movsDoMes(ym) {
  return state.movimentacoes.filter(m => m.data && m.data.slice(0,7) === ym);
}

function provisoesAtivasDoTipo(tipo) {
  return (state.provisoes || []).filter(p => p.tipo === tipo);
}

function diffMeses(inicio, ym) {
  if (!inicio || !ym) return 0;
  const [ai, mi] = inicio.split('-').map(Number);
  const [ay, my] = ym.split('-').map(Number);
  return (ay - ai) * 12 + (my - mi);
}

function provisaoOcorreNoMes(p, ym) {
  if (!p) return false;
  const inicio = p.inicio || getDashboardMes();
  const diff = diffMeses(inicio, ym);
  if (diff < 0) return false;
  const rep = parseInt(p.repeticoes || 0) || 0;
  if (p.recorrencia === 'anual') {
    const n = Math.floor(diff / 12) + 1;
    return diff % 12 === 0 && (rep <= 0 || n <= rep);
  }
  if (p.recorrencia === 'fixa') return rep > 0 && diff < rep;
  return rep <= 0 || diff < rep;
}

function provisaoRecebidaNoMes(p, ym) {
  return !!(p.recebimentos && p.recebimentos[ym]);
}

function parcelaProvisao(p, ym) {
  const diff = diffMeses(p.inicio || ym, ym);
  if (diff < 0) return '—';
  const rep = parseInt(p.repeticoes || 0) || 0;
  const atual = p.recorrencia === 'anual' ? Math.floor(diff / 12) + 1 : diff + 1;
  return rep > 0 ? `${atual}/${rep}` : `${atual}/∞`;
}

function provisoesDoMes(ym, tipo = null) {
  return (state.provisoes || []).filter(p => (!tipo || p.tipo === tipo) && provisaoOcorreNoMes(p, ym));
}

function despesaComputavel(m) {
  return m.tipo === 'despesa' && (m.pago === true || m.recebido === true || m.conciliado === true);
}

function calcularResumoMes(ym) {
  const movs = movsDoMes(ym);
  const provMes = provisoesDoMes(ym);
  const entradasLancadasMov = movs.filter(m => m.tipo === 'entrada').reduce((s,m)=>s+m.valor,0);
  const entradasLancadasProv = provMes.filter(p => p.tipo === 'entrada').reduce((s,p)=>s+p.valor,0);
  const entradasRecebidasMov = movs.filter(m => m.tipo === 'entrada' && m.recebido === true).reduce((s,m)=>s+m.valor,0);
  const entradasRecebidasProv = provMes.filter(p => p.tipo === 'entrada' && provisaoRecebidaNoMes(p, ym)).reduce((s,p)=>s+p.valor,0);
  const receberMov = movs.filter(m => m.tipo === 'entrada' && m.recebido !== true).reduce((s,m)=>s+m.valor,0);
  const receberProv = provMes.filter(p => p.tipo === 'entrada' && !provisaoRecebidaNoMes(p, ym)).reduce((s,p)=>s+p.valor,0);
  const despesasLancadasMov = movs.filter(m => m.tipo === 'despesa').reduce((s,m)=>s+m.valor,0);
  const despesasLancadasProv = provMes.filter(p => p.tipo === 'despesa').reduce((s,p)=>s+p.valor,0);
  const despesasComputadasMov = movs.filter(despesaComputavel).reduce((s,m)=>s+m.valor,0);
  const despesasComputadasProv = provMes.filter(p => p.tipo === 'despesa' && provisaoRecebidaNoMes(p, ym)).reduce((s,p)=>s+p.valor,0);
  return {
    entradasLancadas: entradasLancadasMov + entradasLancadasProv,
    entradasRecebidas: entradasRecebidasMov + entradasRecebidasProv,
    valoresAReceber: receberMov + receberProv,
    despesasLancadas: despesasLancadasMov + despesasLancadasProv,
    despesas: despesasComputadasMov + despesasComputadasProv,
    saldoLivre: (state.saldoInicial || 0) + entradasRecebidasMov + entradasRecebidasProv - despesasComputadasMov - despesasComputadasProv
  };
}

/* Formatos monetários BR */
function parseMoeda(str) {
  if (str === undefined || str === null) return 0;
  const s = String(str).replace(/\./g,'').replace(',','.');
  return Math.abs(parseFloat(s) || 0);
}

function formatMoeda(v) {
  return (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

function toast(msg, tipo = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${tipo}`;
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.className = 'toast'; }, 3200);
}

function movsFiltradas() {
  return state.movimentacoes.filter(m => {
    if (state.filtro.inicio && m.data < state.filtro.inicio) return false;
    if (state.filtro.fim   && m.data > state.filtro.fim)    return false;
    return true;
  });
}

function getUltimos6Meses() {
  const r = [], d = new Date();
  for (let i = 5; i >= 0; i--) {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
    r.push(`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`);
  }
  return r;
}

function destroyChart(key) {
  if (charts[key]) { try { charts[key].destroy(); } catch(e) {} delete charts[key]; }
}

/* ================================================================
   LOGIN / LOGOUT
   ================================================================ */
function fazerLogin() {
  const login = (document.getElementById('loginUser').value || '').trim();
  const senha = document.getElementById('loginPass').value || '';
  const user  = state.usuarios.find(u => u.login === login && u.senha === senha);
  if (!user) {
    document.getElementById('loginError').textContent = 'Usuário ou senha incorretos.';
    return;
  }
  currentUser = user;
  document.getElementById('loginError').textContent = '';
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appScreen').style.display  = 'flex';

  /* Atualiza UI */
  document.getElementById('userNameSidebar').textContent  = user.nome;
  document.getElementById('userRoleSidebar').textContent  = nivelLabel(user.nivel);
  document.getElementById('userAvatarSidebar').textContent = user.nome.slice(0,2).toUpperCase();

  /* Aplica nome do sistema */
  aplicarNomeSistema();
  aplicarPermissoes();
  registrarAuditoria('Login', `Usuário ${user.nome} entrou no sistema`);
  atualizarBadgeLixeira();
  renderDashboard();
}

function fazerLogout() {
  registrarAuditoria('Logout', `Usuário ${currentUser.nome} saiu`);
  salvarState();
  currentUser = null;
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appScreen').style.display   = 'none';
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
}

function nivelLabel(n) {
  return { 1:'Colaborador', 2:'Operador', 3:'Supervisor', 4:'Gerente', 5:'Administrador' }[n] || 'Usuário';
}

function temPermissao(nivel) {
  return currentUser && currentUser.nivel >= nivel;
}

function aplicarPermissoes() {
  const n = currentUser ? currentUser.nivel : 1;
  /* Botão nova movimentação */
  const bNov = document.getElementById('btnNovaMovimentacao');
  if (bNov) bNov.style.display = n >= 2 ? '' : 'none';
  /* Auditoria apenas n >= 4 */
  const navAud = document.getElementById('navAuditoria');
  if (navAud) navAud.style.display = n >= 4 ? '' : 'none';
  /* Gestão de usuários apenas admin */
  const cfgUsr = document.getElementById('cfgUsuariosCard');
  if (cfgUsr) cfgUsr.style.display = n >= 5 ? '' : 'none';
}

function aplicarNomeSistema() {
  const nome = state.config.nomeSistema || 'FinanSys';
  document.getElementById('sysTitle').textContent         = `${nome} — Sistema Financeiro`;
  document.getElementById('loginSysName').textContent     = nome;
  document.getElementById('sysNameSidebar').textContent   = nome;
  const pSN = document.getElementById('printSysName');
  if (pSN) pSN.textContent = nome;
}

/* Enter no login */
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('loginScreen').style.display !== 'none') fazerLogin();
});

/* ================================================================
   AUDITORIA
   ================================================================ */
function registrarAuditoria(acao, detalhe) {
  const usuario = currentUser ? currentUser.nome : 'Sistema';
  state.auditoria.unshift({ id: uid(), dataHora: agora(), usuario, acao, detalhe });
  if (state.auditoria.length > 1000) state.auditoria = state.auditoria.slice(0, 1000);
  salvarState();
}

function renderAuditoria() {
  const search = (document.getElementById('searchAuditoria')?.value || '').toLowerCase();
  const userFiltro = document.getElementById('filtroAudUser')?.value || '';

  /* Popular select de usuários */
  const selUser = document.getElementById('filtroAudUser');
  if (selUser) {
    const usuariosUnicos = [...new Set(state.auditoria.map(a => a.usuario))];
    const prevVal = selUser.value;
    selUser.innerHTML = '<option value="">Todos os usuários</option>' +
      usuariosUnicos.map(u => `<option value="${u}">${u}</option>`).join('');
    if (prevVal) selUser.value = prevVal;
  }

  let logs = [...state.auditoria];
  if (search)     logs = logs.filter(l => l.acao.toLowerCase().includes(search) || l.detalhe.toLowerCase().includes(search));
  if (userFiltro) logs = logs.filter(l => l.usuario === userFiltro);

  const tbody = document.getElementById('tbodyAuditoria');
  const empty = document.getElementById('emptyAuditoria');
  if (!logs.length) { tbody.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';
  tbody.innerHTML = logs.map(l =>
    `<tr>
      <td style="font-size:11px;white-space:nowrap">${l.dataHora}</td>
      <td><strong>${l.usuario}</strong></td>
      <td><span class="tag-categ" style="background:var(--blue-bg);color:var(--blue)">${l.acao}</span></td>
      <td style="font-size:12px;color:var(--text-2)">${l.detalhe}</td>
    </tr>`
  ).join('');
}

function limparAuditoria() {
  if (!temPermissao(5)) { toast('Apenas administradores podem limpar o log', 'error'); return; }
  if (!confirm('Limpar todo o log de auditoria?')) return;
  state.auditoria = [];
  salvarState();
  renderAuditoria();
  toast('Log limpo ✓');
}

/* ================================================================
   DESFAZER (UNDO)
   ================================================================ */
function snapState() {
  return {
    movimentacoes:  JSON.parse(JSON.stringify(state.movimentacoes)),
    transferencias: JSON.parse(JSON.stringify(state.transferencias)),
    contas:         JSON.parse(JSON.stringify(state.contas)),
    reserva:        JSON.parse(JSON.stringify(state.reserva)),
    provisoes:      JSON.parse(JSON.stringify(state.provisoes))
  };
}

function pushUndo(descricao, snapshot) {
  undoStack.push({ descricao, snapshot: JSON.stringify(snapshot) });
  if (undoStack.length > 30) undoStack.shift();
  const btn = document.getElementById('btnUndo');
  if (btn) { btn.disabled = false; btn.title = `Desfazer: ${descricao}`; }
}

function desfazerUltimaAcao() {
  if (!undoStack.length) return;
  const item = undoStack.pop();
  const snap = JSON.parse(item.snapshot);
  state.movimentacoes  = snap.movimentacoes;
  state.transferencias = snap.transferencias;
  state.contas         = snap.contas;
  state.reserva        = snap.reserva;
  state.provisoes      = snap.provisoes;
  salvarState();
  renderDashboard();
  const p = document.querySelector('.page.active')?.id?.replace('page-','');
  if (p && p !== 'dashboard') navigate(p);
  toast(`Desfeito: ${item.descricao}`, 'info');
  registrarAuditoria('Desfazer', item.descricao);
  if (!undoStack.length) {
    const btn = document.getElementById('btnUndo');
    if (btn) { btn.disabled = true; btn.title = 'Desfazer última ação'; }
  }
}

/* ================================================================
   NAVEGAÇÃO
   ================================================================ */
const PAGE_TITLES = {
  dashboard:       ['Dashboard',             'Visão geral da sua situação financeira'],
  entradas:        ['Entradas',              'Gerencie suas receitas'],
  despesas:        ['Despesas',              'Gerencie seus gastos'],
  transferencias:  ['Transferências',        'Movimentações entre contas'],
  reserva:         ['Reserva Financeira',    'Controle e metas de reserva'],
  conciliacao:     ['Conciliação Bancária',  'Concilie seus lançamentos'],
  provisao:        ['Provisão Mensal',       'Receitas e despesas fixas recorrentes'],
  lixeira:         ['Lixeira',               'Registros excluídos — mantidos 90 dias'],
  auditoria:       ['Auditoria',             'Log completo de ações do sistema'],
  configuracoes:   ['Configurações',         'Personalize o sistema'],
};

function navigate(page) {
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page)
  );
  document.querySelectorAll('.page').forEach(el =>
    el.classList.toggle('active', el.id === `page-${page}`)
  );
  const [title, sub] = PAGE_TITLES[page] || ['',''];
  document.getElementById('pageTitle').textContent    = title;
  document.getElementById('pageSubtitle').textContent = sub;

  const map = {
    dashboard: renderDashboard, entradas: renderEntradas, despesas: renderDespesas,
    transferencias: renderTransferencias, reserva: renderReserva,
    conciliacao: renderConciliacao, provisao: renderProvisao,
    lixeira: renderLixeira,
    auditoria: renderAuditoria, configuracoes: renderConfiguracoes
  };
  if (page === 'lixeira') { state.lixeiraNova = false; salvarState(); atualizarBadgeLixeira(); }
  if (map[page]) map[page]();
}

/* Sidebar toggle */
document.getElementById('sidebarToggle').addEventListener('click', () =>
  document.getElementById('sidebar').classList.toggle('collapsed')
);
document.getElementById('menuBtn').addEventListener('click', () =>
  document.getElementById('sidebar').classList.toggle('collapsed')
);

/* ================================================================
   FILTRO GLOBAL DE DATAS
   ================================================================ */
function aplicarFiltro() {
  state.filtro.inicio = document.getElementById('filtroDataInicio').value || null;
  state.filtro.fim    = document.getElementById('filtroDataFim').value    || null;
  renderDashboard();
  toast('Filtro aplicado');
}

function limparFiltro() {
  state.filtro = { inicio: null, fim: null };
  document.getElementById('filtroDataInicio').value = '';
  document.getElementById('filtroDataFim').value    = '';
  renderDashboard();
  toast('Filtro removido');
}

/* ================================================================
   SALDO INICIAL (formatação BR)
   ================================================================ */
function onSaldoInicialInput(el) {
  /* Permite digitação — apenas remove letras */
  el.value = el.value.replace(/[^0-9,.]/g,'');
}

function onSaldoInicialBlur(el) {
  const val = parseMoeda(el.value);
  el.value  = val > 0 ? formatMoeda(val) : '';
  state.saldoInicial = val;
  salvarState();
  renderDashboard();
}

/* ================================================================
   SALDO COMPOSTO — soma de todas as contas
   ================================================================ */
function entradaRecebida(m) {
  return m.tipo !== 'entrada' || m.recebido === true;
}

function calcularValoresAReceber(ym = null) {
  const mes = ym || getDashboardMes();
  const baseMovs = ym ? movsDoMes(ym) : movsFiltradas();
  const movs = baseMovs.filter(m => m.tipo === 'entrada' && m.recebido !== true)
    .reduce((s,m) => s + m.valor, 0);
  const provs = provisoesDoMes(mes, 'entrada').filter(p => !provisaoRecebidaNoMes(p, mes))
    .reduce((s,p) => s + p.valor, 0);
  return movs + provs;
}

function calcularTotalProvisoesRecebidasConta(contaId) {
  return (state.provisoes || []).filter(p => p.conta === contaId && p.tipo === 'entrada')
    .reduce((s,p) => s + Object.keys(p.recebimentos || {}).filter(ym => provisaoOcorreNoMes(p, ym)).length * p.valor, 0);
}

function calcularSaldoConta(contaId) {
  const c = state.contas.find(x => x.id === contaId);
  if (!c) return 0;
  const ent  = state.movimentacoes.filter(m => m.conta === contaId && m.tipo === 'entrada' && m.recebido === true).reduce((s,m) => s + m.valor, 0);
  const provEnt = calcularTotalProvisoesRecebidasConta(contaId);
  const dep  = state.transferencias.filter(t => t.para === contaId).reduce((s,t) => s + t.valor, 0);
  const sai  = state.movimentacoes.filter(m => m.conta === contaId && despesaComputavel(m)).reduce((s,m) => s + m.valor, 0);
  const deb  = state.transferencias.filter(t => t.de === contaId).reduce((s,t) => s + t.valor, 0);
  const resParaConta = (state.reserva.movimentos || []).filter(r => r.tipo === 'para_conta' && r.conta === contaId).reduce((s,r)=>s+r.valor,0);
  const resDaConta = (state.reserva.movimentos || []).filter(r => r.tipo === 'da_conta' && r.conta === contaId).reduce((s,r)=>s+r.valor,0);
  return c.saldo + ent + provEnt + dep + resParaConta - sai - deb - resDaConta;
}

function calcularSaldoComposto() {
  return state.contas.reduce((sum, c) => sum + calcularSaldoConta(c.id), 0);
}

function calcularSaldoReserva() {
  return (state.reserva.movimentos || []).reduce((s, m) => {
    if (m.tipo === 'entrada' || m.tipo === 'da_conta') return s + m.valor;
    return s - m.valor;
  }, 0);
}

/* ================================================================
   DASHBOARD
   ================================================================ */
function renderDashboard() {
  const ym = getDashboardMes();
  const movs = movsDoMes(ym);
  const resumoMes = calcularResumoMes(ym);
  const entradas = resumoMes.entradasLancadas;
  const despesas = resumoMes.despesasLancadas;
  const resultado = resumoMes.saldoLivre;
  const composto  = state.saldoInicial + calcularSaldoComposto();
  const reservaSaldo = calcularSaldoReserva();
  const valoresAReceber = calcularValoresAReceber(ym);


  const mesInput = document.getElementById('dashboardMesInput');
  if (mesInput && mesInput.value !== ym) mesInput.value = ym;
  setText('dashboardMesTitulo', nomeMesAno(ym));

  /* KPIs do mês selecionado */
  setText('kpiEntradas',  fmt(entradas));
  setText('kpiDespesas',  fmt(despesas));
  setText('kpiResultado', fmt(resultado));
  setText('kpiValoresReceber', fmt(valoresAReceber));
  setColor('kpiResultado', resultado >= 0 ? 'var(--green)' : 'var(--red)');
  atualizarAnaliseSaldo(ym, resumoMes);


  /* Reserva */
  setText('kpiReservas', fmt(reservaSaldo));
  const meta = state.config.metaReservas || 0;
  setText('metaReservas', fmt(meta));
  const pct = meta > 0 ? Math.min(100, Math.round(reservaSaldo / meta * 100)) : 0;
  const pFill = document.getElementById('progressReservas');
  if (pFill) pFill.style.width = pct + '%';
  setText('progressPct', pct + '%');

  /* Sidebar summary do mês selecionado */
  setText('sfEntradas',  fmt(entradas));
  setText('sfDespesas',  '- ' + fmt(despesas));
  setText('sfResultado', (resultado >= 0 ? '+' : '- ') + fmt(Math.abs(resultado)));
  setText('mesAtualLabel', nomeMesAno(ym).replace(' de ', '/'));

  /* Campo saldo inicial */
  const siEl = document.getElementById('saldoInicial');
  if (siEl && document.activeElement !== siEl) {
    siEl.value = state.saldoInicial > 0 ? formatMoeda(state.saldoInicial) : '';
  }

  renderGraficosDash(movs);
  renderUltimasMovs(movs);
  renderMiniCharts(movs);
  renderPlanejamentoMensal();
}

function atualizarAnaliseSaldo(ym, resumo) {
  const box = document.getElementById('saldoAnaliseBox');
  if (!box) return;
  const saldoBase = (state.saldoInicial || 0) + (resumo.entradasRecebidas || 0);
  const despesas = resumo.despesas || 0;
  const diferenca = saldoBase - despesas;
  const titulo = document.getElementById('saldoAnaliseTitulo');
  const texto = document.getElementById('saldoAnaliseTexto');
  box.classList.remove('positivo','negativo','neutro');
  if (diferenca < 0) {
    box.classList.add('negativo');
    if (titulo) titulo.textContent = 'Atenção saldo insuficiente';
    if (texto) texto.textContent = `No mês de ${nomeMesAno(ym)} faltam ${fmt(Math.abs(diferenca))} para cobrir as despesas pagas ou conciliadas.`;
  } else if (despesas > 0 || saldoBase > 0) {
    box.classList.add('positivo');
    if (titulo) titulo.textContent = 'Saldo acima das despesas';
    if (texto) texto.textContent = `No mês de ${nomeMesAno(ym)} sobram ${fmt(diferenca)} após receitas recebidas e despesas pagas ou conciliadas.`;
  } else {
    box.classList.add('neutro');
    if (titulo) titulo.textContent = 'Análise do saldo';
    if (texto) texto.textContent = 'Informe receitas recebidas e despesas pagas ou conciliadas para visualizar a diferença.';
  }
}

function renderPlanejamentoMensal() {
  const tbody = document.getElementById('tbodyPlanejamentoMensal');
  if (!tbody) return;
  const inicio = getDashboardMes();
  let saldoAcumulado = calcularSaldoComposto();
  const linhas = [];
  for (let i = 0; i < 12; i++) {
    const ym = addMeses(inicio, i);
    const r = calcularResumoMes(ym);
    saldoAcumulado += r.saldoLivre;
    linhas.push(`<tr>
      <td><strong>${nomeMesAno(ym)}</strong></td>
      <td class="val-positivo">${fmt(r.entradasRecebidas)}</td>
      <td class="val-alerta">${fmt(r.valoresAReceber)}</td>
      <td class="val-negativo">${fmt(r.despesas)}</td>
      <td class="${r.saldoLivre >= 0 ? 'val-positivo' : 'val-negativo'}">${r.saldoLivre >= 0 ? '+' : '-'} ${fmt(Math.abs(r.saldoLivre))}</td>
      <td class="${saldoAcumulado >= 0 ? 'val-positivo' : 'val-negativo'}">${fmt(saldoAcumulado)}</td>
    </tr>`);
  }
  tbody.innerHTML = linhas.join('');
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setColor(id, color) {
  const el = document.getElementById(id);
  if (el) el.style.color = color;
}

/* ─── Mini-charts KPI ─── */
function renderMiniCharts(movs) {
  const meses   = getUltimos6Meses();
  const entrMes = meses.map(m => movs.filter(x => x.tipo==='entrada' && x.data.slice(0,7)===m).reduce((s,x)=>s+x.valor,0));
  const despMes = meses.map(m => movs.filter(x => x.tipo==='despesa' && x.data.slice(0,7)===m).reduce((s,x)=>s+x.valor,0));
  const resMes  = entrMes.map((e,i) => e - despMes[i]);

  function mini(id, data, color, key) {
    destroyChart(key);
    const ctx = document.getElementById(id)?.getContext('2d');
    if (!ctx) return;
    charts[key] = new Chart(ctx, {
      type:'line',
      data:{ labels:meses, datasets:[{ data, borderColor:color, borderWidth:2, pointRadius:0, fill:true, backgroundColor:color+'22', tension:.4 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false},tooltip:{enabled:false}}, scales:{x:{display:false},y:{display:false}}, animation:{duration:300} }
    });
  }
  mini('chartMiniEntradas', entrMes, '#0f9d6e', 'miniE');
  mini('chartMiniDespesas', despMes, '#e53e56', 'miniD');
  mini('chartMiniResultado', resMes, '#2e75f0', 'miniR');

  /* Evolução mensal no dashboard */
  const allM  = state.movimentacoes;
  const eM    = meses.map(m => allM.filter(x=>x.tipo==='entrada'&&x.data.slice(0,7)===m).reduce((s,x)=>s+x.valor,0));
  const dM    = meses.map(m => allM.filter(x=>x.tipo==='despesa'&&x.data.slice(0,7)===m).reduce((s,x)=>s+x.valor,0));
  const lbls  = meses.map(m => { const [y,mo]=m.split('-'); const ns=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']; return ns[parseInt(mo)-1]+'/'+y.slice(2); });
  destroyChart('dashEv');
  const ctxEv = document.getElementById('chartEvolucaoDash')?.getContext('2d');
  if (ctxEv) {
    charts['dashEv'] = new Chart(ctxEv, {
      type:'bar',
      data:{ labels:lbls, datasets:[
        { label:'Entradas', data:eM, backgroundColor:'#0f9d6e88', borderColor:'#0f9d6e', borderWidth:1.5, borderRadius:4 },
        { label:'Despesas', data:dM, backgroundColor:'#e53e5688', borderColor:'#e53e56', borderWidth:1.5, borderRadius:4 }
      ]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'top'}}, scales:{y:{beginAtZero:true}}, animation:{duration:300} }
    });
  }
}

/* ─── Gráficos donut ─── */
function renderGraficosDash(movs) {
  buildDonut('chartDespesas','despesa', PALETTE_D, 'legendDespesas', 'donutDespesasTotal', 'donutD', movs);
  buildDonut('chartEntradas','entrada', PALETTE_E, 'legendEntradas', 'donutEntradasTotal', 'donutE', movs);
}

function buildDonut(canvasId, tipo, palette, legendId, totalId, key, movs) {
  const catMap = {};
  movs.filter(m => m.tipo === tipo).forEach(m => { catMap[m.categoria] = (catMap[m.categoria]||0) + m.valor; });
  const labels = Object.keys(catMap), values = Object.values(catMap);
  const total  = values.reduce((a,b)=>a+b,0);
  setText(totalId, fmt(total));
  destroyChart(key);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  charts[key] = new Chart(ctx, {
    type:'doughnut',
    data:{ labels, datasets:[{ data: values.length ? values : [1], backgroundColor: values.length ? palette.slice(0, labels.length) : ['#e4e7f0'], borderWidth:0 }] },
    options:{ cutout:'68%', plugins:{ legend:{display:false}, tooltip:{enabled:!!values.length} }, animation:{duration:500} }
  });
  const legEl = document.getElementById(legendId);
  if (!legEl) return;
  legEl.innerHTML = labels.length
    ? labels.map((l,i) => `<div class="legend-item"><div class="legend-dot" style="background:${palette[i%palette.length]}"></div><span class="legend-label">${l}</span><span class="legend-val">${fmt(values[i])}</span><span class="legend-pct">${total ? Math.round(values[i]/total*100) : 0}%</span></div>`).join('')
    : '<div style="color:var(--text-3);font-size:12px">Sem dados</div>';
}

/* ─── Últimas movimentações ─── */
function renderUltimasMovs(movs) {
  function buildItem(m) {
    const emoji = EMOJI[m.categoria] || (m.tipo==='entrada' ? '💰' : '💸');
    const bg    = m.tipo==='entrada' ? 'var(--green-bg)' : 'var(--red-bg)';
    return `<div class="mov-item">
      <div class="mov-icon" style="background:${bg}">${emoji}</div>
      <div class="mov-info">
        <div class="mov-desc">${m.descricao}</div>
        <div class="mov-meta">${m.categoria} · ${fmtData(m.data)}</div>
      </div>
      <div class="mov-val ${m.tipo==='entrada'?'positive':'negative'}">${(m.tipo==='entrada'||m.tipo==='da_conta')?'+':'-'} ${fmt(m.valor)}</div>
    </div>`;
  }
  const ult5D = [...movs].filter(m=>m.tipo==='despesa').sort((a,b)=>b.data.localeCompare(a.data)).slice(0,5);
  const ult5E = [...movs].filter(m=>m.tipo==='entrada').sort((a,b)=>b.data.localeCompare(a.data)).slice(0,5);
  const ldEl = document.getElementById('listUltimasDespesas');
  const leEl = document.getElementById('listUltimasEntradas');
  if (ldEl) ldEl.innerHTML = ult5D.length ? ult5D.map(buildItem).join('') : '<div class="empty-msg">Nenhuma despesa</div>';
  if (leEl) leEl.innerHTML = ult5E.length ? ult5E.map(buildItem).join('') : '<div class="empty-msg">Nenhuma entrada</div>';
}

/* ================================================================
   MODAL MOVIMENTAÇÃO
   ================================================================ */
function abrirModalMovimentacao(tipo, id) {
  if (!temPermissao(2)) { toast('Sem permissão para esta ação', 'error'); return; }
  preencherSelectCategorias('movCategoria', tipo || 'entrada');
  preencherSelectContas('movConta');

  if (id) {
    const m = state.movimentacoes.find(x => x.id === id);
    if (!m) return;
    document.getElementById('modalTitulo').textContent = 'Editar Movimentação';
    document.getElementById('movId').value       = m.id;
    document.getElementById('movTipo').value     = m.tipo;
    document.getElementById('movData').value     = m.data;
    document.getElementById('movDescricao').value= m.descricao;
    document.getElementById('movObs').value      = m.obs || '';
    document.getElementById('movValor').value    = formatMoeda(m.valor);
    if (document.getElementById('movRecorrencia')) document.getElementById('movRecorrencia').value = m.recorrencia || '';
    if (document.getElementById('movRepeticoes')) document.getElementById('movRepeticoes').value = m.repeticoes || '';
    preencherSelectCategorias('movCategoria', m.tipo);
    document.getElementById('movCategoria').value = m.categoria;
    document.getElementById('movConta').value     = m.conta;
    const chk = document.getElementById('movRecebido');
    if (chk) chk.checked = m.tipo === 'entrada' ? m.recebido === true : true;
    atualizarCampoRecebidoMov();
    document.getElementById('btnSalvarMov').textContent = 'Atualizar';
  } else {
    document.getElementById('modalTitulo').textContent = tipo === 'despesa' ? 'Nova Despesa' : 'Nova Entrada';
    document.getElementById('movId').value        = '';
    document.getElementById('movTipo').value      = tipo || 'entrada';
    document.getElementById('movData').value      = today();
    document.getElementById('movDescricao').value = '';
    document.getElementById('movObs').value       = '';
    document.getElementById('movValor').value     = '';
    if (document.getElementById('movRecorrencia')) document.getElementById('movRecorrencia').value = '';
    if (document.getElementById('movRepeticoes')) document.getElementById('movRepeticoes').value = '';
    const chk = document.getElementById('movRecebido');
    if (chk) chk.checked = tipo === 'entrada' ? false : true;
    atualizarCampoRecebidoMov();
    document.getElementById('btnSalvarMov').textContent = 'Salvar';
  }
  onTipoChange();
  document.getElementById('modalMovimentacao').classList.add('open');
}

function atualizarCampoRecebidoMov() {
  const tipo = document.getElementById('movTipo')?.value;
  const wrap = document.getElementById('movRecebidoWrap');
  if (wrap) wrap.style.display = tipo === 'entrada' ? 'flex' : 'none';
}

function onTipoChange() {
  const tipo = document.getElementById('movTipo').value;
  preencherSelectCategorias('movCategoria', tipo);
  const recWrap = document.getElementById('movRecorrenciaWrap');
  if (recWrap) recWrap.style.display = 'grid';
  document.getElementById('modalTitulo').textContent = tipo === 'despesa' ? 'Nova Despesa' : 'Nova Entrada';
  atualizarCampoRecebidoMov();
}

function dataComIncremento(dataBase, recorrencia, incremento) {
  const d = new Date(dataBase + 'T00:00:00');
  if (recorrencia === 'mensal' || recorrencia === 'fixa') d.setMonth(d.getMonth() + incremento);
  if (recorrencia === 'anual') d.setFullYear(d.getFullYear() + incremento);
  return d.toISOString().split('T')[0];
}

function salvarMovimentacao() {
  const id        = document.getElementById('movId').value;
  const tipo      = document.getElementById('movTipo').value;
  const data      = document.getElementById('movData').value;
  const descricao = document.getElementById('movDescricao').value.trim();
  const categoria = document.getElementById('movCategoria').value;
  const conta     = document.getElementById('movConta').value;
  const valor     = parseMoeda(document.getElementById('movValor').value);
  const obs       = document.getElementById('movObs').value.trim();
  const recorrencia = document.getElementById('movRecorrencia')?.value || '';
  const repeticoes  = document.getElementById('movRepeticoes')?.value || '';
  const recebido = tipo === 'entrada' ? document.getElementById('movRecebido')?.checked === true : false;
  const pago = tipo === 'despesa' ? false : false;

  if (!data || !descricao || !categoria || valor <= 0) {
    toast('Preencha todos os campos obrigatórios!', 'error'); return;
  }
  if (recorrencia && (!parseInt(repeticoes || '0') || parseInt(repeticoes || '0') <= 0)) {
    toast('Informe a quantidade de repetições para lançamentos recorrentes.', 'error'); return;
  }
  if (tipo === 'despesa') {
    const ym = data.slice(0,7);
    const resumo = calcularResumoMes(ym);
    const saldoDisponivel = (state.saldoInicial || 0) + (resumo.entradasRecebidas || 0) - (resumo.despesas || 0);
    if (valor > saldoDisponivel) {
      toast(`A despesa é maior que o saldo disponível. Diferença: ${fmt(valor - saldoDisponivel)}`, 'error');
    } else {
      toast(`Saldo suficiente. Sobra prevista após esta despesa: ${fmt(saldoDisponivel - valor)}`, 'info');
    }
  }

  const snap = snapState();

  if (id) {
    const idx = state.movimentacoes.findIndex(x => x.id === id);
    if (idx > -1) {
      pushUndo(`Editar ${tipo}`, snap);
      state.movimentacoes[idx] = { ...state.movimentacoes[idx], tipo, data, descricao, categoria, conta, valor, obs, recebido, pago, recorrencia, repeticoes };
      registrarAuditoria('Editar Movimentação', `${tipo} "${descricao}" ${fmt(valor)}`);
      toast('Movimentação atualizada ✓');
    }
  } else {
    pushUndo(`Adicionar ${tipo}`, snap);
    const totalRepeticoes = recorrencia ? Math.max(1, parseInt(repeticoes || '1') || 1) : 1;
    for (let i = 0; i < totalRepeticoes; i++) {
      state.movimentacoes.push({
        id: uid(), tipo, data: dataComIncremento(data, recorrencia, i), descricao, categoria, conta, valor, obs,
        recebido, pago, conciliado: false, usuario: currentUser?.nome || 'Sistema', _destaque: null,
        recorrencia, repeticoes, parcela: totalRepeticoes > 1 ? `${i+1}/${totalRepeticoes}` : ''
      });
    }
    registrarAuditoria('Nova Movimentação', `${tipo} "${descricao}" ${fmt(valor)}`);
    toast(`${tipo === 'entrada' ? 'Entrada' : 'Despesa'} registrada ✓`);
  }

  salvarState();
  fecharModais();
  renderDashboard();
  reRenderAtivo();
}

/* ─── Solicitar exclusão com motivo ─── */
function solicitarExclusao(id, tipo) {
  if (!temPermissao(2)) { toast('Sem permissão', 'error'); return; }
  document.getElementById('excId').value    = id;
  document.getElementById('excTipo').value  = tipo;
  document.getElementById('excMotivo').value= '';
  document.getElementById('modalExclusao').classList.add('open');
}

function confirmarExclusao() {
  const id     = document.getElementById('excId').value;
  const tipo   = document.getElementById('excTipo').value;
  const motivo = document.getElementById('excMotivo').value.trim() || 'Sem motivo informado';
  const snap   = snapState();
  const now    = new Date().toISOString();
  const quem   = currentUser?.nome || 'Sistema';

  if (tipo === 'movimentacao') {
    const m = state.movimentacoes.find(x => x.id === id);
    if (m) {
      pushUndo('Excluir movimentação', snap);
      state.lixeiraNova = true;
      state.lixeira.push({ ...m, itemTipo:'movimentacao', dataExclusao:now, excluidoPor:quem, motivo });
      state.movimentacoes = state.movimentacoes.filter(x => x.id !== id);
      registrarAuditoria('Excluir Movimentação', `"${m.descricao}" | Motivo: ${motivo}`);
      toast('Movimentação movida para lixeira');
    }
  } else if (tipo === 'transferencia') {
    const t = state.transferencias.find(x => x.id === id);
    if (t) {
      pushUndo('Excluir transferência', snap);
      state.lixeiraNova = true;
      state.lixeira.push({ ...t, itemTipo:'transferencia', dataExclusao:now, excluidoPor:quem, motivo });
      state.transferencias = state.transferencias.filter(x => x.id !== id);
      registrarAuditoria('Excluir Transferência', `"${t.descricao}" ${fmt(t.valor)} | Motivo: ${motivo}`);
      toast('Transferência movida para lixeira');
    }
  } else if (tipo === 'reserva') {
    const r = (state.reserva.movimentos||[]).find(x => x.id === id);
    if (r) {
      state.lixeiraNova = true;
      state.lixeira.push({ ...r, itemTipo:'reserva', dataExclusao:now, excluidoPor:quem, motivo });
      state.reserva.movimentos = state.reserva.movimentos.filter(x => x.id !== id);
      registrarAuditoria('Excluir Reserva', `"${r.descricao}" | Motivo: ${motivo}`);
      toast('Movimento de reserva removido');
    }
  } else if (tipo === 'provisao') {
    const p = state.provisoes.find(x => x.id === id);
    if (p) {
      state.lixeiraNova = true;
      state.lixeira.push({ ...p, itemTipo:'provisao', dataExclusao:now, excluidoPor:quem, motivo });
      state.provisoes = state.provisoes.filter(x => x.id !== id);
      registrarAuditoria('Excluir Provisão', `"${p.descricao}" | Motivo: ${motivo}`);
      toast('Provisão movida para lixeira');
    }
  }

  salvarState();
  fecharModais();
  atualizarBadgeLixeira();
  renderDashboard();
  reRenderAtivo();
}

/* ================================================================
   ENTRADAS
   ================================================================ */
function renderEntradas() {
  const search = (document.getElementById('searchEntradas')?.value || '').toLowerCase();
  const categ  = document.getElementById('filtroCategEntradas')?.value || '';
  preencherSelectCategorias('filtroCategEntradas', 'entrada', true, categ);

  let movs = state.movimentacoes.filter(m => m.tipo === 'entrada');
  if (state.filtro.inicio) movs = movs.filter(m => m.data >= state.filtro.inicio);
  if (state.filtro.fim)    movs = movs.filter(m => m.data <= state.filtro.fim);
  if (search) movs = movs.filter(m => m.descricao.toLowerCase().includes(search) || m.categoria.toLowerCase().includes(search));
  if (categ)  movs = movs.filter(m => m.categoria === categ);
  movs.sort((a,b) => b.data.localeCompare(a.data));

  const tbody = document.getElementById('tbodyEntradas');
  const empty = document.getElementById('emptyEntradas');
  if (!movs.length) { tbody.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';

  tbody.innerHTML = movs.map(m =>
    `<tr>
      <td>${fmtData(m.data)}</td>
      <td><strong>${m.descricao}</strong>${m.parcela ? `<br><small style="color:var(--text-3)">Parcela ${m.parcela}</small>` : ''}${m.obs ? `<br><small style="color:var(--text-3)">${m.obs}</small>` : ''}</td>
      <td><span class="tag-categ" style="background:var(--green-bg);color:var(--green)">${EMOJI[m.categoria]||'🏷'} ${m.categoria}</span></td>
      <td>${contaNome(m.conta)}</td>
      <td class="val-positivo">+ ${fmt(m.valor)}</td>
      <td style="font-size:11px;color:var(--text-3)">${m.usuario||'—'}</td>
      <td>
        <button class="action-btn" onclick="abrirModalMovimentacao('entrada','${m.id}')" title="Editar">✏️</button>
        <button class="action-btn" onclick="solicitarExclusao('${m.id}','movimentacao')" title="Excluir">🗑</button>
      </td>
    </tr>`
  ).join('');
}

/* ================================================================
   DESPESAS
   ================================================================ */
function renderDespesas() {
  const search = (document.getElementById('searchDespesas')?.value || '').toLowerCase();
  const categ  = document.getElementById('filtroCategDespesas')?.value || '';
  preencherSelectCategorias('filtroCategDespesas', 'despesa', true, categ);

  let movs = state.movimentacoes.filter(m => m.tipo === 'despesa');
  if (state.filtro.inicio) movs = movs.filter(m => m.data >= state.filtro.inicio);
  if (state.filtro.fim)    movs = movs.filter(m => m.data <= state.filtro.fim);
  if (search) movs = movs.filter(m => m.descricao.toLowerCase().includes(search) || m.categoria.toLowerCase().includes(search));
  if (categ)  movs = movs.filter(m => m.categoria === categ);
  movs.sort((a,b) => b.data.localeCompare(a.data));

  const tbody = document.getElementById('tbodyDespesas');
  const empty = document.getElementById('emptyDespesas');
  if (!movs.length) { tbody.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';

  tbody.innerHTML = movs.map(m =>
    `<tr>
      <td>${fmtData(m.data)}</td>
      <td><strong>${m.descricao}</strong>${m.parcela ? `<br><small style="color:var(--text-3)">Parcela ${m.parcela}</small>` : ''}${m.obs ? `<br><small style="color:var(--text-3)">${m.obs}</small>` : ''}</td>
      <td><span class="tag-categ" style="background:var(--red-bg);color:var(--red)">${EMOJI[m.categoria]||'🏷'} ${m.categoria}</span></td>
      <td>${contaNome(m.conta)}</td>
      <td class="val-negativo">- ${fmt(m.valor)}</td>
      <td><button class="btn-status-recebido ${(m.pago||m.conciliado)?'sim':'nao'}" onclick="toggleDespesaPaga('${m.id}')">${m.conciliado?'✓ Conciliada':(m.pago?'✓ Paga':'Marcar paga')}</button></td>
      <td style="font-size:11px;color:var(--text-3)">${m.usuario||'—'}</td>
      <td>
        <button class="action-btn" onclick="abrirModalMovimentacao('despesa','${m.id}')" title="Editar">✏️</button>
        <button class="action-btn" onclick="solicitarExclusao('${m.id}','movimentacao')" title="Excluir">🗑</button>
      </td>
    </tr>`
  ).join('');
}

function toggleDespesaPaga(id) {
  const m = state.movimentacoes.find(x => x.id === id && x.tipo === 'despesa');
  if (!m) return;
  m.pago = !m.pago;
  salvarState();
  renderDespesas();
  renderDashboard();
  registrarAuditoria('Despesa paga', `${m.pago ? 'Paga' : 'Pendente'} "${m.descricao}" ${fmt(m.valor)}`);
  toast(m.pago ? 'Despesa marcada como paga e considerada no resultado ✓' : 'Despesa marcada como pendente e removida do resultado', 'info');
}

/* ================================================================
   TRANSFERÊNCIAS
   ================================================================ */
function abrirModalTransferencia() {
  if (!temPermissao(3)) { toast('Sem permissão', 'error'); return; }
  preencherSelectContas('tfDe');
  preencherSelectContas('tfPara');
  document.getElementById('tfData').value      = today();
  document.getElementById('tfDescricao').value = '';
  document.getElementById('tfValor').value     = '';
  document.getElementById('modalTransferencia').classList.add('open');
}

function salvarTransferencia() {
  const data      = document.getElementById('tfData').value;
  const descricao = document.getElementById('tfDescricao').value.trim() || 'Transferência';
  const de        = document.getElementById('tfDe').value;
  const para      = document.getElementById('tfPara').value;
  const valor     = parseMoeda(document.getElementById('tfValor').value);

  if (!data || !de || !para || valor <= 0) { toast('Preencha todos os campos!', 'error'); return; }
  if (de === para) { toast('Conta de origem e destino devem ser diferentes!', 'error'); return; }

  /* Verifica saldo suficiente */
  const saldoOrig = calcularSaldoConta(de);
  if (saldoOrig < valor) {
    toast(`Saldo insuficiente em "${contaNome(de)}" (${fmt(saldoOrig)})`, 'error'); return;
  }

  const snap = snapState();
  pushUndo('Transferência entre contas', snap);

  state.transferencias.push({ id: uid(), data, descricao, de, para, valor, usuario: currentUser?.nome || 'Sistema' });
  salvarState();
  fecharModais();
  renderTransferencias();
  renderDashboard();
  registrarAuditoria('Transferência', `${contaNome(de)} → ${contaNome(para)} ${fmt(valor)}`);
  toast('Transferência registrada ✓');
}

function renderTransferencias() {
  const tbody = document.getElementById('tbodyTransferencias');
  const empty = document.getElementById('emptyTransferencias');
  const movs  = [...state.transferencias].sort((a,b) => b.data.localeCompare(a.data));
  if (!movs.length) { tbody.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';
  tbody.innerHTML = movs.map(t =>
    `<tr>
      <td>${fmtData(t.data)}</td>
      <td>${t.descricao}</td>
      <td>${contaNome(t.de)}</td>
      <td>${contaNome(t.para)}</td>
      <td style="font-family:'DM Mono',monospace;font-weight:700">${fmt(t.valor)}</td>
      <td style="font-size:11px;color:var(--text-3)">${t.usuario||'—'}</td>
      <td>
        <button class="action-btn" onclick="reverterTransferencia('${t.id}')" title="Reverter transferência">↩️</button>
        <button class="action-btn" onclick="solicitarExclusao('${t.id}','transferencia')" title="Excluir">🗑</button>
      </td>
    </tr>`
  ).join('');
}

function reverterTransferencia(id) {
  if (!window.confirm('Reverter esta transferência? Os saldos serão restaurados.')) return;
  const t = state.transferencias.find(x => x.id === id);
  if (!t) return;
  const snap = snapState();
  pushUndo('Reverter transferência', snap);
  state.lixeiraNova = true;
      state.lixeira.push({ ...t, itemTipo:'transferencia', dataExclusao: new Date().toISOString(), excluidoPor: currentUser?.nome, motivo:'Transferência revertida pelo usuário' });
  state.transferencias = state.transferencias.filter(x => x.id !== id);
  salvarState();
  renderTransferencias();
  renderDashboard();
  atualizarBadgeLixeira();
  registrarAuditoria('Reverter Transferência', `"${t.descricao}" ${fmt(t.valor)}`);
  toast('Transferência revertida ✓');
}

/* ================================================================
   RESERVA FINANCEIRA
   ================================================================ */
function abrirModalReserva() {
  document.getElementById('resData').value      = today();
  document.getElementById('resDescricao').value = '';
  document.getElementById('resValor').value     = '';
  document.getElementById('resTipo').value      = 'entrada';
  preencherSelectContas('resConta');
  onReservaTipoChange();
  document.getElementById('modalReserva').classList.add('open');
}

function onReservaTipoChange() {
  const tipo = document.getElementById('resTipo')?.value;
  const wrap = document.getElementById('resContaWrap');
  if (wrap) wrap.style.display = (tipo === 'para_conta' || tipo === 'da_conta') ? 'block' : 'none';
}

function salvarMetaReserva() {
  const raw = document.getElementById('reservaMetaInput').value;
  const val = parseMoeda(raw);
  state.reserva.meta = val;
  state.config.metaReservas = val;
  salvarState();
  renderReserva();
  renderDashboard();
  registrarAuditoria('Meta Reserva', `Nova meta: ${fmt(val)}`);
  toast('Meta de reserva salva ✓');
}

function salvarReserva() {
  const tipo      = document.getElementById('resTipo').value;
  const data      = document.getElementById('resData').value;
  const descricao = document.getElementById('resDescricao').value.trim();
  const valor     = parseMoeda(document.getElementById('resValor').value);
  const conta     = document.getElementById('resConta')?.value || null;

  if (!data || !descricao || valor <= 0) { toast('Preencha todos os campos!', 'error'); return; }
  if ((tipo === 'saida' || tipo === 'para_conta') && calcularSaldoReserva() < valor) {
    toast('Saldo insuficiente na reserva!', 'error'); return;
  }
  if (tipo === 'da_conta' && calcularSaldoConta(conta) < valor) {
    toast('Saldo insuficiente na conta selecionada!', 'error'); return;
  }

  const snap = snapState();
  pushUndo(`${tipo==='entrada'?'Depósito':'Retirada'} reserva`, snap);

  if (!state.reserva.movimentos) state.reserva.movimentos = [];
  state.reserva.movimentos.push({ id: uid(), tipo, data, descricao, valor, conta, usuario: currentUser?.nome || 'Sistema' });
  salvarState();
  fecharModais();
  renderReserva();
  renderDashboard();
  registrarAuditoria('Reserva', `${tipo} "${descricao}" ${fmt(valor)} ${conta ? 'Conta: ' + contaNome(conta) : ''}`);
  toast('Movimento de reserva salvo ✓');
}

function renderReserva() {
  const saldo  = calcularSaldoReserva();
  const meta   = state.reserva.meta || 0;
  const pct    = meta > 0 ? Math.min(100, Math.round(saldo / meta * 100)) : 0;
  const falta  = Math.max(0, meta - saldo);

  setText('reservaSaldo',   fmt(saldo));
  setText('reservaMeta',    fmt(meta));
  setText('reservaProgPct', pct + '%');
  setText('reservaFalta',   fmt(falta));

  const bar = document.getElementById('reservaProgressBar');
  if (bar) bar.style.width = pct + '%';

  const metaInput = document.getElementById('reservaMetaInput');
  if (metaInput && document.activeElement !== metaInput) {
    metaInput.value = meta > 0 ? formatMoeda(meta) : '';
  }

  const movs  = [...(state.reserva.movimentos||[])].sort((a,b) => b.data.localeCompare(a.data));
  const tbody = document.getElementById('tbodyReserva');
  const empty = document.getElementById('emptyReserva');
  if (!movs.length) { tbody.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';

  tbody.innerHTML = movs.map(m =>
    `<tr>
      <td>${fmtData(m.data)}</td>
      <td>${m.descricao}</td>
      <td><span class="tag-categ" style="background:${m.tipo==='entrada'?'var(--green-bg)':'var(--red-bg)'};color:${m.tipo==='entrada'?'var(--green)':'var(--red)'}">${m.tipo==='entrada'?'↑ Depósito':m.tipo==='para_conta'?'→ Para conta':m.tipo==='da_conta'?'← Para reserva':'↓ Retirada'}</span></td>
      <td class="${m.tipo==='entrada'?'val-positivo':'val-negativo'}">${(m.tipo==='entrada'||m.tipo==='da_conta')?'+':'-'} ${fmt(m.valor)}</td>
      <td style="font-size:11px;color:var(--text-3)">${m.usuario||'—'}</td>
      <td><button class="action-btn" onclick="solicitarExclusao('${m.id}','reserva')" title="Excluir">🗑</button></td>
    </tr>`
  ).join('');
}

/* ================================================================
   CONCILIAÇÃO
   ================================================================ */
function toggleConciliado(id) {
  const m = state.movimentacoes.find(x => x.id === id);
  if (!m) return;
  m.conciliado = !m.conciliado;
  if (m.tipo === 'despesa' && m.conciliado) m.pago = true;
  salvarState();
  registrarAuditoria('Conciliação', `${m.conciliado?'Conciliou':'Desconciliou'} "${m.descricao}"`);
  renderConciliacao();
  renderDashboard();
  /* Atualiza outras páginas se abertas */
  if (document.getElementById('page-entradas').classList.contains('active')) renderEntradas();
  if (document.getElementById('page-despesas').classList.contains('active')) renderDespesas();
}

function conciliarTodos() {
  if (!temPermissao(3)) { toast('Sem permissão', 'error'); return; }
  const contaConc = document.getElementById('filtroConcConta')?.value || '';
  const pendentes = state.movimentacoes.filter(m => !m.conciliado && (!contaConc || m.conta === contaConc));
  pendentes.forEach(m => { m.conciliado = true; });
  salvarState();
  renderConciliacao();
  renderDashboard();
  registrarAuditoria('Conciliação em Lote', `${pendentes.length} registros conciliados`);
  toast(`${pendentes.length} registros conciliados ✓`);
}

/* ─── Importação OFX ─── */
function importarArquivoConc(event) {
  const file = event.target.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'ofx') {
    const reader = new FileReader();
    reader.onload = e => processarOFX(e.target.result, file.name);
    reader.readAsText(file, 'ISO-8859-1');
  } else if (ext === 'xlsx' || ext === 'xls') {
    const reader = new FileReader();
    reader.onload = e => processarXLSX(e.target.result, file.name);
    reader.readAsArrayBuffer(file);
  } else {
    toast('Formato não suportado. Use OFX, XLSX ou XLS.', 'error');
  }
  event.target.value = '';
}

function processarOFX(conteudo, nomeArquivo) {
  const transacoes = [];
  const regex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match;
  while ((match = regex.exec(conteudo)) !== null) {
    const bloco  = match[1];
    const getTag = tag => { const m = bloco.match(new RegExp(`<${tag}>([^\n\r<]+)`)); return m ? m[1].trim() : ''; };
    const dtStr  = getTag('DTPOSTED');
    let data = '';
    if (dtStr.length >= 8) data = `${dtStr.slice(0,4)}-${dtStr.slice(4,6)}-${dtStr.slice(6,8)}`;
    const valor = parseFloat((getTag('TRNAMT')||'0').replace(',','.')) || 0;
    const memo  = getTag('MEMO') || getTag('NAME') || 'Importado OFX';
    transacoes.push({ data, valor: Math.abs(valor), tipo: valor >= 0 ? 'entrada' : 'despesa', memo });
  }
  validarImportados(transacoes, nomeArquivo);
}

function processarXLSX(buffer, nomeArquivo) {
  try {
    if (typeof XLSX === 'undefined') { toast('Biblioteca XLSX não carregada.', 'error'); return; }
    const wb   = XLSX.read(buffer, { type:'array' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
    const transacoes = [];
    for (let i = 1; i < rows.length; i++) {
      const row   = rows[i];
      const data  = String(row[0]||'').trim();
      const memo  = String(row[1]||'Importado').trim();
      const valor = parseFloat(String(row[2]||'0').replace(',','.')) || 0;
      if (data && Math.abs(valor) > 0) {
        transacoes.push({ data, valor: Math.abs(valor), tipo: valor >= 0 ? 'entrada' : 'despesa', memo });
      }
    }
    validarImportados(transacoes, nomeArquivo);
  } catch(e) {
    toast('Erro ao processar arquivo: ' + e.message, 'error');
  }
}

function validarImportados(transacoes, nomeArquivo) {
  let coincidentes = 0, divergentes = 0, novos = 0;
  const contaConc = document.getElementById('filtroConcConta')?.value || '';

  /* Resetar destaques anteriores */
  state.movimentacoes.forEach(m => { m._destaque = null; });

  state.conciliacaoArquivo = [];

  transacoes.forEach(t => {
    const itemArquivo = { ...t, id: uid(), conta: contaConc, status: 'novo', matchId: null };
    /* Buscar correspondência exata */
    const exato = state.movimentacoes.find(m =>
      (!contaConc || m.conta === contaConc) && m.data === t.data && Math.abs(m.valor - t.valor) < 0.01 && m.tipo === t.tipo
    );
    if (exato) {
      exato._destaque = 'match';
      itemArquivo.status = 'coincide';
      itemArquivo.matchId = exato.id;
      state.conciliacaoArquivo.push(itemArquivo);
      coincidentes++;
      return;
    }
    /* Buscar divergência (mesmo dia, tipo igual, valor diferente) */
    const proximo = state.movimentacoes.find(m => (!contaConc || m.conta === contaConc) && m.data === t.data && m.tipo === t.tipo && !m._destaque);
    if (proximo) {
      proximo._destaque = 'diverge';
      itemArquivo.status = 'diverge';
      itemArquivo.matchId = proximo.id;
      state.conciliacaoArquivo.push(itemArquivo);
      divergentes++;
    } else {
      state.conciliacaoArquivo.push(itemArquivo);
      novos++;
    }
  });

  salvarState();
  renderConciliacao();
  registrarAuditoria('Importação', `"${nomeArquivo}": ${transacoes.length} reg. | ${coincidentes} coincidem | ${divergentes} divergem | ${novos} novos`);
  toast(`Importação: ${transacoes.length} registros. ✓${coincidentes} coincidem · ⚠${divergentes} divergem · +${novos} novos`, 'info');
}


function excluirItemArquivoConc(id) {
  const item = (state.conciliacaoArquivo || []).find(i => i.id === id);
  if (item) {
    state.lixeiraNova = true;
      state.lixeira.push({
      ...item,
      id: uid(),
      itemTipo: 'conciliacao_arquivo',
      descricao: item.memo || 'Item importado da conciliação',
      dataExclusao: new Date().toISOString(),
      excluidoPor: currentUser?.nome || 'Sistema',
      motivo: 'Item importado removido da conciliação bancária'
    });
  }
  state.conciliacaoArquivo = (state.conciliacaoArquivo || []).filter(i => i.id !== id);
  salvarState();
  atualizarBadgeLixeira();
  renderConciliacao();
  toast('Lançamento importado removido e enviado para a lixeira ✓');
}

function limparArquivoConc() {
  if (!(state.conciliacaoArquivo || []).length) { toast('Não há arquivo importado para remover', 'info'); return; }
  if (!confirm('Remover todos os itens do arquivo importado desta tela? Os lançamentos do sistema serão preservados.')) return;
  const quem = currentUser?.nome || 'Sistema';
  (state.conciliacaoArquivo || []).forEach(item => state.lixeira.push({
    ...item, id: uid(), itemTipo:'conciliacao_arquivo', descricao:item.memo || 'Item importado da conciliação',
    dataExclusao:new Date().toISOString(), excluidoPor:quem, motivo:'Arquivo importado removido da conciliação bancária'
  }));
  state.lixeiraNova = true;
  state.conciliacaoArquivo = [];
  state.movimentacoes.forEach(m => { m._destaque = null; });
  salvarState();
  renderConciliacao();
  toast('Arquivo importado removido sem alterar registros ✓');
}

function conciliarItemArquivo(id) {
  const item = (state.conciliacaoArquivo || []).find(i => i.id === id);
  if (!item || !item.matchId) { toast('Nenhum lançamento correspondente encontrado', 'error'); return; }
  const mov = state.movimentacoes.find(m => m.id === item.matchId);
  if (!mov) { toast('Lançamento não encontrado no sistema', 'error'); return; }
  mov.conciliado = true;
  item.status = 'coincide';
  salvarState();
  renderConciliacao();
  renderDashboard();
  toast('Lançamento conciliado manualmente ✓');
}

function criarMovimentacaoDoArquivo(id) {
  const item = (state.conciliacaoArquivo || []).find(i => i.id === id);
  if (!item) return;
  const contaConc = document.getElementById('filtroConcConta')?.value || state.contas[0]?.id || '';
  const tipo = item.tipo || 'despesa';
  state.movimentacoes.push({
    id: uid(), tipo, data: item.data || `${getConciliacaoMes()}-01`, descricao: item.memo || 'Importado', categoria: tipo === 'entrada' ? 'Outros (Entrada)' : 'Outros (Despesa)',
    conta: contaConc, valor: item.valor, obs: 'Criado a partir da conciliação', recebido: tipo === 'entrada', conciliado: true, usuario: currentUser?.nome || 'Sistema', _destaque: 'match'
  });
  item.status = 'coincide';
  item.matchId = state.movimentacoes[state.movimentacoes.length - 1].id;
  salvarState();
  renderConciliacao();
  renderDashboard();
  toast('Movimentação criada e conciliada ✓');
}

function renderConciliacao() {
  preencherSelectContas('filtroConcConta');
  const filtro = document.getElementById('filtroConcStatus')?.value || '';
  const contaConc = document.getElementById('filtroConcConta')?.value || '';
  const ymConc = getConciliacaoMes();
  const mesInputConc = document.getElementById('conciliacaoMesInput');
  if (mesInputConc && mesInputConc.value !== ymConc) mesInputConc.value = ymConc;

  let movs = [...state.movimentacoes].filter(m => m.data && m.data.slice(0,7) === ymConc);
  if (contaConc) movs = movs.filter(m => m.conta === contaConc);
  if (state.filtro.inicio) movs = movs.filter(m => m.data >= state.filtro.inicio);
  if (state.filtro.fim)    movs = movs.filter(m => m.data <= state.filtro.fim);
  if (filtro === 'pendente')    movs = movs.filter(m => !m.conciliado);
  if (filtro === 'conciliado')  movs = movs.filter(m =>  m.conciliado);
  movs.sort((a,b) => b.data.localeCompare(a.data));

  const total = movs.length;
  const conc  = movs.filter(m => m.conciliado).length;
  const pend  = total - conc;
  const pct   = total > 0 ? Math.round(conc / total * 100) : 0;

  setText('concTotalLanc', total);
  setText('concTotalConc', conc);
  setText('concTotalPend', pend);
  setText('concTotalPct',  pct + '%');

  const boxArquivo = document.getElementById('boxArquivoConc');
  const tbodyArquivo = document.getElementById('tbodyArquivoConc');
  const itensArquivo = state.conciliacaoArquivo || [];
  if (boxArquivo && tbodyArquivo) {
    boxArquivo.style.display = itensArquivo.length ? 'block' : 'none';
    tbodyArquivo.innerHTML = itensArquivo.map(t => {
      const statusTxt = t.status === 'coincide' ? '✓ Coincide' : t.status === 'diverge' ? '⚠ Diverge' : '+ Não encontrado no sistema';
      const statusColor = t.status === 'coincide' ? 'var(--green)' : t.status === 'diverge' ? 'var(--red)' : 'var(--blue)';
      return `<tr>
        <td>${fmtData(t.data)}</td>
        <td>${t.memo || 'Importado'}</td>
        <td>${t.tipo === 'entrada' ? 'Entrada' : 'Despesa'}</td>
        <td class="${t.tipo==='entrada'?'val-positivo':'val-negativo'}">${t.tipo==='entrada'?'+':'-'} ${fmt(t.valor)}</td>
        <td><span style="color:${statusColor};font-weight:700;font-size:12px">${statusTxt}</span></td>
        <td style="display:flex;gap:6px;flex-wrap:wrap">
          ${t.matchId ? `<button class="btn-primary" style="padding:3px 8px;font-size:11px" onclick="conciliarItemArquivo('${t.id}')">Conciliar</button>` : ''}
          <button class="btn-secondary" style="padding:3px 8px;font-size:11px" onclick="criarMovimentacaoDoArquivo('${t.id}')">Lançar</button>
          <button class="btn-danger" style="padding:3px 8px;font-size:11px" onclick="excluirItemArquivoConc('${t.id}')">Excluir</button>
        </td>
      </tr>`;
    }).join('');
  }

  const tbody = document.getElementById('tbodyConciliacao');
  const empty = document.getElementById('emptyConciliacao');
  if (!movs.length) { tbody.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';

  tbody.innerHTML = movs.map(m => {
    let destTd = '—', rowClass = '';
    if (m._destaque === 'match') {
      destTd   = `<span style="background:var(--green-bg);color:var(--green);font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600">✓ Coincide</span>`;
      rowClass = 'row-highlight-match';
    } else if (m._destaque === 'diverge') {
      destTd   = `<span style="background:var(--red-bg);color:var(--red);font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600">⚠ Diverge</span>`;
      rowClass = 'row-highlight-diverge';
    }
    return `<tr class="${rowClass}">
      <td>${fmtData(m.data)}</td>
      <td>${m.descricao}</td>
      <td><span class="tag-categ" style="background:${m.tipo==='entrada'?'var(--green-bg)':'var(--red-bg)'};color:${m.tipo==='entrada'?'var(--green)':'var(--red)'}">${m.tipo==='entrada'?'↑ Entrada':'↓ Despesa'}</span></td>
      <td>${m.categoria}</td>
      <td>${contaNome(m.conta)}</td>
      <td class="${m.tipo==='entrada'?'val-positivo':'val-negativo'}">${(m.tipo==='entrada'||m.tipo==='da_conta')?'+':'-'} ${fmt(m.valor)}</td>
      <td>${destTd}</td>
      <td><span class="badge-conc ${m.conciliado?'sim':'nao'}">${m.conciliado?'✓ Conciliado':'⏳ Pendente'}</span></td>
      <td style="font-size:11px;color:var(--text-3)">${m.usuario||'—'}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn-primary" style="padding:3px 10px;font-size:11px;background:${m.conciliado?'var(--red-bg)':'var(--green)'};color:${m.conciliado?'var(--red)':'#fff'}" onclick="toggleConciliado('${m.id}')">
          ${m.conciliado?'Desconciliar':'Conciliar'}
        </button>
        <button class="btn-danger btn-inline-danger" style="padding:3px 10px;font-size:11px" onclick="solicitarExclusao('${m.id}','movimentacao')">Excluir</button>
      </td>
    </tr>`;
  }).join('');
}

/* ================================================================
   PROVISÃO MENSAL
   ================================================================ */
function abrirModalProvisao(id) {
  preencherSelectCategorias('provCategoria', 'entrada');
  preencherSelectContas('provConta');
  const ym = getProvisaoMes();
  document.getElementById('provId').value = id || '';
  if (id) {
    const p = state.provisoes.find(x => x.id === id);
    if (!p) return;
    document.getElementById('provTipo').value     = p.tipo;
    document.getElementById('provDia').value      = p.dia;
    document.getElementById('provDescricao').value= p.descricao;
    document.getElementById('provValor').value    = formatMoeda(p.valor);
    preencherSelectCategorias('provCategoria', p.tipo);
    document.getElementById('provCategoria').value = p.categoria;
    document.getElementById('provConta').value = p.conta || state.contas[0]?.id || '';
    document.getElementById('provInicio').value = p.inicio || ym;
    document.getElementById('provRecorrencia').value = p.recorrencia || 'mensal';
    document.getElementById('provRepeticoes').value = p.repeticoes || '';
    document.getElementById('provRecebido').checked = provisaoRecebidaNoMes(p, ym);
  } else {
    document.getElementById('provTipo').value     = 'entrada';
    document.getElementById('provDia').value      = '';
    document.getElementById('provDescricao').value= '';
    document.getElementById('provValor').value    = '';
    document.getElementById('provConta').value    = state.contas[0]?.id || '';
    document.getElementById('provInicio').value = ym;
    document.getElementById('provRecorrencia').value = 'mensal';
    document.getElementById('provRepeticoes').value = '';
    document.getElementById('provRecebido').checked = false;
  }
  document.getElementById('modalProvisao').classList.add('open');
}

function salvarProvisao() {
  const id        = document.getElementById('provId').value;
  const tipo      = document.getElementById('provTipo').value;
  const dia       = parseInt(document.getElementById('provDia').value) || 1;
  const descricao = document.getElementById('provDescricao').value.trim();
  const categoria = document.getElementById('provCategoria').value;
  const valor     = parseMoeda(document.getElementById('provValor').value);
  const conta     = document.getElementById('provConta')?.value || state.contas[0]?.id || '';
  const inicio    = document.getElementById('provInicio')?.value || getDashboardMes();
  const recorrencia = document.getElementById('provRecorrencia')?.value || 'mensal';
  const repeticoes = document.getElementById('provRepeticoes')?.value || '';
  const recebidoMes = document.getElementById('provRecebido')?.checked === true;
  const ym = getProvisaoMes();

  if (!descricao || valor <= 0) { toast('Preencha todos os campos!', 'error'); return; }

  if (id) {
    const idx = state.provisoes.findIndex(x => x.id === id);
    if (idx > -1) {
      const recebimentos = state.provisoes[idx].recebimentos || {};
      if (recebidoMes) recebimentos[ym] = true; else delete recebimentos[ym];
      state.provisoes[idx] = { ...state.provisoes[idx], tipo, dia, descricao, categoria, valor, conta, inicio, recorrencia, repeticoes, recebimentos, recebido:false };
    }
  } else {
    const recebimentos = {};
    if (recebidoMes) recebimentos[ym] = true;
    state.provisoes.push({ id: uid(), tipo, dia, descricao, categoria, valor, conta, inicio, recorrencia, repeticoes, recebimentos, recebido:false });
  }
  salvarState();
  fecharModais();
  renderProvisao();
  renderDashboard();
  registrarAuditoria('Provisão', `${tipo} "${descricao}" ${fmt(valor)}`);
  toast(recebidoMes ? 'Provisão salva e marcada como recebida no mês ✓' : 'Provisão salva como valor a receber ✓');
}

function toggleProvisao(id) {
  toast('A opção Ativo foi removida. Para retirar a provisão, use excluir.', 'info');
}

function toggleProvisaoRecebido(id, ym = null) {
  const p = state.provisoes.find(x => x.id === id);
  const mes = ym || getProvisaoMes();
  if (p) {
    if (!p.recebimentos) p.recebimentos = {};
    if (p.recebimentos[mes]) delete p.recebimentos[mes]; else p.recebimentos[mes] = true;
    p.recebido = false;
    salvarState();
    renderProvisao();
    renderDashboard();
    registrarAuditoria('Recebimento de provisão', `${p.recebimentos[mes]?'Recebido':'A receber'} "${p.descricao}" em ${nomeMesAno(mes)} ${fmt(p.valor)}`);
    toast(p.recebimentos[mes] ? 'Recebido: saiu de Valores a Receber e entrou na conta selecionada ✓' : 'Marcado como a receber: saiu da conta e voltou para Valores a Receber', 'info');
  }
}

function renderProvisao() {
  const ym = getProvisaoMes();
  const provMesInput = document.getElementById('provisaoMesInput');
  if (provMesInput && provMesInput.value !== ym) provMesInput.value = ym;
  setText('provisaoMesTitulo', nomeMesAno(ym));
  const ativasMes = provisoesDoMes(ym);
  const totalE  = ativasMes.filter(p => p.tipo==='entrada' && provisaoRecebidaNoMes(p, ym)).reduce((s,p)=>s+p.valor,0);
  const totalD  = ativasMes.filter(p => p.tipo==='despesa').reduce((s,p)=>s+p.valor,0);
  setText('provTotalEntradas', fmt(totalE));
  setText('provTotalDespesas', fmt(totalD));
  setText('provSaldo', fmt(totalE - totalD));
  setText('provTotal', ativasMes.length);

  const tbody = document.getElementById('tbodyProvisao');
  const empty = document.getElementById('emptyProvisao');
  const lista = [...state.provisoes].filter(p => provisaoOcorreNoMes(p, ym));
  if (!lista.length) { tbody.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';

  tbody.innerHTML = lista.sort((a,b)=>a.dia-b.dia).map(p => {
    const recebido = provisaoRecebidaNoMes(p, ym);
    const recLabel = p.recorrencia === 'anual' ? 'Anual' : p.recorrencia === 'fixa' ? 'Fixa' : 'Mensal';
    return `<tr>
      <td><strong>${p.descricao}</strong><div style="font-size:11px;color:var(--text-3)">${nomeMesAno(ym)}</div></td>
      <td><span class="tag-categ" style="background:${p.tipo==='entrada'?'var(--green-bg)':'var(--red-bg)'};color:${p.tipo==='entrada'?'var(--green)':'var(--red)'}">${p.tipo==='entrada'?'↑ Receita':'↓ Despesa'}</span></td>
      <td>${p.categoria}</td>
      <td>${contaNome(p.conta)}</td>
      <td>Dia ${p.dia}</td>
      <td>${recLabel}</td>
      <td>${parcelaProvisao(p, ym)}</td>
      <td class="${p.tipo==='entrada'?'val-positivo':'val-negativo'}">${p.tipo==='entrada'?'+':'-'} ${fmt(p.valor)}</td>
      <td><button class="btn-status-recebido ${recebido?'sim':'nao'}" onclick="toggleProvisaoRecebido('${p.id}','${ym}')">${recebido?'✓ Recebido':'Marcar recebido'}</button></td>
      <td>
        <button class="action-btn" onclick="abrirModalProvisao('${p.id}')" title="Editar">✏️</button>
        <button class="action-btn" onclick="solicitarExclusao('${p.id}','provisao')" title="Excluir">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

/* ================================================================
   RELATÓRIOS
   ================================================================ */
function renderRelatorios() {
  const search = (document.getElementById('searchRelatorio')?.value || '').toLowerCase();
  const tipo   = document.getElementById('filtroTipoRel')?.value || '';
  const categ  = document.getElementById('filtroCategRel')?.value || '';
  preencherSelectCategorias('filtroCategRel', tipo || null, true, categ);

  let movs = [...state.movimentacoes];
  if (state.filtro.inicio) movs = movs.filter(m => m.data >= state.filtro.inicio);
  if (state.filtro.fim)    movs = movs.filter(m => m.data <= state.filtro.fim);
  if (tipo)   movs = movs.filter(m => m.tipo === tipo);
  if (categ)  movs = movs.filter(m => m.categoria === categ);
  if (search) movs = movs.filter(m => m.descricao.toLowerCase().includes(search) || m.categoria.toLowerCase().includes(search));
  movs.sort((a,b) => b.data.localeCompare(a.data));

  const totalE = movs.filter(m=>m.tipo==='entrada').reduce((s,m)=>s+m.valor,0);
  const totalD = movs.filter(m=>m.tipo==='despesa').reduce((s,m)=>s+m.valor,0);
  const res    = totalE - totalD;

  setText('relKpiEntradas',  fmt(totalE));
  setText('relKpiDespesas',  fmt(totalD));
  setText('relKpiResultado', fmt(res));
  setColor('relKpiResultado', res >= 0 ? 'var(--green)' : 'var(--red)');
  setText('relKpiTotal', movs.length);

  const tbody = document.getElementById('tbodyRelatorio');
  const empty = document.getElementById('emptyRelatorio');
  if (!movs.length) { tbody.innerHTML = ''; empty.style.display = 'flex'; }
  else {
    empty.style.display = 'none';
    tbody.innerHTML = movs.map(m =>
      `<tr>
        <td>${fmtData(m.data)}</td>
        <td>${m.descricao}</td>
        <td><span class="tag-categ" style="background:${m.tipo==='entrada'?'var(--green-bg)':'var(--red-bg)'};color:${m.tipo==='entrada'?'var(--green)':'var(--red)'}">${m.tipo==='entrada'?'↑':'↓'} ${m.tipo}</span></td>
        <td>${m.categoria}</td>
        <td>${contaNome(m.conta)}</td>
        <td class="${m.tipo==='entrada'?'val-positivo':'val-negativo'}">${(m.tipo==='entrada'||m.tipo==='da_conta')?'+':'-'} ${fmt(m.valor)}</td>
        <td style="font-size:11px;color:var(--text-3)">${m.usuario||'—'}</td>
      </tr>`
    ).join('');
  }

  /* Gráfico Evolução Mensal */
  const meses6 = getUltimos6Meses();
  const allM   = state.movimentacoes;
  const eM     = meses6.map(m => allM.filter(x=>x.tipo==='entrada'&&x.data.slice(0,7)===m).reduce((s,x)=>s+x.valor,0));
  const dM     = meses6.map(m => allM.filter(x=>x.tipo==='despesa'&&x.data.slice(0,7)===m).reduce((s,x)=>s+x.valor,0));
  const lbls   = meses6.map(m => { const [y,mo]=m.split('-'); const ns=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']; return ns[parseInt(mo)-1]+'/'+y.slice(2); });

  destroyChart('relEv');
  const ctxEv = document.getElementById('chartEvolucao')?.getContext('2d');
  if (ctxEv) {
    charts['relEv'] = new Chart(ctxEv, {
      type:'bar',
      data:{ labels:lbls, datasets:[
        { label:'Entradas', data:eM, backgroundColor:'#0f9d6e88', borderColor:'#0f9d6e', borderWidth:1.5, borderRadius:4 },
        { label:'Despesas', data:dM, backgroundColor:'#e53e5688', borderColor:'#e53e56', borderWidth:1.5, borderRadius:4 }
      ]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'top'}}, scales:{y:{beginAtZero:true}}, animation:{duration:300} }
    });
  }

  /* Gráfico Balanço por Categoria */
  const categMap = {};
  allM.forEach(m => { if (!categMap[m.categoria]) categMap[m.categoria]=0; categMap[m.categoria]+=(m.tipo==='entrada'?m.valor:-m.valor); });
  const cLabels = Object.keys(categMap), cVals = Object.values(categMap);

  destroyChart('relBal');
  const ctxBal = document.getElementById('chartBalanco')?.getContext('2d');
  if (ctxBal) {
    charts['relBal'] = new Chart(ctxBal, {
      type:'bar',
      data:{ labels:cLabels, datasets:[{ label:'Balanço', data:cVals, backgroundColor:cVals.map(v=>v>=0?'#0f9d6e88':'#e53e5688'), borderColor:cVals.map(v=>v>=0?'#0f9d6e':'#e53e56'), borderWidth:1.5, borderRadius:4 }] },
      options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true}}, animation:{duration:300} }
    });
  }

  /* Info de impressão */
  const pSN = document.getElementById('printSysName');
  if (pSN) pSN.textContent = state.config.nomeSistema || 'FinanSys';
  const pP = document.getElementById('printPeriodo');
  if (pP) {
    pP.textContent = state.filtro.inicio && state.filtro.fim
      ? `Período: ${fmtData(state.filtro.inicio)} a ${fmtData(state.filtro.fim)}`
      : `Gerado em: ${new Date().toLocaleDateString('pt-BR')}`;
  }
}

function imprimirRelatorio() {
  renderRelatorios();
  setTimeout(() => window.print(), 500);
}

/* ================================================================
   ACOMPANHAMENTO
   ================================================================ */
function renderAcompanhamento() {
  const ini = document.getElementById('acompInicio')?.value || '';
  const fim = document.getElementById('acompFim')?.value   || '';

  let movs = [...state.movimentacoes];
  if (ini) movs = movs.filter(m => m.data >= ini);
  if (fim) movs = movs.filter(m => m.data <= fim);

  const totalE = movs.filter(m=>m.tipo==='entrada').reduce((s,m)=>s+m.valor,0);
  const totalD = movs.filter(m=>m.tipo==='despesa').reduce((s,m)=>s+m.valor,0);
  const res    = totalE - totalD;

  setText('acompEntradas',  fmt(totalE));
  setText('acompDespesas',  fmt(totalD));
  setText('acompResultado', fmt(res));
  setColor('acompResultado', res >= 0 ? 'var(--green)' : 'var(--red)');
  setText('acompTotal', movs.length);

  /* Gráfico por data */
  const datasMap = {};
  movs.forEach(m => {
    if (!datasMap[m.data]) datasMap[m.data] = { e:0, d:0 };
    if (m.tipo==='entrada') datasMap[m.data].e += m.valor;
    else                    datasMap[m.data].d += m.valor;
  });
  const datas  = Object.keys(datasMap).sort();
  const eVals  = datas.map(d => datasMap[d].e);
  const dVals  = datas.map(d => datasMap[d].d);
  const dLabels= datas.map(d => fmtData(d));

  destroyChart('acompD');
  const ctxD = document.getElementById('chartAcompDesempenho')?.getContext('2d');
  if (ctxD) {
    charts['acompD'] = new Chart(ctxD, {
      type:'line',
      data:{ labels:dLabels, datasets:[
        { label:'Entradas', data:eVals, borderColor:'#0f9d6e', backgroundColor:'#0f9d6e22', fill:true, tension:.4, borderWidth:2, pointRadius:3 },
        { label:'Despesas', data:dVals, borderColor:'#e53e56', backgroundColor:'#e53e5622', fill:true, tension:.4, borderWidth:2, pointRadius:3 }
      ]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'top'}}, scales:{y:{beginAtZero:true}}, animation:{duration:300} }
    });
  }

  /* Gráfico por categoria */
  const catMap = {};
  movs.forEach(m => { if (!catMap[m.categoria]) catMap[m.categoria]=0; catMap[m.categoria]+=m.valor; });
  const cL = Object.keys(catMap), cV = Object.values(catMap);

  destroyChart('acompC');
  const ctxC = document.getElementById('chartAcompCateg')?.getContext('2d');
  if (ctxC) {
    charts['acompC'] = new Chart(ctxC, {
      type:'doughnut',
      data:{ labels:cL, datasets:[{ data: cV.length ? cV : [1], backgroundColor: cV.length ? PALETTE_D.slice(0,cL.length) : ['#e4e7f0'], borderWidth:0 }] },
      options:{ responsive:true, maintainAspectRatio:false, cutout:'60%', plugins:{legend:{position:'right',labels:{font:{size:11}}}}, animation:{duration:300} }
    });
  }
}

/* ================================================================
   CONTAS
   ================================================================ */
function abrirModalConta(id) {
  if (!temPermissao(4)) { toast('Sem permissão', 'error'); return; }
  document.getElementById('ctId').value = id || '';
  document.getElementById('modalContaTitulo').textContent = id ? 'Editar Conta' : 'Nova Conta';
  if (id) {
    const c = state.contas.find(x => x.id === id);
    if (!c) return;
    document.getElementById('ctNome').value     = c.nome;
    document.getElementById('ctTipo').value     = c.tipo;
    document.getElementById('ctSaldo').value    = formatMoeda(c.saldo);
    document.getElementById('ctCor').value      = c.cor || '#4361ee';
    document.getElementById('ctPrincipal').value= c.principal ? 'sim' : 'nao';
  } else {
    document.getElementById('ctNome').value     = '';
    document.getElementById('ctTipo').value     = 'corrente';
    document.getElementById('ctSaldo').value    = '';
    document.getElementById('ctCor').value      = '#4361ee';
    document.getElementById('ctPrincipal').value= 'nao';
  }
  document.getElementById('modalConta').classList.add('open');
}

function salvarConta() {
  const id        = document.getElementById('ctId').value;
  const nome      = document.getElementById('ctNome').value.trim();
  const tipo      = document.getElementById('ctTipo').value;
  const saldo     = parseMoeda(document.getElementById('ctSaldo').value);
  const cor       = document.getElementById('ctCor').value;
  const principal = document.getElementById('ctPrincipal').value === 'sim';

  if (!nome) { toast('Informe o nome da conta!', 'error'); return; }
  if (principal) state.contas.forEach(c => { c.principal = false; });

  if (id) {
    const idx = state.contas.findIndex(x => x.id === id);
    if (idx > -1) state.contas[idx] = { ...state.contas[idx], nome, tipo, saldo, cor, principal };
    registrarAuditoria('Editar Conta', `"${nome}"`);
    toast(`Conta "${nome}" atualizada ✓`);
  } else {
    state.contas.push({ id: uid(), nome, tipo, saldo, cor, principal });
    registrarAuditoria('Nova Conta', `"${nome}" saldo inicial ${fmt(saldo)}`);
    toast(`Conta "${nome}" criada ✓`);
  }
  salvarState();
  fecharModais();
  renderContas();
  renderDashboard();
}

function excluirConta(id) {
  if (!temPermissao(5)) { toast('Apenas administradores podem excluir contas', 'error'); return; }
  const c = state.contas.find(x => x.id === id);
  if (!c) return;
  if (!window.confirm(`Excluir a conta "${c.nome}"?`)) return;
  state.contas = state.contas.filter(x => x.id !== id);
  salvarState();
  renderContas();
  renderDashboard();
  registrarAuditoria('Excluir Conta', `"${c.nome}"`);
  toast('Conta excluída');
}

function renderContas() {
  const grid  = document.getElementById('contasGrid');
  const empty = document.getElementById('emptyContas');
  const composto = calcularSaldoComposto();

  setText('saldoCompostoContas', fmt(composto));

  if (!state.contas.length) { grid.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';

  const TIPO_EMOJI = { corrente:'🏦', poupanca:'🐷', carteira:'👛', investimento:'📈', outro:'💳' };

  grid.innerHTML = state.contas.map(c => {
    const saldoReal = calcularSaldoConta(c.id);
    return `<div class="conta-card${c.principal?' is-principal':''}" style="--c-cor:${c.cor}">
      <div class="conta-top">
        <div class="conta-icon" style="background:${c.cor}22">${TIPO_EMOJI[c.tipo]||'💳'}</div>
        <div class="conta-actions">
          <button class="conta-del" onclick="abrirModalConta('${c.id}')" title="Editar">✏️</button>
          <button class="conta-del" onclick="excluirConta('${c.id}')" title="Excluir">×</button>
        </div>
      </div>
      <div class="conta-nome">${c.nome}</div>
      <div class="conta-tipo">${c.tipo}${c.principal?' · Principal':''}</div>
      <div class="conta-saldo-label" style="margin-top:12px">Saldo Atual</div>
      <div class="conta-saldo" style="color:${saldoReal>=0?'var(--green)':'var(--red)'}">${fmt(saldoReal)}</div>
      <div class="conta-saldo-label" style="margin-top:4px">Saldo Inicial</div>
      <div style="font-size:12px;color:var(--text-3)">${fmt(c.saldo)}</div>
    </div>`;
  }).join('');
}

function contaNome(id) {
  const c = state.contas.find(x => x.id === id);
  return c ? c.nome : '—';
}

/* ================================================================
   LIXEIRA
   ================================================================ */
function atualizarBadgeLixeira() {
  const badge = document.getElementById('lixeiraBadge');
  if (!badge) return;
  badge.textContent = '';
  badge.style.display = (state.lixeiraNova && state.lixeira.length > 0) ? 'inline-block' : 'none';
}

function restaurarItem(id) {
  const item = state.lixeira.find(x => x.id === id);
  if (!item) return;
  const tipo = item.itemTipo;
  const { itemTipo, dataExclusao, excluidoPor, motivo, ...original } = item;

  if (tipo === 'movimentacao') {
    state.movimentacoes.push(original);
    toast('Movimentação restaurada ✓');
  } else if (tipo === 'transferencia') {
    state.transferencias.push(original);
    toast('Transferência restaurada ✓');
  } else if (tipo === 'reserva') {
    if (!state.reserva.movimentos) state.reserva.movimentos = [];
    state.reserva.movimentos.push(original);
    toast('Movimento de reserva restaurado ✓');
  } else if (tipo === 'provisao') {
    state.provisoes.push(original);
    toast('Provisão restaurada ✓');
  }

  state.lixeira = state.lixeira.filter(x => x.id !== id);
  salvarState();
  renderLixeira();
  atualizarBadgeLixeira();
  renderDashboard();
  registrarAuditoria('Restaurar', `Item "${original.descricao||original.nome}" restaurado da lixeira`);
}

function excluirDefinitivo(id) {
  if (!window.confirm('Excluir definitivamente? Esta ação não pode ser desfeita.')) return;
  const item = state.lixeira.find(x => x.id === id);
  state.lixeira = state.lixeira.filter(x => x.id !== id);
  salvarState();
  renderLixeira();
  atualizarBadgeLixeira();
  registrarAuditoria('Exclusão Definitiva', `"${item?.descricao||item?.nome||'Item'}" removido permanentemente`);
  toast('Excluído definitivamente');
}

function esvaziarLixeira() {
  if (!temPermissao(5)) { toast('Apenas administradores podem esvaziar a lixeira', 'error'); return; }
  if (!window.confirm(`Esvaziar lixeira com ${state.lixeira.length} item(s)? Ação irreversível.`)) return;
  state.lixeira = [];
  salvarState();
  renderLixeira();
  atualizarBadgeLixeira();
  registrarAuditoria('Esvaziar Lixeira', 'Lixeira esvaziada');
  toast('Lixeira esvaziada');
}

function renderLixeira() {
  state.lixeiraNova = false;
  salvarState();
  atualizarBadgeLixeira();
  const tbody = document.getElementById('tbodyLixeira');
  const empty = document.getElementById('emptyLixeira');

  if (!state.lixeira.length) { tbody.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';

  tbody.innerHTML = [...state.lixeira].sort((a,b) => b.dataExclusao.localeCompare(a.dataExclusao)).map(item => {
    const diasRestantes = Math.max(0, 90 - Math.floor((Date.now() - new Date(item.dataExclusao).getTime()) / (1000*60*60*24)));
    const tipoLabel = { movimentacao:'Movimentação', transferencia:'Transferência', reserva:'Reserva', provisao:'Provisão' }[item.itemTipo] || item.itemTipo;
    return `<tr>
      <td style="font-size:11px">${new Date(item.dataExclusao).toLocaleDateString('pt-BR')}</td>
      <td><span class="tag-categ" style="background:var(--blue-bg);color:var(--blue)">${tipoLabel}</span></td>
      <td>${item.descricao || item.nome || '—'}</td>
      <td style="font-family:'DM Mono',monospace">${item.valor ? fmt(item.valor) : '—'}</td>
      <td style="font-size:11px">${item.excluidoPor||'—'}</td>
      <td style="font-size:11px;color:var(--text-2)">${item.motivo||'—'}</td>
      <td><span style="font-size:11px;font-weight:600;color:${diasRestantes<=10?'var(--red)':'var(--text-2)'}">${diasRestantes}d</span></td>
      <td>
        <button class="action-btn" onclick="restaurarItem('${item.id}')" title="Restaurar" style="color:var(--green)">♻️</button>
        <button class="action-btn" onclick="excluirDefinitivo('${item.id}')" title="Excluir definitivamente">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

/* ================================================================
   CONFIGURAÇÕES
   ================================================================ */
function renderConfiguracoes() {
  document.getElementById('cfgNomeSistema').value  = state.config.nomeSistema  || 'FinanSys';
  document.getElementById('cfgMetaReservas').value = state.config.metaReservas > 0 ? formatMoeda(state.config.metaReservas) : '';

  /* Categorias */
  const list = document.getElementById('categList');
  if (list) {
    list.innerHTML = state.categorias.map(c =>
      `<div class="categ-item categ-item-edit">
        <span><strong>${c.nome}</strong><small>${c.tipo}</small></span>
        <span class="categ-actions">
          <button class="btn-secondary" style="padding:3px 8px;font-size:11px" onclick="editarCategoria('${c.id}')">Editar</button>
          <button class="categ-del" onclick="excluirCategoria('${c.id}')">×</button>
        </span>
      </div>`
    ).join('');
  }

  /* Usuários */
  renderListaUsuarios();
}

function salvarConfiguracoes() {
  state.config.nomeSistema  = document.getElementById('cfgNomeSistema').value.trim() || 'FinanSys';
  state.config.metaReservas = parseMoeda(document.getElementById('cfgMetaReservas').value);
  salvarState();
  aplicarNomeSistema();
  renderDashboard();
  registrarAuditoria('Configurações', `Nome do sistema: "${state.config.nomeSistema}"`);
  toast('Configurações salvas ✓');
}

function adicionarCategoria() {
  const nome = document.getElementById('novaCateg').value.trim();
  const tipo = document.getElementById('novaCategTipo').value;
  if (!nome) { toast('Informe o nome!', 'error'); return; }
  if (state.categorias.find(c => c.nome.toLowerCase() === nome.toLowerCase())) {
    toast('Categoria já existe!', 'error'); return;
  }
  state.categorias.push({ id: uid(), nome, tipo });
  document.getElementById('novaCateg').value = '';
  salvarState();
  renderConfiguracoes();
  registrarAuditoria('Nova Categoria', `"${nome}" (${tipo})`);
  toast(`Categoria "${nome}" adicionada ✓`);
}

function editarCategoria(id) {
  const c = state.categorias.find(x => x.id === id);
  if (!c) return;
  const novoNome = prompt('Novo nome da categoria:', c.nome);
  if (!novoNome || !novoNome.trim()) return;
  const novoTipo = prompt('Tipo da categoria: entrada, despesa ou ambos', c.tipo) || c.tipo;
  if (!['entrada','despesa','ambos'].includes(novoTipo)) { toast('Tipo inválido', 'error'); return; }
  c.nome = novoNome.trim();
  c.tipo = novoTipo;
  salvarState();
  renderConfiguracoes();
  registrarAuditoria('Editar Categoria', `Categoria alterada para "${c.nome}" (${c.tipo})`);
  toast('Categoria atualizada ✓');
}

function excluirCategoria(id) {
  state.categorias = state.categorias.filter(c => c.id !== id);
  salvarState();
  renderConfiguracoes();
  toast('Categoria removida');
}

function limparTodosDados() {
  if (!temPermissao(5)) { toast('Apenas administradores podem executar esta ação', 'error'); return; }
  if (!window.confirm('ATENÇÃO: Todos os dados serão apagados permanentemente!')) return;
  if (!window.confirm('Tem certeza absoluta? Esta ação NÃO pode ser desfeita!')) return;
  localStorage.removeItem('finansys_v3');
  location.reload();
}

/* ================================================================
   GESTÃO DE USUÁRIOS
   ================================================================ */
function abrirModalUsuario(id) {
  document.getElementById('usrId').value  = id || '';
  document.getElementById('modalUserTitulo').textContent = id ? 'Editar Usuário' : 'Novo Usuário';
  if (id) {
    const u = state.usuarios.find(x => x.id === id);
    if (!u) return;
    document.getElementById('usrNome').value  = u.nome;
    document.getElementById('usrLogin').value = u.login;
    document.getElementById('usrSenha').value = '';
    document.getElementById('usrNivel').value = u.nivel;
  } else {
    document.getElementById('usrNome').value  = '';
    document.getElementById('usrLogin').value = '';
    document.getElementById('usrSenha').value = '';
    document.getElementById('usrNivel').value = '1';
  }
  document.getElementById('modalUsuario').classList.add('open');
}

function salvarUsuario() {
  const id    = document.getElementById('usrId').value;
  const nome  = document.getElementById('usrNome').value.trim();
  const login = document.getElementById('usrLogin').value.trim();
  const senha = document.getElementById('usrSenha').value;
  const nivel = parseInt(document.getElementById('usrNivel').value);

  if (!nome || !login) { toast('Nome e login são obrigatórios!', 'error'); return; }

  /* Verificar login duplicado */
  const dup = state.usuarios.find(u => u.login === login && u.id !== id);
  if (dup) { toast('Login já existe!', 'error'); return; }

  if (id) {
    const idx = state.usuarios.findIndex(x => x.id === id);
    if (idx > -1) {
      state.usuarios[idx] = { ...state.usuarios[idx], nome, login, nivel };
      if (senha) state.usuarios[idx].senha = senha;
    }
    toast(`Usuário "${nome}" atualizado ✓`);
    registrarAuditoria('Editar Usuário', `"${nome}" nível ${nivel}`);
  } else {
    if (!senha) { toast('Senha é obrigatória para novo usuário!', 'error'); return; }
    state.usuarios.push({ id: uid(), nome, login, senha, nivel });
    toast(`Usuário "${nome}" criado ✓`);
    registrarAuditoria('Novo Usuário', `"${nome}" login:${login} nível:${nivel}`);
  }
  salvarState();
  fecharModais();
  renderListaUsuarios();
}

function excluirUsuario(id) {
  if (id === 'u1') { toast('Não é possível excluir o administrador principal', 'error'); return; }
  if (currentUser?.id === id) { toast('Você não pode excluir o usuário logado', 'error'); return; }
  const u = state.usuarios.find(x => x.id === id);
  if (!u) return;
  if (!window.confirm(`Excluir usuário "${u.nome}"?`)) return;
  state.usuarios = state.usuarios.filter(x => x.id !== id);
  salvarState();
  renderListaUsuarios();
  registrarAuditoria('Excluir Usuário', `"${u.nome}"`);
  toast('Usuário excluído');
}

function renderListaUsuarios() {
  const list = document.getElementById('userList');
  if (!list) return;
  list.innerHTML = state.usuarios.map(u =>
    `<div class="user-item">
      <div class="user-avatar" style="width:28px;height:28px;font-size:10px;flex-shrink:0">${u.nome.slice(0,2).toUpperCase()}</div>
      <div style="flex:1">
        <div class="user-item-name">${u.nome}</div>
        <div class="user-item-role">${u.login} · ${nivelLabel(u.nivel)}</div>
      </div>
      <span class="user-item-badge">N${u.nivel}</span>
      <button class="action-btn" onclick="abrirModalUsuario('${u.id}')" title="Editar">✏️</button>
      <button class="action-btn" onclick="excluirUsuario('${u.id}')" title="Excluir">🗑</button>
    </div>`
  ).join('');
}

/* ================================================================
   HELPERS SELECT
   ================================================================ */
function preencherSelectCategorias(selectId, tipo, comTodos, valorAtual) {
  const el = document.getElementById(selectId);
  if (!el) return;
  const prev = valorAtual !== undefined ? valorAtual : el.value;
  const cats = state.categorias.filter(c => {
    if (!tipo) return true;
    return c.tipo === tipo || c.tipo === 'ambos';
  });
  el.innerHTML = (comTodos ? '<option value="">Todas as categorias</option>' : '') +
    cats.map(c => `<option value="${c.nome}">${c.nome}</option>`).join('');
  if (prev) el.value = prev;
}

function preencherSelectContas(selectId, valorAtual) {
  const el = document.getElementById(selectId);
  if (!el) return;
  const prev = valorAtual !== undefined ? valorAtual : el.value;
  el.innerHTML = state.contas.map(c => `<option value="${c.id}">${c.nome}${c.principal?' ★':''}</option>`).join('');
  if (prev) el.value = prev;
}

/* ================================================================
   FECHAR MODAIS
   ================================================================ */
function fecharModais() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) fecharModais(); });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') fecharModais();
});

/* ================================================================
   RERENDER PÁGINA ATIVA
   ================================================================ */
function reRenderAtivo() {
  const p = document.querySelector('.page.active')?.id?.replace('page-','');
  if (!p || p === 'dashboard') return;
  const map = {
    entradas: renderEntradas, despesas: renderDespesas, transferencias: renderTransferencias,
    reserva: renderReserva, conciliacao: renderConciliacao, provisao: renderProvisao,
    lixeira: renderLixeira, auditoria: renderAuditoria,
    configuracoes: renderConfiguracoes
  };
  if (map[p]) map[p]();
}

/* ================================================================
   INICIALIZAÇÃO
   ================================================================ */
window.addEventListener('DOMContentLoaded', () => {
  carregarState();
  aplicarNomeSistema();

  /* Verifica se havia sessão (opcional — mantém login para UX) */
  /* Mostra tela de login por padrão */
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appScreen').style.display   = 'none';
});
/* ================================================================
   AJUSTES FINAIS SOLICITADOS — PRESERVA E MELHORA O CÓDIGO EXISTENTE
   ================================================================ */

/* Banco remoto opcional Supabase
   Preencha estes dados quando publicar no Vercel/GitHub.
   O sistema continua funcionando localmente com localStorage se os campos ficarem vazios. */
const SUPABASE_URL = '';
const SUPABASE_ANON_KEY = '';
const SUPABASE_ROW_ID = 'finansys_producao';
let supabaseClient = null;

function iniciarSupabase() {
  try {
    if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
  } catch (e) {
    console.warn('Supabase não iniciado:', e.message);
  }
}

const salvarStateOriginalLocal = salvarState;
salvarState = function salvarStateMelhorado() {
  localStorage.setItem('finansys_v3', JSON.stringify(state));
  if (supabaseClient) {
    supabaseClient
      .from('finansys_state')
      .upsert({ id: SUPABASE_ROW_ID, data: state, updated_at: new Date().toISOString() })
      .then(({ error }) => { if (error) console.warn('Erro ao salvar no Supabase:', error.message); });
  }
};

async function carregarStateRemoto() {
  iniciarSupabase();
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient.from('finansys_state').select('data').eq('id', SUPABASE_ROW_ID).maybeSingle();
  if (!error && data && data.data) {
    state = Object.assign({}, state, data.data);
    normalizarStateFinanceiro();
    localStorage.setItem('finansys_v3', JSON.stringify(state));
    aplicarNomeSistema();
  }
}

function normalizarStateFinanceiro() {
  if (!state.contas || !state.contas.length) {
    state.contas = [{ id: uid(), nome:'Banco Noh', tipo:'corrente', saldo:0, cor:'#4361ee', principal:true }];
  }
  if (!state.contas.some(c => c.principal)) state.contas[0].principal = true;
  if (!state.saldosMes) state.saldosMes = {};
  state.movimentacoes = (state.movimentacoes || []).map(m => ({ ...m, serieId: m.serieId || m.id }));
  state.provisoes = (state.provisoes || []).map(p => ({ ...p, datasAnuais: p.datasAnuais || '' }));
}

const carregarStateOriginal = carregarState;
carregarState = function carregarStateComNormalizacao() {
  carregarStateOriginal();
  normalizarStateFinanceiro();
};

window.addEventListener('DOMContentLoaded', async () => {
  await carregarStateRemoto();
});

function mesAnterior(ym) { return addMeses(ym, -1); }

function saldoInicialDoMes(ym, visitados = new Set()) {
  if (!state.saldosMes) state.saldosMes = {};
  if (state.saldosMes[ym] !== undefined) return +state.saldosMes[ym] || 0;
  const mesBase = state.dashboardMes || mesAtualISO();
  if (ym === mesBase) return +state.saldoInicial || 0;
  if (visitados.has(ym)) return +state.saldoInicial || 0;
  visitados.add(ym);
  const ant = mesAnterior(ym);
  const rAnt = calcularResumoMes(ant, visitados);
  const pendentes = movsDoMes(ant).filter(m => m.tipo === 'despesa' && !despesaComputavel(m)).length;
  return pendentes === 0 && rAnt.saldoLivre > 0 ? rAnt.saldoLivre : 0;
}

calcularResumoMes = function calcularResumoMesMelhorado(ym, visitados = new Set()) {
  normalizarStateFinanceiro();
  const movs = movsDoMes(ym);
  const provMes = provisoesDoMes(ym);
  const entradasLancadasMov = movs.filter(m => m.tipo === 'entrada').reduce((s,m)=>s+(+m.valor||0),0);
  const entradasLancadasProv = provMes.filter(p => p.tipo === 'entrada').reduce((s,p)=>s+(+p.valor||0),0);
  const entradasRecebidasMov = movs.filter(m => m.tipo === 'entrada' && m.recebido === true).reduce((s,m)=>s+(+m.valor||0),0);
  const entradasRecebidasProv = provMes.filter(p => p.tipo === 'entrada' && provisaoRecebidaNoMes(p, ym)).reduce((s,p)=>s+(+p.valor||0),0);
  const receberMov = movs.filter(m => m.tipo === 'entrada' && m.recebido !== true).reduce((s,m)=>s+(+m.valor||0),0);
  const receberProv = provMes.filter(p => p.tipo === 'entrada' && !provisaoRecebidaNoMes(p, ym)).reduce((s,p)=>s+(+p.valor||0),0);
  const despesasLancadasMov = movs.filter(m => m.tipo === 'despesa').reduce((s,m)=>s+(+m.valor||0),0);
  const despesasLancadasProv = provMes.filter(p => p.tipo === 'despesa').reduce((s,p)=>s+(+p.valor||0),0);
  const despesasComputadasMov = movs.filter(despesaComputavel).reduce((s,m)=>s+(+m.valor||0),0);
  const despesasComputadasProv = provMes.filter(p => p.tipo === 'despesa' && provisaoRecebidaNoMes(p, ym)).reduce((s,p)=>s+(+p.valor||0),0);
  const saldoInicialMes = saldoInicialDoMes(ym, visitados);
  const saldoLivre = saldoInicialMes + entradasRecebidasMov + entradasRecebidasProv - despesasComputadasMov - despesasComputadasProv;
  return {
    saldoInicialMes,
    entradasLancadas: entradasLancadasMov + entradasLancadasProv,
    entradasRecebidas: entradasRecebidasMov + entradasRecebidasProv,
    valoresAReceber: receberMov + receberProv,
    despesasLancadas: despesasLancadasMov + despesasLancadasProv,
    despesas: despesasComputadasMov + despesasComputadasProv,
    saldoLivre
  };
};

function atualizarCamposAnuais() {
  const movWrap = document.getElementById('movDatasAnuaisWrap');
  const movRec = document.getElementById('movRecorrencia')?.value;
  if (movWrap) movWrap.style.display = movRec === 'anual' ? 'block' : 'none';
  const provWrap = document.getElementById('provDatasAnuaisWrap');
  const provRec = document.getElementById('provRecorrencia')?.value;
  if (provWrap) provWrap.style.display = provRec === 'anual' ? 'block' : 'none';
}

function datasAnuaisDigitadas(txt, dataBase, repeticoes) {
  const partes = String(txt || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!partes.length) return [];
  const anoBase = Number(dataBase.slice(0,4));
  const maxAnos = Math.max(1, parseInt(repeticoes || '1') || 1);
  const datas = [];
  for (let ano = 0; ano < maxAnos; ano++) {
    partes.forEach(p => {
      const m = p.match(/^(\d{1,2})\/(\d{1,2})$/);
      if (m) datas.push(`${anoBase + ano}-${String(+m[2]).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`);
    });
  }
  return datas;
}

atualizarCampoRecebidoMov = function atualizarCampoRecebidoMovMelhorado() {
  const tipo = document.getElementById('movTipo')?.value;
  const wrap = document.getElementById('movRecebidoWrap');
  if (wrap) {
    wrap.style.display = 'flex';
    wrap.childNodes[1].nodeValue = tipo === 'despesa' ? ' Marcar despesa como paga' : ' Marcar entrada como recebida';
  }
};

const abrirModalMovimentacaoOriginal = abrirModalMovimentacao;
abrirModalMovimentacao = function abrirModalMovimentacaoMelhorada(tipo, id) {
  abrirModalMovimentacaoOriginal(tipo, id);
  const m = id ? state.movimentacoes.find(x => x.id === id) : null;
  if (document.getElementById('movDatasAnuais')) document.getElementById('movDatasAnuais').value = m?.datasAnuais || '';
  atualizarCamposAnuais();
};

salvarMovimentacao = function salvarMovimentacaoMelhorada() {
  const id        = document.getElementById('movId').value;
  const tipo      = document.getElementById('movTipo').value;
  const data      = document.getElementById('movData').value;
  const descricao = document.getElementById('movDescricao').value.trim();
  const categoria = document.getElementById('movCategoria').value;
  const conta     = document.getElementById('movConta').value;
  const valor     = parseMoeda(document.getElementById('movValor').value);
  const obs       = document.getElementById('movObs').value.trim();
  const recorrencia = document.getElementById('movRecorrencia')?.value || '';
  const repeticoes  = document.getElementById('movRepeticoes')?.value || '';
  const datasAnuais = document.getElementById('movDatasAnuais')?.value || '';
  const marcado = document.getElementById('movRecebido')?.checked === true;
  const recebido = tipo === 'entrada' ? marcado : false;
  const pago = tipo === 'despesa' ? marcado : false;

  if (!data || !descricao || !categoria || valor <= 0) { toast('Preencha todos os campos obrigatórios!', 'error'); return; }
  if (recorrencia && (!parseInt(repeticoes || '0') || parseInt(repeticoes || '0') <= 0)) { toast('Informe a quantidade de repetições.', 'error'); return; }

  if (tipo === 'despesa') {
    const r = calcularResumoMes(data.slice(0,7));
    const saldoAntes = r.saldoLivre;
    const diferenca = saldoAntes - valor;
    toast(diferenca < 0 ? `A despesa ultrapassa o saldo em ${fmt(Math.abs(diferenca))}` : `Após esta despesa ainda restará ${fmt(diferenca)}`, diferenca < 0 ? 'error' : 'info');
  }

  const snap = snapState();
  if (id) {
    const idx = state.movimentacoes.findIndex(x => x.id === id);
    if (idx > -1) {
      pushUndo(`Editar ${tipo}`, snap);
      state.movimentacoes[idx] = { ...state.movimentacoes[idx], tipo, data, descricao, categoria, conta, valor, obs, recebido, pago, recorrencia, repeticoes, datasAnuais };
      registrarAuditoria('Editar Movimentação', `${tipo} "${descricao}" ${fmt(valor)}`);
    }
  } else {
    pushUndo(`Adicionar ${tipo}`, snap);
    const serieId = uid();
    let datas = [];
    if (recorrencia === 'anual' && datasAnuais.trim()) datas = datasAnuaisDigitadas(datasAnuais, data, repeticoes);
    if (!datas.length) {
      const total = recorrencia ? Math.max(1, parseInt(repeticoes || '1') || 1) : 1;
      datas = Array.from({ length: total }, (_, i) => dataComIncremento(data, recorrencia, i));
    }
    datas.sort((a,b)=>a.localeCompare(b)).forEach((dt, i) => {
      state.movimentacoes.push({ id: uid(), serieId, tipo, data: dt, descricao, categoria, conta, valor, obs, recebido, pago, conciliado:false, usuario: currentUser?.nome || 'Sistema', _destaque:null, recorrencia, repeticoes, datasAnuais, parcela: datas.length > 1 ? `${i+1}/${datas.length}` : '' });
    });
    registrarAuditoria('Nova Movimentação', `${tipo} "${descricao}" ${fmt(valor)}`);
  }
  salvarState(); fecharModais(); renderDashboard(); reRenderAtivo(); toast(`${tipo === 'entrada' ? 'Entrada' : 'Despesa'} salva ✓`);
};

renderEntradas = function renderEntradasMelhorado() {
  const search = (document.getElementById('searchEntradas')?.value || '').toLowerCase();
  const categ  = document.getElementById('filtroCategEntradas')?.value || '';
  preencherSelectCategorias('filtroCategEntradas', 'entrada', true, categ);
  let movs = state.movimentacoes.filter(m => m.tipo === 'entrada');
  if (state.filtro.inicio) movs = movs.filter(m => m.data >= state.filtro.inicio);
  if (state.filtro.fim) movs = movs.filter(m => m.data <= state.filtro.fim);
  if (search) movs = movs.filter(m => m.descricao.toLowerCase().includes(search) || m.categoria.toLowerCase().includes(search));
  if (categ) movs = movs.filter(m => m.categoria === categ);
  movs.sort((a,b) => a.data.localeCompare(b.data));
  const tbody = document.getElementById('tbodyEntradas');
  const empty = document.getElementById('emptyEntradas');
  if (!movs.length) { tbody.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';
  tbody.innerHTML = movs.map(m => `<tr><td>${fmtData(m.data)}</td><td><strong>${m.descricao}</strong>${m.parcela ? `<br><small style="color:var(--text-3)">Parcela ${m.parcela}</small>` : ''}${m.recebido ? '<br><small class="green">✓ Recebido</small>' : '<br><small style="color:var(--orange)">A receber</small>'}</td><td><span class="tag-categ" style="background:var(--green-bg);color:var(--green)">${EMOJI[m.categoria]||'🏷'} ${m.categoria}</span></td><td>${contaNome(m.conta)}</td><td class="val-positivo">+ ${fmt(m.valor)}</td><td style="font-size:11px;color:var(--text-3)">${m.usuario||'—'}</td><td><button class="action-btn" onclick="abrirModalMovimentacao('entrada','${m.id}')" title="Editar">✏️</button><button class="action-btn" onclick="solicitarExclusao('${m.id}','movimentacao')" title="Excluir">🗑</button></td></tr>`).join('');
};

renderDespesas = function renderDespesasMelhorado() {
  const search = (document.getElementById('searchDespesas')?.value || '').toLowerCase();
  const categ  = document.getElementById('filtroCategDespesas')?.value || '';
  preencherSelectCategorias('filtroCategDespesas', 'despesa', true, categ);
  let movs = state.movimentacoes.filter(m => m.tipo === 'despesa');
  if (state.filtro.inicio) movs = movs.filter(m => m.data >= state.filtro.inicio);
  if (state.filtro.fim) movs = movs.filter(m => m.data <= state.filtro.fim);
  if (search) movs = movs.filter(m => m.descricao.toLowerCase().includes(search) || m.categoria.toLowerCase().includes(search));
  if (categ) movs = movs.filter(m => m.categoria === categ);
  movs.sort((a,b) => a.data.localeCompare(b.data));
  const tbody = document.getElementById('tbodyDespesas');
  const empty = document.getElementById('emptyDespesas');
  if (!movs.length) { tbody.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';
  tbody.innerHTML = movs.map(m => `<tr><td>${fmtData(m.data)}</td><td><strong>${m.descricao}</strong>${m.parcela ? `<br><small style="color:var(--text-3)">Parcela ${m.parcela}</small>` : ''}</td><td><span class="tag-categ" style="background:var(--red-bg);color:var(--red)">${EMOJI[m.categoria]||'🏷'} ${m.categoria}</span></td><td>${contaNome(m.conta)}</td><td class="val-negativo">- ${fmt(m.valor)}</td><td><button class="btn-status-recebido ${(m.pago||m.conciliado)?'sim':'nao'}" onclick="toggleDespesaPaga('${m.id}')">${m.conciliado?'✓ Conciliada':(m.pago?'✓ Paga':'Marcar paga')}</button></td><td style="font-size:11px;color:var(--text-3)">${m.usuario||'—'}</td><td><button class="action-btn" onclick="abrirModalMovimentacao('despesa','${m.id}')" title="Editar">✏️</button><button class="action-btn" onclick="solicitarExclusao('${m.id}','movimentacao')" title="Excluir">🗑</button></td></tr>`).join('');
};

const solicitarExclusaoOriginal = solicitarExclusao;
solicitarExclusao = function solicitarExclusaoMelhorada(id, tipo) {
  solicitarExclusaoOriginal(id, tipo);
  const wrap = document.getElementById('excEscopoWrap');
  const item = tipo === 'movimentacao' ? state.movimentacoes.find(x=>x.id===id) : tipo === 'provisao' ? state.provisoes.find(x=>x.id===id) : null;
  if (wrap) wrap.style.display = item && (item.serieId || item.recorrencia) ? 'block' : 'none';
};

confirmarExclusao = function confirmarExclusaoMelhorada() {
  const id = document.getElementById('excId').value;
  const tipo = document.getElementById('excTipo').value;
  const motivo = document.getElementById('excMotivo').value.trim() || 'Sem motivo informado';
  const escopo = document.getElementById('excEscopo')?.value || 'atual';
  const snap = snapState();
  const now = new Date().toISOString();
  const quem = currentUser?.nome || 'Sistema';
  function moverLista(lista, pred, itemTipo) {
    const removidos = lista.filter(pred);
    removidos.forEach(x => state.lixeira.push({ ...x, itemTipo, dataExclusao:now, excluidoPor:quem, motivo }));
    state.lixeiraNova = removidos.length > 0;
    return removidos;
  }
  if (tipo === 'movimentacao') {
    const m = state.movimentacoes.find(x => x.id === id); if (!m) return;
    pushUndo('Excluir movimentação', snap);
    const pred = escopo === 'vinculados' ? (x => (x.serieId || x.id) === (m.serieId || m.id)) : (x => x.id === id);
    const removidos = moverLista(state.movimentacoes, pred, 'movimentacao');
    state.movimentacoes = state.movimentacoes.filter(x => !pred(x));
    registrarAuditoria('Excluir Movimentação', `${removidos.length} item(ns) | Motivo: ${motivo}`);
  } else if (tipo === 'provisao') {
    const p = state.provisoes.find(x => x.id === id); if (!p) return;
    const pred = escopo === 'vinculados' ? (x => x.id === id || (x.descricao === p.descricao && x.recorrencia === p.recorrencia)) : (x => x.id === id);
    moverLista(state.provisoes, pred, 'provisao');
    state.provisoes = state.provisoes.filter(x => !pred(x));
  } else {
    // fallback simples para os demais tipos preservando a lógica original
    document.getElementById('excEscopo').value = 'atual';
    const oldConfirm = window.confirm;
  }
  salvarState(); fecharModais(); atualizarBadgeLixeira(); renderDashboard(); reRenderAtivo(); toast('Registro movido para a lixeira ✓');
};

function normalizarDataImportada(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (m) return s;
  const d = new Date(s); if (!isNaN(d)) return d.toISOString().slice(0,10);
  return `${getConciliacaoMes()}-01`;
}

function processarCSV(conteudo, nomeArquivo) {
  const linhas = conteudo.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const transacoes = [];
  linhas.slice(1).forEach(l => {
    const cols = l.includes(';') ? l.split(';') : l.split(',');
    const data = normalizarDataImportada(cols[0]);
    const memo = String(cols[1] || 'Importado CSV').trim();
    const bruto = String(cols[2] || cols[3] || '0').replace(/R\$/g,'').trim();
    const valor = parseFloat(bruto.replace(/\./g,'').replace(',','.')) || 0;
    if (Math.abs(valor) > 0) transacoes.push({ data, valor: Math.abs(valor), tipo: valor >= 0 ? 'entrada' : 'despesa', memo });
  });
  validarImportados(transacoes, nomeArquivo);
}

const importarArquivoConcOriginal = importarArquivoConc;
importarArquivoConc = function importarArquivoConcMelhorado(event) {
  const file = event.target.files[0]; if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    const reader = new FileReader();
    reader.onload = e => processarCSV(e.target.result, file.name);
    reader.readAsText(file, 'UTF-8');
    event.target.value = '';
    return;
  }
  importarArquivoConcOriginal(event);
};

const validarImportadosOriginal = validarImportados;
validarImportados = function validarImportadosMelhorado(transacoes, nomeArquivo) {
  transacoes = transacoes.map(t => ({ ...t, data: normalizarDataImportada(t.data) })).sort((a,b)=>a.data.localeCompare(b.data));
  validarImportadosOriginal(transacoes, nomeArquivo);
};

const renderConciliacaoOriginal = renderConciliacao;
renderConciliacao = function renderConciliacaoMelhorada() {
  renderConciliacaoOriginal();
};

const criarMovimentacaoDoArquivoOriginal = criarMovimentacaoDoArquivo;
criarMovimentacaoDoArquivo = function criarMovimentacaoDoArquivoMelhorada(id) {
  criarMovimentacaoDoArquivoOriginal(id);
};

const abrirModalProvisaoOriginal = abrirModalProvisao;
abrirModalProvisao = function abrirModalProvisaoMelhorada(id) {
  abrirModalProvisaoOriginal(id);
  const p = id ? state.provisoes.find(x=>x.id===id) : null;
  if (document.getElementById('provDatasAnuais')) document.getElementById('provDatasAnuais').value = p?.datasAnuais || '';
  atualizarCamposAnuais();
};

const salvarProvisaoOriginal = salvarProvisao;
salvarProvisao = function salvarProvisaoMelhorada() {
  const datasAnuais = document.getElementById('provDatasAnuais')?.value || '';
  salvarProvisaoOriginal();
  const id = document.getElementById('provId')?.value;
  if (id) {
    const p = state.provisoes.find(x=>x.id===id); if (p) p.datasAnuais = datasAnuais;
  } else if (state.provisoes.length) {
    state.provisoes[state.provisoes.length-1].datasAnuais = datasAnuais;
  }
  salvarState();
};

function salvarContaPrincipal() {
  normalizarStateFinanceiro();
  const nome = document.getElementById('cfgContaPrincipal')?.value.trim() || 'Banco Noh';
  const saldo = parseMoeda(document.getElementById('cfgContaSaldo')?.value || '0');
  state.contas.forEach(c => c.principal = false);
  let conta = state.contas[0];
  if (!conta) {
    conta = { id: uid(), tipo:'corrente', cor:'#4361ee' };
    state.contas.push(conta);
  }
  conta.nome = nome;
  conta.saldo = saldo;
  conta.principal = true;
  state.saldoInicial = saldo;
  salvarState();
  renderConfiguracoes();
  renderDashboard();
  toast('Conta principal salva ✓');
}

const renderConfiguracoesOriginal = renderConfiguracoes;
renderConfiguracoes = function renderConfiguracoesMelhorada() {
  renderConfiguracoesOriginal();
  normalizarStateFinanceiro();
  const principal = state.contas.find(c => c.principal) || state.contas[0];
  if (document.getElementById('cfgContaPrincipal')) document.getElementById('cfgContaPrincipal').value = principal?.nome || 'Banco Noh';
  if (document.getElementById('cfgContaSaldo')) document.getElementById('cfgContaSaldo').value = principal?.saldo ? formatMoeda(principal.saldo) : '';
};

const aplicarPermissoesOriginal = aplicarPermissoes;
aplicarPermissoes = function aplicarPermissoesSemBotaoGlobal() {
  aplicarPermissoesOriginal();
  const bNov = document.getElementById('btnNovaMovimentacao');
  if (bNov) bNov.style.display = 'none';
};

/* Correção do fluxo de exclusão para todos os tipos */
confirmarExclusao = function confirmarExclusaoCompleta() {
  const id = document.getElementById('excId').value;
  const tipo = document.getElementById('excTipo').value;
  const motivo = document.getElementById('excMotivo').value.trim() || 'Sem motivo informado';
  const escopo = document.getElementById('excEscopo')?.value || 'atual';
  const snap = snapState();
  const now = new Date().toISOString();
  const quem = currentUser?.nome || 'Sistema';
  const paraLixeira = (item, itemTipo) => state.lixeira.push({ ...item, itemTipo, dataExclusao:now, excluidoPor:quem, motivo });

  if (tipo === 'movimentacao') {
    const m = state.movimentacoes.find(x => x.id === id); if (!m) return;
    pushUndo('Excluir movimentação', snap);
    const pred = escopo === 'vinculados' ? (x => (x.serieId || x.id) === (m.serieId || m.id)) : (x => x.id === id);
    const removidos = state.movimentacoes.filter(pred);
    removidos.forEach(x => paraLixeira(x, 'movimentacao'));
    state.movimentacoes = state.movimentacoes.filter(x => !pred(x));
    registrarAuditoria('Excluir Movimentação', `${removidos.length} item(ns) | Motivo: ${motivo}`);
  } else if (tipo === 'transferencia') {
    const t = state.transferencias.find(x => x.id === id); if (!t) return;
    pushUndo('Excluir transferência', snap);
    paraLixeira(t, 'transferencia');
    state.transferencias = state.transferencias.filter(x => x.id !== id);
    registrarAuditoria('Excluir Transferência', `"${t.descricao}" ${fmt(t.valor)} | Motivo: ${motivo}`);
  } else if (tipo === 'reserva') {
    const r = (state.reserva.movimentos || []).find(x => x.id === id); if (!r) return;
    paraLixeira(r, 'reserva');
    state.reserva.movimentos = state.reserva.movimentos.filter(x => x.id !== id);
    registrarAuditoria('Excluir Reserva', `"${r.descricao}" | Motivo: ${motivo}`);
  } else if (tipo === 'provisao') {
    const p = state.provisoes.find(x => x.id === id); if (!p) return;
    const pred = escopo === 'vinculados' ? (x => x.id === id || (x.descricao === p.descricao && x.recorrencia === p.recorrencia && x.valor === p.valor)) : (x => x.id === id);
    const removidos = state.provisoes.filter(pred);
    removidos.forEach(x => paraLixeira(x, 'provisao'));
    state.provisoes = state.provisoes.filter(x => !pred(x));
    registrarAuditoria('Excluir Provisão', `${removidos.length} item(ns) | Motivo: ${motivo}`);
  }

  state.lixeiraNova = true;
  salvarState(); fecharModais(); atualizarBadgeLixeira(); renderDashboard(); reRenderAtivo(); toast('Registro movido para a lixeira ✓');
};

/* Datas anuais múltiplas também valem para provisões */
const provisaoOcorreNoMesBase = provisaoOcorreNoMes;
provisaoOcorreNoMes = function provisaoOcorreNoMesComDatasAnuais(p, ym) {
  if (p && p.recorrencia === 'anual' && p.datasAnuais && p.datasAnuais.trim()) {
    const partes = p.datasAnuais.split(',').map(x=>x.trim()).filter(Boolean);
    const mesAtual = ym.slice(5,7);
    const possuiMes = partes.some(dt => {
      const m = dt.match(/^(\d{1,2})\/(\d{1,2})$/);
      return m && String(+m[2]).padStart(2,'0') === mesAtual;
    });
    if (!possuiMes) return false;
  }
  return provisaoOcorreNoMesBase(p, ym);
};

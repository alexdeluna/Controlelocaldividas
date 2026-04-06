const STORAGE_KEY = "controle_dividas_v2";
const THEME_KEY = "controle_dividas_tema_v2";
const PROJECAO_MESES = 36;

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const state = {
  screen: "menu",
  monthIndex: 0,
  resumo36Aberto: false,
  expandedCategories: { fixas: false, cartoes: false },
  expandedCards: {},
  editing: { type: null, id: null },
  db: loadDB(),
  projection: [],
  simulation: null
};

/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  applySavedTheme();
  recalculateProjection();
  renderAll();
  registerSW();
});

function bindEvents() {
  byId("btnTema").addEventListener("click", toggleTheme);
  byId("btnIrInserir").addEventListener("click", () => showScreen("inserir"));
  byId("btnIrConsultar").addEventListener("click", () => showScreen("consultar"));
  byId("btnIrSimular").addEventListener("click", () => showScreen("simular"));

  document.querySelectorAll("[data-back]").forEach(btn => {
    btn.addEventListener("click", () => showScreen(btn.dataset.back));
  });

  byId("btnMesAnterior").addEventListener("click", previousMonth);
  byId("btnMesSeguinte").addEventListener("click", nextMonth);
  byId("btnToggleResumo36").addEventListener("click", toggleResumo36);

  byId("tipoCadastro").addEventListener("change", updateCadastroForms);
  byId("formFixa").addEventListener("submit", onSubmitFixa);
  byId("formCartao").addEventListener("submit", onSubmitCartao);
  byId("formCompra").addEventListener("submit", onSubmitCompra);
  byId("formRenda").addEventListener("submit", onSubmitRenda);
  byId("formSimulador").addEventListener("submit", onSubmitSimulador);
  byId("btnLimparSimulacao").addEventListener("click", clearSimulation);

  document.querySelectorAll(".money-input").forEach(bindMoneyInput);
}

/* =========================================================
   BANCO LOCAL
   ========================================================= */
function defaultDB() {
  return {
    dividasFixas: [],
    cartoes: [],
    comprasCartao: [],
    rendas: []
  };
}

function loadDB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultDB();
    const parsed = JSON.parse(raw);
    return {
      dividasFixas: Array.isArray(parsed.dividasFixas) ? parsed.dividasFixas : [],
      cartoes: Array.isArray(parsed.cartoes) ? parsed.cartoes : [],
      comprasCartao: Array.isArray(parsed.comprasCartao) ? parsed.comprasCartao : [],
      rendas: Array.isArray(parsed.rendas) ? parsed.rendas : []
    };
  } catch {
    return defaultDB();
  }
}

function saveDB() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.db));
}

/* =========================================================
   TEMA
   ========================================================= */
function applySavedTheme() {
  const theme = localStorage.getItem(THEME_KEY) || "light";
  document.body.classList.toggle("dark", theme === "dark");
  updateThemeButtonText();
}

function toggleTheme() {
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
  updateThemeButtonText();
}

function updateThemeButtonText() {
  byId("btnTema").textContent = document.body.classList.contains("dark") ? "☀ Tema" : "🌙 Tema";
}

/* =========================================================
   NAVEGAÇÃO
   ========================================================= */
function showScreen(screen) {
  state.screen = screen;
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  byId(`screen-${screen}`).classList.add("active");

  if (screen === "inserir") {
    renderRegistros();
    updateCadastroForms();
    fillCartaoSelect();
  } else if (screen === "consultar") {
    renderConsulta();
  } else if (screen === "simular") {
    renderSimulation();
  }
}

function renderAll() {
  renderRegistros();
  renderConsulta();
  renderSimulation();
  updateCadastroForms();
  fillCartaoSelect();
}

/* =========================================================
   MÁSCARA MONETÁRIA
   ========================================================= */
function bindMoneyInput(input) {
  input.addEventListener("input", onMoneyInput);
}

function onMoneyInput(event) {
  event.target.value = formatMoneyFromDigits(event.target.value);
}

function formatMoneyFromDigits(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const cents = digits ? Number(digits) : 0;
  return formatCurrency(cents);
}

function parseMoneyInput(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

function formatCurrency(cents) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

/* =========================================================
   CADASTROS
   ========================================================= */
function updateCadastroForms() {
  const tipo = byId("tipoCadastro").value;
  byId("formFixa").classList.toggle("hidden", tipo !== "fixa");
  byId("formCartao").classList.toggle("hidden", tipo !== "cartao");
  byId("formCompra").classList.toggle("hidden", tipo !== "compra");

  const hasCards = state.db.cartoes.length > 0;
  const formCompra = byId("formCompra");
  let alert = byId("compraNoCardsAlert");

  if (tipo === "compra" && !hasCards) {
    if (!alert) {
      alert = document.createElement("div");
      alert.id = "compraNoCardsAlert";
      alert.className = "alert-inline";
      alert.textContent = "Cadastre um cartão antes de inserir uma compra.";
      formCompra.appendChild(alert);
    }
  } else if (alert) {
    alert.remove();
  }
}

function fillCartaoSelect() {
  const select = byId("compraCartaoId");
  select.innerHTML = "";

  if (!state.db.cartoes.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Nenhum cartão cadastrado";
    select.appendChild(option);
    return;
  }

  state.db.cartoes.forEach(cartao => {
    const option = document.createElement("option");
    option.value = cartao.id;
    option.textContent = cartao.nome;
    select.appendChild(option);
  });
}
  function onSubmitFixa(event) {
  event.preventDefault();

  const nome = byId("fixaNome").value.trim();
  const valorCentavos = parseMoneyInput(byId("fixaValor").value);
  const parcelasRestantes = Number(byId("fixaParcelas").value);
  const dueDay = Number(byId("fixaVencimento").value);

  if (!nome || !valorCentavos || !parcelasRestantes || parcelasRestantes < 1 || !dueDay) {
    alert("Preencha a dívida fixa corretamente.");
    return;
  }

  state.db.dividasFixas.push({
    id: generateId("fixa"),
    nome,
    valorCentavos,
    parcelasRestantes,
    dueDay
  });

  saveAndRefresh();
  clearForm("formFixa");
  alert("Dívida fixa salva com sucesso.");
}

function onSubmitCartao(event) {
  event.preventDefault();

  const nome = byId("cartaoNome").value.trim();
  const anuidadeCentavos = parseMoneyInput(byId("cartaoAnuidade").value);
  const dueDay = Number(byId("cartaoVencimento").value);

  if (!nome || !dueDay) {
    alert("Informe o nome e vencimento do cartão.");
    return;
  }

  state.db.cartoes.push({
    id: generateId("cartao"),
    nome,
    anuidadeCentavos,
    dueDay
  });

  saveAndRefresh();
  clearForm("formCartao");
  alert("Cartão salvo com sucesso.");
}

function onSubmitCompra(event) {
  event.preventDefault();

  if (!state.db.cartoes.length) {
    alert("Cadastre um cartão antes de inserir uma compra.");
    return;
  }

  const cartaoId = byId("compraCartaoId").value;
  const nome = byId("compraNome").value.trim();
  const valorParcelaCentavos = parseMoneyInput(byId("compraValor").value);
  const parcelaAtual = Number(byId("compraParcelaAtual").value);
  const totalParcelas = Number(byId("compraTotalParcelas").value);

  if (!cartaoId || !nome || !valorParcelaCentavos || !parcelaAtual || !totalParcelas || parcelaAtual < 1 || totalParcelas < parcelaAtual) {
    alert("Preencha a compra corretamente.");
    return;
  }

  state.db.comprasCartao.push({
    id: generateId("compra"),
    cartaoId,
    nome,
    valorParcelaCentavos,
    parcelaAtual,
    totalParcelas
  });

  saveAndRefresh();
  clearForm("formCompra");
  alert("Compra salva com sucesso.");
}

function onSubmitRenda(event) {
  event.preventDefault();
  const nome = byId("rendaNome").value.trim();
  const valorCentavos = parseMoneyInput(byId("rendaValor").value);

  if (!nome || !valorCentavos) {
    alert("Preencha a renda corretamente.");
    return;
  }

  state.db.rendas.push({
    id: generateId("renda"),
    nome,
    valorCentavos
  });

  saveAndRefresh();
  clearForm("formRenda");
}

function clearForm(formId) {
  const form = byId(formId);
  form.reset();
  form.querySelectorAll(".money-input").forEach(input => input.value = "");
}

/* =========================================================
   PROJEÇÃO E SAÚDE FINANCEIRA
   ========================================================= */
function recalculateProjection() {
  state.projection = buildProjection(state.db);
  if (state.monthIndex >= state.projection.length) state.monthIndex = 0;
}

function buildProjection(db) {
  const months = [];
  const rendaTotalCentavos = db.rendas.reduce((sum, renda) => sum + renda.valorCentavos, 0);
  const start = new Date();
  start.setDate(1);

  for (let offset = 0; offset < PROJECAO_MESES; offset++) {
    const ref = new Date(start.getFullYear(), start.getMonth() + offset, 1);

    const monthData = {
      offset,
      date: ref,
      label: `${MONTH_NAMES[ref.getMonth()]} de ${ref.getFullYear()}`,
      rendaTotalCentavos,
      totalCentavos: 0,
      saldoCentavos: 0,
      comprometimento: 0,
      status: "yellow",
      statusText: "Atenção",
      fixas: { totalCentavos: 0, items: [] },
      cartoes: { totalCentavos: 0, items: [] }
    };

    db.dividasFixas.forEach(divida => {
      if (divida.parcelasRestantes > offset) {
        monthData.fixas.items.push({
  ...divida,
  tipo: "fixa",
  dueDay: divida.dueDay || 1
});
        monthData.fixas.totalCentavos += divida.valorCentavos;
        monthData.totalCentavos += divida.valorCentavos;
      }
    });

    db.cartoes.forEach(cartao => {
      const comprasAtivas = db.comprasCartao
        .filter(compra => compra.cartaoId === cartao.id)
        .filter(compra => (compra.totalParcelas - compra.parcelaAtual + 1) > offset)
        .map(compra => ({
          ...compra,
          parcelasRestantes: compra.totalParcelas - compra.parcelaAtual + 1,
          tipo: "compra"
        }));

      const comprasTotal = comprasAtivas.reduce((sum, c) => sum + c.valorParcelaCentavos, 0);
      const anuidade = Number(cartao.anuidadeCentavos || 0);
      const totalCartao = comprasTotal + anuidade;

      if (comprasAtivas.length || anuidade > 0) {
       monthData.cartoes.items.push({
  id: cartao.id,
  nome: cartao.nome,
  dueDay: cartao.dueDay || 1,
  anuidadeCentavos: anuidade,
  totalCentavos: totalCartao,
  compras: comprasAtivas,
  tipo: "cartao"
});
        monthData.cartoes.totalCentavos += totalCartao;
        monthData.totalCentavos += totalCartao;
        monthData.saldoCentavos = rendaTotalCentavos - monthData.totalCentavos;
        monthData.comprometimento = rendaTotalCentavos > 0 ? monthData.totalCentavos / rendaTotalCentavos : (monthData.totalCentavos > 0 ? 999 : 0);

      }
    });

    monthData.fixas.items.sort((a, b) => (a.dueDay || 1) - (b.dueDay || 1));
    monthData.cartoes.items.sort((a, b) => (a.dueDay || 1) - (b.dueDay || 1));

    const statusObj = getFinancialStatus(monthData.totalCentavos, rendaTotalCentavos);
    monthData.status = statusObj.status;
    monthData.statusText = statusObj.text;

    months.push(monthData);
  }

  return months;
}

function getFinancialStatus(dividas, renda) {
  if (renda <= 0 && dividas <= 0) return { status: "yellow", text: "Sem rendas e sem dívidas" };
  if (renda <= 0 && dividas > 0) return { status: "red", text: "Sem renda cadastrada" };

  const ratio = dividas / renda;
  if (ratio < 0.7) return { status: "green", text: "Situação saudável" };
  if (ratio <= 1) return { status: "yellow", text: "Atenção com os gastos" };
  return { status: "red", text: "Dívidas maiores que renda" };
}

function getCurrentMonthData() {
  return state.projection[state.monthIndex] || emptyProjectionMonth();
}

  

/* =========================================================
   RENDER CONSULTA
   ========================================================= */
function renderConsulta() {
  renderRendas();
  renderHealthCard();
  renderMonthProjection();
  renderResumo36();
  renderCalendarioFimDividas();
}

function renderRendas() {
  const container = byId("listaRendas");
  container.innerHTML = "";

  if (!state.db.rendas.length) {
    container.appendChild(emptyNode("Nenhuma renda cadastrada."));
    return;
  }

  state.db.rendas.forEach(renda => {
    const isEditing = state.editing.type === "renda" && state.editing.id === renda.id;
    const card = document.createElement("div");
    card.className = "summary-item";

    if (isEditing) {
      card.appendChild(buildEditRendaForm(renda));
    } else {
      card.innerHTML = `
        <div class="row-between">
          <div>
            <div class="title">${escapeHtml(renda.nome)}</div>
          </div>
          <strong>${formatCurrency(renda.valorCentavos)}</strong>
        </div>
      `;
      card.appendChild(buildActions({
        onEdit: () => startEditing("renda", renda.id),
        onDelete: () => deleteRenda(renda.id)
      }));
    }

    container.appendChild(card);
  });
}

function renderHealthCard() {
  const month = getCurrentMonthData();
  const card = byId("cardSaudeFinanceira");
  card.classList.remove("status-green", "status-yellow", "status-red");
  card.classList.add(`status-${month.status}`);

  byId("saudeRenda").textContent = formatCurrency(month.rendaTotalCentavos);
  byId("saudeDividas").textContent = formatCurrency(month.totalCentavos);
  byId("saudeSaldo").textContent = formatCurrency(month.saldoCentavos);
  byId("saudeComprometimento").textContent = formatPercent(month.comprometimento);
  byId("saudeStatusTexto").textContent = month.statusText;
}

function renderMonthProjection() {
  const month = getCurrentMonthData();

  byId("mesTitulo").textContent = month.label;
  byId("mesSubtitulo").textContent = `Mês ${state.monthIndex + 1} de ${PROJECAO_MESES}`;
  byId("totalMes").textContent = formatCurrency(month.totalCentavos);

  byId("painelResumoMes").innerHTML = `
    <div class="summary-line">
      <span>Dívidas fixas</span>
      <strong>${formatCurrency(month.fixas.totalCentavos)}</strong>
    </div>
    <div class="summary-line">
      <span>Cartões</span>
      <strong>${formatCurrency(month.cartoes.totalCentavos)}</strong>
    </div>
    <div class="summary-line">
      <span>Status</span>
      <span class="projection-status ${month.status}">${month.statusText}</span>
    </div>
  `;

  renderCategorias(month);
}

function renderCategorias(month) {
  const container = byId("painelCategorias");
  container.innerHTML = "";

  container.appendChild(createCategoryCard({
    key: "fixas",
    title: "Dívidas fixas",
    totalCentavos: month.fixas.totalCentavos,
    itemsCount: month.fixas.items.length,
    detailRenderer: () => renderFixasDetalhes(month)
  }));

  container.appendChild(createCategoryCard({
    key: "cartoes",
    title: "Cartões",
    totalCentavos: month.cartoes.totalCentavos,
    itemsCount: month.cartoes.items.length,
    detailRenderer: () => renderCartoesDetalhes(month)
  }));
}

function createCategoryCard({ key, title, totalCentavos, itemsCount, detailRenderer }) {
  const wrapper = document.createElement("div");
  wrapper.className = "category-card";

  const isExpanded = !!state.expandedCategories[key];
  wrapper.innerHTML = `
    <div class="row-between">
      <div>
        <div class="title">${title}</div>
        <div class="muted">${itemsCount} item(ns)</div>
      </div>
      <div style="text-align:right">
        <div><strong>${formatCurrency(totalCentavos)}</strong></div>
        <button class="btn btn-ghost btn-small" type="button">${isExpanded ? "Ocultar" : "Ver detalhes"}</button>
      </div>
    </div>
  `;

  wrapper.querySelector("button").addEventListener("click", () => {
    state.expandedCategories[key] = !state.expandedCategories[key];
    renderConsulta();
  });

  if (isExpanded) {
    const detailBox = document.createElement("div");
    detailBox.className = "indent";
    detailRenderer().forEach(node => detailBox.appendChild(node));
    wrapper.appendChild(detailBox);
  }

  return wrapper;
}

function renderFixasDetalhes(month) {
  if (!month.fixas.items.length) return [emptyNode("Nenhuma dívida fixa ativa neste mês.")];

  return month.fixas.items.map(item => {
    const div = document.createElement("div");
    div.className = "detail-card";
    div.innerHTML = `
  <div class="row-between">
    <div>
      <div class="title">${escapeHtml(item.nome)}</div>
      <div class="muted">
        Vence dia ${item.dueDay || "-"} • ${item.parcelasRestantes} parcela(s) restantes
      </div>
    </div>
    <strong>${formatCurrency(item.valorCentavos)}</strong>
  </div>
`;
    return div;
  });
}

function renderCartoesDetalhes(month) {
  if (!month.cartoes.items.length) return [emptyNode("Nenhum cartão ativo neste mês.")];

  return month.cartoes.items.map(cartao => {
    const div = document.createElement("div");
    div.className = "detail-card";

    const isExpanded = !!state.expandedCards[cartao.id];
    div.innerHTML = `
      <div class="row-between">
        <div>
          <div class="title">${escapeHtml(cartao.nome)}</div>
         
        </div>
        <div style="text-align:right">
          <div><strong>${formatCurrency(cartao.totalCentavos)}</strong></div>
          <button class="btn btn-ghost btn-small" type="button">${isExpanded ? "Ocultar" : "Ver parcelas"}</button>
        </div>
      </div>
    `;

    div.querySelector("button").addEventListener("click", () => {
      state.expandedCards[cartao.id] = !state.expandedCards[cartao.id];
      renderConsulta();
    });

    if (isExpanded) {
      const nested = document.createElement("div");
      nested.className = "indent";

      if (cartao.anuidadeCentavos > 0) {
        const node = document.createElement("div");
        node.className = "summary-item";
        node.innerHTML = `
          <div class="row-between">
            <span class="title">Anuidade</span>
            <strong>${formatCurrency(cartao.anuidadeCentavos)}</strong>
          </div>
        `;
        nested.appendChild(node);
      }

      if (cartao.compras.length) {
        cartao.compras.forEach(compra => {
          const node = document.createElement("div");
          node.className = "summary-item";
          node.innerHTML = `
            <div class="row-between">
              <div>
                <div class="title">${escapeHtml(compra.nome)}</div>
                <div class="muted">Parcela ${compra.parcelaAtual}/${compra.totalParcelas}</div>
              </div>
              <strong>${formatCurrency(compra.valorParcelaCentavos)}</strong>
            </div>
          `;
          nested.appendChild(node);
        });
      } else {
        nested.appendChild(emptyNode("Somente anuidade neste mês."));
      }

      div.appendChild(nested);
    }

    <div class="muted">
  Vence dia ${cartao.dueDay || "-"} • ${cartao.compras.length} compra(s)
</div>

    return div;
  });
}

function toggleResumo36() {
  state.resumo36Aberto = !state.resumo36Aberto;
  renderResumo36();
}

function renderResumo36() {
  const box = byId("painelResumo36");
  const list = byId("listaResumo36");
  const btn = byId("btnToggleResumo36");

  box.classList.toggle("hidden", !state.resumo36Aberto);
  btn.textContent = state.resumo36Aberto ? "Ocultar 36 meses" : "Ver 36 meses";

  list.innerHTML = "";
  if (!state.resumo36Aberto) return;

  state.projection.forEach((month, index) => {
    const item = document.createElement("div");
    item.className = "summary-item";
    item.innerHTML = `
      <div class="row-between">
        <div>
          <div class="title">${month.label}</div>
          <div class="muted">${month.statusText}</div>
        </div>
        <div style="text-align:right">
          <div><strong>${formatCurrency(month.saldoCentavos)}</strong></div>
          <span class="projection-status ${month.status}">${formatPercent(month.comprometimento)}</span>
        </div>
      </div>
    `;
    item.addEventListener("click", () => {
      state.monthIndex = index;
      renderConsulta();
    });
    list.appendChild(item);
  });
}

function renderCalendarioFimDividas() {
  const container = byId("calendarioFimDividas");
  container.innerHTML = "";

  const timeline = buildTimeline();
  if (!timeline.length) {
    container.appendChild(emptyNode("Nenhuma data de encerramento disponível."));
    return;
  }

  timeline.forEach(item => {
    const div = document.createElement("div");
    div.className = "timeline-item";
    div.innerHTML = `
      <div class="row-between">
        <div>
          <div class="title">${item.label}</div>
          <div class="muted">${escapeHtml(item.nome)}</div>
        </div>
        <span class="tag">${item.tipoLabel}</span>
      </div>
    `;
    container.appendChild(div);
  });
}

function buildTimeline() {
  const list = [];
  const start = new Date();
  start.setDate(1);

  state.db.dividasFixas.forEach(item => {
    const endOffset = item.parcelasRestantes - 1;
    if (endOffset >= 0) {
      list.push({
  nome: item.nome,
  tipoLabel: "Dívida fixa",
  dueDay: item.dueDay,
  date: new Date(start.getFullYear(), start.getMonth() + endOffset, item.dueDay || 1)
});
    }
  });

  state.db.comprasCartao.forEach(item => {
    const restantes = item.totalParcelas - item.parcelaAtual + 1;
    const endOffset = restantes - 1;
    if (endOffset >= 0) {
      list.push({
        nome: item.nome,
        tipoLabel: "Compra do cartão",
        date: new Date(start.getFullYear(), start.getMonth() + endOffset, 1)
      });
    }
  });

  list.sort((a, b) => a.date - b.date);
  return list.map(item => ({
    ...item,
    label: `${item.date.getDate()} ${MONTH_NAMES[item.date.getMonth()]} de ${item.date.getFullYear()}`
  }));
}

function previousMonth() {
  if (state.monthIndex > 0) {
    state.monthIndex--;
    renderConsulta();
  }
}

function nextMonth() {
  if (state.monthIndex < PROJECAO_MESES - 1) {
    state.monthIndex++;
    renderConsulta();
  }
}

/* =========================================================
   SIMULADOR
   ========================================================= */
function onSubmitSimulador(event) {
  event.preventDefault();
  const nome = byId("simNome").value.trim();
  const valorCentavos = parseMoneyInput(byId("simValor").value);
  const parcelas = Number(byId("simParcelas").value);

  if (!nome || !valorCentavos || !parcelas || parcelas < 1) {
    alert("Preencha a simulação corretamente.");
    return;
  }

  state.simulation = { nome, valorCentavos, parcelas };
  renderSimulation();
}

function clearSimulation() {
  state.simulation = null;
  byId("formSimulador").reset();
  byId("simValor").value = "";
  renderSimulation();
}

function renderSimulation() {
  const container = byId("resultadoSimulacao");
  container.innerHTML = "";

  if (!state.simulation) {
    container.appendChild(emptyNode("Nenhuma dívida simulada."));
    return;
  }

  state.projection.forEach((month, index) => {
    const simAtiva = index < state.simulation.parcelas;
    const novoTotal = month.totalCentavos + (simAtiva ? state.simulation.valorCentavos : 0);
    const novaRenda = month.rendaTotalCentavos;
    const novoSaldo = novaRenda - novoTotal;
    const novoStatus = getFinancialStatus(novoTotal, novaRenda);
    const comprometimento = novaRenda > 0 ? novoTotal / novaRenda : (novoTotal > 0 ? 999 : 0);

    const item = document.createElement("div");
    item.className = "summary-item";
    item.innerHTML = `
      <div class="row-between">
        <div>
          <div class="title">${month.label}</div>
          <div class="muted">${simAtiva ? "Simulação ativa" : "Sem impacto da simulação"}</div>
        </div>
        <div style="text-align:right">
          <div><strong>${formatCurrency(novoSaldo)}</strong></div>
          <span class="projection-status ${novoStatus.status}">${novoStatus.text}</span>
          <div class="muted">${formatPercent(comprometimento)}</div>
        </div>
      </div>
    `;
    container.appendChild(item);
  });
}

/* =========================================================
   REGISTROS E EDIÇÃO EM TELA
   ========================================================= */
function renderRegistros() {
  const container = byId("listaRegistros");
  container.innerHTML = "";

  const hasAny = state.db.dividasFixas.length || state.db.cartoes.length || state.db.comprasCartao.length;
  if (!hasAny) {
    container.appendChild(emptyNode("Nenhum registro cadastrado ainda."));
    return;
  }

  if (state.db.dividasFixas.length) {
    const block = document.createElement("div");
    block.className = "record-card";
    block.innerHTML = `<div class="row-between"><span class="title">Dívidas fixas</span><span class="tag">${state.db.dividasFixas.length}</span></div>`;
    const nested = document.createElement("div");
    nested.className = "indent";

    state.db.dividasFixas.forEach(item => {
      const row = document.createElement("div");
      row.className = "summary-item";

      if (state.editing.type === "fixa" && state.editing.id === item.id) {
        row.appendChild(buildEditFixaForm(item));
      } else {
        row.innerHTML = `
          <div class="row-between">
            <div>
              <div class="title">${escapeHtml(item.nome)}</div>
              <div class="muted">${item.parcelasRestantes} parcela(s) restantes</div>
            </div>
            <strong>${formatCurrency(item.valorCentavos)}</strong>
          </div>
        `;
        row.appendChild(buildActions({
          onEdit: () => startEditing("fixa", item.id),
          onDelete: () => deleteFixa(item.id)
        }));
      }

      nested.appendChild(row);
    });

    block.appendChild(nested);
    container.appendChild(block);
  }

  if (state.db.cartoes.length) {
    const block = document.createElement("div");
    block.className = "record-card";
    block.innerHTML = `<div class="row-between"><span class="title">Cartões</span><span class="tag">${state.db.cartoes.length}</span></div>`;
    const nested = document.createElement("div");
    nested.className = "indent";

    state.db.cartoes.forEach(cartao => {
      const compras = state.db.comprasCartao.filter(c => c.cartaoId === cartao.id);

      const row = document.createElement("div");
      row.className = "summary-item";

      if (state.editing.type === "cartao" && state.editing.id === cartao.id) {
        row.appendChild(buildEditCartaoForm(cartao));
      } else {
        row.innerHTML = `
          <div class="row-between">
            <div>
              <div class="title">${escapeHtml(cartao.nome)}</div>
              <div class="muted">${compras.length} compra(s) vinculada(s)</div>
            </div>
            <strong>${formatCurrency(cartao.anuidadeCentavos || 0)}</strong>
          </div>
        `;
        row.appendChild(buildActions({
          onEdit: () => startEditing("cartao", cartao.id),
          onDelete: () => deleteCartao(cartao.id)
        }));
      }

      if (compras.length) {
        const nestedCompras = document.createElement("div");
        nestedCompras.className = "indent";

        compras.forEach(compra => {
          const compraNode = document.createElement("div");
          compraNode.className = "summary-item";

          if (state.editing.type === "compra" && state.editing.id === compra.id) {
            compraNode.appendChild(buildEditCompraForm(compra));
          } else {
            compraNode.innerHTML = `
              <div class="row-between">
                <div>
                  <div class="title">${escapeHtml(compra.nome)}</div>
                  <div class="muted">Parcela ${compra.parcelaAtual}/${compra.totalParcelas}</div>
                </div>
                <strong>${formatCurrency(compra.valorParcelaCentavos)}</strong>
              </div>
            `;
            compraNode.appendChild(buildActions({
              onEdit: () => startEditing("compra", compra.id),
              onDelete: () => deleteCompra(compra.id)
            }));
          }

          nestedCompras.appendChild(compraNode);
        });

        row.appendChild(nestedCompras);
      }

      nested.appendChild(row);
    });

    block.appendChild(nested);
    container.appendChild(block);
  }
}

function renderRendasAfterEdit() {
  renderConsulta();
}

function startEditing(type, id) {
  state.editing = { type, id };
  renderAll();
}

function stopEditing() {
  state.editing = { type: null, id: null };
  renderAll();
}

function buildActions({ onEdit, onDelete }) {
  const actions = document.createElement("div");
  actions.className = "record-actions";

  const editBtn = document.createElement("button");
  editBtn.className = "btn btn-secondary btn-small";
  editBtn.type = "button";
  editBtn.textContent = "Editar";
  editBtn.addEventListener("click", onEdit);

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn btn-danger btn-small";
  deleteBtn.type = "button";
  deleteBtn.textContent = "Excluir";
  deleteBtn.addEventListener("click", onDelete);

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);
  return actions;
}

function buildEditFixaForm(item) {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="form-grid">
      <label>Nome da dívida</label>
      <input type="text" class="edit-fixa-nome" value="${escapeAttribute(item.nome)}">

      <label>Valor mensal</label>
      <input type="text" class="money-input edit-fixa-valor" inputmode="numeric" value="${formatCurrency(item.valorCentavos)}">

      <label>Parcelas restantes</label>
      <input type="number" class="edit-fixa-parcelas" min="1" max="999" value="${item.parcelasRestantes}">

      <div class="form-actions">
        <button type="button" class="btn btn-primary">Salvar</button>
        <button type="button" class="btn btn-secondary">Cancelar</button>
      </div>
    </div>
  `;

  const money = wrap.querySelector(".edit-fixa-valor");
  bindMoneyInput(money);

  const [saveBtn, cancelBtn] = wrap.querySelectorAll("button");
  saveBtn.addEventListener("click", () => {
    const nome = wrap.querySelector(".edit-fixa-nome").value.trim();
    const valorCentavos = parseMoneyInput(wrap.querySelector(".edit-fixa-valor").value);
    const parcelasRestantes = Number(wrap.querySelector(".edit-fixa-parcelas").value);

    if (!nome || !valorCentavos || !parcelasRestantes || parcelasRestantes < 1) {
      alert("Dados inválidos.");
      return;
    }

    item.nome = nome;
    item.valorCentavos = valorCentavos;
    item.parcelasRestantes = parcelasRestantes;
    saveAndRefresh();
    stopEditing();
  });

  cancelBtn.addEventListener("click", stopEditing);
  return wrap;
}

function buildEditCartaoForm(item) {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="form-grid">
      <label>Nome do cartão</label>
      <input type="text" class="edit-cartao-nome" value="${escapeAttribute(item.nome)}">

      <label>Anuidade mensal</label>
      <input type="text" class="money-input edit-cartao-anuidade" inputmode="numeric" value="${formatCurrency(item.anuidadeCentavos || 0)}">

      <div class="form-actions">
        <button type="button" class="btn btn-primary">Salvar</button>
        <button type="button" class="btn btn-secondary">Cancelar</button>
      </div>
    </div>
  `;

  const money = wrap.querySelector(".edit-cartao-anuidade");
  bindMoneyInput(money);

  const [saveBtn, cancelBtn] = wrap.querySelectorAll("button");
  saveBtn.addEventListener("click", () => {
    const nome = wrap.querySelector(".edit-cartao-nome").value.trim();
    const anuidadeCentavos = parseMoneyInput(wrap.querySelector(".edit-cartao-anuidade").value);

    if (!nome) {
      alert("Dados inválidos.");
      return;
    }

    item.nome = nome;
    item.anuidadeCentavos = anuidadeCentavos;
    saveAndRefresh();
    stopEditing();
  });

  cancelBtn.addEventListener("click", stopEditing);
  return wrap;
}

function buildEditCompraForm(item) {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="form-grid">
      <label>Nome da compra</label>
      <input type="text" class="edit-compra-nome" value="${escapeAttribute(item.nome)}">

      <label>Valor da parcela</label>
      <input type="text" class="money-input edit-compra-valor" inputmode="numeric" value="${formatCurrency(item.valorParcelaCentavos)}">

      <label>Parcela atual</label>
      <input type="number" class="edit-compra-atual" min="1" max="999" value="${item.parcelaAtual}">

      <label>Total de parcelas</label>
      <input type="number" class="edit-compra-total" min="1" max="999" value="${item.totalParcelas}">

      <div class="form-actions">
        <button type="button" class="btn btn-primary">Salvar</button>
        <button type="button" class="btn btn-secondary">Cancelar</button>
      </div>
    </div>
  `;

  const money = wrap.querySelector(".edit-compra-valor");
  bindMoneyInput(money);

  const [saveBtn, cancelBtn] = wrap.querySelectorAll("button");
  saveBtn.addEventListener("click", () => {
    const nome = wrap.querySelector(".edit-compra-nome").value.trim();
    const valorParcelaCentavos = parseMoneyInput(wrap.querySelector(".edit-compra-valor").value);
    const parcelaAtual = Number(wrap.querySelector(".edit-compra-atual").value);
    const totalParcelas = Number(wrap.querySelector(".edit-compra-total").value);

    if (!nome || !valorParcelaCentavos || !parcelaAtual || !totalParcelas || totalParcelas < parcelaAtual) {
      alert("Dados inválidos.");
      return;
    }

    item.nome = nome;
    item.valorParcelaCentavos = valorParcelaCentavos;
    item.parcelaAtual = parcelaAtual;
    item.totalParcelas = totalParcelas;
    saveAndRefresh();
    stopEditing();
  });

  cancelBtn.addEventListener("click", stopEditing);
  return wrap;
}

function buildEditRendaForm(item) {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="form-grid">
      <label>Nome da renda</label>
      <input type="text" class="edit-renda-nome" value="${escapeAttribute(item.nome)}">

      <label>Valor</label>
      <input type="text" class="money-input edit-renda-valor" inputmode="numeric" value="${formatCurrency(item.valorCentavos)}">

      <div class="form-actions">
        <button type="button" class="btn btn-primary">Salvar</button>
        <button type="button" class="btn btn-secondary">Cancelar</button>
      </div>
    </div>
  `;

  const money = wrap.querySelector(".edit-renda-valor");
  bindMoneyInput(money);

  const [saveBtn, cancelBtn] = wrap.querySelectorAll("button");
  saveBtn.addEventListener("click", () => {
    const nome = wrap.querySelector(".edit-renda-nome").value.trim();
    const valorCentavos = parseMoneyInput(wrap.querySelector(".edit-renda-valor").value);

    if (!nome || !valorCentavos) {
      alert("Dados inválidos.");
      return;
    }

    item.nome = nome;
    item.valorCentavos = valorCentavos;
    saveAndRefresh();
    stopEditing();
  });

  cancelBtn.addEventListener("click", stopEditing);
  return wrap;
}

/* =========================================================
   EXCLUSÃO
   ========================================================= */
function deleteFixa(id) {
  if (!confirm("Tem certeza que deseja excluir esta dívida?")) return;
  state.db.dividasFixas = state.db.dividasFixas.filter(x => x.id !== id);
  saveAndRefresh();
}

function deleteCartao(id) {
  if (!confirm("Tem certeza que deseja excluir este cartão e todas as compras vinculadas?")) return;
  state.db.cartoes = state.db.cartoes.filter(x => x.id !== id);
  state.db.comprasCartao = state.db.comprasCartao.filter(x => x.cartaoId !== id);
  saveAndRefresh();
}

function deleteCompra(id) {
  if (!confirm("Tem certeza que deseja excluir esta compra?")) return;
  state.db.comprasCartao = state.db.comprasCartao.filter(x => x.id !== id);
  saveAndRefresh();
}

function deleteRenda(id) {
  if (!confirm("Tem certeza que deseja excluir esta renda?")) return;
  state.db.rendas = state.db.rendas.filter(x => x.id !== id);
  saveAndRefresh();
}

/* =========================================================
   UTILITÁRIOS
   ========================================================= */
function saveAndRefresh() {
  saveDB();
  recalculateProjection();
  renderAll();
}

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function byId(id) {
  return document.getElementById(id);
}

function emptyNode(message) {
  const div = document.createElement("div");
  div.className = "empty-state";
  div.textContent = message;
  return div;
}

function formatPercent(value) {
  if (!isFinite(value) || value >= 999) return "100%+";
  return `${Math.round(value * 100)}%`;
}

function emptyProjectionMonth() {
  return {
    label: "Sem dados",
    rendaTotalCentavos: 0,
    totalCentavos: 0,
    saldoCentavos: 0,
    comprometimento: 0,
    status: "yellow",
    statusText: "Sem dados",
    fixas: { totalCentavos: 0, items: [] },
    cartoes: { totalCentavos: 0, items: [] }
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

/* =========================================================
   SERVICE WORKER
   ========================================================= */
function registerSW() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        await navigator.serviceWorker.register("./sw.js");
        console.log("Service Worker registrado com sucesso.");
      } catch (error) {
        console.error("Erro ao registrar Service Worker:", error);
      }
    });
  }
}

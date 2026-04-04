/* =========================================================
   CONTROLE DE DÍVIDAS - APP.JS
   Aplicativo PWA sem login e sem Firebase.
   Dados salvos localmente no localStorage.
   ========================================================= */

const STORAGE_KEY = "controle_dividas_v1";
const THEME_KEY = "controle_dividas_tema";
const PROJECAO_MESES = 36;

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const state = {
  screen: "menu",
  monthIndex: 0,
  resumo36Aberto: false,
  expandedCategories: {
    fixas: false,
    cartoes: false
  },
  expandedCards: {},
  db: loadDB(),
  projection: []
};

/* =========================================================
   1. INICIALIZAÇÃO
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  applySavedTheme();
  recalculateProjection();
  renderAll();
  registerSW();
});

function bindEvents() {
  document.getElementById("btnTema").addEventListener("click", toggleTheme);
  document.getElementById("btnIrInserir").addEventListener("click", () => showScreen("inserir"));
  document.getElementById("btnIrConsultar").addEventListener("click", () => showScreen("consultar"));
  document.getElementById("btnMesAnterior").addEventListener("click", previousMonth);
  document.getElementById("btnMesSeguinte").addEventListener("click", nextMonth);
  document.getElementById("btnToggleResumo36").addEventListener("click", toggleResumo36);
  document.getElementById("tipoCadastro").addEventListener("change", updateCadastroForms);

  document.querySelectorAll("[data-back]").forEach(btn => {
    btn.addEventListener("click", () => showScreen(btn.dataset.back));
  });

  document.getElementById("formFixa").addEventListener("submit", onSubmitFixa);
  document.getElementById("formCartao").addEventListener("submit", onSubmitCartao);
  document.getElementById("formCompra").addEventListener("submit", onSubmitCompra);

  document.querySelectorAll(".money-input").forEach(input => {
    input.addEventListener("input", onMoneyInput);
    input.addEventListener("focus", () => {
      if (!input.value.trim()) input.value = formatMoneyFromDigits("");
    });
  });
}

/* =========================================================
   2. BANCO LOCAL (LOCALSTORAGE)
   ========================================================= */
function defaultDB() {
  return {
    dividasFixas: [],
    cartoes: [],
    comprasCartao: []
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
      comprasCartao: Array.isArray(parsed.comprasCartao) ? parsed.comprasCartao : []
    };
  } catch {
    return defaultDB();
  }
}

function saveDB() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.db));
}

/* =========================================================
   3. TEMA CLARO/ESCURO
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
  const isDark = document.body.classList.contains("dark");
  document.getElementById("btnTema").textContent = isDark ? "☀ Tema" : "🌙 Tema";
}

/* =========================================================
   4. NAVEGAÇÃO DE TELAS
   ========================================================= */
function showScreen(screen) {
  state.screen = screen;
  document.querySelectorAll(".screen").forEach(section => section.classList.remove("active"));
  document.getElementById(`screen-${screen}`).classList.add("active");

  if (screen === "consultar") {
    renderConsulta();
  }
  if (screen === "inserir") {
    renderRegistros();
    updateCadastroForms();
    fillCartaoSelect();
  }
}

function renderAll() {
  renderRegistros();
  renderConsulta();
  updateCadastroForms();
  fillCartaoSelect();
}

/* =========================================================
   5. MÁSCARA MONETÁRIA - VÍRGULA FLUTUANTE
   Guardamos valores em centavos para manter precisão.
   Ex.: usuário digita 550 -> campo mostra R$ 5,50
   ========================================================= */
function onMoneyInput(event) {
  event.target.value = formatMoneyFromDigits(event.target.value);
}

function formatMoneyFromDigits(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const normalized = digits ? Number(digits) : 0;
  return formatCurrency(normalized);
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
   6. FORMULÁRIOS DE CADASTRO
   ========================================================= */
function updateCadastroForms() {
  const tipo = document.getElementById("tipoCadastro").value;
  document.getElementById("formFixa").classList.toggle("hidden", tipo !== "fixa");
  document.getElementById("formCartao").classList.toggle("hidden", tipo !== "cartao");
  document.getElementById("formCompra").classList.toggle("hidden", tipo !== "compra");

  const formCompra = document.getElementById("formCompra");
  const hasCards = state.db.cartoes.length > 0;
  const alertId = "compraNoCardsAlert";
  let alertEl = document.getElementById(alertId);

  if (tipo === "compra" && !hasCards) {
    if (!alertEl) {
      alertEl = document.createElement("div");
      alertEl.id = alertId;
      alertEl.className = "alert-inline";
      alertEl.textContent = "Cadastre um cartão antes de inserir uma compra.";
      formCompra.appendChild(alertEl);
    }
  } else if (alertEl) {
    alertEl.remove();
  }
}

function fillCartaoSelect() {
  const select = document.getElementById("compraCartaoId");
  const currentValue = select.value;
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

  if (currentValue && state.db.cartoes.some(c => c.id === currentValue)) {
    select.value = currentValue;
  }
}

function onSubmitFixa(event) {
  event.preventDefault();

  const nome = document.getElementById("fixaNome").value.trim();
  const valorCentavos = parseMoneyInput(document.getElementById("fixaValor").value);
  const parcelasRestantes = Number(document.getElementById("fixaParcelas").value);

  if (!nome || !valorCentavos || !parcelasRestantes || parcelasRestantes < 1) {
    alert("Preencha nome, valor e parcelas restantes corretamente.");
    return;
  }

  state.db.dividasFixas.push({
    id: generateId("fixa"),
    nome,
    valorCentavos,
    parcelasRestantes
  });

  saveDB();
  recalculateProjection();
  clearForm("formFixa");
  renderAll();
  alert("Dívida fixa salva com sucesso.");
}

function onSubmitCartao(event) {
  event.preventDefault();

  const nome = document.getElementById("cartaoNome").value.trim();
  const anuidadeCentavos = parseMoneyInput(document.getElementById("cartaoAnuidade").value);

  if (!nome) {
    alert("Informe o nome do cartão.");
    return;
  }

  state.db.cartoes.push({
    id: generateId("cartao"),
    nome,
    anuidadeCentavos
  });

  saveDB();
  recalculateProjection();
  clearForm("formCartao");
  renderAll();
  alert("Cartão salvo com sucesso.");
}

function onSubmitCompra(event) {
  event.preventDefault();

  if (!state.db.cartoes.length) {
    alert("Cadastre um cartão antes de inserir uma compra.");
    return;
  }

  const cartaoId = document.getElementById("compraCartaoId").value;
  const nome = document.getElementById("compraNome").value.trim();
  const valorParcelaCentavos = parseMoneyInput(document.getElementById("compraValor").value);
  const parcelaAtual = Number(document.getElementById("compraParcelaAtual").value);
  const totalParcelas = Number(document.getElementById("compraTotalParcelas").value);

  if (!cartaoId || !nome || !valorParcelaCentavos || !parcelaAtual || !totalParcelas || parcelaAtual < 1 || totalParcelas < parcelaAtual) {
    alert("Preencha todos os campos da compra corretamente.");
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

  saveDB();
  recalculateProjection();
  clearForm("formCompra");
  renderAll();
  alert("Compra salva com sucesso.");
}

function clearForm(formId) {
  const form = document.getElementById(formId);
  form.reset();
  form.querySelectorAll(".money-input").forEach(input => input.value = "");
}

/* =========================================================
   7. REGRAS DE PROJEÇÃO
   Transformamos tudo em uma estrutura uniforme e projetamos 36 meses.
   ========================================================= */
function recalculateProjection() {
  state.projection = buildProjection(state.db);
  if (state.monthIndex >= state.projection.length) state.monthIndex = 0;
}

function buildProjection(db) {
  const months = [];
  const start = new Date();
  start.setDate(1);

  for (let offset = 0; offset < PROJECAO_MESES; offset++) {
    const ref = new Date(start.getFullYear(), start.getMonth() + offset, 1);

    const monthData = {
      offset,
      label: `${MONTH_NAMES[ref.getMonth()]} de ${ref.getFullYear()}`,
      totalCentavos: 0,
      fixas: {
        totalCentavos: 0,
        items: []
      },
      cartoes: {
        totalCentavos: 0,
        items: []
      }
    };

    db.dividasFixas.forEach(divida => {
      if (divida.parcelasRestantes > offset) {
        monthData.fixas.items.push({
          id: divida.id,
          nome: divida.nome,
          valorCentavos: divida.valorCentavos,
          parcelasRestantes: divida.parcelasRestantes,
          tipo: "fixa"
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
          id: compra.id,
          nome: compra.nome,
          valorCentavos: compra.valorParcelaCentavos,
          parcelaAtual: compra.parcelaAtual,
          totalParcelas: compra.totalParcelas,
          parcelasRestantes: compra.totalParcelas - compra.parcelaAtual + 1,
          tipo: "compra"
        }));

      const comprasTotal = comprasAtivas.reduce((acc, item) => acc + item.valorCentavos, 0);
      const anuidade = Number(cartao.anuidadeCentavos || 0);
      const totalCartao = comprasTotal + anuidade;

      if (comprasAtivas.length || anuidade > 0) {
        monthData.cartoes.items.push({
          id: cartao.id,
          nome: cartao.nome,
          anuidadeCentavos: anuidade,
          totalCentavos: totalCartao,
          compras: comprasAtivas,
          tipo: "cartao"
        });

        monthData.cartoes.totalCentavos += totalCartao;
        monthData.totalCentavos += totalCartao;
      }
    });

    months.push(monthData);
  }

  return months;
}

/* =========================================================
   8. CONSULTA E VISUALIZAÇÃO EM 3 NÍVEIS
   Nível 1: resumo do mês
   Nível 2: categoria
   Nível 3: detalhe completo
   ========================================================= */
function renderConsulta() {
  const month = state.projection[state.monthIndex] || emptyProjectionMonth();

  document.getElementById("mesTitulo").textContent = month.label;
  document.getElementById("mesSubtitulo").textContent = `Mês ${state.monthIndex + 1} de ${PROJECAO_MESES}`;
  document.getElementById("totalMes").textContent = formatCurrency(month.totalCentavos);

  renderResumoMes(month);
  renderCategorias(month);
  renderResumo36();
}

function renderResumoMes(month) {
  const container = document.getElementById("painelResumoMes");
  container.innerHTML = `
    <div class="summary-line">
      <span>Dívidas fixas</span>
      <strong>${formatCurrency(month.fixas.totalCentavos)}</strong>
    </div>
    <div class="summary-line">
      <span>Cartões</span>
      <strong>${formatCurrency(month.cartoes.totalCentavos)}</strong>
    </div>
  `;
}

function renderCategorias(month) {
  const container = document.getElementById("painelCategorias");
  container.innerHTML = "";

  const fixasCard = createCategoryCard({
    key: "fixas",
    title: "Dívidas fixas",
    totalCentavos: month.fixas.totalCentavos,
    itemsCount: month.fixas.items.length,
    detailRenderer: () => renderFixasDetalhes(month)
  });

  const cartoesCard = createCategoryCard({
    key: "cartoes",
    title: "Cartões",
    totalCentavos: month.cartoes.totalCentavos,
    itemsCount: month.cartoes.items.length,
    detailRenderer: () => renderCartoesDetalhes(month)
  });

  container.appendChild(fixasCard);
  container.appendChild(cartoesCard);
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

  const button = wrapper.querySelector("button");
  button.addEventListener("click", () => {
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
          <div class="muted">${item.parcelasRestantes} parcela(s) restantes no cadastro</div>
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
    const comprasCount = cartao.compras.length;

    div.innerHTML = `
      <div class="row-between">
        <div>
          <div class="title">${escapeHtml(cartao.nome)}</div>
          <div class="muted">${comprasCount} compra(s) ativa(s)</div>
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
        const anuidadeNode = document.createElement("div");
        anuidadeNode.className = "summary-item";
        anuidadeNode.innerHTML = `
          <div class="row-between">
            <span class="title">Anuidade</span>
            <strong>${formatCurrency(cartao.anuidadeCentavos)}</strong>
          </div>
        `;
        nested.appendChild(anuidadeNode);
      }

      if (cartao.compras.length) {
        cartao.compras.forEach(compra => {
          const compraNode = document.createElement("div");
          compraNode.className = "summary-item";
          compraNode.innerHTML = `
            <div class="row-between">
              <div>
                <div class="title">${escapeHtml(compra.nome)}</div>
                <div class="muted">Parcela ${compra.parcelaAtual}/${compra.totalParcelas}</div>
              </div>
              <strong>${formatCurrency(compra.valorCentavos)}</strong>
            </div>
          `;
          nested.appendChild(compraNode);
        });
      } else {
        nested.appendChild(emptyNode("Somente anuidade neste mês."));
      }

      div.appendChild(nested);
    }

    return div;
  });
}

function toggleResumo36() {
  state.resumo36Aberto = !state.resumo36Aberto;
  renderResumo36();
}

function renderResumo36() {
  const box = document.getElementById("painelResumo36");
  const list = document.getElementById("listaResumo36");
  const btn = document.getElementById("btnToggleResumo36");

  box.classList.toggle("hidden", !state.resumo36Aberto);
  btn.textContent = state.resumo36Aberto ? "Ocultar 36 meses" : "Ver 36 meses";

  list.innerHTML = "";
  if (!state.resumo36Aberto) return;

  state.projection.forEach((month, index) => {
    const item = document.createElement("div");
    item.className = "summary-item";
    item.innerHTML = `
      <div class="row-between">
        <span class="title">${month.label}</span>
        <strong>${formatCurrency(month.totalCentavos)}</strong>
      </div>
    `;
    item.addEventListener("click", () => {
      state.monthIndex = index;
      renderConsulta();
    });
    list.appendChild(item);
  });
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

function emptyProjectionMonth() {
  return {
    label: "Sem dados",
    totalCentavos: 0,
    fixas: { totalCentavos: 0, items: [] },
    cartoes: { totalCentavos: 0, items: [] }
  };
}

/* =========================================================
   9. REGISTROS CADASTRADOS (EDIÇÃO E EXCLUSÃO)
   ========================================================= */
function renderRegistros() {
  const container = document.getElementById("listaRegistros");
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
      row.innerHTML = `
        <div class="row-between">
          <div>
            <div class="title">${escapeHtml(item.nome)}</div>
            <div class="muted">${item.parcelasRestantes} parcela(s) restantes</div>
          </div>
          <strong>${formatCurrency(item.valorCentavos)}</strong>
        </div>
      `;

      const actions = buildActions({
        onEdit: () => editFixa(item.id),
        onDelete: () => deleteFixa(item.id)
      });
      row.appendChild(actions);
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
      row.innerHTML = `
        <div class="row-between">
          <div>
            <div class="title">${escapeHtml(cartao.nome)}</div>
            <div class="muted">${compras.length} compra(s) vinculada(s)</div>
          </div>
          <strong>${formatCurrency(cartao.anuidadeCentavos || 0)}</strong>
        </div>
      `;

      const actions = buildActions({
        onEdit: () => editCartao(cartao.id),
        onDelete: () => deleteCartao(cartao.id)
      });
      row.appendChild(actions);

      if (compras.length) {
        const nestedCompras = document.createElement("div");
        nestedCompras.className = "indent";

        compras.forEach(compra => {
          const compraNode = document.createElement("div");
          compraNode.className = "summary-item";
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
            onEdit: () => editCompra(compra.id),
            onDelete: () => deleteCompra(compra.id)
          }));
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

function editFixa(id) {
  const item = state.db.dividasFixas.find(x => x.id === id);
  if (!item) return;

  const novoNome = prompt("Nome da dívida:", item.nome);
  if (novoNome === null) return;

  const novoValor = prompt("Digite o novo valor em formato numérico simples.\nExemplo: 120000 para R$ 1.200,00", String(item.valorCentavos));
  if (novoValor === null) return;

  const novasParcelas = prompt("Parcelas restantes:", String(item.parcelasRestantes));
  if (novasParcelas === null) return;

  const valorCentavos = Number(String(novoValor).replace(/\D/g, ""));
  const parcelasRestantes = Number(novasParcelas);

  if (!novoNome.trim() || !valorCentavos || !parcelasRestantes || parcelasRestantes < 1) {
    alert("Dados inválidos. Alteração cancelada.");
    return;
  }

  item.nome = novoNome.trim();
  item.valorCentavos = valorCentavos;
  item.parcelasRestantes = parcelasRestantes;

  saveDB();
  recalculateProjection();
  renderAll();
  alert("Dívida fixa atualizada.");
}

function deleteFixa(id) {
  if (!confirm("Tem certeza que deseja excluir esta dívida?")) return;
  state.db.dividasFixas = state.db.dividasFixas.filter(x => x.id !== id);
  saveDB();
  recalculateProjection();
  renderAll();
}

function editCartao(id) {
  const item = state.db.cartoes.find(x => x.id === id);
  if (!item) return;

  const novoNome = prompt("Nome do cartão:", item.nome);
  if (novoNome === null) return;

  const novaAnuidade = prompt("Digite a nova anuidade mensal em formato numérico simples.\nExemplo: 2500 para R$ 25,00", String(item.anuidadeCentavos || 0));
  if (novaAnuidade === null) return;

  const anuidadeCentavos = Number(String(novaAnuidade).replace(/\D/g, ""));

  if (!novoNome.trim()) {
    alert("Nome inválido. Alteração cancelada.");
    return;
  }

  item.nome = novoNome.trim();
  item.anuidadeCentavos = anuidadeCentavos;

  saveDB();
  recalculateProjection();
  renderAll();
  alert("Cartão atualizado.");
}

function deleteCartao(id) {
  if (!confirm("Tem certeza que deseja excluir este cartão e todas as compras vinculadas?")) return;
  state.db.cartoes = state.db.cartoes.filter(x => x.id !== id);
  state.db.comprasCartao = state.db.comprasCartao.filter(x => x.cartaoId !== id);
  saveDB();
  recalculateProjection();
  renderAll();
}

function editCompra(id) {
  const item = state.db.comprasCartao.find(x => x.id === id);
  if (!item) return;

  const novoNome = prompt("Nome da compra:", item.nome);
  if (novoNome === null) return;

  const novoValor = prompt("Digite o novo valor da parcela em formato numérico simples.\nExemplo: 12000 para R$ 120,00", String(item.valorParcelaCentavos));
  if (novoValor === null) return;

  const novaAtual = prompt("Parcela atual:", String(item.parcelaAtual));
  if (novaAtual === null) return;

  const novoTotal = prompt("Total de parcelas:", String(item.totalParcelas));
  if (novoTotal === null) return;

  const valorParcelaCentavos = Number(String(novoValor).replace(/\D/g, ""));
  const parcelaAtual = Number(novaAtual);
  const totalParcelas = Number(novoTotal);

  if (!novoNome.trim() || !valorParcelaCentavos || !parcelaAtual || !totalParcelas || parcelaAtual < 1 || totalParcelas < parcelaAtual) {
    alert("Dados inválidos. Alteração cancelada.");
    return;
  }

  item.nome = novoNome.trim();
  item.valorParcelaCentavos = valorParcelaCentavos;
  item.parcelaAtual = parcelaAtual;
  item.totalParcelas = totalParcelas;

  saveDB();
  recalculateProjection();
  renderAll();
  alert("Compra atualizada.");
}

function deleteCompra(id) {
  if (!confirm("Tem certeza que deseja excluir esta compra?")) return;
  state.db.comprasCartao = state.db.comprasCartao.filter(x => x.id !== id);
  saveDB();
  recalculateProjection();
  renderAll();
}

/* =========================================================
   10. UTILITÁRIOS
   ========================================================= */
function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function emptyNode(message) {
  const div = document.createElement("div");
  div.className = "empty-state";
  div.textContent = message;
  return div;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================================================
   11. SERVICE WORKER
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

const state = {
  recipes: [],
  selected: new Map(),
};

const elements = {
  stats: document.querySelector("#stats"),
  search: document.querySelector("#recipeSearch"),
  resultCount: document.querySelector("#resultCount"),
  results: document.querySelector("#results"),
  selectedList: document.querySelector("#selectedList"),
  shoppingBody: document.querySelector("#shoppingBody"),
  clearAll: document.querySelector("#clearAll"),
  copyList: document.querySelector("#copyList"),
  printList: document.querySelector("#printList"),
  excelList: document.querySelector("#excelList"),
};

function formatAmount(value) {
  if (value >= 100) return Math.round(value).toString();
  if (value >= 10) return value.toFixed(1).replace(/\.0$/, "");
  if (value >= 1) return value.toFixed(2).replace(/0$/, "").replace(/\.0$/, "");
  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function recipeMeta(recipe) {
  return recipe.recipeCode ? `Strana receptu ${recipe.recipeCode}` : "Strana receptu nezadaná";
}

function selectedMeta(recipe) {
  const code = recipe.recipeCode ? `strana ${recipe.recipeCode}` : "bez strany";
  return `${code} | ${recipe.ingredients.length} potravín`;
}

function addRecipe(recipe) {
  if (!state.selected.has(recipe.id)) {
    state.selected.set(recipe.id, { recipe, people: recipe.basePortions });
  }
  renderSelected();
  renderShopping();
}

function removeRecipe(id) {
  state.selected.delete(id);
  renderSelected();
  renderShopping();
}

function renderResults() {
  const query = elements.search.value.trim().toLocaleLowerCase("sk");
  const isMobile = window.matchMedia("(max-width: 640px)").matches;
  const minimumMobileQueryLength = 2;
  const desktopInitialLimit = 12;
  const desktopSearchLimit = 18;
  const mobileSearchLimit = 10;

  if (isMobile && query.length < minimumMobileQueryLength) {
    elements.results.innerHTML = "";
    elements.resultCount.textContent = "Napíš aspoň 2 znaky a zobrazia sa nájdené jedlá.";
    return;
  }

  const recipes = state.recipes
    .filter((recipe) => {
      const haystack = `${recipe.name} ${recipe.recipeCode || ""}`.toLocaleLowerCase("sk");
      return !query || haystack.includes(query);
    });
  const limit = isMobile ? mobileSearchLimit : query ? desktopSearchLimit : desktopInitialLimit;
  const visibleRecipes = recipes.slice(0, limit);

  elements.results.innerHTML = "";
  elements.resultCount.textContent = query
    ? `Nájdené jedlá: ${recipes.length} z ${state.recipes.length}${recipes.length > visibleRecipes.length ? ` | zobrazených ${visibleRecipes.length}` : ""}`
    : `Všetky jedlá: ${state.recipes.length} | zobrazených ${visibleRecipes.length}`;
  visibleRecipes.forEach((recipe) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "result-item";
    button.innerHTML = `
      <span class="result-name">${recipe.name}</span>
      <span class="result-meta">${recipeMeta(recipe)}</span>
    `;
    button.addEventListener("click", () => addRecipe(recipe));
    elements.results.appendChild(button);
  });
}

function renderSelected() {
  elements.selectedList.innerHTML = "";
  if (!state.selected.size) {
    elements.selectedList.innerHTML = '<div class="empty">Vyber jedlo cez vyhľadávanie.</div>';
    return;
  }

  state.selected.forEach(({ recipe, people }) => {
    const row = document.createElement("div");
    row.className = "selected-item";
    row.innerHTML = `
      <div class="selected-main">
        <div class="selected-title-row">
          <div class="selected-title">${recipe.name}</div>
          <button type="button" class="remove-btn" aria-label="Odstrániť">×</button>
        </div>
        <span class="selected-meta">${selectedMeta(recipe)}</span>
      </div>
      <label class="people-field">
        <span>Počet ľudí</span>
        <input type="number" min="0" step="1" value="${people}" aria-label="Počet ľudí pre ${recipe.name}">
      </label>
    `;
    const input = row.querySelector("input");
    input.addEventListener("input", () => {
      state.selected.get(recipe.id).people = Number(input.value) || 0;
      renderShopping();
    });
    row.querySelector("button").addEventListener("click", () => removeRecipe(recipe.id));
    elements.selectedList.appendChild(row);
  });
}

function collectShoppingList() {
  const totals = new Map();
  state.selected.forEach(({ recipe, people }) => {
    recipe.ingredients.forEach((ingredient) => {
      const key = `${ingredient.name.toLocaleLowerCase("sk")}__${ingredient.unit}`;
      const current = totals.get(key) || { name: ingredient.name, unit: ingredient.unit, amount: 0 };
      current.amount += ingredient.perPerson * people;
      totals.set(key, current);
    });
  });
  return [...totals.values()].sort((a, b) => a.name.localeCompare(b.name, "sk"));
}

function renderShopping() {
  const rows = collectShoppingList();
  elements.shoppingBody.innerHTML = "";
  if (!rows.length) {
    elements.shoppingBody.innerHTML = '<tr><td colspan="3" class="empty">Zatiaľ nie je vybrané žiadne jedlo.</td></tr>';
    return;
  }

  rows.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.name}</td>
      <td>${formatAmount(item.amount)}</td>
      <td>${item.unit}</td>
    `;
    elements.shoppingBody.appendChild(row);
  });
}

function copyShoppingList() {
  const text = collectShoppingList()
    .map((item) => `${item.name}\t${formatAmount(item.amount)}\t${item.unit}`)
    .join("\n");
  navigator.clipboard.writeText(text);
}

function printShoppingList() {
  window.print();
}

function escapeCsvValue(value) {
  const text = String(value).replace(/"/g, '""');
  return /[;"\n\r]/.test(text) ? `"${text}"` : text;
}

function saveShoppingListForExcel() {
  const rows = collectShoppingList();
  const lines = [
    ["Potravina", "Množstvo", "Jednotka"],
    ...rows.map((item) => [item.name, formatAmount(item.amount), item.unit]),
  ];
  const csv = lines.map((line) => line.map(escapeCsvValue).join(";")).join("\r\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "celkove-suroviny.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function loadData() {
  const payload = window.RECIPE_DATA;
  if (!payload) {
    throw new Error("Missing recipe data");
  }
  state.recipes = payload.recipes;
  elements.stats.textContent = `${payload.recipes.length} jedál`;
  renderResults();
  renderSelected();
  renderShopping();
}

elements.search.addEventListener("input", renderResults);
window.addEventListener("resize", renderResults);
elements.clearAll.addEventListener("click", () => {
  state.selected.clear();
  renderSelected();
  renderShopping();
});
elements.copyList.addEventListener("click", copyShoppingList);
elements.printList.addEventListener("click", printShoppingList);
elements.excelList.addEventListener("click", saveShoppingListForExcel);

loadData().catch((error) => {
  elements.stats.textContent = "Dáta sa nepodarilo načítať";
  console.error(error);
});

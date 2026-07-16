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
  exportSummary: document.querySelector("#exportSummary"),
  shoppingBody: document.querySelector("#shoppingBody"),
  clearAll: document.querySelector("#clearAll"),
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

function getSelectedMeals() {
  return [...state.selected.values()].map(({ recipe, people }, index) => ({
    id: `${recipe.id}-${index}`,
    name: recipe.name,
    people,
    recipeCode: recipe.recipeCode || "",
    ingredients: recipe.ingredients,
  }));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

function renderExportSummary() {
  const matrix = collectExportMatrix();
  if (!matrix.meals.length) {
    elements.exportSummary.innerHTML = "";
    return;
  }

  elements.exportSummary.innerHTML = `
    <h3>Výdaj surovín podľa jedál</h3>
    <table class="export-matrix-table">
      <thead>
        <tr>
          <th>Potravina</th>
          ${matrix.meals.map((meal) => `<th>${escapeHtml(meal.name)}</th>`).join("")}
          <th>Spolu</th>
          <th>Jednotka</th>
        </tr>
        <tr>
          <th>Počet ľudí</th>
          ${matrix.meals.map((meal) => `<th>${escapeHtml(meal.people)}</th>`).join("")}
          <th></th>
          <th></th>
        </tr>
        <tr>
          <th>Strana receptu</th>
          ${matrix.meals.map((meal) => `<th>${escapeHtml(meal.recipeCode || "-")}</th>`).join("")}
          <th></th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${matrix.rows.map((row) => `
          <tr>
            <td>${escapeHtml(row.name)}</td>
            ${row.mealAmounts.map((amount) => `<td>${amount ? escapeHtml(formatAmount(amount)) : ""}</td>`).join("")}
            <td>${escapeHtml(formatAmount(row.total))}</td>
            <td>${escapeHtml(row.unit)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
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

function collectExportMatrix() {
  const meals = getSelectedMeals();
  const rowMap = new Map();

  meals.forEach((meal, mealIndex) => {
    meal.ingredients.forEach((ingredient) => {
      const key = `${ingredient.name.toLocaleLowerCase("sk")}__${ingredient.unit}`;
      const row = rowMap.get(key) || {
        name: ingredient.name,
        unit: ingredient.unit,
        mealAmounts: Array(meals.length).fill(0),
        total: 0,
      };
      const amount = ingredient.perPerson * meal.people;
      row.mealAmounts[mealIndex] += amount;
      row.total += amount;
      rowMap.set(key, row);
    });
  });

  return {
    meals,
    rows: [...rowMap.values()].sort((a, b) => a.name.localeCompare(b.name, "sk")),
  };
}

function renderShopping() {
  renderExportSummary();
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

function printShoppingList() {
  window.print();
}

function escapeCsvValue(value) {
  const text = String(value).replace(/"/g, '""');
  return /[;"\n\r]/.test(text) ? `"${text}"` : text;
}

function saveShoppingListForExcel() {
  const matrix = collectExportMatrix();
  const lines = [
    ["Potravina", ...matrix.meals.map((meal) => meal.name), "Spolu", "Jednotka"],
    ["Počet ľudí", ...matrix.meals.map((meal) => meal.people), "", ""],
    ["Strana receptu", ...matrix.meals.map((meal) => meal.recipeCode || "-"), "", ""],
    [],
    ...matrix.rows.map((row) => [
      row.name,
      ...row.mealAmounts.map((amount) => amount ? formatAmount(amount) : ""),
      formatAmount(row.total),
      row.unit,
    ]),
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
elements.printList.addEventListener("click", printShoppingList);
elements.excelList.addEventListener("click", saveShoppingListForExcel);

loadData().catch((error) => {
  elements.stats.textContent = "Dáta sa nepodarilo načítať";
  console.error(error);
});

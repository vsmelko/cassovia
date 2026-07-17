const STORAGE_KEY = "cassovia.customRecipes.v1";

const state = {
  baseRecipes: [],
  customRecipes: [],
  recipes: [],
  selected: new Map(),
  editingRecipeId: null,
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
  openRecipeForm: document.querySelector("#openRecipeForm"),
  recipeEditor: document.querySelector("#recipeEditor"),
  recipeForm: document.querySelector("#recipeForm"),
  recipeFormTitle: document.querySelector("#recipeFormTitle"),
  recipeId: document.querySelector("#recipeId"),
  recipeName: document.querySelector("#recipeName"),
  recipeCode: document.querySelector("#recipeCode"),
  ingredientRows: document.querySelector("#ingredientRows"),
  ingredientSuggestions: document.querySelector("#ingredientSuggestions"),
  addIngredient: document.querySelector("#addIngredient"),
  cancelRecipeEdit: document.querySelector("#cancelRecipeEdit"),
};

function formatAmount(value) {
  if (value >= 100) return Math.round(value).toString();
  if (value >= 10) return value.toFixed(1).replace(/\.0$/, "");
  if (value >= 1) return value.toFixed(2).replace(/0$/, "").replace(/\.0$/, "");
  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function normalizeAmount(value) {
  return Number(String(value).replace(",", ".")) || 0;
}

function createId(value) {
  const slug = String(value)
    .toLocaleLowerCase("sk")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return `custom-${slug || "recept"}-${Date.now().toString(36)}`;
}

function cloneRecipe(recipe) {
  return {
    ...recipe,
    ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient })),
  };
}

function recipeMeta(recipe) {
  const code = recipe.recipeCode ? recipe.recipeCode : "";
  const hasLocalOverride = state.customRecipes.some((item) => item.id === recipe.id);
  const origin = recipe.isCustom ? "vlastný recept" : hasLocalOverride ? "upravený recept" : "import";
  return [code, origin].filter(Boolean).join(" | ");
}

function selectedMeta(recipe) {
  return [recipe.recipeCode, `${recipe.ingredients.length} potravín`].filter(Boolean).join(" | ");
}

function refreshRecipes() {
  const customById = new Map(state.customRecipes.map((recipe) => [recipe.id, recipe]));
  state.recipes = state.baseRecipes
    .map((recipe) => customById.get(recipe.id) || recipe)
    .concat(state.customRecipes.filter((recipe) => !state.baseRecipes.some((base) => base.id === recipe.id)))
    .sort((a, b) => a.name.localeCompare(b.name, "sk"));
  renderIngredientSuggestions();
}

function renderIngredientSuggestions() {
  const names = new Map();
  state.recipes.forEach((recipe) => {
    recipe.ingredients.forEach((ingredient) => {
      const name = ingredient.name?.trim();
      if (!name) return;
      const key = name.toLocaleLowerCase("sk");
      if (!names.has(key)) names.set(key, name);
    });
  });

  elements.ingredientSuggestions.innerHTML = [...names.values()]
    .sort((a, b) => a.localeCompare(b, "sk"))
    .map((name) => `<option value="${escapeHtml(name)}"></option>`)
    .join("");
}

function loadCustomRecipes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Custom recipes could not be loaded", error);
    return [];
  }
}

function saveCustomRecipes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.customRecipes));
}

function updateStats() {
  const editedBaseCount = state.customRecipes.filter((recipe) => !recipe.isCustom).length;
  const customCount = state.customRecipes.filter((recipe) => recipe.isCustom).length;
  const parts = [`${state.recipes.length} jedál`];
  if (customCount) parts.push(`${customCount} vlastných`);
  if (editedBaseCount) parts.push(`${editedBaseCount} upravených`);
  elements.stats.textContent = parts.join(" | ");
}

function addRecipe(recipe) {
  if (!state.selected.has(recipe.id)) {
    const workingRecipe = cloneRecipe(recipe);
    state.selected.set(recipe.id, { recipe: workingRecipe, people: 1 });
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

  const recipes = state.recipes.filter((recipe) => {
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
    const item = document.createElement("div");
    item.className = "result-item";
    item.innerHTML = `
      <button type="button" class="result-select">
        <span class="result-name">${escapeHtml(recipe.name)}</span>
        <span class="result-meta">${escapeHtml(recipeMeta(recipe))}</span>
      </button>
      <button type="button" class="edit-recipe-btn" aria-label="Upraviť recept" title="Upraviť recept">✎</button>
    `;
    item.querySelector(".result-select").addEventListener("click", () => addRecipe(recipe));
    item.querySelector(".edit-recipe-btn").addEventListener("click", () => startRecipeEdit(recipe));
    elements.results.appendChild(item);
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
          <div class="selected-title">${escapeHtml(recipe.name)}</div>
          <button type="button" class="remove-btn" aria-label="Odstrániť">×</button>
        </div>
        <span class="selected-meta">${escapeHtml(selectedMeta(recipe))}</span>
        <details class="selected-ingredients">
          <summary>Upraviť len pre tento výpočet</summary>
          <div class="temporary-ingredients"></div>
        </details>
      </div>
      <label class="people-field">
        <span>Porcie/osoby</span>
        <input type="number" min="0" step="1" value="${people}" aria-label="Počet porcií alebo osôb pre ${escapeHtml(recipe.name)}">
      </label>
    `;

    const selectedEntry = state.selected.get(recipe.id);
    row.querySelector(".people-field input").addEventListener("input", (event) => {
      selectedEntry.people = Number(event.target.value) || 0;
      renderShopping();
    });
    row.querySelector(".remove-btn").addEventListener("click", () => removeRecipe(recipe.id));
    renderTemporaryIngredientRows(row.querySelector(".temporary-ingredients"), selectedEntry);
    elements.selectedList.appendChild(row);
  });
}

function renderTemporaryIngredientRows(container, selectedEntry) {
  container.innerHTML = "";
  selectedEntry.recipe.ingredients.forEach((ingredient, index) => {
    const row = document.createElement("div");
    row.className = "temporary-row";
    row.innerHTML = `
      <input type="text" list="ingredientSuggestions" value="${escapeHtml(ingredient.name)}" aria-label="Potravina">
      <input type="number" min="0" step="0.001" value="${ingredient.perPerson}" aria-label="Množstvo na 1 porciu">
      <input type="text" value="${escapeHtml(ingredient.unit)}" aria-label="Jednotka">
      <button type="button" class="remove-small" aria-label="Odstrániť surovinu">×</button>
    `;
    const inputs = row.querySelectorAll("input");
    inputs[0].addEventListener("input", () => {
      ingredient.name = inputs[0].value.trim();
      renderShopping();
    });
    inputs[1].addEventListener("input", () => {
      ingredient.perPerson = normalizeAmount(inputs[1].value);
      ingredient.amount = ingredient.perPerson * (selectedEntry.people || 1);
      renderShopping();
    });
    inputs[2].addEventListener("input", () => {
      ingredient.unit = inputs[2].value.trim();
      renderShopping();
    });
    row.querySelector("button").addEventListener("click", () => {
      selectedEntry.recipe.ingredients.splice(index, 1);
      renderSelected();
      renderShopping();
    });
    container.appendChild(row);
  });

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "add-temporary";
  addButton.textContent = "Pridať surovinu len sem";
  addButton.addEventListener("click", () => {
    selectedEntry.recipe.ingredients.push({ name: "", amount: 0, perPerson: 0, unit: "kg" });
    renderSelected();
    renderShopping();
  });
  container.appendChild(addButton);
}

function renderExportSummary() {
  const matrix = collectExportMatrix();
  if (!matrix.meals.length) {
    elements.exportSummary.innerHTML = "";
    return;
  }

  elements.exportSummary.innerHTML = buildExportMatrixHtml(matrix);
}

function buildExportMatrixHtml(matrix) {
  return `
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
          <th>Porcie/osoby</th>
          ${matrix.meals.map((meal) => `<th>${escapeHtml(meal.people)}</th>`).join("")}
          <th></th>
          <th></th>
        </tr>
        <tr>
          <th>Strana</th>
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
      if (!ingredient.name || !ingredient.unit) return;
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
      if (!ingredient.name || !ingredient.unit) return;
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
      <td>${escapeHtml(item.name)}</td>
      <td>${formatAmount(item.amount)}</td>
      <td>${escapeHtml(item.unit)}</td>
    `;
    elements.shoppingBody.appendChild(row);
  });
}

function addIngredientFormRow(ingredient = {}) {
  const row = document.createElement("div");
  row.className = "ingredient-form-row";
  row.innerHTML = `
    <input type="text" class="ingredient-name" list="ingredientSuggestions" value="${escapeHtml(ingredient.name || "")}" placeholder="Surovina" required>
    <input type="number" class="ingredient-amount" min="0" step="0.001" value="${ingredient.amount ?? ""}" placeholder="Množstvo" required>
    <input type="text" class="ingredient-unit" value="${escapeHtml(ingredient.unit || "kg")}" placeholder="Jednotka" required>
    <button type="button" class="remove-small" aria-label="Odstrániť surovinu">×</button>
  `;
  row.querySelector("button").addEventListener("click", () => {
    row.remove();
    if (!elements.ingredientRows.children.length) addIngredientFormRow();
  });
  elements.ingredientRows.appendChild(row);
}

function resetRecipeForm() {
  state.editingRecipeId = null;
  elements.recipeForm.reset();
  elements.recipeId.value = "";
  elements.recipeFormTitle.textContent = "Nový recept";
  elements.ingredientRows.innerHTML = "";
  addIngredientFormRow();
}

function openRecipeEditor() {
  elements.recipeEditor.hidden = false;
  document.body.classList.add("modal-open");
  window.setTimeout(() => elements.recipeName.focus(), 0);
}

function closeRecipeEditor() {
  elements.recipeEditor.hidden = true;
  document.body.classList.remove("modal-open");
  resetRecipeForm();
}

function openNewRecipeForm() {
  resetRecipeForm();
  openRecipeEditor();
}

function startRecipeEdit(recipe) {
  state.editingRecipeId = recipe.id;
  elements.recipeFormTitle.textContent = "Upraviť recept";
  elements.recipeId.value = recipe.id;
  elements.recipeName.value = recipe.name;
  elements.recipeCode.value = recipe.recipeCode || "";
  elements.cancelRecipeEdit.hidden = false;
  elements.ingredientRows.innerHTML = "";
  recipe.ingredients.forEach((ingredient) => {
    addIngredientFormRow({
      name: ingredient.name,
      amount: ingredient.perPerson,
      unit: ingredient.unit,
    });
  });
  openRecipeEditor();
}

function collectRecipeFormData() {
  const ingredients = [...elements.ingredientRows.querySelectorAll(".ingredient-form-row")]
    .map((row) => {
      const name = row.querySelector(".ingredient-name").value.trim();
      const amount = normalizeAmount(row.querySelector(".ingredient-amount").value);
      const unit = row.querySelector(".ingredient-unit").value.trim();
      return {
        name,
        amount,
        perPerson: amount,
        unit,
      };
    })
    .filter((ingredient) => ingredient.name && ingredient.unit && ingredient.amount > 0);

  return {
    id: elements.recipeId.value || createId(elements.recipeName.value),
    name: elements.recipeName.value.trim(),
    basePortions: 1,
    recipeCode: elements.recipeCode.value.trim(),
    netto: "",
    source: { source: "Vlastné" },
    ingredients,
  };
}

function saveRecipe(event) {
  event.preventDefault();
  const recipe = collectRecipeFormData();
  if (!recipe.name || !recipe.ingredients.length) return;

  const baseRecipe = state.baseRecipes.find((item) => item.id === recipe.id);
  recipe.isCustom = !baseRecipe;
  if (baseRecipe) {
    recipe.source = baseRecipe.source;
    recipe.netto = baseRecipe.netto;
  }

  const existingIndex = state.customRecipes.findIndex((item) => item.id === recipe.id);
  if (existingIndex >= 0) {
    state.customRecipes[existingIndex] = recipe;
  } else {
    state.customRecipes.push(recipe);
  }

  saveCustomRecipes();
  refreshRecipes();
  updateStats();
  renderResults();
  closeRecipeEditor();
}

function printShoppingList() {
  window.print();
}

function saveShoppingListForExcel() {
  const matrix = collectExportMatrix();
  if (!matrix.meals.length) return;

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, Helvetica, sans-serif; }
          h3 { margin: 0 0 10px; font-size: 16px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #c8c8c8; padding: 6px 8px; vertical-align: top; }
          th { background: #f1f1f1; font-weight: 700; text-align: left; }
          td { mso-number-format:"\\@"; }
          th:nth-last-child(2), td:nth-last-child(2) { font-weight: 700; text-align: right; }
        </style>
      </head>
      <body>
        ${buildExportMatrixHtml(matrix)}
      </body>
    </html>
  `;
  const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "vydaj-surovin.xls";
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
  state.baseRecipes = payload.recipes;
  state.customRecipes = loadCustomRecipes();
  refreshRecipes();
  updateStats();
  renderResults();
  renderSelected();
  renderShopping();
  resetRecipeForm();
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
elements.openRecipeForm.addEventListener("click", openNewRecipeForm);
elements.recipeForm.addEventListener("submit", saveRecipe);
elements.addIngredient.addEventListener("click", () => addIngredientFormRow());
elements.cancelRecipeEdit.addEventListener("click", closeRecipeEditor);
elements.recipeEditor.addEventListener("click", (event) => {
  if (event.target === elements.recipeEditor) closeRecipeEditor();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.recipeEditor.hidden) closeRecipeEditor();
});

loadData().catch((error) => {
  elements.stats.textContent = "Dáta sa nepodarilo načítať";
  console.error(error);
});

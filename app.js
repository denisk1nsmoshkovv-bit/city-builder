const BUILDINGS = {
  house: {
    id: 'house',
    name: 'Дом',
    type: 'Жилое',
    icon: '🏠',
    cost: 50,
    baseIncome: 1,
    basePopulation: 5,
    baseHappiness: 0,
    maxLevel: 3,
    colorClass: 'house',
    description: 'Даёт жителей и небольшой стабильный доход.',
    upgradeCost: [0, 70, 120],
    incomeScale: [1, 1.75, 2.5],
    populationScale: [1, 1.4, 1.8],
    unlockPopulation: 0
  },
  shop: {
    id: 'shop',
    name: 'Магазин',
    type: 'Коммерция',
    icon: '🛍️',
    cost: 100,
    baseIncome: 3,
    basePopulation: 0,
    baseHappiness: 0,
    maxLevel: 3,
    colorClass: 'shop',
    description: 'Основной источник монет. Требует жителей.',
    upgradeCost: [0, 120, 180],
    incomeScale: [1, 1.75, 2.5],
    populationScale: [0, 0, 0],
    unlockPopulation: 5
  },
  park: {
    id: 'park',
    name: 'Парк',
    type: 'Общественное',
    icon: '🌳',
    cost: 80,
    baseIncome: 0,
    basePopulation: 0,
    baseHappiness: 5,
    maxLevel: 3,
    colorClass: 'park',
    description: 'Усиливает соседние здания и повышает уют.',
    upgradeCost: [0, 90, 140],
    incomeScale: [0, 0, 0],
    populationScale: [0, 0, 0],
    unlockPopulation: 0
  }
};

const SAVE_KEY = 'cozy-town-builder-v1';
const GRID_SIZE = 7;
const START_COINS = 220;

const state = {
  coins: START_COINS,
  totalEarned: START_COINS,
  selectedBuildId: null,
  selectedTileId: null,
  lastSavedAt: null,
  tick: 0,
  tiles: createInitialTiles()
};

const els = {
  board: document.getElementById('board'),
  buildMenu: document.getElementById('buildMenu'),
  coinsValue: document.getElementById('coinsValue'),
  populationValue: document.getElementById('populationValue'),
  incomeValue: document.getElementById('incomeValue'),
  happinessValue: document.getElementById('happinessValue'),
  buildingPanel: document.getElementById('buildingPanel'),
  toastLayer: document.getElementById('toastLayer'),
  floatLayer: document.getElementById('floatLayer'),
  buildHint: document.getElementById('buildHint'),
  goals: document.getElementById('goals'),
  clearBuildBtn: document.getElementById('clearBuildBtn'),
  saveBtn: document.getElementById('saveBtn'),
  resetBtn: document.getElementById('resetBtn')
};

function createInitialTiles() {
  const tiles = [];
  const center = 3;
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const distance = Math.abs(row - center) + Math.abs(col - center);
      const unlocked = distance <= 2 || (row === 1 && col === 1);
      tiles.push({
        id: `${row}-${col}`,
        row,
        col,
        unlocked,
        building: null
      });
    }
  }
  return tiles;
}

function unlockCost(tile) {
  const center = 3;
  const distance = Math.abs(tile.row - center) + Math.abs(tile.col - center);
  if (distance <= 2) return 0;
  if (distance === 3) return 150;
  if (distance === 4) return 250;
  return 400;
}

function getTile(id) {
  return state.tiles.find(tile => tile.id === id);
}

function getNeighbors(tile) {
  const dirs = [
    [0, 1], [1, 0], [0, -1], [-1, 0]
  ];
  return dirs
    .map(([dr, dc]) => getTile(`${tile.row + dr}-${tile.col + dc}`))
    .filter(Boolean);
}

function getBuildingStats(building) {
  const data = BUILDINGS[building.id];
  const levelIndex = building.level - 1;
  const income = Math.round(data.baseIncome * data.incomeScale[levelIndex] * 10) / 10;
  const population = Math.round(data.basePopulation * data.populationScale[levelIndex]);
  const happiness = data.id === 'park' ? 5 + (building.level - 1) * 3 : 0;
  return { income, population, happiness };
}

function getParkBonusMultiplier(tile) {
  const adjacentParks = getNeighbors(tile).filter(t => t?.building?.id === 'park').length;
  return 1 + adjacentParks * 0.1;
}

function computeEconomy() {
  let population = 0;
  let happiness = 0;
  let income = 0;

  for (const tile of state.tiles) {
    if (!tile.building) continue;
    const stats = getBuildingStats(tile.building);
    population += stats.population;
    happiness += stats.happiness;
  }

  for (const tile of state.tiles) {
    if (!tile.building) continue;
    const stats = getBuildingStats(tile.building);
    let tileIncome = stats.income;
    tileIncome *= getParkBonusMultiplier(tile);
    income += tileIncome;
  }

  const globalMultiplier = 1 + Math.min(0.25, happiness / 200);
  income = Math.round(income * globalMultiplier * 10) / 10;

  return { population, happiness, income };
}

function canBuild(buildingId) {
  const data = BUILDINGS[buildingId];
  const economy = computeEconomy();
  if (state.coins < data.cost) {
    return { ok: false, reason: 'Недостаточно монет.' };
  }
  if (economy.population < data.unlockPopulation) {
    return { ok: false, reason: `Нужно минимум ${data.unlockPopulation} жителей.` };
  }
  return { ok: true, reason: '' };
}

function renderAll() {
  renderStats();
  renderBuildMenu();
  renderBoard();
  renderBuildingPanel();
  renderGoals();
}

function renderStats() {
  const economy = computeEconomy();
  els.coinsValue.textContent = formatNumber(state.coins);
  els.populationValue.textContent = formatNumber(economy.population);
  els.incomeValue.textContent = formatNumber(economy.income);
  els.happinessValue.textContent = formatNumber(economy.happiness);
}

function renderBuildMenu() {
  els.buildMenu.innerHTML = '';
  for (const building of Object.values(BUILDINGS)) {
    const availability = canBuild(building.id);
    const card = document.createElement('div');
    card.className = 'build-card' + (state.selectedBuildId === building.id ? ' active' : '');
    card.innerHTML = `
      <div class="build-card__icon">${building.icon}</div>
      <div>
        <div class="build-card__title">${building.name}</div>
        <div class="build-card__desc">${building.description}</div>
        <div class="build-card__meta">
          <span class="chip">🪙 ${building.cost}</span>
          ${building.basePopulation ? `<span class="chip">👥 +${building.basePopulation}</span>` : ''}
          ${building.baseIncome ? `<span class="chip">💸 +${building.baseIncome}/с</span>` : ''}
          ${building.id === 'park' ? `<span class="chip">🌿 +бонус рядом</span>` : ''}
        </div>
      </div>
      <button class="build-card__button">${state.selectedBuildId === building.id ? 'Выбрано' : 'Выбрать'}</button>
    `;
    card.querySelector('.build-card__button').addEventListener('click', () => {
      state.selectedBuildId = state.selectedBuildId === building.id ? null : building.id;
      state.selectedTileId = null;
      renderAll();
    });
    card.title = availability.ok ? '' : availability.reason;
    els.buildMenu.appendChild(card);
  }
  if (!state.selectedBuildId) {
    els.buildHint.textContent = 'Выбери постройку снизу и нажми на свободную клетку.';
  } else {
    const selected = BUILDINGS[state.selectedBuildId];
    const availability = canBuild(selected.id);
    els.buildHint.textContent = availability.ok
      ? `Режим строительства: ${selected.name}. Нажми на свободную открытую клетку.`
      : `Режим строительства: ${selected.name}. ${availability.reason}`;
  }
}

function renderBoard() {
  els.board.innerHTML = '';
  for (const tile of state.tiles) {
    const tileEl = document.createElement('button');
    tileEl.className = 'tile';
    if (!tile.unlocked) tileEl.classList.add('locked');
    if (state.selectedTileId === tile.id) tileEl.classList.add('selected');
    if (state.selectedBuildId && tile.unlocked && !tile.building) tileEl.classList.add('available');
    tileEl.dataset.tileId = tile.id;

    if (!tile.unlocked) {
      const cost = unlockCost(tile);
      tileEl.innerHTML = `<span class="tile__lock">🔒</span><span class="tile__cost">Открыть<br>🪙 ${cost}</span>`;
    } else if (tile.building) {
      const building = tile.building;
      const data = BUILDINGS[building.id];
      const stats = getBuildingStats(building);
      const bonusPct = Math.round((getParkBonusMultiplier(tile) - 1) * 100);
      const buildingEl = document.createElement('div');
      buildingEl.className = `building ${data.colorClass} level-${building.level}`;
      buildingEl.innerHTML = `<span class="building__level">${building.level}</span>`;
      tileEl.appendChild(buildingEl);
      tileEl.title = `${data.name} • Уровень ${building.level} • Доход ${stats.income}${bonusPct ? ` (+${bonusPct}% рядом с парком)` : ''}`;
    }

    tileEl.addEventListener('click', () => handleTileClick(tile.id, tileEl));
    els.board.appendChild(tileEl);
  }
}

function renderBuildingPanel() {
  const tile = state.selectedTileId ? getTile(state.selectedTileId) : null;
  if (!tile || !tile.building) {
    els.buildingPanel.className = 'building-panel empty';
    els.buildingPanel.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__emoji">✨</div>
        <div class="empty-state__title">Ничего не выбрано</div>
        <div class="empty-state__text">Нажми на построенное здание, чтобы улучшить его или снести.</div>
      </div>
    `;
    return;
  }

  const building = tile.building;
  const data = BUILDINGS[building.id];
  const stats = getBuildingStats(building);
  const nextUpgradeCost = building.level < data.maxLevel ? data.upgradeCost[building.level] : null;
  const neighborBonus = Math.round((getParkBonusMultiplier(tile) - 1) * 100);
  els.buildingPanel.className = 'building-panel';
  els.buildingPanel.innerHTML = `
    <div class="building-panel__header">
      <div class="building-panel__icon">${data.icon}</div>
      <div>
        <div class="building-panel__title">${data.name}</div>
        <div class="building-panel__subtitle">${data.type} • клетка ${tile.row + 1}:${tile.col + 1}</div>
      </div>
    </div>

    <div class="building-panel__stats">
      <div class="kpi">
        <div class="kpi__label">Уровень</div>
        <div class="kpi__value">${building.level} / ${data.maxLevel}</div>
      </div>
      <div class="kpi">
        <div class="kpi__label">Доход</div>
        <div class="kpi__value">${stats.income}/с ${neighborBonus ? `(+${neighborBonus}%)` : ''}</div>
      </div>
      <div class="kpi">
        <div class="kpi__label">Население</div>
        <div class="kpi__value">${stats.population ? '+' + stats.population : '—'}</div>
      </div>
      <div class="kpi">
        <div class="kpi__label">Уют</div>
        <div class="kpi__value">${stats.happiness ? '+' + stats.happiness : '—'}</div>
      </div>
    </div>

    <div class="building-panel__actions">
      <button class="building-panel__button building-panel__button--primary" id="upgradeBtn">
        ${nextUpgradeCost ? `⬆️ Улучшить за 🪙 ${nextUpgradeCost}` : 'Макс. уровень'}
      </button>
      <button class="building-panel__button building-panel__button--danger" id="demolishBtn">🧱 Снести</button>
    </div>

    <div class="building-panel__note">
      ${data.description}
      ${building.id === 'park' ? ' Парк усиливает соседние клетки на 10% за каждый парк рядом.' : ''}
    </div>
  `;

  const upgradeBtn = document.getElementById('upgradeBtn');
  const demolishBtn = document.getElementById('demolishBtn');
  if (upgradeBtn) {
    upgradeBtn.disabled = !nextUpgradeCost;
    upgradeBtn.style.opacity = nextUpgradeCost ? '1' : '0.6';
    upgradeBtn.addEventListener('click', upgradeSelectedBuilding);
  }
  demolishBtn.addEventListener('click', demolishSelectedBuilding);
}

function renderGoals() {
  const economy = computeEconomy();
  const buildingsCount = state.tiles.filter(t => t.building).length;
  const unlockedCount = state.tiles.filter(t => t.unlocked).length;

  const goals = [
    {
      done: buildingsCount >= 3,
      icon: '🏘️',
      title: 'Первые кварталы',
      desc: `${buildingsCount}/3 зданий построено`
    },
    {
      done: economy.population >= 15,
      icon: '👥',
      title: 'Растущее население',
      desc: `${economy.population}/15 жителей`
    },
    {
      done: unlockedCount >= 20,
      icon: '🗺️',
      title: 'Расширение города',
      desc: `${unlockedCount}/20 клеток открыто`
    }
  ];

  els.goals.innerHTML = goals.map(goal => `
    <div class="goal ${goal.done ? 'done' : ''}">
      <div class="goal__icon">${goal.done ? '✅' : goal.icon}</div>
      <div>
        <div class="goal__title">${goal.title}</div>
        <div class="goal__desc">${goal.desc}</div>
      </div>
    </div>
  `).join('');
}

function handleTileClick(tileId, tileEl) {
  const tile = getTile(tileId);
  if (!tile) return;

  if (!tile.unlocked) {
    tryUnlockTile(tile, tileEl);
    return;
  }

  if (tile.building) {
    state.selectedTileId = tile.id;
    state.selectedBuildId = null;
    renderAll();
    return;
  }

  if (state.selectedBuildId) {
    placeBuilding(tile, tileEl);
    return;
  }

  state.selectedTileId = null;
  renderAll();
}

function tryUnlockTile(tile, tileEl) {
  const cost = unlockCost(tile);
  if (state.coins < cost) {
    toast('Недостаточно монет для открытия клетки');
    return;
  }
  state.coins -= cost;
  tile.unlocked = true;
  toast('Новая клетка открыта');
  spawnFloat(tileEl, `-${cost}🪙`);
  autosave();
  renderAll();
}

function placeBuilding(tile, tileEl) {
  const data = BUILDINGS[state.selectedBuildId];
  const check = canBuild(state.selectedBuildId);
  if (!check.ok) {
    toast(check.reason);
    return;
  }

  state.coins -= data.cost;
  tile.building = {
    id: data.id,
    level: 1
  };
  state.selectedTileId = tile.id;
  spawnFloat(tileEl, `-${data.cost}🪙`);
  toast(`${data.name} построен`);
  autosave();
  renderAll();
}

function upgradeSelectedBuilding() {
  const tile = getTile(state.selectedTileId);
  if (!tile?.building) return;
  const building = tile.building;
  const data = BUILDINGS[building.id];
  if (building.level >= data.maxLevel) {
    toast('Максимальный уровень');
    return;
  }
  const cost = data.upgradeCost[building.level];
  if (state.coins < cost) {
    toast('Недостаточно монет для улучшения');
    return;
  }
  state.coins -= cost;
  building.level += 1;
  toast(`${data.name} улучшен до ${building.level} уровня`);
  const tileEl = document.querySelector(`[data-tile-id="${tile.id}"]`);
  if (tileEl) spawnFloat(tileEl, `⬆️ ${building.level}`);
  autosave();
  renderAll();
}

function demolishSelectedBuilding() {
  const tile = getTile(state.selectedTileId);
  if (!tile?.building) return;
  const building = tile.building;
  const data = BUILDINGS[building.id];

  const builtCost = data.cost + data.upgradeCost.slice(1, building.level).reduce((a, b) => a + b, 0);
  const refund = Math.round(builtCost * 0.5);

  tile.building = null;
  state.coins += refund;
  toast(`Здание снесено. Возврат: ${refund} монет`);
  const tileEl = document.querySelector(`[data-tile-id="${tile.id}"]`);
  if (tileEl) spawnFloat(tileEl, `+${refund}🪙`);
  state.selectedTileId = null;
  autosave();
  renderAll();
}

function tickIncome() {
  const economy = computeEconomy();
  if (economy.income > 0) {
    state.coins = Math.round((state.coins + economy.income) * 10) / 10;
    state.totalEarned = Math.round((state.totalEarned + economy.income) * 10) / 10;
    const boardRect = els.board.getBoundingClientRect();
    spawnFloatAt(boardRect.left + boardRect.width / 2, boardRect.top + 10, `+${economy.income}🪙`);
  }
  state.tick += 1;
  if (state.tick % 10 === 0) autosave();
  renderStats();
}

function formatNumber(num) {
  if (Math.abs(num - Math.round(num)) < 0.001) return String(Math.round(num));
  return num.toFixed(1);
}

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  els.toastLayer.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function spawnFloat(tileEl, text) {
  const rect = tileEl.getBoundingClientRect();
  spawnFloatAt(rect.left + rect.width / 2, rect.top + 8, text);
}

function spawnFloatAt(x, y, text) {
  const el = document.createElement('div');
  el.className = 'float-text';
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.textContent = text;
  els.floatLayer.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function autosave() {
  saveGame(false);
}

function saveGame(showToast = true) {
  const payload = {
    version: 1,
    state
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  state.lastSavedAt = Date.now();
  if (showToast) toast('Игра сохранена');
}

function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return false;
  try {
    const payload = JSON.parse(raw);
    if (!payload?.state?.tiles) return false;
    Object.assign(state, payload.state);
    return true;
  } catch (e) {
    console.error('Save load error', e);
    return false;
  }
}

function resetGame() {
  if (!window.confirm('Начать новую игру? Текущее сохранение будет удалено.')) return;
  localStorage.removeItem(SAVE_KEY);
  state.coins = START_COINS;
  state.totalEarned = START_COINS;
  state.selectedBuildId = null;
  state.selectedTileId = null;
  state.lastSavedAt = null;
  state.tick = 0;
  state.tiles = createInitialTiles();
  renderAll();
  toast('Новая игра начата');
}

function attachEvents() {
  els.clearBuildBtn.addEventListener('click', () => {
    state.selectedBuildId = null;
    renderAll();
  });
  els.saveBtn.addEventListener('click', () => saveGame(true));
  els.resetBtn.addEventListener('click', resetGame);
  window.addEventListener('beforeunload', () => saveGame(false));
}

function init() {
  const loaded = loadGame();
  attachEvents();
  renderAll();
  if (loaded) {
    toast('Сохранение загружено');
  } else {
    toast('Добро пожаловать в уютный город');
  }
  setInterval(tickIncome, 1000);
}

init();

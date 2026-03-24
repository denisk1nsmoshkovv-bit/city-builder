const BUILDINGS = {
  house: {
    id: 'house',
    name: 'Дом',
    type: 'Жилое',
    icon: '🏠',
    cost: 45,
    baseIncome: 1.2,
    basePopulation: 6,
    baseHappiness: 0,
    maxLevel: 4,
    colorClass: 'house',
    description: 'Тёплое жильё: основа роста населения и стабильной экономики.',
    upgradeCost: [0, 75, 130, 210],
    incomeScale: [1, 1.8, 2.8, 4],
    populationScale: [1, 1.45, 2, 2.7],
    unlockPopulation: 0
  },
  shop: {
    id: 'shop',
    name: 'Магазин',
    type: 'Коммерция',
    icon: '🛍️',
    cost: 95,
    baseIncome: 3.6,
    basePopulation: 0,
    baseHappiness: 0,
    maxLevel: 4,
    colorClass: 'shop',
    description: 'Коммерческая зона: приносит основной доход, требует жителей.',
    upgradeCost: [0, 125, 200, 300],
    incomeScale: [1, 1.9, 3, 4.4],
    populationScale: [0, 0, 0, 0],
    unlockPopulation: 6
  },
  park: {
    id: 'park',
    name: 'Парк',
    type: 'Общественное',
    icon: '🌳',
    cost: 70,
    baseIncome: 0,
    basePopulation: 0,
    baseHappiness: 6,
    maxLevel: 4,
    colorClass: 'park',
    description: 'Зелёная зона: повышает уют и усиливает соседние здания.',
    upgradeCost: [0, 85, 140, 220],
    incomeScale: [0, 0, 0, 0],
    populationScale: [0, 0, 0, 0],
    unlockPopulation: 0
  }
};

const SAVE_KEY = 'cozy-town-builder-v2';
const GRID_SIZE = 7;
const START_COINS = 250;
const ISO_TILE_W = 112;
const ISO_TILE_H = 58;

const state = {
  coins: START_COINS,
  totalEarned: START_COINS,
  selectedBuildId: null,
  selectedTileId: null,
  hoverTileId: null,
  lastSavedAt: null,
  tick: 0,
  tileFx: {},
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
      tiles.push({ id: `${row}-${col}`, row, col, unlocked, building: null });
    }
  }
  return tiles;
}

function projectIso(row, col) {
  return {
    x: (col - row) * (ISO_TILE_W / 2),
    y: (col + row) * (ISO_TILE_H / 2)
  };
}

function getBoardLayout() {
  const points = state.tiles.map(t => projectIso(t.row, t.col));
  const minX = Math.min(...points.map(p => p.x));
  const maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y));
  const maxY = Math.max(...points.map(p => p.y));

  const padX = 120;
  const padTop = 75;
  const padBottom = 130;

  return {
    minX,
    minY,
    offsetX: -minX + padX,
    offsetY: -minY + padTop,
    width: Math.ceil(maxX - minX + ISO_TILE_W + padX * 2),
    height: Math.ceil(maxY - minY + ISO_TILE_H + padBottom)
  };
}

function unlockCost(tile) {
  const center = 3;
  const distance = Math.abs(tile.row - center) + Math.abs(tile.col - center);
  if (distance <= 2) return 0;
  if (distance === 3) return 120;
  if (distance === 4) return 200;
  return 320;
}

function getTile(id) {
  return state.tiles.find(tile => tile.id === id);
}

function getNeighbors(tile) {
  const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  return dirs.map(([dr, dc]) => getTile(`${tile.row + dr}-${tile.col + dc}`)).filter(Boolean);
}

function getBuildingStats(building) {
  const data = BUILDINGS[building.id];
  const levelIndex = Math.max(0, Math.min(data.maxLevel - 1, building.level - 1));
  const income = Math.round(data.baseIncome * data.incomeScale[levelIndex] * 10) / 10;
  const population = Math.round(data.basePopulation * data.populationScale[levelIndex]);
  const happiness = data.id === 'park' ? data.baseHappiness + (building.level - 1) * 4 : 0;
  return { income, population, happiness };
}

function getParkAdjacency(tile) {
  return getNeighbors(tile).filter(t => t?.building?.id === 'park').length;
}

function getParkBonusMultiplier(tile) {
  const adjacentParks = getParkAdjacency(tile);
  const levelBonus = getNeighbors(tile)
    .filter(t => t?.building?.id === 'park')
    .reduce((sum, t) => sum + (t.building.level - 1) * 0.02, 0);
  return 1 + adjacentParks * 0.12 + levelBonus;
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
    income += stats.income * getParkBonusMultiplier(tile);
  }

  const globalMultiplier = 1 + Math.min(0.35, happiness / 160);
  income = Math.round(income * globalMultiplier * 10) / 10;

  return { population, happiness, income };
}

function canBuild(buildingId) {
  const data = BUILDINGS[buildingId];
  const economy = computeEconomy();
  if (state.coins < data.cost) return { ok: false, reason: 'Недостаточно монет.' };
  if (economy.population < data.unlockPopulation) return { ok: false, reason: `Нужно минимум ${data.unlockPopulation} жителей.` };
  return { ok: true, reason: '' };
}

function markTileFx(tileId, fxClass) {
  state.tileFx[tileId] = fxClass;
  setTimeout(() => {
    delete state.tileFx[tileId];
    renderBoard();
  }, 520);
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
    card.className = 'build-card' + (state.selectedBuildId === building.id ? ' active' : '') + (!availability.ok ? ' locked' : '');
    card.innerHTML = `
      <div class="build-card__head">
        <div class="build-card__icon">${building.icon}</div>
        <div>
          <div class="build-card__title">${building.name}</div>
          <div class="build-card__desc">${building.type}</div>
        </div>
      </div>
      <div class="build-card__meta">
        <span class="chip">🪙 ${building.cost}</span>
        ${building.basePopulation ? `<span class="chip">👥 +${building.basePopulation}</span>` : ''}
        ${building.baseIncome ? `<span class="chip">💸 +${building.baseIncome}/с</span>` : ''}
        ${building.id === 'park' ? `<span class="chip">✨ соседям +12%</span>` : ''}
      </div>
      <button class="build-card__button" ${availability.ok ? '' : 'disabled'}>${state.selectedBuildId === building.id ? 'Выбрано' : 'Выбрать'}</button>
    `;
    card.querySelector('.build-card__button').addEventListener('click', () => {
      state.selectedBuildId = state.selectedBuildId === building.id ? null : building.id;
      state.selectedTileId = null;
      renderAll();
    });
    card.title = availability.ok ? building.description : availability.reason;
    els.buildMenu.appendChild(card);
  }

  if (!state.selectedBuildId) {
    els.buildHint.textContent = 'Выбери постройку и нажми на свободную клетку.';
  } else {
    const selected = BUILDINGS[state.selectedBuildId];
    const availability = canBuild(selected.id);
    els.buildHint.textContent = availability.ok
      ? `Режим строительства: ${selected.name}. Подсветка покажет валидные клетки.`
      : `Режим строительства: ${selected.name}. ${availability.reason}`;
  }
}

function renderBoard() {
  els.board.innerHTML = '';
  const canCurrentBuild = state.selectedBuildId ? canBuild(state.selectedBuildId).ok : false;
  const layout = getBoardLayout();

  els.board.style.width = `${layout.width}px`;
  els.board.style.height = `${layout.height}px`;
  els.board.style.setProperty('--tile-width', `${ISO_TILE_W}px`);
  els.board.style.setProperty('--tile-height', `${ISO_TILE_H}px`);

  const drawOrder = [...state.tiles].sort((a, b) => {
    const da = a.row + a.col;
    const db = b.row + b.col;
    if (da !== db) return da - db;
    return a.row - b.row;
  });

  for (const tile of drawOrder) {
    const tileEl = document.createElement('button');
    tileEl.className = 'tile';
    const p = projectIso(tile.row, tile.col);
    tileEl.style.left = `${p.x + layout.offsetX}px`;
    tileEl.style.top = `${p.y + layout.offsetY}px`;
    tileEl.style.zIndex = String(100 + tile.row + tile.col);

    if (!tile.unlocked) tileEl.classList.add('locked');
    if (state.selectedTileId === tile.id) tileEl.classList.add('selected');
    if (state.hoverTileId === tile.id) tileEl.classList.add('hovered');
    if (state.tileFx[tile.id]) tileEl.classList.add(state.tileFx[tile.id]);

    if (state.selectedBuildId && tile.unlocked && !tile.building) {
      tileEl.classList.add('available');
      tileEl.classList.add(canCurrentBuild ? 'valid-target' : 'invalid-target');
    }

    tileEl.dataset.tileId = tile.id;

    if (!tile.unlocked) {
      const cost = unlockCost(tile);
      tileEl.innerHTML = `<span class="tile__lock">🔒</span><span class="tile__cost">Открыть<br>🪙 ${cost}</span>`;
    } else if (tile.building) {
      tileEl.classList.add('occupied');
      const building = tile.building;
      const data = BUILDINGS[building.id];
      const stats = getBuildingStats(building);
      const bonusPct = Math.round((getParkBonusMultiplier(tile) - 1) * 100);

      const shadowEl = document.createElement('div');
      shadowEl.className = 'building-shadow';
      tileEl.appendChild(shadowEl);

      const buildingEl = document.createElement('div');
      buildingEl.className = `building ${data.colorClass} level-${building.level}`;
      buildingEl.innerHTML = `<span class="building__level">${building.level}</span>${bonusPct ? `<span class="building__bonus">+${bonusPct}%</span>` : ''}`;
      tileEl.appendChild(buildingEl);

      const parkAdj = getParkAdjacency(tile);
      tileEl.title = `${data.name} • Ур. ${building.level} • Доход ${stats.income}/с${bonusPct ? ` (+${bonusPct}% от парка)` : ''}${parkAdj ? ` • Парков рядом: ${parkAdj}` : ''}`;
    }

    tileEl.addEventListener('click', () => handleTileClick(tile.id, tileEl));
    tileEl.addEventListener('mouseenter', () => {
      state.hoverTileId = tile.id;
      renderBoard();
    });
    tileEl.addEventListener('mouseleave', () => {
      if (state.hoverTileId === tile.id) {
        state.hoverTileId = null;
        renderBoard();
      }
    });

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
  const parkAdj = getParkAdjacency(tile);

  els.buildingPanel.className = 'building-panel';
  els.buildingPanel.innerHTML = `
    <div class="building-panel__header">
      <div class="building-panel__icon">${data.icon}</div>
      <div>
        <div class="building-panel__title">${data.name}</div>
        <div class="building-panel__subtitle">${data.type} • клетка ${tile.row + 1}:${tile.col + 1}</div>
      </div>
      <button class="panel-close" id="closePanelBtn">✕</button>
    </div>

    <div class="building-panel__stats">
      <div class="kpi"><div class="kpi__label">Уровень</div><div class="kpi__value">${building.level} / ${data.maxLevel}</div></div>
      <div class="kpi"><div class="kpi__label">Доход</div><div class="kpi__value">${stats.income}/с ${neighborBonus ? `(+${neighborBonus}%)` : ''}</div></div>
      <div class="kpi"><div class="kpi__label">Улучшение</div><div class="kpi__value">${nextUpgradeCost ? `🪙 ${nextUpgradeCost}` : 'MAX'}</div></div>
      <div class="kpi"><div class="kpi__label">Парки рядом</div><div class="kpi__value">${parkAdj || '—'}</div></div>
    </div>

    <div class="building-panel__actions">
      <button class="building-panel__button building-panel__button--primary" id="upgradeBtn">${nextUpgradeCost ? `⬆️ Улучшить` : 'Макс. уровень'}</button>
      <button class="building-panel__button building-panel__button--danger" id="demolishBtn">🧱 Снести</button>
    </div>

    <div class="building-panel__note">
      ${data.description}
      ${building.id === 'park' ? ' Каждый парк даёт +12% соседним зданиям и ещё +2% за уровень выше первого.' : ''}
    </div>
  `;

  const upgradeBtn = document.getElementById('upgradeBtn');
  const demolishBtn = document.getElementById('demolishBtn');
  const closePanelBtn = document.getElementById('closePanelBtn');
  if (upgradeBtn) {
    upgradeBtn.disabled = !nextUpgradeCost;
    upgradeBtn.style.opacity = nextUpgradeCost ? '1' : '0.6';
    upgradeBtn.addEventListener('click', upgradeSelectedBuilding);
  }
  demolishBtn.addEventListener('click', demolishSelectedBuilding);
  closePanelBtn.addEventListener('click', () => {
    state.selectedTileId = null;
    renderAll();
  });
}

function renderGoals() {
  const economy = computeEconomy();
  const buildingsCount = state.tiles.filter(t => t.building).length;
  const unlockedCount = state.tiles.filter(t => t.unlocked).length;

  const goals = [
    { done: buildingsCount >= 4, icon: '🏘️', title: 'Первые кварталы', desc: `${buildingsCount}/4 зданий построено` },
    { done: economy.population >= 24, icon: '👥', title: 'Растущее население', desc: `${economy.population}/24 жителей` },
    { done: unlockedCount >= 24, icon: '🗺️', title: 'Расширение города', desc: `${unlockedCount}/24 клеток открыто` }
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

  if (!tile.unlocked) return tryUnlockTile(tile, tileEl);

  if (tile.building) {
    state.selectedTileId = tile.id;
    state.selectedBuildId = null;
    return renderAll();
  }

  if (state.selectedBuildId) return placeBuilding(tile, tileEl);

  state.selectedTileId = null;
  renderAll();
}

function tryUnlockTile(tile, tileEl) {
  const cost = unlockCost(tile);
  if (state.coins < cost) return toast('Недостаточно монет для открытия клетки');

  state.coins -= cost;
  tile.unlocked = true;
  markTileFx(tile.id, 'unlock-fx');
  toast('Новая клетка открыта');
  spawnFloat(tileEl, `-${cost}🪙`);
  autosave();
  renderAll();
}

function placeBuilding(tile, tileEl) {
  const data = BUILDINGS[state.selectedBuildId];
  const check = canBuild(state.selectedBuildId);
  if (!check.ok) return toast(check.reason);

  state.coins -= data.cost;
  tile.building = { id: data.id, level: 1 };
  state.selectedTileId = tile.id;
  markTileFx(tile.id, 'place-fx');
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
  if (building.level >= data.maxLevel) return toast('Максимальный уровень');

  const cost = data.upgradeCost[building.level];
  if (state.coins < cost) return toast('Недостаточно монет для улучшения');

  state.coins -= cost;
  building.level += 1;
  markTileFx(tile.id, 'upgrade-fx');
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
  const refund = Math.round(builtCost * 0.45);

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
  localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 2, state }));
  state.lastSavedAt = Date.now();
  if (showToast) toast('Игра сохранена');
}

function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY) || localStorage.getItem('cozy-town-builder-v1');
  if (!raw) return false;

  try {
    const payload = JSON.parse(raw);
    if (!payload?.state?.tiles) return false;

    Object.assign(state, payload.state);
    state.hoverTileId = null;
    state.tileFx = {};
    state.selectedBuildId = null;
    return true;
  } catch (e) {
    console.error('Save load error', e);
    return false;
  }
}

function resetGame() {
  if (!window.confirm('Начать новую игру? Текущее сохранение будет удалено.')) return;

  localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem('cozy-town-builder-v1');
  state.coins = START_COINS;
  state.totalEarned = START_COINS;
  state.selectedBuildId = null;
  state.selectedTileId = null;
  state.hoverTileId = null;
  state.lastSavedAt = null;
  state.tick = 0;
  state.tileFx = {};
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
  toast(loaded ? 'Сохранение загружено' : 'Добро пожаловать в уютный город');
  setInterval(tickIncome, 1000);
}

init();

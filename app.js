const DEFAULT_AREA_ID = "kwai-hing-mainland";
const LEGACY_CACHE_KEY = "kwai-tsing-pikmin-cache:v1";
const AREA_CACHE_PREFIX = "hk-pikmin-area-cache:v1:";
const SELECTED_AREA_KEY = "hk-pikmin-selected-area:v1";
const DISPLAY_MODE_KEY = "kwai-tsing-pikmin-pin-mode:v1";
const HOME = { lat: 22.350175034704407, lng: 114.13349747657777, zoom: 15 };
const HK_BOUNDS = [
  [22.13, 113.8],
  [22.58, 114.45],
];
const TSING_YI_POLYGON = [
  [22.371, 114.088],
  [22.366, 114.104],
  [22.354, 114.116],
  [22.339, 114.116],
  [22.323, 114.106],
  [22.311, 114.089],
  [22.318, 114.073],
  [22.336, 114.063],
  [22.356, 114.066],
];
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const COLOR_PALETTE = [
  "#237a55",
  "#2d6cdf",
  "#bf6f23",
  "#7c4d9e",
  "#c1435a",
  "#2f7f8f",
  "#6f7f2a",
  "#8a5c2f",
  "#d39b20",
  "#4956a4",
  "#1f8a70",
  "#a4477f",
];
const DECOR_EMOJI = {
  AirPort: "✈️",
  AmusementPark: "🎡",
  Bakery: "🥐",
  Beach: "🏖️",
  Bridge: "🌉",
  BusStop: "🚏",
  Cafe: "☕",
  ClosthingStore: "👕",
  ConvenienceStore: "🏪",
  Cosme: "💄",
  Curry: "🍛",
  Desert: "🍰",
  Electronics: "🔌",
  Forest: "🌲",
  Hamburger: "🍔",
  HardwareStore: "🛠️",
  Hotel: "🏨",
  ItalianRestaurant: "🍕",
  KoreanRestaurant: "🥘",
  Laundry: "🧺",
  Library: "📚",
  MexicanRestaurant: "🌮",
  Mountain: "⛰️",
  Museum: "🖼️",
  Omikuji: "⛩️",
  Park: "🌳",
  Pharmacy: "💊",
  Posts: "📮",
  RamenRestaurant: "🍜",
  Restaurant: "🍽️",
  Salon: "✂️",
  Station: "🚉",
  Stadium: "🏟️",
  Supermarket: "🛒",
  SushiRestaurant: "🍣",
  Theatre: "🎬",
  University: "🎓",
  Water: "💧",
  Zoo: "🦁",
};

const els = {
  areaSelect: document.querySelector("#area-select"),
  clearCache: document.querySelector("#clear-cache"),
  dataMeta: document.querySelector("#data-meta"),
  decorList: document.querySelector("#decor-list"),
  fitMap: document.querySelector("#fit-map"),
  panel: document.querySelector(".control-panel"),
  panelToggle: document.querySelector("#panel-toggle"),
  pinModeButtons: [...document.querySelectorAll("[data-pin-mode]")],
  refreshData: document.querySelector("#refresh-data"),
  refreshDataMobile: document.querySelector("#refresh-data-mobile"),
  searchInput: document.querySelector("#search-input"),
  selectAll: document.querySelector("#select-all"),
  statusDot: document.querySelector("#status-dot"),
  statusText: document.querySelector("#status-text"),
  totalCount: document.querySelector("#total-count"),
  visibleCount: document.querySelector("#visible-count"),
};

const state = {
  activeDecors: new Set(),
  areaDefinitions: [],
  decorDefinitions: [],
  decorMeta: new Map(),
  dataset: null,
  datasetOrigin: "",
  displayMode: readDisplayMode(),
  markers: [],
  markerLayer: null,
  map: null,
  search: "",
  selectedAreaId: DEFAULT_AREA_ID,
  snapshot: null,
};

bootstrap().catch((error) => {
  console.error(error);
  setStatus("Could not start map", error.message, "error");
});

async function bootstrap() {
  setStatus("Loading local data...", "Preparing map", "loading");
  state.map = createMap();
  state.markerLayer = L.layerGroup().addTo(state.map);
  requestAnimationFrame(() => state.map.invalidateSize());
  setTimeout(() => state.map.invalidateSize(), 250);

  const [decorDefinitions, areaDefinitions, snapshot] = await Promise.all([
    loadJson("data/decor-definitions.json"),
    loadJson("data/hk-areas.json"),
    loadJson("data/kwai-tsing-decors.json"),
  ]);

  state.areaDefinitions = areaDefinitions;
  state.decorDefinitions = decorDefinitions;
  state.decorMeta = buildDecorMeta(decorDefinitions);
  state.snapshot = snapshot;
  state.selectedAreaId = readSelectedAreaId(areaDefinitions);

  renderAreaOptions();
  bindEvents();
  loadSelectedAreaData({ fitMap: true });
}

function createMap() {
  const map = L.map("map", {
    maxBounds: HK_BOUNDS,
    maxBoundsViscosity: 0.65,
    preferCanvas: true,
    renderer: L.canvas({ padding: 0.4 }),
    zoomControl: false,
  }).setView([HOME.lat, HOME.lng], HOME.zoom);

  L.control.zoom({ position: "topright" }).addTo(map);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    detectRetina: true,
    maxZoom: 20,
  }).addTo(map);

  return map;
}

function bindEvents() {
  els.refreshData.addEventListener("click", refreshFromOverpass);
  els.refreshDataMobile.addEventListener("click", refreshFromOverpass);
  els.clearCache.addEventListener("click", () => {
    localStorage.removeItem(getAreaCacheKey(state.selectedAreaId));
    localStorage.removeItem(LEGACY_CACHE_KEY);
    loadSelectedAreaData({ fitMap: false });
  });
  els.areaSelect.addEventListener("change", (event) => {
    state.selectedAreaId = event.target.value;
    localStorage.setItem(SELECTED_AREA_KEY, state.selectedAreaId);
    state.activeDecors.clear();
    loadSelectedAreaData({ fitMap: true });
  });
  els.fitMap.addEventListener("click", fitToVisibleMarkers);
  els.selectAll.addEventListener("click", () => {
    state.activeDecors.clear();
    renderDecorFilters();
    renderDataset();
  });
  els.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderDataset();
  });
  els.pinModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setDisplayMode(button.dataset.pinMode);
    });
  });
  els.panelToggle.addEventListener("click", () => {
    els.panel.classList.toggle("is-open");
    setTimeout(() => state.map.invalidateSize(), 220);
  });
  window.addEventListener("resize", () => state.map.invalidateSize());
}

function renderAreaOptions() {
  const groups = new Map();
  state.areaDefinitions.forEach((area) => {
    if (!groups.has(area.group)) groups.set(area.group, []);
    groups.get(area.group).push(area);
  });

  const fragments = [...groups.entries()].map(([group, areas]) => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = group;
    areas.forEach((area) => {
      const option = document.createElement("option");
      option.value = area.id;
      option.textContent = area.label;
      optgroup.append(option);
    });
    return optgroup;
  });

  els.areaSelect.replaceChildren(...fragments);
  els.areaSelect.value = state.selectedAreaId;
}

function loadSelectedAreaData({ fitMap } = { fitMap: false }) {
  const area = getSelectedArea();
  const cached = readAreaCachedDataset(area.id);
  const legacy = canUseKwaiTsingSnapshot(area) ? readLegacyCachedDataset() : null;
  const snapshot = canUseKwaiTsingSnapshot(area) ? state.snapshot : null;
  const source = cached ?? legacy ?? snapshot;
  const origin = cached || legacy ? "browser cache" : snapshot ? "local snapshot" : "no local data";

  state.dataset = source ? prepareDatasetForArea(source, area) : createEmptyDataset(area);
  state.datasetOrigin = origin;
  renderDecorFilters();
  renderDataset();

  if (fitMap) {
    fitSelectedArea();
  }

  updateAreaStatus();
}

async function refreshFromOverpass() {
  const area = getSelectedArea();
  setRefreshBusy(true);
  setStatus("Refreshing OSM data...", `Asking Overpass for ${area.label}`, "loading");

  try {
    const query = buildOverpassQuery(state.decorDefinitions, area);
    const raw = await fetchOverpass(query);
    const dataset = prepareDatasetForArea(normalizeOverpass(raw, state.decorDefinitions, area), area);

    localStorage.setItem(getAreaCacheKey(area.id), JSON.stringify(dataset));
    state.dataset = dataset;
    state.datasetOrigin = "browser cache";
    state.activeDecors.clear();
    renderDecorFilters();
    renderDataset();
    fitToVisibleMarkers();
    updateAreaStatus();
  } catch (error) {
    console.error(error);
    setStatus("Refresh failed", error.message, "error");
  } finally {
    setRefreshBusy(false);
  }
}

function renderDataset() {
  const features = getFilteredFeatures();
  state.markerLayer.clearLayers();
  renderDisplayModeButtons();
  state.markers = features.map((feature) => {
    const marker =
      state.displayMode === "emoji" ? createEmojiMarker(feature) : createDotMarker(feature);

    marker.bindPopup(buildPopup(feature), {
      closeButton: true,
      maxWidth: 280,
    });
    marker.addTo(state.markerLayer);
    return marker;
  });

  els.visibleCount.textContent = features.length.toLocaleString();
  els.totalCount.textContent = (state.dataset?.features.length ?? 0).toLocaleString();
  updateDecorCounts(features);
}

function createDotMarker(feature) {
  const primaryDecor = feature.decors[0];
  const meta = state.decorMeta.get(primaryDecor.icon);
  return L.circleMarker([feature.lat, feature.lng], {
    bubblingMouseEvents: false,
    color: meta?.color ?? "#237a55",
    fillColor: meta?.color ?? "#237a55",
    fillOpacity: 0.78,
    opacity: 0.92,
    radius: markerRadius(feature),
    weight: 2,
  });
}

function createEmojiMarker(feature) {
  const primaryDecor = feature.decors[0];
  const meta = state.decorMeta.get(primaryDecor.icon);
  const label = getDecorEmoji(primaryDecor.icon);
  const badge =
    feature.decors.length > 1
      ? `<span class="emoji-marker-badge">${feature.decors.length}</span>`
      : "";

  return L.marker([feature.lat, feature.lng], {
    icon: L.divIcon({
      className: "",
      html: `
        <span class="emoji-marker" style="--marker-color: ${meta?.color ?? "#237a55"}">
          <span class="emoji-marker-symbol">${label}</span>
          ${badge}
        </span>
      `,
      iconAnchor: [16, 34],
      iconSize: [32, 34],
      popupAnchor: [0, -31],
    }),
    keyboard: true,
    title: `${feature.name} - ${primaryDecor.label}`,
  });
}

function setDisplayMode(mode) {
  const nextMode = mode === "emoji" ? "emoji" : "dot";
  state.displayMode = nextMode;
  localStorage.setItem(DISPLAY_MODE_KEY, nextMode);
  renderDataset();
}

function renderDisplayModeButtons() {
  els.pinModeButtons.forEach((button) => {
    const isActive = button.dataset.pinMode === state.displayMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function renderDecorFilters() {
  const counts = countByDecor(state.dataset?.features ?? []);
  const buttons = state.decorDefinitions.map((decor) => {
    const meta = state.decorMeta.get(decor.icon);
    const isActive = state.activeDecors.has(decor.icon);
    const count = counts.get(decor.icon) ?? 0;
    const button = document.createElement("button");
    button.className = "decor-filter";
    button.type = "button";
    button.style.setProperty("--decor-color", meta.color);
    button.setAttribute("aria-pressed", String(isActive));
    button.innerHTML = `
      <span class="decor-color" aria-hidden="true"></span>
      <span class="decor-name">${escapeHtml(decor.label)}</span>
      <span class="decor-count">${count}</span>
    `;
    button.addEventListener("click", () => {
      if (state.activeDecors.has(decor.icon)) {
        state.activeDecors.delete(decor.icon);
      } else {
        state.activeDecors.add(decor.icon);
      }
      renderDecorFilters();
      renderDataset();
    });
    return button;
  });

  els.decorList.replaceChildren(...buttons);
}

function updateDecorCounts(filteredFeatures) {
  const counts = countByDecor(filteredFeatures);
  document.querySelectorAll(".decor-filter").forEach((button, index) => {
    const decor = state.decorDefinitions[index];
    const count = counts.get(decor.icon) ?? 0;
    button.querySelector(".decor-count").textContent = count;
  });
}

function getFilteredFeatures() {
  const features = state.dataset?.features ?? [];
  const hasDecorFilter = state.activeDecors.size > 0;
  const search = state.search;

  return features.filter((feature) => {
    const decorMatch =
      !hasDecorFilter || feature.decors.some((decor) => state.activeDecors.has(decor.icon));
    if (!decorMatch) return false;
    if (!search) return true;

    const haystack = [
      feature.name,
      feature.id,
      ...feature.decors.map((decor) => decor.label),
      ...Object.entries(feature.tags ?? {}).map(([key, value]) => `${key}=${value}`),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(search);
  });
}

function fitToVisibleMarkers() {
  const markers = state.markers;
  if (markers.length === 0) {
    fitSelectedArea();
    return;
  }

  const group = L.featureGroup(markers);
  state.map.fitBounds(group.getBounds().pad(0.12), { maxZoom: 17, padding: [24, 24] });
}

function fitSelectedArea() {
  const area = getSelectedArea();
  state.map.fitBounds(area.bounds ?? HK_BOUNDS, { padding: [30, 30] });
}

function markerRadius(feature) {
  if (feature.decors.length > 2) return 8;
  if (feature.decors.length > 1) return 7;
  return 6;
}

function getDecorEmoji(icon) {
  return DECOR_EMOJI[icon] ?? "📍";
}

function buildPopup(feature) {
  const decorChips = feature.decors
    .map((decor) => `<span class="chip">${escapeHtml(decor.label)}</span>`)
    .join("");
  const tagChips = Object.entries(feature.tags ?? {})
    .filter(([key]) => ["amenity", "shop", "tourism", "leisure", "natural", "cuisine", "railway", "highway"].includes(key))
    .slice(0, 7)
    .map(([key, value]) => `<span class="tag-chip">${escapeHtml(key)}=${escapeHtml(value)}</span>`)
    .join("");

  return `
    <article class="poi-popup">
      <h3>${escapeHtml(feature.name)}</h3>
      <div class="decor-chips">${decorChips}</div>
      ${tagChips ? `<div class="popup-tags">${tagChips}</div>` : ""}
      <a class="osm-link" href="https://www.openstreetmap.org/${feature.osmType}/${feature.osmId}" target="_blank" rel="noreferrer">
        View on OSM
      </a>
    </article>
  `;
}

function buildDecorMeta(definitions) {
  return new Map(
    definitions.map((decor, index) => [
      decor.icon,
      {
        color: COLOR_PALETTE[index % COLOR_PALETTE.length],
        index,
      },
    ]),
  );
}

function countByDecor(features) {
  const counts = new Map();
  features.forEach((feature) => {
    feature.decors.forEach((decor) => {
      counts.set(decor.icon, (counts.get(decor.icon) ?? 0) + 1);
    });
  });
  return counts;
}

async function loadJson(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Could not load ${url}: ${response.status}`);
  }
  return response.json();
}

function readAreaCachedDataset(areaId) {
  return readCachedDataset(getAreaCacheKey(areaId));
}

function readLegacyCachedDataset() {
  return readCachedDataset(LEGACY_CACHE_KEY);
}

function readCachedDataset(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return Array.isArray(data.features) ? data : null;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function getAreaCacheKey(areaId) {
  return `${AREA_CACHE_PREFIX}${areaId}`;
}

function readSelectedAreaId(areaDefinitions) {
  const saved = localStorage.getItem(SELECTED_AREA_KEY);
  return areaDefinitions.some((area) => area.id === saved) ? saved : DEFAULT_AREA_ID;
}

function readDisplayMode() {
  return localStorage.getItem(DISPLAY_MODE_KEY) === "emoji" ? "emoji" : "dot";
}

function buildDatasetMeta(dataset, origin) {
  const area = getSelectedArea();
  const count = dataset?.features?.length ?? 0;
  if (origin === "no local data") {
    return `No cached data for ${area.label}. Press Refresh data to pull current OSM data.`;
  }
  const when = dataset?.generatedAt ? formatDate(dataset.generatedAt) : "not generated yet";
  return `${count.toLocaleString()} places in ${area.label} from ${origin}. Updated: ${when}.`;
}

function updateAreaStatus() {
  const hasData = (state.dataset?.features.length ?? 0) > 0;
  setStatus(
    hasData ? "Ready" : "No local data",
    buildDatasetMeta(state.dataset, state.datasetOrigin),
    hasData ? "ready" : "loading",
  );
}

function setStatus(label, detail, mode) {
  els.statusText.textContent = label;
  els.dataMeta.textContent = detail;
  els.statusDot.classList.toggle("is-ready", mode === "ready");
  els.statusDot.classList.toggle("is-error", mode === "error");
}

function setRefreshBusy(isBusy) {
  [els.refreshData, els.refreshDataMobile].forEach((button) => {
    button.disabled = isBusy;
    button.textContent = isBusy ? "Refreshing..." : button.id.includes("mobile") ? "Refresh" : "Refresh data";
  });
}

async function fetchOverpass(query) {
  let lastError;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      const response = await fetch(endpoint, {
        body: `data=${encodeURIComponent(query)}`,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`${endpoint} returned ${response.status}`);
      }

      return response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Overpass did not respond: ${lastError?.message ?? "unknown error"}`);
}

function getSelectedArea() {
  return (
    state.areaDefinitions.find((area) => area.id === state.selectedAreaId) ??
    state.areaDefinitions.find((area) => area.id === DEFAULT_AREA_ID) ??
    state.areaDefinitions[0]
  );
}

function canUseKwaiTsingSnapshot(area) {
  return area.relationId === 7351646;
}

function prepareDatasetForArea(dataset, area) {
  const features = applyAreaFeatureFilter(dataset.features ?? [], area);

  return {
    ...dataset,
    area: {
      id: area.id,
      name: area.label,
      osmRelation: area.relationId,
      overpassArea: getOverpassAreaId(area.relationId),
      filter: area.filter ?? null,
    },
    features,
  };
}

function createEmptyDataset(area) {
  return {
    generatedAt: null,
    source: "OpenStreetMap via Overpass API",
    area: {
      id: area.id,
      name: area.label,
      osmRelation: area.relationId,
      overpassArea: getOverpassAreaId(area.relationId),
      filter: area.filter ?? null,
    },
    features: [],
  };
}

function applyAreaFeatureFilter(features, area) {
  if (area.filter === "tsing-yi") {
    return features.filter((feature) => isPointInPolygon(feature.lat, feature.lng, TSING_YI_POLYGON));
  }
  if (area.filter === "not-tsing-yi") {
    return features.filter((feature) => !isPointInPolygon(feature.lat, feature.lng, TSING_YI_POLYGON));
  }
  return [...features];
}

function isPointInPolygon(lat, lng, polygon) {
  let isInside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];
    const intersects =
      latI > lat !== latJ > lat &&
      lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI;
    if (intersects) isInside = !isInside;
  }
  return isInside;
}

function getOverpassAreaId(relationId) {
  return 3600000000 + relationId;
}

function buildOverpassQuery(definitions, area) {
  const clauses = new Set();

  definitions.forEach((decor) => {
    if (decor.area && decor.area !== "HK") return;
    normalizeDecorConditions(decor).forEach((condition) => {
      const filters = condition
        .map(({ key, value }) => `["${escapeOverpass(key)}"="${escapeOverpass(value)}"]`)
        .join("");
      clauses.add(`nwr${filters}(area.searchArea);`);
    });
  });

  return `
[out:json][timeout:90];
area(id:${getOverpassAreaId(area.relationId)})->.searchArea;
(
  ${[...clauses].join("\n  ")}
);
out center;
`.trim();
}

function normalizeOverpass(raw, definitions, area) {
  const features = (raw.elements ?? [])
    .map((element) => toFeature(element, definitions))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, "en"));

  return {
    generatedAt: new Date().toISOString(),
    source: "OpenStreetMap via Overpass API",
    area: {
      id: area.id,
      name: area.label,
      osmRelation: area.relationId,
      overpassArea: getOverpassAreaId(area.relationId),
      filter: area.filter ?? null,
    },
    features,
  };
}

function toFeature(element, definitions) {
  const point = getElementPoint(element);
  if (!point) return null;

  const tags = element.tags ?? {};
  const decors = definitions
    .filter((decor) => !decor.area || decor.area === "HK")
    .filter((decor) => decorMatchesTags(decor, tags))
    .map(({ icon, label }) => ({ icon, label }));

  if (decors.length === 0) return null;

  return {
    decors,
    id: `${element.type}/${element.id}`,
    lat: point.lat,
    lng: point.lng,
    name: getElementName(element),
    osmId: element.id,
    osmType: element.type,
    tags,
  };
}

function getElementPoint(element) {
  if (Number.isFinite(element.lat) && Number.isFinite(element.lon)) {
    return { lat: element.lat, lng: element.lon };
  }
  if (element.center && Number.isFinite(element.center.lat) && Number.isFinite(element.center.lon)) {
    return { lat: element.center.lat, lng: element.center.lon };
  }
  return null;
}

function getElementName(element) {
  const tags = element.tags ?? {};
  return (
    tags["name:zh"] ||
    tags.name ||
    tags["name:en"] ||
    tags.brand ||
    tags.operator ||
    tags.shop ||
    tags.amenity ||
    tags.tourism ||
    `${element.type} ${element.id}`
  );
}

function decorMatchesTags(decor, tags) {
  return normalizeDecorConditions(decor).some((condition) =>
    condition.every(({ key, value }) => tags[key] === value),
  );
}

function normalizeDecorConditions(decor) {
  return decor.tags.map((entry) => {
    const pieces = Array.isArray(entry) ? entry : [entry];
    return pieces.map(parseTagExpression);
  });
}

function parseTagExpression(expression) {
  const [key, ...rest] = expression.split("=");
  const value = rest.join("=").replace(/^['"]|['"]$/g, "");
  return { key, value };
}

function escapeOverpass(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-HK", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

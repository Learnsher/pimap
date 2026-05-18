import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, "..");
const KWAI_TSING_AREA_ID = 3607351646;
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const definitions = JSON.parse(
  await readFile(join(appRoot, "data", "decor-definitions.json"), "utf8"),
);
const query = buildOverpassQuery(definitions);
const raw = await fetchOverpass(query);
const dataset = normalizeOverpass(raw, definitions);

await writeFile(
  join(appRoot, "data", "kwai-tsing-decors.json"),
  `${JSON.stringify(dataset, null, 2)}\n`,
);

console.log(
  `Saved ${dataset.features.length} Kwai Tsing decor candidates to data/kwai-tsing-decors.json`,
);

async function fetchOverpass(queryText) {
  let lastError;

  for (const endpoint of ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      const response = await fetch(endpoint, {
        body: `data=${encodeURIComponent(queryText)}`,
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
      console.warn(`Overpass endpoint failed: ${endpoint} (${error.message})`);
    }
  }

  throw new Error(`All Overpass endpoints failed: ${lastError?.message ?? "unknown error"}`);
}

function buildOverpassQuery(decorDefinitions) {
  const clauses = new Set();

  decorDefinitions.forEach((decor) => {
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
area(id:${KWAI_TSING_AREA_ID})->.searchArea;
(
  ${[...clauses].join("\n  ")}
);
out center;
`.trim();
}

function normalizeOverpass(raw, decorDefinitions) {
  const features = (raw.elements ?? [])
    .map((element) => toFeature(element, decorDefinitions))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, "en"));

  return {
    generatedAt: new Date().toISOString(),
    source: "OpenStreetMap via Overpass API",
    area: {
      name: "Kwai Tsing District",
      osmRelation: 7351646,
      overpassArea: KWAI_TSING_AREA_ID,
    },
    features,
  };
}

function toFeature(element, decorDefinitions) {
  const point = getElementPoint(element);
  if (!point) return null;

  const tags = element.tags ?? {};
  const decors = decorDefinitions
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

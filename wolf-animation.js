/**
 * Wolf trajectory animation overlay for the ca-wolves geo-agent app.
 *
 * Fetches wolf_tracks.geojson (per-pack LineStrings with timestamps) and
 * wolf_bins_latest.geojson (current hexbin positions for all wolves),
 * then animates colored dots along the trajectories in a continuous loop.
 */

const DATA_BASE = "https://s3-west.nrp-nautilus.io/public-ca-wolves";
const LOOP_DURATION_MS = 30_000; // 30 seconds per full loop

const PACK_COLORS = {
  "Whaleback 1":            "#E65100",
  "Whaleback 2":            "#FF6D00",
  "Whaleback 4":            "#FFAB40",
  "Whaleback Disperser 1":  "#FFD180",
  "Whaleback Disperser 2":  "#FFE0B2",
  "Harvey 1":               "#1565C0",
  "Harvey 3":               "#42A5F5",
  "Yowlumni Disperser":     "#F9A825",
};
const FALLBACK_COLOR = "#888888";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexCentroid(ring) {
  // Average of polygon vertices (skip closing vertex which duplicates the first)
  const n = ring.length - 1;
  let lon = 0, lat = 0;
  for (let i = 0; i < n; i++) { lon += ring[i][0]; lat += ring[i][1]; }
  return [lon / n, lat / n];
}

function lerp(a, b, t) {
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

function interpolateTrack(track, time) {
  const { coords, times } = track;
  if (time <= times[0]) return coords[0];
  if (time >= times[times.length - 1]) return coords[coords.length - 1];
  for (let i = 0; i < times.length - 1; i++) {
    if (time >= times[i] && time < times[i + 1]) {
      const frac = (time - times[i]) / (times[i + 1] - times[i]);
      return lerp(coords[i], coords[i + 1], frac);
    }
  }
  return coords[coords.length - 1];
}

function formatDate(epochMs) {
  const d = new Date(epochMs);
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "America/Los_Angeles", timeZoneName: "short",
  });
}

function buildColorMatch() {
  const expr = ["match", ["get", "pack"]];
  for (const [pack, color] of Object.entries(PACK_COLORS)) {
    expr.push(pack, color);
  }
  expr.push(FALLBACK_COLOR);
  return expr;
}

// ---------------------------------------------------------------------------
// Wait for map
// ---------------------------------------------------------------------------

async function waitForMap() {
  for (let i = 0; i < 600; i++) {
    const map = window.__geoMap;
    if (map && map.isStyleLoaded && map.isStyleLoaded()) return map;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error("wolf-animation: timed out waiting for map");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function init() {
  const map = await waitForMap();

  const [tracksData, latestData] = await Promise.all([
    fetch(`${DATA_BASE}/wolf_tracks.geojson`).then(r => r.json()),
    fetch(`${DATA_BASE}/wolf_bins_latest.geojson`).then(r => r.json()),
  ]);

  // Parse tracks
  const tracksByPack = new Map();
  let globalStart = Infinity, globalEnd = -Infinity;

  for (const feat of tracksData.features) {
    const pack = feat.properties.pack;
    const coords = feat.geometry.coordinates;
    const times = feat.properties.timestamps.map(t => new Date(t).getTime());
    tracksByPack.set(pack, { coords, times });
    globalStart = Math.min(globalStart, times[0]);
    globalEnd = Math.max(globalEnd, times[times.length - 1]);
  }

  // Parse latest positions (centroids of hexbin polygons)
  const latestPositions = new Map();
  for (const feat of latestData.features) {
    const pack = feat.properties.pack;
    const centroid = hexCentroid(feat.geometry.coordinates[0]);
    latestPositions.set(pack, centroid);
  }

  // All packs = union of both datasets
  const allPacks = [...new Set([...tracksByPack.keys(), ...latestPositions.keys()])];

  // If no tracks at all, nothing to animate
  if (globalStart === Infinity) {
    console.log("wolf-animation: no tracks to animate");
    return;
  }

  const timeRange = globalEnd - globalStart;
  const colorMatch = buildColorMatch();

  // --- Add track lines (static, faint) ---
  map.addSource("wolf-track-lines", { type: "geojson", data: tracksData });
  map.addLayer({
    id: "wolf-track-lines-layer",
    source: "wolf-track-lines",
    type: "line",
    paint: {
      "line-color": colorMatch,
      "line-width": 2,
      "line-opacity": 0.35,
    },
  });

  // --- Add animated dots ---
  const emptyFC = { type: "FeatureCollection", features: [] };
  map.addSource("wolf-dots", { type: "geojson", data: emptyFC });
  map.addLayer({
    id: "wolf-dots-layer",
    source: "wolf-dots",
    type: "circle",
    paint: {
      "circle-radius": 7,
      "circle-color": colorMatch,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  });

  // --- Add labels ---
  map.addSource("wolf-labels", { type: "geojson", data: emptyFC });
  map.addLayer({
    id: "wolf-labels-layer",
    source: "wolf-labels",
    type: "symbol",
    layout: {
      "text-field": ["get", "pack"],
      "text-size": 11,
      "text-offset": [0, 1.5],
      "text-anchor": "top",
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": "#333333",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1,
    },
  });

  // --- UI controls ---
  const panel = document.createElement("div");
  panel.id = "wolf-anim-controls";
  panel.innerHTML = `
    <button id="wolf-play-btn" title="Play / Pause">&#9654;</button>
    <span id="wolf-time-display"></span>
    <select id="wolf-speed" title="Animation speed">
      <option value="1">1x</option>
      <option value="2">2x</option>
      <option value="4">4x</option>
    </select>
  `;
  document.body.appendChild(panel);

  const playBtn = document.getElementById("wolf-play-btn");
  const timeDisplay = document.getElementById("wolf-time-display");
  const speedSelect = document.getElementById("wolf-speed");

  // --- Animation state ---
  let playing = true;
  let speed = 1;
  let animTime = globalStart;
  let lastFrame = null;

  playBtn.addEventListener("click", () => {
    playing = !playing;
    playBtn.textContent = playing ? "\u23F8" : "\u25B6";
    if (playing) lastFrame = null; // reset delta on resume
  });

  speedSelect.addEventListener("change", () => {
    speed = Number(speedSelect.value);
  });

  function buildFrame(t) {
    const features = [];
    for (const pack of allPacks) {
      let pos;
      if (tracksByPack.has(pack)) {
        pos = interpolateTrack(tracksByPack.get(pack), t);
      } else if (latestPositions.has(pack)) {
        pos = latestPositions.get(pack);
      } else {
        continue;
      }
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: pos },
        properties: { pack },
      });
    }
    return { type: "FeatureCollection", features };
  }

  function animate(now) {
    if (playing && lastFrame !== null) {
      const delta = now - lastFrame;
      animTime += (delta / LOOP_DURATION_MS) * timeRange * speed;
      if (animTime > globalEnd) animTime = globalStart;
    }
    lastFrame = now;

    const fc = buildFrame(animTime);
    map.getSource("wolf-dots").setData(fc);
    map.getSource("wolf-labels").setData(fc);
    timeDisplay.textContent = formatDate(animTime);

    requestAnimationFrame(animate);
  }

  // Kick off
  requestAnimationFrame(animate);
}

init().catch(err => console.error("wolf-animation:", err));

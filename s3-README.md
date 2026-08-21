# CA Wolves — NRP S3 Bucket (`ca-wolves`)

Public data repository for California gray wolf monitoring, maintained by the Boettiger Lab (UC Berkeley).

**Bucket URL:** `https://s3-west.nrp-nautilus.io/ca-wolves/`

---

## Datasets

### `wolf_territories_feb2025.geojson`

Six California gray wolf pack territory polygons digitized from the official California Department of Fish and Wildlife (CDFW) [Wolf Territories map (February 2025)](https://wildlife.ca.gov/Conservation/Mammals/Gray-Wolf/Packs).

| Field | Description |
|-------|-------------|
| `pack` | Pack name (e.g. "Whaleback", "Harvey", "Ice Cave", "Lassen", "Diamond/Beyem Seyo", "Yowlumni") |
| `source` | Data source: "CDFW Feb 2025 official territory map" |
| `note` | Digitization method and caveats |
| `centroid_lon` | Approximate centroid longitude |
| `centroid_lat` | Approximate centroid latitude |

**Packs included:**
- Whaleback (~41.9°N, ~122.4°W) — Siskiyou County
- Harvey (~40.9°N, ~121.4°W) — Lassen/Shasta County border
- Ice Cave (~40.4°N, ~121.8°W) — Shasta/Lassen County
- Lassen (~40.3°N, ~121.1°W) — Lassen County
- Diamond / Beyem Seyo (~39.8°N, ~120.5°W) — Plumas County
- Yowlumni (~37.0°N, ~118.3°W) — Fresno/Tulare County (separate range in southern Sierra)

**Caveats:** Polygons are convex-hull approximations digitized via image georeferencing of the CDFW PDF map. Boundaries are approximate (±5–10 km); use for visualization only, not legal or management purposes. The Yowlumni territory polygon was georeferenced from a separate inset in the original map and anchored using GPS collar data centroids.

---

### `snapshots/wolf_bins_<TIMESTAMP>.geojson`

Time-series snapshots of CDFW-reported wolf positions, published via their [Wolf Tracker](https://storage.googleapis.com/cdfw-wolf-tracker/wolf_movement.html).

> **These are cells, not points.** CDFW does not publish GPS fixes. Collar locations are aggregated to
> **H3 resolution-6 hexagons — about 37 km², 6 km flat-to-flat and 7.7 km corner-to-corner** — sized to
> match average daily wolf movement. The cell is the finest location in this data; a centroid derived from
> it is a label for the hexagon, not a position within it. Positions arrive as a sequence of snapshots, so
> **no path between consecutive cells was observed** — do not read a line through cell centroids as a
> travelled route, a distance travelled, or a speed.

Snapshots are collected hourly by a Kubernetes CronJob. Only new data (detected by the `Last-Modified` HTTP header) is saved — the timestamp in the filename reflects the CDFW publication time, not the snapshot collection time. A wolf's cell is republished in every snapshot until it moves; when a collar stops reporting, its last known cell keeps being published.

| Field | Description |
|-------|-------------|
| `pack` | Individual collared wolf identifier (e.g. "CA091 (previously Yowlumni Disperser)", "CA150") — an individual, **not** a pack; renamed upstream from time to time |
| `pack_origin` | Pack the wolf is associated with (e.g. "Whaleback", "Harvey", "Beyem Seyo", "Grizzly") — the stable label for grouping |
| `most_recent_adj` | Most recent adjusted GPS fix date (MM/DD/YYYY) for this individual in this cell — compare against the snapshot time to tell a current cell from a non-reporting collar's last known cell |
| geometry | H3 resolution-6 hexagon polygon (~37 km²) |

**File naming:** `wolf_bins_YYYY-MM-DDTHH:MM:SS.geojson` (UTC timestamp from CDFW `Last-Modified` header)

**Coverage:** Snapshots begin 2025 (collection start date). Only some wolves in some packs are collared, and packs with higher livestock-conflict potential are prioritized for collaring — the collared set is a biased subset, not a sample, and neither wolves nor packs can be counted from it. From April through August, CDFW suppresses cells near den and rendezvous sites, so an absence of cells is not an absence of wolves.

**Source:** CDFW Wolf Program — https://wildlife.ca.gov/Conservation/Mammals/Gray-Wolf

---

### `wolf_bins_latest.geojson`

The most recent snapshot, at a fixed key so the map can always load current cells without listing the archive. Same fields and caveats as `snapshots/` above.

---

### `wolf_trail/hex/h0=*/data_0.parquet`

The queryable asset: the past 30 days of reported positions, polyfilled to H3 resolution 8 for joining against other H3-indexed datasets, hive-partitioned by `h0`. Rebuilt hourly, overwritten in place.

One row per **(wolf, cell, reporting window, h8)**. Because CDFW republishes a wolf's cell in every snapshot until it moves, consecutive republications of the same cell collapse into one row spanning `snapshot_ts` → `last_seen_ts`. A wolf missing from intervening snapshots breaks the window, so gaps in reporting survive into the data.

| Field | Description |
|-------|-------------|
| `_cng_fid` | Synthetic id — one per reported cell-window. Count `DISTINCT _cng_fid` for observations |
| `pack`, `pack_origin`, `most_recent_adj` | As in the snapshots above |
| `snapshot_ts` | UTC timestamp of the snapshot that **first** reported this wolf in this cell |
| `last_seen_ts` | UTC timestamp of the **last** consecutive snapshot still reporting it there |
| `h8` | H3 resolution-8 cell — one of several tiling CDFW's resolution-6 hexagon, for joining. **Not** a finer position, so `COUNT(*)` counts index cells rather than observations |
| `h0` | H3 resolution-0 partition key (enables dynamic partition pruning against globally-partitioned datasets) |

Current positions are `WHERE last_seen_ts = (SELECT MAX(last_seen_ts) FROM trail)` — keying off `MAX(snapshot_ts)` instead drops every wolf that hasn't changed cells lately.

---

### `wolf_tracks.geojson`

**Visualization only** — per-wolf LineStrings through the centroids of consecutively reported cells over the past 30 days, used by the map's playback layer. The line geometry is **not an observed path**: it connects cell centroids in reporting order, and nothing between two vertices was observed.

`timestamps` and `end_timestamps` are arrays parallel to the coordinates, giving the window each cell was reported over. That lets the map show each cell only while it was actually being reported, instead of sliding a dot along a path that never happened. For any analysis, use the trail parquet above.

---

## Access

All files are publicly readable. No authentication required.

```bash
# List all snapshots
aws s3 ls s3://ca-wolves/snapshots/ --endpoint-url https://s3-west.nrp-nautilus.io --no-sign-request

# Download territories GeoJSON
curl -O https://s3-west.nrp-nautilus.io/ca-wolves/wolf_territories_feb2025.geojson

# Download most recent snapshot (example)
aws s3 ls s3://ca-wolves/snapshots/ --endpoint-url https://s3-west.nrp-nautilus.io --no-sign-request \
  | sort | tail -1 | awk '{print $4}' \
  | xargs -I{} curl -O "https://s3-west.nrp-nautilus.io/ca-wolves/snapshots/{}"
```

**DuckDB:**
```sql
-- Query all snapshots
INSTALL httpfs; LOAD httpfs;
SELECT filename, pack, most_recent_adj
FROM read_json('https://s3-west.nrp-nautilus.io/ca-wolves/snapshots/*.geojson',
               filename=true, auto_detect=true);
```

---

## Related Resources

- **Interactive map:** https://ca-wolves.nrp-nautilus.io
- **CDFW Wolf Program:** https://wildlife.ca.gov/Conservation/Mammals/Gray-Wolf
- **CDFW Wolf Tracker:** https://storage.googleapis.com/cdfw-wolf-tracker/wolf_movement.html
- **Source code:** https://github.com/boettiger-lab/ca-wolves

---

## License & Attribution

Wolf collar data and territory maps are produced by the California Department of Fish and Wildlife and are in the public domain. Digitized GeoJSON polygons and snapshot archive are made available by the Boettiger Lab under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

Please cite the original CDFW data source in any publications or products.

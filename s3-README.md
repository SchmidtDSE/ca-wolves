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

**These are the six packs CDFW recognized in February 2025 — not the current list.** As of CDFW's July 2026 [Known Wolves](https://nrm.dfg.ca.gov/FileHandler.ashx?DocumentID=247119) list, Ashpan, Tunnison, Grizzly, Interstate, Whitehorse and Long Valley have also been recognized (several promoted from Areas of Wolf Activity), Diamond and Beyem Seyo are separate entries, and Beyem Seyo is a past pack. A pack's absence from this layer is not evidence it doesn't exist.

**Packs included (February 2025):**
- Whaleback (~41.9°N, ~122.4°W) — Siskiyou County
- Harvey (~40.9°N, ~121.4°W) — Lassen/Shasta County border
- Ice Cave (~40.4°N, ~121.8°W) — Shasta/Lassen County
- Lassen (~40.3°N, ~121.1°W) — Lassen County
- Diamond / Beyem Seyo (~39.8°N, ~120.5°W) — Plumas County
- Yowlumni (~37.0°N, ~118.3°W) — Fresno/Tulare County (separate range in southern Sierra)

**Caveats:** Polygons are our own convex-hull approximations, digitized via image georeferencing of the CDFW PDF map. They are accurate to roughly **5–10 miles (8–16 km)** — our georeferencing estimate, not a CDFW figure; CDFW describes its own map as showing "the approximate boundaries of known resident wolf territories". Use for visualization only, not legal or management purposes, and note that later editions of the CDFW map supersede this February 2025 snapshot. The Yowlumni territory polygon was georeferenced from a separate inset in the original map and anchored using GPS collar data centroids.

---

### `snapshots/wolf_bins_<TIMESTAMP>.geojson`

Time-series snapshots of CDFW-reported wolf positions, published via their [Wolf Tracker](https://storage.googleapis.com/cdfw-wolf-tracker/wolf_movement.html).

> **These are cells, not points.** CDFW does not publish GPS fixes. Each published cell is the hexagon on a
> fixed grid that *contains* one collar's most recent reported location. CDFW chose the cell size from wolves'
> average daily movement, intending it to be ["large enough to protect exact wolf
> locations"](https://nrm.dfg.ca.gov/FileHandler.ashx?DocumentID=232434&inline), and publishes no figure for
> it; measured from the published cells they are **H3 resolution 6 — about 37 km² (14 square miles), roughly
> 7 km (4 miles) flat-to-flat and 8 km (5 miles) corner to corner.** The cell is the finest location in this
> data, and it is one fix's neighbourhood rather than an aggregate of a day's movement; a centroid derived
> from it is a label for the hexagon, not a position within it. Positions arrive as a sequence of snapshots,
> so **no path between consecutive cells was observed** — do not read a line through cell centroids as a
> travelled route, a distance travelled, or a speed.

Snapshots are collected hourly by a Kubernetes CronJob. Only new data (detected by the `Last-Modified` HTTP header) is saved — the timestamp in the filename reflects the CDFW publication time, not the snapshot collection time. A wolf's cell is republished in every snapshot until it moves; when a collar stops reporting, its last known cell keeps being published.

| Field | Description |
|-------|-------------|
| `pack` | Individual collared wolf identifier and opaque display label (e.g. "CA091 (previously Yowlumni Disperser)", "CA150") — an individual, **not** a pack. CDFW switched to sequential `CA###` ids on **1 July 2026**; before that an id was a three-letter pack prefix + number + M/F (`WHA23F`, `LAS02M`). The two are not convertible by rule — CDFW publishes the crosswalk in [California's Known Wolves](https://nrm.dfg.ca.gov/FileHandler.ashx?DocumentID=247119) |
| `pack_origin` | The pack the wolf **came from** — its origin (birth) pack (e.g. "Whaleback", "Harvey", "Beyem Seyo", "Grizzly"). **Not** its current pack, its current location, or a link to the territory polygon of the same name: dispersers keep the origin pack of a range they have left, and Beyem Seyo is no longer an active pack |
| `most_recent_adj` | Most recent adjusted GPS fix date (MM/DD/YYYY) for this individual in this cell — compare against the snapshot time to tell a current cell from a non-reporting collar's last known cell |
| geometry | H3 resolution-6 hexagon polygon (~37 km²) |

**File naming:** `wolf_bins_YYYY-MM-DDTHH:MM:SS.geojson` (UTC timestamp from CDFW `Last-Modified` header)

**Coverage:** Snapshots begin 2025 (collection start date). Only some wolves in some packs are collared; CDFW aims for at least one collar per pack and prioritizes packs with higher known or potential livestock conflict — the collared set is a biased subset, not a sample, and neither wolves nor packs can be counted from it. Wolves in a pack move independently, so a collar's cell does not locate the other pack members. From roughly April through August, cells near den and rendezvous sites are not activated, so an absence of cells is not an absence of wolves. CDFW's own caution: *"wolf-livestock conflict can and will take place beyond the boundaries of active cells."*

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
- **CDFW Wolf Program** (packs, quarterly updates, annual reports): https://wildlife.ca.gov/Conservation/Mammals/Gray-Wolf
- **CDFW Wolf Location Map:** https://wildlife.ca.gov/Conservation/Mammals/Gray-Wolf/Location-Map
- **CDFW Wolf Tracker** (upstream source of these snapshots, and its limitations-on-use notice): https://storage.googleapis.com/cdfw-wolf-tracker/wolf_movement.html
- **Wolf Location Automated Mapping System: Additional Information and FAQ** — CDFW's authoritative account of what the cells are, how the cell size was chosen, the collar schedule, denning-season suppression, and non-reporting collars: https://nrm.dfg.ca.gov/FileHandler.ashx?DocumentID=232434&inline
- **Approximate Area of Gray Wolf Activity**, current edition: https://nrm.dfg.ca.gov/FileHandler.ashx?DocumentID=247113
- **California's Known Wolves – Past and Present** — current and past packs, Areas of Wolf Activity, individual wolf histories, and the old-id → `CA###` crosswalk: https://nrm.dfg.ca.gov/FileHandler.ashx?DocumentID=247119
- **Source code:** https://github.com/boettiger-lab/ca-wolves

---

## License & Attribution

Wolf collar data and territory maps are produced by the California Department of Fish and Wildlife and are in the public domain. Digitized GeoJSON polygons and snapshot archive are made available by the Boettiger Lab under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

Please cite the original CDFW data source in any publications or products.

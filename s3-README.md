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

Time-series snapshots of wolf collar GPS positions, aggregated to ~6 km H3 hexbins by CDFW and published via their [Wolf Tracker](https://storage.googleapis.com/cdfw-wolf-tracker/wolf_movement.html).

Snapshots are collected every 6 hours by a Kubernetes CronJob. Only new data (detected by the `Last-Modified` HTTP header) is saved — the timestamp in the filename reflects the CDFW publication time, not the snapshot collection time.

| Field | Description |
|-------|-------------|
| `pack` | Individual wolf identifier (e.g. "Whaleback 1", "Harvey 3", "Yowlumni Disperser") |
| `most_recent_adj` | Most recent adjusted GPS fix date for this individual in this hexbin |
| geometry | H3 hexagon polygon (~6 km resolution) |

**File naming:** `wolf_bins_YYYY-MM-DDTHH:MM:SS.geojson` (UTC timestamp from CDFW `Last-Modified` header)

**Coverage:** Snapshots begin 2025 (collection start date). Not all wolves are collared; uncollared individuals do not appear in this dataset.

**Source:** CDFW Wolf Program — https://wildlife.ca.gov/Conservation/Mammals/Gray-Wolf

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

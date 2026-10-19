# Home page world map

The "Global Community" map on the home page (`#bandMap` in `index.html`) is static SVG. Pins, labels and
shading are drawn in the browser from the centres data, so new centres show up without rebuilding anything.

You only need this folder to change the land shapes or the crop.

**Boundaries:** Natural Earth 1:10m admin-0 countries, **India point of view**
(`ne_10m_admin_0_countries_ind`). India is shown with full Jammu & Kashmir and Ladakh, as on official maps of India.
Do not swap in the default Natural Earth or world-atlas files: they cut off part of J&K.

## Rebuild

```sh
npm i d3-geo mapshaper
curl -LO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries_ind.geojson
# all countries, simplified with shared borders kept consistent
npx mapshaper ne_10m_admin_0_countries_ind.geojson -filter 'ADM0_A3 !== "ATA"' -filter-fields ADM0_A3,NAME \
  -simplify visvalingam weighted 1% keep-shapes -filter-islands min-area=300km2 remove-empty -filter-slivers \
  -o precision=0.01 format=geojson countries.geojson
# Andaman & Nicobar Islands (heavy simplification removes them, so they are added back separately)
npx mapshaper ne_10m_admin_0_countries_ind.geojson -filter 'NAME === "India"' -filter-islands min-area=600km2 \
  -explode -filter '$.area < 1e10' -simplify visvalingam 15% -o precision=0.01 india-islands.geojson
node build-map.mjs countries.geojson
```

This writes `wm-paths.html` (paste it inside `<g class="wm-land">`) and `wm-proj.json`. If the projection
numbers change, update `const WM` in `index.html` to match.

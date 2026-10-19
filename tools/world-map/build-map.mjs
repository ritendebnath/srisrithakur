// Builds the static world-map SVG for the home-page "Global Community" band.
// Source: Natural Earth 1:10m admin-0 countries, India point of view (full Jammu & Kashmir and Ladakh),
// simplified with mapshaper (see README.md). Equal Earth projection, cropped.
import fs from 'node:fs';
import { geoEqualEarth, geoPath } from 'd3-geo';

const SRC = process.argv[2] || 'countries.geojson';
const W = 1000;
const [LON0, LON1, LAT0, LAT1] = [-126, 150, -42, 72];

const gj = JSON.parse(fs.readFileSync(SRC, 'utf8'));
// Heavy simplification collapses the Andaman & Nicobar Islands, so they are simplified separately and added back.
const ISL = process.env.ISLANDS || 'india-islands.geojson';
if (fs.existsSync(ISL)) {
  const india = gj.features.find(f => f.properties.NAME === 'India');
  const polys = india.geometry.type === 'Polygon' ? [india.geometry.coordinates] : india.geometry.coordinates;
  for (const f of JSON.parse(fs.readFileSync(ISL, 'utf8')).features) polys.push(f.geometry.coordinates);
  india.geometry = { type: 'MultiPolygon', coordinates: polys };
}
// mapshaper writes RFC 7946 (counter-clockwise) rings; d3-geo wants clockwise exteriors. Rewind.
for (const f of gj.features) {
  const g = f.geometry; if (!g) continue;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const poly of polys) for (const ring of poly) ring.reverse();
}
const frame = { type: 'MultiPoint', coordinates: [] };
for (let t = 0; t <= 1; t += 0.01) {
  const lon = LON0 + (LON1 - LON0) * t, lat = LAT0 + (LAT1 - LAT0) * t;
  frame.coordinates.push([lon, LAT0], [lon, LAT1], [LON0, lat], [LON1, lat]);
}
const proj = geoEqualEarth().fitWidth(W, frame);
let path = geoPath(proj);
const [[x0, y0], [, y1]] = path.bounds(frame);
const H = Math.ceil(y1 - y0);
proj.translate([proj.translate()[0] - x0, proj.translate()[1] - y0]);
path = geoPath(proj);

const round = d => d.replace(/-?\d+\.\d+/g, m => String(Math.round(+m)));
// collapse consecutive duplicate points created by rounding
const dedupe = d => d.replace(/L(-?\d+),(-?\d+)(?=L\1,\2(?!\d))/g, '');

const feats = gj.features.filter(f => {
  const [[a, b], [c, e]] = path.bounds(f);
  return c > 0 && a < W && e > 0 && b < H;
});
// Drop tiny islands (projected area below MIN_AREA sq units) everywhere except India, so the
// Andaman & Nicobar Islands stay on India's outline.
const MIN_AREA = +(process.env.MIN_AREA || 6);
for (const f of feats) {
  const g = f.geometry;
  if (g.type !== 'MultiPolygon' || f.properties.NAME === 'India') continue;
  const keep = g.coordinates.filter(poly => path.area({ type: 'Polygon', coordinates: poly }) >= MIN_AREA);
  g.coordinates = keep.length ? keep : [g.coordinates.sort((a, b) => path.area({ type: 'Polygon', coordinates: b }) - path.area({ type: 'Polygon', coordinates: a }))[0]];
}
const paths = feats.map(f => {
  // India keeps one decimal so the Andaman & Nicobar Islands and the J&K outline stay crisp
  const d = f.properties.NAME === 'India' ? (path(f) || '').replace(/-?\d+\.\d+/g, m => (+m).toFixed(1)) : dedupe(round(path(f) || ''));
  return d && d.length > 12 ? `<path data-c="${f.properties.NAME.replace(/"/g, '&quot;')}" d="${d}"/>` : '';
}).filter(Boolean);

const [tx, ty] = proj.translate();
const out = { W, H, k: +proj.scale().toFixed(4), tx: +tx.toFixed(3), ty: +ty.toFixed(3) };
fs.writeFileSync('wm-paths.html', paths.join(''));
fs.writeFileSync('wm-proj.json', JSON.stringify(out));
console.log(out, 'paths', paths.length, 'bytes', paths.join('').length);
// sanity: projection of Deoghar
console.log('deoghar', proj([86.67678, 24.48069]).map(v => v.toFixed(2)), 'toronto', proj([-79.81, 43.69]).map(v => v.toFixed(2)));

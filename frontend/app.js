const IS_LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
const API = 'http://127.0.0.1:5006/api';
const STORAGE = 'civicpulse_v2_reports';
let reports = JSON.parse(localStorage.getItem(STORAGE) || '[]');
if (!reports.length) reports = [
  { id: 1, title: 'Pothole near junction', category: 'Pothole', severity: 8, lat: 28.4595, lng: 77.0266, votes: 5, created_at: new Date().toISOString() },
  { id: 2, title: 'Streetlight outage', category: 'Streetlight', severity: 6, lat: 28.4621, lng: 77.0310, votes: 2, created_at: new Date().toISOString() },
  { id: 3, title: 'Waste overflow', category: 'Waste', severity: 7, lat: 28.4559, lng: 77.0214, votes: 4, created_at: new Date().toISOString() },
];

const map = L.map('map').setView([28.4595, 77.0266], 13);
let dark = true;
let layer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);
const markers = L.layerGroup().addTo(map);

const form = document.getElementById('report-form');
const clustersNode = document.getElementById('clusters');
const zoneDetails = document.getElementById('zoneDetails');
const dupNotice = document.getElementById('dupNotice');
const geoBtn = document.getElementById('geoBtn');
const modeBtn = document.getElementById('modeBtn');
const pdfBtn = document.getElementById('pdfBtn');
const chat = document.getElementById('chat');
const chatInput = document.getElementById('chatInput');
const askBtn = document.getElementById('askBtn');

function save() { localStorage.setItem(STORAGE, JSON.stringify(reports)); }
function distance(a, b) { return Math.hypot(a.lat - b.lat, a.lng - b.lng); }

function clusterize() {
  const buckets = new Map();
  reports.forEach((r) => {
    const key = `${(Math.round(r.lat * 1000) / 1000).toFixed(3)},${(Math.round(r.lng * 1000) / 1000).toFixed(3)}`;
    if (!buckets.has(key)) buckets.set(key, { key, lat: r.lat, lng: r.lng, total: 0, avg: 0, votes: 0, categories: {}, rows: [] });
    const b = buckets.get(key);
    b.total += 1;
    b.avg += Number(r.severity);
    b.votes += Number(r.votes || 0);
    b.categories[r.category] = (b.categories[r.category] || 0) + 1;
    b.rows.push(r);
  });
  return [...buckets.values()].map((b) => {
    b.avg = Number((b.avg / b.total).toFixed(2));
    b.confidence = Number(Math.min(99, 38 + b.total * 11 + b.votes * 1.5 + b.avg * 3).toFixed(1));
    b.alert = b.avg > 8 && b.confidence > 90 && b.total > 2;
    return b;
  }).sort((a, b) => b.confidence - a.confidence);
}

function colorOf(c) {
  if (c > 90) return '#ff5e53';
  if (c > 70) return '#62a5ff';
  return '#49f4d0';
}

function drawMap(clusters) {
  markers.clearLayers();
  clusters.forEach((c) => {
    const col = colorOf(c.confidence);
    const radius = Math.min(36, 10 + c.total * 4);
    const marker = L.circleMarker([c.lat, c.lng], {
      radius,
      color: col,
      weight: 2,
      fillColor: col,
      fillOpacity: 0.22,
    }).addTo(markers);
    marker.bindTooltip(`Zone ${c.key} | Conf ${c.confidence}%`);
    marker.on('click', () => showZone(c));
  });
}

function showZone(c) {
  const top = Object.entries(c.categories).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Mixed';
  zoneDetails.innerHTML = `
    <strong>Zone ${c.key}</strong><br/>
    Reports: ${c.total} | Avg Severity: ${c.avg}<br/>
    Confidence: ${c.confidence}% | Top Category: ${top}<br/>
    AI Summary: ${c.alert ? 'Critical escalation likely. Immediate authority action recommended.' : 'Moderate trend. Monitor and prioritize by density.'}
  `;
}

function renderFeed(clusters) {
  clustersNode.innerHTML = clusters.map((c) => {
    const top = Object.entries(c.categories).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Mixed';
    return `<article class="cluster" style="border-color:${colorOf(c.confidence)}55">
      <small>Zone ${c.key}</small><br/>
      <strong>${c.alert ? 'CRITICAL ALERT' : `Confidence ${c.confidence}%`}</strong>
      <p>Reports ${c.total} | Severity ${c.avg}</p>
      <p>Top: ${top}</p>
      <div class="bar"><i style="width:${Math.min(100, c.confidence)}%"></i></div>
      <button data-zone="${c.key}" class="btn ghost upvote">Upvote Zone</button>
    </article>`;
  }).join('');

  document.querySelectorAll('.upvote').forEach((b) => {
    b.addEventListener('click', () => {
      const key = b.dataset.zone;
      reports.forEach((r) => {
        const k = `${(Math.round(r.lat * 1000) / 1000).toFixed(3)},${(Math.round(r.lng * 1000) / 1000).toFixed(3)}`;
        if (k === key) r.votes = (r.votes || 0) + 1;
      });
      save();
      refresh();
    });
  });
}

let growthChart, categoryChart;
function renderAnalytics(clusters) {
  const daily = {};
  reports.forEach((r) => {
    const d = new Date(r.created_at).toLocaleDateString();
    daily[d] = (daily[d] || 0) + 1;
  });
  const cat = {};
  reports.forEach((r) => { cat[r.category] = (cat[r.category] || 0) + 1; });

  const gCtx = document.getElementById('growthChart');
  const cCtx = document.getElementById('categoryChart');

  if (growthChart) growthChart.destroy();
  if (categoryChart) categoryChart.destroy();

  growthChart = new Chart(gCtx, {
    type: 'line',
    data: { labels: Object.keys(daily), datasets: [{ label: 'Issue Growth', data: Object.values(daily), borderColor: '#62a5ff', tension: .35 }] },
    options: { plugins: { legend: { labels: { color: '#d4e6f7' } } } }
  });

  categoryChart = new Chart(cCtx, {
    type: 'bar',
    data: { labels: Object.keys(cat), datasets: [{ label: 'Category Distribution', data: Object.values(cat), backgroundColor: ['#49f4d0', '#62a5ff', '#ff845e', '#ffd36d'] }] },
    options: { plugins: { legend: { labels: { color: '#d4e6f7' } } } }
  });

  const avgConf = clusters.length ? (clusters.reduce((a, b) => a + b.confidence, 0) / clusters.length).toFixed(1) : '0';
  const critical = clusters.filter((c) => c.alert).length;
  document.getElementById('kpi').innerHTML = `
    <article><strong>Civic Stability Score</strong><br/>${Math.max(0, 100 - (reports.length * 1.3)).toFixed(1)}</article>
    <article><strong>Avg Zone Confidence</strong><br/>${avgConf}%</article>
    <article><strong>Critical Alerts</strong><br/>${critical}</article>
    <article><strong>7-Day Forecast</strong><br/>${(reports.length * 1.18).toFixed(0)} projected issues</article>
  `;
}

function refresh() {
  const clusters = clusterize();
  drawMap(clusters);
  renderFeed(clusters);
  renderAnalytics(clusters);
  if (clusters[0]) showZone(clusters[0]);
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const obj = {
    id: Date.now(),
    title: document.getElementById('title').value,
    category: document.getElementById('category').value,
    severity: Number(document.getElementById('severity').value),
    lat: Number(document.getElementById('lat').value),
    lng: Number(document.getElementById('lng').value),
    votes: 0,
    created_at: new Date().toISOString(),
  };
  const dup = reports.find((r) => distance(r, obj) < 0.0012 && r.category === obj.category);
  dupNotice.textContent = dup ? 'Similar issue found nearby. Added as signal to existing cluster.' : '';
  reports.unshift(obj);
  save();
  refresh();
  form.reset();
  document.getElementById('severity').value = 6;
  document.getElementById('lat').value = 28.4595;
  document.getElementById('lng').value = 77.0266;
});

geoBtn.addEventListener('click', () => {
  navigator.geolocation?.getCurrentPosition((p) => {
    document.getElementById('lat').value = p.coords.latitude.toFixed(4);
    document.getElementById('lng').value = p.coords.longitude.toFixed(4);
    map.setView([p.coords.latitude, p.coords.longitude], 14);
  });
});

modeBtn.addEventListener('click', () => {
  dark = !dark;
  map.removeLayer(layer);
  layer = L.tileLayer(dark ? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' : 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', { attribution: '&copy; OSM' }).addTo(map);
  document.body.classList.toggle('day', !dark);
  modeBtn.textContent = dark ? 'Night Map' : 'Day Map';
});

pdfBtn.addEventListener('click', () => {
  const clusters = clusterize();
  const txt = clusters.map((c) => `Zone ${c.key} | Conf ${c.confidence}% | Reports ${c.total} | Sev ${c.avg}`).join('\n');
  const blob = new Blob([`CivicPulse Zone Report\n\n${txt}`], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'civicpulse_zone_report.txt';
  a.click();
});

askBtn.addEventListener('click', () => {
  const q = chatInput.value.trim();
  if (!q) return;
  chat.insertAdjacentHTML('beforeend', `<p>You: ${q}</p>`);
  const clusters = clusterize();
  const top = clusters[0];
  let ans = 'Current zones are stable.';
  if (/pothole|road/i.test(q)) ans = `Highest pothole pressure is near zone ${top?.key || 'N/A'} with confidence ${top?.confidence || 0}%.`;
  if (/increasing|trend/i.test(q)) ans = `Issue trend indicates ~${(reports.length * 1.18).toFixed(0)} incidents projection for next period.`;
  chat.insertAdjacentHTML('beforeend', `<p><strong>Assistant:</strong> ${ans}</p>`);
  chatInput.value = '';
  chat.scrollTop = chat.scrollHeight;
});

(function tilt(){
  document.querySelectorAll('[data-tilt]').forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5;
      const y = (e.clientY - r.top) / r.height - .5;
      card.style.transform = `rotateY(${x * 6}deg) rotateX(${y * -6}deg)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = 'rotateY(0) rotateX(0)'; });
  });
})();

refresh();

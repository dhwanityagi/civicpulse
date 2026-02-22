const API = "http://127.0.0.1:5006/api";
const form = document.getElementById("report-form");
const map = document.getElementById("map");
const clustersHost = document.getElementById("clusters");

async function jf(url, options = {}) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function applyTilt() {
  document.querySelectorAll("[data-tilt]").forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `rotateY(${x * 8}deg) rotateX(${y * -8}deg)`;
    });
    card.addEventListener("mouseleave", () => { card.style.transform = "rotateY(0) rotateX(0)"; });
  });
}

function mapPoint(lat, lng) {
  const x = ((lng - 76.8) / 0.5) * 560 + 20;
  const y = 280 - ((lat - 28.2) / 0.5) * 260;
  return { x, y };
}

function drawGrid() {
  map.innerHTML = "";
  for (let i = 0; i <= 12; i++) {
    const x = 20 + i * 46;
    const y = 20 + i * 21;
    map.insertAdjacentHTML("beforeend", `<line x1='${x}' y1='20' x2='${x}' y2='280' stroke='rgba(255,255,255,.10)'/>`);
    map.insertAdjacentHTML("beforeend", `<line x1='20' y1='${y}' x2='580' y2='${y}' stroke='rgba(255,255,255,.08)'/>`);
  }
}

function pulseCircle(x, y, radius, color) {
  return `
    <circle cx='${x}' cy='${y}' r='${radius}' fill='${color}' fill-opacity='0.20' stroke='${color}' stroke-width='1.5'>
      <animate attributeName='r' values='${radius * 0.82};${radius};${radius * 0.82}' dur='2.4s' repeatCount='indefinite'/>
      <animate attributeName='fill-opacity' values='0.26;0.12;0.26' dur='2.4s' repeatCount='indefinite'/>
    </circle>
  `;
}

function clusterCard(c) {
  const topCategory = Object.entries(c.categories).sort((a, b) => b[1] - a[1])[0]?.[0] || "Mixed";
  return `<article class='cluster'>
    <small>Zone ${c.key}</small><br/>
    <strong>Confidence ${c.confidence}%</strong>
    <p>Reports: ${c.total} | Avg Severity: ${c.avg_severity}</p>
    <p>Top Category: ${topCategory}</p>
    <div class='bar'><i style='width:${Math.min(100, c.confidence)}%'></i></div>
  </article>`;
}

async function refresh() {
  const clusters = await jf(`${API}/clusters`);
  drawGrid();

  clusters.forEach((c) => {
    const { x, y } = mapPoint(c.lat, c.lng);
    const radius = Math.min(42, 8 + c.total * 3);
    const color = c.confidence > 80 ? "#ff845e" : c.confidence > 65 ? "#62a5ff" : "#49f4d0";

    map.insertAdjacentHTML("beforeend", pulseCircle(x, y, radius, color));
    map.insertAdjacentHTML("beforeend", `<text x='${x - 10}' y='${y + 4}' fill='white' font-size='10'>${c.total}</text>`);
  });

  clustersHost.innerHTML = clusters.map(clusterCard).join("") || "<small>No reports yet.</small>";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    title: document.getElementById("title").value,
    category: document.getElementById("category").value,
    severity: Number(document.getElementById("severity").value),
    lat: Number(document.getElementById("lat").value),
    lng: Number(document.getElementById("lng").value),
  };
  await jf(`${API}/reports`, { method: "POST", body: JSON.stringify(payload) });
  form.reset();
  document.getElementById("severity").value = 6;
  document.getElementById("lat").value = 28.459;
  document.getElementById("lng").value = 77.026;
  await refresh();
});

applyTilt();
(async function init() {
  await refresh();
})();

import express from "express";
import cors from "cors";
import sqlite3 from "sqlite3";

const app = express();
const PORT = 5006;
const db = new sqlite3.Database("civicpulse.db");

app.use(cors());
app.use(express.json());

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      severity INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
});

function clusterKey(lat, lng) {
  const a = Math.round(lat * 10) / 10;
  const b = Math.round(lng * 10) / 10;
  return `${a.toFixed(1)},${b.toFixed(1)}`;
}

app.get("/api/health", (_, res) => {
  res.json({ ok: true, service: "civicpulse" });
});

app.post("/api/reports", (req, res) => {
  const { title, category, lat, lng, severity } = req.body;
  if (!title || !category) return res.status(400).json({ error: "title and category required" });

  const created_at = new Date().toISOString();
  db.run(
    "INSERT INTO reports(title, category, lat, lng, severity, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [title, category, Number(lat), Number(lng), Number(severity), created_at],
    function onInsert(err) {
      if (err) return res.status(500).json({ error: err.message });
      return res.status(201).json({ id: this.lastID });
    }
  );
});

app.get("/api/reports", (_, res) => {
  db.all("SELECT * FROM reports ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get("/api/clusters", (_, res) => {
  db.all("SELECT * FROM reports", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const map = new Map();
    rows.forEach((r) => {
      const key = clusterKey(r.lat, r.lng);
      if (!map.has(key)) {
        map.set(key, {
          key,
          total: 0,
          avg_severity: 0,
          categories: {},
          lat: Number(r.lat),
          lng: Number(r.lng),
        });
      }

      const bucket = map.get(key);
      bucket.total += 1;
      bucket.avg_severity += Number(r.severity);
      bucket.categories[r.category] = (bucket.categories[r.category] || 0) + 1;
    });

    const clusters = [...map.values()].map((c) => ({
      ...c,
      avg_severity: Number((c.avg_severity / c.total).toFixed(2)),
      confidence: Number(Math.min(99, 45 + c.total * 9 + c.avg_severity * 3).toFixed(1)),
    }));

    clusters.sort((a, b) => b.confidence - a.confidence);
    res.json(clusters);
  });
});

app.listen(PORT, () => {
  console.log(`CivicPulse API on http://127.0.0.1:${PORT}`);
});

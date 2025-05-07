import express, { Request, Response } from "express";
import sqlite3 from "sqlite3";
import path from "path";

const app = express();
const PORT = 3000;

app.use(express.json());

const db = new sqlite3.Database(
  path.join(__dirname, `system_data.db`),
  (err) => {
    if (err) console.error("Error opening database:", err.message);
    else {
      // Tabla para lecturas del Beacon
      db.run(`
        CREATE TABLE IF NOT EXISTS beacon_data (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          beacon_id INTEGER NOT NULL,
          mobile_id INTEGER NOT NULL,
          metric TEXT NOT NULL,
          value INTEGER NOT NULL,
          timestamp INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // Tabla para lecturas del Nodo Móvil
      db.run(`
        CREATE TABLE IF NOT EXISTS mobile_data (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          mobile_id INTEGER NOT NULL,
          temperature INTEGER NOT NULL,
          timestamp INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);
    }
  }
);

// ✅ Ruta para recibir datos del Beacon
app.post("/beacon", (req: any, res: any) => {
  const { beacon_id, mobile_id, metric, value } = req.body;
  if (!beacon_id || !mobile_id || !metric || value === undefined) {
    return res.status(400).json({ error: "Datos incompletos del beacon" });
  }

  db.run(
    `INSERT INTO beacon_data (beacon_id, mobile_id, metric, value) VALUES (?, ?, ?, ?)`,
    [beacon_id, mobile_id, metric, value],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      console.log(
        `[LOG] Beacon ${beacon_id} -> Móvil ${mobile_id}: ${metric}=${value}`
      );
      res.status(201).json({ id: this.lastID });
    }
  );
});

// ✅ Ruta para recibir datos del Nodo Móvil
app.post("/mobile", (req: any, res: any) => {
  const { mobile_id, temperature } = req.body;
  if (!mobile_id || temperature === undefined) {
    return res.status(400).json({ error: "Datos incompletos del nodo móvil" });
  }

  db.run(
    `INSERT INTO mobile_data (mobile_id, temperature) VALUES (?, ?)`,
    [mobile_id, temperature],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      console.log(`[LOG] Móvil ${mobile_id}: temperatura=${temperature}`);
      res.status(201).json({ id: this.lastID });
    }
  );
});

// ✅ Consultas básicas para debug
app.get("/beacon", (_req: Request, res: Response) => {
  db.all(
    `SELECT * FROM beacon_data ORDER BY timestamp DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.get("/mobile", (_req: Request, res: Response) => {
  db.all(
    `SELECT * FROM mobile_data ORDER BY timestamp DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.get("/", (_req, res) => {
  res.send("Servidor Central del Sistema Distribuido - Entregable 1");
});

app.listen(PORT, () => {
  console.log(`✅ Servidor escuchando en http://localhost:${PORT}`);
});

import express, { Request, Response } from "express";
import sqlite3 from "sqlite3";
import path from "path";
import { create, all } from "mathjs";
const math = create(all);

const app = express();
const PORT = 3000;
app.use(express.json());

const db = new sqlite3.Database(
  path.join(__dirname, `system_data.db`),
  (err) => {
    if (err) console.error("Error opening database:", err.message);
    else {
      db.run(`CREATE TABLE IF NOT EXISTS beacon_data (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          beacon_id INTEGER NOT NULL,
          mobile_id INTEGER NOT NULL,
          metric TEXT NOT NULL,
          value INTEGER NOT NULL,
          logical_ts INTEGER NOT NULL,
          timestamp INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS mobile_data (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          mobile_id INTEGER NOT NULL,
          temperature INTEGER NOT NULL,
          logical_ts INTEGER NOT NULL,
          timestamp INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);
    }
  }
);

// ✉️ Ruta para Beacon con timestamp lógico
app.post("/beacon", (req: any, res: any) => {
  const { beacon_id, mobile_id, metric, value, logical_ts } = req.body;
  if (
    !beacon_id ||
    !mobile_id ||
    !metric ||
    value === undefined ||
    logical_ts === undefined
  ) {
    return res.status(400).json({ error: "Datos incompletos del beacon" });
  }

  db.run(
    `INSERT INTO beacon_data (beacon_id, mobile_id, metric, value, logical_ts) VALUES (?, ?, ?, ?, ?)`,
    [beacon_id, mobile_id, metric, value, logical_ts],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      console.log(
        `[LOG] Beacon ${beacon_id} -> Móvil ${mobile_id}: ${metric}=${value}, LTS=${logical_ts}`
      );
      res.status(201).json({ id: this.lastID });
    }
  );
});

// 🌡️ Ruta para Nodo Móvil con timestamp lógico
app.post("/mobile", (req: any, res: any) => {
  const { mobile_id, temperature, logical_ts } = req.body;
  if (!mobile_id || temperature === undefined || logical_ts === undefined) {
    return res.status(400).json({ error: "Datos incompletos del nodo móvil" });
  }

  db.run(
    `INSERT INTO mobile_data (mobile_id, temperature logical_ts) VALUES (?, ?, ?)`,
    [mobile_id, temperature, logical_ts],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      console.log(
        `[LOG] Móvil ${mobile_id}: temperatura=${temperature}, LTS=${logical_ts}`
      );
      res.status(201).json({ id: this.lastID });
    }
  );
});

// 🔍 Ruta para estimar zona y última temperatura usando sincronización lógica
app.get("/proximity/:mobile_id", (req: Request, res: Response) => {
  const mobile_id = parseInt(req.params.mobile_id);
  db.get(
    `SELECT temperature, logical_ts FROM mobile_data WHERE mobile_id = ? ORDER BY logical_ts DESC LIMIT 1`,
    [mobile_id],
    (err, mobileRow: any) => {
      if (err || !mobileRow)
        return res.status(500).json({ error: "Nodo móvil no encontrado" });

      const lts = mobileRow.logical_ts;
      db.all(
        `SELECT * FROM beacon_data WHERE mobile_id = ? AND logical_ts = ?`,
        [mobile_id, lts],
        (err2, beacons) => {
          if (err2) return res.status(500).json({ error: err2.message });

          // Simple estimación: promedio de RSSI
          const rssiVals = beacons.map((b: any) => b.value);
          const avgRSSI =
            rssiVals.length > 0
              ? rssiVals.reduce((a, b) => a + b) / rssiVals.length
              : null;

          res.json({
            mobile_id,
            logical_ts: lts,
            temperature: mobileRow.temperature,
            estimated_zone_strength: avgRSSI,
            beacon_count: beacons.length,
          });
        }
      );
    }
  );
});

app.get("/location", async (_req: Request, res: Response) => {
  const lastMobile = await new Promise<any>((resolve, reject) => {
    db.get(
      "SELECT * FROM data ORDER BY timestamp DESC LIMIT 1",
      [],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });

  const { device_id, logical_ts, temperature } = lastMobile;

  db.all(
    `SELECT * FROM beacon_data WHERE mobile_id = ? AND logical_ts = ?`,
    [device_id, logical_ts],
    (err, beacons) => {
      if (err) return res.status(500).json({ error: err.message });

      const positions: any[] = [];

      for (const beacon of beacons) {
        const pos = BEACON_POSITIONS[beacon.beacon_id];
        if (!pos) continue;
        const d = rssiToDistance(beacon.value);
        positions.push({ coords: [pos.x, pos.y], d });
      }

      if (positions.length < 3) {
        return res
          .status(400)
          .json({ error: "Not enough beacons for estimation" });
      }

      // Cálculo de posición con media ponderada
      const weightedSum = positions.reduce(
        (acc, p) => {
          const w = 1 / p.d;
          acc.coords = math.add(acc.coords, math.multiply(p.coords, w));
          acc.totalWeight += w;
          return acc;
        },
        { coords: [0, 0], totalWeight: 0 }
      );

      const estimatedPos: any = math.divide(
        weightedSum.coords,
        weightedSum.totalWeight
      );

      res.json({
        x: estimatedPos[0].toFixed(2),
        y: estimatedPos[1].toFixed(2),
        temperature,
        // color: temperatureToColor(temperature),
      });
    }
  );
});

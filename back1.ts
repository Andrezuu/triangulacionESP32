import express, { Request, Response } from "express";
import trilateration from "trilateration";
import sqlite3 from "sqlite3";
import path from "path";

const app = express();
const PORT = 5000;

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
          ID_Beacon TEXT,
          ID_Movil TEXT,
          Metrica TEXT NOT NULL,
          RSSI INTEGER NOT NULL,
          RTT INTEGER NOT NULL,
          Timestamp_Logico INTEGER NOT NULL,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // Tabla para lecturas del Nodo Móvil
      db.run(`
        CREATE TABLE IF NOT EXISTS mobile_data (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ID_Movil TEXT,
          Temperatura INTEGER NOT NULL,
          Timestamp_Logico INTEGER NOT NULL,
          timestamp INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);
    }
  }
);

// ✅ Ruta para recibir datos del Beacon
app.post("/api/beacon-data", (req: any, res: any) => {
  const { ID_Beacon, ID_Movil, Metrica, RSSI, RTT, Timestamp_Logico } =
    req.body;
  if (!ID_Beacon || !ID_Movil || !Metrica || !RSSI || !RTT === undefined) {
    return res.status(400).json({ error: "Datos incompletos del beacon" });
  }

  db.run(
    `INSERT INTO beacon_data (ID_Beacon, ID_Movil, Metrica, RSSI, RTT, Timestamp_Logico) VALUES (?, ?, ?, ?, ?, ?)`,
    [ID_Beacon, ID_Movil, Metrica, RSSI, RTT, Timestamp_Logico],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      console.log(
        `[LOG] Beacon ${ID_Beacon} -> Móvil ${ID_Movil}: Metrica: ${Metrica}=${RSSI}, ${RTT}, Timestamp_Logico=${Timestamp_Logico}`
      );
      res
        .status(201)
        .json({ id: this.lastID, message: "Beacon data received" });
    }
  );
});

// ✅ Ruta para recibir datos del Nodo Móvil
app.post("/api/nodo-movil", (req: any, res: any) => {
  const { ID_Movil, Temperatura, Timestamp_Logico } = req.body;
  if (!ID_Movil || !Temperatura || !Timestamp_Logico === undefined) {
    return res.status(400).json({ error: "Datos incompletos del nodo móvil" });
  }

  db.run(
    `INSERT INTO mobile_data (ID_Movil, Temperatura, Timestamp_Logico) VALUES (?, ?, ?)`,
    [ID_Movil, Temperatura, Timestamp_Logico],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      console.log(
        `[LOG] Móvil ${ID_Movil}: temperatura=${Temperatura} Timestamp_Logico=${Timestamp_Logico}`
      );
      res
        .status(201)
        .json({ id: this.lastID, message: "Mobile data received" });
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

// ✅ Ruta para estimar proximidad
app.get("/api/proximidad", (_req: Request, res: Response) => {
  trilateration.addBeacon(0, trilateration.vector(0, 0)); // Posición del Beacon 1 (X: 0, Y: 0)
  trilateration.addBeacon(1, trilateration.vector(5, 0)); // Posición del Beacon 2 (X: 5, Y: 0)
  trilateration.addBeacon(2, trilateration.vector(2.5, 4)); // Posición del Beacon 3 (X: 2.5, Y: 4)

  db.all(
    `SELECT ID_Beacon, ID_Movil, RSSI, RTT, Timestamp_Logico 
     FROM beacon_data 
     ORDER BY created_at DESC
     LIMIT 5`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      if (rows.length === 0) {
        return res
          .status(404)
          .json({ error: "No hay datos recientes para estimar proximidad" });
      }

      // Calcular proximidad basada en RSSI y RTT
      const proximidad = rows.map((row: any) => {
        let distancia = Math.pow(10, (-row.RSSI - 40) / 20);
        distancia += row.RTT / 100;
        trilateration.setDistance(0, distancia);
        trilateration.setDistance(1, distancia);
        trilateration.setDistance(2, distancia);
        const pos = trilateration.calculatePosition();

        return {
          ID_Beacon: row.ID_Beacon,
          ID_Movil: row.ID_Movil,
          distancia: distancia.toFixed(2), // Distancia estimada en metros
          Timestamp_Logico: row.Timestamp_Logico,
          x: pos.x,
          y: pos.y,
        };
      });

      res.json({ proximidad });
    }
  );
});

app.get("/", (_req, res) => {
  res.send("Servidor Central del Sistema Distribuido - Entregable 1");
});

app.listen(PORT, () => {
  console.log(`✅ Servidor escuchando en http://localhost:${PORT}`);
});

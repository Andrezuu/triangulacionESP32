import express, { Request, Response } from "express";
import trilateration = require("trilateration");
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

app.post("/api/beacon-data", (req: any, res: any) => {
  const { ID_Beacon, ID_Movil, Metrica, RSSI, RTT, Timestamp_Logico } = req.body;
  if (!ID_Beacon || !ID_Movil || !Metrica || RSSI === undefined || RTT === undefined) {
    return res.status(400).json({ error: "Datos incompletos del beacon" });
  }

  db.run(
    `INSERT INTO beacon_data (ID_Beacon, ID_Movil, Metrica, RSSI, RTT, Timestamp_Logico) VALUES (?, ?, ?, ?, ?, ?)`,
    [ID_Beacon, ID_Movil, Metrica, RSSI, RTT, Timestamp_Logico],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      console.log(`[LOG] Beacon ${ID_Beacon} -> Móvil ${ID_Movil}: RSSI=${RSSI}, RTT=${RTT}, Timestamp_Logico=${Timestamp_Logico}`);
      res.status(201).json({ id: this.lastID, message: "Beacon data received" });
    }
  );
});

app.post("/api/nodo-movil", (req: any, res: any) => {
  const { ID_Movil, Temperatura, Timestamp_Logico } = req.body;
  if (!ID_Movil || Temperatura === undefined || Timestamp_Logico === undefined) {
    return res.status(400).json({ error: "Datos incompletos del nodo móvil" });
  }

  db.run(
    `INSERT INTO mobile_data (ID_Movil, Temperatura, Timestamp_Logico) VALUES (?, ?, ?)`,
    [ID_Movil, Temperatura, Timestamp_Logico],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      console.log(`[LOG] Móvil ${ID_Movil}: temperatura=${Temperatura} Timestamp_Logico=${Timestamp_Logico}`);
      res.status(201).json({ id: this.lastID, message: "Mobile data received" });
    }
  );
});

app.get("/beacon", (_req: Request, res: Response) => {
  db.all(`SELECT * FROM beacon_data ORDER BY timestamp DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get("/mobile", (_req: Request, res: Response) => {
  db.all(`SELECT * FROM mobile_data ORDER BY timestamp DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

type BeaconRow = {
  ID_Beacon: string;
  RSSI: number;
  RTT: number;
  Timestamp_Logico: number;
};

app.get("/api/proximidad", (_req: Request, res: Response) => {
  type BeaconRow = {
    ID_Beacon: string;
    RSSI: number;
    RTT: number;
    Timestamp_Logico: number;
  };

  db.all(
    `SELECT ID_Beacon, RSSI, RTT, Timestamp_Logico 
     FROM beacon_data 
     WHERE ID_Beacon IN ('BEACON_01', 'BEACON_02', 'BEACON_03') 
     ORDER BY Timestamp_Logico DESC`,
    [],
    (err, rawRows) => {
      if (err) return res.status(500).json({ error: err.message });

      const rows = rawRows as BeaconRow[];
      const lastReadings: Record<string, BeaconRow> = {};

      for (const row of rows) {
        if (!lastReadings[row.ID_Beacon]) {
          lastReadings[row.ID_Beacon] = row;
        }
      }

      if (
        !lastReadings["BEACON_01"] ||
        !lastReadings["BEACON_02"] ||
        !lastReadings["BEACON_03"]
      ) {
        return res.status(400).json({ error: "Faltan datos de uno o más beacons" });
      }

      const distances: Record<string, number> = {};
      for (const id of ["BEACON_01", "BEACON_02", "BEACON_03"]) {
        const rssi = lastReadings[id].RSSI;
        const rtt = lastReadings[id].RTT;
        distances[id] = Math.pow(10, (-rssi - 40) / 20) + (rtt > 0 ? rtt / 100 : 0);
      }

      const puntos = [
        { x: 0,    y: 0,    distance: distances["BEACON_01"] },
        { x: 5,    y: 0,    distance: distances["BEACON_02"] },
        { x: 2.5,  y: 4,    distance: distances["BEACON_03"] }
      ];

      let pos: { x: number; y: number } | null = null;
      try {
        pos = trilateration(puntos);
        console.log("✅ Posición estimada:", pos);
      } catch (e) {
        console.warn("⚠️ Error al calcular trilateración:", (e as Error).message);
      }

      const proximidad = Object.entries(lastReadings).map(([ID_Beacon, row]) => ({
        ID_Beacon,
        ID_Movil: "NODO-MOVIL",
        distancia: distances[ID_Beacon].toFixed(2),
        Timestamp_Logico: row.Timestamp_Logico,
        x: pos?.x ?? null,
        y: pos?.y ?? null,
      }));

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
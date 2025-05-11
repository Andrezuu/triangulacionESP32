import express, { Request, Response } from "express";
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

interface BeaconRow {
  ID_Beacon: "BEACON_01" | "BEACON_02" | "BEACON_03";
  ID_Movil: string;
  RSSI: number;
  RTT: number;
  Timestamp_Logico: number;
  created_at: number;
}

interface MobileRow {
  ID_Movil: string;
  Temperatura: number;
  Timestamp_Logico: number;
}


// ✅ Ruta para estimar proximidad y realizar triangulación
// ✅ Ruta principal de visualización
app.get("/api/proximidad", (_req: Request, res: Response) => {
  const beaconPositions: Record<BeaconRow["ID_Beacon"], { x: number; y: number }> = {
    BEACON_01: { x: 0, y: 0 },
    BEACON_02: { x: 12.60, y: -7.45 },
    BEACON_03: { x: -5.76, y: -17.97 }
  };

  db.all(
    `SELECT * FROM beacon_data 
     WHERE ID_Beacon IN ('BEACON_01', 'BEACON_02', 'BEACON_03') 
     ORDER BY created_at DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      const rowsTyped = rows as BeaconRow[];
      const lastReadings: Record<string, BeaconRow> = {};

      for (const row of rowsTyped) {
        if (!lastReadings[row.ID_Beacon] && beaconPositions[row.ID_Beacon]) {
          lastReadings[row.ID_Beacon] = row;
        }
        if (Object.keys(lastReadings).length === 3) break;
      }

      const beacons = Object.keys(beaconPositions) as (keyof typeof beaconPositions)[];
      const missing = beacons.filter((b) => !lastReadings[b]);
      if (missing.length > 0) {
        return res.status(400).json({ error: `Faltan datos de: ${missing.join(", ")}` });
      }

      const points: Point[] = beacons.map((id) => {
        const rssi = lastReadings[id].RSSI;
        const rtt = lastReadings[id].RTT;
        const distancia = Math.pow(10, (-rssi - 40) / 20) + (rtt > 0 ? rtt / 100 : 0);
        return {
          x: beaconPositions[id].x,
          y: beaconPositions[id].y,
          distance: distancia
        };
      });

      const pos = trilaterate(points[0], points[1], points[2]);
      const angle = pos ? Math.atan2(pos.y, pos.x) * (180 / Math.PI) : null;

      const ID_Movil = lastReadings[beacons[0]].ID_Movil;
      const Timestamp_Logico = Math.max(...beacons.map((id) => lastReadings[id].Timestamp_Logico));

      db.get(
        `SELECT Temperatura FROM mobile_data 
         WHERE ID_Movil = ? 
         ORDER BY timestamp DESC 
         LIMIT 1`,
        [ID_Movil],
        (err2, tempRow: MobileRow | undefined) => {
          if (err2) return res.status(500).json({ error: err2.message });

          const Temperatura = tempRow?.Temperatura ?? null;

          // 🔁 Conversión a coordenadas geográficas
          const METERS_TO_LAT = 0.000009;
          const METERS_TO_LNG = 0.000011;
          const baseLat = -16.5019;
          const baseLng = -68.13293;

          const lat = baseLat + (pos?.y ?? 0) * METERS_TO_LAT;
          const lng = baseLng + (pos?.x ?? 0) * METERS_TO_LNG;

          const response = {
            ID_Movil,
            x: pos?.x ?? null,
            y: pos?.y ?? null,
            lat,
            lng,
            angle: angle ?? null,
            distancias: points.map((p) => p.distance.toFixed(2)),
            Timestamp_Logico,
            Temperatura
          };

          res.json({ proximidad: [response] });
        }
      );
    }
  );
});


app.get("/", (_req, res) => {
  res.send("Servidor Central del Sistema Distribuido - Entregable 1");
});

app.listen(PORT, () => {
  console.log(`✅ Servidor escuchando en http://localhost:${PORT}`);
});

type Point = { x: number; y: number; distance: number };

function trilaterate(
  p1: Point,
  p2: Point,
  p3: Point
): { x: number; y: number } | null {
  console.log("P1", p1);
  console.log("P2", p2);
  console.log("P3", p3);
  const xa = p1.x,
    ya = p1.y,
    ra = p1.distance;
  const xb = p2.x,
    yb = p2.y,
    rb = p2.distance;
  const xc = p3.x,
    yc = p3.y,
    rc = p3.distance;

  const S =
    (Math.pow(xc, 2) -
      Math.pow(xb, 2) +
      Math.pow(yc, 2) -
      Math.pow(yb, 2) +
      Math.pow(rb, 2) -
      Math.pow(rc, 2)) /
    2.0;
  const T =
    (Math.pow(xa, 2) -
      Math.pow(xb, 2) +
      Math.pow(ya, 2) -
      Math.pow(yb, 2) +
      Math.pow(rb, 2) -
      Math.pow(ra, 2)) /
    2.0;

  const yNumerator = T * (xb - xc) - S * (xb - xa);
  const yDenominator = (ya - yb) * (xb - xc) - (yc - yb) * (xb - xa);

  if (yDenominator === 0) {
    console.log("Y Denominator is 0");
    return null;
  }

  const y = yNumerator / yDenominator;
  const xNumerator = y * (ya - yb) - T;
  const xDenominator = xb - xa;

  if (xDenominator === 0) {
    console.log("X Denominator is 0");
    return null;
  }

  const x = xNumerator / xDenominator;

  console.log("X", x);
  console.log("Y", y);
  return { x, y };
}

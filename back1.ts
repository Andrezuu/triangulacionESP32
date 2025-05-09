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

// ✅ Ruta para estimar proximidad y realizar triangulación
app.get("/api/proximidad", (_req: Request, res: Response) => {
  const beacons = [
    { x: 0, y: 0 },
    { x: 6.3, y: 9 },
    { x: 2.5, y: 4 },
    // Agregar más beacons según sea necesario
  ];
  db.all(
    `SELECT ID_Beacon, ID_Movil, RSSI, RTT, Timestamp_Logico, created_at 
     FROM beacon_data
     WHERE id IN (
       SELECT id
       FROM beacon_data AS sub
       WHERE sub.ID_Beacon = beacon_data.ID_Beacon
       ORDER BY created_at DESC
       LIMIT 3
     )
     ORDER BY ID_Beacon, created_at DESC;`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      if (rows.length === 0) {
        return res
          .status(404)
          .json({ error: "No hay datos recientes para estimar proximidad" });
      }

      // Agrupar datos por ID_Beacon
      const groupedByBeacon: any = {};
      rows.forEach((row: any) => {
        if (!groupedByBeacon[row.ID_Beacon]) {
          groupedByBeacon[row.ID_Beacon] = [];
        }
        groupedByBeacon[row.ID_Beacon].push(row);
      });

      // Calcular proximidad y realizar triangulación
      const proximidad = Object.keys(groupedByBeacon).map((ID_Beacon) => {
        const data = groupedByBeacon[ID_Beacon];

        // Verificar que haya al menos 3 puntos para la triangulación
        if (data.length < 3) {
          return {
            ID_Beacon,
            error: "No hay suficientes datos para realizar la triangulación",
          };
        }

        // Calcular distancias y preparar puntos para la triangulación
        const points = data.slice(0, 3).map((row: any, index: number) => {
          const distancia = Math.pow(10, (-row.RSSI - 40) / 20) + row.RTT / 100; // Distancia aproximada
          return {
            x: beacons[index].x,
            y: beacons[index].y,
            distance: distancia,
          }; // Asignar coordenadas ficticias para los beacons
        });

        // Realizar la triangulación
        const pos = trilaterate(points[0], points[1], points[2]);
        const angle = pos ? Math.atan2(pos.y, pos.x) * (180 / Math.PI) : null;
        return {
          ID_Beacon,
          ID_Movil: data[0].ID_Movil,
          x: pos?.x || { error: "No se pudo calcular la posición en x" },
          y: pos?.y || { error: "No se pudo calcular la posición en y" },
          angle: angle,
          distancias: points.map((p: any) => p.distance.toFixed(2)),
          Timestamp_Logico: data[0].Timestamp_Logico,
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

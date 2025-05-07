import express, { Request, Response } from "express";
import axios from "axios";
import { mean, median, standardDeviation, min, max } from "simple-statistics";

const app = express();
const PORT = 5003;
const STORAGE_URL = "http://localhost:3000/query";

app.get("/api/stats/:id", async (req: Request, res: Response): Promise<any> => {
  console.log("Getting api stats");
  const deviceId = parseInt(req.params.id as string);
  const windowMinutes = parseInt(req.query.window_minutes as string) || 60;

  if (isNaN(deviceId)) {
    return res
      .status(400)
      .json({ error: "device_id es requerido y debe ser un número" });
  }

  const start = Date.now();
  try {
    const response = await axios.get(`${STORAGE_URL}/${deviceId}`);
    const latency = Date.now() - start;
    console.log(`[LOG] Latencia al llamar a /query: ${latency}ms`);

    const allData = response.data;
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - windowMinutes * 60;

    // const filtered = allData.filter(
    //   (item: any) =>
    //     item.device_id === deviceId && item.timestamp >= windowStart
    // );

    if (response.data.length === 0) {
      return res
        .status(404)
        .json({ message: "No hay datos disponibles para este dispositivo" });
    }

    const temperatures = response.data.map((item: any) => item.temperature);
    const rssis = response.data.map((item: any) => item.rssi);

    const calcStats = (data: number[]) => ({
      mean: mean(data),
      median: median(data),
      std_dev: standardDeviation(data),
      min: min(data),
      max: max(data),
      moving_avg: mean(data.slice(-5)),
    });

    return res.json({
      device_id: deviceId,
      samples: response.data.length,
      latency_ms: latency,
      temperature_stats: calcStats(temperatures),
      rssi_stats: calcStats(rssis),
    });
  } catch (err) {
    console.error("[ERROR] Fallo al consultar storage_service:", err);
    return res
      .status(500)
      .json({ error: "Error al consultar storage_service" });
  }
});

app.get("/", (_req, res) => {
  res.send("Servicio de estadísticas activo.");
});

app.listen(PORT, () => {
  console.log(`🧠 Servidor de estadísticas en http://localhost:${PORT}`);
});

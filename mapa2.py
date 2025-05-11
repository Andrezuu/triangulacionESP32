from flask import Flask, render_template_string, jsonify
import requests

app = Flask(__name__)

HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Visualización de Localización del Nodo Móvil</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.3/dist/leaflet.css" />
  <style>
    #map { height: 100vh; width: 100%; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.3/dist/leaflet.js"></script>
  <script>
    const beacons = {
      BEACON_01: { lat: -16.5019, lng: -68.13293 },
      BEACON_02: { lat: -16.501967, lng: -68.132795 },
      BEACON_03: { lat: -16.502062, lng: -68.132995 }
    };

    const map = L.map("map").setView([-16.5019, -68.13293], 18);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const beaconMarkers = {};
    for (const id in beacons) {
      const b = beacons[id];
      beaconMarkers[id] = L.marker([b.lat, b.lng]).addTo(map).bindPopup("Beacon: " + id);
    }

    let mobileCircle = null;
    let mobileMarker = null;
    let beaconCircles = [];

    async function fetchData() {
      try {
        const res = await fetch("/api/data");
        const json = await res.json();
        if (!json.proximidad || json.proximidad.length === 0) return;

        const p = json.proximidad[0];
        if (!p.lat || !p.lng) return;

        const color = p.Temperatura < 20 ? "blue" : p.Temperatura < 30 ? "orange" : "red";

        if (mobileCircle) map.removeLayer(mobileCircle);
        if (mobileMarker) map.removeLayer(mobileMarker);
        beaconCircles.forEach(c => map.removeLayer(c));
        beaconCircles = [];

        mobileCircle = L.circle([p.lat, p.lng], {
          radius: 4,
          color: color,
          fillOpacity: 0.5
        }).addTo(map);

        mobileMarker = L.marker([p.lat, p.lng]).addTo(map).bindPopup(
          `<b>${p.ID_Movil}</b><br>Lat: ${p.lat.toFixed(6)}, Lng: ${p.lng.toFixed(6)}<br>Temp: ${p.Temperatura}°C`
        );

        // Dibujar círculos de proximidad
        if (p.distancias && p.distancias.length === 3) {
          const beaconIDs = ["BEACON_01", "BEACON_02", "BEACON_03"];
          p.distancias.forEach((distancia, idx) => {
            const b = beacons[beaconIDs[idx]];
            const r = parseFloat(distancia);
            const c = L.circle([b.lat, b.lng], {
              radius: r,
              color: "gray",
              fillOpacity: 0.1
            }).addTo(map);
            beaconCircles.push(c);
          });
        }

      } catch (err) {
        console.error("Error cargando datos:", err);
      }
    }

    fetchData();
    setInterval(fetchData, 5000);
  </script>
</body>
</html>
"""


@app.route("/")
def index():
    return render_template_string(HTML_TEMPLATE)

@app.route("/api/data")
def api_data():
    try:
        res = requests.get("http://192.168.1.220:5000/api/proximidad", timeout=2)
        return jsonify(res.json())
    except Exception as e:
        return jsonify({"error": str(e), "proximidad": []})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)

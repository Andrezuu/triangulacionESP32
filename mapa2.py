from flask import Flask, render_template_string, jsonify
import requests

app = Flask(__name__)

HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Mapa de Proximidad</title>
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
      BEACON_01: { lat: -16.503, lng: -68.119 },
      BEACON_02: { lat: -16.504, lng: -68.120 },
      BEACON_03: { lat: -16.505, lng: -68.118 },
    };

    const map = L.map("map").setView([-16.504, -68.119], 18);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    for (const id in beacons) {
      const b = beacons[id];
      L.marker([b.lat, b.lng]).addTo(map).bindPopup("Beacon: " + id);
    }

    let mobileCircle = null;
    let mobileMarker = null;
    let beaconCircles = [];

    async function fetchProximidad() {
      try {
        const res = await fetch("/api/data");
        const data = await res.json();
        const proximidad = data.proximidad || [];
        const first = proximidad.find(p => p.x !== null && p.y !== null);
        const temperatura = 25; // usar valor fijo o pedir al backend

        // Limpiar círculos anteriores
        beaconCircles.forEach(c => map.removeLayer(c));
        beaconCircles = [];

        // Dibujar círculos desde cada beacon
        proximidad.forEach(p => {
          const b = beacons[p.ID_Beacon];
          if (b) {
            const r = parseFloat(p.distancia);
            const circle = L.circle([b.lat, b.lng], {
              radius: r,
              color: "blue",
              fillOpacity: 0.15
            }).addTo(map).bindPopup(`Distancia: ${r.toFixed(2)} m`);
            beaconCircles.push(circle);
          }
        });

        if (!first) return;
        const x = first.x;
        const y = first.y;
        const color = temperatura < 20 ? "blue" : temperatura < 30 ? "orange" : "red";

        if (mobileCircle) map.removeLayer(mobileCircle);
        if (mobileMarker) map.removeLayer(mobileMarker);

        mobileCircle = L.circle([-16.504 + (y * 0.0001), -68.119 + (x * 0.0001)], {
          radius: 4,
          color: color,
          fillOpacity: 0.5
        }).addTo(map);

        mobileMarker = L.marker([-16.504 + (y * 0.0001), -68.119 + (x * 0.0001)])
          .addTo(map)
          .bindPopup(`<b>Nodo Móvil</b><br>X: ${x.toFixed(2)}, Y: ${y.toFixed(2)}`);
      } catch (err) {
        console.error("Error al obtener datos:", err);
      }
    }

    fetchProximidad();
    setInterval(fetchProximidad, 5000);
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
        res = requests.get("http://192.168.197.136:5000/api/proximidad")
        return jsonify(res.json())
    except Exception as e:
        return jsonify({"error": str(e), "proximidad": []})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)

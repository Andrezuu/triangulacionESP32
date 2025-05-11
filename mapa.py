from flask import Flask, render_template_string, jsonify
import requests

app = Flask(__name__)

HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang=\"en\">
<head>
  <meta charset=\"UTF-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />
  <title>Mapa de Proximidad</title>
  <link
    rel=\"stylesheet\"
    href=\"https://unpkg.com/leaflet@1.9.3/dist/leaflet.css\"
  />
  <style>
    #map { height: 100vh; width: 100%; }
  </style>
</head>
<body>
  <div id=\"map\"></div>
  <script src=\"https://unpkg.com/leaflet@1.9.3/dist/leaflet.js\"></script>
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

    async function fetchProximidad() {
      try {
        const res = await fetch("/api/data");
        const data = await res.json();
        if (!data.proximidad) return;

        data.proximidad.forEach((item) => {
          const b = beacons[item.ID_Beacon];
          if (!b) return;

          const radius = parseFloat(item.distancia) * 1; // metros
          L.circle([b.lat, b.lng], {
            radius: radius,
            color: "blue",
            fillOpacity: 0.3,
          })
            .addTo(map)
            .bindPopup(
              `<b>${item.ID_Beacon}</b><br>Node: ${item.ID_Movil}<br>Distancia: ${item.distancia} m`
            );
        });
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
        res = requests.get("http://192.168.1.220:5000/api/proximidad")
        return jsonify(res.json())
    except Exception as e:
        return jsonify({"error": str(e), "proximidad": []}) 

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)

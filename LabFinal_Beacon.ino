#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// Datos del hotspot
// const char* ssid     = "Redmi Note 13 Pro";
// const char* password = "12345678";

// const char* ssid     = "OnePlus 8 Pro";
// const char* password = "123456789";

const char* ssid     = "vw-32043";
const char* password = "THOMP154@7062004#";

// Configuración del servidor
const char* serverUrl = "http://192.168.1.220:5000/api/beacon-data";

// SSID del Nodo Móvil (SoftAP)
const char* nodoMovilSSID = "NODO-MOVIL";

// Identificador del Beacon
const char* beaconId = "BEACON_01";

void setup() {
  Serial.begin(115200);
  delay(1000);
  connectToWiFi();
}

void loop() {
  int rssi = scanForNode();
  if (rssi != 0) {
    long rtt = measureRTT("192.168.1.226"); // IP estimada del Nodo Móvil
    sendData(rssi, rtt);
  }

  delay(3000);  // Espera 3 segundos entre escaneos
}

// ---------- FUNCIONES ----------

void connectToWiFi() {
  Serial.print("Conectando a ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConectado al WiFi.");
}

int scanForNode() {
  int n = WiFi.scanNetworks();
  for (int i = 0; i < n; i++) {
    if (WiFi.SSID(i) == nodoMovilSSID) {
      int rssi = WiFi.RSSI(i);
      Serial.printf("Nodo Móvil detectado - RSSI: %d dBm\n", rssi);
      return rssi;
    }
  }
  Serial.println("Nodo Móvil NO detectado.");
  return 0;
}

long measureRTT(const char* nodeIP) {
  WiFiClient client;
  unsigned long start = millis();
  if (client.connect(nodeIP, 80)) {
    client.stop();
    return millis() - start;
  } else {
    return -1;
  }
}

void sendData(int rssi, long rtt) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<256> json;
    json["ID_Beacon"] = beaconId;
    json["ID_Movil"] = "NODO-MOVIL";
    json["Metrica"] = "RSSI_RTT";
    json["RSSI"] = rssi;
    json["RTT"] = rtt;
    json["Timestamp_Logico"] = millis();  // temporalmente

    String payload;
    serializeJson(json, payload);
    Serial.println("Enviando: " + payload);

    int httpResponseCode = http.POST(payload);
    Serial.print("Respuesta HTTP: ");
    Serial.println(httpResponseCode);
    http.end();
  } else {
    Serial.println("WiFi desconectado.");
  }
}

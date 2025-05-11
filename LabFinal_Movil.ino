#include <WiFi.h>
#include <DHT.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

#define SENSOR_VCC_PIN 18
#define DHTPIN 19           // Pin de datos del sensor DHT
#define DHTTYPE DHT11       // Tipo de sensor

DHT dht(DHTPIN, DHTTYPE);

// Hotspot para acceso a red
// const char* ssid     = "Redmi Note 13 Pro";
// const char* password = "12345678";
// const char* ssid     = "OnePlus 8 Pro";
// const char* password = "123456789";

// Credenciales WiFi (hotspot)
const char* ssid     = "vw-32043";
const char* password = "THOMP154@7062004#";

const char* ap_ssid      = "NODO-MOVIL";
const char* ap_password  = "";

// Servidor backend
const char* serverUrl = "http://192.168.1.220:5000/api/nodo-movil";
const char* nodeId    = "NODO-MOVIL";

void setup() {
  Serial.begin(115200);

  // Alimentar el sensor desde GPIO
  pinMode(SENSOR_VCC_PIN, OUTPUT);
  digitalWrite(SENSOR_VCC_PIN, HIGH);
  delay(1000);

  dht.begin();

  // Iniciar SoftAP (opcional)
  WiFi.softAP(ap_ssid, ap_password);
  Serial.println("SoftAP iniciado: NODO-MOVIL");

  delay(2000);
  connectToHotspot();
}

void loop() {
  float temperature = readTemperature();
  sendData(temperature);
  delay(10000);  // cada 10 segundos
}

// --- Funciones auxiliares ---

void connectToHotspot() {
  WiFi.begin(ssid, password);
  Serial.print("Conectando al Hotspot ");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConectado al Hotspot.");
  Serial.print("IP del Nodo Móvil: ");
  Serial.println(WiFi.localIP());
}

float readTemperature() {
  float t = dht.readTemperature();
  if (isnan(t)) {
    Serial.println("⚠️ Error al leer la temperatura del DHT11");
    return 0.0;
  }
  Serial.print("Temperatura medida: ");
  Serial.println(t);
  return t;
}

void sendData(float temp) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<256> json;
    json["ID_Movil"] = nodeId;
    json["Temperatura"] = temp;
    json["Timestamp_Logico"] = millis();

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

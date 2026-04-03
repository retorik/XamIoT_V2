#include "globals.h"
#include "mqtt_mgr.h"
#include "nvs_store.h"
#include "ota_mgr.h"
#include <ESPmDNS.h>

// Page HTML
static const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang='fr'>
<head>
  <meta charset='UTF-8'>
  <meta name='viewport' content='width=device-width, initial-scale=1.0'>
  <title>XamIoT - SoundSense</title>
  <link rel='icon' type='image/svg+xml' href='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="%23111"/><rect x="4" y="14" width="4" height="10" rx="2" fill="%234caf50"/><rect x="10" y="10" width="4" height="14" rx="2" fill="%234caf50"/><rect x="16" y="6" width="4" height="18" rx="2" fill="%234caf50"/><rect x="22" y="12" width="4" height="12" rx="2" fill="%234caf50"/></svg>'>
  <style>
    :root {
      color-scheme: dark;
    }
    body {
      font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #111;
      color: #eee;
      margin: 0;
      padding: 1.5rem;
      text-align: center;
    }
    h1 {
      font-size: 1.4rem;
      margin: 0 0 1rem;
    }
    .card {
      background: #1c1c1c;
      border-radius: 10px;
      padding: 0.8rem 1rem;
      margin: 0 auto 0.9rem;
      max-width: 460px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      text-align: left;
    }
    .label {
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: #aaa;
      margin-bottom: 0.25rem;
    }
    .value {
      font-size: 0.95rem;
      margin: 0.12rem 0;
    }
    #wifiStatus.connected {
      color: #4caf50;
    }
    #wifiStatus.disconnected {
      color: #f44336;
    }
    .badge {
      display: inline-block;
      padding: 0.1rem 0.4rem;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 500;
      background: #333;
      color: #eee;
    }
    .badge.ok {
      background: #1b5e20;
      color: #c8e6c9;
    }
    .badge.warn {
      background: #795548;
      color: #ffe0b2;
    }
    .badge.err {
      background: #b71c1c;
      color: #ffcdd2;
    }
    #soundBox .bar {
      background: #333;
      border-radius: 6px;
      overflow: hidden;
      height: 12px;
      margin-top: 8px;
    }
    #soundBox .bar span {
      display: block;
      height: 100%;
      width: 0%;
      transition: width .2s ease;
      background: linear-gradient(90deg, #4caf50, #ff9800, #f44336);
    }
    small {
      color: #888;
      font-size: 0.8rem;
    }
    canvas {
      display: block;
      width: 100%;
      border-radius: 6px;
      background: #111;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <h1>XamIoT - SoundSense</h1>

  <div class='card' id='fwCard'>
    <div class='label'>Firmware</div>
    <div class='value'>Version : <span id='fwVersion'>-</span></div>
    <div class='value'>Hostname : <span id='hostname'>-</span></div>
    <div class='value'>OTA : <span id='otaStatus' class='badge'>Inactif</span></div>
  </div>

  <div class='card' id='wifiCard'>
    <div class='label'>Wi-Fi</div>
    <div class='value' id='wifiStatus'>WiFi: Déconnecté</div>
  </div>

  <div class='card' id='soundBox'>
    <div class='label'>Niveau sonore (EWMA)</div>
    <div class='value'><strong><span id='soundText'>0%</span></strong></div>
    <div class='bar'><span id='soundBar'></span></div>
    <small>Fenêtre: <span id='win'>--</span> s — Min/Max: <span id='mm'>--</span></small>
  </div>

  <div class='card'>
    <div class='label'>Historique 60 secondes</div>
    <canvas id='histCanvas' width='440' height='200'></canvas>
  </div>

  <div class='card'>
    <div class='label'>Bandes fréquentielles</div>
    <canvas id='fftCanvas' width='440' height='80'></canvas>
  </div>

  <script>
    var histCvs = document.getElementById('histCanvas');
    var fftCvs  = document.getElementById('fftCanvas');

    var BAND_FREQS  = [125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    var BAND_LABELS = ['125','250','500','1k','2k','4k','8k','16k'];

    function drawHistory(dbData, pfData) {
      if (!histCvs) return;
      var ctx = histCvs.getContext('2d');
      var W = histCvs.width, H = histCvs.height;
      ctx.clearRect(0, 0, W, H);
      var ML = 40, MR = 22, MT = 4, MB = 10;
      var cw = W - ML - MR, ch = H - MT - MB;
      var logMin = Math.log(BAND_FREQS[0]);
      var logMax = Math.log(BAND_FREQS[BAND_FREQS.length - 1]);

      // Grilles + axe gauche : "dBFS/%" compact (ex: -90/0%)
      var NOISE_FLOOR = -65, DBFS_MAX_V = 0;
      ctx.font = '8px sans-serif';
      [-90, -60, -30, 0].forEach(function(db) {
        var y = MT + ch - (db + 90) / 90 * ch;
        ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(ML, y); ctx.lineTo(ML + cw, y); ctx.stroke();
        var pct = Math.round((db - NOISE_FLOOR) * 100 / (DBFS_MAX_V - NOISE_FLOOR));
        pct = Math.max(0, Math.min(100, pct));
        var dbStr  = String(db);
        var pctStr = pct + '%';
        var slashW = ctx.measureText('/').width;
        var pctW   = ctx.measureText(pctStr).width;
        var totalW = ctx.measureText(dbStr).width + slashW + pctW;
        var x0 = ML - 2 - totalW;
        ctx.fillStyle = '#4caf50'; ctx.textAlign = 'left'; ctx.fillText(dbStr, x0, y + 3);
        x0 += ctx.measureText(dbStr).width;
        ctx.fillStyle = '#ffffff'; ctx.fillText('/', x0, y + 3);
        x0 += slashW;
        ctx.fillStyle = '#64b5f6'; ctx.fillText(pctStr, x0, y + 3);
      });

      // Axe droit : 0 (bas) → 500 → 2k → 8k → 16k (haut), positionnés sur l'échelle log
      ctx.fillStyle = '#ff9800'; ctx.textAlign = 'left';
      ctx.fillText('0', ML + cw + 2, MT + ch + 3);
      [[500,'500'],[2000,'2k'],[8000,'8k'],[16000,'16k']].forEach(function(f) {
        var y = MT + ch - (Math.log(f[0]) - logMin) / (logMax - logMin) * ch;
        ctx.fillText(f[1], ML + cw + 2, y + 3);
      });

      // Courbe dBFS (verte)
      if (dbData && dbData.length >= 2) {
        ctx.strokeStyle = '#4caf50'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (var i = 0; i < dbData.length; i++) {
          var x = ML + i * cw / (dbData.length - 1);
          var y = MT + ch - (dbData[i] + 90) / 90 * ch;
          y = Math.max(MT, Math.min(MT + ch, y));
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Courbe fréquence dominante (orange)
      if (pfData && pfData.length >= 2) {
        ctx.strokeStyle = '#ff9800'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (var i = 0; i < pfData.length; i++) {
          var x = ML + i * cw / (pfData.length - 1);
          var freq = BAND_FREQS[pfData[i]] || BAND_FREQS[0];
          var y = MT + ch - (Math.log(freq) - logMin) / (logMax - logMin) * ch;
          y = Math.max(MT, Math.min(MT + ch, y));
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Légende
      ctx.textAlign = 'left'; ctx.font = '8px sans-serif';
      ctx.fillStyle = '#4caf50'; ctx.fillRect(ML, MT + ch + 2, 8, 6);
      ctx.fillStyle = '#ccc'; ctx.fillText('dBFS', ML + 10, MT + ch + 8);
      ctx.fillStyle = '#64b5f6'; ctx.fillRect(ML + 46, MT + ch + 2, 8, 6);
      ctx.fillStyle = '#ccc'; ctx.fillText('%', ML + 56, MT + ch + 8);
      ctx.fillStyle = '#ff9800'; ctx.fillRect(ML + 72, MT + ch + 2, 8, 6);
      ctx.fillStyle = '#ccc'; ctx.fillText('fréq. max (Hz)', ML + 82, MT + ch + 8);
    }

    function drawFFT(data) {
      if (!fftCvs) return;
      var w = fftCvs.width, h = fftCvs.height;
      var ctx = fftCvs.getContext('2d');
      ctx.clearRect(0, 0, w, h);
      if (!data || data.length === 0) return;
      var bw = w / data.length;
      for (var i = 0; i < data.length; i++) {
        var v = data[i];
        var bh = v / 100 * (h - 14);
        var r = Math.min(255, Math.round(v * 2.55));
        var g = Math.max(0, 255 - r);
        ctx.fillStyle = 'rgb(' + r + ',' + g + ',60)';
        ctx.fillRect(i * bw + 2, h - 14 - bh, bw - 4, bh);
        ctx.fillStyle = '#888';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(BAND_LABELS[i], i * bw + bw / 2, h - 2);
      }
    }

    function updateStatus() {
      fetch('/status')
        .then(function(r) { return r.json(); })
        .then(function(d) {
          // WiFi
          var ws = document.getElementById('wifiStatus');
          ws.textContent = 'WiFi: ' + (d.wifiConnected ? d.ip : 'Déconnecté');
          ws.className = d.wifiConnected ? 'connected' : 'disconnected';

          // Firmware / hostname / OTA
          var fwEl = document.getElementById('fwVersion');
          if (fwEl && d.fwVersion !== undefined) fwEl.textContent = d.fwVersion;
          var hnEl = document.getElementById('hostname');
          if (hnEl && d.hostname) hnEl.textContent = d.hostname;
          var otaEl = document.getElementById('otaStatus');
          if (otaEl && d.otaStatus !== undefined) {
            otaEl.textContent = d.otaStatus;
            otaEl.className = 'badge' + (d.otaReady ? ' ok' : (d.wifiConnected ? (d.otaStatus && d.otaStatus.indexOf('Erreur') === 0 ? ' err' : ' warn') : ''));
          }

          // Son
          var p = Math.max(0, Math.min(100, d.soundPct || 0));
          var st = document.getElementById('soundText');
          var sb = document.getElementById('soundBar');
          if (st) st.textContent = p + '%';
          if (sb) sb.style.width = p + '%';
          var win = document.getElementById('win');
          var mm = document.getElementById('mm');
          if (win) win.textContent = d.windowSec != null ? d.windowSec : '?';
          if (mm) mm.textContent = (d.soundPct_min != null ? d.soundPct_min : '?') + ' / ' + (d.soundPct_max != null ? d.soundPct_max : '?');

          // Graphiques
          drawHistory(d.hdb, d.hpf);
          drawFFT(d.fft);
        })
        .catch(function() {});
    }

    setInterval(updateStatus, 1000);
    window.onload = updateStatus;
  </script>
</body>
</html>
)rawliteral";


void startWebServer() {
  static bool started=false;
  if (started) return;

  server.on("/", [](){ server.send_P(200, "text/html", INDEX_HTML); });

  server.on("/status", [](){
    char ipStr[16] = "";
    if (wifiConnected) WiFi.localIP().toString().toCharArray(ipStr, sizeof(ipStr));
    const char* hostname = g_hostname[0] ? g_hostname : g_chipId;

    // JSON construit en une passe (pas de buffer intermédiaire h60)
    static char json[1024];
    int pos = 0;
    pos += snprintf(json + pos, sizeof(json) - pos,
      "{\"wifiConnected\":%s,\"ip\":\"%s\",\"fwVersion\":\"%s\","
      "\"hostname\":\"%s\",\"otaReady\":%s,\"otaStatus\":\"%s\","
      "\"soundPct\":%d,\"soundPct_avg\":%d,\"soundPct_min\":%d,"
      "\"soundPct_max\":%d,\"windowSec\":%d,\"dbfsAvg\":%d,"
      "\"dbfsEwma\":%d,\"soundLevel\":%u,"
      "\"fft\":[%d,%d,%d,%d,%d,%d,%d,%d],"
      "\"h60\":[",
      wifiConnected ? "true" : "false",
      ipStr, FW_VERSION, hostname,
      otaIsRunning() ? "false" : "true",
      otaIsRunning() ? "En cours" : "Prêt (MQTT)",
      (int)round(g_ewmaPct),
      (int)round(g_soundPctAvg),
      (int)round(g_soundPctMin),
      (int)round(g_soundPctMax),
      SND_AVG_SECONDS,
      (int)round(g_dbfsAvg),
      (int)round(g_ewmaDbfs),
      (uint16_t)round(g_ewmaPct * 40.95),
      g_fftBands[0], g_fftBands[1], g_fftBands[2], g_fftBands[3],
      g_fftBands[4], g_fftBands[5], g_fftBands[6], g_fftBands[7]);
    for (int i = 0; i < HIST60_SIZE && pos < (int)sizeof(json) - 6; i++) {
      int idx = ((int)g_hist60Idx + i) % HIST60_SIZE;
      pos += snprintf(json + pos, sizeof(json) - pos, "%s%d", i ? "," : "", g_history60[idx]);
    }
    pos += snprintf(json + pos, sizeof(json) - pos, "],\"hdb\":[");
    for (int i = 0; i < HIST60_SIZE && pos < (int)sizeof(json) - 6; i++) {
      int idx = ((int)g_hist60Idx + i) % HIST60_SIZE;
      pos += snprintf(json + pos, sizeof(json) - pos, "%s%d", i ? "," : "", (int)g_histDB60[idx]);
    }
    pos += snprintf(json + pos, sizeof(json) - pos, "],\"hpf\":[");
    for (int i = 0; i < HIST60_SIZE && pos < (int)sizeof(json) - 4; i++) {
      int idx = ((int)g_hist60Idx + i) % HIST60_SIZE;
      pos += snprintf(json + pos, sizeof(json) - pos, "%s%d", i ? "," : "", g_histPeakFreq60[idx]);
    }
    snprintf(json + pos, sizeof(json) - pos, "]}");
    server.send(200, "application/json", json);
  });


  server.on("/mqtt", [](){
    String host = server.hasArg("host") ? server.arg("host") : mqtt_host;
    String user = server.hasArg("user") ? server.arg("user") : mqtt_user;
    String pass = server.hasArg("pass") ? server.arg("pass") : mqtt_pass;
    uint16_t port = server.hasArg("port") ? (uint16_t)server.arg("port").toInt() : mqtt_port;

    if (!server.hasArg("host") && !server.hasArg("port") && !server.hasArg("user") && !server.hasArg("pass")) {
      String help = "Usage: /mqtt?host=IP|DNS&port=1883|8883&user=xxx&pass=yyy\n";
      help += "Actuel: host=" + mqtt_host + " port=" + String(mqtt_port) + " user=" + mqtt_user + " pass_len=" + String(mqtt_pass.length()) + "\n";
      server.send(200, "text/plain", help);
      return;
    }

    saveMqttSettings(host, port, user, pass);

    if (wifiConnected) {
      if (g_mqtt.connected()) g_mqtt.disconnect();
      mqttApplyServerFromSettings();
      mqttReconnectIfNeeded();
      mqttPublishStatus(true);
    }

    String json = "{\"ok\":true,\"host\":\"" + mqtt_host + "\",\"port\":" + String(mqtt_port) +
                  ",\"user\":\"" + mqtt_user + "\",\"pass_len\":" + String(mqtt_pass.length()) + "}";
    server.send(200, "application/json", json);
  });

  server.on("/wifi-scan", [](){
    // Scan synchrone nécessaire ici, mais on appelle mqtt.loop() avant/après
    // pour maintenir le keepalive MQTT pendant le scan (~2s)
    extern void mqttLoop();
    mqttLoop();
    int n = WiFi.scanNetworks(false, true);
    mqttLoop();

    char out[1024];
    int pos = 0;
    pos += snprintf(out + pos, sizeof(out) - pos, "[");
    int maxN = (n < 0) ? 0 : min(n, 10);
    for (int i = 0; i < maxN; ++i) {
      pos += snprintf(out + pos, sizeof(out) - pos,
        "%s{\"ssid\":\"%s\",\"rssi\":%d,\"channel\":%d,\"enc\":%d}",
        i > 0 ? "," : "",
        WiFi.SSID(i).c_str(), WiFi.RSSI(i), WiFi.channel(i), (int)WiFi.encryptionType(i));
    }
    snprintf(out + pos, sizeof(out) - pos, "]");
    server.send(200, "application/json", out);
  });

  server.on("/wifi-reason", [](){
    String out = "{\"reason\":" + String(g_lastDiscReason) + "}";
    server.send(200, "application/json", out);
  });

  server.onNotFound([](){ server.send(404, "text/plain", ""); });
  server.begin();
  Serial.println("Serveur web démarré");

  // mDNS : permet d'accéder au device via SOUND-SENSOR-<id>.local
  if (g_hostname[0] != '\0') {
    if (MDNS.begin(g_hostname)) {
      MDNS.addService("http", "tcp", 80);
      Serial.printf("[mDNS] Accessible via %s.local\n", g_hostname);
    } else {
      Serial.println("[mDNS] Échec init");
    }
  }

  started = true;
}

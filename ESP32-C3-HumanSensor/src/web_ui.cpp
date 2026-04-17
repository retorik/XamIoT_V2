#include "web_ui.h"
#include <WebServer.h>

namespace {
  WebServer srv(80);
  static web_ui::HtmlBuilder g_html = nullptr;
  static web_ui::JsonBuilder g_status = nullptr;
  static web_ui::JsonBuilder g_dump = nullptr;
  static bool g_started = false;

  // ---- Page HTML par défaut (PROGMEM) ----
  // Utilise AJAX /status pour remplir, et des barres pour énergies + distances.
  static const char INDEX_HTML[] PROGMEM = R"HTML(<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ESP32-C3 -> HLK-LD2410C</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial;margin:18px;line-height:1.35}
  code{background:#f7f7f7;padding:2px 6px;border-radius:4px}
  .pill{display:inline-block;padding:2px 8px;border-radius:12px;background:#eee;margin-left:6px}
  .row{display:flex;gap:14px;flex-wrap:wrap}
  .card{flex:1 1 280px;border:1px solid #eee;border-radius:12px;padding:12px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
  .k{color:#666}
  .bar{height:14px;background:#eee;border-radius:7px;overflow:hidden}
  .bar>span{display:block;height:100%;width:0%}
  .b-green>span{background:#4caf50}.b-blue>span{background:#2196f3}.b-amber>span{background:#ff9800}
  .grid{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:6px 10px;align-items:center}
  .muted{color:#999;font-size:12px}
</style>
<h1>HumanSensor - By Djé</h1>

<div class="row">
  <div class="card">
    <div><b>Wi-Fi</b></div>
    <div class="grid">
      <div class="k">IP</div><div id="ip">—</div>
      <div class="k">RSSI</div><div id="rssi">—</div>
      <div class="k">SSID</div><div id="ssid">—</div>
      <div class="k">BSSID</div><div id="bssid">—</div>
    </div>
  </div>
  <div class="card">
    <div><b>Présence</b></div>
    <div>Brut: <span id="present" class="pill">—</span>  | Filtré: <span id="presentF" class="pill">—</span>  | OUT: <span id="out">0</span></div>
    <div class="muted">Floors énergie (idle): M=<span id="f_m">0</span> S=<span id="f_s">0</span> | Base statique: <span id="base">0</span> cm</div>
  </div>
</div>

<div class="row">
  <div class="card">
    <div><b>Énergie mouvement</b>: <span id="mev">0</span>%</div>
    <div class="bar b-green"><span id="me"></span></div>
    <div style="height:6px"></div>
    <div><b>Énergie statique</b>: <span id="sev">0</span>%</div>
    <div class="bar b-blue"><span id="se"></span></div>
  </div>

  <div class="card">
    <div><b>Distance (corrigée/affichage)</b></div>
    <div>Mouv: <span id="dmC">0</span> cm</div>
    <div class="bar b-amber"><span id="dmB"></span></div>
    <div style="height:6px"></div>
    <div>Stat: <span id="dsC">0</span> cm</div>
    <div class="bar b-amber"><span id="dsB"></span></div>
    <div style="height:6px"></div>
    <div>Cible: <span id="dtC">0</span> cm</div>
    <div class="bar b-amber"><span id="dtB"></span></div>
    <div class="muted">Brut — M:<span id="dmR">0</span> S:<span id="dsR">0</span> T:<span id="dtR">0</span></div>
  </div>
</div>

<p class="muted">Frames: <span id="frames">0</span> — Dernière: <span id="last">0</span> ms — <a href="/dump">/dump</a></p>

<script>
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const pct=(v,max)=>clamp((v*100)/max,0,100);
  const setBar=(id,val)=>{document.getElementById(id).style.width=clamp(val,0,100)+'%';};
  const setTxt=(id,txt)=>{document.getElementById(id).textContent=txt;};

  function tick(){
    fetch('/status').then(r=>r.json()).then(d=>{
      setTxt('ip', d.wifi? d.ip : '—');
      setTxt('rssi', d.rssi ?? '—');
      setTxt('ssid', d.ssid ?? '');
      setTxt('bssid', d.bssid ?? '');

      setTxt('present', (d.ld_present?'OUI':'NON'));
      setTxt('presentF', (d.ld_present_f?'OUI':'NON'));
      setTxt('out', d.ld_out||0);

      setTxt('f_m', d.cal_floor_move||0);
      setTxt('f_s', d.cal_floor_stat||0);
      setTxt('base', (d.cal_base_cm||0).toFixed?.(1)??(d.cal_base_cm||0));

      const me = clamp(d.ld_move_energy||0,0,100);
      const se = clamp(d.ld_stat_energy||0,0,100);
      setTxt('mev', me); setTxt('sev', se);
      setBar('me', me);  setBar('se', se);

      // Distances d'affichage (disp) -> barres ; brutes restent affichées en petit
      const dmC = (d.ld_move_cm_disp   ?? d.ld_move_cm_corr   ?? 0);
      const dsC = (d.ld_stat_cm_disp   ?? d.ld_stat_cm_corr   ?? 0);
      const dtC = (d.ld_target_cm_disp ?? d.ld_target_cm_corr ?? 0);
      const dmR = d.ld_move_cm ?? 0, dsR = d.ld_stat_cm ?? 0, dtR = d.ld_target_cm ?? 0;

      setTxt('dmC', dmC); setTxt('dsC', dsC); setTxt('dtC', dtC);
      setBar('dmB', pct(dmC,600)); setBar('dsB', pct(dsC,600)); setBar('dtB', pct(dtC,600));

      setTxt('dmR', dmR); setTxt('dsR', dsR); setTxt('dtR', dtR);
      setTxt('frames', d.ld_frames||0); setTxt('last', d.ld_last_ms||0);
    }).catch(()=>{});
  }
  setInterval(tick, 400);
  window.onload = tick;
</script>
)HTML";
}

namespace web_ui {

  bool started(){ return g_started; }

  void begin(HtmlBuilder html, JsonBuilder status, JsonBuilder dump){
    if (g_started) return;
    g_html   = html;
    g_status = status;
    g_dump   = dump;

    srv.on("/", [](){
      if (g_html){
        String page = g_html();
        srv.send(200, "text/html; charset=utf-8", page);
      } else {
        srv.send_P(200, "text/html; charset=utf-8", INDEX_HTML);
      }
    });

    srv.on("/status", [](){
      String s = g_status ? g_status() : "{}";
      srv.send(200, "application/json", s);
    });

    srv.on("/dump", [](){
      String s = g_dump ? g_dump() : "{}";
      srv.send(200, "application/json", s);
    });

    srv.begin();
    g_started = true;
    Serial.println("Serveur web démarré");
  }

  void begin_default(JsonBuilder status, JsonBuilder dump){
    begin(nullptr, status, dump);
  }

  void handle(){
    if (g_started) srv.handleClient();
  }
}

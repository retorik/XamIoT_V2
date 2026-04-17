#include <Arduino.h>
#include <WiFi.h>
#include "app_state.h"
#include "wifi_mgr.h"
#include "web_ui.h"
#include <esp_wifi.h>
#include "esp_idf_version.h"
#include <math.h>

// ================== CONFIG ==================
#define WIFI_SSID   "MyBox"
#define WIFI_PASS   "WPA2TOM45UGO"
#define HOSTNAME    "esp32c3-ld2410c"

// LD2410C (UART après GOT_IP + délai)
#define LD_RX_PIN   20
#define LD_TX_PIN   21
#define LD_OUT_PIN  10
#define LD_BAUD     256000

#define HEARTBEAT_MS         2000UL
#define UART_DELAY_AFTER_IP  3000UL
#define WIFI_WATCHDOG_MS     20000UL
#define USE_LOWER_TX_POWER   1
#define DEBUG_LD 2

// ---- Auto-calibration & filtrage ----
#define CAL_IDLE_ENERGY_MAX     5      // au lieu de 3
#define CAL_IDLE_HOLD_MS        8000UL
#define CAL_ALPHA_BASE          0.12f
#define CAL_ALPHA_FLOOR         0.15f
#define CAL_PRES_HI_DELTA       5      // au lieu de 3
#define CAL_PRES_LO_DELTA       1
#define CAL_ABSENT_GRACE_MS     2000UL
#define LD_MAX_CM               6000
// ================== FIN CONFIG ==================

// ---- ring buffer pour /dump ----
static const size_t DUMP_SZ=3072;
static uint8_t dumpRing[DUMP_SZ]; static size_t dumpWr=0;
static inline void pushDumpByte(uint8_t b){ dumpRing[dumpWr++]=b; dumpWr%=DUMP_SZ; }

// ---- Buffer circulaire parsing UART ----
static uint8_t  rb[8192];
static size_t   rhead = 0, rtail = 0;
static inline size_t rcount(){ return (rhead>=rtail)?(rhead-rtail):(sizeof(rb)-(rtail-rhead)); }
static inline void rpush(uint8_t b){ rb[rhead]=b; rhead=(rhead+1)%sizeof(rb); if (rhead==rtail) rtail=(rtail+1)%sizeof(rb); }
static inline uint8_t rpeek(size_t i){ return rb[(rtail+i)%sizeof(rb)]; }
static inline void rskip(size_t n){ rtail=(rtail+n)%sizeof(rb); }

static bool matchSeq(size_t off, const uint8_t* seq, size_t n){
  if (rcount() < off+n) return false;
  for (size_t i=0;i<n;i++) if (rpeek(off+i)!=seq[i]) return false; return true;
}
static void hexdump(const uint8_t* p, size_t n){
  for (size_t i=0;i<n;i++){ char b[4]; snprintf(b,sizeof(b),"%02X",p[i]); Serial.print(b); if ((i&15)==15) Serial.print(' '); }
}

// ======= Flag global pour l’état UART =======
static bool uart_begun = false;

// ================== LD2410C: commandes & parsing ==================
static const uint8_t CMD_ENTER_CFG[] = {0xFD,0xFC,0xFB,0xFA, 0x02,0x00, 0xFF,0x00, 0x04,0x03,0x02,0x01};
static const uint8_t CMD_ENG_ON[]   = {0xFD,0xFC,0xFB,0xFA, 0x02,0x00, 0x62,0x00, 0x04,0x03,0x02,0x01};
static const uint8_t CMD_EXIT_CFG[] = {0xFD,0xFC,0xFB,0xFA, 0x02,0x00, 0xFE,0x00, 0x04,0x03,0x02,0x01};
static const uint8_t SYNC[8]        = {0xF8,0xF7,0xF6,0xF5,0xF4,0xF3,0xF2,0xF1};

static void writeCmd(const uint8_t* p, size_t n, const char* tag){
  Serial.printf("[LD] >> %s (%u bytes)\n", tag, (unsigned)n);
  Serial1.write(p, n);
  Serial1.flush();
}
static void runLD2410Enable(){
  while (Serial1.available()) { pushDumpByte((uint8_t)Serial1.read()); g.ld_bytes++; }
  delay(20);
  writeCmd(CMD_ENTER_CFG, sizeof(CMD_ENTER_CFG), "ENTER_CFG");
  delay(30);
  writeCmd(CMD_ENG_ON,   sizeof(CMD_ENG_ON),   "ENG_ON");
  delay(30);
  writeCmd(CMD_EXIT_CFG, sizeof(CMD_EXIT_CFG), "EXIT_CFG");
  delay(30);
  Serial.println("[LD] Séquence d’activation du flux temps réel envoyée.");
}

static void decodeBasicAndLog(const uint8_t* p, size_t len, uint16_t crc){
  // cherche 01/02 AA
  int idx=-1;
  for (size_t i=0;i+11<=len;i++){
    if ((p[i]==0x01 || p[i]==0x02) && p[i+1]==0xAA){ idx=(int)i; break; }
  }
  if (idx<0){
    if (DEBUG_LD>=2){
      Serial.print("[LD] frame sans marqueur 01/02 AA, len="); Serial.print(len);
      Serial.print(" crc=0x"); Serial.printf("%04X", crc);
      Serial.print("  head="); hexdump(p, min((size_t)24,len)); Serial.println();
    }
    return;
  }

  // ----- Décodage brut
  uint8_t  st  = p[idx+2];                          // 0 none, 1 moving, 2 static, 3 both
  uint16_t mm  = (uint16_t)p[idx+3] | ((uint16_t)p[idx+4]<<8);
  uint8_t  me  = p[idx+5];
  uint16_t ss  = (uint16_t)p[idx+6] | ((uint16_t)p[idx+7]<<8);
  uint8_t  se  = p[idx+8];
  uint16_t tgt = (uint16_t)p[idx+9] | ((uint16_t)p[idx+10]<<8);

  if (mm>LD_MAX_CM) mm=0; if (ss>LD_MAX_CM) ss=0; if (tgt>LD_MAX_CM) tgt=0;
  const bool st_none = (st == 0);
  // Si le capteur indique "personne", on remet les distances brutes à 0.
  if (st_none) { mm = 0; ss = 0; tgt = 0; }

  if (me>100) me=100; if (se>100) se=100;

  // ----- État brut (inchangé)
  g.ld_frames++; g.ld_last_ok_ms = millis();
  g.ld_present = (st==1 || st==2 || st==3);
  g.ld_moving  = (st==1 || st==3);
  g.ld_static  = (st==2 || st==3);
  g.ld_move_cm = mm;  g.ld_stat_cm = ss; g.ld_target_cm = tgt;
  g.ld_move_energy = me; g.ld_stat_energy = se;

  // =============================
  //   AUTO-CALIBRATION & FILTRE
  // =============================
  const uint32_t now = millis();

  // Option: apprentissage "idle" plus souple
  const bool isIdle = (st==0) || ((me <= CAL_IDLE_ENERGY_MAX) && (se <= CAL_IDLE_ENERGY_MAX));

  if (g.ld_present) g.last_presence_ms = now;

  // 1) Floors d'énergie & base statique
  if (isIdle) {
    g.cal_last_idle_ms = now;
    g.cal_floor_move = (uint8_t)roundf((1.f - CAL_ALPHA_FLOOR) * g.cal_floor_move + CAL_ALPHA_FLOOR * me);
    g.cal_floor_stat = (uint8_t)roundf((1.f - CAL_ALPHA_FLOOR) * g.cal_floor_stat + CAL_ALPHA_FLOOR * se);
    if (ss > 0) {
      if (!g.cal_active) { g.cal_stat_base_cm = (float)ss; g.cal_active = true; }
      else               { g.cal_stat_base_cm = (1.f - CAL_ALPHA_BASE)*g.cal_stat_base_cm + CAL_ALPHA_BASE*(float)ss; }
    }
  }

  // 2) Distances corrigées
  float base = (g.cal_active ? g.cal_stat_base_cm : 0.f);
  auto clamp0 = [](int v){ return v < 0 ? 0 : v; };

  int stat_corr   = clamp0((int)ss  - (int)roundf(base));
  int move_corr   = clamp0((int)mm  - (int)roundf(base));
  int target_corr = clamp0((int)tgt - (int)roundf(base));

  if (stat_corr  > LD_MAX_CM) stat_corr  = 0;
  if (move_corr  > LD_MAX_CM) move_corr  = 0;
  if (target_corr> LD_MAX_CM) target_corr= 0;

  g.ld_stat_cm_corr   = (uint16_t)stat_corr;
  g.ld_move_cm_corr   = (uint16_t)move_corr;
  g.ld_target_cm_corr = (uint16_t)target_corr;

  // 3) Présence filtrée (hystérésis sur floors)
  const uint8_t m_hi = (uint8_t)(g.cal_floor_move + CAL_PRES_HI_DELTA);
  const uint8_t s_hi = (uint8_t)(g.cal_floor_stat + CAL_PRES_HI_DELTA);
  const uint8_t m_lo = (uint8_t)(g.cal_floor_move + CAL_PRES_LO_DELTA);
  const uint8_t s_lo = (uint8_t)(g.cal_floor_stat + CAL_PRES_LO_DELTA);

  if (me >= m_hi || se >= s_hi) g.ld_present_f = true;
  bool lowE = (me <= m_lo && se <= s_lo);
  if (g.ld_present_f && lowE) {
    if ((now - max(g.cal_last_idle_ms, g.last_presence_ms)) > CAL_ABSENT_GRACE_MS) {
      g.ld_present_f = false;
    }
  }

  // 4) Distances d’affichage : n’afficher >0 que si présence filtrée
  uint16_t stat_disp   = (g.ld_present_f ? (g.ld_stat_cm_corr   ? g.ld_stat_cm_corr   : ss) : 0);
  uint16_t move_disp   = (g.ld_present_f ? (g.ld_move_cm_corr   ? g.ld_move_cm_corr   : mm) : 0);
  uint16_t target_disp = (g.ld_present_f ? (g.ld_target_cm_corr ? g.ld_target_cm_corr : tgt) : 0);

  g.ld_stat_cm_disp   = stat_disp;
  g.ld_move_cm_disp   = move_disp;
  g.ld_target_cm_disp = target_disp;

   if (DEBUG_LD>=1){
    Serial.printf("[LD] OK len=%u crc=0x%04X st=%u | mov=%ucm(e%u) stat=%ucm(e%u) tgt=%ucm | base=%.1f corr=%u/%u/%u disp=%u/%u/%u floors m/s=%u/%u presF=%d\n",
                  (unsigned)len, crc, st,
                  (unsigned)mm, (unsigned)me, (unsigned)ss, (unsigned)se, (unsigned)tgt,
                  base,
                  (unsigned)g.ld_move_cm_corr, (unsigned)g.ld_stat_cm_corr, (unsigned)g.ld_target_cm_corr,
                  (unsigned)g.ld_move_cm_disp, (unsigned)g.ld_stat_cm_disp, (unsigned)g.ld_target_cm_disp,
                  g.cal_floor_move, g.cal_floor_stat, (int)g.ld_present_f);
  }
}

static void serviceLD2410(){
  if (!g.wantUartStart) return;

  while (Serial1.available()){
    uint8_t b = (uint8_t)Serial1.read();
    pushDumpByte(b); g.ld_bytes++;
    rpush(b);
  }

  while (rcount() >= 10){
    size_t i=0;
    for (; i+8 <= rcount(); ++i){
      if (matchSeq(i, SYNC, 8)) break;
    }
    if (i+8 > rcount()){
      size_t c = rcount();
      if (c>7) rskip(c-7);
      return;
    }
    if (i>0) rskip(i);

    if (rcount() < 10) return;
    uint16_t L = (uint16_t)rpeek(8) | ((uint16_t)rpeek(9) << 8);
    if (L < 2 || L > 1024){
      if (DEBUG_LD>=1){
        Serial.print("[LD] LEN suspect L="); Serial.println(L);
      }
      rskip(1);
      continue;
    }

    size_t need = 8 + 2 + (size_t)L;
    if (rcount() < need) return;

    size_t payLen = (L>=2)? (L-2) : 0;
    static uint8_t pay[1024];
    for (size_t j=0;j<payLen && j<sizeof(pay); j++) pay[j]=rpeek(10+j);

    uint16_t crc = (uint16_t)rpeek(10+payLen) | ((uint16_t)rpeek(11+payLen) << 8);

    if (DEBUG_LD>=2){
      Serial.print("[LD] frame SYNC @0 len="); Serial.print(L);
      Serial.print(" payload="); Serial.print(payLen);
      Serial.print(" crc=0x"); Serial.printf("%04X", crc);
      Serial.print(" first="); hexdump(pay, min((size_t)20, payLen)); Serial.println();
    }

    decodeBasicAndLog(pay, payLen, crc);
    rskip(need);
  }
}

// ================== START HELPERS ==================
static void startUartIfNeeded(){
  if (!g.wifiConnected || g.wantUartStart==false) return;
  if (uart_begun) return;
  if (millis() - g.gotIpAt < UART_DELAY_AFTER_IP) return;

  Serial1.setRxBufferSize(8192);
  Serial1.begin(LD_BAUD, SERIAL_8N1, LD_RX_PIN, LD_TX_PIN);
  uart_begun = true;
  Serial.printf("[UART] LD2410C démarré @ %u bps (RX=%d, TX=%d)\n", LD_BAUD, LD_RX_PIN, LD_TX_PIN);
  runLD2410Enable();
}

// ================== BUILDERS WEB ==================
static String buildStatusJson(){
  char buf[1024];
  bool outPin = digitalRead(LD_OUT_PIN);
  snprintf(buf,sizeof(buf),
    "{"
    "\"wifi\":%s,\"ip\":\"%s\",\"ssid\":\"%s\",\"bssid\":\"%s\",\"ch\":%d,\"rssi\":%d,"
    "\"ld_present\":%s,\"ld_moving\":%s,\"ld_static\":%s,"
    "\"ld_move_cm\":%u,\"ld_stat_cm\":%u,\"ld_target_cm\":%u,"
    "\"ld_move_energy\":%u,\"ld_stat_energy\":%u,"
    "\"ld_out\":%d,\"ld_frames\":%u,\"ld_last_ms\":%u,"
    "\"ld_present_f\":%s,"
    "\"ld_stat_cm_corr\":%u,\"ld_move_cm_corr\":%u,\"ld_target_cm_corr\":%u,"
    "\"ld_stat_cm_disp\":%u,\"ld_move_cm_disp\":%u,\"ld_target_cm_disp\":%u,"
    "\"cal_base_cm\":%.1f,\"cal_floor_move\":%u,\"cal_floor_stat\":%u"
    "}",
    g.wifiConnected?"true":"false",
    g.wifiConnected?WiFi.localIP().toString().c_str():"",
    (const char*)String(WIFI_SSID).c_str(),
    g.chosenBssid.c_str(), g.chosenChannel, WiFi.RSSI(),
    (g.ld_present||outPin)?"true":"false", g.ld_moving?"true":"false", g.ld_static?"true":"false",
    (unsigned)g.ld_move_cm, (unsigned)g.ld_stat_cm, (unsigned)g.ld_target_cm,
    (unsigned)g.ld_move_energy, (unsigned)g.ld_stat_energy,
    outPin?1:0, (unsigned)g.ld_frames, (unsigned)g.ld_last_ok_ms,
    g.ld_present_f?"true":"false",
    (unsigned)g.ld_stat_cm_corr, (unsigned)g.ld_move_cm_corr, (unsigned)g.ld_target_cm_corr,
    (unsigned)g.ld_stat_cm_disp, (unsigned)g.ld_move_cm_disp, (unsigned)g.ld_target_cm_disp,
    g.cal_stat_base_cm, g.cal_floor_move, g.cal_floor_stat
  );
  return String(buf);
}

static String buildDumpJson(){
  const size_t N=768;
  String s; s.reserve(N*3+40);
  s += "{ \"hex\":\"";
  size_t start = (dumpWr + DUMP_SZ - N)%DUMP_SZ;
  for(size_t i=0;i<N;i++){
    uint8_t b = dumpRing[(start+i)%DUMP_SZ];
    char h[4]; snprintf(h,sizeof(h),"%02X",b);
    s += h;
    if ((i&15)==15) s+=' ';
  }
  s += "\" }";
  return s;
}

// ================== SETUP / LOOP ==================
void setup(){
  Serial.begin(115200);
  delay(200);
  Serial.println();
  Serial.println("[BOOT] Séquence: Wi-Fi → Web → (UART LD2410C après IP + délai)");

  pinMode(LD_OUT_PIN, INPUT_PULLDOWN);

  wifi_mgr::begin(WIFI_SSID, WIFI_PASS, HOSTNAME, USE_LOWER_TX_POWER);
  wifi_mgr::smartConnect(true);
  if (WiFi.status()!=WL_CONNECTED) Serial.println("[WiFi] En attente d’IP via events…");
}

void loop(){
  if (g.needWebStart && !web_ui::started()){
    g.needWebStart = false;
    //web_ui::begin(nullptr, buildStatusJson, buildDumpJson);
    web_ui::begin_default(buildStatusJson, buildDumpJson);
  }

  if (g.wifiConnected) startUartIfNeeded();

  web_ui::handle();
  serviceLD2410();

  static unsigned long lastHeartbeat=0;
  unsigned long now = millis();
  if (now - lastHeartbeat > HEARTBEAT_MS){
    lastHeartbeat = now;
    bool outPin = digitalRead(LD_OUT_PIN);
    const char* stxt = (g.ld_moving||g.ld_static)?(g.ld_moving&&g.ld_static?"both":(g.ld_moving?"moving":"static")):(g.ld_present?"present":"none");
    Serial.printf("[HB] WiFi=%d IP=%s | UART=%d bytes=%lu frames=%lu | OUT=%d state:%s mov=%ucm(e%u) stat=%ucm(e%u) tgt=%ucm\n",
      g.wifiConnected, g.wifiConnected?WiFi.localIP().toString().c_str():"—",
      (uart_begun ? 1 : 0), (unsigned long)g.ld_bytes, (unsigned long)g.ld_frames,
      outPin?1:0, stxt,
      (unsigned)g.ld_move_cm, (unsigned)g.ld_move_energy,
      (unsigned)g.ld_stat_cm, (unsigned)g.ld_stat_energy,
      (unsigned)g.ld_target_cm
    );
  }

  wifi_mgr::watchdog(WIFI_WATCHDOG_MS);
  delay(2);
}
// ================== END OF FILE ==================

#include "globals.h"
#include "config.h"
#include "math.h"
#include "utils.h"

// -------- Goertzel (détection fréquentielle par bandes) --------
struct GoertzelState { float s1 = 0.0f; float s2 = 0.0f; float coeff = 0.0f; };
static const float GOERTZEL_FREQS[NUM_FFT_BANDS] PROGMEM = {125.0f, 250.0f, 500.0f, 1000.0f, 2000.0f, 4000.0f, 8000.0f, 16000.0f};
static GoertzelState s_gStates[NUM_FFT_BANDS];
static float s_fftBandsEwma[NUM_FFT_BANDS] = {0.0f};

void initGoertzel() {
  for (int b = 0; b < NUM_FFT_BANDS; b++) {
    float w = 2.0f * (float)M_PI * pgm_read_float(&GOERTZEL_FREQS[b]) / (float)I2S_SAMPLE_RATE;
    s_gStates[b].coeff = 2.0f * cosf(w);
    s_gStates[b].s1 = 0.0f;
    s_gStates[b].s2 = 0.0f;
  }
}

void startI2S() {
  i2s_config_t cfg = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = I2S_SAMPLE_RATE,
    .bits_per_sample = I2S_BITS,
    .channel_format = I2S_CHANNEL_CFG,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = 0,
    .dma_buf_count = 6,
    .dma_buf_len = 512,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
  };
  i2s_pin_config_t pins = {
    .bck_io_num = I2S_BCLK_PIN,
    .ws_io_num  = I2S_LRCK_PIN,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_DIN_PIN
  };
  i2s_driver_install(I2S_NUM_0, &cfg, 0, NULL);
  i2s_set_pin(I2S_NUM_0, &pins);
  i2s_set_clk(I2S_NUM_0, I2S_SAMPLE_RATE, I2S_BITS, I2S_CHANNEL_MONO);
}

static inline void pushBucket(uint8_t pct, double db) {
  g_soundPct = pct;
  g_soundLevel = (uint16_t)round(pct * 40.95);

  g_ewmaPct  = (1.0f - EWMA_ALPHA_PCT) * g_ewmaPct  + EWMA_ALPHA_PCT * (float)pct;
  g_ewmaDbfs = (1.0f - EWMA_ALPHA_DB)  * g_ewmaDbfs + EWMA_ALPHA_DB  * (float)db;

  g_curSumPct += pct;
  g_curSumDb  += db;
  g_curCount  += 1;
  if (pct < g_curMinPct) g_curMinPct = pct;
  if (pct > g_curMaxPct) g_curMaxPct = pct;
}

void recomputeWindowStats() {
  uint32_t totalSum=0,totalCnt=0; uint8_t wmin=255,wmax=0; float totalDb=0.0f;
  for (int i=0;i<SND_AVG_SECONDS;i++) {
    if (g_ring[i].count==0) continue;
    totalSum += g_ring[i].sumPct;
    totalCnt += g_ring[i].count;
    if (g_ring[i].minPct < wmin) wmin = g_ring[i].minPct;
    if (g_ring[i].maxPct > wmax) wmax = g_ring[i].maxPct;
    totalDb += g_ring[i].sumDb;
  }
  if (totalCnt>0) {
    g_soundPctAvg = quantizePct((uint8_t)round((float)totalSum / (float)totalCnt));
    g_dbfsAvg = totalDb / (float)totalCnt;
    g_soundPctMin = (wmin==255)?0:wmin;
    g_soundPctMax = wmax;
  } else {
    g_soundPctAvg = 0; g_dbfsAvg = -90.0; g_soundPctMin = 0; g_soundPctMax = 0;
  }
}

void audioService() {
  if (g_winStart == 0) g_winStart = millis();

  static int32_t buf[512];
  // Accumulateurs de fenêtre en float — ESP32-C3 RISC-V a un FPU hardware float
  // mais PAS double → double en software = 10-20x plus lent
  static float  s_sumSquares  = 0.0f;
  static size_t s_sampleCount = 0;

  size_t nbytes = 0;
  i2s_read(I2S_NUM_0, buf, sizeof(buf), &nbytes, pdMS_TO_TICKS(20));
  if (nbytes > 0) {
    size_t n = nbytes / sizeof(buf[0]);
    for (size_t i = 0; i < n; i++) {
      int32_t s32 = buf[i];
      int16_t s16 = s32 >> 14;
      float fnorm = (float)s16 / 32768.0f;
      s_sumSquares += fnorm * fnorm;
      for (int b = 0; b < NUM_FFT_BANDS; b++) {
        float s0 = fnorm + s_gStates[b].coeff * s_gStates[b].s1 - s_gStates[b].s2;
        s_gStates[b].s2 = s_gStates[b].s1;
        s_gStates[b].s1 = s0;
      }
    }
    s_sampleCount += n;

    if (millis() - g_winStart >= SAMPLE_WINDOW_MS) {
      const float NOISE_FLOOR_DBFS = -65.0f;
      const float NOISE_DEADBAND_DB = 2.0f;
      float rms = sqrtf(s_sumSquares / (float)max((size_t)1, s_sampleCount));
      float db  = 20.0f * log10f(rms + 1e-9f);

      uint8_t pct = 0;
      if (db <= NOISE_FLOOR_DBFS + NOISE_DEADBAND_DB) pct = 0;
      else {
        if (db > DBFS_MAX) db = DBFS_MAX;
        float pctf = (float)((db - NOISE_FLOOR_DBFS) * 100.0 / (DBFS_MAX - NOISE_FLOOR_DBFS));
        if (pctf < 0) pctf = 0; if (pctf > 100) pctf = 100;
        pct = (uint8_t)round(pctf);
      }
      pushBucket(pct, db);

      // Calcul magnitude Goertzel → bandes fréquentielles
      for (int b = 0; b < NUM_FFT_BANDS; b++) {
        float power = fmaxf(0.0f,
                        s_gStates[b].s1 * s_gStates[b].s1
                      + s_gStates[b].s2 * s_gStates[b].s2
                      - s_gStates[b].coeff * s_gStates[b].s1 * s_gStates[b].s2);
        float mag = sqrtf(power);
        float magN = (s_sampleCount > 0) ? (2.0f * mag / (float)s_sampleCount) : 0.0f;
        float gdb = 20.0f * log10f(magN + 1e-9f);
        float gpct = (gdb - NOISE_FLOOR_DBFS) / (-NOISE_FLOOR_DBFS) * 100.0f;
        if (gpct < 0.0f) gpct = 0.0f;
        if (gpct > 100.0f) gpct = 100.0f;
        s_fftBandsEwma[b] = (1.0f - FFT_EWMA_ALPHA) * s_fftBandsEwma[b] + FFT_EWMA_ALPHA * gpct;
        g_fftBands[b] = (uint8_t)s_fftBandsEwma[b];
        s_gStates[b].s1 = 0.0f;
        s_gStates[b].s2 = 0.0f;
      }

      // Réinitialise les accumulateurs pour la prochaine fenêtre
      s_sumSquares  = 0.0;
      s_sampleCount = 0;
      g_winStart    = millis();
    }
  }

  unsigned long now = millis();
  if (now - g_curBucketStart >= 1000UL) {
    g_ring[g_ringIndex].sumPct = g_curSumPct;
    g_ring[g_ringIndex].sumDb  = g_curSumDb;
    g_ring[g_ringIndex].count  = g_curCount;
    g_ring[g_ringIndex].minPct = (g_curMinPct==255)?0:g_curMinPct;
    g_ring[g_ringIndex].maxPct = g_curMaxPct;

    g_ringIndex = (g_ringIndex + 1) % SND_AVG_SECONDS;
    g_ring[g_ringIndex] = SndBucket();

    g_curSumPct=0; g_curCount=0; g_curMinPct=255; g_curMaxPct=0; g_curSumDb=0.0;
    g_curBucketStart = now;
    recomputeWindowStats();

    // Historique 60s : niveau global, dBFS et fréquence significative la plus haute
    // On cherche la bande la plus haute au-dessus du seuil (10/100) pour éviter
    // que le bruit de fond haute fréquence (hiss, électronique) biaise la mesure.
    g_history60[g_hist60Idx] = g_soundPctAvg;
    g_histDB60[g_hist60Idx]  = (int8_t)((int)round(g_dbfsAvg));
    uint8_t highBand = 0;
    for (int b = NUM_FFT_BANDS - 1; b >= 1; b--) {
      if (g_fftBands[b] > 10) { highBand = b; break; }
    }
    g_histPeakFreq60[g_hist60Idx] = highBand;
    g_hist60Idx = (g_hist60Idx + 1) % HIST60_SIZE;
  }
}

#pragma once
#include <Arduino.h>

struct AppState {
  // Wi-Fi
  bool wifiConnected = false;
  int  wifiLastReason = -1;
  uint8_t wifiConsecutiveFails = 0;
  String chosenBssid;
  int chosenChannel = 0;
  unsigned long gotIpAt = 0;

  // Web
  bool webStarted = false;

  // Flags orchestration
  bool needWebStart = false;
  bool wantUartStart = false;

  // LD2410C
  bool     ld_present=false, ld_moving=false, ld_static=false;
  uint16_t ld_move_cm=0, ld_stat_cm=0, ld_target_cm=0;
  uint8_t  ld_move_energy=0, ld_stat_energy=0;
  uint32_t ld_frames=0, ld_bytes=0, ld_last_ok_ms=0;

  // --- Calibration & filtrage LD2410C ---
  float   cal_stat_base_cm = 0.f;     // offset (cm) mesuré à l'arrêt, soustrait à la distance statique
  uint8_t cal_floor_move = 0;         // niveau d'énergie "idle" pour le mouvement (bruit de fond)
  uint8_t cal_floor_stat = 0;         // idem énergie statique
  bool    cal_active = false;         // vrai quand la base est connue
  uint32_t cal_last_idle_ms = 0;      // dernière période "idle"
  uint32_t last_presence_ms = 0;      // dernière détection de présence (pour hystérésis)

  // Distances corrigées (affichage/UI), tout en gardant les brutes existantes
  uint16_t ld_stat_cm_corr = 0;
  uint16_t ld_move_cm_corr = 0;
  uint16_t ld_target_cm_corr = 0;

  // Distances d’affichage (corrigées OU brutes en fallback si correction tombe à 0)
  volatile uint16_t ld_stat_cm_disp;
  volatile uint16_t ld_move_cm_disp;
  volatile uint16_t ld_target_cm_disp;


  // Présence filtrée par énergie (en plus de ld_present d'origine)
  bool     ld_present_f = false;
};

extern AppState g;

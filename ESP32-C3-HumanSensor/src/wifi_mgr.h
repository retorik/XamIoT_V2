#pragma once
#include <Arduino.h>

namespace wifi_mgr {
  void begin(const char* ssid, const char* pass, const char* hostname, bool lowerTxPower);
  void smartConnect(bool lockBssid);
  void watchdog(uint32_t intervalMs);
  const char* reasonToText(int r);
}

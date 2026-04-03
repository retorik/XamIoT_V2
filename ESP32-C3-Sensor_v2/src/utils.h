#pragma once
#include <Arduino.h>
#include "config.h"

String macToId(uint64_t mac);
void blinkConfirm(uint8_t n);

// Inline = identique fonctionnel, accessible partout
static inline uint8_t quantizePct(uint8_t v) {
  const uint8_t step = QUANTIZE_STEP_PCT;
  if (step <= 1) return v;
  int q = ((int)v + step / 2) / step;
  q *= step;
  if (q > 100) q = 100;
  if (q < 0)   q = 0;
  return (uint8_t)q;
}

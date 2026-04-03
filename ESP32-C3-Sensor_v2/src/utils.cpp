#include "utils.h"

String macToId(uint64_t mac) {
  char id[17];
  snprintf(id, sizeof(id), "%08X%08X",
           (uint32_t)(mac >> 32), (uint32_t)(mac & 0xFFFFFFFF));
  return String(id).substring(4);
}

void blinkConfirm(uint8_t n) {
  pinMode(LED_PIN, OUTPUT);
#if LED_ACTIVE_LOW
  for (uint8_t i=0;i<n;i++){ digitalWrite(LED_PIN, LOW); delay(120); digitalWrite(LED_PIN, HIGH); delay(120); }
#else
  for (uint8_t i=0;i<n;i++){ digitalWrite(LED_PIN, HIGH); delay(120); digitalWrite(LED_PIN, LOW); delay(120); }
#endif
}

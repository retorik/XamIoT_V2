#pragma once
#include <Arduino.h>

void mqttApplyServerFromSettings();
void startMQTT();
void mqttPublishDiscovery();
void mqttReconnectIfNeeded();
void mqttOnMessage(char* topic, byte* payload, unsigned int len);
void mqttPublishStatus(bool force=false);
void mqttLoop();


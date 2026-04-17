#pragma once
#include <Arduino.h>

namespace web_ui {

  // Builders optionnels si tu veux fournir ta propre page/JSON
  using HtmlBuilder = String (*)();
  using JsonBuilder = String (*)();

  // Démarre le serveur web avec une page fournie par l’appelant
  void begin(HtmlBuilder html, JsonBuilder status, JsonBuilder dump);

  // Démarre le serveur web avec une page HTML par défaut (incluse ici)
  void begin_default(JsonBuilder status, JsonBuilder dump);

  // Boucle serveur
  void handle();

  // Etat
  bool started();
}

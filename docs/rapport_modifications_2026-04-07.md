# Rapport des modifications — 2026-04-07

Modèle : Claude Sonnet 4.6  
Commit : `d5f5a2f`

---

## 1. Android — Mise à jour compileSdk 34 → 35 (exigence Google Play)

**Fichiers modifiés :**
- `XamIoT_Android_v2/app/build.gradle.kts`
- `XamIoT_Android_v2/build.gradle.kts`

**Changements :**
- `compileSdk` : 34 → 35
- Plugin Hilt root : `2.48.1` → `2.51.1` (alignement obligatoire avec la dépendance app)
- Dépendances mises à jour : core-ktx 1.16.0, appcompat 1.7.1, material 1.12.0, constraintlayout 2.2.1, lifecycle 2.8.7, navigation 2.8.9, hilt 2.51.1, coroutines 1.8.1, firebase-bom 33.12.0, junit ext 1.2.1, espresso 3.6.1
- Retrofit/OkHttp conservés à 2.9.0/4.12.0 (breaking changes de migration majeure)

---

## 2. Android — BleProvisioningManager : fix addFirst/addLast (SDK 35)

**Fichier modifié :** `XamIoT_Android_v2/app/src/main/java/com/xamiot/soundsense/ble/BleProvisioningManager.kt`

**Cause :** avec `compileSdk=35`, l'exposition des APIs Java 21 crée une ambiguïté de résolution sur `ArrayDeque` entre `kotlin.collections.ArrayDeque` (qui n'a pas `addFirst`/`addLast`) et `java.util.ArrayDeque` (qui les a). Le compilateur ne peut pas trancher → erreur de build.

**Corrections (4 occurrences) :**
```kotlin
readQueue.addLast(c)          → readQueue.add(c)
readQueue.addFirst(next)      → readQueue.add(0, next)
writeQueue.addLast(...)       → writeQueue.add(...)
writeQueue.addFirst(next)     → writeQueue.add(0, next)
```

`add()` et `add(0, x)` sont des opérations `MutableList` standard qui fonctionnent quel que soit le `ArrayDeque` résolu.

---

## 3. Android — EnrollDeviceActivity : grande zone noire en haut

**Fichier modifié :** `XamIoT_Android_v2/app/src/main/res/layout/activity_enroll_device.xml`

**Cause :** `android:fitsSystemWindows="true"` sur le `MaterialToolbar` ajoutait un padding égal à la hauteur de la status bar, en plus du `android:paddingTop="24dp"` déjà présent. Le `ConstraintLayout` racine ne s'étend pas derrière la status bar, donc ce double padding créait une grande zone noire vide.

**Correction :** suppression de `android:fitsSystemWindows="true"` du `MaterialToolbar`.

---

## 4. Android — EnrollDeviceActivity : clavier masquant le champ "Nom du périphérique"

**Fichiers modifiés :**
- `XamIoT_Android_v2/app/src/main/AndroidManifest.xml`
- `XamIoT_Android_v2/app/src/main/res/layout/activity_enroll_device.xml`
- `XamIoT_Android_v2/app/src/main/java/com/xamiot/soundsense/ui/enroll/EnrollDeviceActivity.kt`

**Cause :** sur Android 15 avec `targetSdk=35`, l'edge-to-edge est imposé par défaut. `windowSoftInputMode="adjustResize"` (dans le Manifest) est ignoré pour les apps edge-to-edge — le clavier recouvre le contenu sans que la fenêtre soit redimensionnée.

**Corrections :**
1. `ScrollView` → `androidx.core.widget.NestedScrollView` (id `enrollScrollView`) dans le layout
2. Ajout d'un `android:clipToPadding="false"` sur le `NestedScrollView`
3. Dans `EnrollDeviceActivity.onCreate()`, listener IME insets :

```kotlin
val scrollView = findViewById<NestedScrollView>(R.id.enrollScrollView)
ViewCompat.setOnApplyWindowInsetsListener(scrollView) { view, insets ->
    val imeBottom = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
    val navBottom = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom
    view.setPadding(view.paddingLeft, view.paddingTop, view.paddingRight, maxOf(imeBottom, navBottom))
    insets
}
```

Le padding bas du scroll est ajusté dynamiquement à la hauteur du clavier quand il s'ouvre.

---

## 5. Android — RuleCreateBottomSheet : spinner opérateur invisible

**Fichier modifié :** `XamIoT_Android_v2/app/src/main/java/com/xamiot/soundsense/ui/devicedetail/RuleCreateBottomSheet.kt`

**Cause :** l'adapter du spinner utilisait `android.R.layout.simple_spinner_item` (texte noir sur fond clair) sur un fond sombre (`#1F1F1F`). Le texte des items était invisible.

**Correction (2 endroits — `onViewCreated` et `applyTemplate`) :**
```kotlin
// Avant
ArrayAdapter(ctx, android.R.layout.simple_spinner_item, items)
adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)

// Après
ArrayAdapter(ctx, R.layout.item_spinner_device, items)
adapter.setDropDownViewResource(R.layout.item_spinner_device_dropdown)
```

`item_spinner_device` et `item_spinner_device_dropdown` sont des layouts existants dans l'app avec texte blanc.

---

## 6. Android — sheet_rule_create.xml : champ "Nom de l'alerte" invisible

**Fichier modifié :** `XamIoT_Android_v2/app/src/main/res/layout/sheet_rule_create.xml`

**Cause :** `style="@style/Widget.MaterialComponents.TextInputLayout.OutlinedBox"` ignorait `app:boxBackgroundColor` — cet attribut ne fonctionne qu'en mode `filled`. Le fond du champ était transparent/blanc, invisible sur fond sombre.

**Correction :** suppression du `style` OutlinedBox, passage en `app:boxBackgroundMode="filled"` avec couleurs explicites :
```xml
app:boxBackgroundMode="filled"
app:boxBackgroundColor="#1E1E1E"
app:boxStrokeColor="#333333"
app:hintTextColor="#999999"
```

---

## 7. Site web — langchange event sur /compte et /panier

**Fichiers modifiés :**
- `XamIoT_Site_v2/components/LangSelector.tsx`
- `XamIoT_Site_v2/app/compte/page.tsx`
- `XamIoT_Site_v2/app/panier/page.tsx`

**Cause :** `router.refresh()` ne re-render que les server components. Les pages `/compte` et `/panier` (client components) ne se mettaient pas à jour en changeant de langue.

**Correction :** `LangSelector.tsx` dispatch un event `langchange` avant `router.refresh()`. Les pages écoutent cet event et appellent `setLang(readLang())`.

---

## 8. Admin backoffice — DeepL : "Traduction en cours" jamais terminée

**Fichier modifié :** `xamiot-admin-suite_v2/admin-ui/src/pages/PageEditor.jsx`

**Cause :** l'API DeepL retourne `{ ok: true, results: {} }` sans champ `message`. Le code affichait `result.message || 'Traduction en cours…'` — la condition tombait toujours sur le fallback "en cours". Les éditeurs TipTap n'étaient pas mis à jour non plus.

**Correction :**
- Suppression du check `result.message`
- Re-fetch de la page après traduction → mise à jour du state `translations`
- Message hardcodé `'Traduction terminée.'` affiché en success

---

## 9. Admin backoffice — TipTap : `_blank` persistait après décochage

**Fichier modifié :** `xamiot-admin-suite_v2/admin-ui/src/pages/PageEditor.jsx`

**Cause :** `editor.setLink({ target: null })` fusionne les attributs sans effacer l'attribut `target` existant. Un `unsetLink().setLink()` écrasait la sélection. 

**Correction :** passage de `target: '_self'` explicitement quand la case est décochée :
```jsx
editor.chain().focus().extendMarkRange('link')
  .setLink({ href, target: newTab ? '_blank' : '_self' })
  .run();
```

---

## 10. CLAUDE.md global — documentation SSH VPS et traçabilité docs/

**Fichier modifié :** `~/.claude/CLAUDE.md` (global)

- Ajout tableau SSH : VPS Dev (`192.168.1.6` / `holiceo.com`) et VPS Prod (`ecrimoi.com`)
- Précision : VPS Dev accessible via `holiceo.com` depuis l'extérieur (port 443), autres ports à préciser explicitement
- Ajout section "Traçabilité des modifications — fichiers docs/" avec sous-dossiers : `audits/`, `rapports/`, `migrations/`, `decisions/`

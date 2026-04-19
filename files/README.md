# Tensio — Vérnyomás napló (PWA)

Offline működő, telepíthető Android PWA otthoni vérnyomás-monitorozáshoz.

## Funkciók

- **Mérés rögzítése**: szisztolés / diasztolés / pulzus + időbélyeg
- **Áttekintés**: mai átlag, kategorizálás (ESH 2023), 7/30 napos átlagok, pulzusnyomás, MAP
- **Trend grafikon**: 7/30/90 napos időablakkal, szisztolés + diasztolés vonal
- **Reggeli vs. esti összehasonlítás**: oszlopdiagram + automatikus értelmezés (pl. reggeli felugrás észlelése)
- **Emlékeztetők**: napi kétszer (reggel/este), konfigurálható időpontokkal
- **Export**: JSON és CSV
- **100% offline / helyi**: adatok csak az eszközön, IndexedDB-ben

## Telepítés és futtatás

A PWA-knak HTTPS-en kell futniuk ahhoz, hogy az értesítések és a service worker működjön (a `localhost` kivétel).

### 1. Helyi tesztelés gépen
```bash
cd bp-app
python3 -m http.server 8080
```
Majd nyisd meg: `http://localhost:8080`

### 2. Tesztelés Android telefonon (ugyanazon Wi-Fi hálózaton)
A fenti szerver elindítása után:
```bash
# A gép IP címének megkeresése:
hostname -I      # Linux
ipconfig         # Windows
```
Android Chrome-ban: `http://<gép-ip>:8080`
> Figyelem: HTTP-n az értesítési és install promtok korlátozottak lehetnek. Az igazi teszthez telepítsd egy statikus tárhelyre (ld. lent).

### 3. Publikálás HTTPS-re (ajánlott az emlékeztetőkhöz)

Bármelyik ingyenes opció működik:
- **GitHub Pages** — tölts fel egy repo-ba, kapcsold be a Pages-t
- **Netlify Drop** — húzd rá a `bp-app` mappát a [netlify.com/drop](https://app.netlify.com/drop) oldalra
- **Cloudflare Pages**, **Vercel**, **Firebase Hosting** — mind működik

A feltöltés után nyisd meg a kapott HTTPS URL-t Android Chrome-ban, majd a menüből: **„Hozzáadás a kezdőképernyőhöz"** → a Tensio innentől natív alkalmazásként viselkedik.

## Emlékeztetők működése

- Az emlékeztetők akkor jelennek meg, ha az alkalmazás épp fut, vagy a service worker aktív a háttérben. A modern Android Chrome ezt általában rövid ideig fenntartja a telepített PWA-k számára.
- **Megbízhatóbb háttér-emlékeztető** csak natív (Capacitor/TWA) buildben lenne lehetséges — a tiszta PWA a böngésző életciklusától függ.
- Ha az adott napi idősávban (reggel 4–12, este 17–24) már rögzítettél mérést, az emlékeztető nem jelenik meg.

## Fájlok

```
bp-app/
├── index.html              # App shell, nézetek
├── styles.css              # Editorial-medical stílus (Fraunces + Inter Tight)
├── app.js                  # IndexedDB, kategorizálás, grafikonok, emlékeztetők
├── sw.js                   # Service worker (offline cache)
├── manifest.webmanifest    # PWA manifest
├── icon.svg                # Forrás ikon
├── icon-192.png            # Kis ikon
├── icon-512.png            # Nagy ikon
└── icon-maskable-512.png   # Android adaptív ikon
```

## Kategóriahatárok (ESH 2023, otthoni mérésre kalibrálva)

| Kategória | Szisztolés | Diasztolés |
|-----------|-----------|-----------|
| Alacsony | < 90 | vagy < 60 |
| Optimális | < 120 | és < 80 |
| Normális | 120–129 | vagy 80–84 |
| Magas-normál | 130–139 | vagy 85–89 |
| I. fokú | 140–159 | vagy 90–99 |
| II. fokú | 160–179 | vagy 100–109 |
| III. fokú | ≥ 180 | vagy ≥ 110 |

A kategória az aktuális érték, illetve az utolsó 7 nap átlaga alapján kerül meghatározásra (a rosszabbik kategóriát véve).

## Fontos

Ez az alkalmazás segíti a mérések követését, **de nem helyettesíti az orvosi vizsgálatot**. Rendellenes értékek, tünetek (mellkasi fájdalom, látászavar, erős fejfájás, szédülés) esetén fordulj orvoshoz.

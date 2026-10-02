# Parqet Portfolio & Dividend Tracker

Moderne Web-Anwendung zur Visualisierung und Analyse von Finanz-Assets. Das Projekt stellt Portfolio-Metriken (die u. a. sonst nur mit Parqet Plus erhältlich sind) mithilfe von React und Recharts übersichtlich dar.

## Features

- **Interaktive Datenvisualisierung:** Dynamische Charts (Donut-Chart für Asset-Holdings und Auswertungen zu Dividendendaten)
- **Parqet API Integration:** Nahtlose Anbindung zur Abfrage und Weiterverarbeitung von Portfoliodaten
- **Moderne Frontend-Architektur:** Komponentenbasierte Struktur in React für hohe Wiederverwendbarkeit und Performance
- **State Management:** Effiziente Verwaltung von Finanz- und Nutzerdaten im Anwendungszustand

## Tech-Stack

- **Frontend:** React, JavaScript, CSS3
- **Visualisierung:** Recharts
- **API & Daten:** Parqet API, JSON, PostgreSQL (Supabase)

## Architektur & Funktionsweise

Da die Anwendung auf persönlichen Finanzdaten basiert, integriert sie sich direkt in das Parqet-Ökosystem:

1. **Authentifizierung & Datenabruf:** Die Anwendung kommuniziert mit der Schnittstelle, um Bestände und Transaktionen abzurufen.
2. **Daten-Transformation:** Rohe API-Daten werden in saubere Datenstrukturen transformiert, um sie performant in den UI-Komponenten darzustellen.
3. **Rendering:** Die aufbereiteten Kennzahlen werden über flexible Dashboard-Komponenten gerendert.

## Setup

```bash
# Repository klonen
git clone [https://github.com/1THGAMER1/dividend-dashboard.git](https://github.com/1THGAMER1/dividend-dashboard.git)

# In das Projektverzeichnis wechseln
cd dividend-dashboard

# Abhängigkeiten installieren
npm install
```

# Entwicklungsserver starten
``npm run dev``
(Öffne die Webanwendung unter http://localhost:5173)

_Hinweis: Für den vollen Funktionsumfang der Live-Daten ist ein entsprechender API-Zugang / Account bei Parqet erforderlich._

# Lizenz
Dieses Projekt ist für Demonstrationszwecke erstellt worden.
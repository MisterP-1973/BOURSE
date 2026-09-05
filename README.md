# 🤖 AI Stock Analyzer — BOURSE

> Votre conseiller boursier personnel propulsé par l'IA Gemini de Google.

![Python](https://img.shields.io/badge/Python-3.10%2B-blue?logo=python)
![Flask](https://img.shields.io/badge/Flask-3.0-lightgrey?logo=flask)
![yfinance](https://img.shields.io/badge/yfinance-1.5%2B-green)
![Gemini](https://img.shields.io/badge/Google%20Gemini-IA-orange?logo=google)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## ✨ Fonctionnalités

| Fonctionnalité | Description |
| 🎯 **Profil d'Investisseur & Stratégie Sur-Mesure** | Configuration du profil de risque (*Prudent, Équilibré, Dynamique, Agressif*), horizon (*Court, Moyen, Long terme*), objectif et seuil max par ligne |
| 📊 **Moteur d'Analyse Technique en Direct** | Calcul en temps réel du RSI (14j), Moyennes Mobiles (SMA 20, 50, 200), Momentum MACD, Volatilité ATR et Supports / Résistances |
| 🛡️ **Money Management & Niveaux Clés** | Niveaux chiffrés de Stop-Loss protecteur, Take-Profit / Cibles, Ratio Risque/Rendement (R:R) et alertes de surpondération |
| 🪙 **Support Complet Cryptomonnaies** | Suivi natif Bitcoin, Ethereum, Solana, Altcoins, gestion des fractions décimales et cotations directes |
| 💱 **Moteur Multi-Devises Réel (Forex)** | Conversion instantanée des positions en devise de référence (CHF, EUR, USD, GBP) via taux de change en direct |
| ⚡ **Performance & Cache Parallélisé** | Chargement instantané (< 1s) grâce aux threads parallèles et à la mise en cache mémoire (5 min) |
| 📈 **Graphiques Interactifs & Sparklines** | Mini-courbes de tendance 7j sur chaque actif et graphique historique interactif (1M, 6M, 1A, 5A) avec Chart.js |
| 🍩 **Allocation d'Actifs (Donut Chart)** | Visualisation de la répartition du portefeuille par symbole et classe d'actifs |
| 🤖 **Audit Global IA du Portefeuille** | Diagnostic complet Gemini confrontant l'allocation réelle au profil investisseur : score de diversification (0-100), analyse des risques et rééquilibrage |
| 🎯 **Analyse IA par Titre Fiabilisée** | Recommandation sur-mesure (ACHETER / CONSERVER / VENDRE) intégrant profil, technique, ratios financiers / on-chain et actualités |
| 💰 **Revenus & Dividendes Annuels** | Calcul automatique du cash flow annuel estimé en dividendes réels |
| 🖨️ **Impression PDF / A4** | Impression soignée de l'inventaire complet du portefeuille, de l'audit global IA et des analyses de titres |
| ⚡ **Recommandations Directes & Batch IA** | Consensus analystes Wall Street en direct et actualisation automatique de tous les avis IA en 1 clic |
| 🔍 **Recherche, Filtres & Tris Rapides** | Filtre instantané par texte, type d'actif (Action, ETF, Fonds, Crypto) et tri (Valeur, Plus-value %, Perf du jour) |
| 🛡️ **Sauvegarde & Restauration Complète** | Archives ZIP intégrales (Base SQLite `stocks.db` + `config.json` + Export JSON), snapshots de sécurité automatiques, gestionnaire local et scripts Windows (`backup.bat`, `restore.bat`) |
| 💾 **Import / Export CSV & JSON** | Sauvegarde locale complète et importation rapide de vos positions |
| 📱 **Vue Grille & Tableau Liste** | Deux modes d'affichage modernes glassmorphism avec mémorisation de vos préférences |

---

## 📸 Aperçu

> Interface dark glassmorphism avec gradient, cartes animées, analyse IA Markdown.

---

## 🛠️ Installation

### Prérequis

- Python 3.10+
- pip

### 1. Cloner le dépôt

```bash
git clone https://github.com/MisterP-1973/BOURSE.git
cd BOURSE
```

### 2. Créer un environnement virtuel

```bash
python -m venv venv
# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate
```

### 3. Installer les dépendances

```bash
pip install -r requirements.txt
```

### 4. Lancer l'application

**Sous Windows (rapide) :**
Double-cliquez sur `start.bat` ou exécutez dans le terminal :
```cmd
start.bat
```

**Ou manuellement :**
```bash
python app.py
```

Ouvrez votre navigateur sur **http://localhost:3000**

---

## 🛡️ Sauvegarde & Restauration

L'application offre une protection maximale contre les pertes de données :

- **Via l'interface Web (icône bouclier/sauvegarde) :**
  - **Sauvegarde Complète :** Téléchargez en 1 clic une archive `.zip` contenant votre base SQLite, votre configuration et un export JSON universel.
  - **Points de Restauration Locaux (Snapshots) :** Créez des points d'instantanés locaux sur votre machine dans le dossier `backups/`, téléchargez-les ou restaurez-les en 1 clic.
  - **Restauration Sécurisée :** Glissez-déposez une archive `.zip`, un fichier `.db` ou un fichier `.json`. Un snapshot de sécurité d'urgence (`pre_restore_safety_snapshot`) est créé automatiquement avant d'appliquer toute restauration.
- **En ligne de commande / scripts Windows :**
  - `backup.bat` : Crée immédiatement un point de sauvegarde `.zip` complet dans `backups/`.
  - `restore.bat` : Menu interactif pour sélectionner et restaurer un point de sauvegarde existant en toute sécurité.

---

## ⚙️ Configuration

### Clé API Gemini (pour l'analyse IA)

1. Rendez-vous sur [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Créez une clé API gratuite
3. Cliquez sur l'icône ⚙️ en haut à droite dans l'application
4. Collez votre clé et enregistrez

La clé est stockée localement dans `config.json` (non versionné).

---

## 📁 Structure du projet

```
BOURSE/
├── app.py                  # Application Flask (routes, modèles, sauvegarde/restauration)
├── requirements.txt        # Dépendances Python
├── start.bat               # Script de lancement rapide Windows
├── backup.bat              # Script de sauvegarde rapide Windows
├── restore.bat             # Script de restauration interactive Windows
├── .gitignore              # Exclusion des clés API, bases de données et sauvegardes
├── README.md               # Documentation générale
├── MANUEL.md               # Manuel utilisateur détaillé
├── backups/                # Dossier local des snapshots ZIP (non versionné)
├── static/
│   ├── css/
│   │   └── style.css       # Design glassmorphism dark & styles sauvegarde
│   └── js/
│       └── main.js         # Logique frontend (backup, restore, search, cartes, IA)
└── templates/
    └── index.html          # Template Jinja2 principal
```

---

## 🧰 Stack technique

| Composant | Technologie |
|---|---|
| Backend | Python / Flask 3.0 |
| Base de données | SQLite via Flask-SQLAlchemy |
| Données boursières & Forex | yfinance 1.5+ |
| IA | Google Gemini API (google-genai) |
| Frontend | HTML5 / Vanilla JS / Vanilla CSS |
| Visualisation & Graphiques | Chart.js 4.x (CDN) |
| Rendu Markdown | marked.js (CDN) |
| Icônes | Font Awesome 6 (CDN) |

---

## 📄 Licence

MIT — Libre d'utilisation, de modification et de distribution.

---

## 👤 Auteur

**Patrick Penco** — [@MisterP-1973](https://github.com/MisterP-1973)

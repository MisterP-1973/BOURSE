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
|---|---|
| 💱 **Moteur Multi-Devises Réel (Forex)** | Conversion instantanée des positions en devise de référence (CHF, EUR, USD, GBP) via taux de change en direct |
| ⚡ **Performance & Cache Parallélisé** | Chargement instantané (< 1s) grâce aux threads parallèles et à la mise en cache mémoire (5 min) |
| 📈 **Graphiques Interactifs & Sparklines** | Mini-courbes de tendance 7j sur chaque actif et graphique historique interactif (1M, 6M, 1A, 5A) avec Chart.js |
| 🍩 **Allocation d'Actifs (Donut Chart)** | Visualisation de la répartition du portefeuille par symbole et classe d'actifs |
| 🤖 **Audit Global IA du Portefeuille** | Diagnostic complet Gemini : score de diversification (0-100), analyse des risques, détection des doublons et rééquilibrage |
| 🎯 **Analyse IA par Titre Fiabilisée** | Recommandation structurée (ACHETER / CONSERVER / VENDRE) intégrant ratios financiers (PER, dividendes) et actualités |
| 💰 **Revenus & Dividendes Annuels** | Calcul automatique du cash flow annuel estimé en dividendes |
| 🔍 **Recherche, Filtres & Tris Rapides** | Filtre instantané par texte, type d'actif (Action, ETF, Fonds) et tri (Valeur, Plus-value %, Perf du jour) |
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

```bash
python app.py
```

Ouvrez votre navigateur sur **http://localhost:3000**

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
├── app.py                  # Application Flask (routes, modèles, logique)
├── requirements.txt        # Dépendances Python
├── .gitignore
├── README.md
├── MANUEL.md               # Manuel utilisateur détaillé
├── static/
│   ├── css/
│   │   └── style.css       # Design glassmorphism dark
│   └── js/
│       └── main.js         # Logique frontend (search, cartes, modals, IA)
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

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
| 📊 **Portefeuille en temps réel** | Cours boursiers live via Yahoo Finance (actions, ETF, fonds) |
| 🔍 **Recherche intelligente** | Autocomplète par nom ou ticker — trouve actions, ETF, fonds |
| ✏️ **Édition inline** | Modifiez quantité, PRU, devise sans supprimer la position |
| 🤖 **Analyse IA (Gemini)** | Analyse des actualités + recommandation : ACHETER / CONSERVER / VENDRE |
| 📱 **Vue grille / liste** | Deux modes d'affichage, mémorisés dans le navigateur |
| ⚠️ **Détection fonds illiquides** | Badge visuel quand le prix temps réel n'est pas disponible |
| 💾 **Persistance SQLite** | Base de données locale, aucun cloud requis |

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
| Données boursières | yfinance 1.5+ |
| IA | Google Gemini API (google-genai) |
| Frontend | HTML5 / Vanilla JS / Vanilla CSS |
| Rendu Markdown | marked.js (CDN) |
| Icônes | Font Awesome 6 (CDN) |

---

## 📄 Licence

MIT — Libre d'utilisation, de modification et de distribution.

---

## 👤 Auteur

**Patrick Penco** — [@MisterP-1973](https://github.com/MisterP-1973)

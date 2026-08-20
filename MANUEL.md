# 📖 Manuel Utilisateur — AI Stock Analyzer

Bienvenue dans **AI Stock Analyzer**, votre outil de suivi de portefeuille boursier avec analyse intelligente.

---

## 🚀 Démarrage rapide

1. Lancez l'application : `python app.py`
2. Ouvrez votre navigateur sur **http://localhost:3000**
3. Si c'est votre première utilisation, configurez votre clé API Gemini (voir section [Configuration IA](#configuration-ia))
4. Ajoutez votre première position via le formulaire en haut de page

---

## 📋 Sections de l'interface

### 1. Barre de navigation

| Élément | Description |
|---|---|
| 📈 Logo | Nom de l'application |
| ⚙️ Paramètres | Ouvre la fenêtre de configuration de la clé API Gemini |

---

### 2. Formulaire d'ajout d'une position

Situé en haut de la page principale.

#### Champs disponibles

| Champ | Description | Exemple |
|---|---|---|
| **Rechercher** | Tapez un nom ou ticker pour trouver automatiquement l'instrument | `Apple`, `AAPL`, `Lyxor` |
| **Code (Ticker)** | Rempli automatiquement par la recherche, ou manuellement | `AAPL`, `VWCE.DE` |
| **Nom** | Nom de la société ou du fonds | `Apple Inc.` |
| **Quantité** | Nombre de titres détenus (décimales acceptées) | `10`, `0.5` |
| **Prix d'achat (PRU)** | Prix unitaire moyen d'achat | `150.00` |
| **Devise** | USD, EUR, CHF ou GBP | `EUR` |
| **Date d'achat** | Optionnel — date d'acquisition | `2024-03-15` |

#### 💡 Astuce : La recherche intelligente

La barre de recherche interroge Yahoo Finance en temps réel :
- Tapez au moins **2 caractères** pour déclencher la recherche
- Un menu déroulant affiche les résultats avec le **type** de l'instrument :
  - 🟢 **Action** — action ordinaire
  - 🔵 **ETF** — fonds négocié en bourse
  - 🟣 **Fonds** — fonds commun de placement
  - 🟡 **Indice** — indice boursier
- Cliquez sur un résultat pour remplir automatiquement le ticker et le nom
- Naviguez avec les flèches ↑↓ et sélectionnez avec Entrée

---

### 3. Vue Portefeuille

Affiche toutes vos positions sous forme de **cartes**.

#### Basculer entre les vues

- **🔲 Vue Grille** (défaut) : cartes côte à côte
- **☰ Vue Liste** : cartes empilées verticalement

Votre préférence est mémorisée automatiquement.

#### Lecture d'une carte

```
┌────────────────────────────────────────┐
│  [AAPL]          180.50 USD           │
│  Apple Inc.      [CONSERVER]           │
├────────────────────────────────────────┤
│  QTE     : 10                          │
│  PRU     : 175.00 USD                  │
│  VALEUR  : 1 805.00 USD                │
│  PLUS-VALUE : +55.00 (+3.14%)         │
├────────────────────────────────────────┤
│ [✨ Analyser avec l'IA] [✏️] [🗑️]      │
└────────────────────────────────────────┘
```

| Zone | Description |
|---|---|
| **Ticker** | Code boursier de l'instrument |
| **Prix actuel** | Dernier cours connu (temps réel ou différé) |
| **Badge IA** | Recommandation de l'IA : ACHETER / CONSERVER / VENDRE |
| **QTE** | Quantité détenue |
| **PRU** | Prix de revient unitaire (prix d'achat moyen) |
| **VALEUR** | Valeur de marché actuelle (QTE × cours actuel) |
| **PLUS-VALUE** | Gain/perte en valeur et en pourcentage |

#### Badge ⚠️ PRU

Apparaît quand le cours temps réel **n'est pas disponible** sur Yahoo Finance (fonds non cotés, instruments non reconnus). La valeur affichée correspond au prix d'achat.

---

### 4. Modifier une position ✏️

Cliquez sur le bouton **✏️** (stylo) sur une carte pour modifier les informations sans supprimer la position.

**Champs modifiables :**
- Code (ticker), Nom, Quantité, PRU, Devise, Date d'achat

> ⚠️ Si vous modifiez le **symbole**, la recommandation IA précédente est réinitialisée car elle n'est plus valide pour le nouveau titre.

---

### 5. Analyse IA 🤖

Cliquez sur **✨ Analyser avec l'IA** pour obtenir une analyse personnalisée.

#### Ce que fait l'IA

1. Récupère les **5 dernières actualités** du titre via Yahoo Finance
2. Calcule la **performance latente** (plus-value actuelle)
3. Soumet tout cela à **Google Gemini** pour analyse
4. Retourne une analyse en français avec une recommandation finale :
   - **ACHETER DAVANTAGE** — le potentiel semble intéressant
   - **CONSERVER** — position à maintenir
   - **VENDRE** — risque identifié ou objectif atteint

#### Prérequis

Une **clé API Google Gemini** est nécessaire (gratuite). Voir [Configuration IA](#configuration-ia).

---

### 6. Supprimer une position 🗑️

Cliquez sur le bouton **rouge 🗑️** sur la carte. Une confirmation est demandée avant suppression.

---

## ⚙️ Configuration IA

### Obtenir une clé API Gemini gratuite

1. Allez sur [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Connectez-vous avec votre compte Google
3. Cliquez sur **"Create API Key"**
4. Copiez la clé générée (commence par `AIza...`)

### Saisir la clé dans l'application

1. Cliquez sur l'icône ⚙️ en haut à droite
2. Collez votre clé dans le champ **"Clé API Google Gemini"**
3. Cliquez sur **"Enregistrer la clé"**

La clé est stockée dans `config.json` localement sur votre machine et n'est **jamais transmise** ailleurs qu'à Google.

---

## 🔧 Résolution des problèmes

### Le cours d'un titre affiche ⚠️ PRU

Le symbole n'est pas reconnu par Yahoo Finance. Solutions :
- Utilisez la **recherche intelligente** pour trouver le bon code ticker Yahoo
- Certains fonds gérés (OPCVM, fonds de pension) ne sont pas disponibles sur Yahoo Finance

### L'analyse IA retourne une erreur

| Message | Solution |
|---|---|
| `API Key not configured` | Configurez votre clé Gemini dans les paramètres ⚙️ |
| `Erreur avec l'API IA` | Vérifiez que votre clé est valide et que vous avez accès à internet |
| `Erreur réseau` | Redémarrez le serveur Flask |

### Le portefeuille met longtemps à charger

Normal si vous avez des titres non reconnus — yfinance tente plusieurs méthodes avant de déclarer le cours indisponible. Corriger les symboles via l'édition ✏️ accélèrera le chargement.

---

## 📊 Formats de symboles par place boursière

| Place | Suffixe | Exemple |
|---|---|---|
| NYSE / NASDAQ (USA) | *(aucun)* | `AAPL`, `MSFT` |
| Euronext Paris | `.PA` | `AIR.PA` (Airbus) |
| XETRA (Allemagne) | `.DE` | `VWCE.DE` |
| SIX (Suisse) | `.SW` | `NESN.SW` (Nestlé) |
| London Stock Exchange | `.L` | `SHEL.L` (Shell) |
| Euronext Amsterdam | `.AS` | `ASML.AS` |

---

## 📝 Notes importantes

- Les cours sont **différés** d'environ 15 minutes selon les places
- La valorisation totale est affichée en CHF à titre indicatif (conversion non effectuée)
- La base de données (`instance/stocks.db`) est locale — **aucune donnée n'est transmise** à des serveurs tiers (sauf Google pour l'IA et Yahoo Finance pour les cours)

---

*Manuel rédigé pour AI Stock Analyzer v1.0 — Août 2026*

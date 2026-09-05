# 📖 Manuel Utilisateur — AI Stock Analyzer

Bienvenue dans **AI Stock Analyzer**, votre plateforme complète de suivi de portefeuille boursier, d'analyse financière et de conseil stratégique propulsée par l'intelligence artificielle Google Gemini.

---

## 🚀 Démarrage rapide

1. Lancez l'application dans votre terminal :
   ```powershell
   .\venv\Scripts\activate
   python app.py
   ```
2. Ouvrez votre navigateur sur **http://localhost:3000**
3. Configurez votre clé API Gemini via l'icône ⚙️ si ce n'est pas déjà fait.
4. Ajoutez vos positions ou importez un fichier CSV/JSON pour commencer le suivi.

---

## 📋 Présentation des Fonctionnalités & de l'Interface

### 1. Barre de navigation & Paramètres globaux

| Élément | Description |
|---|---|
| 📈 **Logo & Titre** | Identité de l'application et statut en direct |
| 💱 **Sélecteur de Devise** | Choisissez votre devise de référence (**CHF, EUR, USD, GBP**). Tous les totaux, plus-values et dividendes sont automatiquement convertis en temps réel. |
| 🔄 **Bouton Rafraîchir** | Force la mise à jour des cours et des taux de change. |
| 🪄 **Audit Global IA** | Déclenche un audit stratégique de l'ensemble de votre portefeuille par Gemini. |
| 📁 **Import / Export** | Téléchargez vos positions en **CSV** / **JSON** ou importez un fichier de sauvegarde. |
| ⚙️ **Paramètres** | Configuration de la clé API Google Gemini et de la devise de référence par défaut. |

---

### 2. Tableau de Bord & Indicateurs Clés (KPIs)

En haut de page, 4 cartes synthétisent la santé de vos investissements convertis dans votre devise de référence :

1. **Valorisation Totale** : Valeur actuelle globale du portefeuille + montant total investi.
2. **Plus/Moins-Value Latente** : Gain ou perte net en montant et en pourcentage (vert si positif, rouge si négatif).
3. **Variation du Jour** : Performance journalière (Day Gain) réalisée sur la dernière séance de bourse.
4. **Dividendes Annuels Estimés** : Estimation des revenus passifs annuels réels générés par vos positions.

---

### 3. Répartition & Allocation d'Actifs (Donut Chart)

Cliquez sur le bandeau **"Répartition & Allocation d'Actifs"** pour dérouler le graphique interactif :
- **Graphique en Donut (Chart.js)** : Visualisation du poids de chaque actif dans votre portefeuille.
- **Légende détaillée** : Pourcentage exact et répartition visuelle par couleur.

---

### 4. Formulaire d'Ajout d'une Position

Ajoutez une action, un ETF, un fonds ou une **cryptomonnaie** en quelques secondes :

* **Recherche dynamique** : Tapez un nom ou un ticker (ex: *Bitcoin, BTC, Ethereum, SOL, Apple, AAPL, MC.PA...*) pour autocompléter instantanément le ticker, le nom, le type d'actif et la devise de cotation.
* **Support Cryptomonnaies** : Saisie par symbole court (*BTC, ETH, SOL, XRP, DOGE*) ou paire Yahoo Finance (*BTC-USD, ETH-EUR, SOL-USD*).
* **Gestion des fractions et micro-valeurs** : Prise en charge précise des fractions de cryptos (ex: *0.0054 BTC*) et des cours inférieurs à 1$ (jusqu'à 6 décimales).
* **Type d'actif** : Action (*Equity*), ETF (*Tracker*), Fonds (*Fund*), **Crypto-Actif (*Crypto*)**, Indice.
* **Quantité** & **PRU** : Quantité détenue et Prix de Revient Unitaire d'achat.
* **Devise** : Devise de cotation native du titre (USD, EUR, CHF, GBP, CAD...).

---

### 5. Suivi des Positions & Outils d'Analyse

#### Outils de filtrage et de tri :
* **Filtres rapides** : Affichez *Tous*, uniquement les *Actions*, les *ETFs*, les *Fonds* ou les **🪙 Cryptos**.
* **Recherche instantanée** : Filtrez en temps réel dans vos positions détenues.
* **Tri personnalisé** : Par *Plus forte valeur*, *Plus-value (%)*, *Performance du jour*, *Ordre alphabétique*.
* **Vues Grille & Liste** : Basculez entre vue cartes et vue tableau.

#### Sur chaque position :
* 📉 **Sparkline 7 jours** : Mini-graphique de tendance intégré sur la carte.
* 📈 **Graphique Historique Interactif** : Cliquez sur l'icône de graphique pour afficher l'évolution du cours sur **1 Mois, 6 Mois, 1 An et 5 Ans**.
* 🤖 **Analyse IA Gemini** : 
  - Pour les actions : analyse des ratios (PER, dividendes, consensus analystes).
  - Pour les **cryptos** : analyse de la dynamique de marché, volume 24h, market cap, niveaux techniques et actualités crypto (CoinDesk, Cointelegraph, etc.).
  - Recommandation claire (**ACHETER / CONSERVER / VENDRE**).
* ✏️ **Édition inline** : Modifiez quantité, PRU, date ou devise sans supprimer la ligne.
* 🗑️ **Suppression sécurisée** : Modale moderne de confirmation.

---

## 🤖 Audit Global du Portefeuille par l'IA

En cliquant sur **"Audit Global IA"**, Gemini 3.x analyse l'ensemble de votre allocation pour vous délivrer un rapport complet :
1. 📊 **Score de diversification (0 à 100)** et santé générale.
2. ⚖️ **Analyse de l'allocation et concentration** (secteurs, zones géographiques, doublons).
3. 🛡️ **Niveau de risque et résilience** en cas de baisse des marchés.
4. 💡 **3 à 5 Recommandations concrètes de rééquilibrage**.

---

## 💾 Sauvegarde & Export

* **Export CSV** : Fichier tableur compatible Excel, Google Sheets, LibreOffice.
* **Export JSON** : Sauvegarde brute complète de votre base.
* **Import** : Glissez-déposez ou sélectionnez un fichier CSV/JSON pour restaurer ou ajouter des positions en masse.

---

*AI Stock Analyzer v2.0 — Août 2026*

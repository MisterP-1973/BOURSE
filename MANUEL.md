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

Ajoutez une action, un ETF, un fonds, une **cryptomonnaie** ou un **produit structuré / certificat** en quelques secondes :

* **Recherche dynamique & Codes ISIN** : Tapez un nom, un ticker ou un **code ISIN à 12 caractères** (ex: *Bitcoin, BTC, Ethereum, SOL, Apple, AAPL, MC.PA, CH0037787659, TNGCI...*) pour autocompléter instantanément le ticker, le nom, le type d'actif et la devise de cotation.
* **Support Cryptomonnaies** : Saisie par symbole court (*BTC, ETH, SOL, XRP, DOGE*) ou paire Yahoo Finance (*BTC-USD, ETH-EUR, SOL-USD*).
* **Support Produits Structurés & Certificats** : Reconnaissance directe des ISINs suisses (SIX Swiss Exchange / Scoach) comme *UBS Bloomberg CMCI Natural Gas USD ETC* (`CH0037787659` / `TNGCI`), certificats trackers et produits dérivés.
* **Gestion des fractions et micro-valeurs** : Prise en charge précise des fractions de cryptos (ex: *0.0054 BTC*) et des cours inférieurs à 1$ (jusqu'à 6 décimales).
* **Type d'actif** : Action (*Equity*), ETF (*Tracker*), Fonds (*Fund*), **Crypto-Actif (*Crypto*)**, **Produit Structuré / Certificat (*Structured*)**, Indice.
* **Quantité** & **PRU** : Quantité détenue et Prix de Revient Unitaire d'achat.
* **Devise** : Devise de cotation native du titre (USD, EUR, CHF, GBP, CAD...).

---

### 5. Suivi des Positions & Outils d'Analyse

#### Outils de filtrage et de tri :
* **Filtres rapides** : Affichez *Tous*, uniquement les *Actions*, les *ETFs*, les *Fonds*, les **🪙 Cryptos** ou les **🔷 Structurés**.
* **Recherche instantanée** : Filtrez en temps réel dans vos positions détenues.
* **Tri personnalisé** : Par *Plus forte valeur*, *Plus-value (%)*, *Performance du jour*, *Ordre alphabétique*.
* **Vues Grille & Liste** : Basculez entre vue cartes et vue tableau.

#### Sur chaque position :
* 📉 **Sparkline 7 jours** : Mini-graphique de tendance intégré sur la carte.
* 📈 **Graphique Historique Interactif** : Cliquez sur l'icône de graphique pour afficher l'évolution du cours sur **1 Mois, 6 Mois, 1 An et 5 Ans**.
* 🤖 **Analyse IA Sur-Mesure & Moteur Quantitatif Institutionnel** : 
  * 📊 **Dashboard Technique** : RSI (14j), Tendance des Moyennes Mobiles (SMA 20, 50, 200), Momentum MACD, Volatilité ATR et Niveaux clés Support/Résistance.
  * 🎯 **Plan d'Accumulation DCA & Zones d'Achat par Paliers** :
    * **Tranche 1 (Pullback Léger / Agressif)** : Support immédiat ou SMA 20.
    * **Tranche 2 (Entrée Optimale / Pullback sain)** : SMA 50 ou Retracement Fibonacci 50%.
    * **Tranche 3 (Value Dip / Creux Majeur)** : SMA 200 ou Support 60 jours.
    * **Statut de Timing d'Entrée** : *Surachat (Attendre repli)*, *Opportunité Immédiate (Survente)*, *Zone d'Accumulation Optimale*.
  * 📅 **Alerte Calendrier des Résultats (Earnings)** : Décompte des jours avant la prochaine publication trimestrielle.
  * 🛡️ **Money Management** : Stop-Loss protecteur chiffré, Objectif Take-Profit, Ratio Risque/Rendement (R:R) et contrôle du poids dans le portefeuille.
  * 🏆 **Indicateurs Fondamentaux & Consensus** : P/E, PEG Ratio, ROE, Free Cash Flow, Debt/Equity, Bêta et Consensus Wall Street.
* ✏️ **Édition inline** : Modifiez quantité, PRU, date ou devise sans supprimer la ligne.
* 🗑️ **Suppression sécurisée** : Modale moderne de confirmation.

---

## ⚡ Scanner de Signaux & Alertes Marché en Direct

Directement sous les cartes de synthèse (KPIs), le **Scanner de Signaux** surveille en continu l'intégralité de vos positions :
* 🔴 **Alertes Risques** : Rupture ou proximité de Stop-Loss (< 3.5%), Death Cross, Surachat extrême RSI (> 70), Surpondération de portefeuille.
* 🟢 **Opportunités d'Achat** : Golden Cross (SMA 50 > SMA 200), Survente extrême RSI (< 32), Objectif Take-Profit atteint (> 95%).
* 📅 **Résultats Imminents** : Alertes pour les titres dont la publication des résultats a lieu dans les 14 jours.

---

## 🌪️ Stress-Test Macroéconomique & Crash-Test

En cliquant sur **"🌪️ Stress-Test"** dans la barre de navigation, vous pouvez simuler la réaction et l'impact financier de chocs économiques majeurs sur votre portefeuille via Gemini (Chief Risk Officer institutionnel) :
1. **Choc Inflation & Taux d'Intérêt (+150 bps)** : Évalue la vulnérabilité des actifs de croissance face aux valeurs cycliques.
2. **Récession Globale & Krach Boursier (-20%)** : Teste l'effet coussin des valeurs défensives, de l'or et des dividendes face aux actifs à fort bêta.
3. **Choc Matières Premières & Énergie (+40%)** : Impact d'une flambée des hydrocarbures sur vos coûts et marges.
4. **Dépréciation du Dollar US (-10% vs CHF/EUR)** : Évalue l'impact de conversion et le risque de change de vos avoirs libellés en devises étrangères.
5. **Matrice Complète (4 Chocs)** : Diagnostic global intégrant le score de résilience (0 à 100), les 2 lignes les plus vulnérables, les 2 lignes protectrices et les recommandations de couverture (*Hedging*).

---

## 🧩 Matrice de Corrélation & Détection d'Overlap

En cliquant sur l'icône **"Matrice de Corrélation"**, l'application calcule la corrélation mathématique (Pearson sur 6 mois) de vos actifs :
* 🚨 **Détection des Doublons (Overlap > 0.70)** : Alerte si plusieurs de vos lignes évoluent de manière quasi identique, créant une illusion de diversification.
* 🛡️ **Paires Protectrices (Corrélation Négative)** : Identifie les actifs qui montent quand le reste du marché baisse.
* 📊 **Répartition Sectorielle Estimée** : Visualise votre exposition réelle par secteur (Tech, Finance, Santé, Crypto, Énergie, etc.).

---

## 🎯 Profil d'Investisseur & Paramètres

En cliquant sur l'icône ⚙️ **Paramètres**, vous pouvez configurer votre profil d'investisseur pour calibrer la sensibilité du conseiller IA :
* **Profil de Risque** :
  * 🛡️ *Prudent / Bon père de famille* : Préservation du capital, limitation stricte de la volatilité, focus dividendes solides.
  * ⚖️ *Équilibré* : Mix équilibré entre valorisation, dividendes et risque modéré (profil par défaut).
  * 🚀 *Dynamique* : Recherche de croissance, forte tolérance aux fluctuations de marché.
  * ⚡ *Agressif / Spéculatif* : Recherche de fort alpha, cryptos, actifs à fort beta et opportunités asymétriques.
* **Horizon de Placement** :
  * ⏱️ *Court terme (< 6 mois)* : Approche swing, prises de bénéfices rapides, gestion tactique.
  * 📅 *Moyen terme (1 à 3 ans)* : Suivi des cycles de marché et thématiques sectorielles.
  * 🏛️ *Long terme (5+ ans)* : Investissement fondamental, DCA, rente et effet boule de neige.
* **Objectif Principal** : Croissance du capital, Revenus passifs (dividendes/staking), ou Préservation du capital.
* **Poids Maximum par Ligne** : Seuil d'alerte de sur-concentration (ex: 15% max par ligne).

---

## 🤖 Audit Global du Portefeuille par l'IA

En cliquant sur **"Audit Global IA"**, Gemini analyse l'ensemble de votre allocation en la confrontant à votre profil :
1. 📊 **Diagnostic Global & Adéquation au Profil** (Score chiffré de santé 0 à 100 et détection des écarts de risque).
2. ⚡ **Stratégie Court Terme (1 à 6 mois)** : Gestion des risques, lignes volatiles, allègements et prises de bénéfices opportunes.
3. 🏛️ **Vision Stratégique Long Terme (3 à 5+ ans)** : Solidité des fondamentaux, dividendes pérennes et résilience.
4. 🎯 **Plan d'Action & Arbitrages Recommandés** : 3 à 5 recommandations chiffrées de rééquilibrage.

---

## 🛡️ Sauvegarde & Restauration Complète

L'application intègre un système robuste de sauvegarde et de restauration pour vous protéger contre toute perte de données ou pour transférer votre portefeuille sur une autre machine.

### 1. Sauvegarde Complète (.ZIP)
* Cliquez sur l'icône de **Sauvegarde & Restauration** (icône bouclier dans l'en-tête).
* Dans l'onglet **Sauvegarde**, cliquez sur **"Télécharger l'archive ZIP"**.
* Cette archive contient :
  * La base SQLite complète (`stocks.db`) avec tout votre historique d'analyses.
  * Votre fichier de configuration (`config.json`) incluant votre clé API et préférences.
  * Un export JSON universel (`data_export.json`).
  * Un manifeste de métadonnées (`backup_metadata.json`).

### 2. Points de Restauration Locaux (Snapshots)
* Cliquez sur **"Créer un point local"** : un instantané est immédiatement sauvegardé dans le dossier `backups/` de votre application.
* Dans l'onglet **Points Locaux**, vous pouvez :
  * Consulter l'historique complet des sauvegardes (horodatage, taille, type).
  * Restaurer n'importe quel point en 1 clic.
  * Télécharger une sauvegarde spécifique.
  * Supprimer les anciennes sauvegardes devenues inutiles.

### 3. Restauration Sécurisée
* Dans l'onglet **Restaurer**, déposez votre archive `.zip`, un fichier `.db` ou un fichier `.json`.
* **Sécurité automatique :** Avant d'écraser la base active, un point de sécurité d'urgence (`pre_restore_safety_snapshot`) est automatiquement généré. Vous ne risquez donc jamais d'effacer vos données par accident.

### 4. Scripts Windows autonomes (hors navigateur)
* `backup.bat` : Double-cliquez pour générer instantanément une archive ZIP de sauvegarde sans avoir à ouvrir le navigateur.
* `restore.bat` : Script interactif dans la console Windows permettant de choisir et restaurer un point de sauvegarde existant en cas de problème.

### 5. Exports simples et Import
* **Export CSV** : Fichier tableur compatible Excel, Google Sheets, LibreOffice.
* **Export JSON** : Export rapide de la liste des positions.
* **Import de Positions** : Permet d'ajouter ou fusionner de nouvelles lignes depuis un CSV ou JSON sans modifier vos paramètres existants.

---

*AI Stock Analyzer v2.1 — Septembre 2026*

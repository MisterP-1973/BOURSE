import os
import json
import time
import csv
import io
import zipfile
import shutil
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import Flask, render_template, request, jsonify, Response, send_file
from flask_sqlalchemy import SQLAlchemy
import pandas as pd
import numpy as np
import yfinance as yf
from google import genai

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///stocks.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# --- MODELS ---
class Stock(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    symbol = db.Column(db.String(20), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    purchase_date = db.Column(db.String(20), nullable=False)
    quantity = db.Column(db.Float, nullable=False)
    purchase_price = db.Column(db.Float, nullable=False)
    currency = db.Column(db.String(10), nullable=False, default='USD')
    ai_recommendation = db.Column(db.String(50), nullable=True)
    asset_type = db.Column(db.String(50), nullable=True, default='Equity')
    notes = db.Column(db.Text, nullable=True)
    manual_price = db.Column(db.Float, nullable=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'symbol': self.symbol,
            'name': self.name,
            'purchase_date': self.purchase_date,
            'quantity': self.quantity,
            'purchase_price': self.purchase_price,
            'currency': self.currency,
            'ai_recommendation': self.ai_recommendation,
            'asset_type': self.asset_type or 'Equity',
            'notes': self.notes or '',
            'manual_price': self.manual_price
        }

class AnalysisHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    stock_id = db.Column(db.Integer, nullable=True)
    symbol = db.Column(db.String(20), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    analysis_type = db.Column(db.String(20), default='stock') # 'stock' or 'portfolio'
    recommendation = db.Column(db.String(50), nullable=True)
    analysis_text = db.Column(db.Text, nullable=False)
    score = db.Column(db.Integer, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'stock_id': self.stock_id,
            'symbol': self.symbol,
            'timestamp': self.timestamp.strftime('%Y-%m-%d %H:%M') if self.timestamp else '',
            'analysis_type': self.analysis_type,
            'recommendation': self.recommendation,
            'analysis_text': self.analysis_text,
            'score': self.score
        }

# Ensure DB exists and migrate new columns
def migrate_db():
    with app.app_context():
        db.create_all()
        try:
            with db.engine.connect() as conn:
                from sqlalchemy import text
                res = conn.execute(text("PRAGMA table_info(stock)"))
                columns = [row[1] for row in res.fetchall()]
                if 'asset_type' not in columns:
                    conn.execute(text("ALTER TABLE stock ADD COLUMN asset_type VARCHAR(50) DEFAULT 'Equity'"))
                    conn.commit()
                if 'notes' not in columns:
                    conn.execute(text("ALTER TABLE stock ADD COLUMN notes TEXT"))
                    conn.commit()
                if 'manual_price' not in columns:
                    conn.execute(text("ALTER TABLE stock ADD COLUMN manual_price FLOAT"))
                    conn.commit()
        except Exception as e:
            print(f"Migration note: {e}")

migrate_db()

# --- CONFIG & SETTINGS ---
CONFIG_FILE = 'config.json'

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_config(data):
    current = load_config()
    current.update(data)
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(current, f, indent=2)

def get_api_key():
    return load_config().get('gemini_api_key') or os.environ.get('GEMINI_API_KEY')

def get_reference_currency():
    return load_config().get('reference_currency', 'CHF')

def get_investor_profile():
    config = load_config()
    risk_profile = config.get('risk_profile', 'balanced')
    investment_horizon = config.get('investment_horizon', 'long_term')
    investment_goal = config.get('investment_goal', 'balanced')
    try:
        max_position_weight = float(config.get('max_position_weight', 15))
    except (ValueError, TypeError):
        max_position_weight = 15.0

    risk_labels = {
        'prudent': 'Prudent / Bon père de famille (Priorité préservation du capital, faible volatilité, dividendes pérennes)',
        'balanced': 'Équilibré (Mix de croissance modérée, dividendes et maîtrise du risque)',
        'dynamic': 'Dynamique (Recherche de croissance, acceptation de forte volatilité)',
        'aggressive': 'Agressif / Spéculatif (Recherche de fort alpha/rendement, cryptos, tech à fort beta, opportunités asymétriques)'
    }
    horizon_labels = {
        'short_term': 'Court terme (< 6 mois — Swing trading, prises de gains rapides, gestion tactique)',
        'medium_term': 'Moyen terme (1 à 3 ans — Cycles de marché, thématiques sectorielles)',
        'long_term': 'Long terme (5+ ans — Investissement fondamental, DCA, rente et effet boule de neige)'
    }
    goal_labels = {
        'growth': 'Croissance du capital (Maximisation des plus-values latentes)',
        'income': 'Revenus passifs & Cash-flow (Dividendes, staking crypto)',
        'capital_preservation': 'Préservation du capital (Protection contre l\'inflation et limitation des drawdowns)',
        'balanced': 'Équilibré (Mix Croissance & Rendement)'
    }

    return {
        'risk_profile': risk_profile,
        'risk_label': risk_labels.get(risk_profile, risk_labels['balanced']),
        'investment_horizon': investment_horizon,
        'horizon_label': horizon_labels.get(investment_horizon, horizon_labels['long_term']),
        'investment_goal': investment_goal,
        'goal_label': goal_labels.get(investment_goal, goal_labels['balanced']),
        'max_position_weight': max_position_weight
    }

# --- MARKET DATA, TECHNICAL & FOREX CACHE ---
# Cache structure: { key: { 'data': ..., 'timestamp': float } }
MARKET_CACHE = {}
TECHNICAL_CACHE = {}
FOREX_CACHE = {'rates': {}, 'timestamp': 0}
CACHE_TTL = 300       # 5 minutes
TECHNICAL_TTL = 300   # 5 minutes
FOREX_TTL = 600       # 10 minutes

def compute_technical_indicators(symbol, current_price=None, asset_type='Equity', currency='USD'):
    """
    Computes live technical indicators (RSI 14, SMA 20/50/200, MACD, ATR 14, Support/Resistance)
    and generates Money Management levels (Stop-Loss, Take-Profit, Risk/Reward ratio).
    """
    cache_key = f"tech_{symbol.upper()}"
    now = time.time()
    if cache_key in TECHNICAL_CACHE:
        cached = TECHNICAL_CACHE[cache_key]
        if now - cached['timestamp'] < TECHNICAL_TTL:
            return cached['data']

    default_res = {
        'symbol': symbol,
        'available': False,
        'rsi': 50.0,
        'rsi_status': 'Neutre (50)',
        'rsi_color': 'blue',
        'sma20': None,
        'sma50': None,
        'sma200': None,
        'trend': 'Neutre',
        'trend_color': 'blue',
        'golden_cross': False,
        'death_cross': False,
        'macd': 0.0,
        'macd_signal': 0.0,
        'macd_hist': 0.0,
        'macd_status': 'Neutre',
        'macd_color': 'blue',
        'atr': 0.0,
        'atr_pct': 2.5,
        'support': None,
        'resistance': None,
        'stop_loss': None,
        'stop_loss_pct': -5.0,
        'take_profit': None,
        'take_profit_pct': 10.0,
        'risk_reward_ratio': 2.0
    }

    try:
        sym = symbol.strip().upper()
        if '-' not in sym and asset_type == 'Crypto':
            sym = normalize_crypto_symbol(sym, 'Crypto', currency)

        ticker = yf.Ticker(sym)
        df = ticker.history(period="1y")
        if df.empty or len(df) < 14:
            df = ticker.history(period="6mo")

        if df.empty or len(df) < 5:
            TECHNICAL_CACHE[cache_key] = {'data': default_res, 'timestamp': now}
            return default_res

        cp = float(df['Close'].iloc[-1])
        if current_price and current_price > 0:
            cp = float(current_price)

        # 1. RSI (14 days)
        delta = df['Close'].diff()
        gain = delta.where(delta > 0, 0.0)
        loss = -delta.where(delta < 0, 0.0)
        avg_gain = gain.rolling(window=14, min_periods=14).mean()
        avg_loss = loss.rolling(window=14, min_periods=14).mean()
        rs = avg_gain / avg_loss.replace(0, np.nan)
        rsi_series = 100 - (100 / (1 + rs))
        rsi_val = float(rsi_series.iloc[-1]) if not pd.isna(rsi_series.iloc[-1]) else 50.0
        rsi_val = round(rsi_val, 1)

        if rsi_val < 30:
            rsi_status = f"Survente ({rsi_val}) — Zone d'achat"
            rsi_color = "emerald"
        elif rsi_val < 45:
            rsi_status = f"Repli modéré ({rsi_val})"
            rsi_color = "teal"
        elif rsi_val <= 60:
            rsi_status = f"Neutre ({rsi_val})"
            rsi_color = "blue"
        elif rsi_val <= 70:
            rsi_status = f"Hausse saine ({rsi_val})"
            rsi_color = "indigo"
        else:
            rsi_status = f"Surachat ({rsi_val}) — Prudence / Prise de gains"
            rsi_color = "rose"

        # 2. Moving Averages & Trend
        sma20 = float(df['Close'].rolling(20).mean().iloc[-1]) if len(df) >= 20 else cp
        sma50 = float(df['Close'].rolling(50).mean().iloc[-1]) if len(df) >= 50 else cp
        sma200 = float(df['Close'].rolling(200).mean().iloc[-1]) if len(df) >= 200 else None

        golden_cross = (sma50 > sma200) if (sma50 and sma200) else False
        death_cross = (sma50 < sma200) if (sma50 and sma200) else False

        if sma200:
            if cp > sma20 > sma50 > sma200:
                trend = "Forte Hausse (Super Bullish)"
                trend_color = "emerald"
            elif cp > sma50 > sma200:
                trend = "Tendance Haussière (Bullish)"
                trend_color = "teal"
            elif cp < sma20 < sma50 < sma200:
                trend = "Forte Baisse (Super Bearish)"
                trend_color = "rose"
            elif cp < sma50 < sma200:
                trend = "Tendance Baissière (Bearish)"
                trend_color = "rose"
            else:
                trend = "Consolidation / Neutre"
                trend_color = "blue"
        else:
            if cp > sma20 > sma50:
                trend = "Tendance Haussière"
                trend_color = "emerald"
            elif cp < sma20 < sma50:
                trend = "Tendance Baissière"
                trend_color = "rose"
            else:
                trend = "Neutre"
                trend_color = "blue"

        # 3. MACD (12, 26, 9)
        ema12 = df['Close'].ewm(span=12, adjust=False).mean()
        ema26 = df['Close'].ewm(span=26, adjust=False).mean()
        macd_line = ema12 - ema26
        signal_line = macd_line.ewm(span=9, adjust=False).mean()
        m_val = float(macd_line.iloc[-1])
        s_val = float(signal_line.iloc[-1])
        h_val = m_val - s_val

        if h_val > 0 and m_val > s_val:
            macd_status = "Haussier (Momentum positif)"
            macd_color = "emerald"
        elif h_val < 0 and m_val < s_val:
            macd_status = "Baissier (Momentum négatif)"
            macd_color = "rose"
        else:
            macd_status = "Neutre (Croisement proche)"
            macd_color = "blue"

        # 4. ATR 14 & Volatility
        h = df['High']
        l = df['Low']
        cp_prev = df['Close'].shift(1)
        tr = pd.concat([h - l, (h - cp_prev).abs(), (l - cp_prev).abs()], axis=1).max(axis=1)
        atr_val = float(tr.rolling(14).mean().iloc[-1]) if len(df) >= 14 else (cp * 0.02)
        atr_pct = (atr_val / cp) * 100 if cp > 0 else 2.0

        # 5. Support & Resistance (last 60 trading days)
        recent_df = df.iloc[-60:] if len(df) >= 60 else df
        support = float(recent_df['Low'].min())
        resistance = float(recent_df['High'].max())

        # 6. Money Management (Stop-Loss & Take-Profit)
        is_crypto = (asset_type == 'Crypto') or ('-USD' in sym) or ('-EUR' in sym) or ('-CHF' in sym)
        sl_mult = 2.0 if is_crypto else 1.5
        tp_mult = 4.0 if is_crypto else 3.0

        sl_price = max(0.0001, cp - (sl_mult * atr_val))
        if support < cp and (cp - support) < (2.5 * atr_val):
            sl_price = max(0.0001, support * 0.98)

        tp_price = cp + (tp_mult * atr_val)
        if resistance > cp and (resistance - cp) > (1.5 * atr_val):
            tp_price = max(tp_price, resistance * 1.02)

        sl_pct = ((sl_price - cp) / cp) * 100 if cp > 0 else -5.0
        tp_pct = ((tp_price - cp) / cp) * 100 if cp > 0 else 10.0
        rr_ratio = round(abs(tp_pct / sl_pct), 2) if sl_pct != 0 else 2.0

        res_data = {
            'symbol': symbol,
            'available': True,
            'current_price': round(cp, 4 if is_crypto and cp < 1 else 2),
            'rsi': rsi_val,
            'rsi_status': rsi_status,
            'rsi_color': rsi_color,
            'sma20': round(sma20, 2),
            'sma50': round(sma50, 2),
            'sma200': round(sma200, 2) if sma200 else None,
            'trend': trend,
            'trend_color': trend_color,
            'golden_cross': golden_cross,
            'death_cross': death_cross,
            'macd': round(m_val, 2),
            'macd_signal': round(s_val, 2),
            'macd_hist': round(h_val, 2),
            'macd_status': macd_status,
            'macd_color': macd_color,
            'atr': round(atr_val, 2),
            'atr_pct': round(atr_pct, 2),
            'support': round(support, 2),
            'resistance': round(resistance, 2),
            'stop_loss': round(sl_price, 4 if is_crypto and sl_price < 1 else 2),
            'stop_loss_pct': round(sl_pct, 1),
            'take_profit': round(tp_price, 4 if is_crypto and tp_price < 1 else 2),
            'take_profit_pct': round(tp_pct, 1),
            'risk_reward_ratio': rr_ratio
        }

        TECHNICAL_CACHE[cache_key] = {'data': res_data, 'timestamp': now}
        return res_data

    except Exception as e:
        print(f"Error computing technical indicators for {symbol}: {e}")
        TECHNICAL_CACHE[cache_key] = {'data': default_res, 'timestamp': now}
        return default_res

def get_forex_rates():
    """Fetch live exchange rates relative to USD and calculate matrix for USD, EUR, CHF, GBP."""
    global FOREX_CACHE
    now = time.time()
    if FOREX_CACHE['rates'] and (now - FOREX_CACHE['timestamp'] < FOREX_TTL):
        return FOREX_CACHE['rates']
    
    base_rates = {
        'USD': 1.0,
        'EUR': 0.92,
        'CHF': 0.88,
        'GBP': 0.79,
        'JPY': 150.0,
        'CAD': 1.35
    }
    
    pairs = ['EURUSD=X', 'CHF=X', 'GBPUSD=X', 'EURCHF=X', 'USDJPY=X', 'USDCAD=X']
    try:
        tickers = yf.Tickers(' '.join(pairs))
        for p in pairs:
            try:
                t = tickers.tickers[p]
                hist = t.history(period='1d')
                if not hist.empty:
                    val = float(hist['Close'].iloc[-1])
                    if p == 'EURUSD=X' and val > 0:
                        base_rates['EUR'] = 1.0 / val
                    elif p == 'GBPUSD=X' and val > 0:
                        base_rates['GBP'] = 1.0 / val
                    elif p == 'CHF=X' and val > 0:
                        base_rates['CHF'] = val
                    elif p == 'USDJPY=X' and val > 0:
                        base_rates['JPY'] = val
                    elif p == 'USDCAD=X' and val > 0:
                        base_rates['CAD'] = val
            except Exception as e:
                print(f"FX fetch error for {p}: {e}")
        FOREX_CACHE = {'rates': base_rates, 'timestamp': now}
    except Exception as e:
        print(f"Global FX fetch error: {e}")
        if not FOREX_CACHE['rates']:
            FOREX_CACHE = {'rates': base_rates, 'timestamp': now}
            
    return FOREX_CACHE['rates']

def convert_currency(amount, from_curr, to_curr, rates=None):
    """Convert amount from from_curr to to_curr using FX matrix."""
    if not amount:
        return 0.0
    from_curr = (from_curr or 'USD').upper()
    to_curr = (to_curr or 'CHF').upper()
    if from_curr == to_curr:
        return float(amount)
    if rates is None:
        rates = get_forex_rates()
        
    rate_from = rates.get(from_curr, 1.0)
    rate_to = rates.get(to_curr, 1.0)
    usd_amount = float(amount) / rate_from
    return usd_amount * rate_to

def is_valid_price(price, fallback_price=None):
    if price is None or price <= 0:
        return False
    return True

# --- POPULAR CRYPTOS REFERENCE ---
POPULAR_CRYPTOS = [
    {'symbol': 'BTC-USD', 'name': 'Bitcoin', 'short': 'BTC', 'type': 'Crypto'},
    {'symbol': 'ETH-USD', 'name': 'Ethereum', 'short': 'ETH', 'type': 'Crypto'},
    {'symbol': 'SOL-USD', 'name': 'Solana', 'short': 'SOL', 'type': 'Crypto'},
    {'symbol': 'XRP-USD', 'name': 'XRP (Ripple)', 'short': 'XRP', 'type': 'Crypto'},
    {'symbol': 'BNB-USD', 'name': 'BNB (Binance Coin)', 'short': 'BNB', 'type': 'Crypto'},
    {'symbol': 'ADA-USD', 'name': 'Cardano', 'short': 'ADA', 'type': 'Crypto'},
    {'symbol': 'DOGE-USD', 'name': 'Dogecoin', 'short': 'DOGE', 'type': 'Crypto'},
    {'symbol': 'AVAX-USD', 'name': 'Avalanche', 'short': 'AVAX', 'type': 'Crypto'},
    {'symbol': 'DOT-USD', 'name': 'Polkadot', 'short': 'DOT', 'type': 'Crypto'},
    {'symbol': 'LINK-USD', 'name': 'Chainlink', 'short': 'LINK', 'type': 'Crypto'},
    {'symbol': 'SUI-USD', 'name': 'Sui', 'short': 'SUI', 'type': 'Crypto'},
    {'symbol': 'NEAR-USD', 'name': 'NEAR Protocol', 'short': 'NEAR', 'type': 'Crypto'},
    {'symbol': 'SHIB-USD', 'name': 'Shiba Inu', 'short': 'SHIB', 'type': 'Crypto'},
    {'symbol': 'PEPE-USD', 'name': 'Pepe', 'short': 'PEPE', 'type': 'Crypto'},
    {'symbol': 'MATIC-USD', 'name': 'Polygon (MATIC/POL)', 'short': 'MATIC', 'type': 'Crypto'},
    {'symbol': 'LTC-USD', 'name': 'Litecoin', 'short': 'LTC', 'type': 'Crypto'},
    {'symbol': 'UNI7083-USD', 'name': 'Uniswap', 'short': 'UNI', 'type': 'Crypto'},
    {'symbol': 'ATOM-USD', 'name': 'Cosmos', 'short': 'ATOM', 'type': 'Crypto'},
    {'symbol': 'XLM-USD', 'name': 'Stellar Lumen', 'short': 'XLM', 'type': 'Crypto'},
    {'symbol': 'HBAR-USD', 'name': 'Hedera Hashgraph', 'short': 'HBAR', 'type': 'Crypto'},
    {'symbol': 'RENDER-USD', 'name': 'Render Token', 'short': 'RENDER', 'type': 'Crypto'},
    {'symbol': 'AAVE-USD', 'name': 'Aave', 'short': 'AAVE', 'type': 'Crypto'},
    {'symbol': 'USDT-USD', 'name': 'Tether USD', 'short': 'USDT', 'type': 'Crypto'},
    {'symbol': 'USDC-USD', 'name': 'USD Coin', 'short': 'USDC', 'type': 'Crypto'}
]

# --- POPULAR STRUCTURED PRODUCTS & CERTIFICATES ---
POPULAR_STRUCTURED_PRODUCTS = [
    {
        'symbol': 'CH0037787659',
        'ticker_six': 'TNGCI',
        'name': 'UBS Bloomberg CMCI Natural Gas USD ETC (TNGCI)',
        'type': 'Structured',
        'exchange': 'SIX Swiss Exchange (Structured Products)',
        'currency': 'USD',
        'isin': 'CH0037787659',
        'valor': '3778765'
    }
]

def normalize_crypto_symbol(symbol, asset_type='Equity', currency='USD'):
    """Normalize crypto symbols: e.g. BTC with Crypto asset_type becomes BTC-USD."""
    if not symbol:
        return symbol
    sym = symbol.strip().upper()
    # If it is a 12-char ISIN code or non-crypto asset, never append -USD
    if len(sym) == 12 and sym[:2].isalpha() and sym[2:].isalnum():
        return sym
    if asset_type in ['Structured', 'Produit Structuré', 'Fund', 'ETF', 'Equity']:
        return sym
    if asset_type == 'Crypto' or any(c['short'] == sym or c['symbol'] == sym for c in POPULAR_CRYPTOS):
        if '-' not in sym and '=' not in sym and '.' not in sym:
            curr = (currency or 'USD').upper()
            if curr in ['USD', 'EUR', 'CAD', 'GBP']:
                return f"{sym}-{curr}"
            return f"{sym}-USD"
    return sym

def fetch_single_stock_details(symbol, fallback_price, fallback_currency='USD'):
    """Fetch rich details for a single ticker with 7-day sparkline, metrics and caching."""
    cache_key = f"stock_{symbol.upper()}"
    now = time.time()
    if cache_key in MARKET_CACHE:
        cached = MARKET_CACHE[cache_key]
        if now - cached['timestamp'] < CACHE_TTL:
            return cached['data']

    data = {
        'current_price': None,
        'previous_close': None,
        'day_change': 0.0,
        'day_change_percent': 0.0,
        'currency': fallback_currency,
        'sparkline': [],
        'pe_ratio': None,
        'dividend_yield': None,
        'fifty_two_week_high': None,
        'fifty_two_week_low': None,
        'market_cap': None,
        'volume_24h': None,
        'circulating_supply': None,
        'fifty_day_average': None,
        'two_hundred_day_average': None,
        'price_unavailable': False,
        'quote_type': 'Equity'
    }

    # Attempt fetch with primary symbol, or normalized crypto symbol if empty
    symbols_to_try = [symbol]
    if '-' not in symbol:
        crypto_norm = normalize_crypto_symbol(symbol, 'Crypto', fallback_currency)
        if crypto_norm != symbol:
            symbols_to_try.append(crypto_norm)

    for sym in symbols_to_try:
        try:
            ticker = yf.Ticker(sym)
            # 1. Fetch 1mo history for sparkline and daily delta
            hist = ticker.history(period="1mo")
            if not hist.empty:
                closes = [float(x) for x in hist['Close'].dropna().tolist()]
                if closes:
                    last_price = closes[-1]
                    if is_valid_price(last_price, fallback_price):
                        data['current_price'] = last_price
                        data['sparkline'] = closes[-7:] if len(closes) >= 7 else closes
                        
                        if len(closes) >= 2:
                            prev = closes[-2]
                            data['previous_close'] = prev
                            data['day_change'] = last_price - prev
                            data['day_change_percent'] = ((last_price - prev) / prev) * 100 if prev > 0 else 0.0

            # Fallback to fast_info or info if price not determined
            if data['current_price'] is None:
                try:
                    fi = ticker.fast_info
                    if hasattr(fi, 'last_price') and fi.last_price:
                        p = float(fi.last_price)
                        if is_valid_price(p, fallback_price):
                            data['current_price'] = p
                    if hasattr(fi, 'currency') and fi.currency:
                        data['currency'] = str(fi.currency).upper()
                except Exception:
                    pass

            # Fetch extra fundamentals & crypto metrics
            try:
                info = ticker.info or {}
                if info:
                    data['pe_ratio'] = info.get('trailingPE') or info.get('forwardPE')
                    
                    # Dividend Rate & Yield
                    div_rate = info.get('dividendRate') or info.get('trailingAnnualDividendRate')
                    if div_rate and float(div_rate) > 0:
                        data['dividend_rate'] = float(div_rate)
                    else:
                        data['dividend_rate'] = None
                    
                    raw_yield = info.get('dividendYield')
                    if raw_yield is None:
                        raw_yield = info.get('trailingAnnualDividendYield')
                    
                    if raw_yield is not None:
                        raw_val = float(raw_yield)
                        if raw_val > 0.5:
                            data['dividend_yield'] = raw_val
                        elif raw_val > 0:
                            data['dividend_yield'] = raw_val * 100.0
                        else:
                            data['dividend_yield'] = 0.0
                    elif data['dividend_rate'] and data['current_price'] and data['current_price'] > 0:
                        data['dividend_yield'] = (data['dividend_rate'] / data['current_price']) * 100.0
                    else:
                        data['dividend_yield'] = None

                    data['fifty_two_week_high'] = info.get('fiftyTwoWeekHigh')
                    data['fifty_two_week_low'] = info.get('fiftyTwoWeekLow')
                    
                    # Crypto & General Market Metrics
                    data['market_cap'] = info.get('marketCap')
                    data['volume_24h'] = info.get('volume24Hr') or info.get('volume')
                    data['circulating_supply'] = info.get('circulatingSupply')
                    data['fifty_day_average'] = info.get('fiftyDayAverage')
                    data['two_hundred_day_average'] = info.get('twoHundredDayAverage')

                    # Analyst Consensus
                    rec_key = str(info.get('recommendationKey') or '').lower().strip()
                    if rec_key in ['strong_buy', 'strongbuy', 'buy']:
                        data['analyst_consensus'] = 'ACHETER'
                    elif rec_key in ['sell', 'strong_sell', 'underperform']:
                        data['analyst_consensus'] = 'VENDRE'
                    elif rec_key in ['hold', 'neutral']:
                        data['analyst_consensus'] = 'CONSERVER'
                    else:
                        data['analyst_consensus'] = None
                    
                    data['target_mean_price'] = info.get('targetMeanPrice')
                    data['num_analysts'] = info.get('numberOfAnalystOpinions')

                    if not data['currency'] or data['currency'] == fallback_currency:
                        data['currency'] = info.get('currency', fallback_currency).upper()
                    
                    raw_qtype = str(info.get('quoteType', 'Equity')).upper()
                    if raw_qtype == 'CRYPTOCURRENCY' or sym.endswith('-USD') or sym.endswith('-EUR'):
                        data['quote_type'] = 'Crypto'
                    else:
                        data['quote_type'] = info.get('quoteType', 'Equity')
            except Exception:
                pass

            if data['current_price'] is not None:
                break
        except Exception as e:
            print(f"Error fetching detailed market data for {sym}: {e}")

    if data['current_price'] is None:
        data['current_price'] = fallback_price
        data['price_unavailable'] = True
        if not data['sparkline'] and fallback_price:
            data['sparkline'] = [fallback_price]

    # Save in cache
    MARKET_CACHE[cache_key] = {
        'data': data,
        'timestamp': now
    }
    return data

# --- ROUTES ---

@app.route('/')
def index():
    has_api_key = get_api_key() is not None
    ref_curr = get_reference_currency()
    return render_template('index.html', has_api_key=has_api_key, ref_curr=ref_curr)

@app.route('/api/search', methods=['GET'])
def search_ticker():
    """Search for stocks, ETFs, funds, structured products, and cryptos by ticker symbol, name, or ISIN code."""
    query = request.args.get('q', '').strip()
    if not query or len(query) < 1:
        return jsonify([])
    
    is_isin = bool(len(query) == 12 and query[:2].isalpha() and query[2:].isalnum())
    results = []
    seen_symbols = set()
    q_lower = query.lower()

    # 1. Instant popular structured products lookup (e.g. CH0037787659 / TNGCI / Natural Gas)
    for sp in POPULAR_STRUCTURED_PRODUCTS:
        if (q_lower in sp['symbol'].lower() or
            q_lower in sp.get('isin', '').lower() or
            q_lower in sp.get('ticker_six', '').lower() or
            q_lower in sp.get('valor', '').lower() or
            q_lower in sp['name'].lower()):
            results.append({
                'symbol': sp['symbol'],
                'name': sp['name'],
                'type': 'Structured',
                'exchange': sp['exchange'],
                'is_isin': True,
                'isin': sp.get('isin')
            })
            seen_symbols.add(sp['symbol'])

    # 2. Instant popular crypto lookup
    for c in POPULAR_CRYPTOS:
        if (q_lower in c['short'].lower() or 
            q_lower in c['name'].lower() or 
            q_lower in c['symbol'].lower() or
            q_lower in ['crypto', 'cryptos', 'bitcoin', 'altcoin']):
            results.append({
                'symbol': c['symbol'],
                'name': c['name'],
                'type': 'Crypto',
                'exchange': 'CCC (Crypto)',
                'is_isin': False,
                'isin': None
            })
            seen_symbols.add(c['symbol'])
            if len(results) >= 6:
                break

    # 3. Query Yahoo Finance Search
    if len(query) >= 2:
        try:
            search = yf.Search(query, max_results=8)
            quotes = search.quotes or []
            for q in quotes:
                symbol = q.get('symbol', '')
                if not symbol or symbol in seen_symbols:
                    continue
                name = q.get('longname') or q.get('shortname') or symbol
                raw_type = q.get('typeDisp') or q.get('quoteType') or 'Equity'
                
                # Normalize asset types
                raw_type_str = str(raw_type).upper()
                if raw_type_str in ['CRYPTOCURRENCY', 'CRYPTO']:
                    type_disp = 'Crypto'
                elif raw_type_str in ['ETF', 'EXCHANGE TRADED FUND']:
                    type_disp = 'ETF'
                elif raw_type_str in ['MUTUALFUND', 'FUND']:
                    type_disp = 'Fund'
                elif raw_type_str in ['INDEX']:
                    type_disp = 'Index'
                elif raw_type_str in ['STRUCTURED', 'CERTIFICATE', 'WARRANT']:
                    type_disp = 'Structured'
                else:
                    type_disp = 'Equity'
                    
                exchange = q.get('exchange', '')
                
                results.append({
                    'symbol': symbol,
                    'name': name,
                    'type': type_disp,
                    'exchange': exchange,
                    'is_isin': is_isin,
                    'isin': query.upper() if is_isin else None
                })
                seen_symbols.add(symbol)
        except Exception as e:
            print(f"Search error: {e}")

    # 4. If query is a valid 12-character ISIN and wasn't found elsewhere, offer instant custom structured product card
    if is_isin and query.upper() not in seen_symbols:
        results.append({
            'symbol': query.upper(),
            'name': f"Produit Structuré / ISIN {query.upper()}",
            'type': 'Structured',
            'exchange': 'SIX Swiss Exchange / OTC',
            'is_isin': True,
            'isin': query.upper()
        })

    return jsonify(results[:10])

@app.route('/api/stocks', methods=['GET'])
def get_stocks():
    """Return all portfolio positions enriched with live prices, FX conversion and metrics."""
    stocks = Stock.query.all()
    ref_currency = request.args.get('ref_currency') or get_reference_currency()
    fx_rates = get_forex_rates()

    # Parallelize market data fetch across all stocks
    detailed_map = {}
    with ThreadPoolExecutor(max_workers=min(10, max(len(stocks), 1))) as executor:
        future_to_stock = {
            executor.submit(fetch_single_stock_details, s.symbol, s.purchase_price, s.currency): s
            for s in stocks
        }
        for future in as_completed(future_to_stock):
            stock = future_to_stock[future]
            try:
                detailed_map[stock.id] = future.result()
            except Exception as e:
                print(f"Thread error for {stock.symbol}: {e}")
                detailed_map[stock.id] = {
                    'current_price': stock.purchase_price,
                    'price_unavailable': True,
                    'sparkline': [stock.purchase_price],
                    'day_change': 0.0,
                    'day_change_percent': 0.0,
                    'currency': stock.currency
                }

    results = []
    total_invested_ref = 0.0
    total_value_ref = 0.0
    total_day_gain_ref = 0.0
    total_annual_dividends_ref = 0.0

    for s in stocks:
        stock_data = s.to_dict()
        details = detailed_map.get(s.id, {})
        
        is_manual_price = False
        if details.get('price_unavailable', False):
            if s.manual_price is not None and s.manual_price > 0:
                current_price = s.manual_price
                price_unavailable = False
                is_manual_price = True
            else:
                current_price = s.purchase_price
                price_unavailable = True
        else:
            current_price = details.get('current_price', s.purchase_price)
            price_unavailable = False
        
        # Native currency metrics
        total_invested_native = s.quantity * s.purchase_price
        current_value_native = s.quantity * current_price
        pl_value_native = current_value_native - total_invested_native if not price_unavailable else 0.0
        pl_percent = (pl_value_native / total_invested_native * 100) if (total_invested_native > 0 and not price_unavailable) else 0.0
        
        # Converted into reference currency
        rate_native_to_ref = convert_currency(1.0, s.currency, ref_currency, fx_rates)
        total_invested_converted = total_invested_native * rate_native_to_ref
        current_value_converted = current_value_native * rate_native_to_ref
        pl_value_converted = pl_value_native * rate_native_to_ref
        
        day_change_native = details.get('day_change', 0.0) * s.quantity
        day_change_converted = day_change_native * rate_native_to_ref
        
        # Annual dividend estimation
        div_rate = details.get('dividend_rate')
        div_yield = details.get('dividend_yield')
        if div_rate:
            annual_div_native = s.quantity * div_rate
        elif div_yield:
            annual_div_native = current_value_native * (div_yield / 100.0)
        else:
            annual_div_native = 0.0

        annual_div_converted = annual_div_native * rate_native_to_ref

        # Aggregation for global portfolio summary
        total_invested_ref += total_invested_converted
        total_value_ref += current_value_converted
        total_day_gain_ref += day_change_converted
        total_annual_dividends_ref += annual_div_converted

        # Recommendation determination (AI > Live Wall Street Consensus > Trend)
        consensus = details.get('analyst_consensus')
        if s.ai_recommendation:
            effective_rec = s.ai_recommendation
            rec_source = 'ai'
        elif consensus:
            effective_rec = consensus
            rec_source = 'consensus'
        else:
            if not price_unavailable and pl_percent > 15:
                effective_rec = 'ACHETER'
            elif not price_unavailable and pl_percent < -20:
                effective_rec = 'VENDRE'
            else:
                effective_rec = 'CONSERVER'
            rec_source = 'trend'

        stock_data.update({
            'current_price': current_price,
            'price_unavailable': price_unavailable,
            'total_invested': total_invested_native,
            'current_value': current_value_native,
            'pl_value': pl_value_native,
            'pl_percent': pl_percent,
            # Converted values
            'current_value_ref': current_value_converted,
            'pl_value_ref': pl_value_converted,
            'day_change_ref': day_change_converted,
            # Financial & crypto metrics
            'day_change': details.get('day_change', 0.0),
            'day_change_percent': details.get('day_change_percent', 0.0),
            'sparkline': details.get('sparkline', []),
            'pe_ratio': details.get('pe_ratio'),
            'dividend_yield': div_yield,
            'annual_dividend_ref': annual_div_converted,
            'fifty_two_week_high': details.get('fifty_two_week_high'),
            'fifty_two_week_low': details.get('fifty_two_week_low'),
            'market_cap': details.get('market_cap'),
            'volume_24h': details.get('volume_24h'),
            'circulating_supply': details.get('circulating_supply'),
            'fifty_day_average': details.get('fifty_day_average'),
            'two_hundred_day_average': details.get('two_hundred_day_average'),
            'quote_type': details.get('quote_type', s.asset_type or 'Equity'),
            'analyst_consensus': consensus,
            'target_mean_price': details.get('target_mean_price'),
            'num_analysts': details.get('num_analysts'),
            'effective_recommendation': effective_rec,
            'recommendation_source': rec_source,
            'is_manual_price': is_manual_price
        })
        results.append(stock_data)

    total_pl_value_ref = total_value_ref - total_invested_ref
    total_pl_percent_ref = (total_pl_value_ref / total_invested_ref * 100) if total_invested_ref > 0 else 0.0
    total_day_gain_percent_ref = (total_day_gain_ref / (total_value_ref - total_day_gain_ref) * 100) if (total_value_ref - total_day_gain_ref) > 0 else 0.0

    return jsonify({
        'stocks': results,
        'ref_currency': ref_currency,
        'summary': {
            'total_value': total_value_ref,
            'total_invested': total_invested_ref,
            'total_pl_value': total_pl_value_ref,
            'total_pl_percent': total_pl_percent_ref,
            'total_day_gain_value': total_day_gain_ref,
            'total_day_gain_percent': total_day_gain_percent_ref,
            'total_annual_dividends': total_annual_dividends_ref,
            'holdings_count': len(results)
        },
        'fx_rates': fx_rates
    })

@app.route('/api/stocks', methods=['POST'])
def add_stock():
    data = request.json
    try:
        raw_symbol = data['symbol'].upper().strip()
        asset_type = data.get('asset_type', 'Equity')
        currency = data.get('currency', 'USD').upper()
        symbol = normalize_crypto_symbol(raw_symbol, asset_type, currency)

        new_stock = Stock(
            symbol=symbol,
            name=data['name'].strip(),
            purchase_date=data.get('purchase_date', 'Inconnue') or 'Inconnue',
            quantity=float(data['quantity']),
            purchase_price=float(data['purchase_price']),
            currency=currency,
            asset_type=asset_type,
            notes=data.get('notes', ''),
            manual_price=float(data['manual_price']) if data.get('manual_price') else None
        )
        db.session.add(new_stock)
        db.session.commit()
        MARKET_CACHE.pop(f"stock_{new_stock.symbol}", None)
        return jsonify(new_stock.to_dict()), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/stocks/<int:id>', methods=['DELETE'])
def delete_stock(id):
    stock = Stock.query.get_or_404(id)
    db.session.delete(stock)
    db.session.commit()
    return jsonify({'message': 'Stock deleted'}), 200

@app.route('/api/stocks/<int:id>', methods=['PUT'])
def update_stock(id):
    stock = Stock.query.get_or_404(id)
    data = request.json
    try:
        raw_symbol = data.get('symbol', stock.symbol).upper().strip()
        asset_type = data.get('asset_type', stock.asset_type or 'Equity')
        currency = data.get('currency', stock.currency).upper()
        new_symbol = normalize_crypto_symbol(raw_symbol, asset_type, currency)

        if new_symbol != stock.symbol:
            stock.ai_recommendation = None
            MARKET_CACHE.pop(f"stock_{stock.symbol}", None)
            MARKET_CACHE.pop(f"stock_{new_symbol}", None)
            
        stock.symbol = new_symbol
        stock.name = data.get('name', stock.name)
        stock.quantity = float(data.get('quantity', stock.quantity))
        stock.purchase_price = float(data.get('purchase_price', stock.purchase_price))
        stock.currency = currency
        stock.purchase_date = data.get('purchase_date', stock.purchase_date) or 'Inconnue'
        stock.asset_type = asset_type
        if 'notes' in data:
            stock.notes = data.get('notes')
        if 'manual_price' in data:
            mp = data.get('manual_price')
            stock.manual_price = float(mp) if (mp is not None and str(mp).strip() != '') else None

        db.session.commit()
        MARKET_CACHE.pop(f"stock_{stock.symbol}", None)
        return jsonify(stock.to_dict()), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/stocks/<int:id>/price', methods=['PUT'])
def update_stock_manual_price(id):
    """Quick update of last known price for instruments without automated feed."""
    stock = Stock.query.get_or_404(id)
    data = request.json or {}
    price = data.get('manual_price') or data.get('price')
    try:
        stock.manual_price = float(price) if price is not None and float(price) > 0 else None
        db.session.commit()
        MARKET_CACHE.pop(f"stock_{stock.symbol}", None)
        return jsonify({'message': 'Cours mis à jour', 'stock': stock.to_dict()}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/stocks/<symbol>/history', methods=['GET'])
def get_stock_history(symbol):
    """Return historical time-series data for Chart.js interactive graph."""
    period = request.args.get('period', '1mo')
    try:
        ticker = yf.Ticker(symbol.upper())
        hist = ticker.history(period=period)
        if hist.empty:
            return jsonify({'symbol': symbol, 'history': []})
        
        points = []
        for dt, row in hist.iterrows():
            points.append({
                'date': dt.strftime('%Y-%m-%d'),
                'close': round(float(row['Close']), 2),
                'volume': int(row.get('Volume', 0))
            })
        return jsonify({
            'symbol': symbol.upper(),
            'period': period,
            'history': points
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/settings', methods=['GET', 'POST'])
def handle_settings():
    if request.method == 'GET':
        config = load_config()
        profile = get_investor_profile()
        return jsonify({
            'has_api_key': bool(get_api_key()),
            'reference_currency': config.get('reference_currency', 'CHF'),
            'risk_profile': profile['risk_profile'],
            'investment_horizon': profile['investment_horizon'],
            'investment_goal': profile['investment_goal'],
            'max_position_weight': profile['max_position_weight'],
            'profile_details': profile
        })
    
    data = request.json or {}
    api_key = data.get('api_key')
    ref_curr = data.get('reference_currency')
    risk_profile = data.get('risk_profile')
    investment_horizon = data.get('investment_horizon')
    investment_goal = data.get('investment_goal')
    max_position_weight = data.get('max_position_weight')
    
    updates = {}
    if api_key is not None:
        updates['gemini_api_key'] = api_key.strip()
    if ref_curr is not None:
        updates['reference_currency'] = ref_curr.upper()
    if risk_profile is not None:
        updates['risk_profile'] = risk_profile
    if investment_horizon is not None:
        updates['investment_horizon'] = investment_horizon
    if investment_goal is not None:
        updates['investment_goal'] = investment_goal
    if max_position_weight is not None:
        try:
            updates['max_position_weight'] = float(max_position_weight)
        except (ValueError, TypeError):
            pass
        
    save_config(updates)
    return jsonify({'message': 'Paramètres et profil investisseur enregistrés avec succès !'}), 200

@app.route('/api/stocks/<int:id>/technical', methods=['GET'])
def get_stock_technical_indicators(id):
    """Fetch live technical indicators and money management metrics for a stock."""
    stock = Stock.query.get_or_404(id)
    details = fetch_single_stock_details(stock.symbol, stock.purchase_price, stock.currency)
    cp = details.get('current_price', stock.purchase_price)
    tech = compute_technical_indicators(stock.symbol, cp, stock.asset_type, stock.currency)
    return jsonify(tech)

# --- GEMINI AI HELPERS & ROUTES ---

def call_gemini_with_fallback(api_key, prompt):
    """Call Google Gemini model with fallback mechanism."""
    models_to_try = ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite']
    client = genai.Client(api_key=api_key)
    last_error = None

    for model in models_to_try:
        try:
            response = client.models.generate_content(
                model=model,
                contents=prompt
            )
            if response and response.text:
                return response.text, model
        except Exception as e:
            last_error = e
            print(f"Gemini model {model} failed: {e}")
            continue

    raise Exception(f"Échec des modèles Gemini ({last_error})")

def fetch_rss_news(query, lang='fr', max_items=4):
    """Fetch recent news from Google News RSS in specified language."""
    try:
        encoded = urllib.parse.quote(query)
        if lang == 'fr':
            url = f"https://news.google.com/rss/search?q={encoded}&hl=fr&gl=FR&ceid=FR:fr"
        else:
            url = f"https://news.google.com/rss/search?q={encoded}&hl=en-US&gl=US&ceid=US:en"
            
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        with urllib.request.urlopen(req, timeout=4) as response:
            xml_data = response.read()
            root = ET.fromstring(xml_data)
            items = []
            for item in root.findall('.//item')[:max_items]:
                title = item.find('title').text if item.find('title') is not None else ''
                source = item.find('source').text if item.find('source') is not None else ('Presse FR' if lang == 'fr' else 'Presse US')
                link = item.find('link').text if item.find('link') is not None else ''
                
                if ' - ' in title:
                    title_clean = title.rsplit(' - ', 1)[0]
                else:
                    title_clean = title

                if title_clean:
                    items.append({
                        'title': title_clean.strip(),
                        'publisher': source.strip(),
                        'link': link.strip()
                    })
            return items
    except Exception as e:
        print(f"Error fetching RSS news ({lang}): {e}")
        return []

def fetch_multi_source_news(symbol, name):
    """Aggregate real-time financial & crypto news across Yahoo Finance, Google News FR/CH and Global media."""
    articles = []
    seen_titles = set()

    base_sym = symbol.split('.')[0] if '.' in symbol else symbol
    clean_name = name.replace('Inc.', '').replace('ORD', '').replace('REIT', '').replace('Corp', '').replace('SA', '').replace('USD', '').replace('EUR', '').strip()
    is_crypto = ('-USD' in symbol) or ('-EUR' in symbol) or ('-CHF' in symbol) or ('-CAD' in symbol) or any(c['short'] in symbol for c in POPULAR_CRYPTOS)

    def get_yf():
        try:
            ticker = yf.Ticker(symbol)
            yf_news = ticker.news or []
            res = []
            for n in yf_news[:4]:
                t = n.get('title')
                p = n.get('publisher') or 'Yahoo Finance'
                l = n.get('link') or ''
                if t:
                    res.append({'title': t.strip(), 'publisher': p.strip(), 'link': l})
            return res
        except Exception:
            return []

    def get_gnews_fr():
        if is_crypto:
            return fetch_rss_news(f"{clean_name} {base_sym} crypto bitcoin marché", lang='fr', max_items=3)
        return fetch_rss_news(f"{clean_name} {base_sym} bourse", lang='fr', max_items=3)

    def get_gnews_en():
        if is_crypto:
            return fetch_rss_news(f"{clean_name} {base_sym} crypto market price analysis", lang='en', max_items=3)
        return fetch_rss_news(f"{clean_name} {base_sym} stock financial earnings", lang='en', max_items=3)

    def get_crypto_or_swiss():
        if is_crypto:
            return fetch_rss_news(f"{clean_name} blockchain cryptocurrency token", lang='en', max_items=3)
        return fetch_rss_news(f"{clean_name} {base_sym} swissquote OR suisse", lang='fr', max_items=3)

    with ThreadPoolExecutor(max_workers=4) as executor:
        f_yf = executor.submit(get_yf)
        f_fr = executor.submit(get_gnews_fr)
        f_en = executor.submit(get_gnews_en)
        f_sq = executor.submit(get_crypto_or_swiss)

        for f in [f_yf, f_fr, f_en, f_sq]:
            try:
                for item in f.result():
                    norm = item['title'].lower()[:40]
                    if norm not in seen_titles:
                        seen_titles.add(norm)
                        articles.append(item)
            except Exception:
                pass

    return articles[:10]

@app.route('/api/analyze/<int:id>', methods=['POST'])
def analyze_stock(id):
    api_key = get_api_key()
    if not api_key:
        return jsonify({'error': 'Clé API Gemini non configurée. Veuillez l\'ajouter dans les paramètres.'}), 400
        
    stock = Stock.query.get_or_404(id)
    
    # 1. Multi-source news aggregation & Financial ratios
    articles = fetch_multi_source_news(stock.symbol, stock.name)
    news_summary = ""
    for a in articles:
        news_summary += f"- [{a['publisher']}] {a['title']}\n"
    
    if not news_summary.strip():
        news_summary = "Aucune actualité récente trouvée."

    # 2. Get current price & metrics
    details = fetch_single_stock_details(stock.symbol, stock.purchase_price, stock.currency)
    current_price = details.get('current_price', stock.purchase_price)
    pl_percent = ((current_price - stock.purchase_price) / stock.purchase_price) * 100 if stock.purchase_price > 0 else 0.0
    is_crypto = (stock.asset_type == 'Crypto') or (details.get('quote_type') == 'Crypto') or ('-USD' in stock.symbol)

    # 3. Live Technical Indicators & Money Management
    tech = compute_technical_indicators(stock.symbol, current_price, stock.asset_type, stock.currency)
    profile = get_investor_profile()

    # 4. Calculate portfolio weight & concentration
    all_stocks = Stock.query.all()
    ref_currency = get_reference_currency()
    fx_rates = get_forex_rates()
    total_port_val_ref = 0.0
    this_stock_val_ref = 0.0

    for s in all_stocks:
        s_dt = fetch_single_stock_details(s.symbol, s.purchase_price, s.currency)
        s_cp = s_dt.get('current_price', s.purchase_price)
        s_val_ref = convert_currency(s.quantity * s_cp, s.currency, ref_currency, fx_rates)
        total_port_val_ref += s_val_ref
        if s.id == stock.id:
            this_stock_val_ref = s_val_ref

    pos_weight = (this_stock_val_ref / total_port_val_ref * 100) if total_port_val_ref > 0 else 100.0
    is_overweight = pos_weight > profile['max_position_weight']

    # Technical text block for prompt
    tech_summary = f"""- RSI (14 jours) : {tech['rsi']} ({tech['rsi_status']})
- Tendance & Moyennes Mobiles : {tech['trend']} | SMA 20: {tech['sma20']} | SMA 50: {tech['sma50']} | SMA 200: {tech['sma200'] or 'N/D'}
- Signal Croisement : {'Golden Cross (Haussier)' if tech['golden_cross'] else ('Death Cross (Baissier)' if tech['death_cross'] else 'Neutre')}
- Momentum MACD : {tech['macd_status']} (MACD: {tech['macd']}, Signal: {tech['macd_signal']}, Hist: {tech['macd_hist']})
- Volatilité ATR (14j) : {tech['atr']} {stock.currency} ({tech['atr_pct']}% du cours)
- Niveaux Clés Récent : Support: {tech['support']} {stock.currency} | Résistance: {tech['resistance']} {stock.currency}
- Money Management Suggéré :
  * Stop-Loss de protection : {tech['stop_loss']} {stock.currency} ({tech['stop_loss_pct']:+.1f}%)
  * Take-Profit / Cible : {tech['take_profit']} {stock.currency} ({tech['take_profit_pct']:+.1f}%)
  * Ratio Risque/Rendement (R:R) : 1:{tech['risk_reward_ratio']}"""

    financial_ratios = ""
    if is_crypto:
        mcap = details.get('market_cap')
        vol24 = details.get('volume_24h')
        supply = details.get('circulating_supply')
        high52 = details.get('fifty_two_week_high')
        low52 = details.get('fifty_two_week_low')

        financial_ratios = f"""- Capitalisation boursière (Market Cap) : {f"{mcap:,.0f} {stock.currency}" if mcap else 'N/D'}
- Volume d'échange 24h : {f"{vol24:,.0f} {stock.currency}" if vol24 else 'N/D'}
- Offre en circulation (Circulating Supply) : {f"{supply:,.0f}" if supply else 'N/D'}
- Sommet 52 semaines : {high52 if high52 else 'N/D'} {stock.currency}
- Creux 52 semaines : {low52 if low52 else 'N/D'} {stock.currency}"""

        prompt = f"""
Tu es un expert analyste et gestionnaire d'actifs numériques senior (quant & macro).
Analyse la position crypto suivante de manière approfondie et sur-mesure pour cet investisseur :

PROFIL DE L'INVESTISSEUR :
- Profil de risque : {profile['risk_label']}
- Horizon d'investissement : {profile['horizon_label']}
- Objectif patrimonial : {profile['goal_label']}
- Poids dans le portefeuille : {pos_weight:.1f}% (Seuil max recommandé: {profile['max_position_weight']}%) {'⚠️ ALERTE SURPONDÉRATION' if is_overweight else '✅ Poids conforme'}

INFORMATIONS DE LA POSITION :
- Crypto-Actif : {stock.name} ({stock.symbol})
- Prix d'achat (PRU) : {stock.purchase_price} {stock.currency}
- Prix actuel : {current_price} {stock.currency}
- Plus/Moins-value latente : {pl_percent:+.2f}%
- Quantité détenue : {stock.quantity} (Valeur: {(stock.quantity * current_price):.2f} {stock.currency})

INDICATEURS TECHNIQUES & MONEY MANAGEMENT :
{tech_summary}

MÉTRIQUES ON-CHAIN & MARCHÉ :
{financial_ratios}

ACTUALITÉS RÉCENTES :
{news_summary}

CONSIGNES DE RÉPONSE :
Fournis une analyse structurée et percutante en 4 parties en Markdown :
1. 📌 **Synthèse Fondamentale & Dynamique On-Chain** (Adoption, liquidité, sentiment de marché)
2. 📊 **Analyse Technique & Momentum** (Interprétation du RSI {tech['rsi']}, configuration des moyennes mobiles et MACD)
3. 🛡️ **Gestion du Risque & Money Management** (Validation du Stop-Loss {tech['stop_loss']} {stock.currency} et Take-Profit {tech['take_profit']} {stock.currency}, gestion du poids de {pos_weight:.1f}%)
4. 🎯 **Conseil Stratégique Personnalisé** (Adapté spécifiquement à son profil {profile['risk_profile']} et horizon {profile['investment_horizon']})

Termine OBLIGATOIREMENT ta réponse par la ligne exacte suivante (en majuscules) :
RECOMMANDATION FINALE : [ACHETER / CONSERVER / VENDRE]
"""
    else:
        try:
            ticker = yf.Ticker(stock.symbol)
            info = ticker.info or {}
            pe = info.get('trailingPE')
            div = info.get('dividendYield')
            target = info.get('targetMeanPrice')
            rec_consensus = info.get('recommendationKey')
            
            financial_ratios = f"- P/E (PER): {pe if pe else 'N/D'}\n"
            financial_ratios += f"- Rendement dividende: {round(div*100, 2) if div else 'N/D'}%\n"
            financial_ratios += f"- Prix cible moyen analystes: {target if target else 'N/D'} {stock.currency}\n"
            financial_ratios += f"- Consensus analystes Wall Street: {rec_consensus.upper() if rec_consensus else 'N/D'}\n"
        except Exception:
            financial_ratios = "Ratios non disponibles."

        prompt = f"""
Tu es un gérant de portefeuille et analyste financier senior de Wall Street.
Analyse l'actif suivant de manière approfondie et sur-mesure pour cet investisseur :

PROFIL DE L'INVESTISSEUR :
- Profil de risque : {profile['risk_label']}
- Horizon d'investissement : {profile['horizon_label']}
- Objectif patrimonial : {profile['goal_label']}
- Poids dans le portefeuille : {pos_weight:.1f}% (Seuil max recommandé: {profile['max_position_weight']}%) {'⚠️ ALERTE SURPONDÉRATION' if is_overweight else '✅ Poids conforme'}

INFORMATIONS DE LA POSITION :
- Titre : {stock.name} ({stock.symbol}) [Type: {stock.asset_type or 'Action'}]
- Prix d'achat (PRU) : {stock.purchase_price:.2f} {stock.currency}
- Prix actuel : {current_price:.2f} {stock.currency}
- Plus/Moins-value latente : {pl_percent:+.2f}%
- Quantité : {stock.quantity} (Valeur: {(stock.quantity * current_price):.2f} {stock.currency})

INDICATEURS TECHNIQUES & MONEY MANAGEMENT :
{tech_summary}

INDICATEURS FONDAMENTAUX & CONSENSUS :
{financial_ratios}

ACTUALITÉS RÉCENTES DU MARCHÉ :
{news_summary}

CONSIGNES DE RÉPONSE :
Fournis une analyse structurée et percutante en 4 parties en Markdown :
1. 📌 **Synthèse Fondamentale & Valorisation** (Santé financière, multiples, catalyseurs)
2. 📊 **Analyse Technique & Momentum** (Interprétation du RSI {tech['rsi']}, tendance des moyennes mobiles et MACD)
3. 🛡️ **Gestion du Risque & Money Management** (Validation du Stop-Loss {tech['stop_loss']} {stock.currency} et Take-Profit {tech['take_profit']} {stock.currency}, gestion du poids de {pos_weight:.1f}%)
4. 🎯 **Conseil Stratégique Personnalisé** (Adapté spécifiquement à son profil {profile['risk_profile']} et horizon {profile['investment_horizon']})

Termine OBLIGATOIREMENT ta réponse par la ligne exacte suivante (en majuscules) :
RECOMMANDATION FINALE : [ACHETER / CONSERVER / VENDRE]
"""

    try:
        analysis_text, model_used = call_gemini_with_fallback(api_key, prompt)
        
        # Robust extraction
        rec = "CONSERVER"
        if "RECOMMANDATION FINALE : ACHETER" in analysis_text or "RECOMMANDATION : ACHETER" in analysis_text:
            rec = "ACHETER"
        elif "RECOMMANDATION FINALE : VENDRE" in analysis_text or "RECOMMANDATION : VENDRE" in analysis_text:
            rec = "VENDRE"
        elif "RECOMMANDATION FINALE : CONSERVER" in analysis_text or "RECOMMANDATION : CONSERVER" in analysis_text:
            rec = "CONSERVER"
        else:
            t_upper = analysis_text.upper()
            if "ACHETER" in t_upper and "VENDRE" not in t_upper:
                rec = "ACHETER"
            elif "VENDRE" in t_upper and "ACHETER" not in t_upper:
                rec = "VENDRE"

        stock.ai_recommendation = rec
        db.session.commit()

        # Save to history
        hist_entry = AnalysisHistory(
            stock_id=stock.id,
            symbol=stock.symbol,
            analysis_type='stock',
            recommendation=rec,
            analysis_text=analysis_text
        )
        db.session.add(hist_entry)
        db.session.commit()

        return jsonify({
            'analysis': analysis_text,
            'recommendation': rec,
            'news': news_summary,
            'news_items': articles,
            'model_used': model_used,
            'technical': tech,
            'profile': profile,
            'weight_info': {
                'weight_pct': round(pos_weight, 1),
                'max_allowed_pct': profile['max_position_weight'],
                'is_overweight': is_overweight
            }
        })
    except Exception as e:
        return jsonify({'error': f"Erreur Gemini IA: {str(e)}"}), 500

@app.route('/api/analyze-all', methods=['POST'])
def analyze_all_stocks():
    """Batch analyze all portfolio positions with Gemini."""
    api_key = get_api_key()
    if not api_key:
        return jsonify({'error': 'Clé API Gemini non configurée.'}), 400

    stocks = Stock.query.all()
    if not stocks:
        return jsonify({'error': 'Aucune position à analyser.'}), 400

    profile = get_investor_profile()
    updated_count = 0
    errors = []

    for stock in stocks:
        try:
            # Multi-source news & fundamentals
            articles = fetch_multi_source_news(stock.symbol, stock.name)
            news_summary = ""
            for a in articles[:3]:
                news_summary += f"- [{a['publisher']}] {a['title']}\n"

            details = fetch_single_stock_details(stock.symbol, stock.purchase_price, stock.currency)
            current_price = details.get('current_price', stock.purchase_price)
            pl_percent = ((current_price - stock.purchase_price) / stock.purchase_price) * 100 if stock.purchase_price > 0 else 0.0
            
            tech = compute_technical_indicators(stock.symbol, current_price, stock.asset_type, stock.currency)

            prompt = f"""
Tu es un gérant de portefeuille expert.
Analyse l'actif {stock.name} ({stock.symbol}) [Type: {stock.asset_type or 'Action'}] pour un profil {profile['risk_label']} (Horizon: {profile['horizon_label']}) :
- PRU: {stock.purchase_price} {stock.currency} | Cours: {current_price} {stock.currency} | Plus-value: {pl_percent:+.1f}%
- RSI (14j): {tech['rsi']} | Tendance: {tech['trend']} | MACD: {tech['macd_status']}
- Stop-Loss suggéré: {tech['stop_loss']} {stock.currency} | Take-Profit: {tech['take_profit']} {stock.currency}
Actualités récentes :
{news_summary}

Donne une recommandation concise et adaptée au profil.
Termine obligatoirement par :
RECOMMANDATION FINALE : [ACHETER / CONSERVER / VENDRE]
"""
            analysis_text, model_used = call_gemini_with_fallback(api_key, prompt)
            rec = "CONSERVER"
            if "RECOMMANDATION FINALE : ACHETER" in analysis_text or "RECOMMANDATION : ACHETER" in analysis_text:
                rec = "ACHETER"
            elif "RECOMMANDATION FINALE : VENDRE" in analysis_text or "RECOMMANDATION : VENDRE" in analysis_text:
                rec = "VENDRE"
            elif "RECOMMANDATION FINALE : CONSERVER" in analysis_text or "RECOMMANDATION : CONSERVER" in analysis_text:
                rec = "CONSERVER"
            else:
                t_upper = analysis_text.upper()
                if "ACHETER" in t_upper and "VENDRE" not in t_upper:
                    rec = "ACHETER"
                elif "VENDRE" in t_upper and "ACHETER" not in t_upper:
                    rec = "VENDRE"

            stock.ai_recommendation = rec
            db.session.commit()
            updated_count += 1
        except Exception as e:
            errors.append(f"{stock.symbol}: {e}")

    return jsonify({
        'message': f"{updated_count} position(s) analysée(s) et actualisée(s) selon votre profil ({profile['risk_profile']}) !",
        'updated_count': updated_count,
        'errors': errors
    }), 200

@app.route('/api/analyze-portfolio', methods=['POST'])
def analyze_portfolio():
    """Audit and diagnose the entire portfolio using Gemini tailored to investor profile."""
    api_key = get_api_key()
    if not api_key:
        return jsonify({'error': 'Clé API Gemini non configurée.'}), 400

    stocks = Stock.query.all()
    if not stocks:
        return jsonify({'error': 'Votre portefeuille est vide.'}), 400

    ref_currency = get_reference_currency()
    fx_rates = get_forex_rates()
    profile = get_investor_profile()

    portfolio_lines = []
    total_val_ref = 0.0

    for s in stocks:
        details = fetch_single_stock_details(s.symbol, s.purchase_price, s.currency)
        cp = details.get('current_price', s.purchase_price)
        val_native = s.quantity * cp
        val_ref = convert_currency(val_native, s.currency, ref_currency, fx_rates)
        pl_pct = ((cp - s.purchase_price) / s.purchase_price * 100) if s.purchase_price > 0 else 0
        total_val_ref += val_ref

        portfolio_lines.append({
            'symbol': s.symbol,
            'name': s.name,
            'type': s.asset_type or 'Action',
            'val_ref': val_ref,
            'pl_pct': pl_pct,
            'ai_rec': s.ai_recommendation or 'Non analysé'
        })

    summary_text = ""
    overweight_lines = []
    for item in portfolio_lines:
        weight = (item['val_ref'] / total_val_ref * 100) if total_val_ref > 0 else 0
        is_ow = weight > profile['max_position_weight']
        if is_ow:
            overweight_lines.append(f"{item['symbol']} ({weight:.1f}%)")
        tag_ow = " ⚠️ [SURPONDÉRÉ]" if is_ow else ""
        summary_text += f"- **{item['symbol']}** ({item['name']}) | Type: {item['type']} | Poids: {weight:.1f}%{tag_ow} | Perf: {item['pl_pct']:+.1f}% | Avis IA: {item['ai_rec']}\n"

    prompt = f"""
Tu es un chef stratégiste en investissement et gestionnaire de patrimoine senior de renommée mondiale.
Effectue un AUDIT STRATÉGIQUE COMPLET ET DÉTAILLÉ du portefeuille suivant (comprenant actions, ETFs, fonds et/ou crypto-actifs) EN CONFRONTANT L'ALLOCATION RÉELLE AU PROFIL D'INVESTISSEUR DU CLIENT :

PROFIL D'INVESTISSEUR DU CLIENT :
- Profil de risque : {profile['risk_label']}
- Horizon d'investissement : {profile['horizon_label']}
- Objectif patrimonial : {profile['goal_label']}
- Seuil max recommandé par ligne : {profile['max_position_weight']}% {'(Lignes surpondérées: ' + ', '.join(overweight_lines) + ')' if overweight_lines else '(Aucune surpondération majeure)'}

VALEUR TOTALE ESTIMÉE : {total_val_ref:,.2f} {ref_currency}
NOMBRE DE LIGNES : {len(portfolio_lines)}

DÉTAIL DES POSITIONS ACTUELLES :
{summary_text}

STRUCTURE EXIGÉE DU RAPPORT (en français, format Markdown riche et professionnel avec émojis, sous-titres et tableaux si pertinent) :

1. 📊 **Diagnostic Global & Adéquation au Profil ({profile['risk_profile']})**
   - Score chiffré de santé et de diversification globale (0 à 100).
   - Évaluation de la cohérence entre le profil souhaité ({profile['risk_profile']}) et l'allocation réelle observée (détection des déséquilibres, surexposition ou manque de diversification).

2. ⚡ **Stratégie & Niveaux Tactiques Court Terme (1 à 6 mois)**
   - **Gestion des risques & Lignes volatiles** : Diagnostic des actifs à fort beta ou cryptos.
   - **Prises de bénéfices & Allègements opportuns** : Identification des lignes mûres pour sécuriser des gains ou réduire une surpondération.
   - **Opportunités d'entrées / Renforcements tactiques**.

3. 🏛️ **Vision Stratégique & Rendement Long Terme (3 à 5+ ans)**
   - **Solidité des Fondamentaux & Mégatendances** (Qualité des bilans d'entreprises, adoption technologique, cryptos majeures).
   - **Rendement & Cash-Flow Passif** (Pérennité des dividendes et staking).
   - **Résilience aux chocs de marché et inflation**.

4. 🎯 **Plan d'Action & Arbitrages Recommandés**
   - 3 à 5 recommandations prioritaires claires, chiffrées et personnalisées pour optimiser le ratio rendement / risque selon ses objectifs.
"""

    try:
        analysis_text, model_used = call_gemini_with_fallback(api_key, prompt)
        
        hist_entry = AnalysisHistory(
            stock_id=None,
            symbol='PORTFOLIO',
            analysis_type='portfolio',
            recommendation='AUDIT',
            analysis_text=analysis_text
        )
        db.session.add(hist_entry)
        db.session.commit()

        return jsonify({
            'analysis': analysis_text,
            'model_used': model_used,
            'profile': profile
        })
    except Exception as e:
        return jsonify({'error': f"Erreur Gemini IA: {str(e)}"}), 500

# --- PORTFOLIO NEWS FEED ---
PORTFOLIO_NEWS_CACHE = {'timestamp': 0, 'news': []}
NEWS_CACHE_TTL = 300

@app.route('/api/news', methods=['GET'])
def get_portfolio_news():
    """Aggregate and return latest important news across all portfolio holdings."""
    global PORTFOLIO_NEWS_CACHE
    now = time.time()
    force_refresh = request.args.get('refresh', '0') == '1'
    symbol_filter = request.args.get('symbol', '').strip().upper()

    if not force_refresh and PORTFOLIO_NEWS_CACHE['news'] and (now - PORTFOLIO_NEWS_CACHE['timestamp'] < NEWS_CACHE_TTL):
        all_news = PORTFOLIO_NEWS_CACHE['news']
    else:
        stocks = Stock.query.all()
        all_news = []
        seen = set()

        with ThreadPoolExecutor(max_workers=min(8, max(len(stocks), 1))) as executor:
            future_to_stock = {
                executor.submit(fetch_multi_source_news, s.symbol, s.name): s
                for s in stocks
            }
            for future in as_completed(future_to_stock):
                s = future_to_stock[future]
                try:
                    articles = future.result()
                    for a in articles:
                        key = a['title'].lower()[:40]
                        if key not in seen:
                            seen.add(key)
                            all_news.append({
                                'title': a['title'],
                                'publisher': a['publisher'],
                                'link': a['link'],
                                'symbol': s.symbol,
                                'stock_name': s.name,
                                'asset_type': s.asset_type or 'Equity'
                            })
                except Exception as e:
                    print(f"Error fetching news for {s.symbol}: {e}")

        PORTFOLIO_NEWS_CACHE = {'timestamp': now, 'news': all_news}

    if symbol_filter:
        filtered = [n for n in all_news if n['symbol'] == symbol_filter]
        return jsonify({'news': filtered, 'count': len(filtered)})

    return jsonify({'news': all_news, 'count': len(all_news)})

# --- EXPORT & IMPORT ---

@app.route('/api/stocks/export', methods=['GET'])
def export_stocks():
    export_format = request.args.get('format', 'json').lower()
    stocks = Stock.query.all()
    stocks_data = [s.to_dict() for s in stocks]

    if export_format == 'csv':
        output = io.StringIO()
        fieldnames = ['symbol', 'name', 'purchase_date', 'quantity', 'purchase_price', 'currency', 'asset_type', 'notes']
        writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        for s in stocks_data:
            writer.writerow(s)
        
        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={"Content-disposition": "attachment; filename=portefeuille_bourse.csv"}
        )
    
    return Response(
        json.dumps(stocks_data, indent=2, ensure_ascii=False),
        mimetype="application/json",
        headers={"Content-disposition": "attachment; filename=portefeuille_bourse.json"}
    )

# --- BACKUP & RESTORE UTILITIES & ROUTES ---

BACKUP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backups')
os.makedirs(BACKUP_DIR, exist_ok=True)

def create_full_backup_archive(prefix="bourse_backup"):
    """
    Creates a full ZIP archive containing:
    - instance/stocks.db
    - config.json
    - data_export.json (all stocks + analysis history)
    - backup_metadata.json
    Returns (zip_filepath, filename, metadata)
    """
    now_str = datetime.now().strftime('%Y-%m-%d_%H%M%S')
    filename = f"{prefix}_{now_str}.zip"
    zip_path = os.path.join(BACKUP_DIR, filename)

    stocks = Stock.query.all()
    history = AnalysisHistory.query.all()
    config = load_config()

    data_dump = {
        'version': '2.0',
        'timestamp': datetime.now().isoformat(),
        'config': config,
        'stocks': [s.to_dict() for s in stocks],
        'history': [h.to_dict() for h in history]
    }

    metadata = {
        'filename': filename,
        'created_at': datetime.now().strftime('%d/%m/%Y %H:%M:%S'),
        'timestamp_raw': time.time(),
        'stocks_count': len(stocks),
        'history_count': len(history),
        'has_config': bool(config),
        'size_bytes': 0
    }

    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance', 'stocks.db')

    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        if os.path.exists(db_path):
            zipf.write(db_path, arcname='stocks.db')
        if os.path.exists(CONFIG_FILE):
            zipf.write(CONFIG_FILE, arcname='config.json')
        zipf.writestr('data_export.json', json.dumps(data_dump, indent=2, ensure_ascii=False))
        zipf.writestr('backup_metadata.json', json.dumps(metadata, indent=2, ensure_ascii=False))

    metadata['size_bytes'] = os.path.getsize(zip_path)
    return zip_path, filename, metadata

def _restore_from_json_dict(data):
    """Helper to restore database entries from a data dictionary."""
    if isinstance(data, dict):
        if 'config' in data and isinstance(data['config'], dict):
            save_config(data['config'])
        stocks_list = data.get('stocks', [])
        history_list = data.get('history', [])
    elif isinstance(data, list):
        stocks_list = data
        history_list = []
    else:
        stocks_list = []
        history_list = []

    # Reset tables
    db.session.query(Stock).delete()
    if history_list:
        db.session.query(AnalysisHistory).delete()

    for s in stocks_list:
        stock = Stock(
            symbol=s.get('symbol', '').strip().upper(),
            name=s.get('name', ''),
            purchase_date=s.get('purchase_date', 'Inconnue'),
            quantity=float(s.get('quantity', 1)),
            purchase_price=float(s.get('purchase_price', 0)),
            currency=s.get('currency', 'USD').strip().upper(),
            asset_type=s.get('asset_type', 'Equity'),
            notes=s.get('notes', ''),
            manual_price=float(s.get('manual_price')) if (s.get('manual_price') is not None and str(s.get('manual_price')).strip() != '') else None,
            ai_recommendation=s.get('ai_recommendation')
        )
        db.session.add(stock)

    for h in history_list:
        hist = AnalysisHistory(
            stock_id=h.get('stock_id'),
            symbol=h.get('symbol', ''),
            analysis_type=h.get('analysis_type', 'stock'),
            recommendation=h.get('recommendation'),
            analysis_text=h.get('analysis_text', '')
        )
        db.session.add(hist)

    db.session.commit()

def restore_from_archive_file(file_or_path, is_upload=True):
    """
    Restores application data from a ZIP archive, DB file or JSON file.
    Creates an automatic emergency safety snapshot before any replacement.
    """
    # 1. Automatic emergency pre-restore snapshot
    try:
        create_full_backup_archive(prefix="pre_restore_safety_snapshot")
    except Exception as e:
        print(f"Safety snapshot error: {e}")

    db_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance')
    os.makedirs(db_dir, exist_ok=True)
    db_target = os.path.join(db_dir, 'stocks.db')

    restored_items = []

    if not is_upload and isinstance(file_or_path, str):
        # Local zip file
        if not os.path.exists(file_or_path):
            raise Exception("Le fichier de sauvegarde local n'existe pas.")
            
        with zipfile.ZipFile(file_or_path, 'r') as zipf:
            namelist = zipf.namelist()
            if 'stocks.db' in namelist:
                db.session.remove()
                with open(db_target, 'wb') as f_out:
                    f_out.write(zipf.read('stocks.db'))
                restored_items.append("Base de données SQLite (stocks.db)")
            if 'config.json' in namelist:
                with open(CONFIG_FILE, 'wb') as f_out:
                    f_out.write(zipf.read('config.json'))
                restored_items.append("Configuration (config.json)")
            if not restored_items and 'data_export.json' in namelist:
                data = json.loads(zipf.read('data_export.json').decode('utf-8'))
                _restore_from_json_dict(data)
                restored_items.append("Données depuis export JSON")

    elif is_upload:
        # FileStorage object from request.files
        file = file_or_path
        filename = file.filename.lower()
        if filename.endswith('.zip'):
            zip_bytes = io.BytesIO(file.read())
            with zipfile.ZipFile(zip_bytes, 'r') as zipf:
                namelist = zipf.namelist()
                if 'stocks.db' in namelist:
                    db.session.remove()
                    with open(db_target, 'wb') as f_out:
                        f_out.write(zipf.read('stocks.db'))
                    restored_items.append("Base de données SQLite (stocks.db)")
                if 'config.json' in namelist:
                    with open(CONFIG_FILE, 'wb') as f_out:
                        f_out.write(zipf.read('config.json'))
                    restored_items.append("Configuration (config.json)")
                if not restored_items and 'data_export.json' in namelist:
                    data = json.loads(zipf.read('data_export.json').decode('utf-8'))
                    _restore_from_json_dict(data)
                    restored_items.append("Données depuis export JSON")

        elif filename.endswith('.db') or filename.endswith('.sqlite') or filename.endswith('.sqlite3'):
            db.session.remove()
            file.save(db_target)
            restored_items.append("Base de données SQLite (.db)")

        elif filename.endswith('.json'):
            content = file.read().decode('utf-8')
            data = json.loads(content)
            _restore_from_json_dict(data)
            restored_items.append("Données JSON")
        else:
            raise Exception("Format de fichier non supporté. Utilisez une archive .zip, un fichier .db ou .json")

    # Clear memory caches
    MARKET_CACHE.clear()
    PORTFOLIO_NEWS_CACHE['news'] = []
    
    # Run migration check on restored database
    migrate_db()
    
    return restored_items

@app.route('/api/backup/download', methods=['GET'])
def download_backup():
    """Create a full zip backup and trigger browser download."""
    try:
        zip_path, filename, metadata = create_full_backup_archive(prefix="bourse_backup")
        return send_file(
            zip_path,
            as_attachment=True,
            download_name=filename,
            mimetype='application/zip'
        )
    except Exception as e:
        return jsonify({'error': f"Erreur lors de la création de la sauvegarde : {str(e)}"}), 500

@app.route('/api/backup/create-snapshot', methods=['POST'])
def create_snapshot():
    """Create a local timestamped snapshot stored in the backups/ folder."""
    try:
        zip_path, filename, metadata = create_full_backup_archive(prefix="bourse_snapshot")
        return jsonify({
            'success': True,
            'filename': filename,
            'message': f"Point de restauration créé avec succès ({metadata['stocks_count']} positions) !",
            'metadata': metadata
        }), 201
    except Exception as e:
        return jsonify({'success': False, 'error': f"Erreur lors de la création du point de restauration : {str(e)}"}), 500

@app.route('/api/backup/list', methods=['GET'])
def list_backups():
    """List all available local backup files in backups/ directory."""
    backups = []
    if os.path.exists(BACKUP_DIR):
        for f in os.listdir(BACKUP_DIR):
            if f.endswith('.zip'):
                fpath = os.path.join(BACKUP_DIR, f)
                stat = os.stat(fpath)
                size_kb = round(stat.st_size / 1024, 1)
                size_formatted = f"{round(size_kb / 1024, 2)} Mo" if size_kb > 1024 else f"{size_kb} Ko"
                btype = 'safety' if 'safety_snapshot' in f else ('manual' if ('bourse_snapshot' in f or 'cli_backup' in f) else 'auto')

                item = {
                    'filename': f,
                    'size_bytes': stat.st_size,
                    'size_kb': size_kb,
                    'size_formatted': size_formatted,
                    'created_at': datetime.fromtimestamp(stat.st_mtime).strftime('%d/%m/%Y %H:%M:%S'),
                    'mtime': stat.st_mtime,
                    'type': btype,
                    'is_safety_snapshot': btype == 'safety',
                    'stocks_count': None
                }
                # Try to peek metadata from zip
                try:
                    with zipfile.ZipFile(fpath, 'r') as zf:
                        if 'backup_metadata.json' in zf.namelist():
                            meta = json.loads(zf.read('backup_metadata.json').decode('utf-8'))
                            item['stocks_count'] = meta.get('stocks_count')
                            item['created_at'] = meta.get('created_at', item['created_at'])
                except Exception:
                    pass
                backups.append(item)

    # Sort descending by modification time
    backups.sort(key=lambda x: x['mtime'], reverse=True)
    return jsonify({'success': True, 'backups': backups, 'count': len(backups)})

@app.route('/api/backup/restore', methods=['POST'])
def restore_backup():
    """Restore entire database and config from uploaded .zip, .db, or .json file."""
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'Aucun fichier sélectionné.'}), 400
        
        file = request.files['file']
        if not file or not file.filename:
            return jsonify({'success': False, 'error': 'Nom de fichier invalide.'}), 400

        restored_items = restore_from_archive_file(file, is_upload=True)
        items_str = ", ".join(restored_items) if restored_items else "Données"
        return jsonify({
            'success': True,
            'message': f"Restauration réussie ({items_str}) ! Vos données sont prêtes.",
            'restored_items': restored_items
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': f"Erreur de restauration : {str(e)}"}), 500

@app.route('/api/backup/restore-local/<path:filename>', methods=['POST'])
def restore_local_backup(filename):
    """Restore from an existing local backup archive in the backups/ folder."""
    try:
        # Sanitize filename
        safe_filename = os.path.basename(filename)
        local_path = os.path.join(BACKUP_DIR, safe_filename)
        if not os.path.exists(local_path):
            return jsonify({'success': False, 'error': 'Fichier de sauvegarde introuvable.'}), 404

        restored_items = restore_from_archive_file(local_path, is_upload=False)
        items_str = ", ".join(restored_items) if restored_items else "Données"
        return jsonify({
            'success': True,
            'message': f"Point de restauration '{safe_filename}' restauré avec succès ({items_str}) !",
            'restored_items': restored_items
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': f"Erreur lors de la restauration locale : {str(e)}"}), 500

@app.route('/api/backup/delete-local/<path:filename>', methods=['DELETE'])
def delete_local_backup(filename):
    """Delete a local backup archive from backups/."""
    try:
        safe_filename = os.path.basename(filename)
        local_path = os.path.join(BACKUP_DIR, safe_filename)
        if os.path.exists(local_path):
            os.remove(local_path)
            return jsonify({'success': True, 'message': f"Sauvegarde '{safe_filename}' supprimée."})
        return jsonify({'success': False, 'error': 'Fichier non trouvé.'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': f"Erreur de suppression : {str(e)}"}), 500

@app.route('/api/backup/download-local/<path:filename>', methods=['GET'])
def download_local_backup(filename):
    """Download an existing local backup file."""
    safe_filename = os.path.basename(filename)
    local_path = os.path.join(BACKUP_DIR, safe_filename)
    if os.path.exists(local_path):
        return send_file(
            local_path,
            as_attachment=True,
            download_name=safe_filename,
            mimetype='application/zip'
        )
    return jsonify({'error': 'Fichier introuvable.'}), 404

if __name__ == '__main__':
    app.run(debug=True, port=3000)

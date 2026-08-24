import os
import json
import time
import csv
import io
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import Flask, render_template, request, jsonify, Response
from flask_sqlalchemy import SQLAlchemy
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
            'notes': self.notes or ''
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
            'timestamp': self.timestamp.strftime('%Y-%m-%d %H:%M:%S') if self.timestamp else '',
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

# --- MARKET DATA & FOREX CACHE ---
# Cache structure: { key: { 'data': ..., 'timestamp': float } }
MARKET_CACHE = {}
FOREX_CACHE = {'rates': {}, 'timestamp': 0}
CACHE_TTL = 300  # 5 minutes
FOREX_TTL = 600  # 10 minutes

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

def is_valid_price(price, fallback_price):
    if price is None or price <= 0:
        return False
    if fallback_price and fallback_price > 0 and price < fallback_price * 0.001:
        return False
    return True

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
        'price_unavailable': False,
        'quote_type': 'Equity'
    }

    try:
        ticker = yf.Ticker(symbol)
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

        # Fetch extra fundamentals (lightweight/safe)
        try:
            info = ticker.info or {}
            if info:
                data['pe_ratio'] = info.get('trailingPE') or info.get('forwardPE')
                
                # Dividend Rate (Amount per share per year)
                div_rate = info.get('dividendRate') or info.get('trailingAnnualDividendRate')
                if div_rate and float(div_rate) > 0:
                    data['dividend_rate'] = float(div_rate)
                else:
                    data['dividend_rate'] = None
                
                # Dividend Yield (%)
                raw_yield = info.get('dividendYield')
                if raw_yield is None:
                    raw_yield = info.get('trailingAnnualDividendYield')
                
                if raw_yield is not None:
                    raw_val = float(raw_yield)
                    # yfinance returns yield either as percentage (e.g. 3.5 for 3.5%) or decimal (e.g. 0.035)
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
                if not data['currency'] or data['currency'] == fallback_currency:
                    data['currency'] = info.get('currency', fallback_currency).upper()
                data['quote_type'] = info.get('quoteType', 'Equity')
        except Exception:
            pass

    except Exception as e:
        print(f"Error fetching detailed market data for {symbol}: {e}")

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
    """Search for stocks, ETFs, and funds by name or ticker symbol."""
    query = request.args.get('q', '').strip()
    if not query or len(query) < 2:
        return jsonify([])
    try:
        search = yf.Search(query, max_results=8)
        quotes = search.quotes
        results = []
        for q in quotes:
            symbol = q.get('symbol', '')
            name = q.get('longname') or q.get('shortname') or symbol
            type_disp = q.get('typeDisp', q.get('quoteType', ''))
            exchange = q.get('exchange', '')
            results.append({
                'symbol': symbol,
                'name': name,
                'type': type_disp,
                'exchange': exchange
            })
        return jsonify(results)
    except Exception as e:
        print(f"Search error: {e}")
        return jsonify([])

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
        
        current_price = details.get('current_price', s.purchase_price)
        price_unavailable = details.get('price_unavailable', False)
        
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
            # Financial metrics
            'day_change': details.get('day_change', 0.0),
            'day_change_percent': details.get('day_change_percent', 0.0),
            'sparkline': details.get('sparkline', []),
            'pe_ratio': details.get('pe_ratio'),
            'dividend_yield': div_yield,
            'annual_dividend_ref': annual_div_converted,
            'fifty_two_week_high': details.get('fifty_two_week_high'),
            'fifty_two_week_low': details.get('fifty_two_week_low'),
            'quote_type': details.get('quote_type', s.asset_type or 'Equity')
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
        new_stock = Stock(
            symbol=data['symbol'].upper().strip(),
            name=data['name'].strip(),
            purchase_date=data.get('purchase_date', 'Inconnue') or 'Inconnue',
            quantity=float(data['quantity']),
            purchase_price=float(data['purchase_price']),
            currency=data.get('currency', 'USD').upper(),
            asset_type=data.get('asset_type', 'Equity'),
            notes=data.get('notes', '')
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
        new_symbol = data.get('symbol', stock.symbol).upper().strip()
        if new_symbol != stock.symbol:
            stock.ai_recommendation = None
            MARKET_CACHE.pop(f"stock_{stock.symbol}", None)
            MARKET_CACHE.pop(f"stock_{new_symbol}", None)
            
        stock.symbol = new_symbol
        stock.name = data.get('name', stock.name)
        stock.quantity = float(data.get('quantity', stock.quantity))
        stock.purchase_price = float(data.get('purchase_price', stock.purchase_price))
        stock.currency = data.get('currency', stock.currency).upper()
        stock.purchase_date = data.get('purchase_date', stock.purchase_date) or 'Inconnue'
        if 'asset_type' in data:
            stock.asset_type = data.get('asset_type')
        if 'notes' in data:
            stock.notes = data.get('notes')

        db.session.commit()
        return jsonify(stock.to_dict()), 200
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
        return jsonify({
            'has_api_key': bool(get_api_key()),
            'reference_currency': config.get('reference_currency', 'CHF')
        })
    
    data = request.json or {}
    api_key = data.get('api_key')
    ref_curr = data.get('reference_currency')
    
    updates = {}
    if api_key is not None:
        updates['gemini_api_key'] = api_key.strip()
    if ref_curr is not None:
        updates['reference_currency'] = ref_curr.upper()
        
    save_config(updates)
    return jsonify({'message': 'Paramètres enregistrés'}), 200

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

@app.route('/api/analyze/<int:id>', methods=['POST'])
def analyze_stock(id):
    api_key = get_api_key()
    if not api_key:
        return jsonify({'error': 'Clé API Gemini non configurée. Veuillez l\'ajouter dans les paramètres.'}), 400
        
    stock = Stock.query.get_or_404(id)
    
    # 1. Fetch recent news & financials
    news_summary = ""
    financial_ratios = ""
    try:
        ticker = yf.Ticker(stock.symbol)
        news = ticker.news or []
        for n in news[:5]:
            title = n.get('title')
            pub = n.get('publisher', '')
            if title:
                news_summary += f"- {title} ({pub})\n"
        
        info = ticker.info or {}
        pe = info.get('trailingPE')
        div = info.get('dividendYield')
        target = info.get('targetMeanPrice')
        rec = info.get('recommendationKey')
        
        financial_ratios = f"- P/E (PER): {pe if pe else 'N/D'}\n"
        financial_ratios += f"- Rendement dividende: {round(div*100, 2) if div else 'N/D'}%\n"
        financial_ratios += f"- Prix cible moyen analystes: {target if target else 'N/D'} {stock.currency}\n"
        financial_ratios += f"- Consensus analystes: {rec.upper() if rec else 'N/D'}\n"
    except Exception as e:
        news_summary = "Actualités non disponibles pour ce titre."
        financial_ratios = "Ratios non disponibles."

    if not news_summary.strip():
        news_summary = "Aucune actualité récente trouvée."

    # 2. Get current price context
    details = fetch_single_stock_details(stock.symbol, stock.purchase_price, stock.currency)
    current_price = details.get('current_price', stock.purchase_price)
    pl_percent = ((current_price - stock.purchase_price) / stock.purchase_price) * 100 if stock.purchase_price > 0 else 0.0

    # 3. Call Gemini
    prompt = f"""
Tu es un gérant de portefeuille et analyste financier senior de Wall Street.
Analyse l'actif suivant pour un investisseur individuel :

INFORMATIONS DE LA POSITION :
- Titre : {stock.name} ({stock.symbol})
- Type : {stock.asset_type or 'Action'}
- Prix d'achat (PRU) : {stock.purchase_price:.2f} {stock.currency}
- Prix actuel : {current_price:.2f} {stock.currency}
- Plus/Moins-value latente : {pl_percent:+.2f}%
- Quantité : {stock.quantity} (Valeur: {(stock.quantity * current_price):.2f} {stock.currency})

INDICATEURS FONDAMENTAUX & CONSENSUS :
{financial_ratios}

ACTUALITÉS RÉCENTES DU MARCHÉ :
{news_summary}

CONSIGNES DE RÉPONSE :
1. Fournis une analyse concise mais percutante en 3 parties en Markdown :
   - 📌 **Synthèse de la situation & Dynamique actuelle**
   - ⚖️ **Points forts et Risques majeurs**
   - 🎯 **Plan d'action & Stratégie recommandée**
2. Termine OBLIGATOIREMENT ta réponse par la ligne exacte suivante (en majuscules) :
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
            'model_used': model_used
        })
    except Exception as e:
        return jsonify({'error': f"Erreur Gemini IA: {str(e)}"}), 500

@app.route('/api/analyze-portfolio', methods=['POST'])
def analyze_portfolio():
    """Audit and diagnose the entire portfolio using Gemini."""
    api_key = get_api_key()
    if not api_key:
        return jsonify({'error': 'Clé API Gemini non configurée.'}), 400

    stocks = Stock.query.all()
    if not stocks:
        return jsonify({'error': 'Votre portefeuille est vide.'}), 400

    ref_currency = get_reference_currency()
    fx_rates = get_forex_rates()

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
    for item in portfolio_lines:
        weight = (item['val_ref'] / total_val_ref * 100) if total_val_ref > 0 else 0
        summary_text += f"- **{item['symbol']}** ({item['name']}) | Type: {item['type']} | Poids: {weight:.1f}% | Perf: {item['pl_pct']:+.1f}% | Avis IA: {item['ai_rec']}\n"

    prompt = f"""
Tu es un chef stratégiste en investissement et gestion de patrimoine.
Effectue un AUDIT COMPLET ET GLOBAL du portefeuille suivant :

VALEUR TOTALE ESTIMÉE : {total_val_ref:,.2f} {ref_currency}
NOMBRE DE LIGNES : {len(portfolio_lines)}

DÉTAIL DES ACTIFS :
{summary_text}

CONSIGNES DE RÉDACTION (en français, format Markdown riche) :
1. 📊 **Score de Diversification & Santé globale** : Attribue une note globale de 0 à 100 avec explication.
2. ⚖️ **Analyse de l'Allocation & Concentration** : Analyse les risques de surpondération, dépendances sectorielles ou géographiques, doublons éventuels (ex: ETFs qui se chevauchent).
3. 🛡️ **Niveau de Risque & Résilience** : Quel est le profil de risque (Prudent, Équilibré, Dynamique, Spéculatif) et comportement prévisible en cas de correction de marché.
4. 💡 **3 à 5 Recommandations concrètes de Rééquilibrage** : Actions d'achat, d'arbitrage ou de prise de bénéfices pour optimiser le ratio rendement/risque.
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
            'model_used': model_used
        })
    except Exception as e:
        return jsonify({'error': f"Erreur Gemini IA: {str(e)}"}), 500

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

@app.route('/api/stocks/import', methods=['POST'])
def import_stocks():
    try:
        items = []
        if 'file' in request.files:
            file = request.files['file']
            filename = file.filename.lower()
            if filename.endswith('.json'):
                content = file.read().decode('utf-8')
                items = json.loads(content)
            elif filename.endswith('.csv'):
                content = file.read().decode('utf-8')
                reader = csv.DictReader(io.StringIO(content))
                for row in reader:
                    items.append({
                        'symbol': row.get('symbol', '').strip().upper(),
                        'name': row.get('name', '').strip(),
                        'purchase_date': row.get('purchase_date', 'Inconnue'),
                        'quantity': float(row.get('quantity', 0)),
                        'purchase_price': float(row.get('purchase_price', 0)),
                        'currency': row.get('currency', 'USD').strip().upper(),
                        'asset_type': row.get('asset_type', 'Equity')
                    })
        elif request.json:
            items = request.json if isinstance(request.json, list) else request.json.get('stocks', [])

        if not items:
            return jsonify({'error': 'Aucune position trouvée dans le fichier.'}), 400

        added_count = 0
        for item in items:
            sym = item.get('symbol', '').strip().upper()
            if not sym:
                continue
            new_stock = Stock(
                symbol=sym,
                name=item.get('name', sym),
                purchase_date=item.get('purchase_date', 'Inconnue') or 'Inconnue',
                quantity=float(item.get('quantity', 1)),
                purchase_price=float(item.get('purchase_price', 0)),
                currency=item.get('currency', 'USD').strip().upper(),
                asset_type=item.get('asset_type', 'Equity'),
                notes=item.get('notes', '')
            )
            db.session.add(new_stock)
            added_count += 1

        db.session.commit()
        MARKET_CACHE.clear()
        return jsonify({'message': f"{added_count} position(s) importée(s) avec succès !"}), 200
    except Exception as e:
        return jsonify({'error': f"Erreur lors de l'import : {str(e)}"}), 400

if __name__ == '__main__':
    app.run(debug=True, port=3000)

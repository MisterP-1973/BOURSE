import os
import json
from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
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
    
    def to_dict(self):
        return {
            'id': self.id,
            'symbol': self.symbol,
            'name': self.name,
            'purchase_date': self.purchase_date,
            'quantity': self.quantity,
            'purchase_price': self.purchase_price,
            'currency': self.currency,
            'ai_recommendation': self.ai_recommendation
        }

# Ensure DB exists
with app.app_context():
    db.create_all()

# --- UTILS ---
CONFIG_FILE = 'config.json'

def get_api_key():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            data = json.load(f)
            return data.get('gemini_api_key')
    return None

def set_api_key(key):
    with open(CONFIG_FILE, 'w') as f:
        json.dump({'gemini_api_key': key}, f)

# --- ROUTES ---

@app.route('/')
def index():
    has_api_key = get_api_key() is not None
    return render_template('index.html', has_api_key=has_api_key)

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


def is_valid_price(price, fallback_price):
    """Check that a price returned by yfinance is plausible.
    Rejects near-zero prices (e.g. yfinance returning 0.0001 for unknown instruments)."""
    if price is None or price <= 0:
        return False
    # If fallback is known and price is < 0.1% of it, consider it garbage
    if fallback_price and fallback_price > 0 and price < fallback_price * 0.001:
        return False
    return True


def fetch_current_price(symbol, fallback_price):
    """Fetch the most recent closing price for any symbol (stock, ETF, fund).
    Tries multiple strategies to handle different exchange timezones."""
    try:
        ticker = yf.Ticker(symbol)
        # Try 1-day history first
        hist = ticker.history(period="1d")
        if not hist.empty:
            p = float(hist['Close'].iloc[-1])
            if is_valid_price(p, fallback_price):
                return p
        # Fallback: try 5-day history (useful for ETFs on non-US exchanges)
        hist = ticker.history(period="5d")
        if not hist.empty:
            p = float(hist['Close'].iloc[-1])
            if is_valid_price(p, fallback_price):
                return p
        # Fallback: use fast_info (works for many instruments)
        fi = ticker.fast_info
        if hasattr(fi, 'last_price') and fi.last_price is not None:
            p = float(fi.last_price)
            if is_valid_price(p, fallback_price):
                return p
        # Last resort: use purchase price (signals "no live data")
        print(f"No valid price found for {symbol}, using purchase price as fallback")
        return None  # Return None to signal unavailability
    except Exception as e:
        print(f"Price fetch error for {symbol}: {e}")
        return None


@app.route('/api/stocks', methods=['GET'])
def get_stocks():
    stocks = Stock.query.all()
    results = []
    
    for s in stocks:
        stock_data = s.to_dict()
        try:
            current_price = fetch_current_price(s.symbol, s.purchase_price)
            price_unavailable = current_price is None
            if price_unavailable:
                current_price = s.purchase_price  # Use purchase price as display fallback

            stock_data['current_price'] = current_price
            stock_data['price_unavailable'] = price_unavailable
            
            # calculate metrics
            total_invested = s.quantity * s.purchase_price
            current_value = s.quantity * current_price
            pl_value = current_value - total_invested if not price_unavailable else 0
            pl_percent = (pl_value / total_invested * 100) if (total_invested > 0 and not price_unavailable) else 0
            
            stock_data['current_value'] = current_value
            stock_data['pl_value'] = pl_value
            stock_data['pl_percent'] = pl_percent
            
        except Exception as e:
            print(f"Error processing data for {s.symbol}: {e}")
            stock_data['current_price'] = s.purchase_price
            stock_data['price_unavailable'] = True
            stock_data['current_value'] = s.quantity * s.purchase_price
            stock_data['pl_value'] = 0
            stock_data['pl_percent'] = 0

        results.append(stock_data)
        
    return jsonify(results)

@app.route('/api/stocks', methods=['POST'])
def add_stock():
    data = request.json
    try:
        new_stock = Stock(
            symbol=data['symbol'].upper(),
            name=data['name'],
            purchase_date=data.get('purchase_date', 'Inconnue') or 'Inconnue',
            quantity=float(data['quantity']),
            purchase_price=float(data['purchase_price']),
            currency=data.get('currency', 'USD')
        )
        db.session.add(new_stock)
        db.session.commit()
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
        new_symbol = data.get('symbol', stock.symbol).upper()
        # Reset AI recommendation if symbol changed
        if new_symbol != stock.symbol:
            stock.ai_recommendation = None
        stock.symbol        = new_symbol
        stock.name          = data.get('name', stock.name)
        stock.quantity      = float(data.get('quantity', stock.quantity))
        stock.purchase_price= float(data.get('purchase_price', stock.purchase_price))
        stock.currency      = data.get('currency', stock.currency)
        stock.purchase_date = data.get('purchase_date', stock.purchase_date) or 'Inconnue'
        db.session.commit()
        return jsonify(stock.to_dict()), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/settings', methods=['POST'])
def save_settings():
    data = request.json
    api_key = data.get('api_key')
    if api_key:
        set_api_key(api_key)
        return jsonify({'message': 'API Key saved successfully'}), 200
    return jsonify({'error': 'API Key is missing'}), 400

@app.route('/api/analyze/<int:id>', methods=['POST'])
def analyze_stock(id):
    api_key = get_api_key()
    if not api_key:
        return jsonify({'error': 'API Key not configured'}), 400
        
    stock = Stock.query.get_or_404(id)
    
    # 1. Fetch recent news
    try:
        ticker = yf.Ticker(stock.symbol)
        news = ticker.news
        news_summary = ""
        for n in news[:5]: # Top 5 articles
            news_summary += f"- {n.get('title')}: {n.get('publisher')}\n"
    except Exception as e:
        news_summary = "Impossible de récupérer les actualités."
        
    # 2. Get current price context
    current_price = fetch_current_price(stock.symbol, stock.purchase_price)
        
    pl_percent = ((current_price - stock.purchase_price) / stock.purchase_price) * 100
    
    # 3. Call Gemini API
    prompt = f"""
Tu es un expert financier et conseiller en bourse de haut niveau.
Analyse l'action suivante pour un investisseur particulier :
Symbole : {stock.symbol} ({stock.name})
Prix d'achat : {stock.purchase_price} {stock.currency}
Prix actuel : {current_price:.2f} {stock.currency}
Performance latente : {pl_percent:.2f}%

Voici les derniers titres de l'actualité pour cette entreprise :
{news_summary}

Sur la base de ces informations (performance et actualité), fournis une analyse de la situation, et termine par une recommandation claire parmi les trois suivantes :
1. ACHETER DAVANTAGE
2. CONSERVER
3. VENDRE

Réponds en français, avec un ton professionnel mais accessible. Structure ta réponse avec des paragraphes clairs ou des puces. 
Utilise du Markdown pour la mise en forme.
    """
    
    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model='gemini-3.5-flash',
            contents=prompt,
        )
        analysis_text = response.text
        
        # Determine recommendation by looking for keywords in the response
        text_upper = analysis_text.upper()
        if "ACHETER DAVANTAGE" in text_upper or "ACHETER" in text_upper:
            stock.ai_recommendation = "ACHETER"
        elif "VENDRE" in text_upper:
            stock.ai_recommendation = "VENDRE"
        elif "CONSERVER" in text_upper:
            stock.ai_recommendation = "CONSERVER"
            
        db.session.commit()
            
        return jsonify({
            'analysis': analysis_text,
            'news': news_summary,
            'recommendation': stock.ai_recommendation
        })
    except Exception as e:
        return jsonify({'error': f"Erreur avec l'API IA: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True, port=3000)

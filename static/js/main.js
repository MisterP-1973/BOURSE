document.addEventListener('DOMContentLoaded', () => {
    
    // Elements
    const addStockForm = document.getElementById('add-stock-form');
    const stocksContainer = document.getElementById('stocks-container');
    const stocksLoading = document.getElementById('stocks-loading');
    const totalValueEl = document.getElementById('total-value');
    
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const settingsForm = document.getElementById('settings-form');
    
    const aiModal = document.getElementById('ai-modal');
    const aiLoading = document.getElementById('ai-loading');
    const aiResult = document.getElementById('ai-result');
    const aiMarkdownContent = document.getElementById('ai-markdown-content');
    const aiStockName = document.getElementById('ai-stock-name');

    const editModal = document.getElementById('edit-modal');
    const editStockForm = document.getElementById('edit-stock-form');
    
    // View Toggles
    const viewGridBtn = document.getElementById('view-grid');
    const viewListBtn = document.getElementById('view-list');
    
    // Load preferred view
    let currentView = localStorage.getItem('portfolioView') || 'grid';
    const applyView = (viewType) => {
        if (viewType === 'list') {
            stocksContainer.className = 'stocks-list';
            viewListBtn.classList.add('active');
            viewGridBtn.classList.remove('active');
        } else {
            stocksContainer.className = 'stocks-grid';
            viewGridBtn.classList.add('active');
            viewListBtn.classList.remove('active');
        }
        localStorage.setItem('portfolioView', viewType);
        currentView = viewType;
    };
    
    applyView(currentView);

    viewGridBtn.addEventListener('click', () => applyView('grid'));
    viewListBtn.addEventListener('click', () => applyView('list'));
    
    // Close Modals
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.target.closest('.modal').classList.remove('active');
        });
    });

    // Settings Modal
    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.add('active');
    });

    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const apiKey = document.getElementById('api-key').value;
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: apiKey })
            });
            if(res.ok) {
                settingsModal.classList.remove('active');
                alert('Clé API sauvegardée !');
            }
        } catch(err) {
            console.error(err);
        }
    });

    // ---- Search Autocomplete ----
    const searchQuery = document.getElementById('search-query');
    const searchDropdown = document.getElementById('search-dropdown');
    const symbolInput = document.getElementById('symbol');
    const nameInput = document.getElementById('name');

    let searchTimeout = null;

    const typeLabels = {
        'Equity': { label: 'Action', cls: 'badge-equity' },
        'ETF': { label: 'ETF', cls: 'badge-etf' },
        'Fund': { label: 'Fonds', cls: 'badge-fund' },
        'Index': { label: 'Indice', cls: 'badge-index' },
    };

    const closeDropdown = () => {
        searchDropdown.classList.add('hidden');
        searchDropdown.innerHTML = '';
    };

    const selectResult = (result) => {
        symbolInput.value = result.symbol;
        nameInput.value = result.name;
        searchQuery.value = `${result.symbol} — ${result.name}`;
        closeDropdown();
        // Focus next empty required field
        document.getElementById('quantity').focus();
    };

    searchQuery.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const q = searchQuery.value.trim();
        if (q.length < 2) { closeDropdown(); return; }

        searchTimeout = setTimeout(async () => {
            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
                const results = await res.json();
                searchDropdown.innerHTML = '';

                if (results.length === 0) {
                    searchDropdown.innerHTML = '<div class="search-no-result">Aucun résultat trouvé</div>';
                    searchDropdown.classList.remove('hidden');
                    return;
                }

                results.forEach(r => {
                    const typeInfo = typeLabels[r.type] || { label: r.type || '?', cls: 'badge-other' };
                    const item = document.createElement('div');
                    item.className = 'search-item';
                    item.innerHTML = `
                        <div class="search-item-main">
                            <span class="search-symbol">${r.symbol}</span>
                            <span class="search-name">${r.name}</span>
                        </div>
                        <div class="search-item-meta">
                            <span class="search-badge ${typeInfo.cls}">${typeInfo.label}</span>
                            <span class="search-exchange">${r.exchange}</span>
                        </div>
                    `;
                    item.addEventListener('click', () => selectResult(r));
                    searchDropdown.appendChild(item);
                });

                searchDropdown.classList.remove('hidden');
            } catch(err) {
                console.error('Search error:', err);
            }
        }, 300);
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-wrapper')) closeDropdown();
    });

    // Keyboard navigation in dropdown
    searchQuery.addEventListener('keydown', (e) => {
        const items = searchDropdown.querySelectorAll('.search-item');
        const current = searchDropdown.querySelector('.search-item.focused');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!current) { items[0]?.classList.add('focused'); }
            else {
                current.classList.remove('focused');
                const next = current.nextElementSibling;
                (next || items[0]).classList.add('focused');
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!current) { items[items.length - 1]?.classList.add('focused'); }
            else {
                current.classList.remove('focused');
                const prev = current.previousElementSibling;
                (prev || items[items.length - 1]).classList.add('focused');
            }
        } else if (e.key === 'Enter' && current) {
            e.preventDefault();
            current.click();
        } else if (e.key === 'Escape') {
            closeDropdown();
        }
    });

    // Add Stock
    addStockForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const data = {
            symbol: document.getElementById('symbol').value,
            name: document.getElementById('name').value,
            purchase_date: document.getElementById('purchase_date').value,
            quantity: document.getElementById('quantity').value,
            purchase_price: document.getElementById('purchase_price').value,
            currency: document.getElementById('currency').value
        };

        try {
            const res = await fetch('/api/stocks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            if(res.ok) {
                addStockForm.reset();
                loadStocks(); // Reload portfolio
            }
        } catch (err) {
            console.error("Error adding stock", err);
        }
    });

    // Load Portfolio
    const loadStocks = async () => {
        stocksLoading.style.display = 'flex';
        stocksContainer.innerHTML = '';
        totalValueEl.textContent = '...';

        try {
            const res = await fetch('/api/stocks');
            const stocks = await res.json();
            
            stocksLoading.style.display = 'none';
            renderStocks(stocks);
        } catch (err) {
            console.error("Error loading stocks", err);
            stocksLoading.innerHTML = '<p>Erreur lors du chargement des données.</p>';
        }
    };

    const renderStocks = (stocks) => {
        let globalValue = 0;
        stocksCache = {};  // reset cache

        if(stocks.length === 0) {
            stocksContainer.innerHTML = '<p style="color:var(--text-secondary); grid-column:1/-1; text-align:center;">Aucune action dans votre portefeuille. Ajoutez-en une !</p>';
        }

        stocks.forEach(stock => {
            stocksCache[stock.id] = stock;  // cache for edit modal
            globalValue += stock.current_value;
            
            const isPositive = stock.pl_value >= 0;
            const plClass = isPositive ? 'pl-positive' : 'pl-negative';
            const plSign = isPositive ? '+' : '';

            const recHtml = stock.ai_recommendation ? 
                `<span class="badge badge-${stock.ai_recommendation.toLowerCase()}">${stock.ai_recommendation}</span>` : 
                `<span class="badge badge-none" title="Cliquez sur 'Analyser' pour obtenir un conseil">Pas d'avis IA</span>`;

            // Price display: show warning if no live price
            const priceHtml = stock.price_unavailable
                ? `<div class="data-value" title="Cours en temps réel indisponible pour ce symbole">${stock.current_price.toFixed(2)} ${stock.currency} <span style="color:var(--warning, #f59e0b); font-size:0.75rem;">⚠ PRU</span></div>`
                : `<div class="data-value">${stock.current_price.toFixed(2)} ${stock.currency}</div>`;

            const plHtml = stock.price_unavailable
                ? `<span class="data-value" style="color:var(--text-secondary); font-size:0.8rem;" title="Cours indisponible — mise à jour manuelle requise">⚠ Indisponible</span>`
                : `<span class="data-value ${plClass}">${plSign}${stock.pl_value.toFixed(2)} (${plSign}${stock.pl_percent.toFixed(2)}%)</span>`;

            const card = document.createElement('div');
            card.className = 'stock-card glass-panel';
            if (stock.price_unavailable) card.classList.add('card-unavailable');
            card.innerHTML = `
                <div class="card-header">
                    <div>
                        <div class="symbol-badge">${stock.symbol}</div>
                        <div class="stock-name">${stock.name}</div>
                    </div>
                    <div style="text-align: right;">
                        ${priceHtml}
                        ${recHtml}
                    </div>
                </div>
                <div class="card-body">
                    <div class="data-point">
                        <span class="data-label">QTE</span>
                        <span class="data-value">${stock.quantity}</span>
                    </div>
                    <div class="data-point">
                        <span class="data-label">PRU</span>
                        <span class="data-value">${stock.purchase_price.toFixed(2)} ${stock.currency}</span>
                    </div>
                    <div class="data-point">
                        <span class="data-label">VALEUR</span>
                        <span class="data-value">${stock.current_value.toFixed(2)} ${stock.currency}</span>
                    </div>
                    <div class="data-point">
                        <span class="data-label">PLUS-VALUE</span>
                        ${plHtml}
                    </div>
                </div>
                <div class="card-actions">
                    <button class="btn btn-sm btn-gradient w-100" onclick="analyzeStock(${stock.id}, '${stock.symbol}', '${stock.name}')">
                        <i class="fa-solid fa-sparkles"></i> Analyser avec l'IA
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="openEditModal(${stock.id})" title="Modifier">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteStock(${stock.id})">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;
            stocksContainer.appendChild(card);
        });

        // Simple format for global value
        totalValueEl.textContent = new Intl.NumberFormat('fr-CH', { style: 'currency', currency: 'CHF' }).format(globalValue);
    };


    // Global Functions
    // Cache of all loaded stocks for the edit modal
    let stocksCache = {};

    window.openEditModal = (id) => {
        const stock = stocksCache[id];
        if (!stock) return;
        document.getElementById('edit-id').value           = stock.id;
        document.getElementById('edit-symbol').value       = stock.symbol;
        document.getElementById('edit-name').value         = stock.name;
        document.getElementById('edit-quantity').value     = stock.quantity;
        document.getElementById('edit-purchase-price').value = stock.purchase_price;
        document.getElementById('edit-currency').value     = stock.currency;
        // Convert purchase_date to yyyy-mm-dd if it's a valid date string
        const rawDate = stock.purchase_date;
        document.getElementById('edit-purchase-date').value =
            rawDate && rawDate !== 'Inconnue' ? rawDate : '';
        editModal.classList.add('active');
    };

    editStockForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-id').value;
        const dateVal = document.getElementById('edit-purchase-date').value;
        const payload = {
            symbol:         document.getElementById('edit-symbol').value,
            name:           document.getElementById('edit-name').value,
            quantity:       document.getElementById('edit-quantity').value,
            purchase_price: document.getElementById('edit-purchase-price').value,
            currency:       document.getElementById('edit-currency').value,
            purchase_date:  dateVal || 'Inconnue'
        };
        try {
            const res = await fetch(`/api/stocks/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                editModal.classList.remove('active');
                loadStocks();
            } else {
                const err = await res.json();
                alert('Erreur : ' + (err.error || 'Impossible de sauvegarder'));
            }
        } catch (err) {
            console.error('Edit error:', err);
            alert('Erreur réseau lors de la sauvegarde.');
        }
    });

    window.deleteStock = async (id) => {
        if(confirm("Voulez-vous vraiment supprimer cette action ?")) {
            await fetch(`/api/stocks/${id}`, { method: 'DELETE' });
            loadStocks();
        }
    };

    window.analyzeStock = async (id, symbol, name) => {
        aiModal.classList.add('active');
        aiStockName.textContent = `${symbol} - ${name}`;
        aiLoading.classList.remove('hidden');
        aiResult.classList.add('hidden');
        
        try {
            const res = await fetch(`/api/analyze/${id}`, { method: 'POST' });
            const data = await res.json();
            
            if(res.ok) {
                // Parse markdown
                aiMarkdownContent.innerHTML = marked.parse(data.analysis);
                aiLoading.classList.add('hidden');
                aiResult.classList.remove('hidden');
                loadStocks(); // Reload to show updated recommendation badge
            } else {
                aiMarkdownContent.innerHTML = `<p style="color:var(--danger)">Erreur : ${data.error}</p>`;
                if(data.error.includes('API Key not configured')) {
                     aiMarkdownContent.innerHTML += `<br><p>Ouvrez les paramètres (roue crantée en haut à droite) pour configurer votre clé Google Gemini.</p>`;
                }
                aiLoading.classList.add('hidden');
                aiResult.classList.remove('hidden');
            }
        } catch (err) {
            console.error(err);
            aiMarkdownContent.innerHTML = `<p style="color:var(--danger)">Une erreur réseau est survenue.</p>`;
            aiLoading.classList.add('hidden');
            aiResult.classList.remove('hidden');
        }
    };

    // Init
    loadStocks();
});

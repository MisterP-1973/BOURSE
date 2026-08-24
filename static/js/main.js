document.addEventListener('DOMContentLoaded', () => {
    
    // --- STATE ---
    let portfolioData = { stocks: [], summary: {}, ref_currency: 'CHF', fx_rates: {} };
    let activeFilter = 'all';
    let searchQueryStr = '';
    let activeSort = 'val_desc';
    let currentView = localStorage.getItem('portfolioView') || 'grid';
    let sparklineCharts = {};
    let allocationChartInstance = null;
    let interactiveChartInstance = null;
    let currentChartSymbol = null;
    let currentChartPeriod = '1mo';
    let pendingDeleteId = null;

    // --- DOM ELEMENTS ---
    const stocksContainer = document.getElementById('stocks-container');
    const stocksLoading = document.getElementById('stocks-loading');
    const refCurrencySelect = document.getElementById('ref-currency-select');
    const refreshBtn = document.getElementById('refresh-btn');
    const portfolioAuditBtn = document.getElementById('portfolio-audit-btn');
    const importExportBtn = document.getElementById('import-export-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const addStockForm = document.getElementById('add-stock-form');
    const portfolioSearchInput = document.getElementById('portfolio-search-input');
    const sortSelect = document.getElementById('sort-select');
    const filterPills = document.querySelectorAll('.filter-pills .pill');
    const viewGridBtn = document.getElementById('view-grid');
    const viewListBtn = document.getElementById('view-list');
    const toggleAddFormBtn = document.getElementById('toggle-add-form-btn');
    const toastContainer = document.getElementById('toast-container');

    // KPI Elements
    const kpiTotalVal = document.getElementById('kpi-total-val');
    const kpiCurrencyBadge = document.getElementById('kpi-currency-badge');
    const kpiInvestedSub = document.getElementById('kpi-invested-sub');
    const kpiTotalPl = document.getElementById('kpi-total-pl');
    const kpiPlPercentSub = document.getElementById('kpi-pl-percent-sub');
    const kpiDayGain = document.getElementById('kpi-day-gain');
    const kpiDayGainSub = document.getElementById('kpi-day-gain-sub');
    const kpiDividends = document.getElementById('kpi-dividends');
    const kpiHoldingsCount = document.getElementById('kpi-holdings-count');

    // Allocation Elements
    const allocationToggleBtn = document.getElementById('allocation-toggle-btn');
    const allocationContent = document.getElementById('allocation-content');
    const allocationChevron = document.getElementById('allocation-chevron');
    const allocationToggleLabel = document.getElementById('allocation-toggle-label');
    const allocationLegendContainer = document.getElementById('allocation-legend-container');

    // Modals
    const settingsModal = document.getElementById('settings-modal');
    const settingsForm = document.getElementById('settings-form');
    const aiModal = document.getElementById('ai-modal');
    const aiLoading = document.getElementById('ai-loading');
    const aiResult = document.getElementById('ai-result');
    const aiMarkdownContent = document.getElementById('ai-markdown-content');
    const aiStockName = document.getElementById('ai-stock-name');
    const aiRecBadgeRow = document.getElementById('ai-rec-badge-row');

    const portfolioAuditModal = document.getElementById('portfolio-audit-modal');
    const portfolioAuditLoading = document.getElementById('portfolio-audit-loading');
    const portfolioAuditResult = document.getElementById('portfolio-audit-result');
    const portfolioAuditMarkdown = document.getElementById('portfolio-audit-markdown');

    const chartModal = document.getElementById('chart-modal');
    const chartStockTitle = document.getElementById('chart-stock-title');
    const chartLoading = document.getElementById('chart-loading');

    const editModal = document.getElementById('edit-modal');
    const editStockForm = document.getElementById('edit-stock-form');

    const importExportModal = document.getElementById('import-export-modal');
    const importForm = document.getElementById('import-form');

    const deleteConfirmModal = document.getElementById('delete-confirm-modal');
    const deleteModalText = document.getElementById('delete-modal-text');
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');

    // --- TOAST NOTIFICATIONS ---
    const showToast = (message, type = 'info') => {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icon = type === 'success' ? 'circle-check' : (type === 'error' ? 'circle-xmark' : (type === 'warning' ? 'triangle-exclamation' : 'circle-info'));
        toast.innerHTML = `<i class="fa-solid fa-${icon}"></i> <span>${message}</span>`;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(50px)';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    };

    // --- FORMATTERS ---
    const formatMoney = (val, currency = 'CHF') => {
        if (val === null || val === undefined || isNaN(val)) return '—';
        return new Intl.NumberFormat('fr-CH', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(val) + ' ' + currency;
    };

    const formatPercent = (val) => {
        if (val === null || val === undefined || isNaN(val)) return '0.00%';
        const sign = val > 0 ? '+' : '';
        return `${sign}${val.toFixed(2)}%`;
    };

    // --- VIEW TOGGLES ---
    const applyView = (viewType) => {
        currentView = viewType;
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
        if (portfolioData && portfolioData.stocks) {
            renderStocks();
        }
    };
    applyView(currentView);
    viewGridBtn.addEventListener('click', () => applyView('grid'));
    viewListBtn.addEventListener('click', () => applyView('list'));

    // --- ALLOCATION ACCORDION TOGGLE ---
    allocationToggleBtn.addEventListener('click', () => {
        const isHidden = allocationContent.classList.contains('hidden');
        if (isHidden) {
            allocationContent.classList.remove('hidden');
            allocationToggleBtn.classList.add('active');
            allocationToggleLabel.textContent = 'Masquer';
            renderAllocationDonut();
        } else {
            allocationContent.classList.add('hidden');
            allocationToggleBtn.classList.remove('active');
            allocationToggleLabel.textContent = 'Afficher';
        }
    });

    // --- NEWS FEED SECTION TOGGLE & LOGIC ---
    const navNewsBtn = document.getElementById('nav-news-btn');
    const newsFeedToggleBtn = document.getElementById('news-feed-toggle-btn');
    const newsFeedContent = document.getElementById('news-feed-content');
    const newsChevron = document.getElementById('news-chevron');
    const newsToggleLabel = document.getElementById('news-toggle-label');
    const newsTotalBadge = document.getElementById('news-total-badge');
    const newsSymbolFilter = document.getElementById('news-symbol-filter');
    const refreshNewsBtn = document.getElementById('refresh-news-btn');
    const newsLoading = document.getElementById('news-loading');
    const newsCardsContainer = document.getElementById('news-cards-container');
    let newsLoadedOnce = false;

    const toggleNewsSection = (forceOpen = false) => {
        const isHidden = newsFeedContent.classList.contains('hidden');
        if (isHidden || forceOpen) {
            newsFeedContent.classList.remove('hidden');
            newsFeedToggleBtn.classList.add('active');
            newsToggleLabel.textContent = 'Masquer';
            if (!newsLoadedOnce) {
                loadPortfolioNews();
                newsLoadedOnce = true;
            }
        } else {
            newsFeedContent.classList.add('hidden');
            newsFeedToggleBtn.classList.remove('active');
            newsToggleLabel.textContent = 'Afficher';
        }
    };

    newsFeedToggleBtn.addEventListener('click', () => toggleNewsSection());
    if (navNewsBtn) {
        navNewsBtn.addEventListener('click', () => {
            toggleNewsSection(true);
            document.getElementById('news-feed-section').scrollIntoView({ behavior: 'smooth' });
        });
    }

    const loadPortfolioNews = async (forceRefresh = false) => {
        newsLoading.style.display = 'block';
        newsCardsContainer.innerHTML = '';
        const symbol = newsSymbolFilter.value || '';

        try {
            const url = `/api/news?refresh=${forceRefresh ? '1' : '0'}&symbol=${encodeURIComponent(symbol)}`;
            const res = await fetch(url);
            const data = await res.json();
            newsLoading.style.display = 'none';

            newsTotalBadge.textContent = `${data.count || 0} news`;
            renderPortfolioNews(data.news || []);
        } catch (err) {
            newsLoading.style.display = 'none';
            newsCardsContainer.innerHTML = '<p style="color:var(--danger); grid-column:1/-1; text-align:center;">Erreur lors de la récupération des actualités.</p>';
        }
    };

    const renderPortfolioNews = (newsList) => {
        newsCardsContainer.innerHTML = '';
        if (!newsList.length) {
            newsCardsContainer.innerHTML = '<p style="color:var(--text-secondary); grid-column:1/-1; text-align:center; padding:2rem 0;">Aucune actualité disponible pour cette sélection.</p>';
            return;
        }

        newsList.forEach(item => {
            const card = document.createElement('div');
            card.className = 'news-card';
            card.innerHTML = `
                <div>
                    <div class="news-card-header">
                        <span class="news-publisher-tag"><i class="fa-solid fa-newspaper"></i> ${item.publisher}</span>
                        <span class="news-stock-tag">${item.symbol}</span>
                    </div>
                    <div class="news-card-title" title="${item.title}">${item.title}</div>
                </div>
                <div class="news-card-footer">
                    <span style="font-size:0.75rem; color:var(--text-muted);">${item.stock_name}</span>
                    ${item.link ? `<a href="${item.link}" target="_blank" class="news-link-btn">Lire l'article <i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}
                </div>
            `;
            newsCardsContainer.appendChild(card);
        });
    };

    if (refreshNewsBtn) {
        refreshNewsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            refreshNewsBtn.classList.add('fa-spin');
            loadPortfolioNews(true).finally(() => {
                setTimeout(() => refreshNewsBtn.classList.remove('fa-spin'), 600);
            });
        });
    }

    if (newsSymbolFilter) {
        newsSymbolFilter.addEventListener('change', () => {
            loadPortfolioNews(false);
        });
    }

    // --- ADD FORM TOGGLE ---
    let isAddFormCollapsed = false;
    toggleAddFormBtn.addEventListener('click', () => {
        isAddFormCollapsed = !isAddFormCollapsed;
        if (isAddFormCollapsed) {
            addStockForm.classList.add('hidden');
            toggleAddFormBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Déplier';
        } else {
            addStockForm.classList.remove('hidden');
            toggleAddFormBtn.innerHTML = '<i class="fa-solid fa-minus"></i> Réduire';
        }
    });

    // --- MODAL CONTROLS ---
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) modal.classList.remove('active');
        });
    });

    settingsBtn.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();
            if (data.reference_currency) {
                document.getElementById('setting-ref-currency').value = data.reference_currency;
            }
        } catch (e) {
            console.error(e);
        }
        settingsModal.classList.add('active');
    });

    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const apiKey = document.getElementById('api-key').value;
        const refCurr = document.getElementById('setting-ref-currency').value;
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: apiKey, reference_currency: refCurr })
            });
            if (res.ok) {
                settingsModal.classList.remove('active');
                refCurrencySelect.value = refCurr;
                showToast('Paramètres enregistrés avec succès !', 'success');
                loadStocks();
            }
        } catch(err) {
            showToast('Erreur lors de la sauvegarde.', 'error');
        }
    });

    importExportBtn.addEventListener('click', () => {
        importExportModal.classList.add('active');
    });

    importForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('import-file-input');
        if (!fileInput.files.length) return;
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);

        try {
            const res = await fetch('/api/stocks/import', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (res.ok) {
                importExportModal.classList.remove('active');
                importForm.reset();
                showToast(data.message || 'Positions importées !', 'success');
                loadStocks();
            } else {
                showToast(data.error || 'Erreur lors de l\'import', 'error');
            }
        } catch(err) {
            showToast('Erreur réseau lors de l\'import.', 'error');
        }
    });

    // Reference currency switcher
    refCurrencySelect.addEventListener('change', async (e) => {
        const newCurr = e.target.value;
        showToast(`Devise de référence : ${newCurr}`, 'info');
        loadStocks();
    });

    refreshBtn.addEventListener('click', () => {
        refreshBtn.classList.add('fa-spin');
        loadStocks().finally(() => {
            setTimeout(() => refreshBtn.classList.remove('fa-spin'), 600);
        });
    });

    // --- SEARCH AUTOCOMPLETE (Add Stock Form) ---
    const searchQuery = document.getElementById('search-query');
    const searchDropdown = document.getElementById('search-dropdown');
    const symbolInput = document.getElementById('symbol');
    const nameInput = document.getElementById('name');
    const assetTypeSelect = document.getElementById('asset_type');
    let searchTimeout = null;

    const closeDropdown = () => {
        searchDropdown.classList.add('hidden');
        searchDropdown.innerHTML = '';
    };

    const typeMapping = {
        'EQUITY': 'Equity',
        'ETF': 'ETF',
        'MUTUALFUND': 'Fund',
        'FUND': 'Fund',
        'CRYPTOCURRENCY': 'Crypto',
        'INDEX': 'Index'
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
                    searchDropdown.innerHTML = `
                        <div class="search-no-result" style="padding:1rem; text-align:center;">
                            <div style="margin-bottom:0.6rem; color:var(--text-secondary); font-size:0.85rem;">Aucun ticker direct trouvé</div>
                            <a href="https://www.swissquote.ch/trading/search?query=${encodeURIComponent(q)}" target="_blank" class="btn btn-sm btn-secondary" style="font-size:0.78rem; text-decoration:none; display:inline-flex; align-items:center; gap:0.4rem;" onclick="event.stopPropagation();">
                                🇨🇭 Rechercher « ${q} » sur Swissquote.ch <i class="fa-solid fa-arrow-up-right-from-square"></i>
                            </a>
                        </div>
                    `;
                    searchDropdown.classList.remove('hidden');
                    return;
                }

                results.forEach(r => {
                    const item = document.createElement('div');
                    item.className = 'search-item';
                    const rawType = (r.type || 'Equity').toUpperCase();
                    const cleanType = typeMapping[rawType] || 'Equity';
                    const isinBadge = r.isin ? `<span class="badge-type" style="background:rgba(139,92,246,0.25); color:#c084fc; border:1px solid rgba(139,92,246,0.4);">ISIN: ${r.isin}</span>` : '';

                    item.innerHTML = `
                        <div class="search-item-main">
                            <span class="search-symbol">${r.symbol}</span>
                            <span class="search-name">${r.name}</span>
                        </div>
                        <div class="search-item-meta">
                            ${isinBadge}
                            <span class="badge-type badge-type-${cleanType.toLowerCase()}">${cleanType}</span>
                            <span class="search-exchange">${r.exchange || ''}</span>
                        </div>
                    `;
                    item.addEventListener('click', () => {
                        symbolInput.value = r.symbol;
                        nameInput.value = r.name;
                        searchQuery.value = `${r.symbol} — ${r.name}`;
                        assetTypeSelect.value = cleanType;
                        closeDropdown();
                        document.getElementById('quantity').focus();
                    });
                    searchDropdown.appendChild(item);
                });
                searchDropdown.classList.remove('hidden');
            } catch(err) {
                console.error(err);
            }
        }, 300);
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-wrapper')) closeDropdown();
    });

    // --- ADD STOCK FORM ---
    addStockForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            symbol: symbolInput.value,
            name: nameInput.value,
            asset_type: assetTypeSelect.value,
            purchase_date: document.getElementById('purchase_date').value,
            quantity: document.getElementById('quantity').value,
            purchase_price: document.getElementById('purchase_price').value,
            currency: document.getElementById('currency').value
        };

        try {
            const res = await fetch('/api/stocks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                addStockForm.reset();
                showToast(`Position ${payload.symbol} ajoutée avec succès !`, 'success');
                loadStocks();
            } else {
                const err = await res.json();
                showToast(err.error || 'Erreur lors de l\'ajout', 'error');
            }
        } catch (err) {
            showToast('Erreur réseau lors de l\'ajout.', 'error');
        }
    });

    // --- LOAD & RENDER STOCKS ---
    const loadStocks = async () => {
        stocksLoading.style.display = 'flex';
        const currentRef = refCurrencySelect.value || 'CHF';

        try {
            const res = await fetch(`/api/stocks?ref_currency=${currentRef}`);
            portfolioData = await res.json();
            
            // Populate news symbol filter
            if (newsSymbolFilter) {
                const currentVal = newsSymbolFilter.value;
                newsSymbolFilter.innerHTML = '<option value="">Tous les titres</option>';
                (portfolioData.stocks || []).forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.symbol;
                    opt.textContent = `${s.symbol} — ${s.name}`;
                    if (s.symbol === currentVal) opt.selected = true;
                    newsSymbolFilter.appendChild(opt);
                });
            }

            renderKPIs(portfolioData.summary, portfolioData.ref_currency);
            renderStocks();
            renderAllocationDonut();
        } catch (err) {
            console.error("Error loading stocks", err);
            showToast("Erreur lors de la récupération des cotations.", "error");
        } finally {
            stocksLoading.style.display = 'none';
        }
    };

    const renderKPIs = (summary, refCurr) => {
        kpiCurrencyBadge.textContent = refCurr;
        kpiTotalVal.textContent = formatMoney(summary.total_value, '').trim();
        kpiInvestedSub.textContent = `Investi : ${formatMoney(summary.total_invested, refCurr)}`;

        const isPlPositive = summary.total_pl_value >= 0;
        kpiTotalPl.textContent = `${isPlPositive ? '+' : ''}${formatMoney(summary.total_pl_value, refCurr)}`;
        kpiTotalPl.className = `kpi-value ${isPlPositive ? 'positive' : 'negative'}`;
        kpiPlPercentSub.textContent = formatPercent(summary.total_pl_percent);
        kpiPlPercentSub.className = `kpi-subtext ${isPlPositive ? 'positive' : 'negative'}`;

        const isDayPositive = summary.total_day_gain_value >= 0;
        kpiDayGain.textContent = `${isDayPositive ? '+' : ''}${formatMoney(summary.total_day_gain_value, refCurr)}`;
        kpiDayGain.className = `kpi-value ${isDayPositive ? 'positive' : 'negative'}`;
        kpiDayGainSub.textContent = `${formatPercent(summary.total_day_gain_percent)} aujourd'hui`;
        kpiDayGainSub.className = `kpi-subtext ${isDayPositive ? 'positive' : 'negative'}`;

        kpiDividends.textContent = formatMoney(summary.total_annual_dividends, refCurr);
        kpiHoldingsCount.textContent = `${summary.holdings_count || 0} positions actives`;
    };

    // --- ALLOCATION DONUT CHART (Chart.js) ---
    const renderAllocationDonut = () => {
        const stocks = portfolioData.stocks || [];
        if (!stocks.length) {
            allocationLegendContainer.innerHTML = '<p style="color:var(--text-secondary)">Aucune position pour le moment.</p>';
            return;
        }

        const labels = stocks.map(s => s.symbol);
        const data = stocks.map(s => s.current_value_ref || s.current_value);
        const totalVal = data.reduce((a, b) => a + b, 0);

        const vibrantPalette = [
            '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
            '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#a855f7'
        ];
        const bgColors = labels.map((_, i) => vibrantPalette[i % vibrantPalette.length]);

        const canvas = document.getElementById('allocation-donut-chart');
        if (!canvas) return;

        if (allocationChartInstance) allocationChartInstance.destroy();

        allocationChartInstance = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: bgColors,
                    borderWidth: 2,
                    borderColor: '#161e31'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                const val = ctx.raw;
                                const pct = totalVal > 0 ? ((val / totalVal) * 100).toFixed(1) : 0;
                                return ` ${ctx.label}: ${formatMoney(val, portfolioData.ref_currency)} (${pct}%)`;
                            }
                        }
                    }
                },
                cutout: '72%'
            }
        });

        // Build HTML legend breakdown
        allocationLegendContainer.innerHTML = '';
        stocks.forEach((s, i) => {
            const val = s.current_value_ref || s.current_value;
            const pct = totalVal > 0 ? ((val / totalVal) * 100).toFixed(1) : 0;
            const color = bgColors[i];
            const item = document.createElement('div');
            item.className = 'legend-item';
            item.innerHTML = `
                <div class="legend-color-dot" style="background-color: ${color};"></div>
                <div class="legend-text">
                    <span class="legend-sym">${s.symbol}</span>
                    <span class="legend-pct">${pct}%</span>
                </div>
            `;
            allocationLegendContainer.appendChild(item);
        });
    };

    // --- FILTER & SORT LOGIC ---
    filterPills.forEach(pill => {
        pill.addEventListener('click', () => {
            filterPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            activeFilter = pill.getAttribute('data-filter');
            renderStocks();
        });
    });

    portfolioSearchInput.addEventListener('input', (e) => {
        searchQueryStr = e.target.value.toLowerCase().trim();
        renderStocks();
    });

    sortSelect.addEventListener('change', (e) => {
        activeSort = e.target.value;
        renderStocks();
    });

    // --- RENDER STOCKS LIST & CARDS ---
    const renderStocks = () => {
        // Clear previous sparklines
        Object.values(sparklineCharts).forEach(c => {
            try { c.destroy(); } catch(e) {}
        });
        sparklineCharts = {};

        let filtered = (portfolioData.stocks || []).filter(s => {
            if (activeFilter !== 'all' && (s.asset_type || 'Equity') !== activeFilter) return false;
            if (searchQueryStr) {
                const matchSym = (s.symbol || '').toLowerCase().includes(searchQueryStr);
                const matchName = (s.name || '').toLowerCase().includes(searchQueryStr);
                if (!matchSym && !matchName) return false;
            }
            return true;
        });

        // Sort
        filtered.sort((a, b) => {
            const valA = a.current_value_ref || a.current_value;
            const valB = b.current_value_ref || b.current_value;
            if (activeSort === 'val_desc') return valB - valA;
            if (activeSort === 'val_asc') return valA - valB;
            if (activeSort === 'pl_desc') return b.pl_percent - a.pl_percent;
            if (activeSort === 'pl_asc') return a.pl_percent - b.pl_percent;
            if (activeSort === 'name_asc') return (a.name || '').localeCompare(b.name || '');
            if (activeSort === 'day_desc') return (b.day_change_percent || 0) - (a.day_change_percent || 0);
            return 0;
        });

        stocksContainer.innerHTML = '';

        if (filtered.length === 0) {
            stocksContainer.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 3rem 0; color: var(--text-secondary);">
                    <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; opacity: 0.4; margin-bottom: 1rem;"></i>
                    <p>Aucune position ne correspond à vos critères.</p>
                </div>
            `;
            return;
        }

        if (currentView === 'list') {
            const tableWrapper = document.createElement('div');
            tableWrapper.className = 'table-responsive glass-panel';
            tableWrapper.innerHTML = `
                <table class="stocks-table">
                    <thead>
                        <tr>
                            <th style="text-align:left;">Titre & Actif</th>
                            <th style="text-align:right;">Cours</th>
                            <th style="text-align:center;">Var. 24h</th>
                            <th style="text-align:center;">Tendance 7j</th>
                            <th style="text-align:center;">Avis Titre</th>
                            <th style="text-align:right;">Qte × PRU</th>
                            <th style="text-align:right;">Valeur (${portfolioData.ref_currency})</th>
                            <th style="text-align:right;">Gain/Perte (${portfolioData.ref_currency})</th>
                            <th style="text-align:right;">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="stocks-table-body"></tbody>
                </table>
            `;
            stocksContainer.appendChild(tableWrapper);
            const tbody = document.getElementById('stocks-table-body');

            filtered.forEach(stock => {
                const isPositive = stock.pl_value >= 0;
                const plClass = isPositive ? 'positive' : 'negative';
                const plSign = isPositive ? '+' : '';

                const isDayPos = (stock.day_change || 0) >= 0;
                const dayClass = isDayPos ? 'positive' : 'negative';
                const daySign = isDayPos ? '+' : '';

                const effectiveRec = stock.effective_recommendation || stock.ai_recommendation || 'CONSERVER';
                const recClass = `badge-${effectiveRec.toLowerCase()}`;
                let recIcon = 'fa-sparkles';
                let recTitle = 'Recommandation analysée par Gemini IA';
                let recLabel = effectiveRec;
                
                if (stock.recommendation_source === 'consensus') {
                    recIcon = 'fa-chart-line';
                    recTitle = `Consensus direct des analystes Wall Street (${stock.num_analysts || 15} analystes)`;
                } else if (stock.recommendation_source === 'trend') {
                    recIcon = 'fa-arrow-trend-up';
                    recTitle = 'Tendance technique de cours';
                }

                const recHtml = `<span class="badge ${recClass}" title="${recTitle}"><i class="fa-solid ${recIcon}"></i> ${recLabel}</span>`;
                const cleanType = stock.asset_type || 'Equity';
                const typeBadge = `<span class="badge-type badge-type-${cleanType.toLowerCase()}">${cleanType}</span>`;
                const isDifferentCurr = stock.currency !== portfolioData.ref_currency;
                const convertedValSub = isDifferentCurr ? 
                    `<div class="price-converted-sub">≈ ${formatMoney(stock.current_value_ref, portfolioData.ref_currency)}</div>` : '';
                const manualBadge = stock.is_manual_price ? 
                    `<span class="badge-manual-tag" onclick="openEditModal(${stock.id})" title="Cours actuel saisi manuellement (cliquez pour ajuster)"><i class="fa-solid fa-pen-to-square"></i> Manuel</span>` : '';

                const canvasId = `sparkline-tbl-${stock.id}`;
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>
                        <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap; margin-bottom:2px;">
                            <span class="symbol-badge">${stock.symbol}</span>
                            ${typeBadge}
                            ${manualBadge}
                        </div>
                        <div class="stock-name-title" title="${stock.name}">${stock.name}</div>
                    </td>
                    <td style="text-align:right;">
                        <div class="price-main">${formatMoney(stock.current_price, stock.currency)}</div>
                        ${convertedValSub}
                    </td>
                    <td style="text-align:center;">
                        <div class="day-gain-pill ${dayClass}" style="display:inline-flex;">
                            <i class="fa-solid fa-caret-${isDayPos ? 'up' : 'down'}"></i>
                            <span>${daySign}${stock.day_change_percent ? stock.day_change_percent.toFixed(2) : '0.00'}%</span>
                        </div>
                    </td>
                    <td style="text-align:center;">
                        <div class="sparkline-container" style="margin:0 auto; width:85px; height:28px;">
                            <canvas id="${canvasId}"></canvas>
                        </div>
                    </td>
                    <td style="text-align:center;">
                        ${recHtml}
                    </td>
                    <td style="text-align:right; font-family:var(--font-mono); font-size:0.85rem;">
                        <div>${stock.quantity} × ${stock.purchase_price.toFixed(2)}</div>
                        <div style="font-size:0.72rem; color:var(--text-secondary);">${stock.currency}</div>
                    </td>
                    <td style="text-align:right; font-family:var(--font-mono);">
                        <div style="font-weight:700; font-size:0.92rem;">${formatMoney(stock.current_value_ref || stock.current_value, portfolioData.ref_currency)}</div>
                        ${isDifferentCurr ? `<div style="font-size:0.72rem; color:var(--text-secondary);">${formatMoney(stock.current_value, stock.currency)}</div>` : ''}
                    </td>
                    <td style="text-align:right; font-family:var(--font-mono);">
                        <div class="${plClass}" style="font-weight:700; font-size:0.92rem;">${plSign}${formatMoney(stock.pl_value_ref !== undefined ? stock.pl_value_ref : stock.pl_value, portfolioData.ref_currency)}</div>
                        <div class="${plClass}" style="font-size:0.72rem;">${plSign}${stock.pl_percent.toFixed(2)}%</div>
                    </td>
                    <td style="text-align:right;">
                        <div class="card-actions-group" style="justify-content:flex-end;">
                            <button class="btn btn-sm btn-secondary" onclick="openInteractiveChart('${stock.symbol}', '${stock.name.replace(/'/g, "\\'")}')" title="Graphique historique">
                                <i class="fa-solid fa-chart-area"></i>
                            </button>
                            <button class="btn btn-sm btn-gradient" onclick="analyzeStock(${stock.id}, '${stock.symbol}', '${stock.name.replace(/'/g, "\\'")}')" title="Analyser avec Gemini IA">
                                <i class="fa-solid fa-sparkles"></i> IA
                            </button>
                            <button class="btn btn-sm btn-secondary" onclick="openEditModal(${stock.id})" title="Modifier">
                                <i class="fa-solid fa-pen-to-square"></i>
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="openDeleteModal(${stock.id}, '${stock.symbol}')" title="Supprimer">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(row);

                // Render sparkline for table
                if (stock.sparkline && stock.sparkline.length > 1) {
                    setTimeout(() => {
                        const spkCanvas = document.getElementById(canvasId);
                        if (spkCanvas) {
                            const spkColor = isDayPos ? '#10b981' : '#ef4444';
                            sparklineCharts[canvasId] = new Chart(spkCanvas, {
                                type: 'line',
                                data: {
                                    labels: stock.sparkline.map((_, i) => i),
                                    datasets: [{
                                        data: stock.sparkline,
                                        borderColor: spkColor,
                                        borderWidth: 2,
                                        pointRadius: 0,
                                        fill: false,
                                        tension: 0.3
                                    }]
                                },
                                options: {
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    plugins: { legend: { display: false }, tooltip: { enabled: false } },
                                    scales: { x: { display: false }, y: { display: false } }
                                }
                            });
                        }
                    }, 10);
                }
            });
            return;
        }

        filtered.forEach(stock => {
            const isPositive = stock.pl_value >= 0;
            const plClass = isPositive ? 'positive' : 'negative';
            const plSign = isPositive ? '+' : '';

            const isDayPos = (stock.day_change || 0) >= 0;
            const dayClass = isDayPos ? 'positive' : 'negative';
            const daySign = isDayPos ? '+' : '';

            // Dynamic recommendation badge with origin indicator
            const effectiveRec = stock.effective_recommendation || stock.ai_recommendation || 'CONSERVER';
            const recClass = `badge-${effectiveRec.toLowerCase()}`;
            let recIcon = 'fa-sparkles';
            let recTitle = 'Recommandation analysée par Gemini IA';
            let recLabel = effectiveRec;
            
            if (stock.recommendation_source === 'consensus') {
                recIcon = 'fa-chart-line';
                recTitle = `Consensus direct des analystes Wall Street (${stock.num_analysts || 15} analystes)`;
            } else if (stock.recommendation_source === 'trend') {
                recIcon = 'fa-arrow-trend-up';
                recTitle = 'Tendance technique de cours';
            }

            const recHtml = `<span class="badge ${recClass}" title="${recTitle}"><i class="fa-solid ${recIcon}"></i> ${recLabel}</span>`;

            const cleanType = stock.asset_type || 'Equity';
            const typeBadge = `<span class="badge-type badge-type-${cleanType.toLowerCase()}">${cleanType}</span>`;

            // Converted price sub-label if different currency
            const isDifferentCurr = stock.currency !== portfolioData.ref_currency;
            const convertedValSub = isDifferentCurr ? 
                `<div class="price-converted-sub">≈ ${formatMoney(stock.current_value_ref, portfolioData.ref_currency)}</div>` : '';

            const manualBadge = stock.is_manual_price ? 
                `<span class="badge-manual-tag" onclick="openEditModal(${stock.id})" title="Cours actuel saisi manuellement (cliquez pour ajuster)"><i class="fa-solid fa-pen-to-square"></i> Manuel</span>` : '';

            const card = document.createElement('div');
            card.className = 'stock-card glass-panel';

            const canvasId = `sparkline-${stock.id}`;

            card.innerHTML = `
                <div class="card-top">
                    <div class="card-top-left">
                        <div class="symbol-type-row">
                            <span class="symbol-badge">${stock.symbol}</span>
                            ${typeBadge}
                            ${manualBadge}
                        </div>
                        <div class="stock-name-title" title="${stock.name}">${stock.name}</div>
                    </div>
                    <div class="card-price-block">
                        <div class="price-main">${formatMoney(stock.current_price, stock.currency)}</div>
                        ${convertedValSub}
                    </div>
                </div>

                <div class="card-middle">
                    <div class="day-gain-pill ${dayClass}" title="Variation de cours sur la dernière séance">
                        <i class="fa-solid fa-caret-${isDayPos ? 'up' : 'down'}"></i>
                        <span>${daySign}${stock.day_change_percent ? stock.day_change_percent.toFixed(2) : '0.00'}%</span>
                    </div>
                    <div class="sparkline-container">
                        <canvas id="${canvasId}"></canvas>
                    </div>
                    <div>${recHtml}</div>
                </div>

                <div class="card-metrics-grid">
                    <div class="metric-box">
                        <span class="metric-box-label">QTE / PRU</span>
                        <span class="metric-box-val">${stock.quantity} × ${stock.purchase_price.toFixed(2)}</span>
                        <span class="metric-box-sub">${stock.currency}</span>
                    </div>
                    <div class="metric-box">
                        <span class="metric-box-label">VALEUR (${portfolioData.ref_currency})</span>
                        <span class="metric-box-val">${formatMoney(stock.current_value_ref || stock.current_value, portfolioData.ref_currency)}</span>
                        ${isDifferentCurr ? `<span class="metric-box-sub" title="Valeur en devise native">${formatMoney(stock.current_value, stock.currency)}</span>` : ''}
                    </div>
                    <div class="metric-box">
                        <span class="metric-box-label">GAIN/PERTE (${portfolioData.ref_currency})</span>
                        <span class="metric-box-val ${plClass}">${plSign}${formatMoney(stock.pl_value_ref !== undefined ? stock.pl_value_ref : stock.pl_value, portfolioData.ref_currency)}</span>
                        <span class="metric-box-sub ${plClass}">${plSign}${stock.pl_percent.toFixed(2)}% ${isDifferentCurr ? `(${plSign}${formatMoney(stock.pl_value, stock.currency)})` : ''}</span>
                    </div>
                </div>

                <div class="card-bottom-bar">
                    <div style="font-size:0.75rem; color:var(--text-muted);">
                        ${stock.dividend_yield ? `<i class="fa-solid fa-coins"></i> Div: ${stock.dividend_yield.toFixed(1)}%` : (stock.pe_ratio ? `PER: ${stock.pe_ratio.toFixed(1)}` : `Acheté le: ${stock.purchase_date}`)}
                    </div>
                    <div class="card-actions-group">
                        <button class="btn btn-sm btn-secondary" onclick="openInteractiveChart('${stock.symbol}', '${stock.name.replace(/'/g, "\\'")}')" title="Graphique historique">
                            <i class="fa-solid fa-chart-area"></i>
                        </button>
                        <button class="btn btn-sm btn-gradient" onclick="analyzeStock(${stock.id}, '${stock.symbol}', '${stock.name.replace(/'/g, "\\'")}')" title="Analyser avec Gemini IA">
                            <i class="fa-solid fa-sparkles"></i> IA
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="openEditModal(${stock.id})" title="Modifier">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="openDeleteModal(${stock.id}, '${stock.symbol}')" title="Supprimer">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
            stocksContainer.appendChild(card);

            // Render mini sparkline
            if (stock.sparkline && stock.sparkline.length > 1) {
                setTimeout(() => {
                    const spkCanvas = document.getElementById(canvasId);
                    if (spkCanvas) {
                        const spkColor = isDayPos ? '#10b981' : '#ef4444';
                        sparklineCharts[canvasId] = new Chart(spkCanvas, {
                            type: 'line',
                            data: {
                                labels: stock.sparkline.map((_, i) => i),
                                datasets: [{
                                    data: stock.sparkline,
                                    borderColor: spkColor,
                                    borderWidth: 2,
                                    pointRadius: 0,
                                    fill: false,
                                    tension: 0.3
                                }]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                                scales: { x: { display: false }, y: { display: false } }
                            }
                        });
                    }
                }, 10);
            }
        });
    };

    // --- INTERACTIVE CHART MODAL ---
    window.openInteractiveChart = async (symbol, name) => {
        currentChartSymbol = symbol;
        chartStockTitle.textContent = `${symbol} — ${name}`;
        chartModal.classList.add('active');
        loadHistoryChart(symbol, currentChartPeriod);
    };

    const loadHistoryChart = async (symbol, period) => {
        chartLoading.classList.remove('hidden');
        const canvas = document.getElementById('interactive-stock-chart');
        
        try {
            const res = await fetch(`/api/stocks/${symbol}/history?period=${period}`);
            const data = await res.json();
            chartLoading.classList.add('hidden');

            if (!data.history || !data.history.length) {
                showToast('Aucun historique disponible pour ce titre.', 'warning');
                return;
            }

            const dates = data.history.map(p => p.date);
            const prices = data.history.map(p => p.close);
            const isRising = prices[prices.length - 1] >= prices[0];
            const primaryColor = isRising ? '#10b981' : '#ef4444';

            if (interactiveChartInstance) interactiveChartInstance.destroy();

            interactiveChartInstance = new Chart(canvas, {
                type: 'line',
                data: {
                    labels: dates,
                    datasets: [{
                        label: `Cours de clôture (${symbol})`,
                        data: prices,
                        borderColor: primaryColor,
                        borderWidth: 2.5,
                        backgroundColor: (context) => {
                            const ctx = context.chart.ctx;
                            const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                            gradient.addColorStop(0, isRising ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)');
                            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
                            return gradient;
                        },
                        fill: true,
                        pointRadius: 0,
                        pointHoverRadius: 5,
                        tension: 0.2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.95)',
                            borderColor: 'rgba(255,255,255,0.1)',
                            borderWidth: 1,
                            padding: 10,
                            callbacks: {
                                label: (ctx) => ` Prix : ${ctx.parsed.y.toFixed(2)}`
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { color: 'rgba(255, 255, 255, 0.05)' },
                            ticks: { color: '#94a3b8', maxTicksLimit: 8 }
                        },
                        y: {
                            grid: { color: 'rgba(255, 255, 255, 0.05)' },
                            ticks: { color: '#94a3b8' }
                        }
                    }
                }
            });
        } catch(err) {
            chartLoading.classList.add('hidden');
            showToast('Erreur lors du chargement du graphique.', 'error');
        }
    };

    document.querySelectorAll('.btn-period').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-period').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentChartPeriod = btn.getAttribute('data-period');
            if (currentChartSymbol) {
                loadHistoryChart(currentChartSymbol, currentChartPeriod);
            }
        });
    });

    // --- AI ANALYSIS (INDIVIDUAL STOCK) ---
    window.analyzeStock = async (id, symbol, name) => {
        aiModal.classList.add('active');
        aiStockName.textContent = `${symbol} — ${name}`;
        aiLoading.classList.remove('hidden');
        aiResult.classList.add('hidden');
        aiRecBadgeRow.innerHTML = '';
        
        try {
            const res = await fetch(`/api/analyze/${id}`, { method: 'POST' });
            const data = await res.json();
            aiLoading.classList.add('hidden');
            aiResult.classList.remove('hidden');
            
            if (res.ok) {
                let newsSourcesHtml = '';
                if (data.news_items && data.news_items.length) {
                    newsSourcesHtml = `
                        <div class="news-sources-box" style="margin-top:1.5rem; padding:1rem; background:rgba(0,0,0,0.25); border:1px solid var(--surface-border); border-radius:var(--border-radius-md);">
                            <div style="font-size:0.85rem; font-weight:700; color:#60a5fa; margin-bottom:0.75rem; display:flex; align-items:center; gap:0.5rem;">
                                <i class="fa-solid fa-newspaper"></i> Sources d'actualités analysées (${data.news_items.length} articles) :
                            </div>
                            <div style="display:flex; flex-direction:column; gap:0.45rem;">
                                ${data.news_items.map(item => `
                                    <div style="display:flex; align-items:baseline; justify-content:space-between; gap:0.75rem; font-size:0.82rem;">
                                        <div style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                                            <span style="font-weight:700; color:#a78bfa;">[${item.publisher}]</span>
                                            <span style="color:var(--text-secondary);">${item.title}</span>
                                        </div>
                                        ${item.link ? `<a href="${item.link}" target="_blank" class="accent-link" style="font-size:0.75rem; flex-shrink:0;">Lire <i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                }

                aiMarkdownContent.innerHTML = marked.parse(data.analysis) + newsSourcesHtml;
                aiRecBadgeRow.innerHTML = `
                    <div style="margin-bottom:1rem; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.75rem;">
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                            <span style="font-size:0.85rem; color:var(--text-secondary);">Avis IA Gemini :</span>
                            <span class="badge badge-${(data.recommendation || 'conserver').toLowerCase()}" style="font-size:0.9rem; padding:0.4rem 0.9rem;">
                                <i class="fa-solid fa-sparkles"></i> ${data.recommendation || 'CONSERVER'}
                            </span>
                        </div>
                        <a href="https://www.swissquote.ch/trading/search?query=${encodeURIComponent(symbol.split('.')[0])}" target="_blank" class="btn btn-sm btn-secondary" style="font-size:0.78rem; text-decoration:none; display:inline-flex; align-items:center; gap:0.4rem;" title="Ouvrir la fiche de cotation sur Swissquote.ch">
                            🇨🇭 Fiche Swissquote.ch <i class="fa-solid fa-arrow-up-right-from-square"></i>
                        </a>
                    </div>
                `;
                loadStocks(); // Update recommendation in background
            } else {
                aiMarkdownContent.innerHTML = `<p style="color:var(--danger)">${data.error || 'Erreur lors de l\'analyse'}</p>`;
            }
        } catch (err) {
            aiLoading.classList.add('hidden');
            aiResult.classList.remove('hidden');
            aiMarkdownContent.innerHTML = `<p style="color:var(--danger)">Erreur réseau lors de la communication avec l'IA.</p>`;
        }
    };

    // --- AI PORTFOLIO AUDIT ---
    portfolioAuditBtn.addEventListener('click', async () => {
        portfolioAuditModal.classList.add('active');
        portfolioAuditLoading.classList.remove('hidden');
        portfolioAuditResult.classList.add('hidden');

        try {
            const res = await fetch('/api/analyze-portfolio', { method: 'POST' });
            const data = await res.json();
            portfolioAuditLoading.classList.add('hidden');
            portfolioAuditResult.classList.remove('hidden');

            if (res.ok) {
                portfolioAuditMarkdown.innerHTML = marked.parse(data.analysis);
            } else {
                portfolioAuditMarkdown.innerHTML = `<p style="color:var(--danger)">${data.error || 'Impossible de générer l\'audit'}</p>`;
            }
        } catch(err) {
            portfolioAuditLoading.classList.add('hidden');
            portfolioAuditResult.classList.remove('hidden');
            portfolioAuditMarkdown.innerHTML = `<p style="color:var(--danger)">Erreur réseau lors de l'audit.</p>`;
        }
    });

    // --- EDIT STOCK MODAL ---
    window.openEditModal = (id) => {
        const stock = (portfolioData.stocks || []).find(s => s.id === id);
        if (!stock) return;
        document.getElementById('edit-id').value = stock.id;
        document.getElementById('edit-symbol').value = stock.symbol;
        document.getElementById('edit-name').value = stock.name;
        document.getElementById('edit-asset-type').value = stock.asset_type || 'Equity';
        document.getElementById('edit-quantity').value = stock.quantity;
        document.getElementById('edit-purchase-price').value = stock.purchase_price;
        document.getElementById('edit-currency').value = stock.currency;
        document.getElementById('edit-purchase-date').value = (stock.purchase_date && stock.purchase_date !== 'Inconnue') ? stock.purchase_date : '';
        document.getElementById('edit-manual-price').value = stock.manual_price ? stock.manual_price : (stock.is_manual_price ? stock.current_price : '');
        editModal.classList.add('active');
    };

    editStockForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-id').value;
        const manualPriceVal = document.getElementById('edit-manual-price').value;
        const payload = {
            symbol: document.getElementById('edit-symbol').value,
            name: document.getElementById('edit-name').value,
            asset_type: document.getElementById('edit-asset-type').value,
            quantity: document.getElementById('edit-quantity').value,
            purchase_price: document.getElementById('edit-purchase-price').value,
            currency: document.getElementById('edit-currency').value,
            purchase_date: document.getElementById('edit-purchase-date').value || 'Inconnue',
            manual_price: manualPriceVal ? parseFloat(manualPriceVal) : null
        };

        try {
            const res = await fetch(`/api/stocks/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                editModal.classList.remove('active');
                showToast(`Position ${payload.symbol} modifiée avec succès !`, 'success');
                loadStocks();
            } else {
                const err = await res.json();
                showToast(err.error || 'Erreur lors de la modification', 'error');
            }
        } catch (err) {
            showToast('Erreur réseau lors de la mise à jour.', 'error');
        }
    });

    // --- DELETE STOCK WITH MODERN MODAL ---
    window.openDeleteModal = (id, symbol) => {
        pendingDeleteId = id;
        deleteModalText.textContent = `Êtes-vous sûr de vouloir retirer la position ${symbol} de votre portefeuille ?`;
        deleteConfirmModal.classList.add('active');
    };

    confirmDeleteBtn.addEventListener('click', async () => {
        if (!pendingDeleteId) return;
        try {
            const res = await fetch(`/api/stocks/${pendingDeleteId}`, { method: 'DELETE' });
            if (res.ok) {
                deleteConfirmModal.classList.remove('active');
                showToast('Position supprimée du portefeuille.', 'success');
                loadStocks();
            } else {
                showToast('Erreur lors de la suppression.', 'error');
            }
        } catch(err) {
            showToast('Erreur réseau lors de la suppression.', 'error');
        }
    });

    // --- PRINTING UTILITIES ---
    const printFormattedReport = (title, subtitle, contentHtml) => {
        const printWindow = window.open('', '_blank', 'width=900,height=700');
        if (!printWindow) {
            showToast('Veuillez autoriser les fenêtres pop-up pour imprimer le rapport.', 'warning');
            return;
        }

        const today = new Date().toLocaleDateString('fr-FR', {
            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        printWindow.document.write(`
            <!DOCTYPE html>
            <html lang="fr">
            <head>
                <meta charset="UTF-8">
                <title>${title}</title>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: 'Inter', sans-serif;
                        color: #1e293b;
                        background: #ffffff;
                        padding: 30px;
                        line-height: 1.5;
                        font-size: 13px;
                    }
                    .print-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        border-bottom: 2px solid #0f172a;
                        padding-bottom: 15px;
                        margin-bottom: 20px;
                    }
                    .brand-title {
                        font-size: 20px;
                        font-weight: 800;
                        color: #0f172a;
                    }
                    .report-title {
                        font-size: 16px;
                        font-weight: 700;
                        color: #2563eb;
                        margin-top: 4px;
                    }
                    .report-date {
                        font-size: 11px;
                        color: #64748b;
                        text-align: right;
                    }
                    .kpi-row {
                        display: grid;
                        grid-template-columns: repeat(4, 1fr);
                        gap: 12px;
                        margin-bottom: 25px;
                    }
                    .kpi-box {
                        border: 1px solid #e2e8f0;
                        border-radius: 8px;
                        padding: 10px 14px;
                        background: #f8fafc;
                    }
                    .kpi-box-label {
                        font-size: 10px;
                        text-transform: uppercase;
                        font-weight: 600;
                        color: #64748b;
                        margin-bottom: 4px;
                    }
                    .kpi-box-val {
                        font-size: 15px;
                        font-weight: 800;
                        font-family: 'JetBrains Mono', monospace;
                        color: #0f172a;
                    }
                    .positive { color: #16a34a !important; }
                    .negative { color: #dc2626 !important; }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-bottom: 25px;
                        font-size: 12px;
                    }
                    th {
                        background: #f1f5f9;
                        border: 1px solid #cbd5e1;
                        padding: 8px 10px;
                        font-weight: 700;
                        text-align: left;
                        font-size: 11px;
                        text-transform: uppercase;
                        color: #334155;
                    }
                    td {
                        border: 1px solid #e2e8f0;
                        padding: 8px 10px;
                    }
                    tr:nth-child(even) {
                        background: #f8fafc;
                    }
                    .num {
                        text-align: right;
                        font-family: 'JetBrains Mono', monospace;
                    }
                    .badge {
                        display: inline-block;
                        padding: 2px 6px;
                        border-radius: 4px;
                        font-size: 9px;
                        font-weight: 700;
                        text-transform: uppercase;
                    }
                    .badge-acheter { background: #dcfce7; color: #16a34a; border: 1px solid #86efac; }
                    .badge-vendre { background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; }
                    .badge-conserver { background: #fef3c7; color: #d97706; border: 1px solid #fcd34d; }
                    .badge-none { background: #f1f5f9; color: #64748b; }
                    .markdown-content {
                        line-height: 1.6;
                        color: #334155;
                        font-size: 13px;
                    }
                    .markdown-content h1, .markdown-content h2, .markdown-content h3 {
                        color: #0f172a;
                        margin-top: 18px;
                        margin-bottom: 8px;
                    }
                    .markdown-content h2 {
                        border-bottom: 1px solid #e2e8f0;
                        padding-bottom: 4px;
                        font-size: 14px;
                    }
                    .markdown-content ul, .markdown-content ol {
                        padding-left: 20px;
                        margin-bottom: 12px;
                    }
                    .markdown-content p { margin-bottom: 10px; }
                    .markdown-content blockquote {
                        border-left: 3px solid #6366f1;
                        background: #f5f3ff;
                        padding: 8px 12px;
                        margin: 12px 0;
                        font-style: italic;
                    }
                    .print-footer {
                        margin-top: 30px;
                        border-top: 1px solid #e2e8f0;
                        padding-top: 12px;
                        font-size: 10px;
                        color: #94a3b8;
                        display: flex;
                        justify-content: space-between;
                    }
                    @media print {
                        body { padding: 0; }
                        @page { margin: 1.5cm; }
                    }
                </style>
            </head>
            <body>
                <div class="print-header">
                    <div>
                        <div class="brand-title">AI STOCK ANALYZER</div>
                        <div class="report-title">${title}</div>
                        ${subtitle ? `<div style="font-size:12px; color:#64748b; margin-top:2px;">${subtitle}</div>` : ''}
                    </div>
                    <div class="report-date">
                        <div>Édité le : <strong>${today}</strong></div>
                        <div>Devise de référence : <strong>${portfolioData.ref_currency}</strong></div>
                    </div>
                </div>

                ${contentHtml}

                <div class="print-footer">
                    <span>Document généré par AI Stock Analyzer & Gemini AI</span>
                    <span>Page 1 / 1</span>
                </div>
                <script>
                    window.onload = function() {
                        setTimeout(function() {
                            window.print();
                        }, 400);
                    };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    // Print Portfolio Inventory
    const printPortfolioBtn = document.getElementById('print-portfolio-btn');
    if (printPortfolioBtn) {
        printPortfolioBtn.addEventListener('click', () => {
            const summary = portfolioData.summary || {};
            const refCurr = portfolioData.ref_currency || 'CHF';
            const isPlPos = summary.total_pl_value >= 0;
            const isDayPos = summary.total_day_gain_value >= 0;

            const kpisHtml = `
                <div class="kpi-row">
                    <div class="kpi-box">
                        <div class="kpi-box-label">Valorisation Totale</div>
                        <div class="kpi-box-val">${formatMoney(summary.total_value, refCurr)}</div>
                        <div style="font-size:10px; color:#64748b;">Investi : ${formatMoney(summary.total_invested, refCurr)}</div>
                    </div>
                    <div class="kpi-box">
                        <div class="kpi-box-label">Plus/Moins-Value Latente</div>
                        <div class="kpi-box-val ${isPlPos ? 'positive' : 'negative'}">
                            ${isPlPos ? '+' : ''}${formatMoney(summary.total_pl_value, refCurr)}
                        </div>
                        <div style="font-size:10px;" class="${isPlPos ? 'positive' : 'negative'}">
                            ${isPlPos ? '+' : ''}${summary.total_pl_percent ? summary.total_pl_percent.toFixed(2) : '0.00'}%
                        </div>
                    </div>
                    <div class="kpi-box">
                        <div class="kpi-box-label">Gain du Jour (Day Gain)</div>
                        <div class="kpi-box-val ${isDayPos ? 'positive' : 'negative'}">
                            ${isDayPos ? '+' : ''}${formatMoney(summary.total_day_gain_value, refCurr)}
                        </div>
                        <div style="font-size:10px;" class="${isDayPos ? 'positive' : 'negative'}">
                            ${isDayPos ? '+' : ''}${summary.total_day_gain_percent ? summary.total_day_gain_percent.toFixed(2) : '0.00'}%
                        </div>
                    </div>
                    <div class="kpi-box">
                        <div class="kpi-box-label">Dividendes Annuels Estimés</div>
                        <div class="kpi-box-val" style="color:#059669;">
                            ${formatMoney(summary.total_annual_dividends, refCurr)}
                        </div>
                        <div style="font-size:10px; color:#64748b;">${summary.holdings_count || 0} positions actives</div>
                    </div>
                </div>
            `;

            let rowsHtml = '';
            (portfolioData.stocks || []).forEach(s => {
                const isPos = s.pl_value >= 0;
                const plClass = isPos ? 'positive' : 'negative';
                const plSign = isPos ? '+' : '';
                const rec = s.effective_recommendation || s.ai_recommendation || 'CONSERVER';
                const recClass = `badge-${rec.toLowerCase()}`;

                rowsHtml += `
                    <tr>
                        <td><strong>${s.symbol}</strong></td>
                        <td>${s.name}</td>
                        <td><span style="font-size:10px; color:#64748b;">${s.asset_type || 'Action'}</span></td>
                        <td class="num">${s.quantity}</td>
                        <td class="num">${s.purchase_price.toFixed(2)} ${s.currency}</td>
                        <td class="num"><strong>${s.current_price.toFixed(2)} ${s.currency}</strong></td>
                        <td class="num">${formatMoney(s.current_value_ref || s.current_value, refCurr)}</td>
                        <td class="num ${plClass}">${plSign}${s.pl_percent.toFixed(2)}% (${plSign}${s.pl_value.toFixed(2)})</td>
                        <td class="num">${s.dividend_yield ? s.dividend_yield.toFixed(1) + '%' : (s.pe_ratio ? 'PER: ' + s.pe_ratio.toFixed(1) : '—')}</td>
                        <td style="text-align:center;"><span class="badge ${recClass}">${rec}</span></td>
                    </tr>
                `;
            });

            const tableHtml = `
                <table>
                    <thead>
                        <tr>
                            <th>Ticker</th>
                            <th>Nom du Titre</th>
                            <th>Type</th>
                            <th style="text-align:right;">Qté</th>
                            <th style="text-align:right;">PRU</th>
                            <th style="text-align:right;">Cours</th>
                            <th style="text-align:right;">Valeur (${refCurr})</th>
                            <th style="text-align:right;">Plus-Value</th>
                            <th style="text-align:right;">Rendement</th>
                            <th style="text-align:center;">Avis Titre</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
            `;

            printFormattedReport(
                'Inventaire & Rapport de Valorisation du Portefeuille',
                `État des ${summary.holdings_count || 0} positions détenues`,
                kpisHtml + tableHtml
            );
        });
    }

    // Batch AI Analyze Button
    const batchAiBtn = document.getElementById('batch-ai-analyze-btn');
    if (batchAiBtn) {
        batchAiBtn.addEventListener('click', async () => {
            batchAiBtn.disabled = true;
            batchAiBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyse en cours...';
            showToast('Lancement de l\'analyse IA sur tous vos titres...', 'info');

            try {
                const res = await fetch('/api/analyze-all', { method: 'POST' });
                const data = await res.json();
                if (res.ok) {
                    showToast(data.message || 'Tous les titres ont été analysés !', 'success');
                    loadStocks();
                } else {
                    showToast(data.error || 'Erreur lors de l\'analyse globale', 'error');
                }
            } catch (err) {
                showToast('Erreur réseau lors de l\'analyse.', 'error');
            } finally {
                batchAiBtn.disabled = false;
                batchAiBtn.innerHTML = '<i class="fa-solid fa-bolt gradient-text"></i> Actualiser avis IA';
            }
        });
    }

    // Print Portfolio Audit
    const printPortfolioAuditBtn = document.getElementById('print-portfolio-audit-btn');
    if (printPortfolioAuditBtn) {
        printPortfolioAuditBtn.addEventListener('click', () => {
            const auditContent = document.getElementById('portfolio-audit-markdown').innerHTML;
            if (!auditContent || auditContent.trim() === '') {
                showToast('Veuillez d\'abord générer l\'audit global avant de l\'imprimer.', 'warning');
                return;
            }

            const summary = portfolioData.summary || {};
            const refCurr = portfolioData.ref_currency || 'CHF';
            const kpiSummary = `
                <div class="kpi-row" style="margin-bottom: 20px;">
                    <div class="kpi-box">
                        <div class="kpi-box-label">Valorisation Portefeuille</div>
                        <div class="kpi-box-val">${formatMoney(summary.total_value, refCurr)}</div>
                    </div>
                    <div class="kpi-box">
                        <div class="kpi-box-label">Plus-Value Globale</div>
                        <div class="kpi-box-val ${summary.total_pl_value >= 0 ? 'positive' : 'negative'}">
                            ${summary.total_pl_value >= 0 ? '+' : ''}${formatMoney(summary.total_pl_value, refCurr)}
                        </div>
                    </div>
                    <div class="kpi-box">
                        <div class="kpi-box-label">Nombre de Lignes</div>
                        <div class="kpi-box-val">${summary.holdings_count || 0} actifs</div>
                    </div>
                    <div class="kpi-box">
                        <div class="kpi-box-label">Moteur IA</div>
                        <div class="kpi-box-val" style="font-size:13px; color:#6366f1;">Gemini 3.x Flash</div>
                    </div>
                </div>
            `;

            printFormattedReport(
                'Rapport d\'Audit Stratégique Global du Portefeuille',
                'Diagnostic complet de diversification, risque et rééquilibrage',
                kpiSummary + `<div class="markdown-content">${auditContent}</div>`
            );
        });
    }

    // Print Individual Stock AI Analysis
    const printStockAiBtn = document.getElementById('print-stock-ai-btn');
    if (printStockAiBtn) {
        printStockAiBtn.addEventListener('click', () => {
            const stockName = document.getElementById('ai-stock-name').textContent;
            const recBadgeHtml = document.getElementById('ai-rec-badge-row').innerHTML;
            const analysisHtml = document.getElementById('ai-markdown-content').innerHTML;

            if (!analysisHtml || analysisHtml.trim() === '') {
                showToast('Aucune analyse disponible pour l\'impression.', 'warning');
                return;
            }

            const headerHtml = `
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 16px; margin-bottom:20px;">
                    <div style="font-size:16px; font-weight:700; color:#0f172a; margin-bottom:6px;">${stockName}</div>
                    <div>${recBadgeHtml}</div>
                </div>
            `;

            printFormattedReport(
                `Analyse Financière & Conseil IA : ${stockName}`,
                'Étude fondamentale, actualités et recommandation de marché',
                headerHtml + `<div class="markdown-content">${analysisHtml}</div>`
            );
        });
    }

    // --- MARKET WISDOM / PROVERBE BOURSIER DU JOUR ---
    const quotes = [
        { text: "« Les marchés haussiers naissent dans le pessimisme, grandissent dans le scepticisme, mûrissent dans l'optimisme et meurent dans l'euphorie. »", author: "Sir John Templeton" },
        { text: "« Soyez craintifs quand les autres sont avides, et avides quand les autres sont craintifs. »", author: "Warren Buffett" },
        { text: "« Le prix est ce que vous payez. La valeur est ce que vous obtenez. »", author: "Warren Buffett" },
        { text: "« Si vous n'êtes pas prêt à détenir une action pendant 10 ans, ne songez même pas à la posséder pendant 10 minutes. »", author: "Warren Buffett" },
        { text: "« À court terme, le marché est une machine à voter. À long terme, c'est une machine à peser. »", author: "Benjamin Graham" },
        { text: "« Le grand argent n'est pas dans l'achat ou la vente, mais dans l'attente. »", author: "Charlie Munger" },
        { text: "« Sachez ce que vous possédez, et sachez pourquoi vous le possédez. »", author: "Peter Lynch" },
        { text: "« Les gens ont perdu beaucoup plus d'argent en essayant d'anticiper les corrections qu'au cours des corrections elles-mêmes. »", author: "Peter Lynch" },
        { text: "« Les marchés peuvent rester irrationnels plus longtemps que vous ne pouvez rester solvable. »", author: "John Maynard Keynes" },
        { text: "« Achetez des actions, prenez des somnifères pendant 20 ans, et quand vous vous réveillerez, vous serez riche. »", author: "André Kostolany" },
        { text: "« L'économie et la bourse sont comme un homme qui promène son chien : l'homme avance tranquillement, le chien court devant et derrière, mais tous deux finissent au même endroit. »", author: "André Kostolany" },
        { text: "« Les quatre mots les plus dangereux dans l'investissement sont : 'Cette fois, c'est différent'. »", author: "Sir John Templeton" },
        { text: "« Ne cherchez pas l'aiguille dans la botte de foin. Achetez simplement la botte de foin ! »", author: "John Bogle (Fondateur de Vanguard)" },
        { text: "« Ce qui compte n'est pas d'avoir raison ou tort, mais combien vous gagnez quand vous avez raison et combien vous perdez quand vous avez tort. »", author: "George Soros" },
        { text: "« Acheter au son du canon, vendre au son du clairon. »", author: "Adage Boursier Ancien" },
        { text: "« Les arbres ne montent pas jusqu'au ciel. »", author: "Proverbe Boursier" },
        { text: "« La tendance est votre amie jusqu'au retournement final. »", author: "Maxime de Trader" },
        { text: "« Coupez rapidement vos pertes et laissez courir vos gains. »", author: "David Ricardo" },
        { text: "« Le temps passé sur le marché bat toujours le timing de marché. »", author: "Sagesse Financière" },
        { text: "« Vous ne pouvez pas faire les mêmes choses que tout le monde et espérer de meilleurs résultats. »", author: "Howard Marks" },
        { text: "« Le risque provient de ne pas savoir ce que vous faites. »", author: "Warren Buffett" }
    ];

    const quoteTextEl = document.getElementById('quote-text');
    const quoteAuthorEl = document.getElementById('quote-author');
    const nextQuoteBtn = document.getElementById('next-quote-btn');

    let currentQuoteIdx = -1;

    const displayQuote = (index) => {
        if (!quoteTextEl || !quoteAuthorEl) return;
        currentQuoteIdx = index % quotes.length;
        const q = quotes[currentQuoteIdx];

        quoteTextEl.style.opacity = 0;
        quoteAuthorEl.style.opacity = 0;
        quoteTextEl.style.transform = 'translateY(4px)';

        setTimeout(() => {
            quoteTextEl.textContent = q.text;
            quoteAuthorEl.textContent = `— ${q.author}`;
            quoteTextEl.style.opacity = 1;
            quoteAuthorEl.style.opacity = 1;
            quoteTextEl.style.transform = 'translateY(0)';
        }, 200);
    };

    // Initial quote based on day of year
    const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
    displayQuote(dayOfYear % quotes.length);

    if (nextQuoteBtn) {
        nextQuoteBtn.addEventListener('click', () => {
            const nextIdx = (currentQuoteIdx + 1 + Math.floor(Math.random() * (quotes.length - 1))) % quotes.length;
            displayQuote(nextIdx);
        });
    }

    // --- INITIAL LOAD ---
    loadStocks();
});

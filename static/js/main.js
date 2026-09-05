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
        const absVal = Math.abs(val);
        let minDec = 2;
        let maxDec = 2;
        if (absVal > 0 && absVal < 0.01) {
            minDec = 4;
            maxDec = 6;
        } else if (absVal > 0 && absVal < 1) {
            minDec = 2;
            maxDec = 4;
        }
        const formatted = new Intl.NumberFormat('fr-CH', {
            minimumFractionDigits: minDec,
            maximumFractionDigits: maxDec
        }).format(val);
        return currency ? `${formatted} ${currency}` : formatted;
    };

    const formatQuantity = (qty) => {
        if (qty === null || qty === undefined || isNaN(qty)) return '0';
        if (Number.isInteger(qty)) return qty.toString();
        return parseFloat(Number(qty).toFixed(8)).toString();
    };

    const formatCompactNumber = (number) => {
        if (!number || isNaN(number)) return '—';
        if (number >= 1e12) return (number / 1e12).toFixed(2) + ' T';
        if (number >= 1e9) return (number / 1e9).toFixed(2) + ' Mrd';
        if (number >= 1e6) return (number / 1e6).toFixed(2) + ' M';
        if (number >= 1e3) return (number / 1e3).toFixed(1) + ' k';
        return number.toString();
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
    };
    applyView(currentView);
    viewGridBtn.addEventListener('click', () => {
        applyView('grid');
        if (portfolioData && portfolioData.stocks) renderStocks();
    });
    viewListBtn.addEventListener('click', () => {
        applyView('list');
        if (portfolioData && portfolioData.stocks) renderStocks();
    });

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
            if (data.risk_profile) {
                document.getElementById('setting-risk-profile').value = data.risk_profile;
            }
            if (data.investment_horizon) {
                document.getElementById('setting-investment-horizon').value = data.investment_horizon;
            }
            if (data.investment_goal) {
                document.getElementById('setting-investment-goal').value = data.investment_goal;
            }
            if (data.max_position_weight) {
                document.getElementById('setting-max-weight').value = String(data.max_position_weight);
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
        const riskProfile = document.getElementById('setting-risk-profile').value;
        const investmentHorizon = document.getElementById('setting-investment-horizon').value;
        const investmentGoal = document.getElementById('setting-investment-goal').value;
        const maxWeight = document.getElementById('setting-max-weight').value;

        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: apiKey,
                    reference_currency: refCurr,
                    risk_profile: riskProfile,
                    investment_horizon: investmentHorizon,
                    investment_goal: investmentGoal,
                    max_position_weight: maxWeight
                })
            });
            if (res.ok) {
                settingsModal.classList.remove('active');
                refCurrencySelect.value = refCurr;
                showToast('Paramètres & Profil investisseur enregistrés !', 'success');
                loadStocks();
            }
        } catch(err) {
            showToast('Erreur lors de la sauvegarde.', 'error');
        }
    });

    // --- BACKUP & RESTORE MODAL SYSTEM ---
    const backupTabBtns = document.querySelectorAll('.backup-tab-btn');
    const backupTabPanes = document.querySelectorAll('.backup-tab-pane');
    const restoreUploadForm = document.getElementById('restore-upload-form');
    const restoreFileInput = document.getElementById('restore-file-input');
    const restoreFileLabel = document.getElementById('restore-file-label');
    const restoreDropZone = document.getElementById('restore-drop-zone');
    const importFileInput = document.getElementById('import-file-input');
    const importFileLabel = document.getElementById('import-file-label');
    const importDropZone = document.getElementById('import-drop-zone');
    const createSnapshotBtn = document.getElementById('create-local-snapshot-btn');
    const refreshSnapshotsBtn = document.getElementById('refresh-snapshots-btn');
    const snapshotsContainer = document.getElementById('snapshots-list-container');

    // Tab switching
    backupTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-tab');
            backupTabBtns.forEach(b => b.classList.remove('active'));
            backupTabPanes.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const targetPane = document.getElementById(targetId);
            if (targetPane) targetPane.classList.add('active');
            if (targetId === 'tab-snapshots') {
                loadBackupSnapshots();
            }
        });
    });

    // Open Modal
    importExportBtn.addEventListener('click', () => {
        importExportModal.classList.add('active');
        // Default to active tab or load snapshots if on snapshots tab
        const activeTab = document.querySelector('.backup-tab-btn.active');
        if (activeTab && activeTab.getAttribute('data-tab') === 'tab-snapshots') {
            loadBackupSnapshots();
        }
    });

    // File Drop Zone Helpers
    function setupDropZone(dropZone, fileInput, labelElement, defaultText) {
        if (!dropZone || !fileInput) return;
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                dropZone.classList.add('dragover');
            });
        });
        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
            });
        });
        dropZone.addEventListener('drop', (e) => {
            if (e.dataTransfer.files.length) {
                fileInput.files = e.dataTransfer.files;
                if (labelElement) labelElement.innerHTML = `<strong>Fichier sélectionné :</strong> ${e.dataTransfer.files[0].name}`;
            }
        });
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length && labelElement) {
                labelElement.innerHTML = `<strong>Fichier sélectionné :</strong> ${fileInput.files[0].name}`;
            } else if (labelElement) {
                labelElement.innerText = defaultText;
            }
        });
    }

    setupDropZone(restoreDropZone, restoreFileInput, restoreFileLabel, "Glissez-déposez votre fichier de sauvegarde ici ou cliquez pour parcourir");
    setupDropZone(importDropZone, importFileInput, importFileLabel, "Sélectionner un fichier CSV ou JSON");

    // Load Local Snapshots
    async function loadBackupSnapshots() {
        if (!snapshotsContainer) return;
        snapshotsContainer.innerHTML = '<div class="loading-spinner"><i class="fa-solid fa-circle-notch fa-spin"></i> Chargement des sauvegardes...</div>';
        try {
            const res = await fetch('/api/backup/list');
            const data = await res.json();
            if (!res.ok || !data.success) {
                snapshotsContainer.innerHTML = `<div class="empty-state" style="padding:1.5rem;"><p style="color:#ef4444;">Erreur: ${data.error || 'Impossible de lister les sauvegardes'}</p></div>`;
                return;
            }

            if (!data.backups || data.backups.length === 0) {
                snapshotsContainer.innerHTML = `
                    <div class="empty-state" style="padding: 2rem 1rem; text-align: center;">
                        <i class="fa-solid fa-box-open" style="font-size: 2rem; color: var(--text-secondary); margin-bottom: 0.5rem;"></i>
                        <p style="color: var(--text-secondary); margin: 0;">Aucun point de restauration local pour l'instant.</p>
                        <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.25rem;">Cliquez sur 'Créer un point local' pour en enregistrer un.</p>
                    </div>`;
                return;
            }

            snapshotsContainer.innerHTML = data.backups.map(b => {
                let badgeClass = 'badge-auto';
                let badgeLabel = 'Auto';
                if (b.type === 'safety') {
                    badgeClass = 'badge-safety';
                    badgeLabel = 'Sécurité';
                } else if (b.type === 'manual') {
                    badgeClass = 'badge-manual';
                    badgeLabel = 'Manuel';
                }

                return `
                    <div class="snapshot-item" data-filename="${b.filename}">
                        <div class="snapshot-info">
                            <div class="snapshot-name">
                                <i class="fa-solid fa-file-zipper" style="color: #8b5cf6;"></i>
                                <span>${b.filename}</span>
                                <span class="snapshot-badge ${badgeClass}">${badgeLabel}</span>
                            </div>
                            <div class="snapshot-meta">
                                <span><i class="fa-regular fa-clock"></i> ${b.created_at}</span>
                                <span><i class="fa-solid fa-hard-drive"></i> ${b.size_formatted}</span>
                            </div>
                        </div>
                        <div class="snapshot-actions">
                            <button type="button" class="btn btn-secondary btn-icon-sm restore-snapshot-btn" title="Restaurer ce point" data-filename="${b.filename}">
                                <i class="fa-solid fa-rotate-left"></i> Restaurer
                            </button>
                            <a href="/api/backup/download-local/${encodeURIComponent(b.filename)}" class="btn btn-secondary btn-icon-sm" title="Télécharger">
                                <i class="fa-solid fa-download"></i>
                            </a>
                            <button type="button" class="btn btn-danger btn-icon-sm delete-snapshot-btn" title="Supprimer" data-filename="${b.filename}">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            // Attach listeners to snapshot action buttons
            snapshotsContainer.querySelectorAll('.restore-snapshot-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const fname = btn.getAttribute('data-filename');
                    if (!confirm(`Restaurer le point "${fname}" ?\n\nVos données actuelles seront remplacées. Un point de sécurité automatique sera créé avant la restauration.`)) {
                        return;
                    }

                    btn.disabled = true;
                    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
                    try {
                        const r = await fetch(`/api/backup/restore-local/${encodeURIComponent(fname)}`, { method: 'POST' });
                        const resData = await r.json();
                        if (r.ok && resData.success) {
                            showToast(resData.message || 'Restauration réussie !', 'success');
                            importExportModal.classList.remove('active');
                            await loadSettings();
                            await loadStocks();
                        } else {
                            showToast(resData.error || 'Erreur lors de la restauration.', 'error');
                            btn.disabled = false;
                            btn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Restaurer';
                        }
                    } catch(e) {
                        showToast('Erreur réseau lors de la restauration.', 'error');
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Restaurer';
                    }
                });
            });

            snapshotsContainer.querySelectorAll('.delete-snapshot-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const fname = btn.getAttribute('data-filename');
                    if (!confirm(`Supprimer définitivement la sauvegarde "${fname}" ?`)) {
                        return;
                    }
                    try {
                        const r = await fetch(`/api/backup/delete-local/${encodeURIComponent(fname)}`, { method: 'DELETE' });
                        const resData = await r.json();
                        if (r.ok && resData.success) {
                            showToast('Sauvegarde supprimée.', 'info');
                            loadBackupSnapshots();
                        } else {
                            showToast(resData.error || 'Erreur lors de la suppression.', 'error');
                        }
                    } catch(e) {
                        showToast('Erreur réseau.', 'error');
                    }
                });
            });

        } catch(err) {
            snapshotsContainer.innerHTML = `<div class="empty-state" style="padding:1.5rem;"><p style="color:#ef4444;">Erreur réseau lors de la récupération des sauvegardes.</p></div>`;
        }
    }

    // Create Snapshot button handler
    if (createSnapshotBtn) {
        createSnapshotBtn.addEventListener('click', async () => {
            createSnapshotBtn.disabled = true;
            createSnapshotBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Création...';
            try {
                const res = await fetch('/api/backup/create-snapshot', { method: 'POST' });
                const data = await res.json();
                if (res.ok && data.success) {
                    showToast(data.message || 'Point de restauration créé avec succès !', 'success');
                    loadBackupSnapshots();
                } else {
                    showToast(data.error || 'Erreur lors de la création du point.', 'error');
                }
            } catch(e) {
                showToast('Erreur réseau lors de la création de la sauvegarde.', 'error');
            } finally {
                createSnapshotBtn.disabled = false;
                createSnapshotBtn.innerHTML = '<i class="fa-solid fa-bookmark"></i> Créer un point local';
            }
        });
    }

    if (refreshSnapshotsBtn) {
        refreshSnapshotsBtn.addEventListener('click', loadBackupSnapshots);
    }

    // Restore Upload Form Handler
    if (restoreUploadForm) {
        restoreUploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!restoreFileInput.files.length) {
                showToast('Veuillez sélectionner un fichier à restaurer.', 'warning');
                return;
            }

            const fileName = restoreFileInput.files[0].name;
            if (!confirm(`Confirmez-vous la restauration à partir de "${fileName}" ?\n\nVos données actuelles seront remplacées. Un point de sécurité automatique sera créé avant d'appliquer les modifications.`)) {
                return;
            }

            const submitBtn = document.getElementById('submit-restore-btn');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Restauration en cours...';
            }

            const formData = new FormData();
            formData.append('file', restoreFileInput.files[0]);

            try {
                const res = await fetch('/api/backup/restore', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    importExportModal.classList.remove('active');
                    restoreUploadForm.reset();
                    if (restoreFileLabel) {
                        restoreFileLabel.innerText = "Glissez-déposez votre fichier de sauvegarde ici ou cliquez pour parcourir";
                    }
                    showToast(data.message || 'Restauration terminée avec succès !', 'success');
                    await loadSettings();
                    await loadStocks();
                } else {
                    showToast(data.error || 'Erreur lors de la restauration.', 'error');
                }
            } catch(err) {
                showToast('Erreur réseau lors de la restauration.', 'error');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Restaurer à partir de ce fichier';
                }
            }
        });
    }

    // Import Form Handler (Positions only)
    importForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!importFileInput.files.length) return;
        const formData = new FormData();
        formData.append('file', importFileInput.files[0]);

        try {
            const res = await fetch('/api/stocks/import', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (res.ok) {
                importExportModal.classList.remove('active');
                importForm.reset();
                if (importFileLabel) {
                    importFileLabel.innerText = "Sélectionner un fichier CSV ou JSON";
                }
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
        'STRUCTURED': 'Structured',
        'PRODUIT STRUCTURÉ': 'Structured',
        'CERTIFICATE': 'Structured',
        'WARRANT': 'Structured',
        'MUTUALFUND': 'Fund',
        'FUND': 'Fund',
        'CRYPTOCURRENCY': 'Crypto',
        'CRYPTO': 'Crypto',
        'INDEX': 'Index'
    };

    searchQuery.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const q = searchQuery.value.trim();
        if (q.length < 1) { closeDropdown(); return; }

        searchTimeout = setTimeout(async () => {
            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
                const results = await res.json();
                searchDropdown.innerHTML = '';

                if (results.length === 0) {
                    searchDropdown.innerHTML = `
                        <div class="search-no-result" style="padding:1rem; text-align:center;">
                            <div style="margin-bottom:0.6rem; color:var(--text-secondary); font-size:0.85rem;">Aucun actif direct trouvé</div>
                            <div style="display:flex; gap:0.5rem; justify-content:center; flex-wrap:wrap; margin-bottom:0.75rem;">
                                <a href="https://www.swissquote.ch/trading/search?query=${encodeURIComponent(q)}" target="_blank" class="btn btn-sm btn-secondary" style="font-size:0.78rem; text-decoration:none; display:inline-flex; align-items:center; gap:0.4rem;" onclick="event.stopPropagation();">
                                    🇨🇭 Swissquote.ch <i class="fa-solid fa-arrow-up-right-from-square"></i>
                                </a>
                                <a href="https://coinmarketcap.com/fr/currencies/${encodeURIComponent(q.toLowerCase())}/" target="_blank" class="btn btn-sm btn-secondary" style="font-size:0.78rem; text-decoration:none; display:inline-flex; align-items:center; gap:0.4rem;" onclick="event.stopPropagation();">
                                    🪙 CoinMarketCap <i class="fa-solid fa-arrow-up-right-from-square"></i>
                                </a>
                            </div>
                            <button type="button" class="btn btn-sm btn-gradient w-100" id="custom-fill-btn" style="font-size:0.8rem;">
                                <i class="fa-solid fa-cube"></i> Ajouter "${q}" comme Produit Structuré
                            </button>
                        </div>
                    `;
                    const customFillBtn = document.getElementById('custom-fill-btn');
                    if (customFillBtn) {
                        customFillBtn.addEventListener('click', () => {
                            symbolInput.value = q.toUpperCase();
                            nameInput.value = `Produit Structuré ${q.toUpperCase()}`;
                            searchQuery.value = q.toUpperCase();
                            assetTypeSelect.value = 'Structured';
                            closeDropdown();
                            document.getElementById('quantity').focus();
                        });
                    }
                    searchDropdown.classList.remove('hidden');
                    return;
                }

                results.forEach(r => {
                    const item = document.createElement('div');
                    item.className = 'search-item';
                    const rawType = (r.type || 'Equity').toUpperCase();
                    const cleanType = typeMapping[rawType] || (rawType === 'CRYPTO' ? 'Crypto' : (rawType === 'STRUCTURED' ? 'Structured' : 'Equity'));
                    const isinBadge = r.isin ? `<span class="badge-type" style="background:rgba(139,92,246,0.25); color:#c084fc; border:1px solid rgba(139,92,246,0.4);">ISIN: ${r.isin}</span>` : '';
                    let typeIcon = '';
                    if (cleanType === 'Crypto') typeIcon = '<i class="fa-brands fa-bitcoin"></i> ';
                    else if (cleanType === 'Structured') typeIcon = '<i class="fa-solid fa-cube"></i> ';

                    const typeDisplayLabel = cleanType === 'Structured' ? 'Produit Structuré' : cleanType;

                    item.innerHTML = `
                        <div class="search-item-main">
                            <span class="search-symbol">${r.symbol}</span>
                            <span class="search-name">${r.name}</span>
                        </div>
                        <div class="search-item-meta">
                            ${isinBadge}
                            <span class="badge-type badge-type-${cleanType.toLowerCase()}">${typeIcon}${typeDisplayLabel}</span>
                            <span class="search-exchange">${r.exchange || ''}</span>
                        </div>
                    `;
                    item.addEventListener('click', () => {
                        symbolInput.value = r.symbol;
                        nameInput.value = r.name;
                        searchQuery.value = `${r.symbol} — ${r.name}`;
                        assetTypeSelect.value = cleanType;
                        
                        // Auto-detect currency
                        if (r.currency) {
                            const currSelect = document.getElementById('currency');
                            if ([...currSelect.options].some(o => o.value === r.currency)) {
                                currSelect.value = r.currency;
                            }
                        } else if (cleanType === 'Crypto' && r.symbol.includes('-')) {
                            const pairCurr = r.symbol.split('-').pop().toUpperCase();
                            const currSelect = document.getElementById('currency');
                            if ([...currSelect.options].some(o => o.value === pairCurr)) {
                                currSelect.value = pairCurr;
                            }
                        }
                        
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
            loadPortfolioSignals();
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
                const effectivePlVal = stock.pl_value_ref !== undefined ? stock.pl_value_ref : stock.pl_value;
                const isPositive = (effectivePlVal || 0) >= 0;
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
                const isCrypto = (stock.asset_type === 'Crypto' || stock.quote_type === 'Crypto');
                let ratioColContent = '—';
                if (isCrypto) {
                    if (stock.market_cap) {
                        ratioColContent = `<span style="font-size:0.75rem; color:#fde047;" title="Capitalisation Boursière"><i class="fa-solid fa-coins"></i> Cap: ${formatCompactNumber(stock.market_cap)}</span>`;
                    } else if (stock.volume_24h) {
                        ratioColContent = `<span style="font-size:0.75rem; color:#fde047;" title="Volume d'échange 24h"><i class="fa-solid fa-chart-simple"></i> Vol: ${formatCompactNumber(stock.volume_24h)}</span>`;
                    }
                } else if (stock.dividend_yield) {
                    ratioColContent = `${stock.dividend_yield.toFixed(1)}%`;
                } else if (stock.pe_ratio) {
                    ratioColContent = `PER: ${stock.pe_ratio.toFixed(1)}`;
                }

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
                        <div>${formatQuantity(stock.quantity)} × ${formatMoney(stock.purchase_price, '')}</div>
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
            const effectivePlVal = stock.pl_value_ref !== undefined ? stock.pl_value_ref : stock.pl_value;
            const isPositive = (effectivePlVal || 0) >= 0;
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

            const isCrypto = (stock.asset_type === 'Crypto' || stock.quote_type === 'Crypto');
            let bottomMetaHtml = `Acheté le: ${stock.purchase_date}`;
            if (isCrypto) {
                if (stock.market_cap) {
                    bottomMetaHtml = `<span style="color:#fde047;" title="Capitalisation boursière totale"><i class="fa-solid fa-coins"></i> Cap: ${formatCompactNumber(stock.market_cap)} ${stock.currency}</span>`;
                } else if (stock.volume_24h) {
                    bottomMetaHtml = `<span style="color:#fde047;" title="Volume d'échange 24h"><i class="fa-solid fa-chart-simple"></i> Vol 24h: ${formatCompactNumber(stock.volume_24h)} ${stock.currency}</span>`;
                }
            } else if (stock.dividend_yield) {
                bottomMetaHtml = `<i class="fa-solid fa-coins"></i> Div: ${stock.dividend_yield.toFixed(1)}%`;
            } else if (stock.pe_ratio) {
                bottomMetaHtml = `PER: ${stock.pe_ratio.toFixed(1)}`;
            }

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
                        <span class="metric-box-val">${formatQuantity(stock.quantity)} × ${formatMoney(stock.purchase_price, '')}</span>
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
                        ${bottomMetaHtml}
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
        const aiTechDashboard = document.getElementById('ai-tech-dashboard');
        if (aiTechDashboard) aiTechDashboard.innerHTML = '';
        
        try {
            const res = await fetch(`/api/analyze/${id}`, { method: 'POST' });
            const data = await res.json();
            aiLoading.classList.add('hidden');
            aiResult.classList.remove('hidden');
            
            if (res.ok) {
                // Render Technical Dashboard & Money Management
                const t = data.technical;
                const prof = data.profile || {};
                const w = data.weight_info || {};

                if (aiTechDashboard && t && t.available) {
                    const rsiColor = t.rsi_color || 'blue';
                    const trendColor = t.trend_color || 'blue';
                    const macdColor = t.macd_color || 'blue';
                    const dca = t.dca_zones || {};
                    const dt = data.details || {};

                    let earningsNoticeHtml = '';
                    if (dt.days_to_earnings !== null && dt.days_to_earnings !== undefined) {
                        earningsNoticeHtml = `
                            <div style="background:rgba(59,130,246,0.12); border-left:3px solid #3b82f6; padding:0.6rem 0.9rem; border-radius:0 6px 6px 0; margin-bottom:0.85rem; font-size:0.8rem; color:#cbd5e1; display:flex; align-items:center; gap:0.5rem;">
                                <i class="fa-solid fa-calendar-day" style="color:#60a5fa;"></i>
                                <span><strong>Publication des Résultats (Earnings) :</strong> Dans <strong>${dt.days_to_earnings} jour(s)</strong> (${dt.earnings_date}). Surveillez la volatilité.</span>
                            </div>
                        `;
                    }

                    aiTechDashboard.innerHTML = `
                        ${earningsNoticeHtml}
                        <div class="tech-cards-grid">
                            <div class="tech-kpi-card">
                                <div class="tech-kpi-label"><i class="fa-solid fa-gauge-high"></i> RSI 14j</div>
                                <div class="tech-kpi-value">${t.rsi}</div>
                                <div><span class="tech-badge-pill badge-${rsiColor}">${t.rsi_status}</span></div>
                            </div>
                            <div class="tech-kpi-card">
                                <div class="tech-kpi-label"><i class="fa-solid fa-arrow-trend-up"></i> Tendance MM</div>
                                <div class="tech-kpi-value" style="font-size:0.85rem;">${t.trend}</div>
                                <div style="font-size:0.7rem; color:var(--text-secondary);">SMA 50: ${t.sma50} | SMA 200: ${t.sma200 || 'N/D'}</div>
                            </div>
                            <div class="tech-kpi-card">
                                <div class="tech-kpi-label"><i class="fa-solid fa-wave-square"></i> MACD (12,26,9)</div>
                                <div class="tech-kpi-value" style="font-size:0.85rem;">${t.macd}</div>
                                <div><span class="tech-badge-pill badge-${macdColor}">${t.macd_status}</span></div>
                            </div>
                            <div class="tech-kpi-card">
                                <div class="tech-kpi-label"><i class="fa-solid fa-chart-line"></i> Supports / Résist.</div>
                                <div class="tech-kpi-value" style="font-size:0.82rem;">
                                    <span style="color:#10b981;">S: ${t.support}</span> / <span style="color:#f43f5e;">R: ${t.resistance}</span>
                                </div>
                                <div style="font-size:0.7rem; color:var(--text-secondary);">ATR 14: ${t.atr} (${t.atr_pct}%)</div>
                            </div>
                        </div>

                        <!-- Smart DCA Accumulation Plan -->
                        <div class="dca-zones-card">
                            <h4>
                                <span><i class="fa-solid fa-layer-group"></i> Plan d'Accumulation DCA & Zones d'Entrée Suggérées</span>
                                <span class="dca-timing-badge badge-${dca.timing_color || 'blue'}">${dca.timing_status || 'Consolidation'}</span>
                            </h4>
                            <div class="dca-tiers-grid">
                                <div class="dca-tier-box t1">
                                    <span class="dca-tier-label">Tranche 1 (Pullback léger)</span>
                                    <div class="dca-tier-price">${dca.zone1}</div>
                                    <div class="dca-tier-pct">${dca.zone1_pct}%</div>
                                </div>
                                <div class="dca-tier-box t2">
                                    <span class="dca-tier-label">Tranche 2 (Entrée Optimale)</span>
                                    <div class="dca-tier-price">${dca.zone2}</div>
                                    <div class="dca-tier-pct">${dca.zone2_pct}%</div>
                                </div>
                                <div class="dca-tier-box t3">
                                    <span class="dca-tier-label">Tranche 3 (Value Dip / SMA200)</span>
                                    <div class="dca-tier-price">${dca.zone3}</div>
                                    <div class="dca-tier-pct">${dca.zone3_pct}%</div>
                                </div>
                            </div>
                        </div>

                        <div class="money-management-card">
                            <div class="mm-header">
                                <div style="display:flex; align-items:center; gap:0.5rem;">
                                    <i class="fa-solid fa-shield-halved" style="color:#818cf8;"></i>
                                    <span>Money Management & Niveaux Clés Suggérés</span>
                                </div>
                                <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
                                    <span class="profile-tag-pill">Profil: ${prof.risk_profile ? prof.risk_profile.toUpperCase() : 'ÉQUILIBRÉ'}</span>
                                    ${w.is_overweight ? `<span class="tech-badge-pill badge-rose"><i class="fa-solid fa-triangle-exclamation"></i> Surpondéré (${w.weight_pct}% &gt; ${w.max_allowed_pct}%)</span>` : `<span class="tech-badge-pill badge-emerald">Poids: ${w.weight_pct}% (Max: ${w.max_allowed_pct}%)</span>`}
                                </div>
                            </div>
                            <div class="mm-grid">
                                <div class="mm-item">
                                    <span class="mm-item-title">🛑 Stop-Loss Conseillé</span>
                                    <span class="mm-item-val mm-val-danger">${t.stop_loss} <span class="mm-item-sub">(${t.stop_loss_pct}%)</span></span>
                                </div>
                                <div class="mm-item">
                                    <span class="mm-item-title">🎯 Take-Profit / Cible</span>
                                    <span class="mm-item-val mm-val-success">${t.take_profit} <span class="mm-item-sub">(+${t.take_profit_pct}%)</span></span>
                                </div>
                                <div class="mm-item">
                                    <span class="mm-item-title">⚖️ Ratio Risque/Rendement</span>
                                    <span class="mm-item-val mm-val-accent">1 : ${t.risk_reward_ratio}</span>
                                </div>
                            </div>
                        </div>
                    `;
                }

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

                const isCrypto = (data.analysis && (data.analysis.includes('Crypto') || data.analysis.includes('crypto') || symbol.includes('-USD') || symbol.includes('-EUR') || symbol.includes('-CHF')));
                const searchExtUrl = isCrypto ? 
                    `https://coinmarketcap.com/fr/currencies/${encodeURIComponent(symbol.split('-')[0].toLowerCase())}/` : 
                    `https://www.swissquote.ch/trading/search?query=${encodeURIComponent(symbol.split('.')[0])}`;
                const extBtnLabel = isCrypto ? `🪙 Fiche CoinMarketCap` : `🇨🇭 Fiche Swissquote.ch`;

                aiMarkdownContent.innerHTML = marked.parse(data.analysis) + newsSourcesHtml;
                aiRecBadgeRow.innerHTML = `
                    <div style="margin-bottom:1rem; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.75rem;">
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                            <span style="font-size:0.85rem; color:var(--text-secondary);">Avis IA Gemini :</span>
                            <span class="badge badge-${(data.recommendation || 'conserver').toLowerCase()}" style="font-size:0.9rem; padding:0.4rem 0.9rem;">
                                <i class="fa-solid fa-sparkles"></i> ${data.recommendation || 'CONSERVER'}
                            </span>
                        </div>
                        <a href="${searchExtUrl}" target="_blank" class="btn btn-sm btn-secondary" style="font-size:0.78rem; text-decoration:none; display:inline-flex; align-items:center; gap:0.4rem;" title="Ouvrir la fiche de cotation">
                            ${extBtnLabel} <i class="fa-solid fa-arrow-up-right-from-square"></i>
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

                const isCrypto = (s.asset_type === 'Crypto' || s.quote_type === 'Crypto');
                let yieldOrMetrics = '—';
                if (isCrypto) {
                    if (s.market_cap) yieldOrMetrics = `Cap: ${formatCompactNumber(s.market_cap)}`;
                    else if (s.volume_24h) yieldOrMetrics = `Vol: ${formatCompactNumber(s.volume_24h)}`;
                } else if (s.dividend_yield) {
                    yieldOrMetrics = s.dividend_yield.toFixed(1) + '%';
                } else if (s.pe_ratio) {
                    yieldOrMetrics = 'PER: ' + s.pe_ratio.toFixed(1);
                }

                rowsHtml += `
                    <tr>
                        <td><strong>${s.symbol}</strong></td>
                        <td>${s.name}</td>
                        <td><span style="font-size:10px; color:#64748b;">${s.asset_type || 'Action'}</span></td>
                        <td class="num">${formatQuantity(s.quantity)}</td>
                        <td class="num">${formatMoney(s.purchase_price, s.currency)}</td>
                        <td class="num"><strong>${formatMoney(s.current_price, s.currency)}</strong></td>
                        <td class="num">${formatMoney(s.current_value_ref || s.current_value, refCurr)}</td>
                        <td class="num ${plClass}">${plSign}${s.pl_percent.toFixed(2)}% (${plSign}${formatMoney(s.pl_value_ref !== undefined ? s.pl_value_ref : s.pl_value, refCurr)})</td>
                        <td class="num">${yieldOrMetrics}</td>
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

    // --- LIVE SIGNALS SCANNER LOGIC ---
    const signalsSection = document.getElementById('signals-section');
    const signalsHeaderToggle = document.getElementById('signals-header-toggle');
    const signalsContent = document.getElementById('signals-content');
    const signalsChevron = document.getElementById('signals-chevron');
    const signalsTotalCount = document.getElementById('signals-total-count');
    const signalsGrid = document.getElementById('signals-grid');
    const chipRiskCount = document.getElementById('chip-risk-count');
    const chipOppCount = document.getElementById('chip-opp-count');
    const chipEarnCount = document.getElementById('chip-earn-count');
    let isSignalsOpen = false;

    const toggleSignalsSection = (open = null) => {
        isSignalsOpen = (open !== null) ? open : !isSignalsOpen;
        if (isSignalsOpen) {
            signalsContent.style.display = 'block';
            signalsChevron.style.transform = 'rotate(180deg)';
        } else {
            signalsContent.style.display = 'none';
            signalsChevron.style.transform = 'rotate(0deg)';
        }
    };

    if (signalsHeaderToggle) {
        signalsHeaderToggle.addEventListener('click', () => toggleSignalsSection());
    }

    const loadPortfolioSignals = async () => {
        if (!signalsSection) return;
        try {
            const res = await fetch('/api/signals');
            const data = await res.json();
            
            if (data.total_count > 0) {
                signalsSection.style.display = 'block';
                signalsTotalCount.textContent = `${data.total_count} signal${data.total_count > 1 ? 's' : ''}`;

                // Update summary chips
                const summ = data.summary || {};
                if (summ.risks > 0) {
                    chipRiskCount.style.display = 'inline-flex';
                    chipRiskCount.querySelector('.num').textContent = summ.risks;
                } else {
                    chipRiskCount.style.display = 'none';
                }

                if (summ.opportunities > 0) {
                    chipOppCount.style.display = 'inline-flex';
                    chipOppCount.querySelector('.num').textContent = summ.opportunities;
                } else {
                    chipOppCount.style.display = 'none';
                }

                if (summ.earnings > 0) {
                    chipEarnCount.style.display = 'inline-flex';
                    chipEarnCount.querySelector('.num').textContent = summ.earnings;
                } else {
                    chipEarnCount.style.display = 'none';
                }

                // Render signal cards
                signalsGrid.innerHTML = '';
                (data.signals || []).forEach(sig => {
                    const card = document.createElement('div');
                    card.className = `signal-card severity-${sig.severity || 'info'}`;
                    card.innerHTML = `
                        <div class="signal-card-header">
                            <span class="signal-category"><i class="fa-solid ${sig.icon || 'fa-bolt'}"></i> ${sig.category}</span>
                            <span class="signal-symbol-badge">${sig.symbol}</span>
                        </div>
                        <div class="signal-card-title">${sig.title}</div>
                        <div class="signal-card-msg">${sig.message}</div>
                        <div class="signal-card-action"><i class="fa-solid fa-lightbulb"></i> Action : ${sig.action}</div>
                    `;
                    signalsGrid.appendChild(card);
                });
            } else {
                signalsSection.style.display = 'none';
            }
        } catch (e) {
            console.error('Error fetching signals:', e);
        }
    };

    // --- STRESS TEST MODAL & SCENARIOS ---
    const stressTestBtn = document.getElementById('stress-test-btn');
    const stressTestModal = document.getElementById('stress-test-modal');
    const runStressTestBtn = document.getElementById('run-stress-test-btn');
    const stressTestLoading = document.getElementById('stress-test-loading');
    const stressTestResults = document.getElementById('stress-test-results');
    const stressTestContent = document.getElementById('stress-test-content');
    const scenarioCards = document.querySelectorAll('.scenario-card');
    let selectedScenario = 'all';

    scenarioCards.forEach(card => {
        card.addEventListener('click', () => {
            scenarioCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            selectedScenario = card.getAttribute('data-scenario');
        });
    });

    if (stressTestBtn) {
        stressTestBtn.addEventListener('click', () => {
            stressTestModal.classList.add('active');
        });
    }

    if (runStressTestBtn) {
        runStressTestBtn.addEventListener('click', async () => {
            runStressTestBtn.disabled = true;
            stressTestLoading.style.display = 'block';
            stressTestResults.style.display = 'none';
            stressTestContent.innerHTML = '';

            try {
                const res = await fetch('/api/portfolio/stress-test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ scenario: selectedScenario })
                });
                const data = await res.json();
                stressTestLoading.style.display = 'none';
                stressTestResults.style.display = 'block';

                if (res.ok) {
                    stressTestContent.innerHTML = marked.parse(data.report || '');
                } else {
                    stressTestContent.innerHTML = `<p style="color:var(--danger);">${data.error || 'Erreur lors de la simulation.'}</p>`;
                }
            } catch (err) {
                stressTestLoading.style.display = 'none';
                stressTestResults.style.display = 'block';
                stressTestContent.innerHTML = `<p style="color:var(--danger);">Erreur réseau lors de la simulation.</p>`;
            } finally {
                runStressTestBtn.disabled = false;
            }
        });
    }

    // --- CORRELATION & OVERLAP MODAL ---
    const correlationBtn = document.getElementById('correlation-btn');
    const correlationModal = document.getElementById('correlation-modal');
    const correlationLoading = document.getElementById('correlation-loading');
    const correlationContent = document.getElementById('correlation-content');
    const sectorBarsContainer = document.getElementById('sector-bars-container');
    const overlapsListContainer = document.getElementById('overlaps-list-container');
    const hedgesListContainer = document.getElementById('hedges-list-container');
    const matrixTableContainer = document.getElementById('matrix-table-container');

    const loadCorrelationData = async () => {
        correlationLoading.style.display = 'block';
        correlationContent.style.display = 'none';

        try {
            const res = await fetch('/api/portfolio/correlation');
            const data = await res.json();
            correlationLoading.style.display = 'none';
            correlationContent.style.display = 'block';

            if (!data.available) {
                correlationContent.innerHTML = `<p style="color:var(--text-secondary); text-align:center; padding:2rem 0;">${data.message || 'Données insuffisantes.'}</p>`;
                return;
            }

            // 1. Sector breakdown
            sectorBarsContainer.innerHTML = '';
            const secEntries = Object.entries(data.sectors || {});
            secEntries.sort((a, b) => b[1] - a[1]);
            secEntries.forEach(([sec, pct]) => {
                const row = document.createElement('div');
                row.className = 'sector-bar-row';
                row.innerHTML = `
                    <span class="sector-name" title="${sec}">${sec}</span>
                    <div class="sector-progress-track">
                        <div class="sector-progress-fill" style="width: ${Math.min(100, pct)}%;"></div>
                    </div>
                    <span class="sector-pct">${pct}%</span>
                `;
                sectorBarsContainer.appendChild(row);
            });

            // 2. Overlaps
            overlapsListContainer.innerHTML = '';
            if (data.overlaps && data.overlaps.length) {
                data.overlaps.forEach(ov => {
                    const item = document.createElement('div');
                    item.className = 'overlap-item';
                    item.innerHTML = `
                        <div>
                            <strong>${ov.sym1} ↔ ${ov.sym2}</strong>
                            <span style="font-size:0.75rem; color:var(--text-secondary); margin-left:8px;">${ov.warning}</span>
                        </div>
                        <span class="badge" style="background:rgba(239,68,68,0.25); color:#f87171; font-family:var(--font-mono); font-weight:700;">+${ov.correlation}</span>
                    `;
                    overlapsListContainer.appendChild(item);
                });
            } else {
                overlapsListContainer.innerHTML = '<p style="color:var(--text-secondary); font-size:0.8rem; margin:0;">✅ Aucun doublon à forte corrélation (> 0.70) détecté. Votre diversification est saine.</p>';
            }

            // 3. Hedges
            hedgesListContainer.innerHTML = '';
            if (data.hedges && data.hedges.length) {
                data.hedges.forEach(hd => {
                    const item = document.createElement('div');
                    item.className = 'hedge-item';
                    item.innerHTML = `
                        <div>
                            <strong>${hd.sym1} ↔ ${hd.sym2}</strong>
                            <span style="font-size:0.75rem; color:var(--text-secondary); margin-left:8px;">${hd.benefit}</span>
                        </div>
                        <span class="badge" style="background:rgba(16,185,129,0.25); color:#34d399; font-family:var(--font-mono); font-weight:700;">${hd.correlation}</span>
                    `;
                    hedgesListContainer.appendChild(item);
                });
            } else {
                hedgesListContainer.innerHTML = '<p style="color:var(--text-secondary); font-size:0.8rem; margin:0;">ℹ️ Aucune corrélation négative forte observée (vous pouvez ajouter de l\'or, des devises refuges CHF ou des matières premières pour amortir les baisses).</p>';
            }

            // 4. Matrix Heatmap Table
            matrixTableContainer.innerHTML = '';
            const syms = data.symbols || [];
            const matrix = data.matrix || {};
            let tableHtml = '<table class="matrix-table"><thead><tr><th></th>';
            syms.forEach(s => { tableHtml += `<th>${s}</th>`; });
            tableHtml += '</tr></thead><tbody>';

            syms.forEach(s1 => {
                tableHtml += `<tr><th>${s1}</th>`;
                syms.forEach(s2 => {
                    const val = (matrix[s1] && matrix[s1][s2] !== undefined) ? matrix[s1][s2] : 0;
                    let cellClass = 'matrix-cell-med';
                    if (s1 === s2) {
                        cellClass = 'matrix-cell-high';
                    } else if (val >= 0.7) {
                        cellClass = 'matrix-cell-high';
                    } else if (val <= -0.1) {
                        cellClass = 'matrix-cell-neg';
                    } else if (val < 0.3) {
                        cellClass = 'matrix-cell-low';
                    }
                    tableHtml += `<td class="${cellClass}">${val.toFixed(2)}</td>`;
                });
                tableHtml += '</tr>';
            });
            tableHtml += '</tbody></table>';
            matrixTableContainer.innerHTML = tableHtml;

        } catch (e) {
            correlationLoading.style.display = 'none';
            correlationContent.style.display = 'block';
            correlationContent.innerHTML = `<p style="color:var(--danger); text-align:center;">Erreur lors du calcul de la matrice.</p>`;
        }
    };

    if (correlationBtn) {
        correlationBtn.addEventListener('click', () => {
            correlationModal.classList.add('active');
            loadCorrelationData();
        });
    }

    // --- INITIAL LOAD ---
    loadStocks();
});

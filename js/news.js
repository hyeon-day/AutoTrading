import { authFetch } from './apiClient.js';

document.addEventListener('DOMContentLoaded', () => {
    const sidebarToggle = document.getElementById('sidebarToggle');
    const appSidebar = document.getElementById('appSidebar');
    const searchBar = document.getElementById('searchBar');
    const searchClearButton = document.getElementById('searchClearButton');
    const searchModal = document.getElementById('searchModal');
    const searchResults = document.getElementById('searchResults');
    const newsRefreshButton = document.getElementById('newsRefreshButton');
    const newsFilterTabs = document.querySelectorAll('.news-filter-tab');
    const newsList = document.querySelector('.news-list');
    const newsSummaryList = document.querySelector('.news-summary-list');
    const newsQueryInput = document.getElementById('newsQueryInput');
    const newsQueryButton = document.getElementById('newsQueryButton');
    const newsSortButtons = document.querySelectorAll('.news-sort-button');

    let searchTimer = null;
    let currentCategory = 'all';
    let searchQuery = '';
    let sortMode = 'accuracy';
    let newsCache = {};

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const formatPubDate = (dateString) => {
        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 1) return '��� ��';
            if (diffMins < 60) return `${diffMins}�� ��`;
            if (diffHours < 24) return `${diffHours}�ð� ��`;
            if (diffDays < 7) return `${diffDays}�� ��`;
            return date.toLocaleDateString('ko-KR');
        } catch {
            return dateString;
        }
    };

    const renderSearchMessage = (message) => {
        if (!searchResults) return;
        searchResults.innerHTML = `<div class="search-empty">${escapeHtml(message)}</div>`;
    };

    const renderSearchResults = (results = []) => {
        if (!searchResults) return;
        if (!results.length) {
            renderSearchMessage('�˻� ����� �����ϴ�.');
            return;
        }
        searchResults.innerHTML = results.map((stock) => `
            <button class="search-result-item" type="button" data-code="${escapeHtml(stock.code)}">
                <span class="search-result-name">${escapeHtml(stock.name)}</span>
                <span class="search-result-code">${escapeHtml(stock.code)}</span>
            </button>
        `).join('');
    };

    const searchStocks = async (query) => {
        const keyword = String(query || '').trim();
        if (!keyword) {
            renderSearchMessage('����� �Ǵ� �����ڵ带 �Է��ϼ���.');
            return;
        }

        renderSearchMessage('�˻� ��...');
        try {
            const response = await authFetch(`/api/search?q=${encodeURIComponent(keyword)}`, { cache: 'no-store' });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.message || `HTTP ${response.status}`);
            renderSearchResults(payload.results || []);
        } catch (error) {
            console.error('News search failed.', error);
            renderSearchMessage(error.message || '�˻����� ���߽��ϴ�.');
        }
    };

    const openTradingPage = (code) => {
        const target = String(code || '').trim();
        if (!target) return;
        window.location.href = `trading.html?code=${encodeURIComponent(target)}`;
    };

    const updateSearchClearButton = () => {
        searchClearButton?.classList.toggle('show', Boolean(searchBar?.value));
    };

    const updateNewsSummary = (news = []) => {
        if (!newsSummaryList) return;

        const counts = news.reduce((acc, item) => {
            const source = String(item.source || '').toLowerCase();
            const category = String(item.category || '').toLowerCase();

            if (category === '공시' || source === 'dart') {
                acc.disclosure += 1;
            } else if (source === 'kakao' || category === '뉴스') {
                acc.market += 1;
            } else {
                acc.topic += 1;
            }
            return acc;
        }, { market: 0, topic: 0, disclosure: 0 });

        newsSummaryList.innerHTML = `
            <div>
                <span>시장 뉴스</span>
                <strong>${counts.market}</strong>
            </div>
            <div>
                <span>종목/이슈</span>
                <strong>${counts.topic}</strong>
            </div>
            <div>
                <span>공시</span>
                <strong>${counts.disclosure}</strong>
            </div>
        `;
    };

    const renderNews = (news = []) => {
        if (!newsList) return;

        if (!news.length) {
            newsList.innerHTML = '<div class="loading-empty">�˻� ����� �����ϴ�. �˻�� �Է��ϰų� �ٸ� ���͸� ������ ������.</div>';
            updateNewsSummary([]);
            return;
        }

        newsList.innerHTML = news.map(item => `
            <article class="news-item">
                <div class="news-item-meta">
                    <span>${escapeHtml(item.category || item.source)}</span>
                    <time>${escapeHtml(formatPubDate(item.pubDate))}</time>
                </div>
                <h3><a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a></h3>
                <p>${escapeHtml(item.description || item.source)}</p>
            </article>
        `).join('');
        updateNewsSummary(news);
    };

    const setActiveSortButton = (mode) => {
        sortMode = mode;
        newsSortButtons.forEach(button => {
            button.classList.toggle('is-active', button.dataset.sort === mode);
        });
    };

    const loadNews = async () => {
        if (!newsList) return;

        if (currentCategory === 'topic' && !searchQuery) {
            newsList.innerHTML = '<div class="loading-empty">���� �˻�� �Է��ϸ� ���� ������ ǥ�õ˴ϴ�.</div>';
            updateNewsSummary([]);
            return;
        }

        newsList.innerHTML = '<div class="loading-indicator">������ �ҷ����� ��...</div>';
        const params = new URLSearchParams();
        params.set('category', currentCategory);
        if (searchQuery) params.set('q', searchQuery);
        params.set('sort', sortMode);

        try {
            const response = await authFetch(`/api/news?${params.toString()}`, { cache: 'no-store' });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.message || `HTTP ${response.status}`);
            const news = payload.news || [];
            newsCache[currentCategory] = news;
            renderNews(news);
        } catch (error) {
            console.error('News loading failed:', error);
            newsList.innerHTML = `<div class="loading-error">������ �ҷ����� ���߽��ϴ�: ${escapeHtml(error.message)}</div>`;
            updateNewsSummary([]);
        }
    };

    newsFilterTabs.forEach((tab, index) => {
        tab.addEventListener('click', () => {
            newsFilterTabs.forEach((item) => item.classList.remove('is-active'));
            tab.classList.add('is-active');

            const categories = ['all', 'market', 'topic', 'disclosure'];
            currentCategory = categories[index] || 'all';
            if (currentCategory !== 'topic') {
                newsQueryInput.value = '';
                searchQuery = '';
            }
            loadNews();
        });
    });

    newsSortButtons.forEach((button) => {
        button.addEventListener('click', () => {
            setActiveSortButton(button.dataset.sort);
            loadNews();
        });
    });

    newsQueryButton?.addEventListener('click', () => {
        searchQuery = String(newsQueryInput?.value || '').trim();
        currentCategory = 'topic';
        newsFilterTabs.forEach((tab) => tab.classList.remove('is-active'));
        newsFilterTabs[2]?.classList.add('is-active');
        loadNews();
    });

    newsQueryInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            newsQueryButton?.click();
        }
    });

    newsRefreshButton?.addEventListener('click', () => {
        newsRefreshButton.classList.add('spinning');
        newsCache = {};
        loadNews().finally(() => {
            newsRefreshButton.classList.remove('spinning');
        });
    });

    sidebarToggle?.addEventListener('click', () => {
        const isCollapsed = appSidebar?.classList.toggle('is-collapsed');
        sidebarToggle.setAttribute('aria-expanded', String(!isCollapsed));
        sidebarToggle.setAttribute('aria-label', isCollapsed ? '���� �޴� ��ġ��' : '���� �޴� ����');
    });

    searchBar?.addEventListener('input', () => {
        updateSearchClearButton();
        searchModal?.classList.add('show');
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(() => searchStocks(searchBar.value), 250);
    });

    searchBar?.addEventListener('focus', () => {
        searchModal?.classList.add('show');
    });

    searchBar?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        const firstResult = searchResults?.querySelector('.search-result-item');
        if (firstResult) {
            openTradingPage(firstResult.dataset.code);
            return;
        }
        openTradingPage(searchBar.value);
    });

    searchClearButton?.addEventListener('click', () => {
        if (searchBar) searchBar.value = '';
        updateSearchClearButton();
        renderSearchMessage('����� �Ǵ� �����ڵ带 �Է��ϼ���.');
    });

    searchResults?.addEventListener('click', (event) => {
        const item = event.target.closest('.search-result-item');
        if (!item) return;
        openTradingPage(item.dataset.code);
    });

    document.addEventListener('click', (event) => {
        if (!searchModal || !searchBar) return;
        if (!searchModal.contains(event.target) && event.target !== searchBar) {
            searchModal.classList.remove('show');
        }
    });

    loadNews();
});

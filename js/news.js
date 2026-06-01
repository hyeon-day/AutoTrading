import { authFetch } from './apiClient.js';

document.addEventListener('DOMContentLoaded', () => {
    // ─── DOM 참조 ──────────────────────────────────────────────────────────────
    const sidebarToggle    = document.getElementById('sidebarToggle');
    const appSidebar       = document.getElementById('appSidebar');
    const searchBar        = document.getElementById('searchBar');
    const searchClearButton = document.getElementById('searchClearButton');
    const searchModal      = document.getElementById('searchModal');
    const searchResults    = document.getElementById('searchResults');
    const newsRefreshButton = document.getElementById('newsRefreshButton');
    const newsFilterTabs   = document.querySelectorAll('.news-filter-tab');
    const newsList         = document.querySelector('.news-list');
    const newsSummaryList  = document.querySelector('.news-summary-list');
    const newsQueryInput   = document.getElementById('newsQueryInput');
    const newsQueryButton  = document.getElementById('newsQueryButton');
    const newsSortButtons  = document.querySelectorAll('.news-sort-button');

    // ─── 상태 ──────────────────────────────────────────────────────────────────
    let searchTimer    = null;
    let currentCategory = 'all';
    let searchQuery    = '';
    let sortMode       = 'accuracy';

    // ─── 유틸리티 ──────────────────────────────────────────────────────────────

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#39;');

    const formatPubDate = (dateString) => {
        try {
            const date    = new Date(dateString);
            const now     = new Date();
            const diffMs  = now - date;
            const diffMin = Math.floor(diffMs / 60_000);
            const diffHr  = Math.floor(diffMs / 3_600_000);
            const diffDay = Math.floor(diffMs / 86_400_000);

            if (diffMin < 1)  return '방금 전';
            if (diffMin < 60) return `${diffMin}분 전`;
            if (diffHr  < 24) return `${diffHr}시간 전`;
            if (diffDay < 7)  return `${diffDay}일 전`;
            return date.toLocaleDateString('ko-KR');
        } catch {
            return String(dateString || '');
        }
    };

    // ─── 주식 검색 ─────────────────────────────────────────────────────────────

    const renderSearchMessage = (message) => {
        if (!searchResults) return;
        searchResults.innerHTML = `<div class="search-empty">${escapeHtml(message)}</div>`;
    };

    const renderSearchResults = (results = []) => {
        if (!searchResults) return;
        if (!results.length) {
            renderSearchMessage('검색 결과가 없습니다.');
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
            renderSearchMessage('종목명 또는 종목코드를 입력하세요.');
            return;
        }
        renderSearchMessage('검색 중...');
        try {
            const response = await authFetch(`/api/search?q=${encodeURIComponent(keyword)}`, { cache: 'no-store' });
            const payload  = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.message || `HTTP ${response.status}`);
            renderSearchResults(payload.results || []);
        } catch (error) {
            console.error('주식 검색 실패:', error);
            renderSearchMessage(error.message || '검색에 실패했습니다.');
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

    // ─── 뉴스 요약 패널 ────────────────────────────────────────────────────────

    /**
     * 뉴스 요약 카운트 업데이트
     * 네이버 API는 단일 쿼리 결과이므로 반환된 전체 건수를 표시
     */
    const updateNewsSummary = (news = []) => {
        if (!newsSummaryList) return;

        const categoryLabels = {
            all:         '전체 뉴스',
            market:      '시장 뉴스',
            topic:       '종목 뉴스',
            disclosure:  '공시 뉴스',
        };

        const label = categoryLabels[currentCategory] || '뉴스';

        newsSummaryList.innerHTML = `
            <div>
                <span>${escapeHtml(label)}</span>
                <strong>${news.length}</strong>
            </div>
            <div>
                <span>정렬</span>
                <strong>${sortMode === 'recency' ? '최신순' : '관련성'}</strong>
            </div>
            <div>
                <span>캐시</span>
                <strong>5분</strong>
            </div>
        `;
    };

    // ─── 뉴스 렌더링 ───────────────────────────────────────────────────────────

    const renderNews = (news = []) => {
        if (!newsList) return;

        if (!news.length) {
            newsList.innerHTML = '<div class="loading-empty">검색 결과가 없습니다. 다른 검색어나 필터를 사용해보세요.</div>';
            updateNewsSummary([]);
            return;
        }

        newsList.innerHTML = news.map((item) => `
            <article class="news-item">
                <div class="news-item-meta">
                    <span>${escapeHtml(item.source || '뉴스')}</span>
                    <time datetime="${escapeHtml(item.pubDate)}">${escapeHtml(formatPubDate(item.pubDate))}</time>
                </div>
                <h3>
                    <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">
                        ${escapeHtml(item.title)}
                    </a>
                </h3>
                <p>${escapeHtml(item.description || '')}</p>
            </article>
        `).join('');

        updateNewsSummary(news);
    };

    // ─── 정렬 버튼 ─────────────────────────────────────────────────────────────

    const setActiveSortButton = (mode) => {
        sortMode = mode;
        newsSortButtons.forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.sort === mode);
        });
    };

    // ─── 뉴스 로드 ─────────────────────────────────────────────────────────────

    const loadNews = async () => {
        if (!newsList) return;

        // '종목' 탭에서 검색어 없을 때 안내
        if (currentCategory === 'topic' && !searchQuery) {
            newsList.innerHTML = '<div class="loading-empty">검색어를 입력하면 관련 종목 뉴스가 표시됩니다.</div>';
            updateNewsSummary([]);
            return;
        }

        newsList.innerHTML = '<div class="loading-indicator">뉴스를 불러오는 중...</div>';

        const params = new URLSearchParams({ category: currentCategory, sort: sortMode });
        if (searchQuery) params.set('q', searchQuery);

        try {
            const response = await authFetch(`/api/news?${params}`, { cache: 'no-store' });
            const payload  = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.message || `HTTP ${response.status}`);
            renderNews(payload.news || []);
        } catch (error) {
            console.error('뉴스 로딩 실패:', error);
            newsList.innerHTML = `<div class="loading-error">뉴스를 불러오지 못했습니다: ${escapeHtml(error.message)}</div>`;
            updateNewsSummary([]);
        }
    };

    // ─── 이벤트 리스너 ────────────────────────────────────────────────────────

    const categories = ['all', 'market', 'topic', 'disclosure'];

    newsFilterTabs.forEach((tab, index) => {
        tab.addEventListener('click', () => {
            newsFilterTabs.forEach((t) => t.classList.remove('is-active'));
            tab.classList.add('is-active');
            currentCategory = categories[index] || 'all';
            if (currentCategory !== 'topic') {
                if (newsQueryInput) newsQueryInput.value = '';
                searchQuery = '';
            }
            loadNews();
        });
    });

    newsSortButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            setActiveSortButton(btn.dataset.sort);
            loadNews();
        });
    });

    newsQueryButton?.addEventListener('click', () => {
        searchQuery = String(newsQueryInput?.value || '').trim();
        currentCategory = 'topic';
        newsFilterTabs.forEach((t) => t.classList.remove('is-active'));
        newsFilterTabs[2]?.classList.add('is-active');
        loadNews();
    });

    newsQueryInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') newsQueryButton?.click();
    });

    newsRefreshButton?.addEventListener('click', () => {
        newsRefreshButton.classList.add('spinning');
        loadNews().finally(() => newsRefreshButton.classList.remove('spinning'));
    });

    sidebarToggle?.addEventListener('click', () => {
        const collapsed = appSidebar?.classList.toggle('is-collapsed');
        sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
        sidebarToggle.setAttribute('aria-label', collapsed ? '좌측 메뉴 열기' : '좌측 메뉴 닫기');
    });

    searchBar?.addEventListener('input', () => {
        updateSearchClearButton();
        searchModal?.classList.add('show');
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => searchStocks(searchBar.value), 250);
    });

    searchBar?.addEventListener('focus', () => searchModal?.classList.add('show'));

    searchBar?.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const first = searchResults?.querySelector('.search-result-item');
        openTradingPage(first ? first.dataset.code : searchBar.value);
    });

    searchClearButton?.addEventListener('click', () => {
        if (searchBar) searchBar.value = '';
        updateSearchClearButton();
        renderSearchMessage('종목명 또는 종목코드를 입력하세요.');
    });

    searchResults?.addEventListener('click', (e) => {
        const item = e.target.closest('.search-result-item');
        if (item) openTradingPage(item.dataset.code);
    });

    document.addEventListener('click', (e) => {
        if (!searchModal || !searchBar) return;
        if (!searchModal.contains(e.target) && e.target !== searchBar) {
            searchModal.classList.remove('show');
        }
    });

    // ─── 초기 로드 ─────────────────────────────────────────────────────────────
    loadNews();
});

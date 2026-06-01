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

    let searchTimer = null;
    let currentCategory = 'all'; // 현재 활성 탭: all, market, economic, disclosure
    let newsCache = {}; // 뉴스 데이터 캐시

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

            if (diffMins < 1) return '방금 전';
            if (diffMins < 60) return `${diffMins}분 전`;
            if (diffHours < 24) return `${diffHours}시간 전`;
            if (diffDays < 7) return `${diffDays}일 전`;
            return date.toLocaleDateString('ko-KR');
        } catch {
            return dateString;
        }
    };

    // 탭 클릭 리스너
    newsFilterTabs.forEach((tab, index) => {
        tab.addEventListener('click', () => {
            newsFilterTabs.forEach(t => t.classList.remove('is-active'));
            tab.classList.add('is-active');

            const categoryMap = ['all', 'market', 'economic', 'disclosure'];
            currentCategory = categoryMap[index] || 'all';
            loadNews();
        });
    });

    // 새로고침 버튼
    newsRefreshButton?.addEventListener('click', () => {
        newsRefreshButton.classList.add('spinning');
        newsCache = {}; // 캐시 초기화
        loadNews().finally(() => {
            newsRefreshButton.classList.remove('spinning');
        });
    });

    // 뉴스 로드 함수
    const loadNews = async () => {
        try {
            if (newsList) {
                newsList.innerHTML = '<div class="loading-indicator">뉴스를 불러오는 중...</div>';
            }

            const response = await authFetch(`/api/news?category=${currentCategory}`, { cache: 'no-store' });
            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(payload.message || `HTTP ${response.status}`);
            }

            const news = payload.news || [];
            newsCache[currentCategory] = news;

            renderNews(news);
            updateSummary();
        } catch (error) {
            console.error('News loading failed:', error);
            if (newsList) {
                newsList.innerHTML = `<div class="loading-error">뉴스를 불러오지 못했습니다: ${escapeHtml(error.message)}</div>`;
            }
        }
    };

    // 뉴스 렌더링
    const renderNews = (news = []) => {
        if (!newsList) return;

        if (!news.length) {
            newsList.innerHTML = '<div class="loading-empty">뉴스가 없습니다.</div>';
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
    };

    // 요약 업데이트
    const updateSummary = () => {
        if (!newsSummaryList) return;

        const counts = {
            market: newsCache['market']?.length || 0,
            economic: newsCache['economic']?.length || 0,
            disclosure: newsCache['disclosure']?.length || 0,
        };

        newsSummaryList.innerHTML = `
            <div>
                <span>시장 뉴스</span>
                <strong>${counts.market}</strong>
            </div>
            <div>
                <span>경제 뉴스</span>
                <strong>${counts.economic}</strong>
            </div>
            <div>
                <span>공시</span>
                <strong>${counts.disclosure}</strong>
            </div>
        `;
    };

    // 검색 관련 함수들 (기존 코드)
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
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.message || `HTTP ${response.status}`);
            renderSearchResults(payload.results || []);
        } catch (error) {
            console.error('News search failed.', error);
            renderSearchMessage(error.message || '검색하지 못했습니다.');
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

    sidebarToggle?.addEventListener('click', () => {
        const isCollapsed = appSidebar?.classList.toggle('is-collapsed');
        sidebarToggle.setAttribute('aria-expanded', String(!isCollapsed));
        sidebarToggle.setAttribute('aria-label', isCollapsed ? '좌측 메뉴 펼치기' : '좌측 메뉴 접기');
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
        renderSearchMessage('종목명 또는 종목코드를 입력하세요.');
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

    // 페이지 로드 시 뉴스 초기 로드
    loadNews();
});


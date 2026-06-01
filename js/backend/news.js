const dotenv = require('dotenv');
const xml2js = require('xml2js');

dotenv.config();

const DART_API_KEY = process.env.DART_API_KEY;
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

// Cache structure: { lastUpdate, data }
let newsCache = {
    dart: { lastUpdate: 0, data: [] },
    kakao: new Map(),
    rss: { lastUpdate: 0, data: [] },
};

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in ms
const RSS_FEEDS = {
    mk_main: 'https://www.mk.co.kr/rss/30000001/',
    mk_market: 'https://www.mk.co.kr/rss/40300001/',
    mk_economy: 'https://www.mk.co.kr/rss/30100041/',
};

function filterNewsByQuery(newsItems, query) {
    if (!query) return newsItems;
    const needle = String(query).toLowerCase();
    return newsItems.filter(item =>
        fuzzyMatch(item.title, needle) ||
        fuzzyMatch(item.description, needle) ||
        fuzzyMatch(item.source, needle)
    );
}

async function getCachedKakaoNews(searchQuery = '주식 시장', sortType = 'accuracy') {
    const key = `${String(searchQuery).trim()}|${sortType}`;
    const now = Date.now();
    const cached = newsCache.kakao.get(key);
    if (cached && now - cached.lastUpdate < CACHE_DURATION) {
        return cached.data;
    }

    const data = await fetchKakaoNews(searchQuery || '주식 시장', sortType);
    newsCache.kakao.set(key, { lastUpdate: now, data });
    if (newsCache.kakao.size > 20) {
        const oldestKey = newsCache.kakao.keys().next().value;
        newsCache.kakao.delete(oldestKey);
    }
    return data;
}

/**
 * DART API: 공시 뉴스 조회
 * 검색어(회사명)가 있으면 해당 회사의 공시, 없으면 최근 공시
 */
async function fetchDartNews(searchQuery = '') {
    try {
        // DART API: 공시 목록 조회
        // 기본 URL: https://opendart.fss.or.kr/api/list.json
        const url = new URL('https://opendart.fss.or.kr/api/list.json');
        url.searchParams.append('crtfc_key', DART_API_KEY);
        url.searchParams.append('pageNo', '1');
        url.searchParams.append('pageCount', '10'); // 최근 10개

        const response = await fetch(url.toString());
        const data = await response.json();

        if (data.list && Array.isArray(data.list)) {
            return data.list.map(item => ({
                source: 'DART',
                category: '공시',
                title: item.report_nm || '공시',
                link: `https://opendart.fss.or.kr/cgi-bin/browse.cgi?action=corpus&corp_code=${item.corp_code}&report_no=${item.report_no}`,
                pubDate: item.report_nm_date || new Date().toISOString(),
                description: item.corp_name || '',
            }));
        }
        return [];
    } catch (error) {
        console.error('DART API Error:', error.message);
        return [];
    }
}

/**
 * Kakao News Search API: 뉴스 검색
 */
async function fetchKakaoNews(searchQuery = '주식 시장', sortType = 'accuracy') {
    try {
        const url = new URL('https://dapi.kakao.com/v2/search/web');
        url.searchParams.append('query', searchQuery);
        url.searchParams.append('size', '10');
        url.searchParams.append('sort', sortType === 'recency' ? 'recency' : 'accuracy');

        const response = await fetch(url.toString(), {
            headers: {
                'Authorization': `KakaoAK ${KAKAO_REST_API_KEY}`,
            },
        });

        const data = await response.json();

        if (data.documents && Array.isArray(data.documents)) {
            return data.documents
                .filter(item => item.title.includes('뉴스') || item.url.includes('news'))
                .slice(0, 10)
                .map(item => ({
                    source: 'Kakao',
                    category: '뉴스',
                    title: item.title.replace(/<[^>]*>/g, ''), // HTML 태그 제거
                    link: item.url,
                    pubDate: item.datetime || new Date().toISOString(),
                    description: item.contents ? item.contents.replace(/<[^>]*>/g, '') : '',
                }));
        }
        return [];
    } catch (error) {
        console.error('Kakao API Error:', error.message);
        return [];
    }
}

function fuzzyMatch(text, query) {
    if (!query) return true;
    const normalized = String(text || '').toLowerCase();
    const needle = String(query).toLowerCase();
    return normalized.includes(needle);
}

/**
 * RSS Feed Parser: 연합뉴스, 한국경제, 매일경제
 */
async function fetchRssNews() {
    try {
        const parser = new xml2js.Parser({
            strict: false,
            normalize: true,
            normalizeTags: true,
            trim: true,
            explicitArray: false,
        });
        const allNews = [];

        for (const [source, url] of Object.entries(RSS_FEEDS)) {
            try {
                const response = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                        'Accept': 'application/rss+xml, application/xml, text/xml, */*;q=0.1',
                    },
                    redirect: 'follow',
                });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const xml = await response.text();
                const result = await parser.parseStringPromise(xml);
                let items = [];
                if (result?.rss?.channel) {
                    const channel = result.rss.channel;
                    items = channel.item || [];
                } else if (result?.feed?.entry) {
                    items = result.feed.entry;
                }
                if (!Array.isArray(items)) {
                    items = [items];
                }
                const sourceMap = {
                    yonhap: '연합뉴스',
                    hankyung: '한국경제',
                    maeil: '매일경제',
                    mk_main: '매일경제',
                    mk_market: '매일경제',
                    mk_economy: '매일경제',
                };

                items.forEach(item => {
                    allNews.push({
                        source: sourceMap[source],
                        category: '경제',
                        title: item.title || item['dc:title'] || '',
                        link: item.link || (item.guid && item.guid._) || '',
                        pubDate: item.pubDate || item.published || item['dc:date'] || new Date().toISOString(),
                        description: item.description || item.summary || item['dc:description'] || '',
                    });
                });
            } catch (err) {
                console.warn(`RSS Feed Error (${source}):`, err.message);
            }
        }

        return allNews.slice(0, 10); // 최대 10개
    } catch (error) {
        console.error('RSS Parser Error:', error.message);
        return [];
    }
}

/**
 * 모든 뉴스 소스에서 뉴스 조회 (캐싱 적용)
 */
async function getAllNews(searchQuery = '', sortType = 'accuracy') {
    const now = Date.now();
    const results = {
        dart: [],
        kakao: [],
        rss: [],
    };

    // DART 뉴스 캐시 체크
    if (now - newsCache.dart.lastUpdate > CACHE_DURATION) {
        results.dart = await fetchDartNews(searchQuery);
        newsCache.dart = { lastUpdate: now, data: results.dart };
    } else {
        results.dart = newsCache.dart.data;
    }

    // Kakao 뉴스 캐시 (검색어/정렬별 캐시)
    results.kakao = await getCachedKakaoNews(searchQuery || '주식 시장', sortType);

    // RSS 뉴스 캐시 체크
    if (now - newsCache.rss.lastUpdate > CACHE_DURATION) {
        results.rss = await fetchRssNews();
        newsCache.rss = { lastUpdate: now, data: results.rss };
    } else {
        results.rss = newsCache.rss.data;
    }

    return results;
}

/**
 * 특정 탭별 뉴스 반환
 */
async function getNewsByCategory(category = 'all', searchQuery = '', sortType = 'accuracy') {
    const allNews = await getAllNews(searchQuery, sortType);
    const query = String(searchQuery || '').trim();

    switch (category) {
        case 'disclosure': // 공시
            return query
                ? filterNewsByQuery(allNews.dart, query)
                : allNews.dart;
        case 'market': // 시장 뉴스
            return query
                ? await getCachedKakaoNews(query, sortType)
                : allNews.kakao;
        case 'topic':
            if (!query) {
                return [];
            }
            return [
                ...await getCachedKakaoNews(query, sortType),
                ...filterNewsByQuery(allNews.rss, query),
            ].sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
        case 'all':
        default:
            const combined = [
                ...filterNewsByQuery(allNews.dart, query),
                ...filterNewsByQuery(allNews.kakao, query),
                ...filterNewsByQuery(allNews.rss, query),
            ];
            return sortType === 'recency'
                ? combined.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
                : combined;
    }
}

module.exports = {
    getAllNews,
    getNewsByCategory,
};

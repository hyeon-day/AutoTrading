import dotenv from 'dotenv';
import xml2js from 'xml2js';

dotenv.config();

const DART_API_KEY = process.env.DART_API_KEY;
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

// Cache structure: { lastUpdate, data }
let newsCache = {
    dart: { lastUpdate: 0, data: [] },
    kakao: { lastUpdate: 0, data: [] },
    rss: { lastUpdate: 0, data: [] },
};

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in ms
const RSS_FEEDS = {
    yonhap: 'https://feeds.yonhapnews.co.kr/YNA/WREC.xml',
    hankyung: 'https://www.hankyung.com/feed/recentnews.xml',
    maeil: 'https://rss.mk.co.kr/section/all/rss-2.0.xml',
};

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
async function fetchKakaoNews(searchQuery = '주식 시장') {
    try {
        const url = new URL('https://dapi.kakao.com/v2/search/web');
        url.searchParams.append('query', searchQuery);
        url.searchParams.append('size', '10');
        url.searchParams.append('sort', 'recency');

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

/**
 * RSS Feed Parser: 연합뉴스, 한국경제, 매일경제
 */
async function fetchRssNews() {
    try {
        const parser = new xml2js.Parser();
        const allNews = [];

        for (const [source, url] of Object.entries(RSS_FEEDS)) {
            try {
                const response = await fetch(url);
                const xml = await response.text();
                const result = await parser.parseStringPromise(xml);

                const items = result.rss?.channel?.[0]?.item || [];
                const sourceMap = {
                    yonhap: '연합뉴스',
                    hankyung: '한국경제',
                    maeil: '매일경제',
                };

                items.forEach(item => {
                    allNews.push({
                        source: sourceMap[source],
                        category: '경제',
                        title: item.title?.[0] || '',
                        link: item.link?.[0] || '',
                        pubDate: item.pubDate?.[0] || new Date().toISOString(),
                        description: item.description?.[0] || '',
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
export async function getAllNews(searchQuery = '') {
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

    // Kakao 뉴스 캐시 체크
    if (now - newsCache.kakao.lastUpdate > CACHE_DURATION) {
        results.kakao = await fetchKakaoNews(searchQuery);
        newsCache.kakao = { lastUpdate: now, data: results.kakao };
    } else {
        results.kakao = newsCache.kakao.data;
    }

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
export async function getNewsByCategory(category = 'all') {
    const allNews = await getAllNews();

    switch (category) {
        case 'disclosure': // 공시
            return allNews.dart;
        case 'market': // 시장 뉴스
            return allNews.kakao;
        case 'economic': // 경제
            return allNews.rss;
        case 'all':
        default:
            // 모두 합쳐서 시간순 정렬
            const combined = [...allNews.dart, ...allNews.kakao, ...allNews.rss];
            return combined.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    }
}

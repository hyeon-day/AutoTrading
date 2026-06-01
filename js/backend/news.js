// 뉴스 백엔드 — 네이버 뉴스 검색 Open API 기반
// https://developers.naver.com/docs/serviceapi/search/news/news.md

const https = require('https');
const dotenv = require('dotenv');

dotenv.config();

// ─── 설정 ─────────────────────────────────────────────────────────────────────

const NAVER_CLIENT_ID     = process.env.NAVER_CLIENT_ID     || '';
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || '';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5분
const MAX_RESULTS  = 50;             // 최대 반환 건수

/** 카테고리 → 기본 검색 키워드 */
const CATEGORY_QUERY = {
    all:         '주식 증시',
    market:      '코스피 코스닥 증시',
    topic:       '주식',           // 검색어 미입력 시 fallback
    disclosure:  '공시 상장 IR',
};

// ─── 캐시 (카테고리 + 쿼리 복합 키) ─────────────────────────────────────────

/** @type {Map<string, { ts: number, data: object[] }>} */
const cache = new Map();

function getCacheKey(category, query, sort) {
    return `${category}::${query}::${sort}`;
}

function getFromCache(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
        cache.delete(key);
        return null;
    }
    return entry.data;
}

function setToCache(key, data) {
    cache.set(key, { ts: Date.now(), data });
}

// ─── 네이버 Open API 호출 ─────────────────────────────────────────────────────

/**
 * 네이버 뉴스 검색 Open API 호출
 * @param {string} query      검색어
 * @param {'sim'|'date'} sort 정렬 (sim=관련성, date=최신)
 * @param {number} display    결과 수 (최대 100)
 * @param {number} start      시작 위치 (1-based)
 * @returns {Promise<object[]>}
 */
function fetchNaverNewsApi(query, sort = 'sim', display = 30, start = 1) {
    return new Promise((resolve) => {
        if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET ||
            NAVER_CLIENT_ID.includes('여기에') || NAVER_CLIENT_SECRET.includes('여기에')) {
            console.warn('[news] 네이버 API 키가 설정되지 않았습니다. .env에 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 설정 필요.');
            return resolve([]);
        }

        const params = new URLSearchParams({
            query,
            display: String(Math.min(display, 100)),
            start:   String(start),
            sort,
        });

        const options = {
            hostname: 'openapi.naver.com',
            path:     `/v1/search/news.json?${params}`,
            method:   'GET',
            headers: {
                'X-Naver-Client-Id':     NAVER_CLIENT_ID,
                'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
                'Accept':                'application/json',
            },
        };

        const req = https.request(options, (res) => {
            let raw = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { raw += chunk; });
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    console.error(`[news] 네이버 API 오류 ${res.statusCode}: ${raw.slice(0, 200)}`);
                    return resolve([]);
                }
                try {
                    const json = JSON.parse(raw);
                    resolve(normalizeItems(json.items || []));
                } catch (err) {
                    console.error('[news] 응답 파싱 오류:', err.message);
                    resolve([]);
                }
            });
        });

        req.on('error', (err) => {
            console.error('[news] HTTPS 요청 오류:', err.message);
            resolve([]);
        });

        req.setTimeout(8000, () => {
            req.destroy();
            console.warn('[news] 네이버 API 타임아웃');
            resolve([]);
        });

        req.end();
    });
}

// ─── 응답 정규화 ──────────────────────────────────────────────────────────────

/** HTML 태그 및 엔티티 제거 */
function stripHtml(str) {
    return String(str || '')
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g,  '&')
        .replace(/&lt;/g,   '<')
        .replace(/&gt;/g,   '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g,  "'")
        .replace(/&apos;/g, "'")
        .trim();
}

/**
 * 네이버 API 응답 아이템 → 내부 표준 형식
 * @param {object[]} items
 * @returns {object[]}
 */
function normalizeItems(items) {
    return items.map((item) => ({
        title:       stripHtml(item.title),
        link:        item.originallink || item.link || '',
        description: stripHtml(item.description),
        pubDate:     item.pubDate || new Date().toISOString(),
        source:      extractSource(item.originallink || item.link || ''),
    }));
}

/** URL에서 언론사명 추출 */
function extractSource(url) {
    try {
        const hostname = new URL(url).hostname.replace(/^www\./, '');
        // 주요 언론사 매핑
        const map = {
            'news.naver.com':      '네이버뉴스',
            'finance.naver.com':   '네이버금융',
            'hankyung.com':        '한국경제',
            'mk.co.kr':            '매일경제',
            'edaily.co.kr':        '이데일리',
            'etnews.com':          '전자신문',
            'chosun.com':          '조선일보',
            'joongang.co.kr':      '중앙일보',
            'donga.com':           '동아일보',
            'yna.co.kr':           '연합뉴스',
            'newsis.com':          '뉴시스',
            'yonhapnewstv.co.kr':  '연합뉴스TV',
            'sedaily.com':         '서울경제',
            'fnnews.com':          '파이낸셜뉴스',
            'thebell.co.kr':       '더벨',
            'inews24.com':         '아이뉴스24',
            'biz.chosun.com':      '조선비즈',
            'bloomberg.co.kr':     '블룸버그',
            'reuters.com':         '로이터',
        };
        return map[hostname] || hostname.split('.').slice(-2, -1)[0] || '뉴스';
    } catch {
        return '뉴스';
    }
}

// ─── 공개 인터페이스 ──────────────────────────────────────────────────────────

/**
 * 카테고리 및 검색어로 뉴스 조회
 *
 * @param {'all'|'market'|'topic'|'disclosure'} category
 * @param {string} searchQuery  사용자 검색어 (선택)
 * @param {'accuracy'|'recency'} sortType
 * @returns {Promise<object[]>}
 */
async function getNewsByCategory(category = 'all', searchQuery = '', sortType = 'accuracy') {
    const apiSort  = sortType === 'recency' ? 'date' : 'sim';
    const query    = searchQuery.trim() || CATEGORY_QUERY[category] || CATEGORY_QUERY.all;
    const cacheKey = getCacheKey(category, query, apiSort);

    // 캐시 HIT
    const cached = getFromCache(cacheKey);
    if (cached) {
        return cached;
    }

    // 네이버 API 호출 (display 30씩 2페이지 = 최대 60건)
    const [page1, page2] = await Promise.all([
        fetchNaverNewsApi(query, apiSort, 30, 1),
        fetchNaverNewsApi(query, apiSort, 30, 31),
    ]);

    const news = [...page1, ...page2].slice(0, MAX_RESULTS);

    if (news.length > 0) {
        setToCache(cacheKey, news);
    }

    return news;
}

module.exports = { getNewsByCategory };

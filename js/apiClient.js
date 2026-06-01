import { getAccessToken } from './supabaseClient.js';

export async function authFetch(input, options = {}) {
    const accessToken = await getAccessToken();
    const headers = new Headers(options.headers || {});
    if (accessToken) {
        headers.set('Authorization', `Bearer ${accessToken}`);
    }

    let url = input;
    // 비로그인 상태에서 특정 요청을 데모 엔드포인트로 라우팅
    if (!accessToken && typeof input === 'string') {
        if (input.includes('/api/chart/')) {
            url = input.replace('/api/chart/', '/api/chart/demo/');
        } else if (input.startsWith('/api/home-rankings')) {
            url = input.replace('/api/home-rankings', '/api/demo/home-rankings');
        } else if (input.startsWith('/api/search')) {
            url = input.replace('/api/search', '/api/demo/search');
        } else if (input.startsWith('/api/stock/')) {
            url = input.replace('/api/stock/', '/api/demo/stock/');
        } else if (input.startsWith('/api/realtime/')) {
            url = input.replace('/api/realtime/', '/api/demo/realtime/');
        }
    }

    return fetch(url, {
        ...options,
        headers,
    });
}

export async function createAuthenticatedEventSource(url) {
    const accessToken = await getAccessToken();
    // if no token and realtime URL, route to demo realtime
    let sourceUrl = new URL(url, window.location.origin);
    if (!accessToken && sourceUrl.pathname.startsWith('/api/realtime/')) {
        sourceUrl = new URL(sourceUrl.toString().replace('/api/realtime/', '/api/demo/realtime/'));
    }
    if (accessToken) {
        sourceUrl.searchParams.set('access_token', accessToken);
    }

    return new EventSource(sourceUrl.toString());
}

// re-export access token helper so UI can query login state
export { getAccessToken };


import { getAccessToken } from './supabaseClient.js';

export async function authFetch(input, options = {}) {
    const accessToken = await getAccessToken();
    const headers = new Headers(options.headers || {});
    if (accessToken) {
        headers.set('Authorization', `Bearer ${accessToken}`);
    }

    let url = input;
    // 비로그인 상태에서 차트 요청 시 데모 API 사용
    if (!accessToken && typeof input === 'string' && input.includes('/api/chart/')) {
        url = input.replace('/api/chart/', '/api/chart/demo/');
    }

    return fetch(url, {
        ...options,
        headers,
    });
}

export async function createAuthenticatedEventSource(url) {
    const accessToken = await getAccessToken();
    const sourceUrl = new URL(url, window.location.origin);
    if (accessToken) {
        sourceUrl.searchParams.set('access_token', accessToken);
    }

    return new EventSource(sourceUrl.toString());
}


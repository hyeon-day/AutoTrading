//데모 차트 데이터 (비로그인 사용자용)

const path = require('path');
const fs = require('fs');
const { getChartData } = require('./charts');

function loadDotEnv() {
    const ROOT_DIR = path.resolve(__dirname, '..', '..');
    const envPath = path.join(ROOT_DIR, '.env');
    if (!fs.existsSync(envPath)) return;

    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;

        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').trim().replace(/^['"]|['"]$/g, '');
        if (!process.env[key.trim()]) {
            process.env[key.trim()] = value;
        }
    }
}

function getDemoCredentials() {
    loadDotEnv();
    const appkey = process.env.KIWOOM_DEMO_APPKEY;
    const secretkey = process.env.KIWOOM_DEMO_SECRETKEY;

    if (!appkey || !secretkey) {
        const error = new Error('Demo Kiwoom API keys not configured. Please set KIWOOM_DEMO_APPKEY and KIWOOM_DEMO_SECRETKEY in .env');
        error.statusCode = 503;
        throw error;
    }

    return { appkey, secretkey };
}

async function getDemoChartData(query, interval = '1', options = {}) {
    try {
        const credentials = getDemoCredentials();
        return await getChartData(query, interval, credentials, options);
    } catch (error) {
        if (!error.statusCode) {
            error.statusCode = 500;
        }
        throw error;
    }
}

module.exports = {
    getDemoChartData,
    getDemoCredentials,
};

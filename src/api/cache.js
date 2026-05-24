// --- キャッシュ管理ヘルパー ---

export function getCacheKey(dateStr) {
    return `mf_cache_${dateStr}`;
}

export function isCacheable(dateStr) {
    const target = parseLocalDate(dateStr);
    const now = new Date();
    // 現在の年月より前であればキャッシュ可能（過去データは変動しない前提）
    return (target.getFullYear() < now.getFullYear()) ||
        (target.getFullYear() === now.getFullYear() && target.getMonth() < now.getMonth());
}

export async function getCacheSize() {
    let size = 0;
    let count = 0;
    if (hasExtensionStorage()) {
        const values = await chrome.storage.local.get(null);
        for (const [key, value] of Object.entries(values)) {
            if (!isDataCacheKey(key)) continue;
            size += String(value ?? '').length;
            count++;
        }
    }
    clearLegacyDataCache();
    return { size: (size / 1024).toFixed(1), count };
}

export async function clearCache() {
    let removed = 0;
    if (hasExtensionStorage()) {
        const values = await chrome.storage.local.get(null);
        const keysToRemove = Object.keys(values).filter(isDataCacheKey);
        if (keysToRemove.length > 0) {
            await chrome.storage.local.remove(keysToRemove);
        }
        removed += keysToRemove.length;
    }
    removed += clearLegacyDataCache();
    return removed;
}

function isDataCacheKey(key) {
    return key.startsWith('mf_cache_') || key.startsWith('mf_daily_');
}

function hasExtensionStorage() {
    return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

function clearLegacyDataCache() {
    const keysToRemove = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && isDataCacheKey(key)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch {
        return 0;
    }
    return keysToRemove.length;
}

function parseLocalDate(dateString) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString || '');
    if (match) {
        const [, year, month, day] = match;
        return new Date(Number(year), Number(month) - 1, Number(day));
    }
    return new Date(dateString);
}

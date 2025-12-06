// --- キャッシュ管理ヘルパー ---

export function getCacheKey(dateStr) {
    return `mf_cache_${dateStr}`;
}

export function isCacheable(dateStr) {
    const target = new Date(dateStr);
    const now = new Date();
    // 現在の年月より前であればキャッシュ可能（過去データは変動しない前提）
    return (target.getFullYear() < now.getFullYear()) ||
        (target.getFullYear() === now.getFullYear() && target.getMonth() < now.getMonth());
}

export function getCacheSize() {
    let size = 0;
    let count = 0;
    for (let key in localStorage) {
        if (key.startsWith('mf_cache_')) {
            size += localStorage.getItem(key).length;
            count++;
        }
    }
    return { size: (size / 1024).toFixed(1), count };
}

export function clearCache() {
    const keysToRemove = [];
    for (let key in localStorage) {
        if (key.startsWith('mf_cache_')) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    return keysToRemove.length;
}

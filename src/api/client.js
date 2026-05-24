import { getCacheKey, isCacheable } from './cache.js';

let activeOperation = null;

function beginOperation() {
    if (activeOperation) return null;
    activeOperation = Symbol('fetch-operation');
    return activeOperation;
}

function endOperation(operation) {
    if (activeOperation === operation) {
        activeOperation = null;
    }
}

function hasExtensionStorage() {
    return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

function removeLegacyCache(key) {
    try {
        localStorage.removeItem(key);
    } catch {
        // Ignore pages that block localStorage access.
    }
}

async function getCachedValue(key) {
    if (!hasExtensionStorage()) return null;
    const cached = await chrome.storage.local.get(key);
    removeLegacyCache(key);
    return typeof cached[key] === 'string' ? cached[key] : null;
}

async function setCachedValue(key, value) {
    if (!hasExtensionStorage()) return;
    await chrome.storage.local.set({ [key]: value });
    removeLegacyCache(key);
}

// ==========================================
// データ取得ロジック (共通)
// ==========================================
export async function fetchData(years, onProgress) {
    const operation = beginOperation();
    if (!operation) return null;

    try {
        const maxYears = years === 'all' ? 20 : parseInt(years, 10);
        const totalMonths = maxYears * 12;

        const now = new Date();
        let targetDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        const tasks = [];
        for (let i = 0; i < totalMonths; i++) {
            const dateStr = formatDate(targetDate);
            tasks.push({
                dateStr: dateStr,
                url: `https://moneyforward.com/bs/history/list/${dateStr}/monthly/csv`,
                cacheKey: getCacheKey(dateStr),
                isCacheable: isCacheable(dateStr)
            });
            targetDate = getPrevMonthEnd(targetDate);
        }

        let allCsvRows = [];
        let headers = [];

        const BATCH_SIZE = 6; // ブラウザの同時接続数制限を考慮して調整
        for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
            const batch = tasks.slice(i, i + BATCH_SIZE);
            const progress = Math.round(((i + 1) / tasks.length) * 100);
            if (onProgress) onProgress(progress);

            const promises = batch.map(async (task) => {
                try {
                    // キャッシュチェック
                    if (task.isCacheable) {
                        const cachedCSV = await getCachedValue(task.cacheKey);
                        if (cachedCSV) {
                            const rows = parseCSV(cachedCSV);
                            if (rows.length > 1) return rows;
                        }
                    }

                    // 通信取得
                    const res = await fetch(task.url);
                    if (!res.ok) return null;
                    const blob = await res.blob();
                    const text = await readBlobAsText(blob, 'Shift_JIS');

                    const rows = parseCSV(text);
                    if (rows.length > 1) {
                        // キャッシュ保存
                        if (task.isCacheable) {
                            try {
                                await setCachedValue(task.cacheKey, text);
                            } catch (e) { console.warn('Cache storage failed (quota exceeded?)', e); }
                        }
                        return rows;
                    }
                    return null;
                } catch (e) {
                    return null;
                }
            });

            const results = await Promise.all(promises);

            results.forEach(rows => {
                if (rows) {
                    if (headers.length === 0) headers = rows[0];
                    allCsvRows.push(...rows.slice(1));
                }
            });

            await new Promise(r => setTimeout(r, 50));
        }

        if (allCsvRows.length === 0) {
            return null;
        }

        // 日付順ソート（新しい順）
        allCsvRows.sort((a, b) => parseLocalDate(b[0]) - parseLocalDate(a[0]));
        const uniqueRows = unique(allCsvRows);

        return { headers, rows: uniqueRows };

    } catch (err) {
        console.error(err);
        return null;
    } finally {
        endOperation(operation);
    }
}

// ==========================================
// 特定月のデータ取得（日次モード用）
// ==========================================
export async function fetchMonthlyData(year, month) {
    const operation = beginOperation();
    if (!operation) return null;

    try {
        // 対象月の月末日を計算
        const lastDay = new Date(year, month, 0); // monthは1-indexed
        const dateStr = formatDate(lastDay);
        const cacheKey = `mf_daily_${year}_${month}`;

        // キャッシュチェック（当月以外はキャッシュ可能）
        const now = new Date();
        const isCurrentMonth = year === now.getFullYear() && month === (now.getMonth() + 1);

        if (!isCurrentMonth) {
            const cached = await getCachedValue(cacheKey);
            if (cached) {
                try {
                    return JSON.parse(cached);
                } catch (e) { /* ignore */ }
            }
        }

        const url = `https://moneyforward.com/bs/history/list/${dateStr}/monthly/csv`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const blob = await res.blob();
        const text = await readBlobAsText(blob, 'Shift_JIS');
        const rows = parseCSV(text);

        if (rows.length <= 1) return null;

        const headers = rows[0];
        let dataRows = rows.slice(1);

        // 対象月のデータだけにフィルタリング
        dataRows = dataRows.filter(r => {
            const d = parseLocalDate(r[0]);
            return d.getFullYear() === year && (d.getMonth() + 1) === month;
        });

        // 日付順ソート（古い順）
        dataRows.sort((a, b) => parseLocalDate(a[0]) - parseLocalDate(b[0]));

        const result = { headers, rows: dataRows };

        // 当月以外はキャッシュ保存
        if (!isCurrentMonth) {
            try {
                await setCachedValue(cacheKey, JSON.stringify(result));
            } catch (e) { console.warn('Cache storage failed', e); }
        }

        return result;
    } catch (e) {
        console.error('fetchMonthlyData error:', e);
        return null;
    } finally {
        endOperation(operation);
    }
}

// --- ヘルパー関数 ---

export function formatDate(date) {
    const y = date.getFullYear();
    const m = ('0' + (date.getMonth() + 1)).slice(-2);
    const d = ('0' + date.getDate()).slice(-2);
    return `${y}-${m}-${d}`;
}

function getPrevMonthEnd(date) { return new Date(date.getFullYear(), date.getMonth(), 0); }

export function parseLocalDate(dateString) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString || '');
    if (match) {
        const [, year, month, day] = match;
        return new Date(Number(year), Number(month) - 1, Number(day));
    }
    return new Date(dateString);
}

function readBlobAsText(blob, encoding) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(blob, encoding);
    });
}

function parseCSV(text) {
    const lines = text.split(/\r\n|\n|\r/).filter(line => line.trim() !== '');
    return lines.map(line => {
        const res = []; let current = ''; let inQuote = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') inQuote = !inQuote;
            else if (char === ',' && !inQuote) { res.push(current); current = ''; }
            else current += char;
        }
        res.push(current);
        return res.map(val => val.replace(/^"|"$/g, '').replace(/""/g, '"'));
    });
}

function unique(rows) {
    const seen = new Set();
    return rows.filter(row => {
        const key = row.join(',');
        if (seen.has(key)) return false;
        seen.add(key); return true;
    });
}

export function generateCSV(rows) {
    return rows.map(row => row.map(f => `"${String(f).replace(/"/g, '""')}"`).join(',')).join('\n');
}

export function downloadCSV(csv, filename) {
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

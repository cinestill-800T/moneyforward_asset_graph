import { getCacheKey, isCacheable } from './cache.js';

let isProcessing = false;

// ==========================================
// データ取得ロジック (共通)
// ==========================================
export async function fetchData(years, onProgress) {
    if (isProcessing) return null;
    isProcessing = true;

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
                        const cachedCSV = localStorage.getItem(task.cacheKey);
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
                                localStorage.setItem(task.cacheKey, text);
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
        allCsvRows.sort((a, b) => new Date(b[0]) - new Date(a[0]));
        const uniqueRows = unique(allCsvRows);

        return { headers, rows: uniqueRows };

    } catch (err) {
        console.error(err);
        return null;
    } finally {
        isProcessing = false;
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

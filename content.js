// グローバル変数
let isProcessing = false;

function createPanel() {
  const existing = document.getElementById('mf-extension-panel');
  if (existing) existing.remove();

  const panel = document.createElement('div');
  panel.id = 'mf-extension-panel';
  
  // アイコンSVG
  const iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 21H21" stroke="white" stroke-width="2" stroke-linecap="round"/>
    <path d="M6 17L11 12L15 16L21 8" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M6 17V13" stroke="white" stroke-width="2" stroke-linecap="round"/>
    <path d="M11 12V17" stroke="white" stroke-width="2" stroke-linecap="round"/>
    <path d="M15 16V17" stroke="white" stroke-width="2" stroke-linecap="round"/>
    <path d="M21 8V17" stroke="white" stroke-width="2" stroke-linecap="round"/>
  </svg>`;

  panel.innerHTML = `
    <div id="mf-extension-header">
      <div class="mf-title">
        <span class="mf-icon-wrapper">${iconSvg}</span>
        <span>資産データ一括ダウンローダー</span>
      </div>
      <span id="mf-extension-close" title="閉じる">×</span>
    </div>
    
    <div id="mf-extension-body">
      <div class="mf-section">
        <label class="mf-label">取得範囲の設定</label>
        <div class="mf-control-group">
            <select id="mf-year-select" class="mf-select">
            <option value="1">過去 1年分</option>
            <option value="3">過去 3年分</option>
            <option value="5">過去 5年分</option>
            <option value="10" selected>過去 10年分</option>
            <option value="all">全ての期間 (可能な限り)</option>
            </select>
        </div>
      </div>

      <div class="mf-section">
        <label class="mf-label">ダウンロード実行</label>
        
        <button id="btn-download-all" class="mf-btn mf-btn-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            全日次データを一括取得
        </button>

        <div style="margin-top: 18px; padding-top: 18px; border-top: 1px dashed #dfe6e9;">
            <div class="mf-control-group" style="margin-bottom: 10px; justify-content: space-between;">
                <span style="font-size:13px; font-weight:bold; color:#636e72;">指定日のみ抽出:</span>
                <div style="display:flex; align-items:center; gap:5px;">
                    <span style="font-size:12px;">毎月</span>
                    <input type="number" id="mf-day-input" value="25" min="1" max="31" class="mf-input mf-input-short">
                    <span style="font-size:12px;">日</span>
                </div>
            </div>
            <button id="btn-download-specific-day" class="mf-btn mf-btn-secondary">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                    <circle cx="12" cy="15" r="2" fill="currentColor" stroke="none"/>
                </svg>
                指定日のみ抽出して保存
            </button>
        </div>
      </div>
      
      <div class="mf-status-container">
        <div class="mf-status-text" id="mf-status-text">
            <span>待機中...</span>
            <span id="mf-percent">0%</span>
        </div>
        <div class="mf-progress-bg">
            <div class="mf-progress-fill" id="mf-progress-fill"></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  document.getElementById('mf-extension-close').addEventListener('click', () => {
    panel.style.display = 'none';
  });

  document.getElementById('btn-download-all').addEventListener('click', () => handleDownload(false));
  document.getElementById('btn-download-specific-day').addEventListener('click', () => handleDownload(true));
}

function updateStatus(text, progress = 0) {
  const statusEl = document.getElementById('mf-status-text').firstElementChild;
  const percentEl = document.getElementById('mf-percent');
  const barEl = document.getElementById('mf-progress-fill');
  
  if (statusEl) statusEl.textContent = text;
  if (percentEl) percentEl.textContent = `${progress}%`;
  if (barEl) barEl.style.width = `${progress}%`;
}

// ==========================================
// メイン処理: CSVエンドポイントから全量取得 -> 必要に応じてフィルタ
// ==========================================
async function handleDownload(filterByDay = false) {
  if (isProcessing) return;
  
  let targetDay = null;
  if (filterByDay) {
      const dayInput = document.getElementById('mf-day-input');
      targetDay = parseInt(dayInput.value, 10);
      if (isNaN(targetDay) || targetDay < 1 || targetDay > 31) {
          alert('1〜31の日付を入力してください');
          return;
      }
  }

  isProcessing = true;
  updateStatus('初期化中...', 5);

  try {
    const yearSelect = document.getElementById('mf-year-select');
    const maxYears = yearSelect.value === 'all' ? 20 : parseInt(yearSelect.value, 10);
    const totalMonths = maxYears * 12;
    
    const now = new Date();
    // CSVエンドポイントは月末指定でその月の日次データが取れると仮定
    // 今月の末日からスタート
    let targetDate = new Date(now.getFullYear(), now.getMonth() + 1, 0); 
    
    // 全リクエストURLを生成
    const tasks = [];
    for (let i = 0; i < totalMonths; i++) {
        tasks.push({
            dateStr: formatDate(targetDate),
            url: `https://moneyforward.com/bs/history/list/${formatDate(targetDate)}/monthly/csv`
        });
        targetDate = getPrevMonthEnd(targetDate);
    }

    let allCsvRows = [];
    let headers = [];
    
    // バッチ処理 (50並列)
    const BATCH_SIZE = 50; 
    for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
        const batch = tasks.slice(i, i + BATCH_SIZE);
        const progress = Math.round(((i + 1) / tasks.length) * 100);
        updateStatus(filterByDay 
            ? `データ検索中...` 
            : `並列取得中...`, progress);

        // 並列実行
        const promises = batch.map(async (task) => {
            try {
                const res = await fetch(task.url);
                if (!res.ok) return null;
                const blob = await res.blob();
                const text = await readBlobAsText(blob, 'Shift_JIS');
                const rows = parseCSV(text);
                if (rows.length > 1) return rows; // ヘッダー+データがある場合
                return null;
            } catch (e) {
                return null;
            }
        });

        const results = await Promise.all(promises);
        
        results.forEach(rows => {
            if (rows) {
                // ヘッダー保存
                if (headers.length === 0) headers = rows[0];
                
                // データ行追加
                // 行の1列目が日付と想定 (YYYY/MM/DD)
                const dataRows = rows.slice(1);
                
                if (filterByDay) {
                    // 特定日のみ抽出
                    dataRows.forEach(row => {
                        const dateVal = row[0]; // "2025/11/25"
                        if (dateVal) {
                            const d = new Date(dateVal);
                            if (!isNaN(d.getTime()) && d.getDate() === targetDay) {
                                allCsvRows.push(row);
                            }
                        }
                    });
                } else {
                    // 全量追加
                    allCsvRows.push(...dataRows);
                }
            }
        });

        await new Promise(r => setTimeout(r, 500));
    }

    if (allCsvRows.length === 0) {
        updateStatus('データが見つかりませんでした', 0);
        return;
    }

    updateStatus('CSV生成中...', 100);
    
    // 日付順ソート (降順)
    allCsvRows.sort((a, b) => new Date(b[0]) - new Date(a[0]));
    
    // 重複排除
    const uniqueRows = unique(allCsvRows);
    const finalCsv = generateCSV([headers, ...uniqueRows]);
    
    const fileName = filterByDay 
        ? `moneyforward_daily_${targetDay}_${formatDate(new Date())}.csv`
        : `moneyforward_assets_history_full_${formatDate(new Date())}.csv`;

    downloadCSV(finalCsv, fileName);
    updateStatus(`完了 (${uniqueRows.length}件)`, 100);

  } catch (err) {
    console.error(err);
    updateStatus(`エラー: ${err.message}`, 0);
  } finally {
    isProcessing = false;
  }
}

// --- ヘルパー関数 ---
function formatDate(date) {
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
function generateCSV(rows) {
  return rows.map(row => row.map(f => `"${String(f).replace(/"/g, '""')}"`).join(',')).join('\n');
}
function downloadCSV(csv, filename) {
  const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
  const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

createPanel();

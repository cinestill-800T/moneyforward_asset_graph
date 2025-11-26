// グローバル変数
let isProcessing = false;
let globalChart = null; // Chart.js インスタンス保持用
let lastFetchedData = null; // 最後に取得したデータを保持

// ロード確認用ログ
console.log('%c MoneyForward Asset Downloader v1.2 Loaded ', 'background: #2563eb; color: white; font-weight: bold;');

function createPanel() {
  const existing = document.getElementById('mf-extension-panel');
  if (existing) existing.remove();

  const panel = document.createElement('div');
  panel.id = 'mf-extension-panel';
  
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
        <label class="mf-label">CSVダウンロード</label>
        <div class="mf-control-group" style="margin-bottom:10px;">
            <select id="mf-year-select" class="mf-select">
            <option value="1">過去 1年分</option>
            <option value="3">過去 3年分</option>
            <option value="5">過去 5年分</option>
            <option value="10" selected>過去 10年分</option>
            <option value="all">全ての期間</option>
            </select>
        </div>
        
        <button id="btn-download-all" class="mf-btn mf-btn-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            全日次データをCSV保存
        </button>
      </div>

      <div class="mf-section">
        <label class="mf-label">グラフ・分析</label>
        <button id="btn-show-graph" class="mf-btn mf-btn-accent">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M3 3v18h18" />
                <path d="M18 17l-6-10-6 10" />
                <path d="M12 17V7" />
            </svg>
            グラフを表示・生成
        </button>
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
  // 特定日CSVボタンは削除し、グラフ機能に統合するか、またはシンプルにするために今回は削除（要望によりグラフ重視）
  // もし必要なら復活させるが、グラフモーダルからCSVエクスポートも可能にする
  document.getElementById('btn-show-graph').addEventListener('click', showGraphModal);
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
// データ取得ロジック (共通)
// ==========================================
// UI進捗バー更新用コールバックを受け取る
async function fetchData(years, onProgress) {
  if (isProcessing) return null;
  isProcessing = true;

  try {
    const maxYears = years === 'all' ? 20 : parseInt(years, 10);
    const totalMonths = maxYears * 12;
    
    const now = new Date();
    let targetDate = new Date(now.getFullYear(), now.getMonth() + 1, 0); 
    
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
    
    const BATCH_SIZE = 50; 
    for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
        const batch = tasks.slice(i, i + BATCH_SIZE);
        const progress = Math.round(((i + 1) / tasks.length) * 100);
        if(onProgress) onProgress(progress);

        const promises = batch.map(async (task) => {
            try {
                const res = await fetch(task.url);
                if (!res.ok) return null;
                const blob = await res.blob();
                const text = await readBlobAsText(blob, 'Shift_JIS');
                const rows = parseCSV(text);
                if (rows.length > 1) return rows; 
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

        await new Promise(r => setTimeout(r, 500));
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

// パネルからのダウンロード実行
async function handleDownload() {
    const yearSelect = document.getElementById('mf-year-select');
    updateStatus('データ取得中...', 5);
    
    const data = await fetchData(yearSelect.value, (progress) => {
        updateStatus('取得中...', progress);
    });

    if(!data) {
        updateStatus('データなし', 0);
        return;
    }

    updateStatus('CSV生成中...', 100);
    const finalCsv = generateCSV([data.headers, ...data.rows]);
    downloadCSV(finalCsv, `moneyforward_assets_full_${formatDate(new Date())}.csv`);
    updateStatus(`完了 (${data.rows.length}件)`, 100);
    
    // キャッシュ更新
    lastFetchedData = data;
}


// ==========================================
// グラフモーダル & 内部ロジック
// ==========================================
function showGraphModal() {
    // 既存モーダル削除
    const existingModal = document.querySelector('.mf-modal-overlay');
    if (existingModal) existingModal.remove();

    // モーダルHTML
    const modal = document.createElement('div');
    modal.className = 'mf-modal-overlay';
    modal.innerHTML = `
        <div class="mf-modal-content">
            <div class="mf-modal-header">
                <div class="mf-modal-title">資産推移グラフ設定</div>
                <div style="display:flex; gap:15px; align-items:center;">
                    <!-- 条件設定エリア -->
                    <div style="display:flex; align-items:center; gap:5px;">
                        <span style="font-size:12px; font-weight:bold; color:#636e72;">期間:</span>
                        <select id="mf-modal-range" class="mf-select" style="height:36px !important; line-height:36px !important; padding:0 10px !important; width:auto !important;">
                            <option value="1">過去1年</option>
                            <option value="3">過去3年</option>
                            <option value="5">過去5年</option>
                            <option value="10" selected>過去10年</option>
                            <option value="all">全期間</option>
                        </select>
                    </div>
                    
                    <div style="display:flex; align-items:center; gap:5px; background:#f3f4f6; padding:4px 10px; border-radius:6px;">
                        <input type="checkbox" id="mf-modal-filter-check" checked>
                        <label for="mf-modal-filter-check" style="font-size:12px; font-weight:bold; color:#2d3436; cursor:pointer; margin:0;">指定日のみ:</label>
                        <span style="font-size:12px;">毎月</span>
                        <input type="number" id="mf-modal-day" value="25" min="1" max="31" style="width:40px; padding:4px; border:1px solid #ccc; border-radius:4px; text-align:center;">
                        <span style="font-size:12px;">日</span>
                    </div>

                    <button class="mf-modal-btn mf-btn-primary" id="mf-modal-fetch" style="padding: 6px 12px !important; font-size:12px !important; margin-top:0 !important;">
                        再取得・描画
                    </button>
                    
                    <button class="mf-modal-btn mf-modal-btn-close" id="mf-modal-close" style="margin-left:10px;">×</button>
                </div>
            </div>
            <div class="mf-modal-body">
                <div id="mf-modal-loading" style="position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(255,255,255,0.8); z-index:10; display:none; justify-content:center; align-items:center; flex-direction:column;">
                    <div style="font-weight:bold; color:#2563eb; margin-bottom:10px;">データ取得中...</div>
                    <div style="width:200px; height:4px; background:#ddd; border-radius:2px;"><div id="mf-modal-progress" style="width:0%; height:100%; background:#2563eb;"></div></div>
                </div>
                <canvas id="mf-chart"></canvas>
                <div id="mf-no-data-msg" style="display:none; position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); text-align:center; color:#888;">
                    <p>データがありません。<br>右上の「再取得・描画」ボタンを押してください。</p>
                </div>
            </div>
            <div class="mf-modal-footer">
                <div style="margin-right:auto; display:flex; align-items:center; gap:5px;">
                    <input type="checkbox" id="mf-chart-stack-check">
                    <label for="mf-chart-stack-check" style="font-size:12px; cursor:pointer;">内訳を積み上げ表示する</label>
                </div>
                <button class="mf-modal-btn mf-modal-btn-close" id="mf-copy-data">
                   📄 CSVコピー
                </button>
                <button class="mf-modal-btn mf-modal-btn-copy" id="mf-copy-image">
                   📷 画像コピー
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // イベント設定
    document.getElementById('mf-modal-close').addEventListener('click', () => { modal.remove(); globalChart = null; });
    
    const fetchBtn = document.getElementById('mf-modal-fetch');
    fetchBtn.addEventListener('click', async () => {
        const years = document.getElementById('mf-modal-range').value;
        const loading = document.getElementById('mf-modal-loading');
        const progress = document.getElementById('mf-modal-progress');
        
        loading.style.display = 'flex';
        fetchBtn.disabled = true;
        
        const data = await fetchData(years, (pct) => {
            progress.style.width = `${pct}%`;
        });
        
        loading.style.display = 'none';
        fetchBtn.disabled = false;
        
        if (data) {
            lastFetchedData = data;
            updateGraph();
        } else {
            alert('データ取得に失敗しました');
        }
    });

    // フィルタ変更時即時反映（データがあれば）
    document.getElementById('mf-modal-filter-check').addEventListener('change', updateGraph);
    document.getElementById('mf-modal-day').addEventListener('change', updateGraph);
    document.getElementById('mf-chart-stack-check').addEventListener('change', updateGraph);

    // データコピー
    document.getElementById('mf-copy-data').addEventListener('click', () => {
        if(!globalChart || !globalChart.data.labels) return;
        // グラフに表示されているデータをコピーしたいが、簡易的に lastFetchedData をコピー
        alert('全データをクリップボードにコピーします(Excel用)');
        copyGraphData();
    });
    document.getElementById('mf-copy-image').addEventListener('click', copyGraphImage);

    // 初期表示
    if (lastFetchedData) {
        updateGraph();
    } else {
        document.getElementById('mf-no-data-msg').style.display = 'block';
        // 自動で初回取得しても良いが、ユーザー操作に委ねる
    }
}

function updateGraph() {
    if (!lastFetchedData) return;
    document.getElementById('mf-no-data-msg').style.display = 'none';

    const filterCheck = document.getElementById('mf-modal-filter-check').checked;
    const targetDay = parseInt(document.getElementById('mf-modal-day').value, 10);
    const isStacked = document.getElementById('mf-chart-stack-check').checked;

    // フィルタリング
    // lastFetchedData.rows は「新しい順」
    let rows = [...lastFetchedData.rows];
    
    if (filterCheck && !isNaN(targetDay)) {
        rows = rows.filter(r => {
            const d = new Date(r[0]);
            return !isNaN(d.getTime()) && d.getDate() === targetDay;
        });
    }

    if (rows.length === 0) {
        alert('指定条件に一致するデータがありません');
        return;
    }

    // グラフ用に古い順にソート
    rows.reverse();

    const headers = lastFetchedData.headers;
    const labels = rows.map(r => r[0]);
    
    // データセット作成
    const datasets = [];
    
    if (isStacked) {
        // 積み上げグラフ（内訳表示）
        const colors = ['#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];
        for(let i = 2; i < headers.length; i++) {
            if(headers[i] === '詳細') continue;
            datasets.push({
                label: headers[i],
                data: rows.map(r => parseInt(r[i] || 0, 10)),
                backgroundColor: hexToRgba(colors[(i-2) % colors.length], 0.6),
                borderColor: colors[(i-2) % colors.length],
                borderWidth: 1,
                fill: true,
                pointRadius: rows.length > 50 ? 0 : 3
            });
        }
    } else {
        // 合計のみ（折れ線）
        // headers[1] が「合計」と想定
        datasets.push({
            label: '資産合計',
            data: rows.map(r => parseInt(r[1] || 0, 10)),
            backgroundColor: 'rgba(37, 99, 235, 0.1)',
            borderColor: '#2563eb', // 青
            borderWidth: 3,
            fill: true,
            pointRadius: rows.length > 50 ? 0 : 4,
            pointHoverRadius: 6
        });
    }

    drawChartCanvas(labels, datasets, isStacked);
}

function drawChartCanvas(labels, datasets, isStacked) {
    if (globalChart) globalChart.destroy();
    const ctx = document.getElementById('mf-chart').getContext('2d');

    globalChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            stacked: isStacked, // 積み上げ設定
            plugins: {
                title: { display: true, text: isStacked ? '資産推移（内訳）' : '資産推移（合計）', font: { size: 16 } },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                },
                legend: { position: 'bottom' }
            },
            scales: {
                x: { grid: { display: false } },
                y: {
                    stacked: isStacked,
                    ticks: {
                        callback: function(value) {
                            if (value >= 100000000) return (value / 100000000).toFixed(1) + '億円';
                            if (value >= 10000) return (value / 10000).toFixed(0) + '万円';
                            return '¥' + value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
}

// --- ヘルパー関数 (変更なし) ---
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
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
function copyGraphImage() {
    const canvas = document.getElementById('mf-chart');
    canvas.toBlob(blob => {
        const item = new ClipboardItem({ 'image/png': blob });
        navigator.clipboard.write([item]).then(() => alert('画像をコピーしました')).catch(e=>alert('失敗しました'));
    });
}
function copyGraphData() {
    if (!lastFetchedData) return;
    const headers = lastFetchedData.headers.join('\t');
    const body = lastFetchedData.rows.map(row => row.join('\t')).join('\n');
    navigator.clipboard.writeText(`${headers}\n${body}`).then(()=>alert('データをコピーしました')).catch(e=>alert('失敗しました'));
}

createPanel();

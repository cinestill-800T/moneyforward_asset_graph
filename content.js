// グローバル変数
const EXTENSION_VERSION = '1.3.5';
let isProcessing = false;
let globalChart = null; // Chart.js インスタンス保持用
let lastFetchedData = null; // 最後に取得したデータを保持

// カラープリセット定義
const COLOR_PRESETS = [
    { name: "爽やかブルー (標準)", colors: ['#80A1BA', '#91C4C3', '#B4DEBD', '#FFF7DD'] },
    { name: "シックダーク", colors: ['#313647', '#435663', '#A3B087', '#FFF8D4'] },
    { name: "フォレストグリーン", colors: ['#2C5F2D', '#97BC62', '#D4E09B', '#F1F7ED'] },
    { name: "サンセットオレンジ", colors: ['#FF6F61', '#FF9A8B', '#FFC3A0', '#F6E4C6'] },
    { name: "ラベンダー・ドリーム", colors: ['#6A5ACD', '#9370DB', '#E6E6FA', '#F8F8FF'] },
    { name: "桜色 (チェリーブロッサム)", colors: ['#FFB7B2', '#FFDAC1', '#E2F0CB', '#FFFFD8'] },
    { name: "オーシャンブリーズ", colors: ['#006994', '#00A8E8', '#74D0F1', '#E0FFFF'] },
    { name: "ミッドナイト・パープル", colors: ['#301934', '#5D3F6A', '#8B6F9A', '#DCD0FF'] },
    { name: "アースブラウン", colors: ['#5D4037', '#8D6E63', '#D7CCC8', '#EFEBE9'] },
    { name: "クールグレー", colors: ['#37474F', '#607D8B', '#CFD8DC', '#ECEFF1'] },
    { name: "ウォームベージュ", colors: ['#8D6E63', '#A1887F', '#D7CCC8', '#F5F5F5'] },
    { name: "ミントフレッシュ", colors: ['#009688', '#4DB6AC', '#B2DFDB', '#E0F2F1'] },
    { name: "ベリー・スムージー", colors: ['#880E4F', '#C2185B', '#F48FB1', '#FCE4EC'] },
    { name: "ソーラーフレア", colors: ['#E65100', '#FF9800', '#FFCC80', '#FFF3E0'] },
    { name: "ノルディック・ウィンター", colors: ['#455A64', '#78909C', '#B0BEC5', '#FFFFFF'] },
    { name: "ロイヤルゴールド", colors: ['#B8860B', '#DAA520', '#EEE8AA', '#FFFFF0'] },
    { name: "ティール＆コーラル", colors: ['#008080', '#FF7F50', '#FFA07A', '#E0FFFF'] },
    { name: "モノクローム", colors: ['#212121', '#757575', '#BDBDBD', '#F5F5F5'] },
    { name: "ネオンサイバー", colors: ['#3F51B5', '#FF4081', '#00E676', '#121212'] },
    { name: "レトロポップ", colors: ['#D32F2F', '#FBC02D', '#388E3C', '#FFF9C4'] }
];

const DEFAULT_THEME = {
    color1: COLOR_PRESETS[0].colors[0],
    color2: COLOR_PRESETS[0].colors[1],
    color3: COLOR_PRESETS[0].colors[2],
    color4: COLOR_PRESETS[0].colors[3]
};

// 現在のテーマ設定
let currentTheme = { ...DEFAULT_THEME };

// 設定ロード & 適用
loadTheme();

// ロード確認用ログ
console.log(`%c MoneyForward Asset Downloader v${EXTENSION_VERSION} Loaded `, `background: linear-gradient(135deg, ${currentTheme.color1}, ${currentTheme.color2}); color: #fff; font-weight: bold; padding: 4px;`);

// タブタイトルにバージョンを表示
const titleSuffix = ` [Ext v${EXTENSION_VERSION}]`;
if (!document.title.includes('[Ext v')) {
    document.title = `${document.title}${titleSuffix}`;
} else {
    document.title = document.title.replace(/\[Ext v.*?\]/, titleSuffix);
}

// ページ判定と初期化
initPage();

function initPage() {
    const path = window.location.pathname;

    if (path.startsWith('/bs/history')) {
        // 資産推移画面
        createPanel();
    } else if (path.startsWith('/cf') || path === '/') {
        // 家計簿画面
        initHouseholdBookEnhancement();
    }
}


// --- テーマ管理 ---
function loadTheme() {
    const saved = localStorage.getItem('mf_ext_theme');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            currentTheme = { ...DEFAULT_THEME, ...parsed };
        } catch (e) { console.error('Theme load error', e); }
    }
    applyTheme(currentTheme);
}

function saveTheme(theme) {
    currentTheme = theme;
    localStorage.setItem('mf_ext_theme', JSON.stringify(theme));
    applyTheme(theme);
}

function applyTheme(theme) {
    const r = document.documentElement;
    r.style.setProperty('--mf-color-1', theme.color1);
    r.style.setProperty('--mf-color-2', theme.color2);
    r.style.setProperty('--mf-color-3', theme.color3);
    r.style.setProperty('--mf-color-4', theme.color4);
}

// --- キャッシュ管理ヘルパー ---
function getCacheKey(dateStr) {
    return `mf_cache_${dateStr}`;
}

function isCacheable(dateStr) {
    const target = new Date(dateStr);
    const now = new Date();
    // 現在の年月より前であればキャッシュ可能（過去データは変動しない前提）
    return (target.getFullYear() < now.getFullYear()) ||
        (target.getFullYear() === now.getFullYear() && target.getMonth() < now.getMonth());
}

function getCacheSize() {
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

function clearCache() {
    const keysToRemove = [];
    for (let key in localStorage) {
        if (key.startsWith('mf_cache_')) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    return keysToRemove.length;
}


function createPanel() {
    const existing = document.getElementById('mf-extension-panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'mf-extension-panel';

    const iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 21H21" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
    <path d="M6 17L11 12L15 16L21 8" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M6 17V13" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
    <path d="M11 12V17" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
    <path d="M15 16V17" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
    <path d="M21 8V17" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
  </svg>`;

    panel.innerHTML = `
    <div id="mf-extension-header">
      <div class="mf-title">
        <span class="mf-icon-wrapper">${iconSvg}</span>
        <span>資産データ一括ダウンローダー <span style="font-size:10px; opacity:0.8; margin-left:5px;">v${EXTENSION_VERSION}</span></span>
      </div>
      <div class="mf-header-actions">
          <div class="mf-header-btn" id="mf-btn-settings" title="設定">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </div>
          <div class="mf-header-btn" id="mf-extension-toggle" title="折りたたむ">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </div>
      </div>
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

        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed #dfe6e9;">
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
                指定日のみ抽出してCSV保存
            </button>
        </div>
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

    const toggleBtn = document.getElementById('mf-extension-toggle');
    toggleBtn.addEventListener('click', () => {
        panel.classList.toggle('mf-minimized');
        const isMinimized = panel.classList.contains('mf-minimized');

        if (isMinimized) {
            toggleBtn.title = "展開する";
            toggleBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
        } else {
            toggleBtn.title = "折りたたむ";
            toggleBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
        }
    });

    document.getElementById('btn-download-all').addEventListener('click', () => handleDownload(false));
    document.getElementById('btn-download-specific-day').addEventListener('click', () => handleDownload(true));
    document.getElementById('btn-show-graph').addEventListener('click', showGraphModal);
    document.getElementById('mf-btn-settings').addEventListener('click', showSettingsModal);
}

function updateStatus(text, progress = 0) {
    const statusEl = document.getElementById('mf-status-text').firstElementChild;
    const percentEl = document.getElementById('mf-percent');
    const barEl = document.getElementById('mf-progress-fill');

    if (statusEl) statusEl.textContent = text;
    if (percentEl) percentEl.textContent = `${progress}%`;
    if (barEl) barEl.style.width = `${progress}%`;
}

// --- 設定モーダル ---
function showSettingsModal() {
    const existing = document.getElementById('mf-settings-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'mf-settings-modal';
    modal.className = 'mf-modal-overlay';

    // プリセット選択肢のHTML生成
    const presetOptions = COLOR_PRESETS.map((preset, index) =>
        `<option value="${index}">${preset.name}</option>`
    ).join('');

    // キャッシュ情報の取得
    const cacheInfo = getCacheSize();

    modal.innerHTML = `
        <div class="mf-modal-content mf-settings-content" style="max-width:400px; height:auto;">
            <div class="mf-modal-header">
                <div class="mf-modal-title">設定</div>
                <button class="mf-modal-btn mf-modal-btn-close" id="mf-settings-close">×</button>
            </div>
            <div class="mf-modal-body">
                <div style="margin-bottom:20px;">
                    <label class="mf-label">テーマカラー</label>
                    <div style="margin-bottom:15px;">
                        <div style="font-size:12px; margin-bottom:5px; color:#636e72;">おすすめプリセット (20種)</div>
                        <select id="mf-preset-select" class="mf-select" style="height:40px; line-height:40px;">
                            <option value="" disabled selected>選択してください...</option>
                            ${presetOptions}
                        </select>
                    </div>

                    <div style="margin-bottom:15px; padding-bottom:15px; border-bottom:1px dashed #dfe6e9;">
                        <div style="font-size:12px; margin-bottom:5px; color:#636e72;">カラーコード一括貼り付け (4行)</div>
                        <textarea id="mf-color-paste" class="mf-input" style="height:60px; min-height:60px; padding:8px; font-family:monospace; font-size:12px; resize:vertical;" placeholder="#80A1BA&#10;#91C4C3&#10;#B4DEBD&#10;#FFF7DD"></textarea>
                    </div>
                    
                    <div class="mf-color-picker-row">
                        <span class="mf-color-picker-label">Color 1 (メイン)</span>
                        <input type="color" class="mf-color-input" id="mf-color-1" value="${currentTheme.color1}">
                    </div>
                    <div class="mf-color-picker-row">
                        <span class="mf-color-picker-label">Color 2 (サブ)</span>
                        <input type="color" class="mf-color-input" id="mf-color-2" value="${currentTheme.color2}">
                    </div>
                    <div class="mf-color-picker-row">
                        <span class="mf-color-picker-label">Color 3 (アクセント)</span>
                        <input type="color" class="mf-color-input" id="mf-color-3" value="${currentTheme.color3}">
                    </div>
                    <div class="mf-color-picker-row">
                        <span class="mf-color-picker-label">Color 4 (背景等)</span>
                        <input type="color" class="mf-color-input" id="mf-color-4" value="${currentTheme.color4}">
                    </div>
                </div>

                <div style="margin-top:20px; padding-top:20px; border-top:2px solid #f3f4f6;">
                    <label class="mf-label">データキャッシュ</label>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <div style="font-size:12px; color:#636e72;">
                            過去のデータをブラウザに保存し、<br>次回の読み込みを高速化します。
                        </div>
                        <div style="text-align:right; font-size:12px; font-weight:bold;">
                            <span id="mf-cache-count">${cacheInfo.count}</span>ファイル<br>
                            <span id="mf-cache-size">${cacheInfo.size}</span> KB
                        </div>
                    </div>
                    <button id="mf-clear-cache" class="mf-btn mf-btn-secondary" style="height:40px; font-size:12px; border-color:#e74c3c; color:#e74c3c;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:5px;">
                            <path d="M3 6h18"></path>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        キャッシュをすべて削除
                    </button>
                </div>
            </div>
            <div class="mf-modal-footer">
                <button class="mf-modal-btn mf-btn-primary" id="mf-settings-save">保存して適用</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // イベント設定
    const closeModal = () => modal.remove();
    document.getElementById('mf-settings-close').addEventListener('click', closeModal);

    // プリセット選択時の動作
    document.getElementById('mf-preset-select').addEventListener('change', (e) => {
        const index = parseInt(e.target.value, 10);
        if (!isNaN(index) && COLOR_PRESETS[index]) {
            const preset = COLOR_PRESETS[index];
            const theme = {
                color1: preset.colors[0],
                color2: preset.colors[1],
                color3: preset.colors[2],
                color4: preset.colors[3]
            };
            setPickerValues(theme);
        }
    });

    // 一括貼り付けロジック
    document.getElementById('mf-color-paste').addEventListener('input', (e) => {
        const text = e.target.value;
        // 空白除去し、#******形式の行を抽出
        const colors = text.split(/[\r\n]+/)
            .map(l => l.trim())
            .filter(l => /^#[0-9A-Fa-f]{6}$/.test(l));

        if (colors.length >= 4) {
            document.getElementById('mf-color-1').value = colors[0];
            document.getElementById('mf-color-2').value = colors[1];
            document.getElementById('mf-color-3').value = colors[2];
            document.getElementById('mf-color-4').value = colors[3];
        }
    });

    // キャッシュ削除
    document.getElementById('mf-clear-cache').addEventListener('click', () => {
        if (confirm('保存されたキャッシュデータをすべて削除しますか？\n次回取得時は再度通信が発生します。')) {
            const count = clearCache();
            alert(`${count}件のキャッシュを削除しました。`);
            // 表示更新
            document.getElementById('mf-cache-count').textContent = '0';
            document.getElementById('mf-cache-size').textContent = '0.0';
        }
    });

    function setPickerValues(theme) {
        document.getElementById('mf-color-1').value = theme.color1;
        document.getElementById('mf-color-2').value = theme.color2;
        document.getElementById('mf-color-3').value = theme.color3;
        document.getElementById('mf-color-4').value = theme.color4;
    }

    // 保存
    document.getElementById('mf-settings-save').addEventListener('click', () => {
        const newTheme = {
            color1: document.getElementById('mf-color-1').value,
            color2: document.getElementById('mf-color-2').value,
            color3: document.getElementById('mf-color-3').value,
            color4: document.getElementById('mf-color-4').value
        };
        saveTheme(newTheme);
        closeModal();

        // グラフが表示中なら再描画
        if (globalChart && document.querySelector('.mf-modal-overlay:not(#mf-settings-modal)')) {
            updateGraph(); // グラフ再描画で色を反映
        }
    });
}

// ==========================================
// データ取得ロジック (共通)
// ==========================================
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

        const BATCH_SIZE = 50;
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

            // 負荷軽減のため、少し待機（キャッシュヒット時は高速になるが、念のため）
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

// パネルからのダウンロード実行
async function handleDownload(filterByDay = false) {
    let targetDay = null;
    if (filterByDay) {
        const dayInput = document.getElementById('mf-day-input');
        targetDay = parseInt(dayInput.value, 10);
        if (isNaN(targetDay) || targetDay < 1 || targetDay > 31) {
            alert('1〜31の日付を入力してください');
            return;
        }
    }

    const yearSelect = document.getElementById('mf-year-select');
    updateStatus('データ取得中...', 5);

    const data = await fetchData(yearSelect.value, (progress) => {
        updateStatus('取得中...', progress);
    });

    if (!data) {
        updateStatus('データなし', 0);
        return;
    }

    let rows = data.rows;
    if (filterByDay) {
        rows = rows.filter(r => {
            const d = new Date(r[0]);
            return !isNaN(d.getTime()) && d.getDate() === targetDay;
        });
    }

    if (rows.length === 0) {
        updateStatus('対象データなし', 0);
        alert('指定した日付のデータが見つかりませんでした');
        return;
    }

    updateStatus('CSV生成中...', 100);
    const finalCsv = generateCSV([data.headers, ...rows]);

    const fileName = filterByDay
        ? `moneyforward_daily_${targetDay}_${formatDate(new Date())}.csv`
        : `moneyforward_assets_history_full_${formatDate(new Date())}.csv`;

    downloadCSV(finalCsv, fileName);
    updateStatus(`完了 (${rows.length}件)`, 100);

    // キャッシュ更新
    lastFetchedData = data;
}


// ==========================================
// グラフモーダル & 内部ロジック
// ==========================================
function showGraphModal() {
    const existingModal = document.querySelector('.mf-modal-overlay');
    // 設定モーダルが開いている場合は閉じない
    if (existingModal && existingModal.id !== 'mf-settings-modal') existingModal.remove();

    const modal = document.createElement('div');
    modal.className = 'mf-modal-overlay';
    modal.innerHTML = `
        <div class="mf-modal-content">
            <div class="mf-modal-header">
                <div class="mf-modal-title" style="margin-right: 20px; white-space: nowrap;">資産推移グラフ設定 <span style="font-size:12px; font-weight:normal; opacity:0.7;">v${EXTENSION_VERSION}</span></div>
                <div style="display:flex; gap:15px; align-items:center; flex-wrap: wrap;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:12px; font-weight:bold; color:#636e72; white-space: nowrap;">期間:</span>
                        <select id="mf-modal-range" class="mf-select" style="height:36px !important; line-height:36px !important; padding:0 25px 0 10px !important; width:auto !important; min-width: 100px;">
                            <option value="1">過去1年</option>
                            <option value="3">過去3年</option>
                            <option value="5">過去5年</option>
                            <option value="10" selected>過去10年</option>
                            <option value="all">全期間</option>
                        </select>
                    </div>
                    
                    <div style="display:flex; align-items:center; gap:5px; background:#f3f4f6; padding:4px 10px; border-radius:6px; white-space: nowrap;">
                        <input type="checkbox" id="mf-modal-filter-check" checked>
                        <label for="mf-modal-filter-check" style="font-size:12px; font-weight:bold; color:#2d3436; cursor:pointer; margin:0;">指定日のみ:</label>
                        <span style="font-size:12px;">毎月</span>
                        <input type="number" id="mf-modal-day" value="25" min="1" max="31" style="width:40px; padding:4px; border:1px solid #ccc; border-radius:4px; text-align:center;">
                        <span style="font-size:12px;">日</span>
                    </div>

                    <button class="mf-modal-btn mf-modal-btn-primary" id="mf-modal-fetch" style="padding: 6px 12px !important; font-size:12px !important; margin-top:0 !important; white-space: nowrap;">
                        再取得・描画
                    </button>
                    
                    <button class="mf-modal-btn mf-modal-btn-close" id="mf-modal-close" style="margin-left:auto;">×</button>
                </div>
            </div>
            <div class="mf-modal-body">
                <div id="mf-modal-loading" style="position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(255,255,255,0.8); z-index:10; display:none; justify-content:center; align-items:center; flex-direction:column;">
                    <div style="font-weight:bold; color:#313647; margin-bottom:10px;">データ取得中...</div>
                    <div style="width:200px; height:4px; background:#ddd; border-radius:2px;"><div id="mf-modal-progress" style="width:0%; height:100%; background:#A3B087;"></div></div>
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
                <button class="mf-modal-btn mf-modal-btn-close" id="mf-download-csv">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                   CSV保存
                </button>
                <button class="mf-modal-btn mf-modal-btn-close" id="mf-copy-data">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                   CSVコピー
                </button>
                <button class="mf-modal-btn mf-modal-btn-copy" id="mf-copy-image">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                        <circle cx="12" cy="13" r="4"></circle>
                    </svg>
                   画像コピー
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

    document.getElementById('mf-modal-filter-check').addEventListener('change', updateGraph);
    document.getElementById('mf-modal-day').addEventListener('change', updateGraph);
    document.getElementById('mf-chart-stack-check').addEventListener('change', updateGraph);

    document.getElementById('mf-copy-data').addEventListener('click', copyGraphData);
    document.getElementById('mf-copy-image').addEventListener('click', copyGraphImage);

    document.getElementById('mf-download-csv').addEventListener('click', () => {
        if (!globalChart || !lastFetchedData) return;
        const filteredRows = getFilteredRows();
        if (!filteredRows || filteredRows.length === 0) { alert('データがありません'); return; }
        const csvRows = [...filteredRows].reverse();
        const finalCsv = generateCSV([lastFetchedData.headers, ...csvRows]);
        downloadCSV(finalCsv, `moneyforward_graph_data_${formatDate(new Date())}.csv`);
    });

    if (lastFetchedData) {
        updateGraph();
    } else {
        document.getElementById('mf-no-data-msg').style.display = 'block';
    }
}

// フィルタリングロジックを共通化
function getFilteredRows() {
    if (!lastFetchedData) return [];
    const filterCheck = document.getElementById('mf-modal-filter-check').checked;
    const targetDay = parseInt(document.getElementById('mf-modal-day').value, 10);

    let rows = [...lastFetchedData.rows];

    if (filterCheck && !isNaN(targetDay)) {
        rows = rows.filter(r => {
            const d = new Date(r[0]);
            return !isNaN(d.getTime()) && d.getDate() === targetDay;
        });
    }

    return rows.reverse();
}

function updateGraph() {
    if (!lastFetchedData) return;
    document.getElementById('mf-no-data-msg').style.display = 'none';

    const rows = getFilteredRows();

    if (rows.length === 0) {
        if (globalChart) globalChart.destroy();
        alert('指定条件に一致するデータがありません');
        return;
    }

    const headers = lastFetchedData.headers;
    const labels = rows.map(r => r[0]);
    const isStacked = document.getElementById('mf-chart-stack-check').checked;

    drawChartCanvas(labels, headers, rows, isStacked);
}

// ヘルパー
function hexToRgbObj(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
}

function drawChartCanvas(labels, headers, rows, isStacked) {
    if (globalChart) globalChart.destroy();
    const ctx = document.getElementById('mf-chart').getContext('2d');

    const datasets = [];
    // 現在のテーマカラーを使用
    const themeColors = [
        currentTheme.color1,
        currentTheme.color2,
        currentTheme.color3,
        currentTheme.color4
    ];
    // バリエーション用追加色 (固定)
    const extraColors = ['#C2B280', '#8C705F', '#6A8D92', '#D4C5A3'];
    const palette = [...themeColors, ...extraColors];

    if (isStacked) {
        for (let i = 2; i < headers.length; i++) {
            if (headers[i] === '詳細') continue;

            const baseColor = palette[(i - 2) % palette.length];
            const rgb = hexToRgbObj(baseColor);
            const gradient = ctx.createLinearGradient(0, 0, 0, 400);
            gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.8)`);
            gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`);

            datasets.push({
                label: headers[i],
                data: rows.map(r => parseInt(r[i] || 0, 10)),
                backgroundColor: gradient,
                borderColor: baseColor,
                borderWidth: 1,
                fill: true,
                pointRadius: rows.length > 50 ? 0 : 3
            });
        }
    } else {
        const rgb = hexToRgbObj(currentTheme.color1);
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)`);
        gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.0)`);

        datasets.push({
            label: '資産合計',
            data: rows.map(r => parseInt(r[1] || 0, 10)),
            backgroundColor: gradient,
            borderColor: currentTheme.color1,
            borderWidth: 3,
            fill: true,
            pointRadius: rows.length > 50 ? 0 : 4,
            pointHoverRadius: 6
        });
    }

    globalChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            stacked: isStacked,
            plugins: {
                title: { display: true, text: isStacked ? '資産推移（内訳）' : '資産推移（合計）', font: { size: 16 }, color: currentTheme.color1 },
                tooltip: {
                    backgroundColor: currentTheme.color1,
                    titleColor: currentTheme.color4,
                    bodyColor: '#fff',
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                },
                legend: { position: 'bottom', labels: { color: '#636e72' } }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#636e72' } },
                y: {
                    stacked: isStacked,
                    grid: { color: '#dfe6e9' },
                    ticks: {
                        color: '#636e72',
                        callback: function (value) {
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
    if (!canvas) return;
    canvas.toBlob(blob => {
        const item = new ClipboardItem({ 'image/png': blob });
        navigator.clipboard.write([item]).then(() => alert('画像をコピーしました')).catch(e => alert('失敗しました'));
    });
}
function copyGraphData() {
    if (!lastFetchedData) return;
    const filteredRows = getFilteredRows().reverse();
    if (filteredRows.length === 0) { alert('データがありません'); return; }
    const headers = lastFetchedData.headers.join('\t');
    const body = filteredRows.map(row => row.join('\t')).join('\n');
    navigator.clipboard.writeText(`${headers}\n${body}`).then(() => alert('データをコピーしました')).catch(e => alert('失敗しました'));
}


// ===========================================================================
// 家計簿画面拡張 (v1.3.4) - Stale Element対策強化版
// ===========================================================================

function initHouseholdBookEnhancement() {
    console.log('MoneyForward Asset Downloader: Household Book Enhancement Started');
    
    // 監視開始 (非同期で読み込まれる行に対応)
    const observer = new MutationObserver(handleTableMutation);
    const table = document.getElementById('cf-detail-table');
    
    if (table) {
        // 初期ロード時の処理
        addCheckboxesToTable();
        createCategoryBulkPanel(); // テーブルがある場合のみパネル生成
        observer.observe(table, { childList: true, subtree: true });
    } else {
        // テーブルがまだない場合はbodyを監視してテーブル出現を待つ
        const bodyObserver = new MutationObserver(() => {
            const t = document.getElementById('cf-detail-table');
            if (t) {
                addCheckboxesToTable();
                createCategoryBulkPanel(); // 出現時にパネル生成
                observer.observe(t, { childList: true, subtree: true });
                bodyObserver.disconnect();
            }
        });
        bodyObserver.observe(document.body, { childList: true, subtree: true });
    }
    
    // createCategoryBulkPanel(); // ここでの無条件呼び出しを削除
}

function handleTableMutation(mutations) {
    let shouldUpdate = false;
    for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            shouldUpdate = true;
            break;
        }
    }
    if (shouldUpdate) {
        addCheckboxesToTable();
    }
}

function addCheckboxesToTable() {
    const table = document.getElementById('cf-detail-table');
    if (!table) return;

    // ヘッダーへの追加
    const theadRow = table.querySelector('thead tr');
    if (theadRow && !theadRow.querySelector('.mf-ext-header-cell')) {
        const th = document.createElement('th');
        th.className = 'mf-ext-header-cell';
        th.style.width = '30px';
        th.innerHTML = '<input type="checkbox" id="mf-toggle-all-rows" title="全て選択/解除">';
        theadRow.prepend(th);
        
        // 全選択イベント
        document.getElementById('mf-toggle-all-rows').addEventListener('change', (e) => {
            const checked = e.target.checked;
            const checkboxes = document.querySelectorAll('.mf-ext-row-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = checked;
            });
            updateSelectedCount();
        });
    }

    // 各行への追加 (transaction_listクラスを持つ行)
    const rows = table.querySelectorAll('tbody tr.transaction_list');
    rows.forEach(row => {
        if (!row.querySelector('.mf-ext-row-cell')) {
            const td = document.createElement('td');
            td.className = 'mf-ext-row-cell';
            td.style.textAlign = 'center';
            td.style.verticalAlign = 'middle';
            
            // 未分類かどうか判定してマークを付けるなどしても良いが、シンプルにチェックボックスのみ
            td.innerHTML = '<input type="checkbox" class="mf-ext-row-checkbox">';
            row.prepend(td);
            
            // クリックイベントでカウント更新
            td.querySelector('input').addEventListener('change', updateSelectedCount);
        }
    });
}

function createCategoryBulkPanel() {
    const existing = document.getElementById('mf-category-bulk-panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'mf-category-bulk-panel';
    panel.className = 'mf-panel'; // style.cssで定義予定

    // パネルHTML
    panel.innerHTML = `
        <div class="mf-panel-header" style="cursor: move;" title="ドラッグして移動">
            <span class="mf-panel-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:5px; vertical-align:text-bottom;">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                一括カテゴリ設定
            </span>
            <div class="mf-header-btn" id="mf-panel-toggle-btn" title="折りたたむ" style="margin-left: auto;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
            </div>
        </div>
        <div class="mf-panel-body">
            <div class="mf-bulk-section" style="border-bottom:1px dashed #ddd; padding-bottom:10px; margin-bottom:10px;">
                <div style="font-size:13px; font-weight:bold;">選択中: <span id="mf-selected-count" style="color:#e74c3c; font-size:16px;">0</span> 件</div>
                <button id="mf-clear-selection" style="font-size:10px; padding:2px 8px; border:1px solid #ccc; background:#fff; cursor:pointer; border-radius:4px;">選択解除</button>
            </div>
            
            <div class="mf-bulk-section">
                <label class="mf-label" style="margin-bottom:4px;">大項目</label>
                <select id="mf-bulk-large-category" class="mf-select" style="height:36px; line-height:36px;">
                    <option value="">変更しない</option>
                </select>
            </div>
            <div class="mf-bulk-section">
                <label class="mf-label" style="margin-bottom:4px;">中項目</label>
                <select id="mf-bulk-middle-category" class="mf-select" style="height:36px; line-height:36px;">
                    <option value="">変更しない</option>
                </select>
            </div>
            
            <div class="mf-bulk-section" style="margin-top:15px;">
                <button id="mf-apply-categories" class="mf-btn mf-btn-primary">
                    選択した項目に適用
                </button>
            </div>
            
            <div class="mf-status-container" style="margin-top:15px;">
                <div class="mf-status-text" id="mf-bulk-status-text">
                    <span>待機中...</span>
                    <span id="mf-bulk-percent">0%</span>
                </div>
                <div class="mf-progress-bg">
                    <div class="mf-progress-fill" id="mf-bulk-progress-fill"></div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(panel);

    // イベントリスナー
    document.getElementById('mf-clear-selection').addEventListener('click', clearSelection);
    document.getElementById('mf-apply-categories').addEventListener('click', applyCategoriesToSelected);
    
    // パネル開閉（資産推移パネルと同じロジックに統一）
    const toggleBtn = document.getElementById('mf-panel-toggle-btn');
    toggleBtn.addEventListener('click', () => {
        panel.classList.toggle('mf-minimized');
        const isMinimized = panel.classList.contains('mf-minimized');
        
        // JSで強制的に表示制御（CSSが効かない場合への対策）
        const body = panel.querySelector('.mf-panel-body');
        if (body) {
            body.style.display = isMinimized ? 'none' : 'block';
        }

        if (isMinimized) {
            toggleBtn.title = "展開する";
            toggleBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
        } else {
            toggleBtn.title = "折りたたむ";
            toggleBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
        }
    });

    // ドラッグ機能の適用
    makePanelDraggable(panel);

    // カテゴリ読み込み
    loadCategoryOptions();
}

function updateBulkStatus(text, progress = 0) {
    const statusEl = document.getElementById('mf-bulk-status-text').firstElementChild;
    const percentEl = document.getElementById('mf-bulk-percent');
    const barEl = document.getElementById('mf-bulk-progress-fill');

    if (statusEl) statusEl.textContent = text;
    if (percentEl) percentEl.textContent = `${progress}%`;
    if (barEl) barEl.style.width = `${progress}%`;
}

// ヘルパー：DOM変更待機（指定した要素に変更があるまで待つ、またはタイムアウト）
function waitForDomChange(targetNode, timeout = 3000) {
    return new Promise((resolve) => {
        let resolved = false;
        const observer = new MutationObserver((mutations) => {
            if (!resolved) {
                resolved = true;
                observer.disconnect();
                resolve(true);
            }
        });
        observer.observe(targetNode, { childList: true, subtree: true, attributes: true });
        
        // タイムアウト（変更がなくても先に進む）
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                observer.disconnect();
                resolve(false); // タイムアウト
            }
        }, timeout);
    });
}

function makePanelDraggable(panel) {
    const header = panel.querySelector('.mf-panel-header');
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    header.addEventListener('mousedown', (e) => {
        // ボタンのクリック時はドラッグしない
        if (e.target.closest('.mf-header-btn')) return;
        
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        
        // getComputedStyleで現在の位置を取得（bottom/right指定の場合は変換が必要）
        const rect = panel.getBoundingClientRect();
        
        // 固定配置(bottom/right)から絶対配置(top/left)へ移行してスムーズに動かす
        // 一度動かしたら bottom/right 指定は解除する
        panel.style.bottom = 'auto';
        panel.style.right = 'auto';
        panel.style.left = `${rect.left}px`;
        panel.style.top = `${rect.top}px`;
        
        initialLeft = rect.left;
        initialTop = rect.top;
        
        document.body.style.userSelect = 'none'; // テキスト選択防止
        header.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        panel.style.left = `${initialLeft + dx}px`;
        panel.style.top = `${initialTop + dy}px`;
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            document.body.style.userSelect = '';
            header.style.cursor = 'move';
        }
    });
}

function updateSelectedCount() {
    const count = document.querySelectorAll('.mf-ext-row-checkbox:checked').length;
    const el = document.getElementById('mf-selected-count');
    if (el) el.textContent = count;
}

function clearSelection() {
    const cbs = document.querySelectorAll('.mf-ext-row-checkbox');
    cbs.forEach(cb => cb.checked = false);
    document.getElementById('mf-toggle-all-rows').checked = false;
    updateSelectedCount();
}

function loadCategoryOptions() {
    const lTarget = document.getElementById('mf-bulk-large-category');
    const mTarget = document.getElementById('mf-bulk-middle-category');

    // 1. 家計簿入力フォーム（隠し要素含む）から全カテゴリを取得を試みる
    // MoneyForwardの一般的な構造: select.large_category, select.middle_category
    let lOptions = document.querySelectorAll('select.large_category option');
    let mOptions = document.querySelectorAll('select.middle_category option');

    // なければ、IDでの検索を試行
    if (lOptions.length === 0) lOptions = document.querySelectorAll('#js-large-category-select option');
    if (mOptions.length === 0) mOptions = document.querySelectorAll('#js-middle-category-select option');

    // それでもなければ、既存のフィルタ用セレクトボックスから取得（フォールバック - 表示中の行のみになる）
    if (lOptions.length === 0) {
        const selects = document.querySelectorAll('select.js-table-autofilter-select');
        if (selects.length >= 2) {
            lOptions = selects[0].querySelectorAll('option');
            mOptions = selects[1].querySelectorAll('option');
        }
    }

    // ヘルパー：オプション追加
    const addOptions = (sourceOptions, targetSelect) => {
        const seen = new Set();
        sourceOptions.forEach(opt => {
            const text = opt.textContent.trim();
            // "全て"や空の値を除外
            if (opt.value && text && text !== '全て' && !seen.has(text)) {
                const o = document.createElement('option');
                o.value = text; // valueではなく表示名を使う（マッチング用）
                o.textContent = text;
                targetSelect.appendChild(o);
                seen.add(text);
            }
        });
    };

    if (lOptions.length > 0) addOptions(lOptions, lTarget);
    if (mOptions.length > 0) addOptions(mOptions, mTarget);
}

async function applyCategoriesToSelected() {
    if (isProcessing) return; // 二重実行防止

    const lVal = document.getElementById('mf-bulk-large-category').value;
    const mVal = document.getElementById('mf-bulk-middle-category').value;
    
    if (!lVal && !mVal) {
        alert('変更する項目を選択してください');
        return;
    }
    
    const checkedBoxes = document.querySelectorAll('.mf-ext-row-checkbox:checked');
    if (checkedBoxes.length === 0) {
        alert('適用する行を選択してください');
        return;
    }
    
    // 1. IDリストの作成
    // DOM要素はAjax更新で無効になるため、IDで追跡する
    const targetIds = [];
    checkedBoxes.forEach(cb => {
        const row = cb.closest('tr');
        if (row && row.id) {
            targetIds.push(row.id);
        } else {
            console.warn('Row without ID found, skipping safe update for this item.');
        }
    });

    if (targetIds.length === 0) {
        alert('更新対象の行IDが取得できませんでした。');
        return;
    }

    // 確認ポップアップを廃止して処理開始
    isProcessing = true;
    document.getElementById('mf-apply-categories').disabled = true;
    
    let successCount = 0;
    let failCount = 0;
    
    updateBulkStatus('処理開始...', 0);
    
    // 処理開始
    for (let i = 0; i < targetIds.length; i++) {
        const id = targetIds[i];
        const progress = Math.round(((i) / targetIds.length) * 100);
        updateBulkStatus(`処理中 (${i+1}/${targetIds.length})...`, progress);
        
        try {
            // 毎回DOMから最新の行を取得する (重要)
            const row = document.getElementById(id);
            
            if (!row) {
                console.error(`Row with id ${id} not found (likely filtered out or page changed)`);
                failCount++;
                continue;
            }

            let lSuccess = true;
            let mSuccess = true;
            
            // 大項目変更
            if (lVal) {
                lSuccess = await clickDropdownItem(row, '.lctg', lVal);
                if (lSuccess) {
                    // DOM更新待機 (テーブル全体を監視)
                    const table = document.getElementById('cf-detail-table');
                    if (table) await waitForDomChange(table, 3000);
                    else await new Promise(r => setTimeout(r, 1500));
                }
            }
            
            // 行が書き換わっている可能性があるため、中項目変更前にもう一度取得を試みる
            // (rowはDOMから外れている可能性があるため、IDで再取得必須)
            const refreshedRow = document.getElementById(id);

            // 中項目変更
            if (mVal && lSuccess && refreshedRow) {
                mSuccess = await clickDropdownItem(refreshedRow, '.mctg', mVal);
                if (mSuccess) {
                    const table = document.getElementById('cf-detail-table');
                    if (table) await waitForDomChange(table, 3000);
                    else await new Promise(r => setTimeout(r, 1500));
                }
            }
            
            if (lSuccess && mSuccess) {
                successCount++;
                // 成功したら最新のDOMのチェックボックスを外す
                const freshCb = (document.getElementById(id) || row).querySelector('.mf-ext-row-checkbox');
                if (freshCb) freshCb.checked = false;
                
                const finalRow = document.getElementById(id) || row;
                if (finalRow) finalRow.style.backgroundColor = '#e8f5e9';
            } else {
                failCount++;
                const finalRow = document.getElementById(id) || row;
                if (finalRow) finalRow.style.backgroundColor = '#ffebee';
            }
            
        } catch (e) {
            console.error(e);
            failCount++;
        }
        
        // 連続処理の安定化のための待機
        await new Promise(r => setTimeout(r, 500));
    }
    
    updateBulkStatus(`完了: 成功${successCount} / 失敗${failCount}`, 100);
    updateSelectedCount();
    
    isProcessing = false;
    document.getElementById('mf-apply-categories').disabled = false;
}

// ドロップダウンをクリックして項目を選択する関数
async function clickDropdownItem(row, cellSelector, targetText) {
    const cell = row.querySelector(cellSelector);
    if (!cell) return false;
    
    // ボタンを探す (Bootstrap dropdown toggle)
    const toggleBtn = cell.querySelector('.dropdown-toggle');
    if (!toggleBtn) return false;
    
    // 現在の値がすでにターゲットと同じならスキップ
    if (toggleBtn.textContent.trim() === targetText) return true;
    
    // 1. ドロップダウンを開く
    toggleBtn.click();
    
    // 2. メニューが表示されるのを待つ (最大1秒、100ms毎チェック)
    let menu = null;
    for (let i = 0; i < 10; i++) {
        menu = cell.querySelector('.dropdown-menu');
        // MoneyForwardは .open クラスで制御していることが多い
        const isOpen = cell.classList.contains('open') || (menu && menu.style.display !== 'none');
        
        if (menu && isOpen) break;
        await new Promise(r => setTimeout(r, 100));
    }

    if (!menu) {
        // 開けなかった、またはメニューがない
        // もう一度クリックして閉じておく（トグルなので）
        toggleBtn.click(); 
        return false;
    }
    
    // 3. メニュー項目を探してクリック
    const links = menu.querySelectorAll('a');
    let targetLink = null;
    
    for(const link of links) {
        if (link.textContent.trim() === targetText) {
            targetLink = link;
            break;
        }
    }
    
    if (targetLink) {
        targetLink.click();
        return true;
    } else {
        // 見つからない場合閉じる
        toggleBtn.click();
        return false;
    }
}

import { currentTheme, isDarkMode } from '../core/config.js';
import { fetchData, fetchMonthlyData, generateCSV, downloadCSV, formatDate } from '../api/client.js';

let globalChart = null;
let lastFetchedData = null; // グラフモーダル内でのデータ保持

// 日次モード用の状態
let isDailyMode = false;
let dailyModeYear = new Date().getFullYear();
let dailyModeMonth = new Date().getMonth() + 1; // 1-indexed
let dailyModeData = null;

// ==========================================
// グラフモーダル & 内部ロジック
// ==========================================
export function showGraphModal(initialData = null) {
    if (initialData) lastFetchedData = initialData;

    const existingModal = document.querySelector('.mf-modal-overlay');
    // 設定モーダルが開いている場合は閉じない
    if (existingModal && existingModal.id !== 'mf-settings-modal') existingModal.remove();

    const modal = document.createElement('div');
    modal.className = 'mf-modal-overlay';
    modal.innerHTML = `
        <div class="mf-modal-content" style="width: 95vw; max-width: 1400px; height: 90vh; display: flex; flex-direction: column;">
            
            <!-- Header -->
            <div class="mf-modal-header" style="flex-shrink: 0; display:flex; justify-content:space-between; align-items:center; padding: 10px 15px;">
                <div style="display:flex; align-items:center; gap:15px;">
                    <div class="mf-modal-title" style="margin:0;">資産推移グラフ</div>
                    <div id="mf-status-msg" style="font-size: 12px; color: var(--mf-text-sub);"></div>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <button class="mf-modal-btn mf-modal-btn-primary" id="mf-modal-fetch">再取得・描画</button>
                    <button class="mf-modal-btn mf-modal-btn-close" id="mf-modal-close">×</button>
                </div>
            </div>

            <!-- Controls Area (Simplified) -->
            <div style="background: var(--mf-bg-secondary); border-bottom: 1px solid var(--mf-border); padding: 12px 15px; flex-shrink: 0; font-size: 13px;">
                
                <!-- Row 1: Quick Period Buttons -->
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 10px;">
                    <div style="font-weight: bold; color: var(--mf-text-main); min-width: 40px;">期間:</div>
                    
                    <!-- Daily Mode Button -->
                    <button type="button" id="mf-daily-btn" class="mf-quick-btn mf-daily-trigger" title="月ごとの日別データを表示">日次</button>
                    
                    <!-- Quick Period Button Group -->
                    <div class="mf-quick-period-group" id="mf-period-group">
                        <button type="button" class="mf-quick-btn" data-period="1">1年</button>
                        <button type="button" class="mf-quick-btn" data-period="3">3年</button>
                        <button type="button" class="mf-quick-btn" data-period="5">5年</button>
                        <button type="button" class="mf-quick-btn active" data-period="10">10年</button>
                        <button type="button" class="mf-quick-btn" data-period="all">全期間</button>
                        <button type="button" id="mf-prediction-btn" class="mf-quick-btn" data-period="predict" title="過去データから未来を予測">未来予測</button>
                    </div>
                    
                    <!-- Daily Mode Month Selector (hidden by default) -->
                    <div id="mf-daily-nav" style="display: none; align-items: center; gap: 8px;">
                        <select id="mf-daily-year" class="mf-select-modern" style="min-width: 80px; height: 30px; font-size: 12px; padding: 4px 8px;"></select>
                        <div class="mf-quick-period-group" id="mf-daily-month-group">
                            ${Array.from({ length: 12 }, (_, i) => `<button type="button" class="mf-daily-month-btn" data-month="${i + 1}">${i + 1}月</button>`).join('')}
                        </div>
                    </div>
                    
                    <!-- Advanced Period Toggle -->
                    <button type="button" id="mf-advanced-period-toggle" class="mf-link-btn" title="指定年・期間指定">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M19 9l-7 7-7-7"/>
                        </svg>
                        詳細期間
                    </button>
                </div>
                
                <!-- Advanced Period Options (Hidden by default) -->
                <div id="mf-advanced-period-panel" style="display: none; margin-bottom: 10px; padding: 10px; background: var(--mf-control-bg); border-radius: 8px; border: 1px solid var(--mf-border);">
                    <div style="display: flex; align-items: center; gap: 15px; flex-wrap: wrap;">
                        <label class="mf-radio-label"><input type="radio" name="mf-mode" value="relative" checked> クイック期間</label>
                        <label class="mf-radio-label"><input type="radio" name="mf-mode" value="year"> 指定年</label>
                        <label class="mf-radio-label"><input type="radio" name="mf-mode" value="range"> 期間指定</label>
                        
                        <div style="width: 1px; height: 20px; background: var(--mf-border);"></div>
                        
                        <div id="mf-mode-year-opts" class="mf-mode-opts" style="display: none; align-items: center; gap: 5px;">
                            <select id="mf-select-year" class="mf-select" style="width: 90px; height: 28px;"></select>
                            <span>年のデータ</span>
                        </div>
                        <div id="mf-mode-range-opts" class="mf-mode-opts" style="display: none; align-items: center; gap: 5px;">
                            <input type="date" id="mf-input-start" class="mf-input-date" style="height: 28px;">
                            <span>〜</span>
                            <input type="date" id="mf-input-end" class="mf-input-date" style="height: 28px;">
                        </div>
                    </div>
                </div>
                
                <!-- Row 2: Extraction (Simplified - day select only) -->
                <div id="mf-extraction-row" style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                    <div style="font-weight: bold; color: var(--mf-text-main); min-width: 40px;">抽出:</div>
                    
                    <div class="mf-filter-group-modern">
                        <select id="mf-select-day" class="mf-select-modern">
                            <option value="">全日</option>
                            ${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}" ${i + 1 === new Date().getDate() ? 'selected' : ''}>${i + 1}日</option>`).join('')}
                            <option value="last">月末（自動）</option>
                        </select>
                        <span class="mf-filter-hint">を抽出</span>
                    </div>
                </div>
                
            </div>

            <!-- Graph Body -->
            <div class="mf-modal-body" style="flex: 1; position: relative; min-height: 0; display: flex; flex-direction: column;">
                <div id="mf-modal-loading" style="position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.05); z-index:10; display:none; justify-content:center; align-items:center; flex-direction:column;">
                    <div style="font-weight:bold; color:var(--mf-text-main); margin-bottom:10px;">データ取得中...</div>
                    <div style="width:200px; height:4px; background:var(--mf-bg-hover); border-radius:2px;"><div id="mf-modal-progress" style="width:0%; height:100%; background:linear-gradient(90deg, var(--mf-color-1), var(--mf-color-2)); border-radius:2px; transition: width 0.3s;"></div></div>
                </div>
                <div style="flex: 1; min-height: 0; position: relative;">
                    <canvas id="mf-chart"></canvas>
                    <div id="mf-no-data-msg" style="display:none; position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); text-align:center; color:var(--mf-text-sub);">
                        <p>表示できるデータがありません。<br>条件を変更して「再取得・描画」を押してください。</p>
                    </div>
                </div>
                <!-- Summary Table Area -->
                <div id="mf-summary-area" style="display:none; flex-shrink:0;"></div>
            </div>

            <!-- Footer -->
            <div class="mf-modal-footer" style="flex-shrink: 0; padding: 10px 15px; flex-wrap: wrap; align-items: center;">
                <div style="margin-right:auto; display:flex; align-items:center; gap:14px; flex-wrap: wrap;">
                    <label style="display:flex; align-items:center; gap:5px; font-size:12px; cursor:pointer;">
                        <input type="checkbox" id="mf-chart-stack-check">
                        積み上げ
                    </label>
                    <label style="display:flex; align-items:center; gap:5px; font-size:12px; cursor:pointer;">
                        <input type="checkbox" id="mf-chart-diff-check">
                        増減表示
                    </label>
                    <div style="width:1px; height:16px; background:var(--mf-border);"></div>
                    <label style="display:flex; align-items:center; gap:5px; font-size:12px; cursor:pointer;">
                        <input type="checkbox" id="mf-chart-ma-check">
                        移動平均
                    </label>
                    <select id="mf-ma-period" class="mf-select-modern" style="min-width:70px; font-size:11px; padding:4px 6px; height:26px;" disabled>
                        <option value="3">3ヶ月</option>
                        <option value="6">6ヶ月</option>
                        <option value="12" selected>12ヶ月</option>
                    </select>
                    <div style="width:1px; height:16px; background:var(--mf-border);"></div>
                    <button class="mf-modal-btn mf-modal-btn-close" id="mf-toggle-summary" style="padding:6px 12px; font-size:11px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
                        </svg>
                        サマリー
                    </button>
                </div>
                <button class="mf-modal-btn mf-modal-btn-close" id="mf-download-csv" style="padding:6px 12px; font-size:11px;">CSV保存</button>
                <button class="mf-modal-btn mf-modal-btn-close" id="mf-copy-data" style="padding:6px 12px; font-size:11px;">CSVコピー</button>
                <button class="mf-modal-btn mf-modal-btn-copy" id="mf-copy-image" style="padding:6px 12px; font-size:11px;">画像コピー</button>
            </div>
        </div>

        <style>
            .mf-radio-label { font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 4px; user-select: none; color: var(--mf-text-main); }
            .mf-mode-opts { animation: fadeIn 0.1s; }
            .mf-input-date { padding: 3px 6px; border: 1px solid var(--mf-border); border-radius: 4px; font-size: 13px; font-family: sans-serif; background: var(--mf-control-bg); color: var(--mf-text-main); }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: translateY(0); } }
            
            /* Quick Period Button Group */
            .mf-quick-period-group { display: flex; gap: 0; }
            .mf-quick-btn {
                padding: 6px 14px; border: 1px solid var(--mf-border); background: var(--mf-control-bg); color: var(--mf-text-sub);
                font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.15s;
            }
            .mf-quick-btn:first-child { border-radius: 6px 0 0 6px; }
            .mf-quick-btn:last-child { border-radius: 0 6px 6px 0; }
            .mf-quick-btn:not(:last-child) { border-right: none; }
            .mf-quick-btn:hover { background: var(--mf-bg-hover); }
            .mf-quick-btn.active {
                background: linear-gradient(135deg, var(--mf-color-1, #80A1BA) 0%, var(--mf-color-2, #91C4C3) 100%);
                color: #fff; border-color: var(--mf-color-1, #80A1BA); font-weight: 600;
            }
            
            /* Link Button */
            .mf-link-btn {
                display: flex; align-items: center; gap: 4px; padding: 4px 8px;
                background: transparent; border: none; color: var(--mf-text-sub); font-size: 12px;
                cursor: pointer; transition: all 0.15s; border-radius: 4px;
            }
            .mf-link-btn:hover { background: var(--mf-bg-hover); color: var(--mf-text-main); }
            .mf-link-btn.active svg { transform: rotate(180deg); }
            
            /* Modern Select */
            .mf-filter-group-modern { display: flex; align-items: center; gap: 6px; }
            .mf-select-modern {
                padding: 6px 10px; border: 1px solid var(--mf-border); border-radius: 6px;
                font-size: 13px; background: var(--mf-control-bg); cursor: pointer; min-width: 100px;
                color: var(--mf-text-main);
            }
            .mf-select-modern:focus { border-color: var(--mf-color-1, #80A1BA); outline: none; box-shadow: 0 0 0 2px rgba(128, 161, 186, 0.2); }
            .mf-filter-hint { font-size: 12px; color: var(--mf-text-sub); }
        </style>
    `;
    document.body.appendChild(modal);

    // イベント設定
    document.getElementById('mf-modal-close').addEventListener('click', () => { modal.remove(); globalChart = null; });

    // 年選択の生成 (現在年〜2000年)
    const yearSelect = document.getElementById('mf-select-year');
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= 2000; y--) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        yearSelect.appendChild(opt);
    }

    // モード切替（詳細期間パネル内）
    const modeRadios = document.querySelectorAll('input[name="mf-mode"]');
    const optsYear = document.getElementById('mf-mode-year-opts');
    const optsRange = document.getElementById('mf-mode-range-opts');

    modeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const val = e.target.value;
            optsYear.style.display = val === 'year' ? 'flex' : 'none';
            optsRange.style.display = val === 'range' ? 'flex' : 'none';

            // relative選択時はクイックボタンを有効化
            if (val === 'relative') {
                document.querySelectorAll('.mf-quick-btn:not(#mf-daily-btn)').forEach(btn => btn.disabled = false);
            } else {
                document.querySelectorAll('.mf-quick-btn:not(#mf-daily-btn)').forEach(btn => btn.disabled = true);
            }
            updateGraph();
        });
    });

    // クイック期間ボタン（予測ボタン・日次ボタンを除外）
    const quickPeriodBtns = document.querySelectorAll('.mf-quick-btn:not(#mf-prediction-btn):not(#mf-daily-btn)');
    const predictionBtn = document.getElementById('mf-prediction-btn');

    quickPeriodBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // 他のボタンの選択解除
            quickPeriodBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // 予測モードをオフに
            predictionBtn.classList.remove('active');

            // モードをrelativeに設定
            document.querySelector('input[name="mf-mode"][value="relative"]').checked = true;
            optsYear.style.display = 'none';
            optsRange.style.display = 'none';

            updateGraph();
        });
    });

    // 未来予測ボタン：増減モードとは排他的
    predictionBtn.addEventListener('click', () => {
        predictionBtn.classList.toggle('active');

        // 予測ONの場合は増減モードをOFFに
        if (predictionBtn.classList.contains('active')) {
            document.getElementById('mf-chart-diff-check').checked = false;
        }

        updateGraph();
    });

    // ==========================================
    // 日次モード
    // ==========================================
    const dailyBtn = document.getElementById('mf-daily-btn');
    const dailyNav = document.getElementById('mf-daily-nav');
    const periodGroup = document.getElementById('mf-period-group');
    const extractionRow = document.getElementById('mf-extraction-row');
    const dailyYearSelect = document.getElementById('mf-daily-year');
    const dailyMonthBtns = document.querySelectorAll('.mf-daily-month-btn');

    // 年セレクト生成
    const curYear = new Date().getFullYear();
    for (let y = curYear; y >= 2000; y--) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = `${y}年`;
        dailyYearSelect.appendChild(opt);
    }
    dailyYearSelect.value = dailyModeYear;

    function updateDailyButtons() {
        const now = new Date();
        const nowYear = now.getFullYear();
        const nowMonth = now.getMonth() + 1;

        dailyMonthBtns.forEach(btn => {
            const m = parseInt(btn.dataset.month, 10);
            btn.classList.toggle('active', m === dailyModeMonth);
            // 未来の月は無効化
            btn.disabled = (dailyModeYear === nowYear && m > nowMonth) || (dailyModeYear > nowYear);
        });
    }

    async function loadDailyData() {
        const loading = document.getElementById('mf-modal-loading');
        const progress = document.getElementById('mf-modal-progress');
        loading.style.display = 'flex';
        progress.style.width = '50%';
        statusMsg.textContent = '';

        try {
            const data = await fetchMonthlyData(dailyModeYear, dailyModeMonth);
            if (data && data.rows.length > 0) {
                dailyModeData = data;
                updateGraph();
            } else {
                statusMsg.textContent = 'この月のデータがありません';
                dailyModeData = null;
                document.getElementById('mf-no-data-msg').style.display = 'block';
            }
        } catch (e) {
            console.error(e);
            statusMsg.textContent = 'エラーが発生しました';
        } finally {
            loading.style.display = 'none';
        }
    }

    function enterDailyMode() {
        isDailyMode = true;
        dailyBtn.classList.add('active');
        periodGroup.style.display = 'none';
        dailyNav.style.display = 'flex';
        predictionBtn.classList.remove('active');
        if (extractionRow) extractionRow.style.display = 'none';
        advPeriodToggle.style.display = 'none';
        advPeriodPanel.style.display = 'none';
        updateDailyButtons();
        loadDailyData();
    }

    function exitDailyMode() {
        isDailyMode = false;
        dailyModeData = null;
        dailyBtn.classList.remove('active');
        periodGroup.style.display = 'flex';
        dailyNav.style.display = 'none';
        if (extractionRow) extractionRow.style.display = 'flex';
        advPeriodToggle.style.display = 'flex';
        updateGraph();
    }

    dailyBtn.addEventListener('click', () => {
        if (isDailyMode) {
            exitDailyMode();
        } else {
            enterDailyMode();
        }
    });

    // 月ボタンクリック
    dailyMonthBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            dailyModeMonth = parseInt(btn.dataset.month, 10);
            updateDailyButtons();
            loadDailyData();
        });
    });

    // 年セレクト変更
    dailyYearSelect.addEventListener('change', () => {
        dailyModeYear = parseInt(dailyYearSelect.value, 10);
        // 年が変わったら未来月チェック
        const now = new Date();
        if (dailyModeYear === now.getFullYear() && dailyModeMonth > now.getMonth() + 1) {
            dailyModeMonth = now.getMonth() + 1;
        }
        updateDailyButtons();
        loadDailyData();
    });

    // クイック期間ボタンクリック時は日次モードを解除
    quickPeriodBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (isDailyMode) exitDailyMode();
        });
    });

    // 詳細期間パネルトグル
    const advPeriodToggle = document.getElementById('mf-advanced-period-toggle');
    const advPeriodPanel = document.getElementById('mf-advanced-period-panel');
    advPeriodToggle.addEventListener('click', () => {
        const isOpen = advPeriodPanel.style.display !== 'none';
        advPeriodPanel.style.display = isOpen ? 'none' : 'block';
        advPeriodToggle.classList.toggle('active', !isOpen);
    });

    // 日付選択の変更でグラフ更新
    const daySelect = document.getElementById('mf-select-day');
    daySelect.addEventListener('change', () => {
        updateGraph();
    });

    const fetchBtn = document.getElementById('mf-modal-fetch');
    const statusMsg = document.getElementById('mf-status-msg');

    fetchBtn.addEventListener('click', async () => {
        const mode = document.querySelector('input[name="mf-mode"]:checked').value;
        const loading = document.getElementById('mf-modal-loading');
        const progress = document.getElementById('mf-modal-progress');

        loading.style.display = 'flex';
        fetchBtn.disabled = true;
        statusMsg.textContent = '';

        let yearsToFetch = '10'; // default

        if (mode === 'relative') {
            const activeBtn = document.querySelector('.mf-quick-btn.active');
            yearsToFetch = activeBtn ? activeBtn.dataset.period : '10';
        } else {
            yearsToFetch = 'all';
        }

        try {
            const data = await fetchData(yearsToFetch, (pct) => {
                progress.style.width = `${pct}%`;
            });

            if (data) {
                lastFetchedData = data;
                updateGraph();
            } else {
                statusMsg.textContent = 'データ取得に失敗しました';
            }
        } catch (e) {
            console.error(e);
            statusMsg.textContent = 'エラーが発生しました';
        } finally {
            loading.style.display = 'none';
            fetchBtn.disabled = false;
        }
    });

    // グラフ更新トリガー
    document.getElementById('mf-chart-stack-check').addEventListener('change', updateGraph);

    // 増減モード：予測・移動平均とは排他的
    const diffCheck = document.getElementById('mf-chart-diff-check');
    diffCheck.addEventListener('change', () => {
        if (diffCheck.checked) {
            document.getElementById('mf-prediction-btn').classList.remove('active');
            document.getElementById('mf-chart-ma-check').checked = false;
            document.getElementById('mf-ma-period').disabled = true;
        }
        updateGraph();
    });

    // 移動平均トグル
    const maCheck = document.getElementById('mf-chart-ma-check');
    const maPeriodSelect = document.getElementById('mf-ma-period');
    maCheck.addEventListener('change', () => {
        maPeriodSelect.disabled = !maCheck.checked;
        if (maCheck.checked) {
            document.getElementById('mf-chart-diff-check').checked = false;
        }
        updateGraph();
    });
    maPeriodSelect.addEventListener('change', updateGraph);

    // サマリーテーブルトグル
    document.getElementById('mf-toggle-summary').addEventListener('click', () => {
        const area = document.getElementById('mf-summary-area');
        if (area.style.display === 'none') {
            area.style.display = 'block';
            renderSummaryTable();
        } else {
            area.style.display = 'none';
        }
    });

    document.getElementById('mf-copy-data').addEventListener('click', copyGraphData);
    document.getElementById('mf-copy-image').addEventListener('click', copyGraphImage);

    document.getElementById('mf-download-csv').addEventListener('click', () => {
        const currentData = isDailyMode ? dailyModeData : lastFetchedData;
        if (!globalChart || !currentData) return;
        const filteredRows = getFilteredRows();
        if (!filteredRows || filteredRows.length === 0) { alert('データがありません'); return; }
        const csvRows = [...filteredRows].reverse();
        const finalCsv = generateCSV([currentData.headers, ...csvRows]);
        downloadCSV(finalCsv, `moneyforward_graph_data_${formatDate(new Date())}.csv`);
    });

    if (lastFetchedData) {
        updateGraph();
    } else {
        document.getElementById('mf-no-data-msg').style.display = 'block';
    }
}

// ==========================================
// フィルタリングロジック
// ==========================================
function getFilteredRows() {
    // 日次モードの場合
    if (isDailyMode && dailyModeData) {
        const rows = dailyModeData.rows.map(r => ({
            date: new Date(r[0]),
            raw: r
        })).filter(item => !isNaN(item.date.getTime()));
        rows.sort((a, b) => a.date - b.date);
        const statusMsg = document.getElementById('mf-status-msg');
        if (statusMsg) statusMsg.textContent = `${dailyModeYear}年${dailyModeMonth}月 日次: ${rows.length}件`;
        return rows.map(r => r.raw);
    }

    if (!lastFetchedData) return [];

    const mode = document.querySelector('input[name="mf-mode"]:checked').value;

    // 1. 全データを日付オブジェクト付きで用意
    let rows = lastFetchedData.rows.map(r => ({
        date: new Date(r[0]),
        raw: r
    })).filter(item => !isNaN(item.date.getTime()));

    // 2. モードによる期間フィルタ
    if (mode === 'relative') {
        const activeBtn = document.querySelector('.mf-quick-btn.active');
        const rangeVal = activeBtn ? activeBtn.dataset.period : '10';
        if (rangeVal !== 'all') {
            const years = parseInt(rangeVal, 10);
            const cutoffDate = new Date();
            cutoffDate.setFullYear(cutoffDate.getFullYear() - years);
            rows = rows.filter(r => r.date >= cutoffDate);
        }
    } else if (mode === 'year') {
        const targetYear = parseInt(document.getElementById('mf-select-year').value, 10);
        if (!isNaN(targetYear)) {
            rows = rows.filter(r => r.date.getFullYear() === targetYear);
        }
    } else if (mode === 'range') {
        const startStr = document.getElementById('mf-input-start').value;
        const endStr = document.getElementById('mf-input-end').value;
        if (startStr) {
            const startDate = new Date(startStr);
            rows = rows.filter(r => r.date >= startDate);
        }
        if (endStr) {
            const endDate = new Date(endStr);
            rows = rows.filter(r => r.date <= endDate);
        }
    }

    // 3. 抽出フィルタ (Simplified: day select only)
    const daySelectVal = document.getElementById('mf-select-day').value;

    if (daySelectVal === 'last') {
        // 月末: 各月の最終データを抽出
        const monthMap = new Map();
        rows.forEach(r => {
            const key = `${r.date.getFullYear()}-${r.date.getMonth()}`;
            const existing = monthMap.get(key);
            if (!existing || r.date > existing.date) {
                monthMap.set(key, r);
            }
        });
        rows = Array.from(monthMap.values());
    } else if (daySelectVal !== '') {
        // 特定日付
        const targetDay = parseInt(daySelectVal, 10);
        rows = rows.filter(r => r.date.getDate() === targetDay);
    }
    // 空の場合は全日表示

    // 4. ソートして配列に戻す
    rows.sort((a, b) => a.date - b.date);

    // 表示数更新
    const statusMsg = document.getElementById('mf-status-msg');
    if (statusMsg) {
        statusMsg.textContent = `表示: ${rows.length}件`;
    }

    return rows.map(r => r.raw);
}

// ==========================================
// グラフ更新
// ==========================================
export function updateGraph() {
    if (!isDailyMode && !lastFetchedData) return;
    if (isDailyMode && !dailyModeData) return;
    document.getElementById('mf-no-data-msg').style.display = 'none';

    const rows = getFilteredRows();

    if (rows.length === 0) {
        if (globalChart) globalChart.destroy();
        alert('指定条件に一致するデータがありません');
        return;
    }

    const headers = isDailyMode ? dailyModeData.headers : lastFetchedData.headers;
    const labels = isDailyMode
        ? rows.map(r => {
            const d = new Date(r[0]);
            return `${d.getMonth() + 1}/${d.getDate()}`;
        })
        : rows.map(r => r[0]);
    const isStacked = document.getElementById('mf-chart-stack-check').checked;
    const isDiff = document.getElementById('mf-chart-diff-check').checked;
    const isPrediction = document.getElementById('mf-prediction-btn')?.classList.contains('active') || false;
    const isMA = document.getElementById('mf-chart-ma-check').checked;
    const maPeriod = parseInt(document.getElementById('mf-ma-period').value, 10);

    drawChartCanvas(labels, headers, rows, isStacked, isDiff, isPrediction, isMA, maPeriod);

    // サマリーテーブルが表示中なら更新
    const summaryArea = document.getElementById('mf-summary-area');
    if (summaryArea && summaryArea.style.display !== 'none') {
        renderSummaryTable();
    }
}

// ==========================================
// ヘルパー
// ==========================================
function hexToRgbObj(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
}

// 移動平均を計算
function calcMovingAverage(data, period) {
    const result = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            result.push(null);
        } else {
            let sum = 0;
            let count = 0;
            for (let j = i - period + 1; j <= i; j++) {
                if (data[j] !== null && data[j] !== undefined) {
                    sum += data[j];
                    count++;
                }
            }
            result.push(count > 0 ? Math.round(sum / count) : null);
        }
    }
    return result;
}

// ==========================================
// グラフ描画
// ==========================================
function drawChartCanvas(labels, headers, rows, isStacked, isDiff, isPrediction = false, isMA = false, maPeriod = 12) {
    if (globalChart) globalChart.destroy();
    const ctx = document.getElementById('mf-chart').getContext('2d');

    // ダークモード判定
    const dark = isDarkMode;
    const textColor = dark ? '#a0a8b0' : '#636e72';
    const gridColor = dark ? '#3a3f4b' : '#dfe6e9';
    const haloColor = dark ? 'rgba(30, 32, 40, 0.9)' : 'rgba(255, 255, 255, 0.8)';

    const datasets = [];
    const themeColors = [
        currentTheme.color1,
        currentTheme.color2,
        currentTheme.color3,
        currentTheme.color4
    ];

    // 予測用の変数
    let allLabels = [...labels];
    let predictionStartIndex = labels.length;

    if (isDiff) {
        // --- 増減モード (Bar Chart) ---
        const diffData = [];
        const percentData = [];
        diffData.push(0);
        percentData.push(0);

        for (let i = 1; i < rows.length; i++) {
            const currentTotal = parseInt(rows[i][1] || 0, 10);
            const prevTotal = parseInt(rows[i - 1][1] || 0, 10);
            diffData.push(currentTotal - prevTotal);
            const percent = prevTotal !== 0 ? ((currentTotal - prevTotal) / prevTotal) * 100 : 0;
            percentData.push(percent);
        }

        const backgroundColors = diffData.map(val => val >= 0 ? currentTheme.color2 : '#e74c3c');
        const borderColors = diffData.map(val => val >= 0 ? currentTheme.color1 : '#c0392b');

        datasets.push({
            label: '前回比増減',
            data: diffData,
            percentData: percentData,
            backgroundColor: backgroundColors,
            borderColor: borderColors,
            borderWidth: 1,
            borderRadius: 4,
        });

    } else if (isStacked) {
        // --- 積み上げモード (Area Chart) ---
        const extraColors = ['#C2B280', '#8C705F', '#6A8D92', '#D4C5A3'];
        const palette = [...themeColors, ...extraColors];

        for (let i = 2; i < headers.length; i++) {
            if (headers[i] === '詳細') continue;

            const baseColor = palette[(i - 2) % palette.length];
            const rgb = hexToRgbObj(baseColor);
            const gradient = ctx.createLinearGradient(0, 0, 0, 400);
            gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.8)`);
            gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`);

            const categoryData = rows.map(r => parseInt(r[i] || 0, 10));

            datasets.push({
                label: headers[i],
                data: categoryData,
                backgroundColor: gradient,
                borderColor: baseColor,
                borderWidth: 1,
                fill: true,
                pointRadius: rows.length > 50 ? 0 : 3
            });
        }

        // 積み上げ + 移動平均
        if (isMA) {
            const totalData = rows.map(r => parseInt(r[1] || 0, 10));
            const maData = calcMovingAverage(totalData, maPeriod);
            datasets.push({
                label: `${maPeriod}ヶ月移動平均 (合計)`,
                data: maData,
                backgroundColor: 'transparent',
                borderColor: dark ? '#f5a623' : '#e17055',
                borderWidth: 2.5,
                borderDash: [6, 3],
                fill: false,
                pointRadius: 0,
                pointHoverRadius: 4,
                order: -1 // 最前面に描画
            });
        }
    } else {
        // --- 通常モード (Line Chart) ---
        const rgb = hexToRgbObj(currentTheme.color1);
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)`);
        gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.0)`);

        const actualData = rows.map(r => parseInt(r[1] || 0, 10));

        datasets.push({
            label: '資産合計',
            data: actualData,
            backgroundColor: gradient,
            borderColor: currentTheme.color1,
            borderWidth: 3,
            fill: true,
            pointRadius: rows.length > 50 ? 0 : 4,
            pointHoverRadius: 6
        });

        // --- 移動平均線 ---
        if (isMA) {
            const maData = calcMovingAverage(actualData, maPeriod);
            datasets.push({
                label: `${maPeriod}ヶ月移動平均`,
                data: maData,
                backgroundColor: 'transparent',
                borderColor: dark ? '#f5a623' : '#e17055',
                borderWidth: 2.5,
                borderDash: [6, 3],
                fill: false,
                pointRadius: 0,
                pointHoverRadius: 4
            });
        }

        // --- 複数シナリオ予測 ---
        if (isPrediction && rows.length >= 2) {
            // CAGR計算（年平均成長率）
            const firstDate = new Date(rows[0][0]);
            const lastDate = new Date(rows[rows.length - 1][0]);
            const firstVal = parseInt(rows[0][1] || 0, 10);
            const lastVal = parseInt(rows[rows.length - 1][1] || 0, 10);

            const yearsDiff = (lastDate - firstDate) / (1000 * 60 * 60 * 24 * 365.25);
            const cagr = yearsDiff > 0 && firstVal > 0 ? Math.pow(lastVal / firstVal, 1 / yearsDiff) - 1 : 0;

            // 5年分（60ヶ月）の予測データを生成
            const predictionMonths = 60;

            // 3シナリオ用のCAGR
            const scenarios = [
                { name: '楽観', factor: 1.5, color: '#27ae60', dashStyle: [6, 3] },
                { name: '中立', factor: 1.0, color: '#f5a623', dashStyle: [8, 4] },
                { name: '悲観', factor: 0.5, color: '#e74c3c', dashStyle: [4, 4] }
            ];

            // 未来の日付ラベルを追加
            for (let m = 1; m <= predictionMonths; m++) {
                const futureDate = new Date(lastDate);
                futureDate.setMonth(futureDate.getMonth() + m);
                const dateStr = futureDate.toISOString().split('T')[0];
                allLabels.push(dateStr);
            }

            scenarios.forEach(scenario => {
                const scenarioCagr = cagr * scenario.factor;
                const predictionData = new Array(actualData.length - 1).fill(null);
                predictionData.push(lastVal); // 最後の実績値から開始

                for (let m = 1; m <= predictionMonths; m++) {
                    const monthlyGrowth = Math.pow(1 + scenarioCagr, m / 12);
                    predictionData.push(Math.round(lastVal * monthlyGrowth));
                }

                const predictionRgb = hexToRgbObj(scenario.color);
                const predictionGradient = ctx.createLinearGradient(0, 0, 0, 400);
                predictionGradient.addColorStop(0, `rgba(${predictionRgb.r}, ${predictionRgb.g}, ${predictionRgb.b}, 0.1)`);
                predictionGradient.addColorStop(1, `rgba(${predictionRgb.r}, ${predictionRgb.g}, ${predictionRgb.b}, 0.0)`);

                datasets.push({
                    label: `${scenario.name} (CAGR ${(scenarioCagr * 100).toFixed(1)}%)`,
                    data: predictionData,
                    backgroundColor: predictionGradient,
                    borderColor: scenario.color,
                    borderWidth: 2,
                    borderDash: scenario.dashStyle,
                    fill: true,
                    pointRadius: 0,
                    pointHoverRadius: 4
                });
            });
        }
    }

    // データラベル表示プラグイン
    const dataLabelPlugin = {
        id: 'dataLabelPlugin',
        afterDatasetsDraw: (chart) => {
            const { ctx, data } = chart;
            const MAX_LABELS = isDiff ? 12 : 20;
            const totalPoints = data.labels.length;
            const skipInterval = totalPoints <= MAX_LABELS ? 1 : Math.ceil(totalPoints / MAX_LABELS);

            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 11px "Helvetica Neue", Arial, sans-serif';

            chart.data.datasets.forEach((dataset, i) => {
                const meta = chart.getDatasetMeta(i);
                if (meta.hidden) return;

                // 移動平均線にはラベルを表示しない
                if (dataset.label && dataset.label.includes('移動平均')) return;

                meta.data.forEach((element, index) => {
                    const isLastPoint = index === meta.data.length - 1;
                    const isFirstPoint = index === 0;
                    if (skipInterval > 1 && !isFirstPoint && !isLastPoint && index % skipInterval !== 0) return;

                    const value = dataset.data[index];
                    if (value === null || value === undefined) return;

                    // 予測データセットの最初のポイント（実績との重複点）はスキップ
                    if (dataset.label && (dataset.label.includes('楽観') || dataset.label.includes('中立') || dataset.label.includes('悲観')) && isFirstPoint) return;

                    // 増減モードで0の場合は表示しない
                    if (isDiff && value === 0) return;

                    let text = '';
                    const absVal = Math.abs(value);
                    if (absVal >= 100000000) text = (value / 100000000).toFixed(1) + '億';
                    else if (absVal >= 10000) text = (value / 10000).toFixed(0) + '万';
                    else text = value.toLocaleString();

                    if (isDiff && value > 0) text = '+' + text;
                    if (isDiff && dataset.percentData && dataset.percentData[index] !== undefined) {
                        const pct = dataset.percentData[index];
                        const pctText = pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;
                        text += ` (${pctText})`;
                    }

                    const { x, y } = element.tooltipPosition();
                    const color = dataset.borderColor instanceof Array ? dataset.borderColor[index] : dataset.borderColor || textColor;

                    let labelY;
                    if (isDiff) {
                        if (value >= 0) {
                            labelY = element.y - 14;
                        } else {
                            labelY = element.base - 14;
                        }
                    } else {
                        labelY = element.y - 14;
                    }

                    // Halo Effect
                    ctx.save();
                    ctx.lineJoin = 'round';
                    ctx.lineWidth = 4;
                    ctx.strokeStyle = haloColor;
                    ctx.strokeText(text, x, labelY);
                    ctx.restore();

                    // Text
                    ctx.fillStyle = color;
                    ctx.fillText(text, x, labelY);
                });
            });
            ctx.restore();
        }
    };

    globalChart = new Chart(ctx, {
        type: isDiff ? 'bar' : 'line',
        data: { labels: allLabels, datasets },
        plugins: [dataLabelPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            stacked: isStacked,
            animation: {
                duration: 1200,
                easing: 'easeInOutQuart',
                delay: (context) => {
                    // データポイントのインデックスに応じた遅延
                    if (context.type === 'data' && context.mode === 'default') {
                        return context.dataIndex * 8;
                    }
                    return 0;
                }
            },
            transitions: {
                active: {
                    animation: {
                        duration: 200
                    }
                }
            },
            layout: {
                padding: { top: 20, bottom: isDiff ? 20 : 0, right: 40 }
            },
            plugins: {
                title: {
                    display: true,
                    text: (() => {
                        if (isDiff) {
                            const firstVal = parseInt(rows[0][1] || 0, 10);
                            const lastVal = parseInt(rows[rows.length - 1][1] || 0, 10);
                            const totalDiff = lastVal - firstVal;
                            const totalPercent = firstVal !== 0 ? ((lastVal - firstVal) / firstVal) * 100 : 0;
                            const percentSign = totalPercent >= 0 ? '+' : '';
                            const percentText = `${percentSign}${totalPercent.toFixed(1)}%`;
                            const formattedTotal = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(totalDiff);
                            const sign = totalDiff > 0 ? '+' : '';
                            const totalText = `期間合計: ${sign}${formattedTotal} (${percentText})`.replace('￥', '¥');
                            return ['資産増減（前回比）', totalText];
                        }
                        if (isPrediction) return '資産推移（3シナリオ予測）';
                        if (isMA) return `資産推移（${maPeriod}ヶ月移動平均）`;
                        if (isDailyMode) return `資産推移 ─ ${dailyModeYear}年${dailyModeMonth}月（日次）`;
                        return isStacked ? '資産推移（内訳）' : '資産推移（合計）';
                    })(),
                    font: { size: 16, weight: 'bold' },
                    color: currentTheme.color1
                },
                tooltip: {
                    backgroundColor: dark ? '#2e3038' : currentTheme.color1,
                    titleColor: dark ? '#e0e0e0' : currentTheme.color4,
                    bodyColor: '#fff',
                    borderColor: dark ? '#3a3f4b' : 'transparent',
                    borderWidth: dark ? 1 : 0,
                    padding: 12,
                    cornerRadius: 8,
                    titleFont: { size: 13, weight: 'bold' },
                    bodyFont: { size: 12 },
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                const val = context.parsed.y;
                                const formatted = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(val);
                                if (isDiff && val > 0) label += '+' + formatted.replace('￥', '');
                                else label += formatted;

                                if (isDiff && context.dataset.percentData) {
                                    const pct = context.dataset.percentData[context.dataIndex];
                                    if (pct !== undefined) {
                                        const pctText = pct >= 0 ? `+${pct.toFixed(2)}%` : `${pct.toFixed(2)}%`;
                                        label += ` (${pctText})`;
                                    }
                                }
                            }
                            return label;
                        }
                    }
                },
                legend: {
                    position: 'bottom',
                    display: !isDiff,
                    labels: {
                        color: textColor,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 16,
                        font: { size: 11 }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: isDailyMode },
                    ticks: {
                        color: textColor,
                        font: { size: isDailyMode ? 10 : 11 },
                        maxRotation: isDailyMode ? 0 : undefined,
                        autoSkip: true,
                        maxTicksLimit: isDailyMode ? 31 : undefined
                    }
                },
                y: {
                    stacked: isStacked && !isDiff,
                    grid: { color: gridColor },
                    ticks: {
                        color: textColor,
                        font: { size: 11 },
                        callback: function (value) {
                            const absVal = Math.abs(value);
                            let text = '';
                            if (absVal >= 100000000) text = (value / 100000000).toFixed(1) + '億円';
                            else if (absVal >= 10000) text = (value / 10000).toFixed(0) + '万円';
                            else text = '¥' + value.toLocaleString();

                            if (isDiff && value > 0) return '+' + text.replace('¥', '');
                            return text;
                        }
                    }
                }
            }
        }
    });

    // 増減モードと積み上げは排他的にする
    if (isDiff) {
        document.getElementById('mf-chart-stack-check').disabled = true;
        document.getElementById('mf-chart-ma-check').disabled = true;
    } else {
        document.getElementById('mf-chart-stack-check').disabled = false;
        document.getElementById('mf-chart-ma-check').disabled = false;
    }
}

// ==========================================
// サマリーテーブル
// ==========================================
function renderSummaryTable() {
    const area = document.getElementById('mf-summary-area');
    if (!area || !lastFetchedData) return;

    const rows = getFilteredRows();
    if (rows.length === 0) {
        area.innerHTML = '<div style="padding:12px; text-align:center; color:var(--mf-text-sub); font-size:12px;">データがありません</div>';
        return;
    }

    // 月次データを生成
    const monthlyData = generateMonthlyData(rows);
    const yearlyData = generateYearlyData(rows);

    const isYearly = area.dataset.mode === 'yearly';

    area.innerHTML = `
        <div class="mf-summary-container">
            <div class="mf-summary-tabs">
                <button class="mf-summary-tab ${!isYearly ? 'active' : ''}" data-mode="monthly">月次</button>
                <button class="mf-summary-tab ${isYearly ? 'active' : ''}" data-mode="yearly">年次</button>
            </div>
            <div id="mf-summary-table-body" style="max-height: 250px; overflow-y: auto;">
                ${isYearly ? buildYearlyTable(yearlyData) : buildMonthlyTable(monthlyData)}
            </div>
        </div>
    `;

    // タブ切替イベント
    area.querySelectorAll('.mf-summary-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            area.dataset.mode = e.target.dataset.mode;
            renderSummaryTable();
        });
    });
}

function generateMonthlyData(rows) {
    // 各月の最終データを取得
    const monthMap = new Map();
    rows.forEach(r => {
        const date = new Date(r[0]);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const existing = monthMap.get(key);
        if (!existing || new Date(r[0]) > new Date(existing.raw[0])) {
            monthMap.set(key, { key, total: parseInt(r[1] || 0, 10), raw: r });
        }
    });

    const sorted = Array.from(monthMap.values()).sort((a, b) => b.key.localeCompare(a.key));
    const result = [];

    for (let i = 0; i < sorted.length; i++) {
        const current = sorted[i];
        const prev = sorted[i + 1]; // 前の月（時系列的には1つ前）
        const diff = prev ? current.total - prev.total : 0;
        const pct = prev && prev.total !== 0 ? ((current.total - prev.total) / prev.total) * 100 : 0;
        result.push({
            label: current.key,
            total: current.total,
            diff: diff,
            pct: pct,
            hasPrev: !!prev
        });
    }

    return result;
}

function generateYearlyData(rows) {
    // 各年の最終データを取得
    const yearMap = new Map();
    rows.forEach(r => {
        const date = new Date(r[0]);
        const year = date.getFullYear();
        const existing = yearMap.get(year);
        if (!existing || new Date(r[0]) > new Date(existing.raw[0])) {
            yearMap.set(year, { year, total: parseInt(r[1] || 0, 10), raw: r });
        }
    });

    // 各年の最初のデータも取得（年間増減用）
    const yearStartMap = new Map();
    rows.forEach(r => {
        const date = new Date(r[0]);
        const year = date.getFullYear();
        const existing = yearStartMap.get(year);
        if (!existing || new Date(r[0]) < new Date(existing[0])) {
            yearStartMap.set(year, r);
        }
    });

    const sorted = Array.from(yearMap.values()).sort((a, b) => b.year - a.year);
    const result = [];

    for (let i = 0; i < sorted.length; i++) {
        const current = sorted[i];
        const prev = sorted[i + 1];
        const diff = prev ? current.total - prev.total : 0;
        const pct = prev && prev.total !== 0 ? ((current.total - prev.total) / prev.total) * 100 : 0;
        result.push({
            label: String(current.year),
            total: current.total,
            diff: diff,
            pct: pct,
            hasPrev: !!prev
        });
    }

    return result;
}

function formatCurrency(val) {
    return new Intl.NumberFormat('ja-JP').format(val);
}

function buildMonthlyTable(data) {
    if (data.length === 0) return '<div style="padding:12px; text-align:center; color:var(--mf-text-sub);">データなし</div>';
    return `
        <table class="mf-summary-table">
            <thead><tr>
                <th>月</th><th>資産合計</th><th>増減額</th><th>増減率</th>
            </tr></thead>
            <tbody>
                ${data.map(d => `
                    <tr>
                        <td>${d.label}</td>
                        <td>¥${formatCurrency(d.total)}</td>
                        <td class="${d.diff >= 0 ? 'mf-positive' : 'mf-negative'}">
                            ${d.hasPrev ? (d.diff >= 0 ? '+' : '') + '¥' + formatCurrency(d.diff) : '—'}
                        </td>
                        <td class="${d.pct >= 0 ? 'mf-positive' : 'mf-negative'}">
                            ${d.hasPrev ? (d.pct >= 0 ? '+' : '') + d.pct.toFixed(1) + '%' : '—'}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function buildYearlyTable(data) {
    if (data.length === 0) return '<div style="padding:12px; text-align:center; color:var(--mf-text-sub);">データなし</div>';
    return `
        <table class="mf-summary-table">
            <thead><tr>
                <th>年</th><th>資産合計</th><th>年間増減</th><th>増減率</th>
            </tr></thead>
            <tbody>
                ${data.map(d => `
                    <tr>
                        <td>${d.label}年</td>
                        <td>¥${formatCurrency(d.total)}</td>
                        <td class="${d.diff >= 0 ? 'mf-positive' : 'mf-negative'}">
                            ${d.hasPrev ? (d.diff >= 0 ? '+' : '') + '¥' + formatCurrency(d.diff) : '—'}
                        </td>
                        <td class="${d.pct >= 0 ? 'mf-positive' : 'mf-negative'}">
                            ${d.hasPrev ? (d.pct >= 0 ? '+' : '') + d.pct.toFixed(1) + '%' : '—'}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// ==========================================
// コピー / 画像
// ==========================================
function copyGraphImage() {
    const canvas = document.getElementById('mf-chart');
    if (!canvas) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');

    // 背景色（ダークモード対応）
    tempCtx.fillStyle = isDarkMode ? '#1e2028' : '#ffffff';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    tempCtx.drawImage(canvas, 0, 0);

    tempCanvas.toBlob(blob => {
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

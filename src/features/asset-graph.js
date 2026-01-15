import { EXTENSION_VERSION, currentTheme } from '../core/config.js';
import { fetchData, generateCSV, downloadCSV, formatDate } from '../api/client.js';

let globalChart = null;
let lastFetchedData = null; // グラフモーダル内でのデータ保持

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
                    <div class="mf-modal-title" style="margin:0;">資産推移グラフ設定</div>
                    <div id="mf-status-msg" style="font-size: 12px; color: #636e72;"></div>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <button class="mf-modal-btn mf-modal-btn-primary" id="mf-modal-fetch">再取得・描画</button>
                    <button class="mf-modal-btn mf-modal-btn-close" id="mf-modal-close">×</button>
                </div>
            </div>

            <!-- Controls Area (Modern & Simplified) -->
            <div style="background: #f8f9fa; border-bottom: 1px solid #dfe6e9; padding: 12px 15px; flex-shrink: 0; font-size: 13px;">
                
                <!-- Row 1: Quick Period Buttons -->
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                    <div style="font-weight: bold; color: #2d3436; min-width: 40px;">期間:</div>
                    
                    <!-- Quick Period Button Group -->
                    <div class="mf-quick-period-group">
                        <button type="button" class="mf-quick-btn" data-period="1">1年</button>
                        <button type="button" class="mf-quick-btn" data-period="3">3年</button>
                        <button type="button" class="mf-quick-btn" data-period="5">5年</button>
                        <button type="button" class="mf-quick-btn active" data-period="10">10年</button>
                        <button type="button" class="mf-quick-btn" data-period="all">全期間</button>
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
                <div id="mf-advanced-period-panel" style="display: none; margin-bottom: 12px; padding: 10px; background: #fff; border-radius: 8px; border: 1px solid #e0e0e0;">
                    <div style="display: flex; align-items: center; gap: 15px; flex-wrap: wrap;">
                        <label class="mf-radio-label"><input type="radio" name="mf-mode" value="relative" checked> クイック期間</label>
                        <label class="mf-radio-label"><input type="radio" name="mf-mode" value="year"> 指定年</label>
                        <label class="mf-radio-label"><input type="radio" name="mf-mode" value="range"> 期間指定</label>
                        
                        <div style="width: 1px; height: 20px; background: #ddd;"></div>
                        
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
                
                <!-- Row 2: Extraction Options -->
                <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                    <div style="font-weight: bold; color: #2d3436; min-width: 40px;">抽出:</div>
                    
                    <!-- Day Extraction (Primary) -->
                    <div class="mf-filter-group-modern">
                        <select id="mf-select-day" class="mf-select-modern">
                            <option value="">全日</option>
                            ${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}" ${i + 1 === new Date().getDate() ? 'selected' : ''}>${i + 1}日</option>`).join('')}
                            <option value="last">月末（自動）</option>
                        </select>
                        <span class="mf-filter-hint">を抽出</span>
                    </div>
                    
                    <div style="width: 1px; height: 20px; background: #ddd;"></div>
                    
                    <!-- Quick Extract Presets -->
                    <div class="mf-extract-presets">
                        <label class="mf-chip-label">
                            <input type="radio" name="mf-extract-preset" value="none" checked>
                            <span class="mf-chip">カスタム</span>
                        </label>
                        <label class="mf-chip-label">
                            <input type="radio" name="mf-extract-preset" value="quarter">
                            <span class="mf-chip">四半期末</span>
                        </label>
                        <label class="mf-chip-label">
                            <input type="radio" name="mf-extract-preset" value="half">
                            <span class="mf-chip">半期末</span>
                        </label>
                        <label class="mf-chip-label">
                            <input type="radio" name="mf-extract-preset" value="yearstart">
                            <span class="mf-chip">年始</span>
                        </label>
                    </div>
                    
                    <!-- Advanced Options Toggle -->
                    <button type="button" id="mf-advanced-filter-toggle" class="mf-link-btn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M19 9l-7 7-7-7"/>
                        </svg>
                        詳細オプション
                    </button>
                </div>
                
                <!-- Advanced Filter Options (Hidden by default) -->
                <div id="mf-advanced-filter-panel" style="display: none; margin-top: 12px; padding: 10px; background: #fff; border-radius: 8px; border: 1px solid #e0e0e0;">
                    <div style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap;">
                        <div class="mf-filter-group">
                            <input type="checkbox" id="mf-check-month">
                            <label for="mf-check-month">特定月のみ:</label>
                            <select id="mf-select-month" class="mf-select-sm" disabled>
                                ${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}月</option>`).join('')}
                            </select>
                        </div>
                        
                        <div class="mf-filter-group">
                            <input type="checkbox" id="mf-check-interval">
                            <label for="mf-check-interval">間引き:</label>
                            <select id="mf-select-interval" class="mf-select-sm" disabled>
                                <option value="3">3ヶ月</option>
                                <option value="6">6ヶ月</option>
                                <option value="12">1年</option>
                            </select>
                        </div>
                    </div>
                </div>
                
            </div>

            <!-- Graph Body -->
            <div class="mf-modal-body" style="flex: 1; position: relative; min-height: 0;">
                <div id="mf-modal-loading" style="position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(255,255,255,0.8); z-index:10; display:none; justify-content:center; align-items:center; flex-direction:column;">
                    <div style="font-weight:bold; color:#313647; margin-bottom:10px;">データ取得中...</div>
                    <div style="width:200px; height:4px; background:#ddd; border-radius:2px;"><div id="mf-modal-progress" style="width:0%; height:100%; background:#A3B087;"></div></div>
                </div>
                <canvas id="mf-chart"></canvas>
                <div id="mf-no-data-msg" style="display:none; position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); text-align:center; color:#888;">
                    <p>表示できるデータがありません。<br>条件を変更して「再取得・描画」を押してください。</p>
                </div>
            </div>

            <!-- Footer -->
            <div class="mf-modal-footer" style="flex-shrink: 0; padding: 10px 15px;">
                    <div style="margin-right:auto; display:flex; align-items:center; gap:5px;">
                        <input type="checkbox" id="mf-chart-stack-check">
                        <label for="mf-chart-stack-check" style="font-size:12px; cursor:pointer;">内訳を積み上げ表示する</label>
                    </div>
                    <div style="margin-right:15px; display:flex; align-items:center; gap:5px;">
                        <input type="checkbox" id="mf-chart-diff-check">
                        <label for="mf-chart-diff-check" style="font-size:12px; cursor:pointer;">前回の点からの増減を表示</label>
                    </div>
                <button class="mf-modal-btn mf-modal-btn-close" id="mf-download-csv">CSV保存</button>
                <button class="mf-modal-btn mf-modal-btn-close" id="mf-copy-data">CSVコピー</button>
                <button class="mf-modal-btn mf-modal-btn-copy" id="mf-copy-image">画像コピー</button>
            </div>
        </div>

        <style>
            .mf-radio-label { font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 4px; user-select: none; }
            .mf-mode-opts { animation: fadeIn 0.1s; }
            .mf-input-date { padding: 3px 6px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px; font-family: sans-serif; }
            .mf-filter-group { display: flex; align-items: center; gap: 5px; font-size: 12px; background: transparent; border: none; padding: 0; }
            .mf-select-sm { padding: 1px 2px; border: 1px solid #ccc; border-radius: 3px; font-size: 12px; height: 22px; }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: translateY(0); } }
            
            /* Quick Period Button Group */
            .mf-quick-period-group { display: flex; gap: 0; }
            .mf-quick-btn {
                padding: 6px 14px; border: 1px solid #ddd; background: #fff; color: #555;
                font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.15s;
            }
            .mf-quick-btn:first-child { border-radius: 6px 0 0 6px; }
            .mf-quick-btn:last-child { border-radius: 0 6px 6px 0; }
            .mf-quick-btn:not(:last-child) { border-right: none; }
            .mf-quick-btn:hover { background: #f5f5f5; }
            .mf-quick-btn.active {
                background: linear-gradient(135deg, var(--mf-color-1, #80A1BA) 0%, var(--mf-color-2, #91C4C3) 100%);
                color: #fff; border-color: var(--mf-color-1, #80A1BA); font-weight: 600;
            }
            
            /* Link Button */
            .mf-link-btn {
                display: flex; align-items: center; gap: 4px; padding: 4px 8px;
                background: transparent; border: none; color: #666; font-size: 12px;
                cursor: pointer; transition: all 0.15s; border-radius: 4px;
            }
            .mf-link-btn:hover { background: #e8e8e8; color: #333; }
            .mf-link-btn.active svg { transform: rotate(180deg); }
            
            /* Modern Select */
            .mf-filter-group-modern { display: flex; align-items: center; gap: 6px; }
            .mf-select-modern {
                padding: 6px 10px; border: 1px solid #ddd; border-radius: 6px;
                font-size: 13px; background: #fff; cursor: pointer; min-width: 100px;
            }
            .mf-select-modern:focus { border-color: var(--mf-color-1, #80A1BA); outline: none; box-shadow: 0 0 0 2px rgba(128, 161, 186, 0.2); }
            .mf-filter-hint { font-size: 12px; color: #888; }
            
            /* Chip Labels */
            .mf-extract-presets { display: flex; gap: 6px; flex-wrap: wrap; }
            .mf-chip-label { cursor: pointer; }
            .mf-chip-label input { display: none; }
            .mf-chip {
                display: inline-block; padding: 5px 12px; border-radius: 16px;
                font-size: 12px; background: #f0f0f0; color: #666; border: 1px solid transparent;
                transition: all 0.15s;
            }
            .mf-chip:hover { background: #e8e8e8; }
            .mf-chip-label input:checked + .mf-chip {
                background: linear-gradient(135deg, var(--mf-color-1, #80A1BA) 0%, var(--mf-color-2, #91C4C3) 100%);
                color: #fff; border-color: var(--mf-color-1, #80A1BA);
            }
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
                document.querySelectorAll('.mf-quick-btn').forEach(btn => btn.disabled = false);
            } else {
                document.querySelectorAll('.mf-quick-btn').forEach(btn => btn.disabled = true);
            }
            updateGraph();
        });
    });

    // クイック期間ボタン
    const quickPeriodBtns = document.querySelectorAll('.mf-quick-btn');
    quickPeriodBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // 他のボタンの選択解除
            quickPeriodBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // モードをrelativeに設定
            document.querySelector('input[name="mf-mode"][value="relative"]').checked = true;
            optsYear.style.display = 'none';
            optsRange.style.display = 'none';

            updateGraph();
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

    // 詳細フィルターパネルトグル
    const advFilterToggle = document.getElementById('mf-advanced-filter-toggle');
    const advFilterPanel = document.getElementById('mf-advanced-filter-panel');
    advFilterToggle.addEventListener('click', () => {
        const isOpen = advFilterPanel.style.display !== 'none';
        advFilterPanel.style.display = isOpen ? 'none' : 'block';
        advFilterToggle.classList.toggle('active', !isOpen);
    });

    // 日付選択の変更でグラフ更新
    const daySelect = document.getElementById('mf-select-day');
    daySelect.addEventListener('change', () => {
        // カスタムに戻す
        document.querySelector('input[name="mf-extract-preset"][value="none"]').checked = true;
        updateGraph();
    });

    // 抽出プリセット
    const presetRadios = document.querySelectorAll('input[name="mf-extract-preset"]');
    presetRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const val = e.target.value;
            // プリセット選択時は日付セレクトを適切に設定
            if (val === 'quarter' || val === 'half' || val === 'yearstart') {
                // 月末選択に変更（プリセットロジックは後でフィルター時に処理）
                daySelect.value = 'last';
            }
            updateGraph();
        });
    });

    // 高度フィルタ切替
    const toggleFilter = (checkId, selectId) => {
        const chk = document.getElementById(checkId);
        const sel = document.getElementById(selectId);
        if (chk && sel) {
            chk.addEventListener('change', () => {
                sel.disabled = !chk.checked;
                updateGraph();
            });
            sel.addEventListener('change', updateGraph);
        } else if (chk) {
            chk.addEventListener('change', updateGraph);
        }
    };

    toggleFilter('mf-check-month', 'mf-select-month');
    toggleFilter('mf-check-interval', 'mf-select-interval');


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

        // データ取得範囲の決定
        // カスタム期間や指定年の場合は、対象が含まれるように広く取る必要がある
        // 安全のため 'all' を取得する方針とする (APIキャッシュが効くため2回目以降は速い)
        if (mode === 'relative') {
            // クイック期間ボタンから値を取得
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
    document.getElementById('mf-chart-diff-check').addEventListener('change', updateGraph);

    document.getElementById('mf-copy-data').addEventListener('click', copyGraphData);
    document.getElementById('mf-copy-image').addEventListener('click', copyGraphImage);

    document.getElementById('mf-download-csv').addEventListener('click', () => {
        if (!globalChart || !lastFetchedData) return;
        const filteredRows = getFilteredRows(); // 現在の表示内容でCSV化
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

// フィルタリングロジック (モダンUI対応)
function getFilteredRows() {
    if (!lastFetchedData) return [];

    const mode = document.querySelector('input[name="mf-mode"]:checked').value;

    // 1. まず全データを日付オブジェクト付きで用意
    let rows = lastFetchedData.rows.map(r => ({
        date: new Date(r[0]),
        raw: r
    })).filter(item => !isNaN(item.date.getTime()));

    // 2. モードによる期間フィルタ
    if (mode === 'relative') {
        // クイック期間ボタンから値を取得
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

    // 3. 抽出フィルタ

    // 抽出プリセットをチェック
    const extractPreset = document.querySelector('input[name="mf-extract-preset"]:checked')?.value || 'none';
    const daySelectVal = document.getElementById('mf-select-day').value;

    if (extractPreset === 'quarter') {
        // 四半期末: 3月、6月、9月、12月の月末
        const quarterMonths = [2, 5, 8, 11]; // 0-indexed
        const monthMap = new Map();
        rows.forEach(r => {
            if (!quarterMonths.includes(r.date.getMonth())) return;
            const key = `${r.date.getFullYear()}-${r.date.getMonth()}`;
            const existing = monthMap.get(key);
            if (!existing || r.date > existing.date) {
                monthMap.set(key, r);
            }
        });
        rows = Array.from(monthMap.values());
    } else if (extractPreset === 'half') {
        // 半期末: 6月、12月の月末
        const halfMonths = [5, 11]; // 0-indexed
        const monthMap = new Map();
        rows.forEach(r => {
            if (!halfMonths.includes(r.date.getMonth())) return;
            const key = `${r.date.getFullYear()}-${r.date.getMonth()}`;
            const existing = monthMap.get(key);
            if (!existing || r.date > existing.date) {
                monthMap.set(key, r);
            }
        });
        rows = Array.from(monthMap.values());
    } else if (extractPreset === 'yearstart') {
        // 年始: 各年の1月の最初のデータ
        const monthMap = new Map();
        rows.forEach(r => {
            if (r.date.getMonth() !== 0) return; // 1月のみ
            const key = `${r.date.getFullYear()}`;
            const existing = monthMap.get(key);
            if (!existing || r.date < existing.date) {
                monthMap.set(key, r);
            }
        });
        rows = Array.from(monthMap.values());
    } else {
        // カスタムモード（日付選択）
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
    }

    // (C) 特定月指定（詳細オプション）
    if (document.getElementById('mf-check-month').checked) {
        const targetMonth = parseInt(document.getElementById('mf-select-month').value, 10); // 1-12
        rows = rows.filter(r => (r.date.getMonth() + 1) === targetMonth);
    }

    // (D) 間引き (Interval)
    // 日付順に並んでいる前提で、Nヶ月ごとのデータを残す
    if (document.getElementById('mf-check-interval').checked) {
        const interval = parseInt(document.getElementById('mf-select-interval').value, 10);

        // 年月でグルーピングしてソート
        rows.sort((a, b) => a.date - b.date);

        const filtered = [];
        let lastMonthKey = null;
        let monthsCount = 0;

        // 基点となる最初のデータは残す？それとも単純に月差分？
        // シンプルに「最初のデータからNヶ月経過したデータ」を拾う
        if (rows.length > 0) {
            const distinctMonths = [];
            // まず月ごとに最も代表的なデータ（通常は月末寄り）を1つ選ぶ必要があるが、
            // 既に(A)(B)で月1件になっている可能性が高い。
            // なっていない場合（全日表示など）はどうする？ -> 単純にスキップする

            // ここではシンプルに「リスト上のインデックス」ではなく「月数差」で判断する
            let baseDate = rows[0].date;
            filtered.push(rows[0]);

            for (let i = 1; i < rows.length; i++) {
                const d = rows[i].date;
                // 月差分計算
                const diffMonths = (d.getFullYear() - baseDate.getFullYear()) * 12 + (d.getMonth() - baseDate.getMonth());
                if (diffMonths >= interval) {
                    filtered.push(rows[i]);
                    baseDate = d;
                }
            }
            rows = filtered;
        }
    }

    // 4. ソートして配列に戻す
    rows.sort((a, b) => a.date - b.date); // 古い順（グラフ描画用）

    // 表示数更新など
    const statusMsg = document.getElementById('mf-status-msg');
    if (statusMsg) {
        statusMsg.textContent = `表示: ${rows.length}件`;
    }

    return rows.map(r => r.raw);
}
// このモジュールからエクスポートして使えるようにもする
export function updateGraph() {
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
    const isDiff = document.getElementById('mf-chart-diff-check').checked;

    drawChartCanvas(labels, headers, rows, isStacked, isDiff);
}

// ヘルパー
function hexToRgbObj(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
}

function drawChartCanvas(labels, headers, rows, isStacked, isDiff) {
    if (globalChart) globalChart.destroy();
    const ctx = document.getElementById('mf-chart').getContext('2d');

    const datasets = [];
    const themeColors = [
        currentTheme.color1,
        currentTheme.color2,
        currentTheme.color3,
        currentTheme.color4
    ];

    if (isDiff) {
        // --- 増減モード (Bar Chart) ---
        // 差分データと割合データの生成
        const diffData = [];
        const percentData = []; // 割合データ
        // [0]は前回がないので0 or null
        diffData.push(0);
        percentData.push(0);

        for (let i = 1; i < rows.length; i++) {
            const currentTotal = parseInt(rows[i][1] || 0, 10);
            const prevTotal = parseInt(rows[i - 1][1] || 0, 10);
            diffData.push(currentTotal - prevTotal);
            // 割合計算（前回が0の場合は0%）
            const percent = prevTotal !== 0 ? ((currentTotal - prevTotal) / prevTotal) * 100 : 0;
            percentData.push(percent);
        }

        // ラベルはそのまま日付を使う

        // 色設定 (プラス: 青/緑, マイナス: 赤)
        const backgroundColors = diffData.map(val => val >= 0 ? currentTheme.color2 : '#e74c3c');
        const borderColors = diffData.map(val => val >= 0 ? currentTheme.color1 : '#c0392b');

        datasets.push({
            label: '前回比増減',
            data: diffData,
            percentData: percentData, // 割合データを格納
            backgroundColor: backgroundColors,
            borderColor: borderColors,
            borderWidth: 1,
            borderRadius: 4, // 角丸
        });

    } else if (isStacked) {
        // --- 積み上げモード (Area Chart) ---
        // 以下既存ロジック
        const extraColors = ['#C2B280', '#8C705F', '#6A8D92', '#D4C5A3'];
        const palette = [...themeColors, ...extraColors];

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
        // --- 通常モード (Line Chart) ---
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

    // データラベル表示プラグイン
    const dataLabelPlugin = {
        id: 'dataLabelPlugin',
        afterDatasetsDraw: (chart) => {
            const { ctx, data } = chart;
            const DATA_LABEL_THRESHOLD = 40;

            if (data.labels.length > DATA_LABEL_THRESHOLD) return;

            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 11px "Helvetica Neue", Arial, sans-serif';

            chart.data.datasets.forEach((dataset, i) => {
                const meta = chart.getDatasetMeta(i);
                if (meta.hidden) return;

                meta.data.forEach((element, index) => {
                    const value = dataset.data[index];
                    if (value === null || value === undefined) return;
                    // 増減モードで0の場合は表示しない（邪魔だから）
                    if (isDiff && value === 0) return;

                    let text = '';
                    // 単位処理
                    const absVal = Math.abs(value);
                    if (absVal >= 100000000) text = (value / 100000000).toFixed(1) + '億';
                    else if (absVal >= 10000) text = (value / 10000).toFixed(0) + '万';
                    else text = value.toLocaleString();

                    // 増減モードなら + を付ける & 割合を追加
                    if (isDiff && value > 0) text = '+' + text;
                    if (isDiff && dataset.percentData && dataset.percentData[index] !== undefined) {
                        const pct = dataset.percentData[index];
                        const pctText = pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;
                        text += ` (${pctText})`;
                    }

                    const { x, y } = element.tooltipPosition();
                    const color = dataset.borderColor instanceof Array ? dataset.borderColor[index] : dataset.borderColor || '#636e72';

                    // 位置調整
                    // すべてのラベルをバーの上端に配置（マイナスも0ライン付近に）
                    // element.y はバーの上端（プラスの場合）または下端（マイナスの場合）
                    // element.base は0ラインの位置
                    let labelY;
                    if (isDiff) {
                        if (value >= 0) {
                            // プラス値: バーの上に表示
                            labelY = element.y - 14;
                        } else {
                            // マイナス値: 0ライン（base）の少し上に表示
                            labelY = element.base - 14;
                        }
                    } else {
                        labelY = element.y - 14;
                    }

                    // Halo Effect
                    ctx.save();
                    ctx.lineJoin = 'round';
                    ctx.lineWidth = 4;
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
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
        data: { labels, datasets },
        plugins: [dataLabelPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            stacked: isStacked, // Bar Chartでも累積したい？いや増減の場合は累積しないほうがいいか。今回はTotalのみなのでfalse
            layout: {
                padding: { top: 20, bottom: isDiff ? 20 : 0 }
            },
            plugins: {
                title: {
                    display: true,
                    text: (() => {
                        if (isDiff) {
                            // 期間合計の計算 (最後 - 最初)
                            // rowsはソート済み
                            const firstVal = parseInt(rows[0][1] || 0, 10);
                            const lastVal = parseInt(rows[rows.length - 1][1] || 0, 10);
                            const totalDiff = lastVal - firstVal;

                            // 期間全体の割合計算（最初の値に対する増減率）
                            const totalPercent = firstVal !== 0 ? ((lastVal - firstVal) / firstVal) * 100 : 0;
                            const percentSign = totalPercent >= 0 ? '+' : '';
                            const percentText = `${percentSign}${totalPercent.toFixed(1)}%`;

                            const formattedTotal = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(totalDiff);
                            const sign = totalDiff > 0 ? '+' : '';
                            const totalText = `期間合計: ${sign}${formattedTotal} (${percentText})`.replace('￥', '¥');

                            return ['資産増減（前回比）', totalText];
                        }
                        return isStacked ? '資産推移（内訳）' : '資産推移（合計）';
                    })(),
                    font: { size: 16 },
                    color: currentTheme.color1
                },
                tooltip: {
                    backgroundColor: currentTheme.color1,
                    titleColor: currentTheme.color4,
                    bodyColor: '#fff',
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                const val = context.parsed.y;
                                const formatted = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(val);
                                // プラス記号付与 & 割合追加
                                if (isDiff && val > 0) label += '+' + formatted.replace('￥', '');
                                else label += formatted;

                                // 増減モード時に割合を追加
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
                legend: { position: 'bottom', display: !isDiff, labels: { color: '#636e72' } } // 増減は凡例不要（1つだけだから）
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#636e72' } },
                y: {
                    stacked: isStacked && !isDiff, // 増減モードはスタックしない
                    grid: { color: '#dfe6e9' },
                    ticks: {
                        color: '#636e72',
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

    // 増減モードと積み上げは排他的にする (UI連動)
    if (isDiff) {
        document.getElementById('mf-chart-stack-check').disabled = true;
    } else {
        document.getElementById('mf-chart-stack-check').disabled = false;
    }
}

function copyGraphImage() {
    const canvas = document.getElementById('mf-chart');
    if (!canvas) return;

    // 白背景付きの画像を作成
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');

    // 白背景を描画
    tempCtx.fillStyle = '#ffffff';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    // 元のグラフを重ねる
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

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

            <!-- Controls Area (Ultra Compact) -->
            <div style="background: #f8f9fa; border-bottom: 1px solid #dfe6e9; padding: 8px 15px; flex-shrink: 0; font-size: 13px;">
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 20px; row-gap: 8px;">
                    
                    <!-- Section: Period -->
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="font-weight: bold; color: #2d3436;">期間:</div>
                        
                        <!-- Mode Selection -->
                        <div style="display: flex; gap: 10px;">
                            <label class="mf-radio-label"><input type="radio" name="mf-mode" value="relative" checked> 相対期間</label>
                            <label class="mf-radio-label"><input type="radio" name="mf-mode" value="year"> 指定年</label>
                            <label class="mf-radio-label"><input type="radio" name="mf-mode" value="range"> 期間指定</label>
                        </div>
                        
                        <div style="width: 1px; height: 16px; background: #ccc; margin: 0 5px;"></div>

                        <!-- Mode Inputs -->
                        <div id="mf-mode-relative-opts" class="mf-mode-opts" style="display: flex;">
                            <select id="mf-modal-range" class="mf-select" style="padding-top:2px; padding-bottom:2px; height:26px;">
                                <option value="1">過去1年</option>
                                <option value="3">過去3年</option>
                                <option value="5">過去5年</option>
                                <option value="10" selected>過去10年</option>
                                <option value="20">過去20年</option>
                                <option value="all">全期間</option>
                            </select>
                        </div>
                        <div id="mf-mode-year-opts" class="mf-mode-opts" style="display: none; align-items: center; gap: 5px;">
                            <select id="mf-select-year" class="mf-select" style="width: 80px; padding-top:2px; padding-bottom:2px; height:26px;"></select>
                            <span>年</span>
                        </div>
                        <div id="mf-mode-range-opts" class="mf-mode-opts" style="display: none; align-items: center; gap: 5px;">
                            <input type="date" id="mf-input-start" class="mf-input-date" style="height:26px;">
                            <span>〜</span>
                            <input type="date" id="mf-input-end" class="mf-input-date" style="height:26px;">
                        </div>
                    </div>

                    <!-- Separator (Visible on wide screens) -->
                    <div class="mf-separator-vertical" style="width: 1px; height: 20px; background: #dfe6e9;"></div>

                    <!-- Section: Filter -->
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="font-weight: bold; color: #2d3436;">抽出:</div>
                        
                        <div class="mf-filter-group">
                            <input type="checkbox" id="mf-check-month-end">
                            <label for="mf-check-month-end" title="各月の最終データのみを抽出します">月末判定</label>
                        </div>

                        <div class="mf-filter-group">
                            <input type="checkbox" id="mf-check-day" checked>
                            <label for="mf-check-day">日付:</label>
                            <select id="mf-select-day" class="mf-select-sm" style="width: 50px;">
                                ${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${i + 1 === new Date().getDate() ? 'selected' : ''}>${i + 1}</option>`).join('')}
                            </select>
                        </div>

                        <div class="mf-filter-group">
                            <input type="checkbox" id="mf-check-month">
                            <label for="mf-check-month">特定月:</label>
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
            .mf-mode-opts { animation: fadeIn 0.1s; } /* Faster animation */
            .mf-input-date { padding: 3px 6px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px; font-family: sans-serif; } /* More compact padding */
            .mf-filter-group { display: flex; align-items: center; gap: 5px; font-size: 12px; } /* Removed border/bg for cleaner look in compact mode? Or keep? Let's keep but make smaller */
            .mf-filter-group { background: transparent; border: none; padding: 0; } /* Actually let's remove the boxy look for compactness */
            .mf-select-sm { padding: 1px 2px; border: 1px solid #ccc; border-radius: 3px; font-size: 12px; height: 22px; }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: translateY(0); } }
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

    // モード切替
    const modeRadios = document.querySelectorAll('input[name="mf-mode"]');
    const optsRelative = document.getElementById('mf-mode-relative-opts');
    const optsYear = document.getElementById('mf-mode-year-opts');
    const optsRange = document.getElementById('mf-mode-range-opts');

    modeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const val = e.target.value;
            optsRelative.style.display = val === 'relative' ? 'flex' : 'none';
            optsYear.style.display = val === 'year' ? 'flex' : 'none';
            optsRange.style.display = val === 'range' ? 'flex' : 'none';
        });
    });

    // 高度フィルタ切替
    const toggleFilter = (checkId, selectId) => {
        const chk = document.getElementById(checkId);
        const sel = document.getElementById(selectId);
        if (chk && sel) {
            chk.addEventListener('change', () => {
                sel.disabled = !chk.checked;
                updateGraph(); // 即時反映
            });
            sel.addEventListener('change', updateGraph);
        } else if (chk) {
            chk.addEventListener('change', updateGraph);
        }
    };

    toggleFilter('mf-check-day', 'mf-select-day');
    toggleFilter('mf-check-month', 'mf-select-month');
    toggleFilter('mf-check-interval', 'mf-select-interval');

    // 年選択の変更でもグラフ更新できるようにする
    yearSelect.addEventListener('change', () => {
        if (document.querySelector('input[name="mf-mode"][value="year"]').checked) {
            updateGraph();
        }
    });

    // 月末判定チェック時は日付指定を無効化する相互作用
    document.getElementById('mf-check-month-end').addEventListener('change', (e) => {
        if (e.target.checked) {
            document.getElementById('mf-check-day').checked = false;
            document.getElementById('mf-select-day').disabled = true;
        }
        updateGraph();
    });
    document.getElementById('mf-check-day').addEventListener('change', (e) => {
        if (e.target.checked) {
            document.getElementById('mf-check-month-end').checked = false;
        }
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

        // データ取得範囲の決定
        // カスタム期間や指定年の場合は、対象が含まれるように広く取る必要がある
        // 安全のため 'all' を取得する方針とする (APIキャッシュが効くため2回目以降は速い)
        if (mode === 'relative') {
            yearsToFetch = document.getElementById('mf-modal-range').value;
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

// フィルタリングロジック (大幅強化)
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
        const rangeVal = document.getElementById('mf-modal-range').value;
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
            // 終了日はその日の終わりまで含めるため調整しても良いが、単純比較でいく
            rows = rows.filter(r => r.date <= endDate);
        }
    }

    // 3. 高度フィルタ

    // (A) 月末自動判定
    // 同じ「年-月」の中で最も日付が大きいデータのみを残す
    if (document.getElementById('mf-check-month-end').checked) {
        const monthMap = new Map();
        rows.forEach(r => {
            const key = `${r.date.getFullYear()}-${r.date.getMonth()}`;
            const existing = monthMap.get(key);
            if (!existing || r.date > existing.date) {
                monthMap.set(key, r);
            }
        });
        rows = Array.from(monthMap.values());
    }
    // (B) 日付指定 (月末判定がOFFの場合のみ)
    else if (document.getElementById('mf-check-day').checked) {
        const targetDay = parseInt(document.getElementById('mf-select-day').value, 10);
        rows = rows.filter(r => r.date.getDate() === targetDay);
    }

    // (C) 特定月指定
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
        // 差分データの生成
        const diffData = [];
        // [0]は前回がないので0 or null
        diffData.push(0);

        for (let i = 1; i < rows.length; i++) {
            const currentTotal = parseInt(rows[i][1] || 0, 10);
            const prevTotal = parseInt(rows[i - 1][1] || 0, 10);
            diffData.push(currentTotal - prevTotal);
        }

        // ラベルはそのまま日付を使う

        // 色設定 (プラス: 青/緑, マイナス: 赤)
        const backgroundColors = diffData.map(val => val >= 0 ? currentTheme.color2 : '#e74c3c');
        const borderColors = diffData.map(val => val >= 0 ? currentTheme.color1 : '#c0392b');

        datasets.push({
            label: '前回比増減',
            data: diffData,
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

                    // 増減モードなら + を付ける
                    if (isDiff && value > 0) text = '+' + text;

                    const { x, y } = element.tooltipPosition();
                    const color = dataset.borderColor instanceof Array ? dataset.borderColor[index] : dataset.borderColor || '#636e72';

                    // 位置調整
                    // Bar Chartの場合はバーの上/下におく
                    let labelY = y - 12;
                    if (isDiff && value < 0) labelY = y + 12; // 下向きバーなら下に

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

                            const formattedTotal = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(totalDiff);
                            const sign = totalDiff > 0 ? '+' : '';
                            const totalText = `期間合計: ${sign}${formattedTotal}`.replace('￥', '¥');

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
                                // プラス記号付与
                                if (isDiff && val > 0) label += '+' + formatted.replace('￥', '');
                                else label += formatted;
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

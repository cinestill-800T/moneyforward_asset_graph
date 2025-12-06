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

    // データラベル表示プラグイン (データ点数が少ない場合のみ表示)
    const dataLabelPlugin = {
        id: 'dataLabelPlugin',
        afterDatasetsDraw: (chart) => {
            const { ctx, data } = chart;
            const DATA_LABEL_THRESHOLD = 20;

            // データ点数が閾値より多い場合は表示しない
            if (data.labels.length > DATA_LABEL_THRESHOLD) return;

            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 11px "Helvetica Neue", Arial, sans-serif'; // フォント少し大きく

            chart.data.datasets.forEach((dataset, i) => {
                const meta = chart.getDatasetMeta(i);
                if (meta.hidden) return;

                meta.data.forEach((element, index) => {
                    const value = dataset.data[index];
                    if (value === null || value === undefined) return;

                    // フォーマット
                    let text = '';
                    if (value >= 100000000) text = (value / 100000000).toFixed(1) + '億';
                    else if (value >= 10000) text = (value / 10000).toFixed(0) + '万';
                    else text = value.toLocaleString(); // そのまま

                    const { x, y } = element.tooltipPosition();

                    // 色設定
                    const color = dataset.borderColor || '#636e72';

                    // 位置調整 (ドットの少し上)
                    // 線と被らないように、吹き出しのように浮かせる
                    const offset = 12;
                    const labelX = x;
                    const labelY = y - offset;

                    // 白い縁取り (Halo Effect)
                    ctx.save();
                    ctx.lineJoin = 'round';
                    ctx.lineWidth = 4; // 縁取りの太さ
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'; // 少し透過させた白
                    ctx.strokeText(text, labelX, labelY);
                    ctx.restore();

                    // テキスト本体描画
                    ctx.fillStyle = color; // テーマカラーと同じ色で文字を描画
                    ctx.fillText(text, labelX, labelY);
                });
            });
            ctx.restore();
        }
    };

    globalChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        plugins: [dataLabelPlugin], // プラグイン登録
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            stacked: isStacked,
            layout: {
                padding: {
                    top: 20 // ラベルが見切れないように上部に余白追加
                }
            },
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

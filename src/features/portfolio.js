// ===========================================================================
// ポートフォリオ画面拡張 (v1.3.8) - 資産構成分析 & ヒートマップ
// ===========================================================================

export function initPortfolioEnhancement() {
    console.log('MoneyForward Enhancer: Portfolio Enhancement Started');
    createPortfolioPanel();
    hideUnwantedColumns();
}

function createPortfolioPanel() {
    const existing = document.getElementById('mf-portfolio-panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'mf-portfolio-panel';

    // 既存のスタイルを流用しつつ、右上に固定
    panel.style.position = 'fixed';
    panel.style.top = '80px';
    panel.style.right = '20px';
    panel.style.zIndex = '9999';
    panel.style.background = '#fff';
    panel.style.padding = '10px';
    panel.style.borderRadius = '8px';
    panel.style.boxShadow = '0 4px 15px rgba(0,0,0,0.15)';
    panel.style.border = '1px solid #dfe6e9';
    panel.style.display = 'flex';
    panel.style.gap = '10px';
    panel.style.alignItems = 'center';

    panel.innerHTML = `
        <div style="font-size:13px; font-weight:bold; color:#2d3436;">
            <span style="color:#009688;">●</span> ポートフォリオ分析
        </div>
        <button id="btn-show-portfolio-viz" class="mf-btn mf-btn-primary" style="padding: 6px 12px; font-size: 12px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="3" y1="9" x2="21" y2="9"></line>
                <line x1="9" y1="21" x2="9" y2="9"></line>
            </svg>
            ビジュアライザーを開く
        </button>
    `;

    document.body.appendChild(panel);

    document.getElementById('btn-show-portfolio-viz').addEventListener('click', showPortfolioModal);
}

// DOMから保有資産データを抽出する
function extractPortfolioData() {
    const data = [];

    // 1. 株式（現物）
    const stockTable = findTableBySectionName('株式（現物）');
    if (stockTable) {
        const rows = stockTable.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const name = row.children[1]?.textContent.trim(); // 銘柄名
            const currentPrice = parseAmount(row.children[4]?.textContent); // 評価額
            const profit = parseAmount(row.children[6]?.textContent); // 評価損益
            const profitPercent = parseFloat(row.children[7]?.textContent.replace('%', '')); // 評価損益率

            if (name && currentPrice !== null) {
                data.push({
                    type: 'stock',
                    name: name,
                    value: currentPrice,
                    profit: profit,
                    profitPercent: profitPercent,
                    color: null // 後で計算
                });
            }
        });
    }

    // 2. 投資信託
    const fundTable = findTableBySectionName('投資信託');
    if (fundTable) {
        const rows = fundTable.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const name = row.children[0]?.textContent.trim(); // 銘柄名
            const currentPrice = parseAmount(row.children[4]?.textContent); // 評価額
            const profit = parseAmount(row.children[6]?.textContent); // 評価損益
            const profitPercent = parseFloat(row.children[7]?.textContent.replace('%', '')); // 評価損益率

            if (name && currentPrice !== null) {
                data.push({
                    type: 'fund',
                    name: name,
                    value: currentPrice,
                    profit: profit,
                    profitPercent: profitPercent,
                    color: null
                });
            }
        });
    }

    return data.sort((a, b) => b.value - a.value); // 評価額順
}

function findTableBySectionName(name) {
    const headings = document.querySelectorAll('h1, h2, h3, .heading-title'); // マネーフォワードのDOM構造に合わせる
    for (const h of headings) {
        if (h.textContent.includes(name)) {
            let container = h.parentElement;
            while (container && container.tagName !== 'BODY') {
                const table = container.querySelector('table');
                if (table) return table;
                container = container.nextElementSibling || container.parentElement;
            }
        }
    }
    return null;
}

function parseAmount(text) {
    if (!text) return null;
    return parseInt(text.replace(/[^0-9-]/g, ''), 10);
}

function showPortfolioModal() {
    const data = extractPortfolioData();
    if (data.length === 0) {
        alert('株式・投資信託のデータが見つかりませんでした。');
        return;
    }

    // モーダル生成
    const existing = document.getElementById('mf-portfolio-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'mf-portfolio-modal';
    modal.className = 'mf-modal-overlay';

    modal.innerHTML = `
        <div class="mf-modal-content" style="width: 90%; height: 90%; max-width: 1200px; display:flex; flex-direction:column;">
            <div class="mf-modal-header">
                <div class="mf-modal-title">ポートフォリオ分析 <span style="font-size:12px; font-weight:normal; opacity:0.7;">Beta</span></div>
                <button class="mf-modal-btn mf-modal-btn-close" id="mf-portfolio-close">×</button>
            </div>
            <div class="mf-modal-body" style="flex:1; display:flex; gap:20px; padding:20px; overflow:hidden;">
                <!-- 左側: ツリーマップ（ヒートマップ） -->
                <div style="flex:2; display:flex; flex-direction:column; min-width:0;">
                    <div style="font-weight:bold; margin-bottom:10px; color:#636e72;">資産ヒートマップ (評価額 × 損益率)</div>
                    <div id="mf-treemap-container" style="flex:1; position:relative; background:#f9f9f9; border:1px solid #eee; border-radius:4px;">
                        <!-- Treemap Canvas -->
                        <canvas id="mf-treemap-canvas"></canvas>
                    </div>
                    <div style="display:flex; justify-content:center; margin-top:10px; gap:15px; font-size:11px; color:#636e72;">
                        <div style="display:flex; align-items:center; gap:5px;"><span style="width:12px; height:12px; background:#27ae60;"></span>+10%以上</div>
                        <div style="display:flex; align-items:center; gap:5px;"><span style="width:12px; height:12px; background:#a9dfbf;"></span>+0%〜</div>
                        <div style="display:flex; align-items:center; gap:5px;"><span style="width:12px; height:12px; background:#f5b7b1;"></span>-0%〜</div>
                        <div style="display:flex; align-items:center; gap:5px;"><span style="width:12px; height:12px; background:#c0392b;"></span>-10%以下</div>
                    </div>
                </div>

                <!-- 右側: 円グラフ & リスト -->
                <div style="flex:1; display:flex; flex-direction:column; min-width:300px; border-left:1px dashed #ddd; padding-left:20px;">
                    <div style="height: 40%; min-height:250px; position:relative; margin-bottom:20px;">
                        <div style="font-weight:bold; margin-bottom:10px; color:#636e72;">構成比率 (Top 10)</div>
                        <canvas id="mf-portfolio-pie"></canvas>
                    </div>
                    <div style="flex:1; overflow-y:auto; border-top:1px dashed #ddd; padding-top:10px;">
                        <div style="font-weight:bold; margin-bottom:10px; color:#636e72;">成績ランキング (損益額)</div>
                        <table class="mf-simple-table" style="width:100%; font-size:12px; border-collapse:collapse;">
                            <thead style="border-bottom:1px solid #ddd;">
                                <tr>
                                    <th style="text-align:left; padding:4px;">銘柄</th>
                                    <th style="text-align:right; padding:4px;">評価額</th>
                                    <th style="text-align:right; padding:4px;">損益</th>
                                </tr>
                            </thead>
                            <tbody id="mf-ranking-tbody"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('mf-portfolio-close').addEventListener('click', () => {
        modal.remove();
    });

    drawTreemap(data);
    drawPieChart(data);
    renderRanking(data);
}

function drawTreemap(data) {
    const container = document.getElementById('mf-treemap-container');
    container.innerHTML = '';

    const totalValue = data.reduce((sum, item) => sum + item.value, 0);
    const width = container.clientWidth;
    const height = container.clientHeight;

    let items = data.map(d => ({
        ...d,
        area: (d.value / totalValue) * (width * height)
    })).sort((a, b) => b.area - a.area);

    const rects = calculateTreemapRects(items, 0, 0, width, height);

    rects.forEach(rect => {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.left = `${rect.x}px`;
        div.style.top = `${rect.y}px`;
        div.style.width = `${rect.w}px`;
        div.style.height = `${rect.h}px`;
        div.style.border = '1px solid #fff';
        div.style.boxSizing = 'border-box';
        div.style.overflow = 'hidden';
        div.style.padding = '4px';
        div.style.display = 'flex';
        div.style.flexDirection = 'column';
        div.style.justifyContent = 'center';
        div.style.alignItems = 'center';
        div.style.color = '#fff';
        div.style.fontSize = rect.area < 5000 ? '10px' : '12px';
        div.style.textShadow = '0 1px 2px rgba(0,0,0,0.3)';
        div.style.transition = 'transform 0.2s';

        const p = rect.data.profitPercent;
        let bgColor;
        if (p >= 0) {
            const intensity = Math.min(p / 20, 1);
            bgColor = `rgba(39, 174, 96, ${0.3 + (intensity * 0.7)})`;
        } else {
            const intensity = Math.min(Math.abs(p) / 20, 1);
            bgColor = `rgba(192, 57, 43, ${0.3 + (intensity * 0.7)})`;
        }
        div.style.backgroundColor = bgColor;

        div.title = `${rect.data.name}\n評価額: ¥${rect.data.value.toLocaleString()}\n損益: ¥${rect.data.profit.toLocaleString()} (${p}%)`;

        if (rect.w > 40 && rect.h > 40) {
            div.innerHTML = `
                <div style="font-weight:bold; text-align:center; max-width:100%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${rect.data.name}</div>
                <div style="font-size:0.9em;">${p > 0 ? '+' : ''}${p}%</div>
                ${rect.h > 60 ? `<div style="font-size:0.8em; opacity:0.9;">¥${(rect.data.value / 10000).toFixed(0)}万</div>` : ''}
            `;
        }

        div.addEventListener('mouseenter', () => {
            div.style.zIndex = '10';
            div.style.transform = 'scale(1.02)';
            div.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
        });
        div.addEventListener('mouseleave', () => {
            div.style.zIndex = '1';
            div.style.transform = 'scale(1)';
            div.style.boxShadow = 'none';
        });

        container.appendChild(div);
    });
}

function calculateTreemapRects(items, x, y, w, h) {
    if (items.length === 0) return [];
    if (items.length === 1) {
        return [{ data: items[0], x, y, w, h, area: w * h }];
    }

    const total = items.reduce((s, i) => s + i.area, 0);

    let sum = 0;
    let splitIndex = 0;
    for (let i = 0; i < items.length; i++) {
        sum += items[i].area;
        if (sum >= total / 2) {
            splitIndex = i + 1;
            break;
        }
    }
    if (splitIndex >= items.length) splitIndex = items.length - 1;

    const group1 = items.slice(0, splitIndex);
    const group2 = items.slice(splitIndex);

    const sum1 = group1.reduce((s, i) => s + i.area, 0);
    const ratio = sum1 / total;

    let rects = [];

    if (w > h) {
        const w1 = w * ratio;
        rects = rects.concat(calculateTreemapRects(group1, x, y, w1, h));
        rects = rects.concat(calculateTreemapRects(group2, x + w1, y, w - w1, h));
    } else {
        const h1 = h * ratio;
        rects = rects.concat(calculateTreemapRects(group1, x, y, w, h1));
        rects = rects.concat(calculateTreemapRects(group2, x, y + h1, w, h - h1));
    }

    return rects;
}

function drawPieChart(data) {
    const ctx = document.getElementById('mf-portfolio-pie').getContext('2d');

    let displayData = data.slice(0, 10);
    const others = data.slice(10);

    if (others.length > 0) {
        const otherValue = others.reduce((s, i) => s + i.value, 0);
        displayData.push({
            name: 'その他 (' + others.length + '銘柄)',
            value: otherValue,
            profit: 0
        });
    }

    const labels = displayData.map(d => d.name);
    const values = displayData.map(d => d.value);
    const colors = [
        '#3498db', '#9b59b6', '#e74c3c', '#f1c40f', '#2ecc71',
        '#1abc9c', '#34495e', '#e67e22', '#95a5a6', '#d35400', '#bdc3c7'
    ];

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors.slice(0, displayData.length),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { boxWidth: 10, font: { size: 10 } }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.label || '';
                            if (label) label += ': ';
                            const val = context.raw;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = Math.round((val / total) * 100) + '%';
                            return label + percentage + ` (¥${val.toLocaleString()})`;
                        }
                    }
                }
            }
        }
    });
}

function renderRanking(data) {
    const tbody = document.getElementById('mf-ranking-tbody');
    const sorted = [...data].sort((a, b) => b.profit - a.profit);

    sorted.forEach(item => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #f0f0f0';

        const profitClass = item.profit >= 0 ? 'mf-plus' : 'mf-minus';
        const profitColor = item.profit >= 0 ? '#27ae60' : '#c0392b';
        const sign = item.profit >= 0 ? '+' : '';

        tr.innerHTML = `
            <td style="padding:6px 4px; max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${item.name}">
                ${item.name}
            </td>
            <td style="text-align:right; padding:6px 4px;">¥${(item.value / 10000).toFixed(1)}万</td>
            <td style="text-align:right; padding:6px 4px; color:${profitColor}; font-weight:bold;">
                ${sign}¥${item.profit.toLocaleString()}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function hideUnwantedColumns() {
    console.log('MoneyForward Enhancer: Hiding Unwanted Columns');
    const targetColumns = ['保有金融機関', '取得日', '変更', '削除'];

    const tables = document.querySelectorAll('table');
    tables.forEach(table => {
        const headers = Array.from(table.querySelectorAll('th'));
        const targetIndices = [];

        headers.forEach((th, index) => {
            if (targetColumns.includes(th.textContent.trim())) {
                targetIndices.push(index);
                th.style.display = 'none'; // ヘッダーを非表示
            }
        });

        if (targetIndices.length > 0) {
            const rows = table.querySelectorAll('tr');
            rows.forEach(row => {
                const cells = row.cells;
                targetIndices.forEach(index => {
                    if (cells.length > index) {
                        cells[index].style.display = 'none';
                    }
                });
            });
        }
    });
}

import { currentTheme, isDarkMode } from '../core/config.js';
import { fetchData, fetchMonthlyData, generateCSV, downloadCSV, formatDate, parseLocalDate } from '../api/client.js';

let globalChart = null;
let lastFetchedData = null; // グラフモーダル内でのデータ保持

// 日次モード用の状態
let isDailyMode = false;
let dailyModeYear = new Date().getFullYear();
let dailyModeMonth = new Date().getMonth() + 1; // 1-indexed
let dailyModeData = null;
let verticalGridTouched = false;

// 横方向ドラッグによる一時ズーム
const GRAPH_ZOOM_DRAG_THRESHOLD_PX = 10;
let graphZoomState = {
    active: false,
    dragging: false,
    startClientX: 0,
    startClientY: 0,
    lastClientX: 0,
    lastClientY: 0,
    pointerId: null,
    range: null,
    previewRange: null
};
let graphModalKeydownHandler = null;
let clearGraphZoomForActiveModal = null;

function resetGraphZoomState() {
    graphZoomState = {
        active: false,
        dragging: false,
        startClientX: 0,
        startClientY: 0,
        lastClientX: 0,
        lastClientY: 0,
        pointerId: null,
        range: null,
        previewRange: null
    };
}

function getGraphGranularityLabel() {
    return isDailyMode ? '日次' : '月次';
}

function formatGraphDateLabel(value) {
    const date = value instanceof Date ? value : parseLocalDate(value);
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return String(value ?? '');
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
}

function formatZoomStateLabel(range, prefix) {
    if (!range) {
        return `表示粒度: ${getGraphGranularityLabel()}`;
    }

    return `${prefix}: ${formatGraphDateLabel(range.startLabel)} - ${formatGraphDateLabel(range.endLabel)} / ${getGraphGranularityLabel()}`;
}

// ==========================================
// グラフモーダル & 内部ロジック
// ==========================================
export function showGraphModal(initialData = null) {
    resetGraphModalState();
    if (initialData) lastFetchedData = initialData;

    const existingModal = document.querySelector('.mf-modal-overlay');
    // 設定モーダルが開いている場合は閉じない
    if (existingModal && existingModal.id !== 'mf-settings-modal') {
        if (graphModalKeydownHandler) {
            document.removeEventListener('keydown', graphModalKeydownHandler);
            graphModalKeydownHandler = null;
        }
        existingModal.remove();
        clearGraphZoomForActiveModal = null;
        resetGraphModalState();
    }

    const modal = document.createElement('div');
    modal.className = 'mf-modal-overlay';
    modal.innerHTML = `
        <div class="mf-modal-content mf-graph-content">
            
            <!-- Header -->
            <div class="mf-modal-header mf-graph-header">
                <div class="mf-graph-title-group">
                    <div class="mf-modal-title">資産推移グラフ</div>
                    <div id="mf-status-msg" class="mf-status-pill"></div>
                    <div id="mf-zoom-state" class="mf-status-pill mf-zoom-state" style="display:none;"></div>
                </div>
                <div class="mf-graph-actions">
                    <button class="mf-modal-btn mf-modal-btn-primary" id="mf-modal-fetch">再取得・描画</button>
                    <button type="button" class="mf-modal-btn mf-modal-btn-close mf-small-action mf-zoom-reset-btn" id="mf-zoom-reset-btn" style="display:none;">ズーム解除</button>
                    <button class="mf-modal-btn mf-modal-btn-close mf-icon-button" id="mf-modal-close" aria-label="グラフを閉じる">×</button>
                </div>
            </div>

            <!-- Controls Area (Simplified) -->
            <div class="mf-graph-controls">
                
                <!-- Row 1: Quick Period Buttons -->
                <div class="mf-control-row">
                    <div class="mf-control-label">期間</div>
                    
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
                    <div id="mf-daily-nav" class="mf-daily-nav" style="display: none;">
                        <select id="mf-daily-year" class="mf-select-modern mf-compact-select"></select>
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
                <div id="mf-advanced-period-panel" class="mf-advanced-panel" style="display: none;">
                    <div class="mf-advanced-grid">
                        <label class="mf-radio-label"><input type="radio" name="mf-mode" value="relative" checked> クイック期間</label>
                        <label class="mf-radio-label"><input type="radio" name="mf-mode" value="year"> 指定年</label>
                        <label class="mf-radio-label"><input type="radio" name="mf-mode" value="range"> 期間指定</label>
                        
                        <div class="mf-inline-divider"></div>
                        
                        <div id="mf-mode-year-opts" class="mf-mode-opts mf-inline-options" style="display: none;">
                            <select id="mf-select-year" class="mf-select mf-select-short"></select>
                            <span>年のデータ</span>
                        </div>
                        <div id="mf-mode-range-opts" class="mf-mode-opts mf-inline-options" style="display: none;">
                            <input type="date" id="mf-input-start" class="mf-input-date">
                            <span>〜</span>
                            <input type="date" id="mf-input-end" class="mf-input-date">
                        </div>
                    </div>
                </div>
                
                <!-- Row 2: Extraction (Simplified - day select only) -->
                <div id="mf-extraction-row" class="mf-control-row">
                    <div class="mf-control-label">抽出</div>
                    
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
            <div class="mf-modal-body mf-graph-body">
                <div id="mf-modal-loading" class="mf-loading-overlay" style="display:none;">
                    <div class="mf-loading-text">データ取得中...</div>
                    <div class="mf-loading-track"><div id="mf-modal-progress" class="mf-loading-progress" style="width:0%;"></div></div>
                </div>
                <div class="mf-chart-stage">
                    <canvas id="mf-chart"></canvas>
                    <div id="mf-zoom-selection-layer" class="mf-zoom-selection-layer" aria-hidden="true" style="display:none; position:absolute; inset:0; pointer-events:none;"></div>
                    <div id="mf-no-data-msg" class="mf-empty-state" style="display:none;">
                        <p>表示できるデータがありません。<br>条件を変更して「再取得・描画」を押してください。</p>
                    </div>
                </div>
                <!-- Summary Table Area -->
                <div id="mf-summary-area" class="mf-summary-area" style="display:none;"></div>
            </div>

            <!-- Footer -->
            <div class="mf-modal-footer mf-graph-footer">
                <div class="mf-footer-options">
                    <label class="mf-check-label">
                        <input type="checkbox" id="mf-chart-stack-check">
                        積み上げ
                    </label>
                    <label class="mf-check-label">
                        <input type="checkbox" id="mf-chart-diff-check">
                        増減表示
                    </label>
                    <label class="mf-check-label">
                        <input type="checkbox" id="mf-chart-vertical-grid-check">
                        縦グリッド
                    </label>
                    <div class="mf-footer-divider"></div>
                    <label class="mf-check-label">
                        <input type="checkbox" id="mf-chart-ma-check">
                        移動平均
                    </label>
                    <select id="mf-ma-period" class="mf-select-modern mf-mini-select" disabled>
                        <option value="3">3ヶ月</option>
                        <option value="6">6ヶ月</option>
                        <option value="12" selected>12ヶ月</option>
                    </select>
                    <div class="mf-footer-divider"></div>
                    <button class="mf-modal-btn mf-modal-btn-close mf-small-action" id="mf-toggle-summary">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
                        </svg>
                        サマリー
                    </button>
                </div>
                <button class="mf-modal-btn mf-modal-btn-close mf-small-action" id="mf-download-csv">CSV保存</button>
                <button class="mf-modal-btn mf-modal-btn-close mf-small-action" id="mf-copy-data">CSVコピー</button>
                <button class="mf-modal-btn mf-modal-btn-copy mf-small-action" id="mf-copy-image">画像コピー</button>
            </div>
        </div>

    `;
    document.body.appendChild(modal);
    const zoomAnnouncer = document.createElement('div');
    zoomAnnouncer.id = 'mf-zoom-announcer';
    zoomAnnouncer.setAttribute('aria-live', 'polite');
    zoomAnnouncer.setAttribute('aria-atomic', 'true');
    zoomAnnouncer.style.position = 'absolute';
    zoomAnnouncer.style.left = '-9999px';
    zoomAnnouncer.style.width = '1px';
    zoomAnnouncer.style.height = '1px';
    zoomAnnouncer.style.overflow = 'hidden';
    modal.appendChild(zoomAnnouncer);

    const zoomResetBtn = document.getElementById('mf-zoom-reset-btn');
    const zoomStateBadge = document.getElementById('mf-zoom-state');
    const chartCanvas = document.getElementById('mf-chart');
    const chartStage = document.querySelector('.mf-chart-stage');
    const zoomSelectionLayer = document.getElementById('mf-zoom-selection-layer');

    if (chartStage && chartStage.style.position !== 'relative') {
        chartStage.style.position = 'relative';
    }

    const zoomSelectionBox = document.createElement('div');
    zoomSelectionBox.className = 'mf-zoom-selection';
    zoomSelectionBox.style.position = 'absolute';
    zoomSelectionBox.style.top = '0';
    zoomSelectionBox.style.height = '0';
    zoomSelectionBox.style.display = 'none';
    zoomSelectionBox.style.boxSizing = 'border-box';
    zoomSelectionBox.style.zIndex = '2';

    const zoomSelectionLabel = document.createElement('div');
    zoomSelectionLabel.className = 'mf-zoom-selection-label';
    zoomSelectionLabel.style.position = 'absolute';
    zoomSelectionLabel.style.top = '8px';
    zoomSelectionLabel.style.transform = 'translateX(-50%)';
    zoomSelectionLabel.style.padding = '4px 8px';
    zoomSelectionLabel.style.borderRadius = '999px';
    zoomSelectionLabel.style.background = 'hsl(220 14% 13% / 0.92)';
    zoomSelectionLabel.style.color = 'hsl(220 24% 96%)';
    zoomSelectionLabel.style.fontSize = '11px';
    zoomSelectionLabel.style.lineHeight = '1.2';
    zoomSelectionLabel.style.fontWeight = '600';
    zoomSelectionLabel.style.whiteSpace = 'nowrap';
    zoomSelectionLabel.style.maxWidth = 'calc(100% - 16px)';
    zoomSelectionLabel.style.overflow = 'hidden';
    zoomSelectionLabel.style.textOverflow = 'ellipsis';
    zoomSelectionLabel.style.display = 'none';
    zoomSelectionLabel.style.zIndex = '3';

    zoomSelectionLayer?.appendChild(zoomSelectionBox);
    zoomSelectionLayer?.appendChild(zoomSelectionLabel);

    function announceZoomState(message) {
        if (!zoomAnnouncer) return;
        zoomAnnouncer.textContent = message;
    }

    function updateZoomSelectionOverlay() {
        if (!zoomSelectionLayer || !zoomSelectionBox || !zoomSelectionLabel || !chartCanvas || !chartStage) return;

        const previewRange = graphZoomState.dragging ? graphZoomState.previewRange : null;
        if (!previewRange) {
            zoomSelectionLayer.style.display = 'none';
            zoomSelectionBox.style.display = 'none';
            zoomSelectionLabel.style.display = 'none';
            return;
        }

        const stageRect = chartStage.getBoundingClientRect();
        const canvasRect = chartCanvas.getBoundingClientRect();
        const rawLeft = Math.min(graphZoomState.startClientX, graphZoomState.lastClientX);
        const rawRight = Math.max(graphZoomState.startClientX, graphZoomState.lastClientX);
        const left = Math.max(0, Math.min(stageRect.width, rawLeft - stageRect.left));
        const right = Math.max(0, Math.min(stageRect.width, rawRight - stageRect.left));
        const top = Math.max(0, canvasRect.top - stageRect.top);
        const height = Math.max(0, canvasRect.height);
        const width = Math.max(2, right - left);
        const clampedCenter = Math.min(stageRect.width - 8, Math.max(8, left + width / 2));

        zoomSelectionLayer.style.display = 'block';
        zoomSelectionBox.style.display = 'block';
        zoomSelectionLabel.style.display = 'block';
        zoomSelectionBox.style.left = `${left}px`;
        zoomSelectionBox.style.top = `${top}px`;
        zoomSelectionBox.style.width = `${width}px`;
        zoomSelectionBox.style.height = `${height}px`;
        zoomSelectionLabel.style.left = `${clampedCenter}px`;
        zoomSelectionLabel.style.top = `${Math.max(8, top + 8)}px`;
        zoomSelectionLabel.textContent = formatZoomStateLabel(previewRange, '選択中');
    }

    function syncZoomControls() {
        const active = graphZoomState.active && !!graphZoomState.range;
        const previewing = graphZoomState.dragging && !!graphZoomState.previewRange;
        if (zoomResetBtn) zoomResetBtn.style.display = active ? 'inline-flex' : 'none';
        if (zoomStateBadge) {
            zoomStateBadge.style.display = 'inline-flex';
            zoomStateBadge.textContent = previewing
                ? formatZoomStateLabel(graphZoomState.previewRange, '選択中')
                : active
                    ? formatZoomStateLabel(graphZoomState.range, 'ズーム中')
                    : formatZoomStateLabel(null);
        }
        if (modal) modal.classList.toggle('mf-graph-zoom-active', active);
        if (chartCanvas) chartCanvas.classList.toggle('mf-graph-zoom-active', active);
        updateZoomSelectionOverlay();
    }

    function applyChartZoomRange(range) {
        if (!globalChart || !range) return;
        const xScaleOptions = globalChart.options?.scales?.x;
        if (!xScaleOptions) return;
        xScaleOptions.min = range.startIndex;
        xScaleOptions.max = range.endIndex;
        globalChart.update('none');
    }

    function clearGraphZoom(shouldUpdateChart = true) {
        graphZoomState = {
            active: false,
            dragging: false,
            startClientX: 0,
            startClientY: 0,
            lastClientX: 0,
            lastClientY: 0,
            pointerId: null,
            range: null,
            previewRange: null
        };
        if (shouldUpdateChart && globalChart) {
            const xScaleOptions = globalChart.options?.scales?.x;
            if (xScaleOptions) {
                xScaleOptions.min = undefined;
                xScaleOptions.max = undefined;
                globalChart.update('none');
            }
        }
        syncZoomControls();
    }
    clearGraphZoomForActiveModal = clearGraphZoom;

    function zoomToRange(range) {
        if (!range || !globalChart) return;
        graphZoomState.active = true;
        graphZoomState.dragging = false;
        graphZoomState.range = range;
        graphZoomState.previewRange = null;
        applyChartZoomRange(range);
        syncZoomControls();
        announceZoomState(formatZoomStateLabel(range, 'ズーム中'));
    }

    function getChartZoomRangeFromPixels(startX, endX, allowSinglePoint = false) {
        if (!globalChart || !globalChart.scales || !globalChart.scales.x) return null;

        const xScale = globalChart.scales.x;
        const labels = globalChart.data?.labels || [];
        if (labels.length < 2) return null;

        const chartArea = globalChart.chartArea;
        if (!chartArea || chartArea.right <= chartArea.left) return null;

        const canvasRect = chartCanvas?.getBoundingClientRect();
        const pixelRatio = canvasRect && canvasRect.width > 0 ? (globalChart.width / canvasRect.width) : 1;
        const startPixel = Math.min(Math.max((startX - (canvasRect?.left || 0)) * pixelRatio, chartArea.left), chartArea.right);
        const endPixel = Math.min(Math.max((endX - (canvasRect?.left || 0)) * pixelRatio, chartArea.left), chartArea.right);
        const startValue = xScale.getValueForPixel(startPixel);
        const endValue = xScale.getValueForPixel(endPixel);
        const startIndex = Math.max(0, Math.min(labels.length - 1, Math.round(Number(startValue))));
        const endIndex = Math.max(0, Math.min(labels.length - 1, Math.round(Number(endValue))));
        const minIndex = Math.min(startIndex, endIndex);
        const maxIndex = Math.max(startIndex, endIndex);

        if (!allowSinglePoint && maxIndex - minIndex < 1) return null;

        return {
            startIndex: minIndex,
            endIndex: maxIndex,
            startLabel: labels[minIndex],
            endLabel: labels[maxIndex]
        };
    }

    function initializeGraphZoomInteractions() {
        if (!chartCanvas || chartCanvas.dataset.zoomListenersAttached === '1') return;
        chartCanvas.dataset.zoomListenersAttached = '1';

        chartCanvas.addEventListener('pointerdown', (event) => {
            if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
            if (typeof event.button === 'number' && event.button !== 0) return;
            if (!globalChart || !globalChart.scales || !globalChart.scales.x) return;

            graphZoomState.dragging = false;
            graphZoomState.previewRange = null;
            graphZoomState.pointerId = event.pointerId;
            graphZoomState.startClientX = event.clientX;
            graphZoomState.startClientY = event.clientY;
            graphZoomState.lastClientX = event.clientX;
            graphZoomState.lastClientY = event.clientY;

            try {
                chartCanvas.setPointerCapture(event.pointerId);
            } catch (_) {
                // pointer capture が使えない環境ではそのまま継続する
            }
        });

        chartCanvas.addEventListener('pointermove', (event) => {
            if (graphZoomState.pointerId !== event.pointerId) return;
            if (!globalChart || !globalChart.scales || !globalChart.scales.x) return;

            graphZoomState.lastClientX = event.clientX;
            graphZoomState.lastClientY = event.clientY;

            const dx = event.clientX - graphZoomState.startClientX;
            const dy = event.clientY - graphZoomState.startClientY;
            if (!graphZoomState.dragging) {
                if (Math.abs(dx) < GRAPH_ZOOM_DRAG_THRESHOLD_PX) return;
                if (Math.abs(dx) < Math.abs(dy)) return;
                graphZoomState.dragging = true;
                chartCanvas.classList.add('mf-graph-zoom-dragging');
                graphZoomState.previewRange = getChartZoomRangeFromPixels(graphZoomState.startClientX, event.clientX, true);
                syncZoomControls();
                announceZoomState(formatZoomStateLabel(graphZoomState.previewRange, '選択中'));
                event.preventDefault();
                return;
            }

            graphZoomState.previewRange = getChartZoomRangeFromPixels(graphZoomState.startClientX, event.clientX, true);
            syncZoomControls();
            event.preventDefault();
        });

        const finishDrag = (event, cancelled = false) => {
            if (graphZoomState.pointerId !== event.pointerId) return;

            const dx = event.clientX - graphZoomState.startClientX;
            const dy = event.clientY - graphZoomState.startClientY;
            const wasDragging = graphZoomState.dragging || Math.abs(dx) >= GRAPH_ZOOM_DRAG_THRESHOLD_PX || Math.abs(dy) >= GRAPH_ZOOM_DRAG_THRESHOLD_PX;

            try {
                chartCanvas.releasePointerCapture(event.pointerId);
            } catch (_) {
                // ignore
            }

            chartCanvas.classList.remove('mf-graph-zoom-dragging');

            if (!cancelled && wasDragging) {
                const range = getChartZoomRangeFromPixels(graphZoomState.startClientX, event.clientX);
                if (range) {
                    zoomToRange(range);
                    showGraphNotice(`横ズーム適用: ${range.startLabel} 〜 ${range.endLabel}`, 'success');
                }
            }

            graphZoomState.dragging = false;
            graphZoomState.pointerId = null;
            graphZoomState.startClientX = 0;
            graphZoomState.startClientY = 0;
            graphZoomState.lastClientX = 0;
            graphZoomState.lastClientY = 0;
            graphZoomState.previewRange = null;

            if (!graphZoomState.active) syncZoomControls();
        };

        chartCanvas.addEventListener('pointerup', (event) => finishDrag(event, false));
        chartCanvas.addEventListener('pointercancel', (event) => finishDrag(event, true));
        chartCanvas.addEventListener('pointerleave', (event) => {
            if (graphZoomState.pointerId === event.pointerId && graphZoomState.dragging) {
                finishDrag(event, false);
            }
        });
    }

    function handleDocumentKeyDown(event) {
        if (!modal.isConnected) return;
        if (event.key === 'Escape' && graphZoomState.active) {
            clearGraphZoom(true);
            announceZoomState(formatZoomStateLabel(null));
            showGraphNotice('ズームを解除しました', 'success');
        }
    }

    // イベント設定
    document.getElementById('mf-modal-close').addEventListener('click', () => {
        if (graphModalKeydownHandler) {
            document.removeEventListener('keydown', graphModalKeydownHandler);
            graphModalKeydownHandler = null;
        }
        modal.remove();
        clearGraphZoomForActiveModal = null;
        resetGraphModalState();
    });

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
            clearGraphZoom(false);
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
            clearGraphZoom(false);
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
        clearGraphZoom(false);
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
    const verticalGridCheck = document.getElementById('mf-chart-vertical-grid-check');

    if (verticalGridCheck) {
        verticalGridCheck.checked = false;
    }

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
        clearGraphZoom(false);
        dailyBtn.classList.add('active');
        periodGroup.style.display = 'none';
        dailyNav.style.display = 'flex';
        predictionBtn.classList.remove('active');
        if (extractionRow) extractionRow.style.display = 'none';
        advPeriodToggle.style.display = 'none';
        advPeriodPanel.style.display = 'none';
        if (verticalGridCheck && !verticalGridTouched) {
            verticalGridCheck.checked = true;
        }
        updateDailyButtons();
        loadDailyData();
    }

    function exitDailyMode() {
        isDailyMode = false;
        clearGraphZoom(false);
        dailyModeData = null;
        dailyBtn.classList.remove('active');
        periodGroup.style.display = 'flex';
        dailyNav.style.display = 'none';
        if (extractionRow) extractionRow.style.display = 'flex';
        advPeriodToggle.style.display = 'flex';
        if (verticalGridCheck && !verticalGridTouched) {
            verticalGridCheck.checked = false;
        }
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
            clearGraphZoom(false);
            dailyModeMonth = parseInt(btn.dataset.month, 10);
            updateDailyButtons();
            loadDailyData();
        });
    });

    // 年セレクト変更
    dailyYearSelect.addEventListener('change', () => {
        clearGraphZoom(false);
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
        clearGraphZoom(true);
        const isOpen = advPeriodPanel.style.display !== 'none';
        advPeriodPanel.style.display = isOpen ? 'none' : 'block';
        advPeriodToggle.classList.toggle('active', !isOpen);
    });

    // 日付選択の変更でグラフ更新
    const daySelect = document.getElementById('mf-select-day');
    daySelect.addEventListener('change', () => {
        clearGraphZoom(false);
        updateGraph();
    });

    if (verticalGridCheck) {
        verticalGridCheck.addEventListener('change', () => {
            verticalGridTouched = true;
            clearGraphZoom(false);
            updateGraph();
        });
    }

    const fetchBtn = document.getElementById('mf-modal-fetch');
    const statusMsg = document.getElementById('mf-status-msg');

    fetchBtn.addEventListener('click', async () => {
        clearGraphZoom(false);
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
    document.getElementById('mf-chart-stack-check').addEventListener('change', () => {
        clearGraphZoom(false);
        updateGraph();
    });

    // 増減モード：予測・移動平均とは排他的
    const diffCheck = document.getElementById('mf-chart-diff-check');
    diffCheck.addEventListener('change', () => {
        clearGraphZoom(false);
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
        clearGraphZoom(false);
        maPeriodSelect.disabled = !maCheck.checked;
        if (maCheck.checked) {
            document.getElementById('mf-chart-diff-check').checked = false;
        }
        updateGraph();
    });
    maPeriodSelect.addEventListener('change', () => {
        clearGraphZoom(false);
        updateGraph();
    });

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
    zoomResetBtn?.addEventListener('click', () => {
        clearGraphZoom(true);
        announceZoomState(formatZoomStateLabel(null));
        showGraphNotice('ズームを解除しました', 'success');
    });
    if (graphModalKeydownHandler) {
        document.removeEventListener('keydown', graphModalKeydownHandler);
    }
    graphModalKeydownHandler = handleDocumentKeyDown;
    document.addEventListener('keydown', graphModalKeydownHandler);

    document.getElementById('mf-download-csv').addEventListener('click', () => {
        const currentData = isDailyMode ? dailyModeData : lastFetchedData;
        if (!globalChart || !currentData) return;
        const filteredRows = getFilteredRows();
        if (!filteredRows || filteredRows.length === 0) {
            showGraphNotice('データがありません', 'error');
            return;
        }
        const csvRows = [...filteredRows].reverse();
        const finalCsv = generateCSV([currentData.headers, ...csvRows]);
        downloadCSV(finalCsv, `moneyforward_graph_data_${formatDate(new Date())}.csv`);
    });

    if (lastFetchedData) {
        updateGraph();
    } else {
        document.getElementById('mf-no-data-msg').style.display = 'block';
    }

    initializeGraphZoomInteractions();
    syncZoomControls();
}

// ==========================================
// フィルタリングロジック
// ==========================================
function resetGraphModalState() {
    resetGraphZoomState();
    clearGraphZoomForActiveModal = null;
    if (globalChart) {
        globalChart.destroy();
        globalChart = null;
    }
    const now = new Date();
    isDailyMode = false;
    dailyModeYear = now.getFullYear();
    dailyModeMonth = now.getMonth() + 1;
    dailyModeData = null;
    verticalGridTouched = false;
}

function showGraphNotice(message, type = 'info') {
    const statusMsg = document.getElementById('mf-status-msg');
    if (!statusMsg) return;
    statusMsg.textContent = message;
    if (type === 'error') {
        statusMsg.style.color = 'hsl(356 82% 64%)';
    } else if (type === 'success') {
        statusMsg.style.color = 'hsl(156 72% 52%)';
    } else {
        statusMsg.style.color = 'var(--mf-text-sub)';
    }
}

function getFilteredRows() {
    // 日次モードの場合
    if (isDailyMode && dailyModeData) {
        const rows = dailyModeData.rows.map(r => ({
            date: parseLocalDate(r[0]),
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
        date: parseLocalDate(r[0]),
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
    if (clearGraphZoomForActiveModal) clearGraphZoomForActiveModal(false);
    document.getElementById('mf-no-data-msg').style.display = 'none';

    const rows = getFilteredRows();

    if (rows.length === 0) {
        if (globalChart) globalChart.destroy();
        document.getElementById('mf-no-data-msg').style.display = 'block';
        showGraphNotice('指定条件に一致するデータがありません', 'error');
        return;
    }

    const headers = isDailyMode ? dailyModeData.headers : lastFetchedData.headers;
    const labels = isDailyMode
        ? rows.map(r => {
            const d = parseLocalDate(r[0]);
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
function colorToRgbObj(color) {
    const hexMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color || '');
    if (hexMatch) {
        return {
            r: parseInt(hexMatch[1], 16),
            g: parseInt(hexMatch[2], 16),
            b: parseInt(hexMatch[3], 16)
        };
    }

    const hslMatch = /^hsl\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i.exec(color || '');
    if (!hslMatch) return { r: 128, g: 161, b: 186 };

    const h = (Number(hslMatch[1]) % 360) / 360;
    const s = Number(hslMatch[2]) / 100;
    const l = Number(hslMatch[3]) / 100;

    if (s === 0) {
        const value = Math.round(l * 255);
        return { r: value, g: value, b: value };
    }

    const hueToRgb = (p, q, t) => {
        let normalized = t;
        if (normalized < 0) normalized += 1;
        if (normalized > 1) normalized -= 1;
        if (normalized < 1 / 6) return p + (q - p) * 6 * normalized;
        if (normalized < 1 / 2) return q;
        if (normalized < 2 / 3) return p + (q - p) * (2 / 3 - normalized) * 6;
        return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return {
        r: Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
        g: Math.round(hueToRgb(p, q, h) * 255),
        b: Math.round(hueToRgb(p, q, h - 1 / 3) * 255)
    };
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
    const textColor = dark ? 'hsl(218 18% 74%)' : 'hsl(222 17% 34%)';
    const gridColor = dark ? 'hsl(220 14% 96% / 0.12)' : 'hsl(218 22% 78% / 0.72)';
    const haloColor = dark ? 'hsl(220 14% 8% / 0.84)' : 'hsl(220 36% 98% / 0.84)';

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

        const backgroundColors = diffData.map(val => val >= 0 ? currentTheme.color2 : 'hsl(356 82% 64%)');
        const borderColors = diffData.map(val => val >= 0 ? currentTheme.color1 : 'hsl(356 74% 52%)');

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
        const extraColors = ['hsl(44 42% 62%)', 'hsl(22 28% 50%)', 'hsl(187 28% 50%)', 'hsl(38 42% 74%)'];
        const palette = [...themeColors, ...extraColors];

        for (let i = 2; i < headers.length; i++) {
            if (headers[i] === '詳細') continue;

            const baseColor = palette[(i - 2) % palette.length];
            const rgb = colorToRgbObj(baseColor);
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
                borderColor: dark ? 'hsl(44 96% 62%)' : 'hsl(15 76% 58%)',
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
        const rgb = colorToRgbObj(currentTheme.color1);
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
                borderColor: dark ? 'hsl(44 96% 62%)' : 'hsl(15 76% 58%)',
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
            const firstDate = parseLocalDate(rows[0][0]);
            const lastDate = parseLocalDate(rows[rows.length - 1][0]);
            const firstVal = parseInt(rows[0][1] || 0, 10);
            const lastVal = parseInt(rows[rows.length - 1][1] || 0, 10);

            const yearsDiff = (lastDate - firstDate) / (1000 * 60 * 60 * 24 * 365.25);
            const cagr = yearsDiff > 0 && firstVal > 0 ? Math.pow(lastVal / firstVal, 1 / yearsDiff) - 1 : 0;

            // 5年分（60ヶ月）の予測データを生成
            const predictionMonths = 60;

            // 3シナリオ用のCAGR
            const scenarios = [
                { name: '楽観', factor: 1.5, color: 'hsl(156 72% 52%)', dashStyle: [6, 3] },
                { name: '中立', factor: 1.0, color: 'hsl(44 96% 62%)', dashStyle: [8, 4] },
                { name: '悲観', factor: 0.5, color: 'hsl(356 82% 64%)', dashStyle: [4, 4] }
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

                const predictionRgb = colorToRgbObj(scenario.color);
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
            ctx.font = '600 11px "Plus Jakarta Sans", "Noto Sans JP", sans-serif';

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
                    backgroundColor: dark ? 'hsl(220 14% 13% / 0.96)' : currentTheme.color1,
                    titleColor: dark ? 'hsl(220 24% 94%)' : currentTheme.color4,
                    bodyColor: 'hsl(220 24% 96%)',
                    borderColor: dark ? 'hsl(220 14% 96% / 0.12)' : 'transparent',
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
                    grid: { display: document.getElementById('mf-chart-vertical-grid-check')?.checked || false },
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
        const date = parseLocalDate(r[0]);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const existing = monthMap.get(key);
        if (!existing || date > parseLocalDate(existing.raw[0])) {
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
        const date = parseLocalDate(r[0]);
        const year = date.getFullYear();
        const existing = yearMap.get(year);
        if (!existing || date > parseLocalDate(existing.raw[0])) {
            yearMap.set(year, { year, total: parseInt(r[1] || 0, 10), raw: r });
        }
    });

    // 各年の最初のデータも取得（年間増減用）
    const yearStartMap = new Map();
    rows.forEach(r => {
        const date = parseLocalDate(r[0]);
        const year = date.getFullYear();
        const existing = yearStartMap.get(year);
        if (!existing || date < parseLocalDate(existing[0])) {
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
    tempCtx.fillStyle = isDarkMode ? 'hsl(220 14% 8%)' : 'hsl(220 36% 98%)';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    tempCtx.drawImage(canvas, 0, 0);

    tempCanvas.toBlob(blob => {
        const item = new ClipboardItem({ 'image/png': blob });
        navigator.clipboard.write([item])
            .then(() => showGraphNotice('画像をコピーしました', 'success'))
            .catch(() => showGraphNotice('画像のコピーに失敗しました', 'error'));
    });
}

function copyGraphData() {
    const currentData = isDailyMode ? dailyModeData : lastFetchedData;
    if (!currentData) return;
    const filteredRows = getFilteredRows().reverse();
    if (filteredRows.length === 0) {
        showGraphNotice('データがありません', 'error');
        return;
    }
    const headers = currentData.headers.join('\t');
    const body = filteredRows.map(row => row.join('\t')).join('\n');
    navigator.clipboard.writeText(`${headers}\n${body}`)
        .then(() => showGraphNotice('データをコピーしました', 'success'))
        .catch(() => showGraphNotice('データのコピーに失敗しました', 'error'));
}

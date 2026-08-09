import { currentTheme, isDarkMode } from '../core/config.js';
import { fetchData, fetchMonthlyData, fetchYearData, generateCSV, downloadCSV, formatDate, parseLocalDate } from '../api/client.js';

let globalChart = null;
let lastFetchedData = null; // グラフモーダル内でのデータ保持

// 日次モード用の状態
let isDailyMode = false;
let dailyModeYear = new Date().getFullYear();
let dailyModeMonth = new Date().getMonth() + 1; // 1-indexed
let dailyModeData = null;
let dailyComparisonData = null;
let dailyLoadGeneration = 0;
let isMonthlyMode = false;
let monthlyModeYear = new Date().getFullYear();
let monthlyModeData = null;
let monthlyComparisonData = null;
let monthlyLoadGeneration = 0;
let rollingComparisonLoadGeneration = 0;

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

            <!-- Controls Area -->
            <div class="mf-graph-controls">

                <!-- Row 1: Display mode -->
                <div class="mf-control-row">
                    <div class="mf-control-label">表示方法</div>
                    <div class="mf-display-mode-group" role="group" aria-label="表示方法">
                        <button type="button" class="mf-display-mode-btn active" data-display-mode="quick" aria-controls="mf-quick-mode-panel" aria-pressed="true">クイック</button>
                        <button type="button" id="mf-monthly-btn" class="mf-display-mode-btn" data-display-mode="monthly" aria-controls="mf-monthly-mode-panel" aria-pressed="false">月次</button>
                        <button type="button" id="mf-daily-btn" class="mf-display-mode-btn" data-display-mode="daily" aria-controls="mf-daily-mode-panel" aria-pressed="false">日次</button>
                    </div>
                </div>

                <!-- Row 2: Contextual options -->
                <div class="mf-control-row mf-mode-context-row">
                    <div class="mf-control-label" id="mf-mode-context-label">期間</div>
                    <div class="mf-mode-context">
                        <div class="mf-mode-context-panel" id="mf-quick-mode-panel" data-mode-panel="quick">
                            <div class="mf-quick-period-group" id="mf-period-group" role="group" aria-label="クイック期間">
                                <button type="button" class="mf-quick-btn active" data-period="1" aria-pressed="true">1年</button>
                                <button type="button" class="mf-quick-btn" data-period="3" aria-pressed="false">3年</button>
                                <button type="button" class="mf-quick-btn" data-period="5" aria-pressed="false">5年</button>
                                <button type="button" class="mf-quick-btn" data-period="10" aria-pressed="false">10年</button>
                                <button type="button" class="mf-quick-btn" data-period="all" aria-pressed="false">全期間</button>
                            </div>
                        </div>

                        <div class="mf-mode-context-panel" id="mf-monthly-mode-panel" data-mode-panel="monthly" hidden>
                            <div class="mf-mode-opts mf-inline-options">
                                <label for="mf-monthly-year">対象年</label>
                                <select id="mf-monthly-year" class="mf-select mf-select-short"></select>
                                <span class="mf-filter-hint mf-monthly-mode-hint">選択年の1月〜12月から、抽出日ごとに表示します</span>
                            </div>
                        </div>

                        <div class="mf-mode-context-panel" id="mf-daily-mode-panel" data-mode-panel="daily" hidden>
                            <div id="mf-daily-nav" class="mf-daily-nav">
                                <label for="mf-daily-year">対象年</label>
                                <select id="mf-daily-year" class="mf-select-modern mf-compact-select"></select>
                                <div class="mf-quick-period-group" id="mf-daily-month-group" role="group" aria-label="対象月">
                                    ${Array.from({ length: 12 }, (_, i) => `<button type="button" class="mf-daily-month-btn" data-month="${i + 1}" aria-pressed="false">${i + 1}月</button>`).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Row 3: Extraction -->
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
            </div>

            <!-- Footer -->
            <div class="mf-modal-footer mf-graph-footer">
                <div class="mf-footer-options">
                    <label class="mf-check-label">
                        <input type="checkbox" id="mf-chart-ma-check">
                        移動平均
                    </label>
                    <select id="mf-ma-period" class="mf-select-modern mf-mini-select" disabled>
                        <option value="3">3ヶ月</option>
                        <option value="6">6ヶ月</option>
                        <option value="12" selected>12ヶ月</option>
                    </select>
                    <label class="mf-check-label" id="mf-year-compare-label" aria-disabled="true" title="クイック1年、月次、日次で前年と比較">
                        <input type="checkbox" id="mf-chart-year-compare-check" disabled>
                        <span>前年比較</span>
                    </label>
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

        zoomSelectionLayer.style.display = 'block';
        zoomSelectionBox.style.display = 'block';
        zoomSelectionLabel.style.display = 'none';
        zoomSelectionBox.style.left = `${left}px`;
        zoomSelectionBox.style.top = `${top}px`;
        zoomSelectionBox.style.width = `${width}px`;
        zoomSelectionBox.style.height = `${height}px`;
        zoomSelectionLabel.textContent = '';
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

    // 表示方法と配下の条件
    const displayModeBtns = document.querySelectorAll('[data-display-mode]');
    const quickPeriodBtns = document.querySelectorAll('[data-period]');
    const quickModePanel = document.getElementById('mf-quick-mode-panel');
    const monthlyModePanel = document.getElementById('mf-monthly-mode-panel');
    const dailyModePanel = document.getElementById('mf-daily-mode-panel');
    const modeContextLabel = document.getElementById('mf-mode-context-label');

    // ==========================================
    // 月次・日次モード
    // ==========================================
    const monthlyYearSelect = document.getElementById('mf-monthly-year');
    const extractionRow = document.getElementById('mf-extraction-row');
    const dailyYearSelect = document.getElementById('mf-daily-year');
    const dailyMonthBtns = document.querySelectorAll('.mf-daily-month-btn');
    const daySelect = document.getElementById('mf-select-day');
    const yearCompareCheck = document.getElementById('mf-chart-year-compare-check');
    const yearCompareLabel = document.getElementById('mf-year-compare-label');
    const fetchBtn = document.getElementById('mf-modal-fetch');
    let dailyDataLoading = false;
    let monthlyDataLoading = false;
    let rollingComparisonLoading = false;
    let standardDataLoading = false;

    // 年セレクト生成
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= 2000; y--) {
        [monthlyYearSelect, dailyYearSelect].forEach(select => {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = `${y}年`;
            select.appendChild(opt);
        });
    }
    monthlyYearSelect.value = monthlyModeYear;
    dailyYearSelect.value = dailyModeYear;

    function isRollingYearMode() {
        if (isDailyMode || isMonthlyMode) return false;
        const displayMode = document.querySelector('[data-display-mode].active')?.dataset.displayMode;
        const activePeriod = document.querySelector('[data-period].active')?.dataset.period;
        return displayMode === 'quick' && activePeriod === '1';
    }

    function setDisplayModeUI(mode) {
        displayModeBtns.forEach(btn => {
            const selected = btn.dataset.displayMode === mode;
            btn.classList.toggle('active', selected);
            btn.setAttribute('aria-pressed', String(selected));
        });
        quickModePanel.hidden = mode !== 'quick';
        monthlyModePanel.hidden = mode !== 'monthly';
        dailyModePanel.hidden = mode !== 'daily';
        modeContextLabel.textContent = mode === 'quick' ? '期間' : mode === 'monthly' ? '月次条件' : '年月';
        extractionRow.hidden = mode === 'daily';
    }

    function syncYearComparisonAvailability() {
        const comparisonAvailable = isDailyMode || isMonthlyMode || isRollingYearMode();
        if (!comparisonAvailable) {
            yearCompareCheck.checked = false;
            dailyComparisonData = null;
            monthlyComparisonData = null;
            rollingComparisonLoadGeneration++;
        }
        const comparisonDisabled = !comparisonAvailable || dailyDataLoading ||
            monthlyDataLoading || rollingComparisonLoading || standardDataLoading;
        yearCompareCheck.disabled = comparisonDisabled;
        yearCompareLabel.setAttribute('aria-disabled', String(comparisonDisabled));
    }

    function updateModeControls() {
        const now = new Date();
        const nowYear = now.getFullYear();
        const nowMonth = now.getMonth() + 1;

        const anyLoading = dailyDataLoading || monthlyDataLoading || rollingComparisonLoading || standardDataLoading;
        displayModeBtns.forEach(btn => btn.disabled = anyLoading);
        quickPeriodBtns.forEach(btn => btn.disabled = anyLoading);
        monthlyYearSelect.disabled = monthlyDataLoading;
        dailyYearSelect.disabled = dailyDataLoading;
        daySelect.disabled = anyLoading;
        fetchBtn.disabled = anyLoading;
        dailyMonthBtns.forEach(btn => {
            const m = parseInt(btn.dataset.month, 10);
            const selected = m === dailyModeMonth;
            btn.classList.toggle('active', selected);
            btn.setAttribute('aria-pressed', String(selected));
            // 未来の月は無効化
            btn.disabled = anyLoading ||
                (dailyModeYear === nowYear && m > nowMonth) ||
                (dailyModeYear > nowYear);
        });

        syncYearComparisonAvailability();
    }

    function hasRollingYearComparisonCoverage() {
        if (!lastFetchedData?.rows?.length) return false;
        const currentRows = getFilteredRows();
        if (currentRows.length === 0) return false;

        const currentDates = currentRows
            .map(row => parseLocalDate(row[0]))
            .filter(date => !isNaN(date.getTime()));
        const sourceDates = lastFetchedData.rows
            .map(row => parseLocalDate(row[0]))
            .filter(date => !isNaN(date.getTime()));
        if (currentDates.length === 0 || sourceDates.length === 0) return false;

        const earliestCurrent = new Date(Math.min(...currentDates.map(date => date.getTime())));
        const requiredStart = getPreviousYearDate(earliestCurrent);
        const earliestSource = Math.min(...sourceDates.map(date => date.getTime()));
        return Boolean(requiredStart) && earliestSource <= requiredStart.getTime();
    }

    async function loadRollingYearComparisonData() {
        if (!isRollingYearMode() || rollingComparisonLoading) return;
        if (hasRollingYearComparisonCoverage()) {
            updateGraph();
            return;
        }

        const loading = document.getElementById('mf-modal-loading');
        const progress = document.getElementById('mf-modal-progress');
        const requestGeneration = ++rollingComparisonLoadGeneration;
        rollingComparisonLoading = true;
        updateModeControls();
        loading.style.display = 'flex';
        progress.style.width = '10%';
        statusMsg.textContent = '';

        try {
            const data = await fetchData(2, (pct) => {
                progress.style.width = `${pct}%`;
            }, { additionalMonths: 1 });
            const requestIsCurrent = requestGeneration === rollingComparisonLoadGeneration &&
                isRollingYearMode() && yearCompareCheck.checked && modal.isConnected;
            if (!requestIsCurrent) return;

            if (data?.rows?.length) {
                lastFetchedData = data;
                if (hasRollingYearComparisonCoverage()) {
                    updateGraph();
                } else {
                    yearCompareCheck.checked = false;
                    updateGraph();
                    showGraphNotice('前年同期間の境界データを取得できませんでした', 'error');
                }
            } else {
                yearCompareCheck.checked = false;
                updateGraph();
                showGraphNotice('前年同期間のデータを取得できませんでした', 'error');
            }
        } catch (e) {
            console.error(e);
            yearCompareCheck.checked = false;
            updateGraph();
            showGraphNotice('前年比較データの取得に失敗しました', 'error');
        } finally {
            rollingComparisonLoading = false;
            loading.style.display = 'none';
            updateModeControls();
        }
    }

    async function loadMonthlyYearData() {
        const loading = document.getElementById('mf-modal-loading');
        const progress = document.getElementById('mf-modal-progress');
        const requestGeneration = ++monthlyLoadGeneration;
        const targetYear = monthlyModeYear;
        const comparisonRequested = yearCompareCheck.checked;
        monthlyDataLoading = true;
        monthlyModeData = null;
        monthlyComparisonData = null;
        updateModeControls();
        loading.style.display = 'flex';
        progress.style.width = '5%';
        statusMsg.textContent = '';

        try {
            const data = await fetchYearData(targetYear, pct => {
                progress.style.width = `${Math.round(pct * (comparisonRequested ? 0.6 : 1))}%`;
            });
            const requestIsCurrent = requestGeneration === monthlyLoadGeneration &&
                isMonthlyMode && monthlyModeYear === targetYear && modal.isConnected;
            if (!requestIsCurrent) return;

            if (!data?.rows?.length) {
                yearCompareCheck.checked = false;
                statusMsg.textContent = `${targetYear}年のデータがありません`;
                if (globalChart) {
                    globalChart.destroy();
                    globalChart = null;
                }
                document.getElementById('mf-no-data-msg').style.display = 'block';
                return;
            }

            monthlyModeData = data;
            if (comparisonRequested) {
                const comparison = await fetchYearData(targetYear - 1, pct => {
                    progress.style.width = `${60 + Math.round(pct * 0.4)}%`;
                });
                const comparisonIsCurrent = requestGeneration === monthlyLoadGeneration &&
                    isMonthlyMode && monthlyModeYear === targetYear && modal.isConnected;
                if (!comparisonIsCurrent) return;
                if (comparison?.rows?.length) {
                    monthlyComparisonData = comparison;
                } else {
                    yearCompareCheck.checked = false;
                }
            }

            updateGraph();
            if (comparisonRequested && !monthlyComparisonData) {
                showGraphNotice(`${targetYear - 1}年の比較データがありません`);
            }
        } catch (e) {
            console.error(e);
            monthlyComparisonData = null;
            yearCompareCheck.checked = false;
            showGraphNotice('月次データの取得に失敗しました', 'error');
        } finally {
            monthlyDataLoading = false;
            loading.style.display = 'none';
            updateModeControls();
        }
    }

    async function loadMonthlyComparisonData() {
        if (!isMonthlyMode || !monthlyModeData || monthlyDataLoading) return;

        const loading = document.getElementById('mf-modal-loading');
        const progress = document.getElementById('mf-modal-progress');
        const requestGeneration = ++monthlyLoadGeneration;
        const targetYear = monthlyModeYear;
        monthlyDataLoading = true;
        monthlyComparisonData = null;
        updateModeControls();
        loading.style.display = 'flex';
        progress.style.width = '10%';

        try {
            const comparison = await fetchYearData(targetYear - 1, pct => {
                progress.style.width = `${pct}%`;
            });
            const requestIsCurrent = requestGeneration === monthlyLoadGeneration &&
                isMonthlyMode && monthlyModeYear === targetYear && modal.isConnected;
            if (!requestIsCurrent) return;
            if (comparison?.rows?.length) {
                monthlyComparisonData = comparison;
            } else {
                yearCompareCheck.checked = false;
            }
            updateGraph();
            if (!monthlyComparisonData) {
                showGraphNotice(`${targetYear - 1}年の比較データがありません`);
            }
        } catch (e) {
            console.error(e);
            monthlyComparisonData = null;
            yearCompareCheck.checked = false;
            updateGraph();
            showGraphNotice('前年比較データの取得に失敗しました', 'error');
        } finally {
            monthlyDataLoading = false;
            loading.style.display = 'none';
            updateModeControls();
        }
    }

    async function loadDailyData() {
        const loading = document.getElementById('mf-modal-loading');
        const progress = document.getElementById('mf-modal-progress');
        const requestGeneration = ++dailyLoadGeneration;
        const targetYear = dailyModeYear;
        const targetMonth = dailyModeMonth;
        const comparisonRequested = yearCompareCheck.checked;
        dailyDataLoading = true;
        dailyComparisonData = null;
        updateModeControls();
        loading.style.display = 'flex';
        progress.style.width = '25%';
        statusMsg.textContent = '';

        try {
            const data = await fetchMonthlyData(targetYear, targetMonth);
            if (requestGeneration !== dailyLoadGeneration || !isDailyMode || !modal.isConnected) return;
            if (data && data.rows.length > 0) {
                dailyModeData = data;
                progress.style.width = '60%';

                if (comparisonRequested) {
                    const comparison = await fetchMonthlyData(targetYear - 1, targetMonth);
                    if (requestGeneration !== dailyLoadGeneration || !isDailyMode || !modal.isConnected) return;
                    if (comparison && comparison.rows.length > 0) {
                        dailyComparisonData = comparison;
                    } else {
                        yearCompareCheck.checked = false;
                    }
                    progress.style.width = '90%';
                }

                updateGraph();
                if (comparisonRequested && !dailyComparisonData) {
                    showGraphNotice(`${targetYear - 1}年${targetMonth}月の比較データがありません`);
                }
            } else {
                statusMsg.textContent = 'この月のデータがありません';
                dailyModeData = null;
                dailyComparisonData = null;
                if (globalChart) {
                    globalChart.destroy();
                    globalChart = null;
                }
                document.getElementById('mf-no-data-msg').style.display = 'block';
            }
        } catch (e) {
            console.error(e);
            statusMsg.textContent = 'エラーが発生しました';
            dailyComparisonData = null;
        } finally {
            dailyDataLoading = false;
            loading.style.display = 'none';
            updateModeControls();
        }
    }

    async function loadDailyComparisonData() {
        if (!isDailyMode || !dailyModeData || dailyDataLoading) return;

        const loading = document.getElementById('mf-modal-loading');
        const progress = document.getElementById('mf-modal-progress');
        const requestGeneration = ++dailyLoadGeneration;
        const targetYear = dailyModeYear;
        const targetMonth = dailyModeMonth;
        dailyDataLoading = true;
        dailyComparisonData = null;
        updateModeControls();
        loading.style.display = 'flex';
        progress.style.width = '50%';

        try {
            const comparison = await fetchMonthlyData(targetYear - 1, targetMonth);
            if (requestGeneration !== dailyLoadGeneration || !isDailyMode || !modal.isConnected) return;
            if (comparison && comparison.rows.length > 0) {
                dailyComparisonData = comparison;
            } else {
                yearCompareCheck.checked = false;
            }
            updateGraph();
            if (!dailyComparisonData) {
                showGraphNotice(`${targetYear - 1}年${targetMonth}月の比較データがありません`);
            }
        } catch (e) {
            console.error(e);
            dailyComparisonData = null;
            yearCompareCheck.checked = false;
            updateGraph();
            showGraphNotice('前年比較データの取得に失敗しました', 'error');
        } finally {
            dailyDataLoading = false;
            loading.style.display = 'none';
            updateModeControls();
        }
    }

    function activateDisplayMode(mode) {
        dailyLoadGeneration++;
        monthlyLoadGeneration++;
        rollingComparisonLoadGeneration++;
        clearGraphZoom(false);
        isDailyMode = mode === 'daily';
        isMonthlyMode = mode === 'monthly';
        dailyModeData = null;
        dailyComparisonData = null;
        monthlyModeData = null;
        monthlyComparisonData = null;
        statusMsg.textContent = '';
        setDisplayModeUI(mode);
        updateModeControls();
        if (globalChart) {
            globalChart.destroy();
            globalChart = null;
        }

        if (isDailyMode) {
            loadDailyData();
            return;
        }
        if (isMonthlyMode) {
            loadMonthlyYearData();
            return;
        }
        if (yearCompareCheck.checked && isRollingYearMode()) {
            loadRollingYearComparisonData();
        } else if (lastFetchedData) {
            updateGraph();
        } else {
            document.getElementById('mf-no-data-msg').style.display = 'block';
        }
    }

    displayModeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const nextMode = btn.dataset.displayMode;
            const currentMode = document.querySelector('[data-display-mode].active')?.dataset.displayMode;
            if (nextMode === currentMode) return;
            activateDisplayMode(nextMode);
        });
    });

    quickPeriodBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            clearGraphZoom(false);
            quickPeriodBtns.forEach(periodBtn => {
                const selected = periodBtn === btn;
                periodBtn.classList.toggle('active', selected);
                periodBtn.setAttribute('aria-pressed', String(selected));
            });
            syncYearComparisonAvailability();
            updateGraph();
        });
    });

    setDisplayModeUI('quick');

    monthlyYearSelect.addEventListener('change', () => {
        clearGraphZoom(false);
        monthlyModeYear = Number.parseInt(monthlyYearSelect.value, 10);
        monthlyModeData = null;
        monthlyComparisonData = null;
        loadMonthlyYearData();
    });

    // 月ボタンクリック
    dailyMonthBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            clearGraphZoom(false);
            dailyModeMonth = parseInt(btn.dataset.month, 10);
            dailyComparisonData = null;
            updateModeControls();
            loadDailyData();
        });
    });

    // 年セレクト変更
    dailyYearSelect.addEventListener('change', () => {
        clearGraphZoom(false);
        dailyModeYear = parseInt(dailyYearSelect.value, 10);
        dailyComparisonData = null;
        // 年が変わったら未来月チェック
        const now = new Date();
        if (dailyModeYear === now.getFullYear() && dailyModeMonth > now.getMonth() + 1) {
            dailyModeMonth = now.getMonth() + 1;
        }
        updateModeControls();
        loadDailyData();
    });

    // 日付選択の変更でグラフ更新
    daySelect.addEventListener('change', () => {
        clearGraphZoom(false);
        updateGraph();
    });

    const statusMsg = document.getElementById('mf-status-msg');

    fetchBtn.addEventListener('click', async () => {
        clearGraphZoom(false);
        if (isDailyMode) {
            await loadDailyData();
            return;
        }
        if (isMonthlyMode) {
            await loadMonthlyYearData();
            return;
        }
        const loading = document.getElementById('mf-modal-loading');
        const progress = document.getElementById('mf-modal-progress');

        standardDataLoading = true;
        updateModeControls();
        loading.style.display = 'flex';
        statusMsg.textContent = '';

        let yearsToFetch = '1'; // default

        let includeComparisonBoundary = false;
        const activeBtn = document.querySelector('[data-period].active');
        yearsToFetch = activeBtn ? activeBtn.dataset.period : '1';
        if (yearsToFetch === '1' && yearCompareCheck.checked) {
            yearsToFetch = '2';
            includeComparisonBoundary = true;
        }

        try {
            const data = await fetchData(yearsToFetch, (pct) => {
                progress.style.width = `${pct}%`;
            }, { additionalMonths: includeComparisonBoundary ? 1 : 0 });

            if (data) {
                lastFetchedData = data;
                if (isRollingYearMode() && yearCompareCheck.checked && !hasRollingYearComparisonCoverage()) {
                    yearCompareCheck.checked = false;
                    updateGraph();
                    showGraphNotice('前年同期間の境界データを取得できませんでした', 'error');
                } else {
                    updateGraph();
                }
            } else {
                statusMsg.textContent = 'データ取得に失敗しました';
            }
        } catch (e) {
            console.error(e);
            statusMsg.textContent = 'エラーが発生しました';
        } finally {
            standardDataLoading = false;
            loading.style.display = 'none';
            updateModeControls();
        }
    });

    // 移動平均トグル
    const maCheck = document.getElementById('mf-chart-ma-check');
    const maPeriodSelect = document.getElementById('mf-ma-period');
    maCheck.addEventListener('change', () => {
        clearGraphZoom(false);
        maPeriodSelect.disabled = !maCheck.checked;
        updateGraph();
    });
    maPeriodSelect.addEventListener('change', () => {
        clearGraphZoom(false);
        updateGraph();
    });

    yearCompareCheck.addEventListener('change', async () => {
        clearGraphZoom(false);
        if (!isDailyMode && !isMonthlyMode && !isRollingYearMode()) {
            yearCompareCheck.checked = false;
            return;
        }
        if (!yearCompareCheck.checked) {
            rollingComparisonLoadGeneration++;
            dailyComparisonData = null;
            monthlyComparisonData = null;
            updateGraph();
            return;
        }
        if (isDailyMode) {
            await loadDailyComparisonData();
        } else if (isMonthlyMode) {
            await loadMonthlyComparisonData();
        } else {
            await loadRollingYearComparisonData();
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
        const currentData = isDailyMode
            ? dailyModeData
            : isMonthlyMode ? monthlyModeData : lastFetchedData;
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

    updateModeControls();
    initializeGraphZoomInteractions();
    syncZoomControls();
}

function resetGraphModalState() {
    dailyLoadGeneration++;
    monthlyLoadGeneration++;
    rollingComparisonLoadGeneration++;
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
    dailyComparisonData = null;
    isMonthlyMode = false;
    monthlyModeYear = now.getFullYear();
    monthlyModeData = null;
    monthlyComparisonData = null;
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

// ==========================================
// フィルタリングロジック
// ==========================================
function filterEntriesBySelectedDay(entries) {
    const daySelectVal = document.getElementById('mf-select-day').value;

    if (daySelectVal === 'last') {
        const monthMap = new Map();
        entries.forEach(entry => {
            const key = `${entry.date.getFullYear()}-${entry.date.getMonth()}`;
            const existing = monthMap.get(key);
            if (!existing || entry.date > existing.date) {
                monthMap.set(key, entry);
            }
        });
        return Array.from(monthMap.values());
    }
    if (daySelectVal !== '') {
        const targetDay = Number.parseInt(daySelectVal, 10);
        return entries.filter(entry => entry.date.getDate() === targetDay);
    }
    return entries;
}

function getYearRowsByExtraction(data, year) {
    if (!data?.rows?.length) return [];
    const entries = data.rows.map(raw => ({
        date: parseLocalDate(raw[0]),
        raw
    })).filter(entry => !Number.isNaN(entry.date.getTime()) && entry.date.getFullYear() === year);

    return filterEntriesBySelectedDay(entries)
        .sort((a, b) => a.date - b.date)
        .map(entry => entry.raw);
}

function getFilteredRows() {
    // 日次モードの場合
    if (isDailyMode && dailyModeData) {
        const rows = getSortedDailyRows(dailyModeData);
        const comparisonEnabled = document.getElementById('mf-chart-year-compare-check')?.checked && dailyComparisonData;
        const comparisonRows = comparisonEnabled ? getSortedDailyRows(dailyComparisonData) : [];
        const status = comparisonEnabled
            ? `${dailyModeYear}年${dailyModeMonth}月: ${rows.length}件 / ${dailyModeYear - 1}年同月: ${comparisonRows.length}件`
            : `${dailyModeYear}年${dailyModeMonth}月 日次: ${rows.length}件`;
        showGraphNotice(status);
        return rows;
    }

    if (isMonthlyMode && monthlyModeData) {
        const rows = getYearRowsByExtraction(monthlyModeData, monthlyModeYear);
        const comparisonEnabled = document.getElementById('mf-chart-year-compare-check')?.checked && monthlyComparisonData;
        const comparisonRows = comparisonEnabled
            ? getYearRowsByExtraction(monthlyComparisonData, monthlyModeYear - 1)
            : [];
        const status = comparisonEnabled
            ? `${monthlyModeYear}年: ${rows.length}件 / ${monthlyModeYear - 1}年: ${comparisonRows.length}件`
            : `${monthlyModeYear}年 月次: ${rows.length}件`;
        showGraphNotice(status);
        return rows;
    }

    if (!lastFetchedData) return [];

    // 1. 全データを日付オブジェクト付きで用意
    let rows = lastFetchedData.rows.map(r => ({
        date: parseLocalDate(r[0]),
        raw: r
    })).filter(item => !isNaN(item.date.getTime()));

    // 2. クイック期間フィルタ
    const activeBtn = document.querySelector('[data-period].active');
    const rangeVal = activeBtn ? activeBtn.dataset.period : '1';
    if (rangeVal !== 'all') {
        const years = parseInt(rangeVal, 10);
        const cutoffDate = new Date();
        cutoffDate.setFullYear(cutoffDate.getFullYear() - years);
        rows = rows.filter(r => r.date >= cutoffDate);
    }

    // 3. 抽出フィルタ
    rows = filterEntriesBySelectedDay(rows);

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
    if (isDailyMode && !dailyModeData) return;
    if (isMonthlyMode && !monthlyModeData) return;
    if (!isDailyMode && !isMonthlyMode && !lastFetchedData) return;
    if (clearGraphZoomForActiveModal) clearGraphZoomForActiveModal(false);
    document.getElementById('mf-no-data-msg').style.display = 'none';

    const rows = getFilteredRows();

    if (rows.length === 0) {
        if (globalChart) globalChart.destroy();
        document.getElementById('mf-no-data-msg').style.display = 'block';
        showGraphNotice('指定条件に一致するデータがありません', 'error');
        return;
    }

    const comparisonChecked = document.getElementById('mf-chart-year-compare-check')?.checked;
    const dailyComparisonEnabled = isDailyMode && comparisonChecked && dailyComparisonData;
    const monthlyComparisonEnabled = isMonthlyMode && comparisonChecked && monthlyComparisonData;
    const rollingComparisonEnabled = !isDailyMode && !isMonthlyMode && comparisonChecked && isRollingYearSelection();
    const yearComparison = dailyComparisonEnabled
        ? buildDailyYearComparison(rows, getSortedDailyRows(dailyComparisonData))
        : monthlyComparisonEnabled
            ? buildMonthlyYearComparison(
                rows,
                getYearRowsByExtraction(monthlyComparisonData, monthlyModeYear - 1)
            )
        : rollingComparisonEnabled
            ? buildRollingYearComparison(rows, lastFetchedData.rows)
            : null;
    if (rollingComparisonEnabled && yearComparison) {
        showGraphNotice(`直近1年: ${yearComparison.currentCount}件 / 前年同期間: ${yearComparison.previousCount}件`);
    }
    const labels = yearComparison
        ? yearComparison.labels
        : isDailyMode
            ? rows.map(r => {
                const d = parseLocalDate(r[0]);
                return `${d.getMonth() + 1}/${d.getDate()}`;
            })
            : isMonthlyMode
                ? rows.map(r => {
                    const d = parseLocalDate(r[0]);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                })
            : rows.map(r => r[0]);
    const isMA = document.getElementById('mf-chart-ma-check').checked;
    const maPeriod = parseInt(document.getElementById('mf-ma-period').value, 10);

    drawChartCanvas(labels, rows, isMA, maPeriod, yearComparison);
}

// ==========================================
// ヘルパー
// ==========================================
function getSortedDailyRows(data) {
    if (!data) return [];
    return data.rows.map(raw => ({
        date: parseLocalDate(raw[0]),
        raw
    }))
        .filter(item => !isNaN(item.date.getTime()))
        .sort((a, b) => a.date - b.date)
        .map(item => item.raw);
}

function isRollingYearSelection() {
    const displayMode = document.querySelector('[data-display-mode].active')?.dataset.displayMode;
    const activePeriod = document.querySelector('[data-period].active')?.dataset.period;
    return displayMode === 'quick' && activePeriod === '1';
}

function getPreviousYearDate(date) {
    const previous = new Date(date.getFullYear() - 1, date.getMonth(), date.getDate());
    if (previous.getMonth() !== date.getMonth() || previous.getDate() !== date.getDate()) {
        return null;
    }
    return previous;
}

function buildRollingYearComparison(currentRows, sourceRows) {
    const parseRow = (row) => {
        const date = parseLocalDate(row[0]);
        const value = Number.parseInt(row[1], 10);
        return isNaN(date.getTime()) ? null : {
            date,
            value: Number.isFinite(value) ? value : null
        };
    };

    const sourceEntries = sourceRows.map(parseRow).filter(Boolean);
    const valuesByDate = new Map(sourceEntries.map(entry => [formatDate(entry.date), entry.value]));
    const latestByMonth = new Map();
    sourceEntries.forEach(entry => {
        const key = `${entry.date.getFullYear()}-${entry.date.getMonth() + 1}`;
        const existing = latestByMonth.get(key);
        if (!existing || entry.date > existing.date) latestByMonth.set(key, entry);
    });

    const currentEntries = currentRows.map(parseRow).filter(Boolean);
    const daySelection = document.getElementById('mf-select-day')?.value ?? '';
    const previousValues = currentEntries.map(entry => {
        if (daySelection === 'last') {
            return latestByMonth.get(`${entry.date.getFullYear() - 1}-${entry.date.getMonth() + 1}`)?.value ?? null;
        }
        const previousDate = getPreviousYearDate(entry.date);
        return previousDate ? valuesByDate.get(formatDate(previousDate)) ?? null : null;
    });

    const firstDate = currentEntries[0]?.date;
    const lastDate = currentEntries[currentEntries.length - 1]?.date;
    const previousFirstDate = firstDate ? getPreviousYearDate(firstDate) : null;
    const previousLastDate = lastDate ? getPreviousYearDate(lastDate) : null;
    const formatPeriod = (start, end, fallback) => start && end
        ? `${formatGraphDateLabel(start)}〜${formatGraphDateLabel(end)}`
        : fallback;

    return {
        labels: currentEntries.map(entry => `${entry.date.getMonth() + 1}/${entry.date.getDate()}`),
        currentValues: currentEntries.map(entry => entry.value),
        previousValues,
        currentLabel: formatPeriod(firstDate, lastDate, '直近1年'),
        previousLabel: formatPeriod(previousFirstDate, previousLastDate, '前年同期間'),
        currentCount: currentEntries.filter(entry => entry.value !== null).length,
        previousCount: previousValues.filter(value => value !== null).length,
        showAllDataLabels: currentEntries.length <= 20,
        alternateDataLabels: true,
        title: '資産推移（1年・前年比較）'
    };
}

function buildMonthlyYearComparison(currentRows, previousRows) {
    const parseRows = rows => rows.map(row => {
        const date = parseLocalDate(row[0]);
        const value = Number.parseInt(row[1], 10);
        return Number.isNaN(date.getTime()) ? null : {
            date,
            value: Number.isFinite(value) ? value : null
        };
    }).filter(Boolean);

    const currentEntries = parseRows(currentRows);
    const previousEntries = parseRows(previousRows);
    const daySelection = document.getElementById('mf-select-day')?.value ?? '';
    const keyForDate = date => daySelection === 'last'
        ? `${date.getMonth() + 1}`
        : `${date.getMonth() + 1}-${date.getDate()}`;
    const previousValuesByDate = new Map(previousEntries.map(entry => [keyForDate(entry.date), entry.value]));
    const previousValues = currentEntries.map(entry => previousValuesByDate.get(keyForDate(entry.date)) ?? null);

    return {
        labels: currentEntries.map(entry => `${entry.date.getMonth() + 1}/${entry.date.getDate()}`),
        currentValues: currentEntries.map(entry => entry.value),
        previousValues,
        currentLabel: `${monthlyModeYear}年`,
        previousLabel: `${monthlyModeYear - 1}年`,
        currentCount: currentEntries.filter(entry => entry.value !== null).length,
        previousCount: previousValues.filter(value => value !== null).length,
        showAllDataLabels: currentEntries.length <= 20,
        alternateDataLabels: true,
        title: `資産推移（${monthlyModeYear}年・前年比較）`
    };
}

function buildDailyYearComparison(currentRows, previousRows) {
    const valuesByDay = (rows) => {
        const values = new Map();
        rows.forEach(row => {
            const date = parseLocalDate(row[0]);
            if (isNaN(date.getTime())) return;
            const parsedValue = parseInt(row[1] || 0, 10);
            values.set(date.getDate(), Number.isFinite(parsedValue) ? parsedValue : null);
        });
        return values;
    };

    const currentValuesByDay = valuesByDay(currentRows);
    const previousValuesByDay = valuesByDay(previousRows);
    const currentMonthDays = new Date(dailyModeYear, dailyModeMonth, 0).getDate();
    const previousMonthDays = new Date(dailyModeYear - 1, dailyModeMonth, 0).getDate();
    const dayCount = Math.max(currentMonthDays, previousMonthDays);
    const days = Array.from({ length: dayCount }, (_, index) => index + 1);

    return {
        labels: days.map(day => `${day}日`),
        currentValues: days.map(day => currentValuesByDay.get(day) ?? null),
        previousValues: days.map(day => previousValuesByDay.get(day) ?? null),
        currentLabel: `${dailyModeYear}年${dailyModeMonth}月`,
        previousLabel: `${dailyModeYear - 1}年${dailyModeMonth}月`,
        currentCount: currentRows.length,
        previousCount: previousRows.length,
        showAllDataLabels: true,
        alternateDataLabels: false
    };
}

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
        if (i < period - 1 || data[i] === null || data[i] === undefined) {
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
function drawChartCanvas(labels, rows, isMA = false, maPeriod = 12, yearComparison = null) {
    if (globalChart) globalChart.destroy();
    const ctx = document.getElementById('mf-chart').getContext('2d');

    // ダークモード判定
    const dark = isDarkMode;
    const textColor = dark ? 'hsl(218 18% 74%)' : 'hsl(222 17% 34%)';
    const gridColor = dark ? 'hsl(220 14% 96% / 0.12)' : 'hsl(218 22% 78% / 0.72)';
    const haloColor = dark ? 'hsl(220 14% 8% / 0.84)' : 'hsl(220 36% 98% / 0.84)';

    const datasets = [];
    const rgb = colorToRgbObj(currentTheme.color1);
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)`);
    gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.0)`);

    const actualData = yearComparison
        ? yearComparison.currentValues
        : rows.map(r => parseInt(r[1] || 0, 10));

    datasets.push({
        label: yearComparison ? yearComparison.currentLabel : '資産合計',
        data: actualData,
        backgroundColor: gradient,
        borderColor: currentTheme.color1,
        borderWidth: 3,
        fill: true,
        pointRadius: labels.length > 50 ? 0 : 4,
        pointHoverRadius: 6,
        pointStyle: 'circle',
        spanGaps: Boolean(yearComparison),
        dataLabelOffset: -14,
        dataLabelAlternateOffset: -30
    });

    if (yearComparison) {
        datasets.push({
            label: yearComparison.previousLabel,
            data: yearComparison.previousValues,
            backgroundColor: 'transparent',
            borderColor: currentTheme.color2,
            borderWidth: 3,
            borderDash: [7, 4],
            fill: false,
            pointRadius: labels.length > 50 ? 0 : 4,
            pointHoverRadius: 6,
            pointStyle: 'rectRot',
            spanGaps: true,
            dataLabelOffset: 16,
            dataLabelAlternateOffset: 32
        });
    }

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

    // データラベル表示プラグイン
    const dataLabelPlugin = {
        id: 'dataLabelPlugin',
        afterDatasetsDraw: (chart) => {
            const { ctx, data } = chart;
            const MAX_LABELS = 20;
            const totalPoints = data.labels.length;
            const skipInterval = yearComparison?.showAllDataLabels || totalPoints <= MAX_LABELS
                ? 1
                : Math.ceil(totalPoints / MAX_LABELS);

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

                    let text = '';
                    const absVal = Math.abs(value);
                    if (absVal >= 100000000) text = (value / 100000000).toFixed(1) + '億';
                    else if (absVal >= 10000) text = (value / 10000).toFixed(0) + '万';
                    else text = value.toLocaleString();

                    const { x } = element.tooltipPosition();
                    const color = dataset.borderColor instanceof Array ? dataset.borderColor[index] : dataset.borderColor || textColor;
                    const useAlternateOffset = yearComparison?.alternateDataLabels && index % 2 === 1;
                    const labelOffset = useAlternateOffset
                        ? dataset.dataLabelAlternateOffset ?? dataset.dataLabelOffset ?? -14
                        : dataset.dataLabelOffset ?? -14;
                    const labelY = element.y + labelOffset;

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
        type: 'line',
        data: { labels, datasets },
        plugins: [dataLabelPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
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
                padding: { top: yearComparison?.alternateDataLabels ? 40 : 20, bottom: 0, right: 40 }
            },
            plugins: {
                title: {
                    display: true,
                    text: (() => {
                        if (yearComparison) {
                            return yearComparison.title ||
                                `資産推移 ─ ${yearComparison.currentLabel} / ${yearComparison.previousLabel}（前年比較）`;
                        }
                        if (isMA) return `資産推移（${maPeriod}ヶ月移動平均）`;
                        if (isDailyMode) return `資産推移 ─ ${dailyModeYear}年${dailyModeMonth}月（日次）`;
                        if (isMonthlyMode) return `資産推移 ─ ${monthlyModeYear}年（月次）`;
                        return '資産推移（合計）';
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
                                label += formatted;
                            }
                            return label;
                        }
                    }
                },
                legend: {
                    position: 'bottom',
                    labels: {
                        color: textColor,
                        usePointStyle: true,
                        padding: 16,
                        font: { size: 11 }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        color: textColor,
                        font: { size: isDailyMode ? 10 : 11 },
                        maxRotation: isDailyMode ? 0 : undefined,
                        autoSkip: true,
                        maxTicksLimit: isDailyMode ? 31 : undefined
                    }
                },
                y: {
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
                            return text;
                        }
                    }
                }
            }
        }
    });
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
    const currentData = isDailyMode
        ? dailyModeData
        : isMonthlyMode ? monthlyModeData : lastFetchedData;
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

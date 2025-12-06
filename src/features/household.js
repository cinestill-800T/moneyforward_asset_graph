// ===========================================================================
// 家計簿画面拡張 (v1.3.4) - Stale Element対策強化版 + 一括編集 + ソート
// ===========================================================================

let isProcessing = false;
let currentSort = { column: -1, direction: 'asc' };

export function initHouseholdBookEnhancement() {
    console.log('MoneyForward Enhancer: Household Book Enhancement Started');

    // 監視開始 (非同期で読み込まれる行に対応)
    // 頻繁なDOM更新によるパフォーマンス低下を防ぐためDebounceを適用
    const debouncedUpdate = debounce(() => {
        addCheckboxesToTable();
    }, 200);

    const observer = new MutationObserver((mutations) => {
        // 子要素の追加があった場合のみ更新スケジュール
        const hasAddedNodes = mutations.some(m => m.type === 'childList' && m.addedNodes.length > 0);
        if (hasAddedNodes) {
            debouncedUpdate();
        }
    });

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
}

function addCheckboxesToTable() {
    const table = document.getElementById('cf-detail-table');
    if (!table) return;

    // ヘッダーへの追加
    const theadRow = table.querySelector('thead tr');
    if (theadRow && !theadRow.querySelector('.mf-ext-header-cell')) {
        const th = document.createElement('th');
        th.className = 'mf-ext-header-cell';
        th.style.width = '45px';
        th.innerHTML = '<div style="font-size:10px; font-weight:normal; margin-bottom:2px;">全選択</div><input type="checkbox" id="mf-toggle-all-rows" title="全て選択/解除">';
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
            td.innerHTML = '<input type="checkbox" class="mf-ext-row-checkbox">';
            row.prepend(td);

            // クリックイベントでカウント更新
            td.querySelector('input').addEventListener('change', updateSelectedCount);
        }
    });

    // ソート機能の初期化
    initTableSorting();
}

function createCategoryBulkPanel() {
    const existing = document.getElementById('mf-category-bulk-panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'mf-category-bulk-panel';
    panel.className = 'mf-panel';

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
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <label class="mf-label" style="margin-bottom:0;">大項目</label>
                    <button id="mf-toggle-large-category" style="background:none; border:none; cursor:pointer; font-size:11px; color:#80A1BA; text-decoration:underline;">表示/非表示</button>
                </div>
                <div id="mf-large-category-container" style="display:none;">
                    <select id="mf-bulk-large-category" class="mf-select" style="height:36px; line-height:36px;">
                        <option value="">変更しない (自動判定)</option>
                    </select>
                    <div style="font-size:10px; color:#999; margin-top:2px;">※中項目から自動判定されます</div>
                </div>
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

    // 大項目表示切替
    const lContainer = document.getElementById('mf-large-category-container');
    const lToggle = document.getElementById('mf-toggle-large-category');
    lToggle.addEventListener('click', () => {
        const isHidden = lContainer.style.display === 'none';
        lContainer.style.display = isHidden ? 'block' : 'none';
    });

    // パネル開閉
    const toggleBtn = document.getElementById('mf-panel-toggle-btn');
    toggleBtn.addEventListener('click', () => {
        panel.classList.toggle('mf-minimized');
        const isMinimized = panel.classList.contains('mf-minimized');

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

    makePanelDraggable(panel);
    loadCategoryOptions();
}

// ... (以下ヘルパー関数多数) ...

function updateBulkStatus(text, progress = 0) {
    const statusEl = document.getElementById('mf-bulk-status-text').firstElementChild;
    const percentEl = document.getElementById('mf-bulk-percent');
    const barEl = document.getElementById('mf-bulk-progress-fill');

    if (statusEl) statusEl.textContent = text;
    if (percentEl) percentEl.textContent = `${progress}%`;
    if (barEl) barEl.style.width = `${progress}%`;
}

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

        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                observer.disconnect();
                resolve(false);
            }
        }, timeout);
    });
}

function makePanelDraggable(panel) {
    const header = panel.querySelector('.mf-panel-header');
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('.mf-header-btn')) return;

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;

        const rect = panel.getBoundingClientRect();

        panel.style.bottom = 'auto';
        panel.style.right = 'auto';
        panel.style.left = `${rect.left}px`;
        panel.style.top = `${rect.top}px`;

        initialLeft = rect.left;
        initialTop = rect.top;

        document.body.style.userSelect = 'none';
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

    let lOptions = document.querySelectorAll('select.large_category option');
    let mOptions = document.querySelectorAll('select.middle_category option');

    if (lOptions.length === 0) lOptions = document.querySelectorAll('#js-large-category-select option');
    if (mOptions.length === 0) mOptions = document.querySelectorAll('#js-middle-category-select option');

    if (lOptions.length === 0) {
        const selects = document.querySelectorAll('select.js-table-autofilter-select');
        if (selects.length >= 2) {
            lOptions = selects[0].querySelectorAll('option');
            mOptions = selects[1].querySelectorAll('option');
        }
    }

    const addOptions = (sourceOptions, targetSelect) => {
        const counts = {};
        const options = [];

        const table = document.getElementById('cf-detail-table');
        if (table) {
            const rows = table.querySelectorAll('tbody tr');
            rows.forEach(row => {
                const lCell = row.querySelector('.lctg');
                const mCell = row.querySelector('.mctg');
                if (lCell) {
                    const text = lCell.textContent.trim();
                    counts[text] = (counts[text] || 0) + 1;
                }
                if (mCell) {
                    const text = mCell.textContent.trim();
                    counts[text] = (counts[text] || 0) + 1;
                }
            });
        }

        sourceOptions.forEach(opt => {
            const text = opt.textContent.trim();
            if (opt.value && text && text !== '全て') {
                options.push({
                    text: text,
                    count: counts[text] || 0,
                    originalIndex: options.length
                });
            }
        });

        options.sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            return a.originalIndex - b.originalIndex;
        });

        const seen = new Set();
        options.forEach(opt => {
            if (!seen.has(opt.text)) {
                const o = document.createElement('option');
                o.value = opt.text;
                o.textContent = opt.text;
                if (opt.count > 0) {
                    o.textContent += ` (${opt.count})`;
                }
                targetSelect.appendChild(o);
                seen.add(opt.text);
            }
        });
    };

    if (lOptions.length > 0) addOptions(lOptions, lTarget);
    if (mOptions.length > 0) addOptions(mOptions, mTarget);

    const categoryMap = {};
    const learnCategoryMap = () => {
        const table = document.getElementById('cf-detail-table');
        if (!table) return;
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const lText = row.querySelector('.lctg')?.textContent.trim();
            const mText = row.querySelector('.mctg')?.textContent.trim();
            if (lText && mText && lText !== '未分類') {
                categoryMap[mText] = lText;
            }
        });
    };
    learnCategoryMap();

    mTarget.addEventListener('change', (e) => {
        const selectedMiddle = e.target.value;
        if (categoryMap[selectedMiddle]) {
            lTarget.value = categoryMap[selectedMiddle];
        }
    });
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

async function applyCategoriesToSelected() {
    if (isProcessing) return;

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

    const targetIds = [];
    checkedBoxes.forEach(cb => {
        const row = cb.closest('tr');
        if (row && row.id) {
            targetIds.push(row.id);
        }
    });

    if (targetIds.length === 0) {
        alert('更新対象の行IDが取得できませんでした。');
        return;
    }

    isProcessing = true;
    document.getElementById('mf-apply-categories').disabled = true;
    updateBulkStatus('処理開始...', 0);

    let successCount = 0;
    let failCount = 0;

    (async () => {
        for (let i = 0; i < targetIds.length; i++) {
            const id = targetIds[i];
            const progress = Math.round(((i) / targetIds.length) * 100);
            updateBulkStatus(`処理中 (${i + 1}/${targetIds.length}) - ${successCount}件完了`, progress);

            try {
                const row = document.getElementById(id);
                if (!row) {
                    failCount++;
                    continue;
                }

                row.style.backgroundColor = '#fdf2e9';

                let lSuccess = true;
                let mSuccess = true;

                if (lVal) {
                    lSuccess = await clickDropdownItem(row, '.lctg', lVal);
                    if (lSuccess) {
                        const table = document.getElementById('cf-detail-table');
                        if (table) await waitForDomChange(table, 3000);
                        else await new Promise(r => setTimeout(r, 1000));
                    }
                }

                const refreshedRow = document.getElementById(id);

                if (mVal && lSuccess && refreshedRow) {
                    mSuccess = await clickDropdownItem(refreshedRow, '.mctg', mVal);
                    if (mSuccess) {
                        const table = document.getElementById('cf-detail-table');
                        if (table) await waitForDomChange(table, 3000);
                        else await new Promise(r => setTimeout(r, 1000));
                    }
                }

                if (lSuccess && mSuccess) {
                    successCount++;
                    const finalRow = document.getElementById(id);
                    if (finalRow) {
                        finalRow.style.backgroundColor = '#e8f5e9';
                        const cb = finalRow.querySelector('.mf-ext-row-checkbox');
                        if (cb) cb.checked = false;
                    }
                } else {
                    failCount++;
                    const finalRow = document.getElementById(id);
                    if (finalRow) finalRow.style.backgroundColor = '#ffebee';
                }

            } catch (e) {
                console.error(e);
                failCount++;
            }
            await new Promise(r => setTimeout(r, 100));
        }

        updateBulkStatus(`完了: 成功${successCount} / 失敗${failCount}`, 100);
        updateSelectedCount();

        isProcessing = false;
        document.getElementById('mf-apply-categories').disabled = false;
        document.getElementById('mf-apply-categories').textContent = '選択した項目に適用';
    })();

    document.getElementById('mf-apply-categories').textContent = '処理中...';
}

async function clickDropdownItem(row, cellSelector, targetText) {
    const cell = row.querySelector(cellSelector);
    if (!cell) return false;
    const toggleBtn = cell.querySelector('.dropdown-toggle');
    if (!toggleBtn) return false;
    if (toggleBtn.textContent.trim() === targetText) return true;

    toggleBtn.click();

    let menu = null;
    for (let i = 0; i < 10; i++) {
        menu = cell.querySelector('.dropdown-menu');
        const isOpen = cell.classList.contains('open') || (menu && menu.style.display !== 'none');
        if (menu && isOpen) break;
        await new Promise(r => setTimeout(r, 100));
    }

    if (!menu) {
        toggleBtn.click();
        return false;
    }

    const links = menu.querySelectorAll('a');
    let targetLink = null;
    for (const link of links) {
        if (link.textContent.trim() === targetText) {
            targetLink = link;
            break;
        }
    }

    if (targetLink) {
        targetLink.click();
        return true;
    } else {
        toggleBtn.click();
        return false;
    }
}

function initTableSorting() {
    const table = document.getElementById('cf-detail-table');
    if (!table) return;

    const thead = table.querySelector('thead');
    if (!thead) return;
    const headerRow = thead.querySelector('tr');
    if (!headerRow) return;

    const headers = headerRow.querySelectorAll('th');
    headers.forEach((th, index) => {
        if (th.classList.contains('mf-ext-header-cell')) return;
        if (th.textContent.trim() === '削除') return;
        if (th.querySelector('input')) return;
        if (th.classList.contains('mf-sortable-header')) return;

        th.classList.add('mf-sortable-header');

        if (!th.querySelector('.mf-sort-icon')) {
            const icon = document.createElement('span');
            icon.className = 'mf-sort-icon';
            th.appendChild(icon);
        }

        th.addEventListener('click', () => sortTable(index));
    });
}

function sortTable(columnIndex) {
    const table = document.getElementById('cf-detail-table');
    if (!table) return;
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr.transaction_list'));
    if (rows.length === 0) return;

    let direction = 'asc';
    if (currentSort.column === columnIndex && currentSort.direction === 'asc') {
        direction = 'desc';
    }
    currentSort = { column: columnIndex, direction: direction };

    const headers = table.querySelectorAll('thead th');
    headers.forEach((th, idx) => {
        th.classList.remove('mf-sort-asc', 'mf-sort-desc');
        if (idx === columnIndex) {
            th.classList.add(direction === 'asc' ? 'mf-sort-asc' : 'mf-sort-desc');
        }
    });

    rows.sort((a, b) => {
        const cellA = a.children[columnIndex];
        const cellB = b.children[columnIndex];
        const textA = cellA ? cellA.textContent.trim() : '';
        const textB = cellB ? cellB.textContent.trim() : '';

        const numA = parseAmount(textA);
        const numB = parseAmount(textB);
        if (numA !== null && numB !== null) {
            return direction === 'asc' ? numA - numB : numB - numA;
        }

        const dateA = parseDate(textA);
        const dateB = parseDate(textB);
        if (dateA !== null && dateB !== null) {
            return direction === 'asc' ? dateA - dateB : dateB - dateA;
        }

        return direction === 'asc' ? textA.localeCompare(textB, 'ja') : textB.localeCompare(textA, 'ja');
    });

    const fragment = document.createDocumentFragment();
    rows.forEach(row => fragment.appendChild(row));
    tbody.appendChild(fragment);
}

function parseAmount(str) {
    if (!str) return null;
    const clean = str.replace(/[¥,,\s]/g, '');
    if (clean === '') return null;
    if (/^-?\d+$/.test(clean)) {
        return parseInt(clean, 10);
    }
    return null;
}

function parseDate(str) {
    if (!str) return null;
    const match = str.match(/(\d+)\/(\d+)/);
    if (match) {
        return new Date(2000, parseInt(match[1], 10) - 1, parseInt(match[2], 10));
    }
    return null;
}

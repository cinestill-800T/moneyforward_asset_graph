import { EXTENSION_VERSION } from '../core/config.js';
import { fetchData, generateCSV, downloadCSV, formatDate } from '../api/client.js';
import { showGraphModal } from '../features/asset-graph.js';
import { showSettingsModal } from './modal.js';

let lastFetchedData = null; // ローカルステートとして保持

export function createPanel() {
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
        <span>Asset Graph <span style="font-size:10px; opacity:0.8; margin-left:5px;">v${EXTENSION_VERSION}</span></span>
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
    </div>

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
    document.getElementById('btn-show-graph').addEventListener('click', () => {
        // showGraphModal needs to be imported or better, passed as dependency.
        // For now, importing from features/asset-graph.js
        showGraphModal(lastFetchedData);
    });
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

// データ共有用
export function getLastFetchedData() {
    return lastFetchedData;
}
export function setLastFetchedData(data) {
    lastFetchedData = data;
}

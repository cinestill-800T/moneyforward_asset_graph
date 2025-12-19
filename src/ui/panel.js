import { EXTENSION_VERSION } from '../core/config.js';
import { showGraphModal } from '../features/asset-graph.js';
import { showSettingsModal } from './modal.js';

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
        <p style="font-size: 12px; color: #636e72; margin: 0 0 12px 0; line-height: 1.5;">
          資産推移をグラフで可視化し、<br>CSVでエクスポートできます。
        </p>
        <button id="btn-show-graph" class="mf-btn mf-btn-primary" style="height: 52px; font-size: 15px;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M3 3v18h18" />
                <path d="M18 17l-6-10-6 10" />
                <path d="M12 17V7" />
            </svg>
            グラフを表示
        </button>
      </div>

      <div style="margin-top: 16px; text-align: center;">
        <a href="https://www.buymeacoffee.com/cinestill_800t" target="_blank" class="mf-btn-donate" title="開発者を支援する">
           <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 40px !important; width: 145px !important;" >
        </a>
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

    document.getElementById('btn-show-graph').addEventListener('click', () => {
        showGraphModal(null);
    });
    document.getElementById('mf-btn-settings').addEventListener('click', showSettingsModal);
}

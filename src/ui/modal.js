import { COLOR_PRESETS, currentTheme, saveTheme } from '../core/config.js';
import { getCacheSize, clearCache } from '../api/cache.js';

// --- 設定モーダル ---
export function showSettingsModal(onThemeChanged) {
    const existing = document.getElementById('mf-settings-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'mf-settings-modal';
    modal.className = 'mf-modal-overlay';

    // プリセット選択肢のHTML生成
    const presetOptions = COLOR_PRESETS.map((preset, index) =>
        `<option value="${index}">${preset.name}</option>`
    ).join('');

    // キャッシュ情報の取得
    const cacheInfo = getCacheSize();

    modal.innerHTML = `
        <div class="mf-modal-content mf-settings-content" style="max-width:400px; height:auto;">
            <div class="mf-modal-header">
                <div class="mf-modal-title">設定</div>
                <button class="mf-modal-btn mf-modal-btn-close" id="mf-settings-close">×</button>
            </div>
            <div class="mf-modal-body">
                <div style="margin-bottom:20px;">
                    <label class="mf-label">テーマカラー</label>
                    <div style="margin-bottom:15px;">
                        <div style="font-size:12px; margin-bottom:5px; color:#636e72;">おすすめプリセット (20種)</div>
                        <select id="mf-preset-select" class="mf-select" style="height:40px; line-height:40px;">
                            <option value="" disabled selected>選択してください...</option>
                            ${presetOptions}
                        </select>
                    </div>

                    <div style="margin-bottom:15px; padding-bottom:15px; border-bottom:1px dashed #dfe6e9;">
                        <div style="font-size:12px; margin-bottom:5px; color:#636e72;">カラーコード一括貼り付け (4行)</div>
                        <textarea id="mf-color-paste" class="mf-input" style="height:60px; min-height:60px; padding:8px; font-family:monospace; font-size:12px; resize:vertical;" placeholder="#80A1BA&#10;#91C4C3&#10;#B4DEBD&#10;#FFF7DD"></textarea>
                    </div>
                    
                    <div class="mf-color-picker-row">
                        <span class="mf-color-picker-label">Color 1 (メイン)</span>
                        <input type="color" class="mf-color-input" id="mf-color-1" value="${currentTheme.color1}">
                    </div>
                    <div class="mf-color-picker-row">
                        <span class="mf-color-picker-label">Color 2 (サブ)</span>
                        <input type="color" class="mf-color-input" id="mf-color-2" value="${currentTheme.color2}">
                    </div>
                    <div class="mf-color-picker-row">
                        <span class="mf-color-picker-label">Color 3 (アクセント)</span>
                        <input type="color" class="mf-color-input" id="mf-color-3" value="${currentTheme.color3}">
                    </div>
                    <div class="mf-color-picker-row">
                        <span class="mf-color-picker-label">Color 4 (背景等)</span>
                        <input type="color" class="mf-color-input" id="mf-color-4" value="${currentTheme.color4}">
                    </div>
                </div>

                <div style="margin-top:20px; padding-top:20px; border-top:2px solid #f3f4f6;">
                    <label class="mf-label">データキャッシュ</label>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <div style="font-size:12px; color:#636e72;">
                            過去のデータをブラウザに保存し、<br>次回の読み込みを高速化します。
                        </div>
                        <div style="text-align:right; font-size:12px; font-weight:bold;">
                            <span id="mf-cache-count">${cacheInfo.count}</span>ファイル<br>
                            <span id="mf-cache-size">${cacheInfo.size}</span> KB
                        </div>
                    </div>
                    <button id="mf-clear-cache" class="mf-btn mf-btn-secondary" style="height:40px; font-size:12px; border-color:#e74c3c; color:#e74c3c;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:5px;">
                            <path d="M3 6h18"></path>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        キャッシュをすべて削除
                    </button>
                </div>
            </div>
            <div class="mf-modal-footer">
                <button class="mf-modal-btn mf-btn-primary" id="mf-settings-save">保存して適用</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // イベント設定
    const closeModal = () => modal.remove();
    document.getElementById('mf-settings-close').addEventListener('click', closeModal);

    // プリセット選択時の動作
    document.getElementById('mf-preset-select').addEventListener('change', (e) => {
        const index = parseInt(e.target.value, 10);
        if (!isNaN(index) && COLOR_PRESETS[index]) {
            const preset = COLOR_PRESETS[index];
            const theme = {
                color1: preset.colors[0],
                color2: preset.colors[1],
                color3: preset.colors[2],
                color4: preset.colors[3]
            };
            setPickerValues(theme);
        }
    });

    // 一括貼り付けロジック
    document.getElementById('mf-color-paste').addEventListener('input', (e) => {
        const text = e.target.value;
        // 空白除去し、#******形式の行を抽出
        const colors = text.split(/[\r\n]+/)
            .map(l => l.trim())
            .filter(l => /^#[0-9A-Fa-f]{6}$/.test(l));

        if (colors.length >= 4) {
            document.getElementById('mf-color-1').value = colors[0];
            document.getElementById('mf-color-2').value = colors[1];
            document.getElementById('mf-color-3').value = colors[2];
            document.getElementById('mf-color-4').value = colors[3];
        }
    });

    // キャッシュ削除
    document.getElementById('mf-clear-cache').addEventListener('click', () => {
        if (confirm('保存されたキャッシュデータをすべて削除しますか？\n次回取得時は再度通信が発生します。')) {
            const count = clearCache();
            alert(`${count}件のキャッシュを削除しました。`);
            // 表示更新
            document.getElementById('mf-cache-count').textContent = '0';
            document.getElementById('mf-cache-size').textContent = '0.0';
        }
    });

    function setPickerValues(theme) {
        document.getElementById('mf-color-1').value = theme.color1;
        document.getElementById('mf-color-2').value = theme.color2;
        document.getElementById('mf-color-3').value = theme.color3;
        document.getElementById('mf-color-4').value = theme.color4;
    }

    // 保存
    document.getElementById('mf-settings-save').addEventListener('click', () => {
        const newTheme = {
            color1: document.getElementById('mf-color-1').value,
            color2: document.getElementById('mf-color-2').value,
            color3: document.getElementById('mf-color-3').value,
            color4: document.getElementById('mf-color-4').value
        };
        saveTheme(newTheme);
        closeModal();

        // コールバック (グラフ再描画など)
        if (onThemeChanged) onThemeChanged();
    });
}

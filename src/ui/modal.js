import { COLOR_PRESETS, currentTheme, saveTheme, isDarkMode, saveDarkMode } from '../core/config.js';
import { getCacheSize, clearCache } from '../api/cache.js';

// --- 設定モーダル ---
export async function showSettingsModal(onThemeChanged) {
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
    const cacheInfo = await getCacheSize();

    // 現在のテーマに一致するプリセットを探す
    const currentPresetIndex = COLOR_PRESETS.findIndex(preset =>
        preset.colors[0] === currentTheme.color1 &&
        preset.colors[1] === currentTheme.color2 &&
        preset.colors[2] === currentTheme.color3 &&
        preset.colors[3] === currentTheme.color4
    );

    modal.innerHTML = `
        <div class="mf-modal-content mf-settings-content">
            <div class="mf-modal-header">
                <div class="mf-modal-title">設定</div>
                <button class="mf-modal-btn mf-modal-btn-close mf-icon-button" id="mf-settings-close" aria-label="設定を閉じる">×</button>
            </div>
            <div class="mf-modal-body">
                <div class="mf-settings-section">
                    <label class="mf-label">テーマカラー</label>
                    <div class="mf-help-text">お好みのカラーテーマを選択してください</div>
                    <select id="mf-preset-select" class="mf-select">
                        ${presetOptions}
                    </select>
                    <div id="mf-theme-preview" class="mf-theme-preview">
                        <div style="flex:1; background:${currentTheme.color1};"></div>
                        <div style="flex:1; background:${currentTheme.color2};"></div>
                        <div style="flex:1; background:${currentTheme.color3};"></div>
                        <div style="flex:1; background:${currentTheme.color4};"></div>
                    </div>
                </div>

                <div class="mf-settings-section">
                    <label class="mf-label">ダークモード</label>
                    <div class="mf-settings-row">
                        <div class="mf-help-text">
                            グラフ画面を暗い配色で表示します
                        </div>
                        <label class="mf-toggle-switch">
                            <input type="checkbox" id="mf-dark-mode-toggle" ${isDarkMode ? 'checked' : ''}>
                            <span class="mf-toggle-slider"></span>
                        </label>
                    </div>
                </div>

                <div class="mf-settings-section">
                    <label class="mf-label">データキャッシュ</label>
                    <div class="mf-settings-row mf-cache-row">
                        <div class="mf-help-text">
                            過去のデータをブラウザに保存し、<br>次回の読み込みを高速化します。
                        </div>
                        <div class="mf-cache-meta">
                            <span id="mf-cache-count">${cacheInfo.count}</span>ファイル<br>
                            <span id="mf-cache-size">${cacheInfo.size}</span> KB
                        </div>
                    </div>
                    <button id="mf-clear-cache" class="mf-btn mf-btn-secondary mf-danger-action">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:5px;">
                            <path d="M3 6h18"></path>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        キャッシュをすべて削除
                    </button>
                </div>
            </div>
            <div class="mf-modal-footer">
                <button class="mf-modal-btn mf-modal-btn-primary" id="mf-settings-save">保存して適用</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // 現在のテーマに合うプリセットを選択状態にする
    const presetSelect = document.getElementById('mf-preset-select');
    if (currentPresetIndex >= 0) {
        presetSelect.value = currentPresetIndex;
    } else {
        presetSelect.selectedIndex = 0; // デフォルト
    }

    // イベント設定
    const closeModal = () => modal.remove();
    document.getElementById('mf-settings-close').addEventListener('click', closeModal);

    // プリセット選択時にプレビュー更新
    let selectedTheme = null;
    presetSelect.addEventListener('change', (e) => {
        const index = parseInt(e.target.value, 10);
        if (!isNaN(index) && COLOR_PRESETS[index]) {
            const preset = COLOR_PRESETS[index];
            selectedTheme = {
                color1: preset.colors[0],
                color2: preset.colors[1],
                color3: preset.colors[2],
                color4: preset.colors[3]
            };
            // プレビュー更新
            const preview = document.getElementById('mf-theme-preview');
            preview.innerHTML = `
                <div style="flex:1; background:${selectedTheme.color1};"></div>
                <div style="flex:1; background:${selectedTheme.color2};"></div>
                <div style="flex:1; background:${selectedTheme.color3};"></div>
                <div style="flex:1; background:${selectedTheme.color4};"></div>
            `;
        }
    });

    // ダークモードトグル (即時反映)
    document.getElementById('mf-dark-mode-toggle').addEventListener('change', (e) => {
        saveDarkMode(e.target.checked);
    });

    // キャッシュ削除
    let cacheClearArmed = false;
    let cacheClearTimer = null;
    const clearCacheButton = document.getElementById('mf-clear-cache');
    clearCacheButton.addEventListener('click', async () => {
        if (!cacheClearArmed) {
            cacheClearArmed = true;
            clearCacheButton.textContent = 'もう一度押すと削除します';
            clearCacheTimer = setTimeout(() => {
                cacheClearArmed = false;
                clearCacheButton.textContent = 'キャッシュをすべて削除';
            }, 3000);
            return;
        }

        if (cacheClearTimer) clearTimeout(cacheClearTimer);
        const count = await clearCache();
        cacheClearArmed = false;
        clearCacheButton.textContent = `${count}件のキャッシュを削除しました`;
        document.getElementById('mf-cache-count').textContent = '0';
        document.getElementById('mf-cache-size').textContent = '0.0';

        setTimeout(() => {
            clearCacheButton.textContent = 'キャッシュをすべて削除';
        }, 1800);
    });

    // 保存
    document.getElementById('mf-settings-save').addEventListener('click', () => {
        if (selectedTheme) {
            saveTheme(selectedTheme);
        } else {
            // 選択がなければ現在選択されているプリセットを適用
            const index = parseInt(presetSelect.value, 10);
            if (!isNaN(index) && COLOR_PRESETS[index]) {
                const preset = COLOR_PRESETS[index];
                saveTheme({
                    color1: preset.colors[0],
                    color2: preset.colors[1],
                    color3: preset.colors[2],
                    color4: preset.colors[3]
                });
            }
        }
        closeModal();

        // コールバック (グラフ再描画など)
        if (typeof onThemeChanged === 'function') onThemeChanged();
    });
}

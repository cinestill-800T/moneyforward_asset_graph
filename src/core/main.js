import { EXTENSION_VERSION, currentTheme, loadTheme } from './config.js';
import { createPanel } from '../ui/panel.js';
import { initPortfolioEnhancement } from '../features/portfolio.js';
import { initHouseholdBookEnhancement } from '../features/household.js';

console.log('MoneyForward Enhancer: Module Loaded v' + EXTENSION_VERSION);

// 設定ロード
loadTheme();

// ログ出力
console.log(`%c MoneyForward Enhancer v${EXTENSION_VERSION} Loaded `, `background: linear-gradient(135deg, ${currentTheme.color1}, ${currentTheme.color2}); color: #fff; font-weight: bold; padding: 4px;`);

// タブタイトルにバージョン表示
const titleSuffix = ` [Ext v${EXTENSION_VERSION}]`;
if (!document.title.includes('[Ext v')) {
    document.title = `${document.title}${titleSuffix}`;
} else {
    document.title = document.title.replace(/\[Ext v.*?\]/, titleSuffix);
}

// ページ初期化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
} else {
    initPage();
}

function initPage() {
    console.log('MoneyForward Enhancer: initPage called (Module)');
    const path = window.location.pathname;
    console.log('Current path:', path);

    if (path.startsWith('/bs/history')) {
        // 資産推移画面
        createPanel();
    } else if (path.startsWith('/bs/portfolio')) {
        // ポートフォリオ画面
        initPortfolioEnhancement();
    } else if (path.startsWith('/cf') || path === '/') {
        // 家計簿画面
        initHouseholdBookEnhancement();
    }
}

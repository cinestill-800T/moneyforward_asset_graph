import { EXTENSION_VERSION, currentTheme, loadTheme } from './config.js';
import { createPanel } from '../ui/panel.js';

console.log('MoneyForward Asset Graph: Module Loaded v' + EXTENSION_VERSION);

// 設定ロード
loadTheme();

// ログ出力
console.log(`%c MoneyForward Asset Graph v${EXTENSION_VERSION} Loaded `, `background: linear-gradient(135deg, ${currentTheme.color1}, ${currentTheme.color2}); color: #fff; font-weight: bold; padding: 4px;`);

// タブタイトルにバージョン表示
const titleSuffix = ` [Asset Graph v${EXTENSION_VERSION}]`;
if (!document.title.includes('[Asset Graph v')) {
    document.title = `${document.title}${titleSuffix}`;
} else {
    document.title = document.title.replace(/\[Asset Graph v.*?\]/, titleSuffix);
}

// ページ初期化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
} else {
    initPage();
}

function initPage() {
    console.log('MoneyForward Asset Graph: initPage called');
    const path = window.location.pathname;

    if (path.startsWith('/bs/history')) {
        // 資産推移画面
        createPanel();
    }
}

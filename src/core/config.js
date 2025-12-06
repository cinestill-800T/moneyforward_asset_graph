export const EXTENSION_VERSION = '1.4.0';

// カラープリセット定義
export const COLOR_PRESETS = [
    { name: "爽やかブルー (標準)", colors: ['#80A1BA', '#91C4C3', '#B4DEBD', '#FFF7DD'] },
    { name: "シックダーク", colors: ['#313647', '#435663', '#A3B087', '#FFF8D4'] },
    { name: "フォレストグリーン", colors: ['#2C5F2D', '#97BC62', '#D4E09B', '#F1F7ED'] },
    { name: "サンセットオレンジ", colors: ['#FF6F61', '#FF9A8B', '#FFC3A0', '#F6E4C6'] },
    { name: "ラベンダー・ドリーム", colors: ['#6A5ACD', '#9370DB', '#E6E6FA', '#F8F8FF'] },
    { name: "桜色 (チェリーブロッサム)", colors: ['#FFB7B2', '#FFDAC1', '#E2F0CB', '#FFFFD8'] },
    { name: "オーシャンブリーズ", colors: ['#006994', '#00A8E8', '#74D0F1', '#E0FFFF'] },
    { name: "ミッドナイト・パープル", colors: ['#301934', '#5D3F6A', '#8B6F9A', '#DCD0FF'] },
    { name: "アースブラウン", colors: ['#5D4037', '#8D6E63', '#D7CCC8', '#EFEBE9'] },
    { name: "クールグレー", colors: ['#37474F', '#607D8B', '#CFD8DC', '#ECEFF1'] },
    { name: "ウォームベージュ", colors: ['#8D6E63', '#A1887F', '#D7CCC8', '#F5F5F5'] },
    { name: "ミントフレッシュ", colors: ['#009688', '#4DB6AC', '#B2DFDB', '#E0F2F1'] },
    { name: "ベリー・スムージー", colors: ['#880E4F', '#C2185B', '#F48FB1', '#FCE4EC'] },
    { name: "ソーラーフレア", colors: ['#E65100', '#FF9800', '#FFCC80', '#FFF3E0'] },
    { name: "ノルディック・ウィンター", colors: ['#455A64', '#78909C', '#B0BEC5', '#FFFFFF'] },
    { name: "ロイヤルゴールド", colors: ['#B8860B', '#DAA520', '#EEE8AA', '#FFFFF0'] },
    { name: "ティール＆コーラル", colors: ['#008080', '#FF7F50', '#FFA07A', '#E0FFFF'] },
    { name: "モノクローム", colors: ['#212121', '#757575', '#BDBDBD', '#F5F5F5'] },
    { name: "ネオンサイバー", colors: ['#3F51B5', '#FF4081', '#00E676', '#121212'] },
    { name: "レトロポップ", colors: ['#D32F2F', '#FBC02D', '#388E3C', '#FFF9C4'] }
];

export const DEFAULT_THEME = {
    color1: COLOR_PRESETS[0].colors[0],
    color2: COLOR_PRESETS[0].colors[1],
    color3: COLOR_PRESETS[0].colors[2],
    color4: COLOR_PRESETS[0].colors[3]
};

// 現在のテーマ設定 (メモリ上)
export let currentTheme = { ...DEFAULT_THEME };

// --- テーマ管理 ---
export function loadTheme() {
    const saved = localStorage.getItem('mf_ext_theme');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            currentTheme = { ...DEFAULT_THEME, ...parsed };
        } catch (e) {
            console.error('Theme load error', e);
        }
    }
    applyTheme(currentTheme);
}

export function saveTheme(theme) {
    currentTheme = theme;
    localStorage.setItem('mf_ext_theme', JSON.stringify(theme));
    applyTheme(theme);
}

export function applyTheme(theme) {
    const r = document.documentElement;
    r.style.setProperty('--mf-color-1', theme.color1);
    r.style.setProperty('--mf-color-2', theme.color2);
    r.style.setProperty('--mf-color-3', theme.color3);
    r.style.setProperty('--mf-color-4', theme.color4);
}

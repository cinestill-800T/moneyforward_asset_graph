export const EXTENSION_VERSION = '2.8.0';

// カラープリセット定義
export const COLOR_PRESETS = [
    { name: "Aurum Graphite", colors: ['hsl(198 92% 64%)', 'hsl(156 72% 52%)', 'hsl(44 96% 62%)', 'hsl(220 24% 92%)'] },
    { name: "Signal Cyan", colors: ['hsl(207 96% 66%)', 'hsl(178 78% 54%)', 'hsl(255 86% 74%)', 'hsl(218 28% 93%)'] },
    { name: "Obsidian Mint", colors: ['hsl(162 73% 48%)', 'hsl(207 82% 62%)', 'hsl(48 91% 58%)', 'hsl(154 22% 91%)'] },
    { name: "Slate Rose", colors: ['hsl(343 84% 66%)', 'hsl(28 92% 66%)', 'hsl(210 84% 70%)', 'hsl(24 30% 92%)'] },
    { name: "Kinetic Violet", colors: ['hsl(262 88% 72%)', 'hsl(198 90% 62%)', 'hsl(142 72% 56%)', 'hsl(238 32% 93%)'] },
    { name: "Sakura Pulse", colors: ['hsl(349 92% 74%)', 'hsl(24 90% 72%)', 'hsl(152 54% 72%)', 'hsl(40 70% 92%)'] },
    { name: "Deep Market", colors: ['hsl(200 82% 48%)', 'hsl(187 86% 56%)', 'hsl(222 76% 70%)', 'hsl(190 46% 92%)'] },
    { name: "Nocturne Plum", colors: ['hsl(282 62% 54%)', 'hsl(318 76% 64%)', 'hsl(205 82% 66%)', 'hsl(280 30% 91%)'] },
    { name: "Urban Clay", colors: ['hsl(18 46% 50%)', 'hsl(36 66% 58%)', 'hsl(166 48% 56%)', 'hsl(30 32% 90%)'] },
    { name: "Nord Glass", colors: ['hsl(203 45% 56%)', 'hsl(188 42% 64%)', 'hsl(224 30% 72%)', 'hsl(210 28% 93%)'] },
    { name: "Warm Ledger", colors: ['hsl(33 52% 55%)', 'hsl(13 78% 63%)', 'hsl(194 70% 62%)', 'hsl(36 34% 91%)'] },
    { name: "Mint Delta", colors: ['hsl(174 80% 42%)', 'hsl(151 67% 55%)', 'hsl(209 76% 66%)', 'hsl(158 42% 91%)'] },
    { name: "Berry Index", colors: ['hsl(329 76% 53%)', 'hsl(280 70% 66%)', 'hsl(38 92% 62%)', 'hsl(324 40% 92%)'] },
    { name: "Solar Signal", colors: ['hsl(29 94% 56%)', 'hsl(47 96% 58%)', 'hsl(186 76% 58%)', 'hsl(42 54% 91%)'] },
    { name: "Frost Terminal", colors: ['hsl(205 35% 50%)', 'hsl(185 38% 62%)', 'hsl(224 44% 74%)', 'hsl(206 36% 92%)'] },
    { name: "Royal Yield", colors: ['hsl(43 82% 54%)', 'hsl(31 84% 62%)', 'hsl(198 72% 64%)', 'hsl(48 48% 91%)'] },
    { name: "Coral Teal", colors: ['hsl(181 72% 42%)', 'hsl(12 92% 66%)', 'hsl(43 90% 66%)', 'hsl(185 48% 92%)'] },
    { name: "Mono Alloy", colors: ['hsl(214 18% 62%)', 'hsl(220 12% 48%)', 'hsl(160 10% 70%)', 'hsl(220 18% 92%)'] },
    { name: "Cyber Yield", colors: ['hsl(233 88% 68%)', 'hsl(326 92% 64%)', 'hsl(152 96% 52%)', 'hsl(220 18% 10%)'] },
    { name: "Retro Quant", colors: ['hsl(356 78% 58%)', 'hsl(48 94% 60%)', 'hsl(150 60% 46%)', 'hsl(42 66% 91%)'] }
];

export const DEFAULT_THEME = {
    color1: COLOR_PRESETS[0].colors[0],
    color2: COLOR_PRESETS[0].colors[1],
    color3: COLOR_PRESETS[0].colors[2],
    color4: COLOR_PRESETS[0].colors[3]
};

// 現在のテーマ設定 (メモリ上)
export let currentTheme = { ...DEFAULT_THEME };

// ダークモード状態
export let isDarkMode = true;

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

// --- ダークモード管理 ---
export function loadDarkMode() {
    const saved = localStorage.getItem('mf_ext_dark_mode');
    isDarkMode = saved === null ? true : saved === 'true';
    applyDarkMode(isDarkMode);
}

export function saveDarkMode(enabled) {
    isDarkMode = enabled;
    localStorage.setItem('mf_ext_dark_mode', String(enabled));
    applyDarkMode(enabled);
}

export function applyDarkMode(enabled) {
    if (enabled) {
        document.documentElement.classList.add('mf-dark');
        document.documentElement.classList.remove('mf-light');
    } else {
        document.documentElement.classList.remove('mf-dark');
        document.documentElement.classList.add('mf-light');
    }
}

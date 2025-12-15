// ===========================================================================
// ポートフォリオ画面拡張 (v1.3.8) - 資産構成分析 & ヒートマップ
// ===========================================================================

export function initPortfolioEnhancement() {
    console.log('MoneyForward Enhancer: Portfolio Enhancement Started');
    hideUnwantedColumns();
}



function hideUnwantedColumns() {
    console.log('MoneyForward Enhancer: Hiding Unwanted Columns');
    const targetColumns = ['保有金融機関', '取得日', '変更', '削除'];

    const tables = document.querySelectorAll('table');
    tables.forEach(table => {
        const headers = Array.from(table.querySelectorAll('th'));
        const targetIndices = [];

        headers.forEach((th, index) => {
            if (targetColumns.includes(th.textContent.trim())) {
                targetIndices.push(index);
                th.style.display = 'none'; // ヘッダーを非表示
            }
        });

        if (targetIndices.length > 0) {
            const rows = table.querySelectorAll('tr');
            rows.forEach(row => {
                const cells = row.cells;
                targetIndices.forEach(index => {
                    if (cells.length > index) {
                        cells[index].style.display = 'none';
                    }
                });
            });
        }
    });
}

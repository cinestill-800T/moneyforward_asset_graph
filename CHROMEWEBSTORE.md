# Chrome Web Store Listing - MoneyForward Asset Graph

> Last Updated: 2026-06-12

## Store Listing

**Extension Name**
MoneyForward Asset Graph

**Short Description**
マネーフォワードMEの資産推移をグラフで可視化し、表示データをCSV保存できます。

**Detailed Description**
MoneyForward Asset Graph は、マネーフォワード ME の資産推移画面にグラフ表示とCSV保存機能を追加するChrome拡張機能です。

資産総額の推移、資産カテゴリ別の内訳、前回からの増減をブラウザ上で確認できます。期間指定、年指定、月末抽出、日次/月次切り替え、移動平均、サマリー表示、未来予測表示、縦グリッド切り替え、横ドラッグによる一時ズームに対応しています。表示中のグラフデータはCSV保存、CSVコピー、画像コピーができます。

使い方:
1. マネーフォワード ME の資産推移画面を開きます。
2. 画面上に追加される「グラフを表示」ボタンをクリックします。
3. 表示期間、抽出条件、グラフ形式を選びます。
4. 「再取得・描画」で最新データを取得してグラフを更新します。
5. 必要に応じてCSV保存、CSVコピー、画像コピーを実行します。

データ処理はローカルのブラウザ内で完結します。資産情報、CSV、設定、キャッシュデータを外部サーバーへ送信せず、分析サービスや広告サービスも使用しません。

本拡張機能はマネーフォワード ME の非公式ツールです。株式会社マネーフォワードとは関係ありません。

**Category**
Productivity

**Single Purpose**
マネーフォワード ME の資産推移画面から取得した資産データをローカルでグラフ化し、CSVとして保存できるようにします。

**Primary Language**
Japanese

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|------------|--------|----------|
| Store Icon | 128x128 PNG | Ready | design-assets/out/ストアアイコン_128x128.png |
| Screenshot 1 | 1280x800 PNG | Ready | design-assets/out/スクリーンショット_1280x800.png |
| Small Promo Tile | 440x280 PNG | Ready | design-assets/out/プロモーションタイル小_440x280.png |
| Marquee Promo Tile | 1400x560 PNG | Ready | design-assets/out/プロモーションタイル大_1400x560.png |

### Screenshot Notes

Screenshot 1 should show the MoneyForward Asset Graph modal with asset trend graphs, controls, and the current visual theme. Refresh screenshots whenever graph controls or modal layout changes significantly.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| storage | permissions | Stores fetched asset-history CSV data and UI preferences locally in the user's browser so graphs can reload faster and theme choices persist. Data is not sent to external servers. |
| https://moneyforward.com/bs/history* | content_scripts.matches | Runs the content script only on the MoneyForward ME asset history page, where the extension adds graph controls and reads the page's CSV endpoints for the signed-in user. |
| https://moneyforward.com/* | web_accessible_resources.matches | Allows the MoneyForward asset history page to load the extension's bundled modules and Chart.js asset required by the injected graph UI. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?**
No external collection. The extension reads asset-history data from MoneyForward pages for the current signed-in user, processes it locally, and may cache it locally in Chrome storage.

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|------------|-------------------------|---------|----------------------------|
| Personally identifiable info | No | No | Not used | No |
| Health info | No | No | Not used | No |
| Financial info | Local processing only | No | Display asset trend graphs and export user-requested CSV/image output | No |
| Authentication info | No | No | Not used | No |
| Personal communications | No | No | Not used | No |
| Location | No | No | Not used | No |
| Web history | No | No | Not used | No |
| User activity | No | No | Not used | No |
| Website content | Local processing only on MoneyForward asset history pages | No | Read asset-history table/CSV data to render graphs | No |

### Data Use Certification

- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL**
Required before submission. Use a public URL that serves the contents of `PRIVACY_POLICY.md`, such as GitHub Pages or the repository file URL if the repository is public.

## Distribution

**Visibility**: Public
**Regions**: All regions
**Pricing**: Free

## Developer Info

**Publisher Name**
TBD

**Contact Email**
TBD

**Support URL / Email**
TBD

**Homepage URL**
TBD

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 2.8.1 | 2026-06-12 | Rebuilt the Chrome Web Store package with a version greater than the published 2.8.0 release. Includes vertical grid toggle and horizontal drag zoom for graph ranges. | Draft |
| 2.8.0 | 2026-06-12 | Added vertical grid toggle and horizontal drag zoom for graph ranges. | Published |

## Review Notes

### Known Issues / Limitations

- This is an unofficial extension and is not affiliated with Money Forward, Inc.
- The extension depends on the current MoneyForward ME asset history page structure and CSV endpoint behavior.
- Chrome Web Store upload requires a version greater than the version currently published in the Developer Dashboard.

### Rejection History

None recorded.

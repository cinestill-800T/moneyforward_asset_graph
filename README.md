# MoneyForward Asset Graph

[![Version](https://img.shields.io/badge/version-2.8.1-2563eb)](manifest.json)
[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-16a34a)](manifest.json)
[![Chrome](https://img.shields.io/badge/Browser-Google%20Chrome-4285f4)](https://www.google.com/chrome/)
[![Privacy](https://img.shields.io/badge/privacy-local%20only-0f766e)](PRIVACY_POLICY.md)
[![License](https://img.shields.io/badge/license-MIT-111827)](#ライセンス)

マネーフォワード ME の資産推移画面に、見やすいグラフ表示とCSV保存機能を追加するChrome拡張機能です。

資産総額の推移、資産カテゴリ別の内訳、前回からの増減をブラウザ上で確認できます。データ処理はローカルのブラウザ内で完結し、外部サーバーへ資産情報を送信しません。

## 現在のバージョン

- Extension version: `2.8.1`
- Manifest: `Manifest V3`
- 対象ページ: `https://moneyforward.com/bs/history*`
- 利用権限: `storage`
- データ処理: ブラウザ内で完結し、外部サーバーへ送信しません

## 主な機能

- 資産総額の推移を折れ線グラフで表示
- 預金、株式、投資信託などの内訳を積み上げグラフで表示
- 前回との差分を増減グラフで表示
- 縦グリッドの表示切り替え
- 期間指定、年指定、日付抽出、月末抽出に対応
- 日次データと月次データの切り替え
- 移動平均、サマリー表示、未来予測表示
- グラフデータのCSV保存、CSVコピー、画像コピー
- 複数テーマによる表示切り替え
- 取得データの一時キャッシュによる再表示の高速化

## 対応環境

- Google Chrome
- Manifest V3対応のChromium系ブラウザ
- マネーフォワード ME の資産推移ページ

## インストール

### Chrome Web Store 掲載準備

Chrome Web Store への掲載準備情報は [CHROMEWEBSTORE.md](CHROMEWEBSTORE.md) にまとめています。ストア掲載前または審査中の場合は、次の開発用ビルドを読み込んで利用できます。

### 開発用ビルドを読み込む

```bash
scripts/build_extension.sh debug
```

Chromeで `chrome://extensions/` を開き、デベロッパーモードを有効にしてから、次のフォルダを「パッケージ化されていない拡張機能」として読み込みます。

```text
debug/moneyforward-asset-graph/
```

### リリース用ビルドを作成する

```bash
scripts/build_extension.sh release
```

生成物はリポジトリ直下の `release/` に配置されます。

```text
release/moneyforward-asset-graph/
release/moneyforward-asset-graph.zip
```

ZIPには拡張機能として必要なファイルのみを含め、`.DS_Store` や `__MACOSX` は除外されます。

## 使い方

1. マネーフォワード ME の資産推移画面を開きます。
2. 画面上に追加される「グラフを表示」ボタンをクリックします。
3. 表示期間、抽出条件、グラフ形式を選びます。
4. 「再取得・描画」で最新データを取得してグラフを更新します。
5. 必要に応じてCSV保存、CSVコピー、画像コピーを実行します。

グラフ上をドラッグすると一時的に拡大表示できます。ズーム解除で元の期間表示に戻り、CSVやサマリーには影響しません。

## プロジェクト構成

```text
moneyforward-asset-graph/
├── manifest.json              # Chrome拡張機能の定義
├── loader.js                  # コンテンツスクリプトの読み込み
├── style.css                  # 拡張UIのスタイル
├── src/
│   ├── api/                   # データ取得、キャッシュ、CSV生成
│   ├── core/                  # 初期化、設定
│   ├── features/              # グラフ表示機能
│   ├── ui/                    # パネル、モーダル
│   └── assets/                # Chart.js、アイコン
├── scripts/
│   └── build_extension.sh     # debug/releaseビルド
├── CHROMEWEBSTORE.md          # Chrome Web Store 掲載準備メモ
└── PRIVACY_POLICY.md
```

## プライバシー

この拡張機能は、資産データを外部サーバーへ送信しません。画面から取得したデータはブラウザ内で処理され、表示や保存のために使用されます。

詳細は [PRIVACY_POLICY.md](PRIVACY_POLICY.md) を参照してください。

## リリース手順

1. `manifest.json` と `src/core/config.js` のバージョンを更新します。
2. `CHROMEWEBSTORE.md` の Version History と掲載情報を更新します。
3. `scripts/build_extension.sh release` を実行します。
4. `release/moneyforward-asset-graph.zip` をChrome Web Store Developer Dashboardへアップロードします。

## 注意事項

- 本拡張機能はマネーフォワード ME の非公式ツールです。
- 株式会社マネーフォワードとは関係ありません。
- マネーフォワード ME の画面構造が変更された場合、正常に動作しない可能性があります。
- 利用は自己責任で行ってください。

## ライセンス

MIT License

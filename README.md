# freee クイック検索 仕様書

- **拡張機能名**: freee クイック検索
- **バージョン**: 1.0.0
- **Manifest バージョン**: 3
- **対象ブラウザ**: Google Chrome

---

## 概要

ブラウザ上でテキストを選択して右クリックするだけで、freee の各検索画面へ瞬時にジャンプできる Chrome 拡張機能。  
金額・日付は全角入力や元号表記にも対応した自動変換が行われる。

---

## ファイル構成

| ファイル | 役割 |
|---|---|
| `manifest.json` | 拡張機能の定義 |
| `background.js` | Service Worker。コンテキストメニュー管理、URL 生成、検索履歴保存 |
| `popup.html` | ポップアップ UI（検索履歴一覧）の HTML・CSS |
| `popup.js` | ポップアップの履歴表示・フィルタ・コピー処理 |
| `icons/` | アイコン画像（16px / 48px / 128px） |

---

## 権限

| 権限 | 用途 |
|---|---|
| `contextMenus` | 右クリックメニューの登録・管理 |
| `tabs` | 検索結果を新規タブで開く |
| `notifications` | 入力値の変換失敗時の通知表示 |
| `storage` | 検索履歴の永続化 |

---

## 機能詳細

### 1. コンテキストメニュー検索

ページ上で任意のテキストを選択して右クリックすると「**freee で検索 🔍**」メニューが表示される。

**メニュー構造**
```
freee で検索 🔍
├── 📒 取引の一覧
│   ├── 取引先で検索
│   ├── 備考で検索
│   ├── 金額で検索
│   └── 日付で検索
└── 🏦 口座明細
    ├── 取引内容で検索
    ├── 金額で検索
    └── 日付で検索
```

**各メニューの生成 URL**

| グループ | メニュー | 生成 URL |
|---|---|---|
| 取引の一覧 | 取引先で検索 | `https://secure.freee.co.jp/deals#limit=500&mode=search&offset=0&partner={選択テキスト}` |
| 取引の一覧 | 備考で検索 | `https://secure.freee.co.jp/deals#limit=500&mode=search&offset=0&line_item_description={選択テキスト}` |
| 取引の一覧 | 金額で検索 | `https://secure.freee.co.jp/deals#limit=500&mode=search&offset=0&amount_min={金額}&amount_max={金額}` |
| 取引の一覧 | 日付で検索 | `https://secure.freee.co.jp/deals#limit=500&mode=search&offset=0&start_issue_date={日付}&end_issue_date={日付}` |
| 口座明細 | 取引内容で検索 | `https://secure.freee.co.jp/wallet_txns#ignore_condition=with&description={選択テキスト}&limit=500&sort=issue_date&direction=desc&offset=0&page=1` |
| 口座明細 | 金額で検索 | `https://secure.freee.co.jp/wallet_txns#ignore_condition=with&start_amount={金額}&end_amount={金額}&limit=500&sort=issue_date&direction=desc&offset=0&page=1` |
| 口座明細 | 日付で検索 | `https://secure.freee.co.jp/wallet_txns#ignore_condition=with&start_date={日付}&end_date={日付}&limit=500&sort=issue_date&direction=desc&offset=0&page=1` |

---

### 2. 入力値の自動変換

#### 金額変換（`extractAmount`）

全角数字・記号を半角に変換後、以下の規則で金額を抽出する。

| 入力例 | 変換後 |
|---|---|
| `１２，３４５` | `12345` |
| `¥12,345` | `12345` |
| `△1,000` / `-1,000` | `-1000`（マイナス扱い） |
| `12,345円` | `12345` |

変換できない場合（数値として解釈不能）は `null` を返し、通知を表示する。

#### 日付変換（`extractDate`）

全角を半角変換後、以下の形式を `YYYY-MM-DD` に変換する。

| 入力形式 | 例 | 変換後 |
|---|---|---|
| 8桁数字 | `20240115` | `2024-01-15` |
| 令和（R）表記 | `R6.1.15` / `R6/1/15` | `2024-01-15` |
| スラッシュ区切り | `2024/1/15` | `2024-01-15` |
| ハイフン区切り | `2024-1-15` | `2024-01-15` |
| 年月日表記 | `2024年1月15日` | `2024-01-15` |

変換できない場合は `null` を返し、通知を表示する。

**令和の変換式**: `2018 + R年の数値` = 西暦

---

### 3. 変換失敗時の通知

金額・日付として認識できない場合、Chrome 通知を表示する。

- 通知タイトル: `freee：変換できませんでした`
- 通知メッセージ: `「{選択テキスト}」を{検索種別}として認識できませんでした`
- アイコン: `icons/icon48.png`（存在しない場合は省略してフォールバック）

---

### 4. 検索履歴（ポップアップ）

拡張機能アイコンをクリックすると検索履歴一覧が表示される。

**保存タイミング**: コンテキストメニューから検索を実行し、URL が正常に生成されたとき

**保存データ構造（1件）**
```json
{
  "text": "選択されたテキスト",
  "menuTitle": "取引先で検索",
  "groupTitle": "📒 取引の一覧",
  "url": "https://secure.freee.co.jp/deals#...",
  "timestamp": 1700000000000
}
```

**重複排除ロジック**
- 同一 `text + menuTitle` の組み合わせを削除
- 同一 `url` を削除
- 上記を除いた配列の先頭に新しいエントリを追加
- 最大 **30件** 保持（`chrome.storage.local` の `searchHistory` キー）

**ポップアップの操作**
- ポップアップ表示時に検索ボックスへ自動フォーカス
- テキストによる絞り込みフィルタ（`text` / `menuTitle` / `groupTitle` を対象）
- 各履歴アイテム:
  - クリック（アイテム行）: 該当 URL を新規タブで開く
  - ↗ ボタン: 該当 URL を新規タブで開く
  - 📋 ボタン: URL をクリップボードにコピー
- 「🗑️ 履歴をすべて消去」ボタン

**アイコン・バッジの表示ロジック**

| groupTitle | アイコン | バッジラベル |
|---|---|---|
| `📒 取引の一覧` | 📒 | `取引の一覧 › {menuTitle}` |
| `🏦 口座明細` | 🏦 | `口座明細 › {menuTitle}` |
| その他 | 🔍 | `{menuTitle}` |

---

## ストレージ設計

| キー | スコープ | 内容 | 上限 |
|---|---|---|---|
| `searchHistory` | local | 検索履歴配列 | 30件 |

---

## バックグラウンド処理（background.js）

### コンテキストメニュー登録（`onInstalled`）

拡張機能インストール・更新時に既存メニューを全削除してから再登録する。

**階層構造**
1. ルート: `freee_root`（テキスト選択時のみ表示）
2. グループ: `group_deals`（取引の一覧）、`group_wallet`（口座明細）
3. 各検索メニュー: グループ配下に登録

### クリックハンドラ（`contextMenus.onClicked`）

1. 選択テキストを trim
2. クリックされたメニュー ID に対応する `buildUrl` 関数を実行
3. URL が `null`（変換失敗）の場合は通知を表示して終了
4. URL が生成できた場合は履歴に保存し、新規タブで開く

---


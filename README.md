# IRON LOG — PWA セットアップガイド

スマホのホーム画面に追加してネイティブアプリのように使える筋トレ記録PWAです。

## このフォルダの中身

- `index.html` — アプリ本体（全部入り）
- `manifest.json` — アプリ情報（名前・アイコン・色など）
- `sw.js` — Service Worker（オフライン対応）
- `icon-192.png` / `icon-512.png` — アプリアイコン

## ホストする方法（GitHub Pages 無料）

### 1. GitHubアカウントを用意
[github.com](https://github.com) でアカウント作成（無料）。

### 2. 新しいリポジトリを作る
- GitHubにログイン → 右上 **+** → **New repository**
- Repository name: `iron-log`（好きな名前でOK）
- **Public** を選択（PrivateだとPages使えない）
- **Create repository** をクリック

### 3. ファイルをアップロード
- リポジトリページで **uploading an existing file** をクリック
- このフォルダの中身（index.html, manifest.json, sw.js, icon-192.png, icon-512.png）を全部ドラッグ&ドロップ
- 下の **Commit changes** をクリック

### 4. GitHub Pagesを有効化
- リポジトリの **Settings** タブ → 左メニュー **Pages**
- Source: **Deploy from a branch**
- Branch: **main** / **/ (root)** → **Save**
- 数分待つと上に `Your site is live at https://ユーザー名.github.io/iron-log/` と表示される

### 5. スマホでアクセスしてホーム画面に追加

**iPhone（Safariのみ）**
1. SafariでURLを開く
2. 下の共有ボタン（□に↑）をタップ
3. **ホーム画面に追加** をタップ
4. 名前を確認して **追加**

**Android（Chrome）**
1. ChromeでURLを開く
2. 右上のメニュー（︙）をタップ
3. **アプリをインストール** または **ホーム画面に追加** をタップ
4. **インストール** で完了

## 使い方

- **記録**: 種目を選んで、重量と回数を入力 → 記録
- **履歴**: 種目別の推定1RM推移グラフが見られる
- **種目**: 80種のプリセットから★お気に入り登録できる
- **1RM**: 任意の重量×回数から1RMと60〜95%のトレーニング重量を計算

データはスマホのブラウザに保存されます。アプリを削除すると消えるので、大事な記録は時々スクショなどでバックアップを。

## カスタマイズ

`index.html` の `PRESET_EXERCISES` 配列を編集すれば種目を追加できます。
カラーは冒頭の `NEON` 定数を変えるとアプリ全体の色が変わります。

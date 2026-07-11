# Ball Manager

ボウリングボールとスコアを、家族・知り合いと共有できる管理アプリです。

## できること

- ダッシュボード（今日の推奨・調子の推移）
- マイボール（購入日・ショップ・ドリラー・表面メンテ履歴）
- カタログ（メーカー・カバー・コアで絞り込み、所持追加）
- スコア入力（合計点 / フレーム、編集、練習/大会）
- 分析（練習/大会、X率、店舗・オイル別、大会まとめ、推移）
- 攻略AI（オイル条件 ＋ 実績、画像/PDF読取、AI解説）
- ROUND1プロショップ商品ビューア連携
- 表面メンテリマインダー（ダッシュボード / 任意で通知）
- JSONバックアップ / スコアCSV書き出し / 招待コード参加
- 分析の自動「気づき」
- GitHub Pages 公開 / PWA（ホーム画面追加）

## 起動

```bash
npm install
npm run dev
```

ブラウザで http://127.0.0.1:5180/ を開きます。

スマホではブラウザの「ホーム画面に追加」でアプリのように使えます（PWA）。

最初は **端末内（localStorage）** に保存されます。デモデータ入りです。

## ROUND1 商品ビューア

カタログ・マイボールから [ROUND1プロショップ商品一覧](https://okajun777.github.io/round1-proshop-viewer/) を開けます。  
球名付きリンクは `?cat=ball&q=球名` で検索状態になります。

## GitHub に公開する（GitHub Desktop 推奨）

リポジトリ: https://github.com/okajun777/ball-manager

1. GitHub Desktop でこのフォルダを開き、変更を commit → push
2. リポジトリ Settings → Pages → Source を **GitHub Actions**
3. `main` へ push すると自動デプロイ

公開URL: https://okajun777.github.io/ball-manager/

カタログ画像は約 6MB に圧縮済みです。再圧縮する場合:

```bash
python scripts/compress-catalog-images.py
```

## 家族とクラウド共有（Supabase）

1. [Supabase](https://supabase.com/) でプロジェクト作成
2. SQL Editor で `supabase/schema.sql` を実行
3. Project Settings → API から URL と anon key をコピー
4. `.env.example` を `.env` にコピーして値を入れる

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

5. `npm run dev` を再起動

## バックアップ（JSON）

設定・共有 →「JSONを書き出し / 読み込み」。プライベートリポジトリへの手動コミットも可。

## AI解説・画像/PDF読取（任意）

1. OpenAI などで APIキーを取得（Vision対応モデル推奨）
2. 設定・共有に保存
3. 攻略AIで「AI解説を生成」、またはパターン画像／PDFをアップロード

PDFは先頭最大2ページを画像化して解析します。

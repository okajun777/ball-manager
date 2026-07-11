# Ball Manager

ボウリングボールとスコアを、家族・知り合いと共有できる管理アプリです。

## できること

- ダッシュボード（練習/大会の平均）
- マイボール（購入日・ショップ・ドリラーなど）
- カタログ（メーカー・カバー・コアで絞り込み、所持追加）
- スコア入力（合計点のみ、所持ボールから選択、練習/大会）
- 分析（練習のみ / 大会のみ / 比較、ボール別平均）
- 攻略AI（オイル条件 ＋ 過去スコア → 所持ボール優先の提案）
- AI解説（任意・OpenAI互換APIキーで文章解説）
- グループ共有（メンバー切替）

## 起動

```bash
npm install
npm run dev
```

ブラウザで表示された URL（例: http://127.0.0.1:5173）を開きます。

最初は **端末内（localStorage）** に保存されます。デモデータ入りです。

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

設定画面の招待コードを家族に共有できます。  
（本格的なログイン制限は後から強化可能です）

## GitHub バックアップ

データは当面 Supabase / ローカルが本体です。  
必要なら定期エクスポートや Actions で GitHub に JSON バックアップを追加できます。

## AI解説（任意）

1. [OpenAI](https://platform.openai.com/) などで APIキーを取得
2. アプリの「設定・共有」に APIキーを保存（端末内のみ）
3. 攻略AIで提案後、「AI解説を生成」を押す

デフォルトは `gpt-4o-mini` / `https://api.openai.com/v1` です。  
OpenRouter など互換APIも Base URL を変えれば使えます。

## 今後

- オイルパターン画像の読み取り
- フレーム単位スコア
- GitHub への定期バックアップ

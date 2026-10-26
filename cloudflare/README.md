# ランキング(Cloudflare Workers + D1)

## 1. Worker を作る(最初の1回)
```bash
cd cloudflare
npx wrangler login                          # ブラウザでCloudflareにログイン
npx wrangler d1 create osaka-ranking        # 出てきた database_id を wrangler.toml に貼る
npx wrangler d1 execute osaka-ranking --remote --file=schema.sql
npx wrangler deploy                         # 出てきた https://osaka-ranking.<あなたの名前>.workers.dev がURL
```

## 2. ゲームにつなぐ
`index.html` の `const LB2_URL = ... : '';` の `''` に、Worker のURLを入れて、公開する。

## 3. ランキングをCSVで保存する(ダブルクリックだけ)
`cloudflare/export_ranking.bat` をダブルクリックすると、本番のランキング(D1)を CSV にして、`ranking_backup/ranking_日付_時刻.csv` に保存し、そのフォルダを開く。
- 必要なもの: Node.js、`wrangler.toml` の `database_id`。初めてだけ、`npx wrangler login` を1回(ブラウザで Cloudflare にログイン)。
- CSV は UTF-8(BOM付き)なので、Excel でそのまま開ける。`ranking_backup/` は GitHub には上げない。

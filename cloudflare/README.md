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

## 4. ランキングの決まり(Partly Rainy と同じ。サーバーへのアクセスを減らすため)
- ステージごとに、1人1件。同じ名前(大文字小文字は区別しない)の記録があるときは、それを超えたときだけ、点数を更新する。
- 上位100位まで。100位に届かない点数は、サーバーに送らず、保存もしない。ゲームは、100位の点数を覚えていて、それ以下なら「100位に届かなかった」と伝える。
- 順位表は、ブラウザに1分覚えておく(リロードしても、1分以内なら同じ内容)。自分が記録を更新したときだけ、すぐ読み直す。
- サーバー(Worker)も、一覧を60秒、メモリに覚えている。

### テーブルを作り直す(この決まりに切り替えるとき、1回だけ)
テーブルの形が変わった(`id` をやめて、名前を、ステージごとの主キーにした)ので、古いテーブルを消してから、作り直す。**中の記録は、すべて消える**ので、先に `export_ranking.bat` で、書き出しておくこと。
```bash
cd cloudflare
npx wrangler d1 execute osaka-ranking --remote --command "DROP TABLE IF EXISTS scores"
npx wrangler d1 execute osaka-ranking --remote --file=schema.sql
npx wrangler deploy
```
ゲーム(index.html)を公開する(push する)のと、できるだけ同じ時間に行う。古いゲームは、新しい Worker の返事の形(`{scores, cutoff}`)を読めない。

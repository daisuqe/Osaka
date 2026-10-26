# 引き継ぎ: Yokohama → Osaka

このフォルダは、`E:\User\Daisuke\Unity\Yokohama`(横浜版)のコピーです。ここから大阪版(Osaka)を作ります。
横浜版はそのまま公開・更新を続けるので、**横浜版のフォルダ・リポジトリ・Cloudflare・Googleには手を入れないこと。**
やりとりは日本語です。各回の返事の最後に「何を変えたか」と「コミット済みか」を書きます。**コミット・pushは、ユーザーが「コミットして」「pushして」と言ったときだけ。**

## 0. 最初に必ずやること(まだ未実施)
1. **`.git` が横浜版のコピーのまま残っている。** 横浜のリポジトリにpushしてしまわないように、まず削除する。
   - `Remove-Item -Recurse -Force .git` のあと、`git init`。新しいGitHubリポジトリ(`Osaka`)を作ってつなぐ(ユーザーが作る)。
2. 不要なものを消す(横浜版にはあるが、大阪版には要らない): `Yokohama.zip`、`original/`、`sample_houses/`、`tools/`(あとで使うなら残す)、`gas/`、`map_png/`、`music/`(曲データは `index.html` に埋め込み済み)。
3. `.gitignore` を確認する(`original/`、`_*.js`、`_*.py`、`_*.json`、`music/*.wav`、`cloudflare/import.sql` などを除外している)。

## 1. 最優先: 保存データのキーを変える(公開前に必須)
GitHub Pagesは `daisuqe.github.io` が同じオリジンなので、**横浜と大阪は localStorage を共有する。** キーを変えないと、セーブ・名前・ランキング登録済みスコアが混ざる。
`yokohama-` で始まるキーを、すべて `osaka-` に変える:
- `LANG_KEY`(言語)、`PROG_KEY`(進行)、`SAVE_KEY`(`yokohama-save-<map>`)、`RANK_KEY`(ローカルランキング)、`NAME_KEY`、`UID_KEY`、`LBBEST_KEY`、音量(`yokohama-vol`。2か所)、`yokohama-save-`(タイトルのContinue判定。1か所)。
- 変更後に `grep -n "yokohama-" index.html` で、残りがないことを確認する。

## 2. 名前の置き換え
- `<title>`、冒頭のコメント(著作権)、`meta`、ライセンス文(`LICENSE_JA`/`LICENSE_EN`)、`LICENSE`、`README.md`、タイトル画面の `<h2>Yokohama</h2>`。
- ファビコン(`favicon-16.png` を元に、32/48/180を作る。16x16のドット絵を、ぼかさず整数倍に拡大。180は176倍にして、まわりを背景色で埋める)。
- `MAPS` のステージID・タイトル・短い名前、`BGM_ON`、`MIDI_SONG`、`MAPID||'yokohama'` と書いてある各所(ステージIDを変えるとき)。

## 3. ランキングを分ける
- 横浜版: Google(Apps Script)とCloudflareの併用。2日後にGoogleをやめる予定。**大阪版は最初からCloudflareだけにする。**
- `cloudflare/` の `worker.js`、`schema.sql`、`wrangler.toml` をもとに、新しいWorker(`osaka-ranking`)と新しいD1データベースをCloudflareのダッシュボードで作る(ユーザーが操作する。Claudeはダッシュボードに入れない)。
  - Cloudflareの画面: 「Create application」→「Start with Hello World!」→ 名前を付けてDeploy → 「Edit code」にコードを貼る → 設定 → バインド → D1(変数名は `DB`)。表は、D1の「コンソール」に `schema.sql` を貼って作る。
- `worker.js` の `STAGES` を、大阪のステージIDにする。
- `index.html`: `LB_URL`(Google)と併用のコード(`LB_URLS`、`loadGlobal` の2か所取得)を整理して、Workerだけにする。`LB2_URL` を新しいWorkerのURLにする。
- 同じ名前のスコアは、いちばん高い1件だけを出す(今の仕様。そのまま使える)。

## 4. マップ(いちばん時間がかかる)
`MAPS` に、ステージごとの `rows`(11×11の文字列)を書く。
- 文字: `.`=更地、`r`=道路、`W`=水、`R`=線路、`S`=駅、`T`=ロープウェイの乗り場、`M`=タワー。
- 任意: `train`(電車が走る線)、`boat`、`ships`、`gondola`、`gates`(門)。
- 解放条件は `UNLOCK`(横浜版: ミナトは1ゲームで50,000点、山下町は累計150,000点)。
- 参考: 横浜版の3マップは `map_png/pixel/*_11x11.png` に、1マス=1ピクセルの画像がある(横浜版フォルダ側)。

## 5. 見た目・音
- 建物の絵: `Icons/house01〜13.png`、`shop01〜13.png`、`tree01〜13.png`(48x48、01=1 … 12=2048。13=4096は今は使わない)。道路は `Icons/road_*.png`(11種)、工事中は `construction*.png`。
- BGM: ステージごとに `MIDI_*`(埋め込み)か、手作りの関数(`bgmStepChina` など)。
- 画像・音を横浜のままで始めてもよい。

## 6. ゲームの仕組み(横浜版から引き継ぐルール)
- 同じ種類・同じ数字の建物を、道を1回まで曲がって、相手の隣までつなぐと、1つ上のレベルになる。1つつなぐごとに新築が1件増える。
- **2048が最大**(`KINDS[].max=2048`)。2048同士は合体しない。2048が1つでも出たら、以後は小さい建物を消さない(`clearLow` の `capped`)。64で1、128で1と2、256以上で1と2と4が消える。
- 新築の数字: 最大値が64未満は1/2/4、64以上は1/2/4/8、128以上は2/4/8。
- 更地がなくなったら、街の完成(ステージクリア)。そこからランキングへ。
- 保存は1ターンごと、ステージごと(複数のステージを同時に途中で保存できる)。
- URLは、いつもページのアドレスだけ(`?map=` は読み込み後に消す)。画面の移動は `location.replace`。
- 言語: ブラウザの言語が ja なら日本語、それ以外は英語(設定メニューで切り替え)。文章は `TXT.ja` / `TXT.en` と `tr()`。日本語は全角のカッコ、英語は半角。
- タイトル画面の右上に、アプリ一覧(`https://daisuqe.github.io/`)へ移動するボタン(確認ダイアログつき)。
- スコア: 合体で `10×4^(レベル-1)` 点。

## 7. このコードの癖(つまずきやすい点)
- `index.html` 1ファイル(約2,600行)。ゲーム全体が入っている。
- Windowsなので、PythonでJapaneseを含む文章を置換するときは、標準入力のヒアドキュメントが文字化けすることがある。**パッチはファイルに書いて(Writeツール)、`python ファイル` で実行する。** 読み書きは `io.open(..., encoding='utf-8')`。
- 動作確認は、ブラウザ(`mcp__Claude_Browser__*`)で、`python -m http.server <ポート>` を起動して `http://127.0.0.1:<ポート>/index.html?map=<id>&dev=1` を開く。`dev=1` で全ステージを開放。キャッシュ対策に `&v=<番号>`。**ポート8765は、別のプロジェクトが使っていることがある。8791などを使う。** 確認後はサーバーを止める。
- テストで保存データができる。ページを閉じるときに保存されるので、消したいときは `saveOff=true; removeEventListener('pagehide',saveGame)` のあとに `localStorage` を消す。
- `canvas{position:fixed;...}` という全体の指定があるので、ボタンの中の `canvas` には `position:static` が必要。
- ランキングの確認で本物のWorkerに送ると、本番に記録が入る。確認は、`fetch` を差し替えて通信を模擬するか、`?dev=1&lb2=...` で別のURLにする。

## 8. 横浜版の現状(参考)
- 最新コミット: `5a12e36`(ファビコン追加)。公開: `https://daisuqe.github.io/Yokohama/`。
- 横浜版のCloudflare Worker: `https://yokohama-ranking.haradadaisuke.workers.dev/`(大阪版では使わない)。
- 横浜版は、2日後に、Googleのランキングを外す予定(`LB_URL` を空にする)。大阪版には関係しない。

## 9. 進め方のおすすめ
1. 手順0〜3(`.git`、キー、名前、ランキング)だけで「Osaka」の名前で動く状態にする。
2. そのあとマップ、絵、音に進む。
3. 公開前に、ブラウザで、保存・ランキング送信・日英・スマホ表示を確認する。

最初に確認すること: ステージの数と名前、建物の絵と音楽を最初は横浜のままにするか。

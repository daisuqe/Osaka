-- Osaka ランキング用のテーブル(Cloudflare D1)
-- ステージごとに、1人1件(同じ名前は、大文字小文字を区別しない)。上位100人だけを残す。
CREATE TABLE IF NOT EXISTS scores (
  stage      TEXT    NOT NULL,
  name       TEXT    NOT NULL COLLATE NOCASE,
  score      INTEGER NOT NULL,
  level      INTEGER NOT NULL,
  turns      INTEGER NOT NULL DEFAULT 0,    -- 手数(合体とパス)
  duration   INTEGER NOT NULL DEFAULT 0,    -- プレイ時間(ミリ秒)
  created_at INTEGER NOT NULL DEFAULT 0,    -- 登録時刻(ミリ秒)。連続登録の制限に使う
  ip_hash    TEXT    NOT NULL DEFAULT '',   -- 連続登録・別名の制限に使う(IPそのものは保存しない)
  country    TEXT,
  updated    TEXT,
  PRIMARY KEY (stage, name)
);
CREATE INDEX IF NOT EXISTS idx_scores_rank ON scores (stage, score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_ip   ON scores (ip_hash, created_at DESC);

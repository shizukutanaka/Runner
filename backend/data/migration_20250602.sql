-- comments テーブルの拡張
ALTER TABLE comments ADD COLUMN avatar_url TEXT;
ALTER TABLE comments ADD COLUMN background_color TEXT;
ALTER TABLE comments ADD COLUMN highlight INTEGER DEFAULT 0;
ALTER TABLE comments ADD COLUMN pinned INTEGER DEFAULT 0;
ALTER TABLE comments ADD COLUMN auto_archive INTEGER DEFAULT 0;
ALTER TABLE comments ADD COLUMN external_shared INTEGER DEFAULT 0;
ALTER TABLE comments ADD COLUMN edit_history TEXT;
ALTER TABLE comments ADD COLUMN notification_frequency TEXT;

-- users テーブルの拡張
ALTER TABLE users ADD COLUMN notification_frequency TEXT;
ALTER TABLE users ADD COLUMN external_integration INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN profile_image TEXT;
ALTER TABLE users ADD COLUMN bio TEXT;
ALTER TABLE users ADD COLUMN language TEXT;
ALTER TABLE users ADD COLUMN timezone TEXT;
ALTER TABLE users ADD COLUMN subscribed INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN auth_history TEXT;
ALTER TABLE users ADD COLUMN security TEXT;

-- moderation_settings テーブルの拡張
ALTER TABLE moderation_settings ADD COLUMN auto_learning INTEGER DEFAULT 0;
ALTER TABLE moderation_settings ADD COLUMN model TEXT;
ALTER TABLE moderation_settings ADD COLUMN explanation TEXT;
ALTER TABLE moderation_settings ADD COLUMN export_url TEXT;
ALTER TABLE moderation_settings ADD COLUMN word_weights TEXT;
ALTER TABLE moderation_settings ADD COLUMN banned_word_history TEXT;
ALTER TABLE moderation_settings ADD COLUMN external_words TEXT;
ALTER TABLE moderation_settings ADD COLUMN translated_words TEXT;

-- settings テーブル（新規）
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theme TEXT,
  layout TEXT,
  notifications INTEGER DEFAULT 1,
  default_language TEXT,
  timezone TEXT,
  admin_email TEXT,
  api_keys TEXT,
  external_integration INTEGER DEFAULT 0,
  ui_custom TEXT,
  auto_backup INTEGER DEFAULT 0,
  version TEXT,
  terms TEXT,
  help TEXT
);

-- analytics テーブル（新規）
CREATE TABLE IF NOT EXISTS analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT,
  value TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

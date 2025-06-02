const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// データベース接続
const db = new sqlite3.Database(path.join(__dirname, '../data/comments.db'), (err) => {
  if (err) {
    console.error('Error connecting to database:', err);
  } else {
    console.log('Connected to SQLite database');
  }
});

// データベース初期化
const initializeDB = () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      user TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp DATETIME NOT NULL,
      status TEXT DEFAULT 'active',
      moderation_reason TEXT,
      moderation_timestamp DATETIME,
      moderator TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      username TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      warning_count INTEGER DEFAULT 0,
      ban_until DATETIME,
      mute_until DATETIME,
      history TEXT
    );

    CREATE TABLE IF NOT EXISTS moderation_settings (
      platform TEXT PRIMARY KEY,
      thresholds TEXT,
      banned_words TEXT,
      regex_patterns TEXT,
      last_updated DATETIME
    );
  `;

  db.exec(sql, (err) => {
    if (err) {
      console.error('Error initializing database:', err);
    } else {
      console.log('Database initialized successfully');
    }
  });
};

// データベース初期化
initializeDB();

module.exports = db;

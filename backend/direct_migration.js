const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

async function runMigration() {
  const dbPath = path.join(__dirname, 'data', 'database.db');
  const db = new Database(dbPath);

  try {
    console.log('Running notification events migration...');

    // マイグレーションファイルを読み込み
    const migrationPath = path.join(__dirname, 'migrations', '20250126000000_add_notification_events_channels.js');
    const migration = require(migrationPath);

    // マイグレーションを実行
    await migration.up(db);

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

runMigration();

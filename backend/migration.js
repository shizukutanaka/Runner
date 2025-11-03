#!/usr/bin/env node

/**
 * YouTube & Twitch Comment Manager - データベースマイグレーションシステム
 * 使用方法: node migration.js [コマンド] [オプション]
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

class DatabaseMigration {
  constructor() {
    this.migrationsDir = path.join(__dirname, 'migrations');
    this.dbPath = path.join(__dirname, 'data', 'database.db');
    this.migrationTable = 'schema_migrations';

    // マイグレーションテーブルが存在しない場合は作成
    this.ensureMigrationTable();
  }

  // マイグレーションテーブルの作成
  ensureMigrationTable() {
    const db = new sqlite3.Database(this.dbPath);

    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS ${this.migrationTable} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          version TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          description TEXT,
          checksum TEXT NOT NULL,
          executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          execution_time INTEGER,
          success BOOLEAN DEFAULT 1,
          error_message TEXT
        )
      `);

      // インデックス作成
      db.run(`CREATE INDEX IF NOT EXISTS idx_migration_version ON ${this.migrationTable}(version)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_migration_success ON ${this.migrationTable}(success)`);
    });

    db.close();
  }

  // マイグレーションファイルの読み込み
  loadMigrationFiles() {
    if (!fs.existsSync(this.migrationsDir)) {
      console.log('マイグレーションディレクトリが存在しません。作成します...');
      fs.mkdirSync(this.migrationsDir, { recursive: true });
      return [];
    }

    const files = fs.readdirSync(this.migrationsDir)
      .filter(file => file.endsWith('.js') || file.endsWith('.sql'))
      .sort();

    return files.map(file => {
      const filePath = path.join(this.migrationsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const checksum = crypto.createHash('sha256').update(content).digest('hex');

      // ファイル名からバージョンと名前を抽出
      const match = file.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})_(.+)\.(js|sql)$/);
      if (!match) {
        throw new Error(`Invalid migration file name: ${file}. Expected format: YYYYMMDDHHMMSS_description.js`);
      }

      const [, year, month, day, hour, minute, second, name] = match;
      const version = `${year}${month}${day}${hour}${minute}${second}`;

      return {
        version,
        name: name.replace(/_/g, ' '),
        file,
        path: filePath,
        checksum,
        type: file.endsWith('.sql') ? 'sql' : 'js'
      };
    });
  }

  // 実行済みマイグレーションの取得
  getExecutedMigrations() {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.dbPath);

      db.all(
        `SELECT version, checksum, executed_at, execution_time, success, error_message
         FROM ${this.migrationTable}
         ORDER BY version ASC`,
        (err, rows) => {
          db.close();

          if (err) {
            reject(err);
            return;
          }

          resolve(rows || []);
        }
      );
    });
  }

  // マイグレーションの実行
  async runMigrations(direction = 'up', targetVersion = null) {
    const migrationFiles = this.loadMigrationFiles();
    const executedMigrations = await this.getExecutedMigrations();

    // 実行済みマイグレーションのマップを作成
    const executedMap = new Map();
    executedMigrations.forEach(m => {
      executedMap.set(m.version, m);
    });

    // 実行するマイグレーションをフィルタリング
    let migrationsToRun = migrationFiles.filter(m => {
      const executed = executedMap.get(m.version);
      if (direction === 'up') {
        return !executed || !executed.success;
      } else {
        return executed && executed.success;
      }
    });

    // ターゲットバージョンまで実行
    if (targetVersion) {
      migrationsToRun = migrationsToRun.filter(m => {
        if (direction === 'up') {
          return m.version <= targetVersion;
        } else {
          return m.version >= targetVersion;
        }
      });
    }

    // 実行順序をソート
    migrationsToRun.sort((a, b) => {
      if (direction === 'up') {
        return a.version.localeCompare(b.version);
      } else {
        return b.version.localeCompare(a.version);
      }
    });

    if (migrationsToRun.length === 0) {
      console.log(`実行する${direction === 'up' ? 'マイグレーション' : 'ロールバック'}はありません。`);
      return { success: true, executed: 0 };
    }

    console.log(`${migrationsToRun.length}個の${direction === 'up' ? 'マイグレーション' : 'ロールバック'}を実行します...`);

    let successCount = 0;
    let errorCount = 0;

    for (const migration of migrationsToRun) {
      try {
        console.log(`\n${direction === 'up' ? '実行' : 'ロールバック'}: ${migration.version} - ${migration.name}`);

        const startTime = Date.now();
        const success = await this.executeMigration(migration, direction);
        const executionTime = Date.now() - startTime;

        if (success) {
          await this.recordMigrationResult(migration, executionTime, null);
          console.log(`✅ ${migration.version} - ${migration.name} (${executionTime}ms)`);
          successCount++;
        } else {
          await this.recordMigrationResult(migration, executionTime, 'Execution failed');
          console.log(`❌ ${migration.version} - ${migration.name} (${executionTime}ms)`);
          errorCount++;
          break; // エラーが発生したら停止
        }
      } catch (error) {
        console.error(`❌ ${migration.version} - ${migration.name}: ${error.message}`);
        await this.recordMigrationResult(migration, 0, error.message);
        errorCount++;
        break;
      }
    }

    console.log(`\nマイグレーション結果: ${successCount}成功, ${errorCount}失敗`);

    return {
      success: errorCount === 0,
      executed: successCount,
      failed: errorCount,
      total: migrationsToRun.length
    };
  }

  // 個別マイグレーションの実行
  async executeMigration(migration, direction) {
    const db = new sqlite3.Database(this.dbPath);

    try {
      if (migration.type === 'sql') {
        const sql = fs.readFileSync(migration.path, 'utf8');

        if (direction === 'down') {
          // SQLファイルからダウンマイグレーションを生成（簡易版）
          return await this.executeSQLRollback(db, sql);
        } else {
          return await this.executeSQL(db, sql);
        }
      } else {
        // JavaScriptマイグレーション
        const migrationModule = require(migration.path);
        const result = await migrationModule[direction](db);

        return result !== false; // falseが返された場合のみ失敗とする
      }
    } finally {
      db.close();
    }
  }

  // SQLの実行
  executeSQL(db, sql) {
    return new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(true);
      });
    });
  }

  // SQLのロールバック（簡易版）
  async executeSQLRollback(db, sql) {
    // 実際のロールバックSQLは別途作成する必要がある
    // ここでは簡易的なロールバック処理を行う
    console.log('SQLロールバックは手動で作成してください');
    return false;
  }

  // マイグレーション結果の記録
  recordMigrationResult(migration, executionTime, errorMessage) {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.dbPath);

      const success = !errorMessage;
      const query = `
        INSERT OR REPLACE INTO ${this.migrationTable}
        (version, name, description, checksum, execution_time, success, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      db.run(query, [
        migration.version,
        migration.name,
        `Migration: ${migration.name}`,
        migration.checksum,
        executionTime,
        success ? 1 : 0,
        errorMessage || null
      ], function(err) {
        db.close();

        if (err) {
          reject(err);
          return;
        }

        resolve();
      });
    });
  }

  // マイグレーションの作成
  createMigration(name, description = '') {
    const now = new Date();
    const version = now.getFullYear().toString() +
                   String(now.getMonth() + 1).padStart(2, '0') +
                   String(now.getDate()).padStart(2, '0') +
                   String(now.getHours()).padStart(2, '0') +
                   String(now.getMinutes()).padStart(2, '0') +
                   String(now.getSeconds()).padStart(2, '0');

    const filename = `${version}_${name.replace(/\s+/g, '_')}.js`;
    const filepath = path.join(this.migrationsDir, filename);

    const template = `/**
 * Migration: ${name}
 * Version: ${version}
 * Description: ${description}
 */

module.exports = {
  up: async (db) => {
    // マイグレーション処理をここに記述
    console.log('Migration ${name}: up');

    // 例:
    // db.run('CREATE TABLE IF NOT EXISTS example (id INTEGER PRIMARY KEY, name TEXT)');

    return true;
  },

  down: async (db) => {
    // ロールバック処理をここに記述
    console.log('Migration ${name}: down');

    // 例:
    // db.run('DROP TABLE IF EXISTS example');

    return true;
  }
};
`;

    fs.writeFileSync(filepath, template, 'utf8');

    console.log(`マイグレーションファイルを作成しました: ${filepath}`);

    return { version, filename, filepath };
  }

  // マイグレーションステータスの表示
  async showStatus() {
    const migrationFiles = this.loadMigrationFiles();
    const executedMigrations = await this.getExecutedMigrations();

    console.log('\n=== マイグレーションステータス ===\n');

    const executedMap = new Map();
    executedMigrations.forEach(m => {
      executedMap.set(m.version, m);
    });

    console.log('実行可能なマイグレーション:');
    migrationFiles.forEach(m => {
      const executed = executedMap.get(m.version);
      const status = executed ?
        (executed.success ? '✅ 実行済み' : '❌ 失敗') :
        '⏳ 未実行';

      console.log(`  ${m.version} - ${m.name} [${status}]`);

      if (executed && !executed.success) {
        console.log(`    エラー: ${executed.error_message}`);
      }
    });

    console.log(`\n合計: ${migrationFiles.length}個のマイグレーション`);
    console.log(`実行済み: ${executedMigrations.filter(m => m.success).length}個`);
    console.log(`失敗: ${executedMigrations.filter(m => !m.success).length}個`);
  }

  // データベースのロールバック
  async rollback(steps = 1) {
    const executedMigrations = await this.getExecutedMigrations();
    const successfulMigrations = executedMigrations.filter(m => m.success);

    if (successfulMigrations.length === 0) {
      console.log('ロールバック可能なマイグレーションがありません。');
      return { success: true, rolledBack: 0 };
    }

    const migrationsToRollback = successfulMigrations.slice(-steps);

    console.log(`${migrationsToRollback.length}個のマイグレーションをロールバックします...`);

    let successCount = 0;
    let errorCount = 0;

    for (const migration of migrationsToRollback.reverse()) {
      try {
        const migrationFile = this.loadMigrationFiles().find(m => m.version === migration.version);
        if (!migrationFile) {
          console.log(`⚠️  マイグレーションファイルが見つかりません: ${migration.version}`);
          continue;
        }

        console.log(`\nロールバック: ${migration.version} - ${migrationFile.name}`);

        const startTime = Date.now();
        const success = await this.executeMigration(migrationFile, 'down');
        const executionTime = Date.now() - startTime;

        if (success) {
          await this.recordMigrationResult(migrationFile, executionTime, null);
          await this.markMigrationAsNotExecuted(migration.version);
          console.log(`✅ ${migration.version} - ${migrationFile.name} (${executionTime}ms)`);
          successCount++;
        } else {
          console.log(`❌ ${migration.version} - ${migrationFile.name} (${executionTime}ms)`);
          errorCount++;
          break;
        }
      } catch (error) {
        console.error(`❌ ${migration.version}: ${error.message}`);
        errorCount++;
        break;
      }
    }

    console.log(`\nロールバック結果: ${successCount}成功, ${errorCount}失敗`);

    return {
      success: errorCount === 0,
      rolledBack: successCount,
      failed: errorCount
    };
  }

  // マイグレーションの実行記録を削除
  markMigrationAsNotExecuted(version) {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.dbPath);

      db.run(
        `DELETE FROM ${this.migrationTable} WHERE version = ?`,
        [version],
        function(err) {
          db.close();

          if (err) {
            reject(err);
            return;
          }

          resolve();
        }
      );
    });
  }
}

// コマンドライン引数の処理
function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const migration = new DatabaseMigration();

  switch (command) {
    case 'create':
      if (args.length < 2) {
        console.error('使用方法: node migration.js create <name> [description]');
        process.exit(1);
      }
      const name = args[1];
      const description = args[2] || '';
      migration.createMigration(name, description);
      break;

    case 'up':
      migration.runMigrations('up', args[1] || null)
        .then(result => {
          console.log(`マイグレーション完了: ${result.executed}実行, ${result.failed}失敗`);
          process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
          console.error('マイグレーションエラー:', error);
          process.exit(1);
        });
      break;

    case 'down':
      const steps = args[1] ? parseInt(args[1]) : 1;
      migration.rollback(steps)
        .then(result => {
          console.log(`ロールバック完了: ${result.rolledBack}実行, ${result.failed}失敗`);
          process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
          console.error('ロールバックエラー:', error);
          process.exit(1);
        });
      break;

    case 'status':
      migration.showStatus()
        .catch(error => {
          console.error('ステータス取得エラー:', error);
          process.exit(1);
        });
      break;

    case 'reset':
      console.log('警告: すべてのマイグレーションをリセットします。この操作は取り消せません。');
      console.log('続行するには "yes" と入力してください:');
      process.stdin.once('data', (data) => {
        if (data.toString().trim().toLowerCase() === 'yes') {
          migration.getExecutedMigrations()
            .then(executed => {
              const successful = executed.filter(m => m.success);
              return migration.rollback(successful.length);
            })
            .then(() => {
              console.log('マイグレーションデータをリセットしました。');
              process.exit(0);
            })
            .catch(error => {
              console.error('リセットエラー:', error);
              process.exit(1);
            });
        } else {
          console.log('リセットをキャンセルしました。');
          process.exit(0);
        }
      });
      break;

    default:
      console.log(`
YouTube & Twitch Comment Manager - データベースマイグレーション

使用方法: node migration.js <コマンド> [オプション]

コマンド:
  create <name> [description]  新しいマイグレーションファイルを作成
  up [target]                  マイグレーションを実行 (target: ターゲットバージョン)
  down [steps]                 最新のマイグレーションをロールバック (steps: ステップ数)
  status                       マイグレーションステータスを表示
  reset                        すべてのマイグレーションをリセット

例:
  node migration.js create add_user_table "Add users table"
  node migration.js up
  node migration.js down 1
  node migration.js status

マイグレーションファイルの命名規則:
  YYYYMMDDHHMMSS_description.js

  例: 20231201120000_add_user_table.js
`);
      process.exit(0);
  }
}

// スクリプトが直接実行された場合
if (require.main === module) {
  main();
}

module.exports = DatabaseMigration;

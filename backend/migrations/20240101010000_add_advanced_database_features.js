// backend/migrations/20240101010000_add_advanced_database_features.js
'use strict';

/**
 * 高度なデータベース機能の追加マイグレーション
 * - パフォーマンス監視テーブル
 * - バックアップ管理テーブル
 * - システム統計テーブル
 * - 高度なインデックス設定
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // パフォーマンス統計テーブル
    await queryInterface.createTable('performance_stats', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      metric_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: '統計情報の種類（query, memory, cpuなど）'
      },
      metric_name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: '統計情報の名前'
      },
      metric_value: {
        type: Sequelize.DECIMAL(15, 4),
        allowNull: false,
        comment: '統計値'
      },
      metric_unit: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: '単位（ms, MB, countなど）'
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: '追加のメタデータ'
      },
      recorded_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        comment: '記録時刻'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // バックアップ管理テーブル
    await queryInterface.createTable('backup_logs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      backup_type: {
        type: Sequelize.ENUM('full', 'incremental', 'schema'),
        allowNull: false,
        comment: 'バックアップの種類'
      },
      filename: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'バックアップファイル名'
      },
      file_path: {
        type: Sequelize.STRING(500),
        allowNull: false,
        comment: 'バックアップファイルパス'
      },
      file_size: {
        type: Sequelize.BIGINT,
        allowNull: false,
        comment: 'ファイルサイズ（バイト）'
      },
      tables_included: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        comment: '含まれるテーブル一覧'
      },
      status: {
        type: Sequelize.ENUM('running', 'completed', 'failed', 'cancelled'),
        allowNull: false,
        defaultValue: 'running',
        comment: 'バックアップ状態'
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      duration_ms: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '実行時間（ミリ秒）'
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'エラーメッセージ'
      },
      checksum: {
        type: Sequelize.STRING(128),
        allowNull: true,
        comment: 'チェックサム'
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'Users',
          key: 'id'
        },
        comment: '実行ユーザーID'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // システムイベントログテーブル
    await queryInterface.createTable('system_events', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      event_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'イベント種類（error, warning, info, security）'
      },
      event_category: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'イベントカテゴリ（database, api, authなど）'
      },
      event_name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'イベント名'
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'イベントメッセージ'
      },
      severity: {
        type: Sequelize.ENUM('low', 'medium', 'high', 'critical'),
        allowNull: false,
        defaultValue: 'medium',
        comment: '重要度'
      },
      source: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'イベント発生源'
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'Users',
          key: 'id'
        },
        comment: '関連ユーザーID'
      },
      ip_address: {
        type: Sequelize.INET,
        allowNull: true,
        comment: 'IPアドレス'
      },
      user_agent: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'ユーザエージェント'
      },
      request_id: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'リクエストID'
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: '追加のメタデータ'
      },
      resolved: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '解決済みフラグ'
      },
      resolved_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '解決時刻'
      },
      resolved_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'Users',
          key: 'id'
        },
        comment: '解決ユーザーID'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // クエリ統計テーブル
    await queryInterface.createTable('query_stats', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      query_hash: {
        type: Sequelize.STRING(64),
        allowNull: false,
        comment: 'クエリハッシュ値'
      },
      query_type: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: 'クエリ種類（SELECT, INSERT, UPDATE, DELETE）'
      },
      table_name: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: '対象テーブル名'
      },
      execution_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: '実行回数'
      },
      total_time_ms: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '合計実行時間（ミリ秒）'
      },
      avg_time_ms: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '平均実行時間（ミリ秒）'
      },
      min_time_ms: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '最小実行時間（ミリ秒）'
      },
      max_time_ms: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '最大実行時間（ミリ秒）'
      },
      error_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'エラー回数'
      },
      last_executed: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        comment: '最終実行時刻'
      },
      query_pattern: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'クエリパターン（パラメータ化後）'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // 高度なインデックスの作成
    await queryInterface.addIndex('performance_stats', ['metric_type', 'recorded_at'], {
      name: 'idx_performance_stats_type_recorded'
    });

    await queryInterface.addIndex('performance_stats', ['recorded_at'], {
      name: 'idx_performance_stats_recorded_at'
    });

    await queryInterface.addIndex('backup_logs', ['status', 'created_at'], {
      name: 'idx_backup_logs_status_created'
    });

    await queryInterface.addIndex('backup_logs', ['backup_type'], {
      name: 'idx_backup_logs_type'
    });

    await queryInterface.addIndex('system_events', ['event_type', 'severity', 'createdAt'], {
      name: 'idx_system_events_type_severity_created'
    });

    await queryInterface.addIndex('system_events', ['user_id'], {
      name: 'idx_system_events_user_id'
    });

    await queryInterface.addIndex('system_events', ['resolved'], {
      name: 'idx_system_events_resolved'
    });

    await queryInterface.addIndex('query_stats', ['query_hash'], {
      name: 'idx_query_stats_hash',
      unique: true
    });

    await queryInterface.addIndex('query_stats', ['table_name', 'last_executed'], {
      name: 'idx_query_stats_table_executed'
    });

    await queryInterface.addIndex('query_stats', ['avg_time_ms'], {
      name: 'idx_query_stats_avg_time'
    });

    // パーティション設定（大規模データ対応）
    if (queryInterface.sequelize.getDialect() === 'postgres') {
      // パフォーマンス統計の月別パーティション
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS performance_stats_y2024m01 PARTITION OF performance_stats
        FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

        CREATE TABLE IF NOT EXISTS performance_stats_y2024m02 PARTITION OF performance_stats
        FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
      `);

      // システムイベントの月別パーティション
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS system_events_y2024m01 PARTITION OF system_events
        FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
      `);
    }

    console.log('高度なデータベース機能が正常に作成されました。');
  },

  async down(queryInterface, Sequelize) {
    // 作成したテーブルの削除
    await queryInterface.dropTable('query_stats');
    await queryInterface.dropTable('system_events');
    await queryInterface.dropTable('backup_logs');
    await queryInterface.dropTable('performance_stats');

    console.log('高度なデータベース機能が正常に削除されました。');
  }
};

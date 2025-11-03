// backend/migrations/20240101000000_add_performance_indexes.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // ユーザーテーブルにインデックスを追加
    await queryInterface.addIndex('Users', ['email'], {
      name: 'idx_users_email',
      unique: true,
      where: {
        deletedAt: null
      }
    });

    await queryInterface.addIndex('Users', ['createdAt'], {
      name: 'idx_users_created_at'
    });

    await queryInterface.addIndex('Users', ['isActive', 'deletedAt'], {
      name: 'idx_users_active_status'
    });

    // 複合インデックス（認証用）
    await queryInterface.addIndex('Users', ['email', 'isActive'], {
      name: 'idx_users_email_active'
    });

    // コメントテーブルのインデックス（頻繁に検索されるカラム）
    await queryInterface.addIndex('Comments', ['userId'], {
      name: 'idx_comments_user_id'
    });

    await queryInterface.addIndex('Comments', ['createdAt'], {
      name: 'idx_comments_created_at'
    });

    await queryInterface.addIndex('Comments', ['isApproved'], {
      name: 'idx_comments_approved'
    });

    // 複合インデックス（ユーザーコメント検索用）
    await queryInterface.addIndex('Comments', ['userId', 'createdAt'], {
      name: 'idx_comments_user_created'
    });

    // 通知テーブルのインデックス
    await queryInterface.addIndex('Notifications', ['userId'], {
      name: 'idx_notifications_user_id'
    });

    await queryInterface.addIndex('Notifications', ['isRead'], {
      name: 'idx_notifications_read'
    });

    await queryInterface.addIndex('Notifications', ['createdAt'], {
      name: 'idx_notifications_created_at'
    });

    // 複合インデックス（未読通知取得用）
    await queryInterface.addIndex('Notifications', ['userId', 'isRead', 'createdAt'], {
      name: 'idx_notifications_user_read_created'
    });

    // セッションテーブルのインデックス（認証用）
    await queryInterface.addIndex('Sessions', ['userId'], {
      name: 'idx_sessions_user_id'
    });

    await queryInterface.addIndex('Sessions', ['token'], {
      name: 'idx_sessions_token',
      unique: true
    });

    await queryInterface.addIndex('Sessions', ['expiresAt'], {
      name: 'idx_sessions_expires_at'
    });

    // 複合インデックス（アクティブセッション検索用）
    await queryInterface.addIndex('Sessions', ['userId', 'expiresAt'], {
      name: 'idx_sessions_user_expires'
    });

    // ログテーブルのインデックス（分析用）
    await queryInterface.addIndex('Logs', ['level'], {
      name: 'idx_logs_level'
    });

    await queryInterface.addIndex('Logs', ['timestamp'], {
      name: 'idx_logs_timestamp'
    });

    await queryInterface.addIndex('Logs', ['userId'], {
      name: 'idx_logs_user_id'
    });

    // 複合インデックス（ログ分析用）
    await queryInterface.addIndex('Logs', ['level', 'timestamp'], {
      name: 'idx_logs_level_timestamp'
    });

    await queryInterface.addIndex('Logs', ['userId', 'timestamp'], {
      name: 'idx_logs_user_timestamp'
    });

    // フルテキスト検索インデックス（コメント内容検索用）
    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.addIndex('Comments', ['content'], {
        type: 'FULLTEXT',
        name: 'idx_comments_content_fulltext'
      });
    }

    // パーティション作成（大規模データ対応）
    // PostgreSQLの場合のパーティション設定例
    if (queryInterface.sequelize.getDialect() === 'postgres') {
      // ログテーブルのパーティション作成（月別）
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS logs_y2024m01 PARTITION OF logs
        FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

        CREATE TABLE IF NOT EXISTS logs_y2024m02 PARTITION OF logs
        FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
      `);

      // コメントテーブルのパーティション作成（年別）
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS comments_y2024 PARTITION OF comments
        FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
      `);
    }

    console.log('パフォーマンスインデックスが正常に作成されました。');
  },

  async down(queryInterface, Sequelize) {
    // 作成したインデックスの削除
    const indexesToDrop = [
      'idx_users_email',
      'idx_users_created_at',
      'idx_users_active_status',
      'idx_users_email_active',
      'idx_comments_user_id',
      'idx_comments_created_at',
      'idx_comments_approved',
      'idx_comments_user_created',
      'idx_notifications_user_id',
      'idx_notifications_read',
      'idx_notifications_created_at',
      'idx_notifications_user_read_created',
      'idx_sessions_user_id',
      'idx_sessions_token',
      'idx_sessions_expires_at',
      'idx_sessions_user_expires',
      'idx_logs_level',
      'idx_logs_timestamp',
      'idx_logs_user_id',
      'idx_logs_level_timestamp',
      'idx_logs_user_timestamp'
    ];

    for (const indexName of indexesToDrop) {
      try {
        await queryInterface.removeIndex('Users', indexName);
        await queryInterface.removeIndex('Comments', indexName);
        await queryInterface.removeIndex('Notifications', indexName);
        await queryInterface.removeIndex('Sessions', indexName);
        await queryInterface.removeIndex('Logs', indexName);
      } catch (error) {
        console.log(`インデックス ${indexName} の削除に失敗しました:`, error.message);
      }
    }

    // フルテキストインデックスの削除
    if (queryInterface.sequelize.getDialect() === 'postgres') {
      try {
        await queryInterface.removeIndex('Comments', 'idx_comments_content_fulltext');
      } catch (error) {
        console.log('フルテキストインデックスの削除に失敗しました:', error.message);
      }
    }

    console.log('パフォーマンスインデックスが正常に削除されました。');
  }
};

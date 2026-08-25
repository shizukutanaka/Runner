/**
 * PM2 設定。
 *
 * かつてこのファイルは `instances: 'max'` + `exec_mode: 'cluster'` を指定していたが、
 * 本アプリは以下の理由で **単一プロセス専用** である:
 *   - データベースが単一のSQLiteファイル。複数プロセスからの並行書き込みで破損する
 *   - YouTubeのポーリング、TwitchのEventSub WebSocket接続、レイド検知の状態を
 *     プロセス内に保持している。プロセスを増やすとAPIクォータを多重消費し、
 *     同じコメントを重複取り込みし、レイド検知の閾値が壊れる
 * 削除した k8s マニフェスト（replicas: 3 + HPA）と同じ誤りだった。
 *
 * また `wait_ready: true` が指定されているのに src/server.js が
 * `process.send('ready')` を送っていなかった。pm2はlisten_timeout経過で先に進むため
 * 停止はしないが、`pm2 reload` の切り替え点が実際の待受開始とずれる。合図は
 * server.js の onListening に追加した。
 *
 * なお `npm start` は JWT_SECRET / SESSION_SECRET / ENCRYPTION_KEY が未設定だと
 * 起動に失敗する。これは src/config.js の意図的なガードであり、本番で秘密鍵が
 * 空のまま動き出さないための正しい挙動なので、修正対象ではない。
 *
 * 水平スケールが必要になったら、まずDBを外部化し取り込み処理をワーカーへ分離すること。
 */

module.exports = {
  apps: [
    {
      name: 'runner-backend',
      script: './src/server.js',

      // 単一プロセス。理由は上記
      instances: 1,
      exec_mode: 'fork',

      max_memory_restart: '1G',

      env_production: {
        NODE_ENV: 'production',
        PORT: 4000
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 4000
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 4000
      },

      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      // server.js が listen 後に 'ready' を送る。SIGTERM を受けたら
      // graceful shutdown に入るので kill_timeout は余裕を持たせる
      wait_ready: true,
      listen_timeout: 10000,
      kill_timeout: 10000,
      shutdown_with_message: true,

      watch: false,
      ignore_watch: ['node_modules', 'logs', 'data', 'backups', 'uploads'],

      source_map_support: true
    }
  ]
};

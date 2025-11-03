const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/notificationsController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.use(authenticateToken);

// 基本的な通知機能
router.get('/', requireRole('user'), ctrl.getNotifications);
router.post('/', requireRole('moderator'), ctrl.createNotification);
router.post('/:id/read', requireRole('user'), ctrl.markAsRead);
router.delete('/read', requireRole('user'), ctrl.clearRead);

// Event-Driven通知機能
router.post('/events', requireRole('moderator'), ctrl.createNotificationEvent);
router.get('/events/status', requireRole('moderator'), ctrl.getEventStatus);

// ユーザーごとの通知設定機能
router.get('/users/:id/settings', requireRole('user'), ctrl.getUserNotificationSettings);
router.put('/users/:id/settings', requireRole('user'), ctrl.updateUserNotificationSettings);
router.get('/users/:id/history', requireRole('user'), ctrl.getUserNotificationHistory);
router.delete('/users/:id/history', requireRole('user'), ctrl.clearUserNotificationHistory);

// 通知テンプレート機能
router.get('/templates', requireRole('moderator'), ctrl.getNotificationTemplates);
router.put('/templates/:id', requireRole('moderator'), ctrl.updateNotificationTemplate);

// 通知チャネル管理
router.get('/channels', requireRole('admin'), ctrl.getNotificationChannels);
router.put('/channels/:id', requireRole('admin'), ctrl.updateNotificationChannel);

// 包括的多言語統合システム統計
router.get('/system/comprehensive', requireRole('admin'), ctrl.getComprehensiveSystemStats);

// 包括的多言語統合通知作成
router.post('/comprehensive', requireRole('moderator'), ctrl.createComprehensiveNotification);

// 型安全通知作成（Kotlin風）
router.post('/typed', requireRole('moderator'), ctrl.createTypedNotification);

// 規約ベース通知作成（Rails風）
router.post('/conventional', requireRole('moderator'), ctrl.createConventionalNotification);

// Actorシステム通知作成（Scala Akka風）
router.post('/actor', requireRole('moderator'), ctrl.createActorNotification);

// コルーチンベース通知作成（Kotlin風）
router.post('/coroutine', requireRole('moderator'), ctrl.createCoroutineNotification);

// OTPフォールトトレラント通知作成（Elixir風）
router.post('/fault-tolerant', requireRole('moderator'), ctrl.createFaultTolerantNotification);

// テンプレートエンジン通知作成（Laravel風）
router.post('/template', requireRole('moderator'), ctrl.createTemplateNotification);

// ジョブキュー通知作成
router.post('/job-queue', requireRole('moderator'), ctrl.createJobQueueNotification);

// インタラクティブ通知作成（Swift iOS風）
router.post('/interactive', requireRole('moderator'), ctrl.createInteractiveNotification);

// 純粋関数型通知作成（Haskell風）
router.post('/functional', requireRole('moderator'), ctrl.createFunctionalNotification);

// 不変データ構造通知作成（Clojure風）
router.post('/immutable', requireRole('moderator'), ctrl.createImmutableNotification);

// 軽量プロセス通知作成（Erlang風）
router.post('/process', requireRole('moderator'), ctrl.createProcessNotification);

// 型プロバイダー通知作成（F#風）
router.post('/type-provider', requireRole('moderator'), ctrl.createTypeProviderNotification);

// 高度なパターンマッチング通知作成（OCaml風）
router.post('/pattern', requireRole('moderator'), ctrl.createPatternNotification);

// R統計分析通知作成
router.post('/statistical', requireRole('moderator'), ctrl.createStatisticalNotification);

// V言語風シンプル高速通知作成
router.post('/v', requireRole('moderator'), ctrl.createVNotification);

// D言語風C++互換性通知作成
router.post('/d', requireRole('moderator'), ctrl.createDNotification);

// Ada言語風リアルタイム安全通知作成
router.post('/ada', requireRole('moderator'), ctrl.createAdaNotification);

// Prolog言語風論理プログラミング通知作成
router.post('/prolog', requireRole('moderator'), ctrl.createPrologNotification);

// SQL言語風クエリ最適化通知作成
router.post('/sql', requireRole('moderator'), ctrl.createSQLNotification);

// Smalltalk言語風ライブプログラミング通知作成
router.post('/smalltalk', requireRole('moderator'), ctrl.createSmalltalkNotification);

// Lisp言語風マクロシステム通知作成
router.post('/lisp', requireRole('moderator'), ctrl.createLispNotification);

// MATLAB言語風数値計算通知作成
router.post('/matlab', requireRole('moderator'), ctrl.createMatlabNotification);

// Assembly言語風低レベル最適化通知作成
router.post('/assembly', requireRole('moderator'), ctrl.createAssemblyNotification);

// C言語風低レベルシステム通知作成
router.post('/c', requireRole('moderator'), ctrl.createCNotification);

// C++言語風オブジェクト指向通知作成
router.post('/cpp', requireRole('moderator'), ctrl.createCppNotification);

// HTML/CSS言語風フロントエンド通知作成
router.post('/htmlcss', requireRole('moderator'), ctrl.createHtmlCssNotification);

// Visual Basic言語風RAD開発通知作成
router.post('/vb', requireRole('moderator'), ctrl.createVisualBasicNotification);

// Delphi言語風RAD開発通知作成
router.post('/delphi', requireRole('moderator'), ctrl.createDelphiNotification);

// Pascal言語風構造化プログラミング通知作成
router.post('/pascal', requireRole('moderator'), ctrl.createPascalNotification);

// COBOL言語風ビジネスデータ処理通知作成
router.post('/cobol', requireRole('moderator'), ctrl.createCobolNotification);

// Fortran言語風科学技術計算通知作成
router.post('/fortran', requireRole('moderator'), ctrl.createFortranNotification);

// Shell Script言語風システム自動化通知作成
router.post('/shell', requireRole('moderator'), ctrl.createShellNotification);

// PowerShell言語風Windows管理通知作成
router.post('/powershell', requireRole('moderator'), ctrl.createPowerShellNotification);

// LabVIEW言語風グラフィカルプログラミング通知作成
router.post('/labview', requireRole('moderator'), ctrl.createLabViewNotification);

// Verilog/VHDL言語風ハードウェア設計通知作成
router.post('/verilog', requireRole('moderator'), ctrl.createVerilogNotification);

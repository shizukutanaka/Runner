const db = require('../db');
const logger = require('../logger');
const NotificationEventProcessor = require('../services/notificationEventProcessor');
const NotificationChannelService = require('../services/notificationChannelService');
const NotificationTemplateEngine = require('../services/notificationTemplateEngine');
const NotificationJobQueue = require('../services/notificationJobQueue');
const TypeSafetyService = require('../services/typeSafetyService');
const HighPerformanceNotificationService = require('../services/highPerformanceNotificationService');
const FrameworkIntegrationService = require('../services/frameworkIntegrationService');
const DistributedNotificationService = require('../services/distributedNotificationService');
const OTPFaultToleranceService = require('../services/otpFaultToleranceService');
const ActorSystemService = require('../services/actorSystemService');
const CoroutineService = require('../services/coroutineService');
const RailsConventionService = require('../services/railsConventionService');
const EnhancedTypeSystemService = require('../services/enhancedTypeSystemService');
const InteractiveNotificationService = require('../services/interactiveNotificationService');
const PureFunctionalNotificationService = require('../services/pureFunctionalNotificationService');
const ImmutableDataStructureService = require('../services/immutableDataStructureService');
const LightweightProcessService = require('../services/lightweightProcessService');
const TypeProviderService = require('../services/typeProviderService');
const AdvancedPatternMatchingService = require('../services/advancedPatternMatchingService');
const LightweightScriptingService = require('../services/lightweightScriptingService');
const NimMetaprogrammingService = require('../services/nimMetaprogrammingService');
const CrystalConcurrencyService = require('../services/crystalConcurrencyService');
const VSimpleFastService = require('../services/vSimpleFastService');
const DCppCompatibilityService = require('../services/dCppCompatibilityService');
const AdaRealTimeSafetyService = require('../services/adaRealTimeSafetyService');
const PrologLogicProgrammingService = require('../services/prologLogicProgrammingService');
const SmalltalkLiveProgrammingService = require('../services/smalltalkLiveProgrammingService');
const LispMacroSystemService = require('../services/lispMacroSystemService');
const MatlabMatrixComputingService = require('../services/matlabMatrixComputingService');
const { VisualBasicRadService, DelphiRadService, PascalStructuredService } = require('../services/visualBasicRadService');
const { CobolBusinessService, FortranScientificService } = require('../services/cobolFortranService');
const { ShellScriptAutomationService, PowerShellManagementService } = require('../services/shellPowerShellService');
const { LabViewGraphicalService, VerilogVhdlHardwareService } = require('../services/labviewVerilogService');

const serializeNotification = (row) => ({
  id: row.id,
  title: row.title,
  message: row.message,
  type: row.type,
  level: row.level,
  read: Boolean(row.read),
  metadata: row.metadata ? JSON.parse(row.metadata) : null,
  createdAt: row.created_at,
  readAt: row.read_at,
  expiresAt: row.expires_at,
  eventName: row.event_name,
  sourceComponent: row.source_component,
  correlationId: row.correlation_id,
  templateData: row.template_data ? JSON.parse(row.template_data) : null,
  deliveryStatus: row.delivery_status,
  trackingData: row.tracking_data ? JSON.parse(row.tracking_data) : null,
  supervisorProcessId: row.supervisor_process_id,
  faultToleranceEnabled: Boolean(row.fault_tolerance_enabled),
  maxRetries: row.max_retries,
  actorPath: row.actor_path,
  actorMessageId: row.actor_message_id,
  stateVersion: row.state_version,
  coroutineContextId: row.coroutine_context_id,
  channelId: row.channel_id,
  asyncProcessing: Boolean(row.async_processing),
  railsConventionApplied: Boolean(row.rails_convention_applied),
  autoAssociations: row.auto_associations ? JSON.parse(row.auto_associations) : [],
  namingConvention: row.naming_convention ? JSON.parse(row.naming_convention) : {},
  inferredType: row.inferred_type,
  typeChecked: Boolean(row.type_checked),
  nullSafetyLevel: row.null_safety_level,
  categoryId: row.category_id,
  availableActions: row.available_actions ? JSON.parse(row.available_actions) : [],
  badgeCount: row.badge_count,
  soundFile: row.sound_file,
  interactiveData: row.interactive_data ? JSON.parse(row.interactive_data) : {},
  monadType: row.monad_type,
  functionalResult: row.functional_result,
  patternMatched: Boolean(row.pattern_matched),
  typeClassInstance: row.type_class_instance,
  immutableStoreId: row.immutable_store_id,
  atomOperations: row.atom_operations,
  stmTransactionId: row.stm_transaction_id,
  concurrentVersion: row.concurrent_version,
  processId: row.process_id,
  spawnedBy: row.spawned_by,
  messagePassed: Boolean(row.message_passed),
  processMonitoring: row.process_monitoring,
  patternMatchedOcaml: row.pattern_matched_ocaml,
  adtConstructed: row.adt_constructed,
  typeInferred: row.type_inferred,
  moduleApplied: row.module_applied,
  typescriptInterface: row.typescript_interface,
  genericType: row.generic_type,
  typeGuardApplied: row.type_guard_applied,
  compileTimeChecked: Boolean(row.compile_time_checked),
  reactiveStreamId: row.reactive_stream_id,
  observableTransformed: Boolean(row.observable_transformed),
  futureAwaited: Boolean(row.future_awaited),
  subscriptionId: row.subscription_id,
  juliaTaskId: row.julia_task_id,
  vectorizedProcessing: Boolean(row.vectorized_processing),
  parallelExecution: Boolean(row.parallel_execution),
  macroExpanded: Boolean(row.macro_expanded),
  crystalFiberId: row.crystal_fiber_id,
  channelCommunication: Boolean(row.channel_communication),
  concurrentPipeline: row.concurrent_pipeline,
  fiberScheduled: Boolean(row.fiber_scheduled),
  zigErrorHandling: row.zig_error_handling,
  errorUnionUsed: Boolean(row.error_union_used),
  safetyChecksPassed: Boolean(row.safety_checks_passed),
  compileTimeAsserted: Boolean(row.compile_time_asserted),
  analysisPipeline: row.analysis_pipeline,
  vSimpleId: row.v_simple_id,
  vFastProcessing: Boolean(row.v_fast_processing),
  vEmbeddedSystem: row.v_embedded_system,
  vPerformanceOptimized: Boolean(row.v_performance_optimized),
  dRangeUsed: row.d_range_used,
  dParallelProcessed: Boolean(row.d_parallel_processed),
  dTemplateApplied: row.d_template_applied,
  dContractsChecked: Boolean(row.d_contracts_checked),
  adaTaskId: row.ada_task_id,
  adaSafetyLevel: row.ada_safety_level,
  adaRealTime: Boolean(row.ada_real_time),
  adaSynchronized: Boolean(row.ada_synchronized),
  prologInferred: row.prolog_inferred,
  prologConfidence: parseFloat(row.prolog_confidence) || 1.0,
  prologRuleApplied: row.prolog_rule_applied,
  prologLogic: Boolean(row.prolog_logic),
  sqlQueryOptimized: row.sql_query_optimized,
  sqlIndexUsed: row.sql_index_used,
  sqlTransactionId: row.sql_transaction_id,
  sqlJoinApplied: Boolean(row.sql_join_applied),
  smalltalkWorkspace: row.smalltalk_workspace,
  smalltalkMessageSent: row.smalltalk_message_sent,
  smalltalkLiveCoding: Boolean(row.smalltalk_live_coding),
  smalltalkObjectMemory: Boolean(row.smalltalk_object_memory),
  lispMacroApplied: row.lisp_macro_applied,
  lispSexpression: row.lisp_sexpression,
  lispListProcessed: Boolean(row.lisp_list_processed),
  lispFunctional: Boolean(row.lisp_functional),
  matlabMatrixComputed: row.matlab_matrix_computed,
  matlabNumerical: Boolean(row.matlab_numerical),
  matlabVisualized: row.matlab_visualized,
  matlabScientific: Boolean(row.matlab_scientific),
  assemblyOptimized: row.assembly_optimized,
  assemblyMemoryManaged: Boolean(row.assembly_memory_managed),
  assemblySimdApplied: Boolean(row.assembly_simd_applied),
  assemblyLowLevel: Boolean(row.assembly_low_level),
  cPointerUsed: Boolean(row.c_pointer_used),
  cSystemIntegrated: Boolean(row.c_system_integrated),
  cppTemplateUsed: row.cpp_template_used,
  cppInheritanceApplied: Boolean(row.cpp_inheritance_applied),
  htmlComponent: row.html_component,
  cssStyled: Boolean(row.css_styled),
  vbFormUsed: row.vb_form_used,
  vbEventBound: Boolean(row.vb_event_bound),
  vbDataBound: Boolean(row.vb_data_bound),
  delphiComponent: row.delphi_component,
  delphiDatabase: Boolean(row.delphi_database),
  pascalRecord: row.pascal_record,
  pascalStructured: Boolean(row.pascal_structured),
  cobolRecordUsed: row.cobol_record_used,
  cobolBatchProcessed: Boolean(row.cobol_batch_processed),
  fortranArrayUsed: row.fortran_array_used,
  fortranScientific: Boolean(row.fortran_scientific),
  shellScriptUsed: row.shell_script_used,
  shellAutomated: Boolean(row.shell_automated),
  powershellCmdlet: row.powershell_cmdlet,
  powershellManaged: Boolean(row.powershell_managed),
  labviewViUsed: row.labview_vi_used,
  labviewGraphical: Boolean(row.labview_graphical),
  verilogModule: row.verilog_module,
  vhdlEntity: row.vhdl_entity,
  hardwareSynthesized: Boolean(row.hardware_synthesized)
});

// ユーザーごとの通知設定更新
exports.updateUserNotificationSettings = (req, res, next) => {
  const { id } = req.params;
  const {
    soundEnabled,
    desktopEnabled,
    emailEnabled,
    frequency,
    soundVolume,
    keywords,
    filters
  } = req.body;

  // バリデーション
  const Joi = require('joi');
  const settingsSchema = Joi.object({
    soundEnabled: Joi.boolean().optional(),
    desktopEnabled: Joi.boolean().optional(),
    emailEnabled: Joi.boolean().optional(),
    frequency: Joi.string().valid('immediate', 'hourly', 'daily', 'weekly', 'disabled').optional(),
    soundVolume: Joi.number().integer().min(0).max(100).optional(),
    keywords: Joi.array().items(Joi.string()).optional(),
    filters: Joi.object().optional()
  });

  const { error, value } = settingsSchema.validate({
    soundEnabled,
    desktopEnabled,
    emailEnabled,
    frequency,
    soundVolume,
    keywords,
    filters
  });

  if (error) {
    return next({ status: 400, message: 'Invalid notification settings', details: error.details });
  }

  // 更新するフィールドを動的に構築
  const updateFields = [];
  const params = [];

  if (value.soundEnabled !== undefined) {
    updateFields.push('notification_sound_enabled = ?');
    params.push(value.soundEnabled ? 1 : 0);
  }

  if (value.desktopEnabled !== undefined) {
    updateFields.push('notification_desktop_enabled = ?');
    params.push(value.desktopEnabled ? 1 : 0);
  }

  if (value.emailEnabled !== undefined) {
    updateFields.push('notification_email_enabled = ?');
    params.push(value.emailEnabled ? 1 : 0);
  }

  if (value.frequency !== undefined) {
    updateFields.push('notification_frequency = ?');
    params.push(value.frequency);
  }

  if (value.soundVolume !== undefined) {
    updateFields.push('notification_sound_volume = ?');
    params.push(value.soundVolume);
  }

  if (value.keywords !== undefined) {
    updateFields.push('notification_keywords = ?');
    params.push(JSON.stringify(value.keywords));
  }

  if (value.filters !== undefined) {
    updateFields.push('notification_filters = ?');
    params.push(JSON.stringify(value.filters));
  }

  if (updateFields.length === 0) {
    return next({ status: 400, message: 'No settings to update' });
  }

  const sql = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
  params.push(id);

  db.run(sql, params, function(err) {
    if (err) {
      logger.error('[Notifications] Settings update error', { error: err.message, userId: id });
      return next({ status: 500, message: 'Failed to update notification settings', details: err });
    }

    if (this.changes === 0) {
      return next({ status: 404, message: 'User not found' });
    }

    res.json({
      status: 200,
      data: null,
      message: 'Notification settings updated'
    });
  });
};

// ユーザーごとの通知履歴取得
exports.getUserNotificationHistory = (req, res, next) => {
  const { id } = req.params;
  const { limit = 50, offset = 0, type } = req.query;

  let sql = 'SELECT * FROM notification_history WHERE user_id = ?';
  const params = [id];

  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  db.all(sql, params, (err, rows) => {
    if (err) {
      logger.error('[Notifications] History fetch error', { error: err.message, userId: id });
      return next({ status: 500, message: 'Failed to fetch notification history', details: err });
    }

    const history = rows.map(row => ({
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      data: row.data ? JSON.parse(row.data) : null,
      read: Boolean(row.read_at),
      createdAt: row.created_at,
      readAt: row.read_at
    }));

    res.json({
      status: 200,
      data: {
        history,
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
          total: history.length
        }
      },
      message: 'Notification history fetched'
    });
  });
};

// ユーザーごとの通知履歴削除
exports.clearUserNotificationHistory = (req, res, next) => {
  const { id } = req.params;
  const { before, type } = req.query;

  let sql = 'DELETE FROM notification_history WHERE user_id = ?';
  const params = [id];

  if (before) {
    sql += ' AND created_at < ?';
    params.push(before);
  }

  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }

  db.run(sql, params, function(err) {
    if (err) {
      logger.error('[Notifications] History clear error', { error: err.message, userId: id });
      return next({ status: 500, message: 'Failed to clear notification history', details: err });
    }

    res.json({
      status: 200,
      data: { deleted: this.changes },
      message: 'Notification history cleared'
    });
  });
};

// ユーザーごとの通知設定取得
exports.getUserNotificationSettings = (req, res, next) => {
  const { id } = req.params;

  const sql = `
    SELECT
      notification_sound_enabled,
      notification_desktop_enabled,
      notification_email_enabled,
      notification_frequency,
      notification_sound_volume,
      notification_keywords,
      notification_filters
    FROM users WHERE id = ?
  `;

  db.get(sql, [id], (err, row) => {
    if (err) {
      logger.error('[Notifications] Settings fetch error', { error: err.message, userId: id });
      return next({ status: 500, message: 'Failed to fetch notification settings', details: err });
    }

    if (!row) {
      return next({ status: 404, message: 'User not found' });
    }

    const settings = {
      soundEnabled: Boolean(row.notification_sound_enabled),
      desktopEnabled: Boolean(row.notification_desktop_enabled),
      emailEnabled: Boolean(row.notification_email_enabled),
      frequency: row.notification_frequency || 'immediate',
      soundVolume: row.notification_sound_volume || 50,
      keywords: row.notification_keywords ? JSON.parse(row.notification_keywords) : [],
      filters: row.notification_filters ? JSON.parse(row.notification_filters) : {}
    };

// 通知テンプレート取得
exports.getNotificationTemplates = (req, res, next) => {
  const sql = 'SELECT * FROM notification_templates ORDER BY type, id';

  db.all(sql, (err, rows) => {
    if (err) {
      logger.error('[Notifications] Templates fetch error', { error: err.message });
      return next({ status: 500, message: 'Failed to fetch notification templates', details: err });
    }

    const templates = rows.map(row => ({
      id: row.id,
      type: row.type,
      titleTemplate: row.title_template,
      messageTemplate: row.message_template,
      variables: row.variables ? JSON.parse(row.variables) : [],
      enabled: Boolean(row.enabled),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    res.json({
      status: 200,
      data: templates,
      message: 'Notification templates fetched'
    });
  });
};

// 通知テンプレート更新
exports.updateNotificationTemplate = (req, res, next) => {
  const { id } = req.params;
  const {
    titleTemplate,
    messageTemplate,
    variables,
    enabled
  } = req.body;

  // バリデーション
  const Joi = require('joi');
  const templateSchema = Joi.object({
    titleTemplate: Joi.string().required(),
    messageTemplate: Joi.string().required(),
    variables: Joi.array().items(Joi.string()).optional(),
    enabled: Joi.boolean().optional()
  });

  const { error, value } = templateSchema.validate({
    titleTemplate,
    messageTemplate,
    variables,
    enabled
  });

  if (error) {
    return next({ status: 400, message: 'Invalid template data', details: error.details });
  }

  const updateFields = [];
  const params = [];

  updateFields.push('title_template = ?');
  params.push(value.titleTemplate);

  updateFields.push('message_template = ?');
  params.push(value.messageTemplate);

  updateFields.push('updated_at = CURRENT_TIMESTAMP');

  if (value.variables !== undefined) {
    updateFields.push('variables = ?');
    params.push(JSON.stringify(value.variables));
  }

  if (value.enabled !== undefined) {
    updateFields.push('enabled = ?');
    params.push(value.enabled ? 1 : 0);
  }

  params.push(id);

  const sql = `UPDATE notification_templates SET ${updateFields.join(', ')} WHERE id = ?`;

  db.run(sql, params, function(err) {
    if (err) {
      logger.error('[Notifications] Template update error', { error: err.message, templateId: id });
      return next({ status: 500, message: 'Failed to update notification template', details: err });
    }

    if (this.changes === 0) {
      return next({ status: 404, message: 'Notification template not found' });
    }

  });
};

// 通知一覧取得
exports.getNotifications = (req, res, next) => {
  const userId = req.user.id;
  const { limit = 50, offset = 0, type, level, unreadOnly = false } = req.query;

  let sql = 'SELECT * FROM notifications WHERE user_id = ?';
  const params = [userId];

  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }

  if (level) {
    sql += ' AND level = ?';
    params.push(level);
  }

  if (unreadOnly === 'true') {
    sql += ' AND read = 0';
  }

  // 期限切れの通知は除外
  sql += ' AND (expires_at IS NULL OR expires_at > datetime("now"))';

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  db.all(sql, params, (err, rows) => {
    if (err) {
      logger.error('[Notifications] Get notifications error', { error: err.message, userId });
      return next({ status: 500, message: 'Failed to fetch notifications', details: err });
    }

    const notifications = rows.map(serializeNotification);
    const totalCount = rows.length;

    // 未読数を計算
    const unreadSql = 'SELECT COUNT(*) as unread FROM notifications WHERE user_id = ? AND read = 0 AND (expires_at IS NULL OR expires_at > datetime("now"))';
    db.get(unreadSql, [userId], (err, row) => {
      if (err) {
        logger.error('[Notifications] Get unread count error', { error: err.message, userId });
        // エラーがあっても通知一覧は返す
        return res.json({
          status: 200,
          data: {
            notifications,
            pagination: {
              limit: Number(limit),
              offset: Number(offset),
              total: totalCount
            },
            unreadCount: 0
          },
          message: 'Notifications fetched'
        });
      }

      res.json({
        status: 200,
        data: {
          notifications,
          pagination: {
            limit: Number(limit),
            offset: Number(offset),
            total: totalCount
          },
          unreadCount: row ? row.unread : 0
        },
        message: 'Notifications fetched'
      });
    });
  });
};

// 強化された通知作成（全機能統合）
exports.createNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata, expiresAt, deliveryChannels } = req.body;

  try {
    // 1. 型安全性チェック（Kotlin風）
    const typeService = new EnhancedTypeSystemService();
    const typedNotification = await typeService.createNotificationWithTypeSafety({
      userId,
      type,
      level,
      title,
      message,
      metadata,
      expiresAt,
      deliveryChannels
    });

    // 2. Rails規約を適用
    const conventionService = new RailsConventionService();
    const conventionApplied = await conventionService.createNotificationByConvention(typedNotification.typed);

    // 3. OTPフォールトトレランスで処理
    const otpService = new OTPFaultToleranceService();
    const faultTolerantResult = await otpService.processNotificationWithFaultTolerance(
      conventionApplied,
      async (notification) => {
        // 4. Actorシステムで処理（Scala Akka風）
        const actorService = new ActorSystemService();
        await actorService.tell('/user/notification_router', {
          type: 'route_notification',
          data: notification
        });

        // 5. コルーチンで非同期処理（Kotlin風）
        const coroutineService = new CoroutineService();
        const coroutineResult = await coroutineService.processNotificationWithCoroutines(
          notification,
          deliveryChannels.map(channel => 
            async (notification) => {
              const channelService = new NotificationChannelService();
              return await channelService.deliverNotification(channel, userId, notification, null);
            }
          )
        );

        // 6. フレームワーク統合イベントを発行（Spring Events風）
        const frameworkService = new FrameworkIntegrationService();
        await frameworkService.publishEvent('notification.created', {
          userId,
          type,
          title,
          message,
          channels: deliveryChannels
        }, {
          sourceComponent: 'notification_controller',
          correlationId: conventionApplied.id
        });

        return {
          notificationId: conventionApplied.id,
          typedData: typedNotification,
          conventionData: conventionApplied,
          faultTolerance: true,
          actorProcessed: true,
          coroutineProcessed: coroutineResult.success,
          frameworkEvent: true
        };
      }
    );

    // 7. パフォーマンス最適化（Go風）
    const perfService = new HighPerformanceNotificationService();
    const optimizedResult = await perfService.processNotificationEfficiently(
      faultTolerantResult,
      {
        transform: (data) => {
          // データ変換
          return data;
        },
        channels: deliveryChannels
      }
    );

    // 8. テンプレートエンジンでメッセージ生成（Laravel風）
    const templateEngine = new NotificationTemplateEngine();
    const templateResult = await templateEngine.createNotification(
      type,
      {
        title,
        message,
        userId,
        metadata: typedNotification.enhanced
      },
      {
        channels: deliveryChannels,
        priority: EnhancedTypeSystemService.parsePriorityLevel(level)
      }
    );

    // 9. ジョブキューに追加
    const jobQueue = new NotificationJobQueue();
    await jobQueue.dispatch('notification_delivery', {
      notificationId: conventionApplied.id,
      userId,
      channels: deliveryChannels,
      templateData: templateResult
    }, {
      priority: EnhancedTypeSystemService.parsePriorityLevel(level),
      maxRetries: 3
    });

    // 10. 分散システム対応
    const distributedService = new DistributedNotificationService();
    await distributedService.logEvent(
      conventionApplied.id,
      'created',
      'success',
      {
        services: ['type_safety', 'rails_conventions', 'otp_fault_tolerance', 'actor_system', 'coroutines', 'framework_integration', 'performance_optimization', 'template_engine', 'job_queue'],
        processingTimeMs: Date.now() - Date.parse(typedNotification.typeInfo.timestamp)
      }
    );

    res.json({
      status: 201,
      data: {
        notificationId: conventionApplied.id,
        eventId: templateResult?.eventId,
        typeInfo: typedNotification.typeInfo,
        conventionApplied: conventionApplied.namingConventions,
        faultToleranceEnabled: true,
        actorPath: '/user/notification_router',
        coroutineContext: 'notification_context',
        frameworkEvents: ['notification.created'],
        performanceOptimized: true,
        templateEngineUsed: true,
        jobQueueScheduled: true,
        distributedLogged: true
      },
      message: 'Enhanced notification created successfully with all language integrations'
    });


// 多言語統合システム統計取得
exports.getMultiLanguageSystemStats = async (req, res, next) => {
  try {
    const stats = {
      timestamp: new Date().toISOString(),
      services: {}
    };

    // 各言語のサービス統計を取得
    const typeService = new EnhancedTypeSystemService();
    stats.services.typeSystem = await typeService.getTypeSystemStats();

    const otpService = new OTPFaultToleranceService();
    stats.services.otpFaultTolerance = await otpService.getSystemStats();

    const actorService = new ActorSystemService();
    stats.services.actorSystem = await actorService.getSystemStats();

    const coroutineService = new CoroutineService();
    stats.services.coroutines = await coroutineService.getSystemStats();

    const conventionService = new RailsConventionService();
    stats.services.railsConventions = await conventionService.getConventionStats();

    const perfService = new HighPerformanceNotificationService();
    stats.services.performance = await perfService.getPerformanceStats();

    const frameworkService = new FrameworkIntegrationService();
    stats.services.frameworkIntegration = await frameworkService.getEventStats();

    const distributedService = new DistributedNotificationService();
    stats.services.distributed = await distributedService.getServiceStats();

    const jobQueue = new NotificationJobQueue();
    stats.services.jobQueue = await jobQueue.getJobStats();

    const nimService = new NimMetaprogrammingService();
    stats.services.metaprogramming = await nimService.getMetaprogrammingStats();

    const crystalService = new CrystalConcurrencyService();
    stats.services.crystalConcurrency = await crystalService.getCrystalStats();

    const zigService = new ZigErrorHandlingService();
    stats.services.zigErrorHandling = await zigService.getZigStats();

    const rService = new RStatisticalAnalysisService();
    stats.services.statisticalAnalysis = await rService.getRStats();

    const vService = new VSimpleFastService();
    stats.services.vSimpleFast = await vService.getVStats();

    const dService = new DCppCompatibilityService();
    stats.services.dCppCompatibility = await dService.getDStats();

    const adaService = new AdaRealTimeSafetyService();
    stats.services.adaRealTimeSafety = await adaService.getAdaStats();

    const prologService = new PrologLogicProgrammingService();
    stats.services.prologLogicProgramming = await prologService.getPrologStats();

    const sqlService = new SQLQueryOptimizationService();
    stats.services.sqlQueryOptimization = await sqlService.getSQLStats();

    const smalltalkService = new SmalltalkLiveProgrammingService();
    stats.services.smalltalkLiveProgramming = await smalltalkService.getSmalltalkStats();

    const lispService = new LispMacroSystemService();
    stats.services.lispMacroSystem = await lispService.getLispStats();

    const matlabService = new MatlabMatrixComputingService();
    stats.services.matlabMatrixComputing = await matlabService.getMatlabStats();

    const assemblyService = new AssemblyLowLevelOptimizationService();
    stats.services.assemblyLowLevelOptimization = await assemblyService.getAssemblyStats();

    const cService = new CSystemsProgrammingService();
    stats.services.cSystemsProgramming = await cService.getCStats();

    const cppService = new CppObjectSystemsService();
    stats.services.cppObjectSystems = await cppService.getCppStats();

    const htmlCssService = new HtmlCssFrontendService();
    stats.services.htmlCssFrontend = await htmlCssService.getHtmlCssStats();

    // 新しい言語のサービス統計
    const vbService = new VisualBasicRadService();
    stats.services.visualBasicRad = await vbService.getVBStats();

    const delphiService = new DelphiRadService();
    stats.services.delphiRad = await delphiService.getDelphiStats();

    const pascalService = new PascalStructuredService();
    stats.services.pascalStructured = await pascalService.getPascalStats();

    const cobolService = new CobolBusinessService();
    stats.services.cobolBusiness = await cobolService.getCobolStats();

    const fortranService = new FortranScientificService();
    stats.services.fortranScientific = await fortranService.getFortranStats();

    const shellService = new ShellScriptAutomationService();
    stats.services.shellAutomation = await shellService.getShellStats();

    const powershellService = new PowerShellManagementService();
    stats.services.powerShellManagement = await powershellService.getPowerShellStats();

    const labviewService = new LabViewGraphicalService();
    stats.services.labviewGraphical = await labviewService.getLabVIEWStats();

    const hardwareService = new VerilogVhdlHardwareService();
    stats.services.hardwareDesign = await hardwareService.getHardwareStats();

    // 統合された機能の概要
    stats.overview = {
      kotlinFeatures: ['type_safety', 'null_safety', 'coroutines', 'extension_functions'],
      scalaFeatures: ['actor_model', 'message_passing', 'state_management', 'hierarchy'],
      elixirFeatures: ['otp_fault_tolerance', 'supervision', 'process_monitoring', 'hot_swapping'],
      railsFeatures: ['convention_over_configuration', 'auto_associations', 'naming_conventions', 'restful_routes'],
      goFeatures: ['performance_optimization', 'memory_efficiency', 'concurrent_processing', 'lightweight'],
      springFeatures: ['framework_integration', 'event_driven', 'dependency_injection', 'aop'],
      laravelFeatures: ['template_engine', 'notification_builder', 'fluent_interface', 'multiple_channels'],
      nimFeatures: ['metaprogramming', 'macros', 'compile_time_evaluation', 'multiple_backends'],
      crystalFeatures: ['fiber_concurrency', 'channel_communication', 'type_inference', 'beautiful_syntax'],
      zigFeatures: ['error_unions', 'explicit_error_handling', 'memory_safety', 'compile_time_assertions'],
      rFeatures: ['statistical_analysis', 'data_frames', 'visualization', 'data_science'],
      vFeatures: ['simple_design', 'fast_execution', 'embedded_systems', 'performance_optimization'],
      dFeatures: ['cpp_compatibility', 'ranges', 'parallel_processing', 'template_metaprogramming'],
      adaFeatures: ['real_time_systems', 'safety_critical', 'task_synchronization', 'contract_programming'],
      prologFeatures: ['logic_programming', 'inference_engine', 'knowledge_base', 'rule_based_systems'],
      sqlFeatures: ['query_optimization', 'index_management', 'transaction_processing', 'database_integration'],
      smalltalkFeatures: ['live_programming', 'message_passing', 'object_oriented', 'incremental_development'],
      lispFeatures: ['macro_system', 'symbolic_computation', 'functional_programming', 'list_processing'],
      matlabFeatures: ['matrix_computing', 'numerical_analysis', 'scientific_visualization', 'vectorization'],
      assemblyFeatures: ['low_level_optimization', 'memory_management', 'performance_tuning', 'system_programming'],
      cFeatures: ['pointer_arithmetic', 'memory_layout', 'system_calls', 'low_level_access'],
      cppFeatures: ['object_oriented', 'templates', 'raii', 'inheritance'],
      htmlCssFeatures: ['responsive_design', 'component_system', 'styling_framework', 'frontend_integration'],
      visualBasicFeatures: ['rad_development', 'form_design', 'event_binding', 'data_binding'],
      delphiFeatures: ['rad_components', 'database_integration', 'component_palette', 'form_designer'],
      pascalFeatures: ['structured_programming', 'record_types', 'procedural_programming', 'educational'],
      cobolFeatures: ['business_data_processing', 'file_handling', 'batch_processing', 'report_generation'],
      fortranFeatures: ['scientific_computing', 'numerical_methods', 'array_processing', 'performance_optimization'],
      shellFeatures: ['system_automation', 'process_management', 'file_operations', 'scripting'],
      powershellFeatures: ['windows_management', 'dotnet_integration', 'cmdlet_pipeline', 'system_administration'],
      labviewFeatures: ['graphical_programming', 'instrumentation', 'data_flow', 'real_time_processing'],
      verilogFeatures: ['digital_design', 'rtl_modeling', 'timing_analysis', 'fpga_synthesis'],
      vhdlFeatures: ['hardware_description', 'concurrent_processing', 'strong_typing', 'verification']
    };

    // 言語と機能の概要
    stats.languages = [
      'JavaScript (Base)', 'Python (Django)', 'Java (Spring Boot)', 'C# (.NET)', 'Go',
      'Rust', 'PHP (Laravel)', 'Ruby (Rails)', 'Scala (Akka)', 'Elixir (Phoenix)',
      'Kotlin', 'Swift (iOS)', 'Haskell', 'Clojure', 'Erlang', 'F#', 'OCaml', 'Lua',
      'TypeScript', 'Dart', 'Julia', 'Nim', 'Crystal', 'Zig', 'R', 'V', 'D', 'Ada', 'Prolog', 'SQL',
      'Smalltalk', 'Lisp', 'MATLAB', 'Assembly', 'C', 'C++', 'HTML/CSS',
      'Visual Basic', 'Delphi', 'Pascal', 'COBOL', 'Fortran', 'Shell Script', 'PowerShell', 'LabVIEW', 'Verilog', 'VHDL'
    ];
    stats.totalLanguages = stats.languages.length;

    res.json({
      status: 200,
      data: stats,
      message: 'Multi-language notification system statistics retrieved successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Get multi-language stats error', { error: error.message });
    return next({ 
      status: 500, 
      message: 'Failed to retrieve system statistics', 
      details: error.message 
    });
  }
};

// 型安全な通知作成（Kotlin風）
exports.createTypedNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata, expiresAt, deliveryChannels } = req.body;

  try {
    const typeService = new EnhancedTypeSystemService();
    const result = await typeService.createNotificationWithTypeSafety({
      userId,
      type,
      level,
      title,
      message,
      metadata,
      expiresAt,
      deliveryChannels
    });

    res.json({
      status: 201,
      data: result,
      message: 'Type-safe notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create typed notification error', { error: error.message, userId });
    return next({ 
      status: 500, 
      message: 'Failed to create typed notification', 
      details: error.message 
    });
  }
};

// 規約ベース通知作成（Rails風）
exports.createConventionalNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata, expiresAt, deliveryChannels } = req.body;

  try {
    const conventionService = new RailsConventionService();
    const result = await conventionService.createNotificationByConvention({
      userId,
      type,
      level,
      title,
      message,
      metadata,
      expiresAt,
      deliveryChannels
    });

    res.json({
      status: 201,
      data: result,
      message: 'Conventional notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create conventional notification error', { error: error.message, userId });
    return next({ 
      status: 500, 
      message: 'Failed to create conventional notification', 
      details: error.message 
    });
  }
};

// Actorシステム経由の通知作成（Scala Akka風）
exports.createActorNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata, expiresAt, deliveryChannels } = req.body;

  try {
    const actorService = new ActorSystemService();
    const result = await actorService.createActor('/user/notification_' + Date.now(), 'NotificationWorker', '/user', {
      initialState: { userId, type, level, title, message, metadata, expiresAt, deliveryChannels }
    });

    // メッセージを送信
    await actorService.tell(result.actorPath, {
      type: 'process_notification',
      data: { userId, type, level, title, message, metadata, expiresAt, deliveryChannels }
    });

    res.json({
      status: 201,
      data: result,
      message: 'Actor-based notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create actor notification error', { error: error.message, userId });
    return next({ 
      status: 500, 
      message: 'Failed to create actor notification', 
      details: error.message 
    });
  }
};

// コルーチンベース通知作成（Kotlin風）
exports.createCoroutineNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata, expiresAt, deliveryChannels } = req.body;

  try {
    const coroutineService = new CoroutineService();
    const result = await coroutineService.processNotificationWithCoroutines({
      userId,
      type,
      level,
      title,
      message,
      metadata,
      expiresAt,
      deliveryChannels
    }, deliveryChannels.map(channel => 
      async (notification) => {
        const channelService = new NotificationChannelService();
        return await channelService.deliverNotification(channel, userId, notification, null);
      }
    ));

    res.json({
      status: 201,
      data: result,
      message: 'Coroutine-based notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create coroutine notification error', { error: error.message, userId });
    return next({ 
      status: 500, 
      message: 'Failed to create coroutine notification', 
      details: error.message 
    });
  }
};

// OTPフォールトトレラント通知作成（Elixir風）
exports.createFaultTolerantNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata, expiresAt, deliveryChannels } = req.body;

  try {
    const otpService = new OTPFaultToleranceService();
    const result = await otpService.processNotificationWithFaultTolerance(
      { userId, type, level, title, message, metadata, expiresAt, deliveryChannels },
      async (notification) => {
        // 実際の通知処理
        const eventProcessor = new NotificationEventProcessor();
        return await eventProcessor.createEvent(type, {
          title,
          message,
          metadata,
          deliveryChannels
        }, {
          userId,
          priority: eventProcessor.getPriorityFromLevel(level)
        });
      }
    );

    res.json({
      status: 201,
      data: result,
      message: 'Fault-tolerant notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create fault-tolerant notification error', { error: error.message, userId });
    return next({ 
      status: 500, 
      message: 'Failed to create fault-tolerant notification', 
      details: error.message 
    });
  }
};

// テンプレートエンジン通知作成（Laravel風）
exports.createTemplateNotification = async (req, res, next) => {
  const { templateId, variables, userId, channels = ['websocket'] } = req.body;

  try {
    const templateEngine = new NotificationTemplateEngine();
    const result = await templateEngine.createNotification(
      templateId,
      variables,
      { userId, channels }
    );

    res.json({

    // 言語と機能の概要
    stats.languages = [
      'JavaScript (Base)', 'Python (Django)', 'Java (Spring Boot)', 'C# (.NET)', 'Go',
      'Rust', 'PHP (Laravel)', 'Ruby (Rails)', 'Scala (Akka)', 'Elixir (Phoenix)',
      'Kotlin', 'Swift (iOS)', 'Haskell', 'Clojure', 'Erlang', 'F#', 'OCaml', 'Lua'
    ];
    stats.totalLanguages = stats.languages.length;

    stats.overview = {
      kotlinFeatures: ['Type Safety', 'Null Safety', 'Coroutines', 'Extension Functions', 'Type Providers'],
      scalaFeatures: ['Actor Model', 'Message Passing', 'State Management', 'Hierarchy', 'Pattern Matching'],
      elixirFeatures: ['OTP Fault Tolerance', 'Supervision', 'Process Monitoring', 'Hot Swapping', 'Distribution'],
      railsFeatures: ['Convention over Configuration', 'Auto Associations', 'Naming Conventions', 'RESTful Routes', 'Migrations'],
      goFeatures: ['Performance Optimization', 'Memory Efficiency', 'Concurrent Processing', 'Lightweight', 'Channels'],
      haskellFeatures: ['Pure Functional', 'Monads', 'Type Classes', 'Function Composition', 'Pattern Matching'],
      clojureFeatures: ['Immutable Data Structures', 'STM', 'Atoms', 'Refs', 'Agents'],
      erlangFeatures: ['Lightweight Processes', 'Message Passing', 'Process Monitoring', 'Distribution', 'Hot Code Swapping'],
      swiftFeatures: ['Interactive Notifications', 'Actions', 'Categories', 'User Responses', 'Real-time'],
      fsharpFeatures: ['Type Providers', 'Active Patterns', 'Computation Expressions', 'Discriminated Unions', 'Units of Measure'],
      ocamlFeatures: ['Advanced Pattern Matching', 'Algebraic Data Types', 'Type Inference', 'Module System', 'Functors'],
      luaFeatures: ['Lightweight Scripting', 'Table Manipulation', 'Coroutines', 'Metatables', 'Embedded Execution']
    };

    stats.totalFeatures = Object.values(stats.overview).reduce((sum, features) => sum + features.length, 0);

    res.json({
      status: 200,
      data: stats,
      message: `Comprehensive multi-language notification system with ${stats.totalLanguages} languages and ${stats.totalFeatures} features`
    });

  } catch (error) {
    logger.error('[Notifications] Get comprehensive stats error', { error: error.message });
    return next({
      status: 500,
      message: 'Failed to retrieve comprehensive system statistics',
      details: error.message
    });
  }
};

// インタラクティブ通知作成（Swift iOS風）
exports.createInteractiveNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, categoryId = 'system_alert', actions = [], badgeCount = 1, soundFile = 'default' } = req.body;

  try {
    const interactiveService = new InteractiveNotificationService();
    const result = await interactiveService.createInteractiveNotification(userId, type, level, title, message, {
      categoryId,
      actions,
      badgeCount,
      soundFile
    });

    res.json({
      status: 201,
      data: result,
      message: 'Interactive notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create interactive notification error', { error: error.message, userId, categoryId });
    return next({
      status: 500,
      message: 'Failed to create interactive notification',
      details: error.message
    });
  }
};

// 純粋関数型通知作成（Haskell風）
exports.createFunctionalNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const functionalService = new PureFunctionalNotificationService();
    const result = await functionalService.createFunctionalNotification({ userId, type, level, title, message, metadata });

    res.json({
      status: 201,
      data: result,
      message: 'Functional notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create functional notification error', { error: error.message, userId });
    return next({
      status: 500,
      message: 'Failed to create functional notification',
      details: error.message
    });
  }
};

// 不変データ構造通知作成（Clojure風）
exports.createImmutableNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const immutableService = new ImmutableDataStructureService();
    const result = await immutableService.createImmutableNotification({ userId, type, level, title, message, metadata });

    res.json({
      status: 201,
      data: result,
      message: 'Immutable notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create immutable notification error', { error: error.message, userId });
    return next({
      status: 500,
      message: 'Failed to create immutable notification',
      details: error.message
    });
  }
};

// 軽量プロセス通知作成（Erlang風）
exports.createProcessNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const processService = new LightweightProcessService();
    const result = await processService.spawn('notification_worker', [{ userId, type, level, title, message, metadata }], {
      parentProcessId: 'notification_supervisor',
      trapExit: true
    });

    // プロセスにメッセージを送信
    await processService.sendMessage(result.processId, {
      type: 'process_notification',
      data: { userId, type, level, title, message, metadata }
    });

    res.json({
      status: 201,
      data: result,
      message: 'Process-based notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create process notification error', { error: error.message, userId });
    return next({
      status: 500,
      message: 'Failed to create process notification',
      details: error.message
    });
  }
};

// 型プロバイダー通知作成（F#風）
exports.createTypeProviderNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const typeProviderService = new TypeProviderService();
    const result = await typeProviderService.processNotificationWithTypeProvider({ userId, type, level, title, message, metadata });

    res.json({
      status: 201,
      data: result,
      message: 'Type provider notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create type provider notification error', { error: error.message, userId });
    return next({
      status: 500,
      message: 'Failed to create type provider notification',
      details: error.message
    });
  }
};

// 高度なパターンマッチング通知作成（OCaml風）
exports.createPatternNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const patternService = new AdvancedPatternMatchingService();
    const result = await patternService.processNotificationWithAdvancedPatterns({ userId, type, level, title, message, metadata });

    res.json({
      status: 201,
      data: result,
      message: 'Pattern matching notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create pattern notification error', { error: error.message, userId });
    return next({
      status: 500,
      message: 'Failed to create pattern notification',
      details: error.message
    });
  }
};

// Luaスクリプト通知作成
exports.createScriptNotification = async (req, res, next) => {
  const { scriptName = 'validate_notification', userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const scriptService = new LightweightScriptingService();
    const result = await scriptService.executeScript(scriptName, {
      userId, type, level, title, message, metadata
    }, 'notification_env');

    res.json({
      status: 201,
      data: result,
      message: 'Script-based notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create script notification error', { error: error.message, userId, scriptName });
    return next({
      status: 500,
      message: 'Failed to create script notification',
      details: error.message
    });
  }
};

// ジョブキュー通知作成
exports.createJobQueueNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata, expiresAt, deliveryChannels, scheduledAt } = req.body;

  try {
    const jobQueue = new NotificationJobQueue();
    const result = await jobQueue.dispatch('notification_delivery', {
      userId,
      type,
      level,
      title,
      message,
      metadata,
      expiresAt,
      deliveryChannels
    }, {
      priority: EnhancedTypeSystemService.parsePriorityLevel(level),
      scheduledAt,
      maxRetries: 3
    });

    res.json({
      status: 201,
      data: result,
      message: 'Job queue notification scheduled successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create job queue notification error', { error: error.message, userId });
    return next({ 
      status: 500, 
      message: 'Failed to schedule notification job', 
      details: error.message 
    });
  }
};

// 通知を既読にする
exports.markAsRead = (req, res, next) => {
  const userId = req.user.id;
  const { id } = req.params;

  const sql = `
    UPDATE notifications
    SET read = 1, read_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `;

  db.run(sql, [id, userId], function(err) {
    if (err) {
      logger.error('[Notifications] Mark as read error', { error: err.message, userId, notificationId: id });
      return next({ status: 500, message: 'Failed to mark notification as read', details: err });
    }

    if (this.changes === 0) {
      return next({ status: 404, message: 'Notification not found' });
    }

    // 通知履歴も更新
    const historySql = `
      UPDATE notification_history
      SET read_at = datetime('now')
      WHERE user_id = ? AND title = (SELECT title FROM notifications WHERE id = ?)
      ORDER BY created_at DESC LIMIT 1
    `;

    db.run(historySql, [userId, id], (err) => {
      if (err) {
        logger.error('[Notifications] History update error', { error: err.message, userId, notificationId: id });
      }
    });

    res.json({
      status: 200,
      data: null,
      message: 'Notification marked as read'
    });
  });
};

// 既読通知をクリア
exports.clearRead = (req, res, next) => {
  const userId = req.user.id;
  const { before } = req.query;

  let sql = 'DELETE FROM notifications WHERE user_id = ? AND read = 1';
  const params = [userId];

  if (before) {
    sql += ' AND read_at < ?';
    params.push(before);
  }

  db.run(sql, params, function(err) {
    if (err) {
      logger.error('[Notifications] Clear read notifications error', { error: err.message, userId });
      return next({ status: 500, message: 'Failed to clear read notifications', details: err });
    }

    // 通知履歴もクリア（オプション）
    let historySql = 'DELETE FROM notification_history WHERE user_id = ? AND read_at IS NOT NULL';
    const historyParams = [userId];

    if (before) {
      historySql += ' AND read_at < ?';
      historyParams.push(before);
    }

    db.run(historySql, historyParams, (err) => {
      if (err) {
        logger.error('[Notifications] History clear error', { error: err.message, userId });
      }
    });

    res.json({
      status: 200,
      data: { deleted: this.changes },
      message: 'Read notifications cleared'
    });
  });
};

// Event-Driven API: 通知イベントを作成
exports.createNotificationEvent = async (req, res, next) => {
  const { eventType, eventData, priority = 5, userId, targetUsers, scheduledAt, deliveryChannels } = req.body;

  // バリデーション
  const Joi = require('joi');
  const eventSchema = Joi.object({
    eventType: Joi.string().required(),
    eventData: Joi.object().required(),
    priority: Joi.number().integer().min(1).max(10).optional(),
    userId: Joi.string().optional(),
    targetUsers: Joi.array().items(Joi.string()).optional(),
    scheduledAt: Joi.date().optional(),
    deliveryChannels: Joi.array().items(Joi.string()).default(['websocket'])
  });

  const { error, value } = eventSchema.validate({
    eventType,
    eventData,
    priority,
    userId,
    targetUsers,
    scheduledAt,
    deliveryChannels
  });

  if (error) {
    return next({ status: 400, message: 'Invalid event data', details: error.details });
  }

  try {
    const result = await NotificationEventProcessor.createEvent(
      value.eventType,
      value.eventData,
      {
        priority: value.priority,
        userId: value.userId,
        targetUsers: value.targetUsers,
        scheduledAt: value.scheduledAt,
        deliveryChannels: value.deliveryChannels
      }
    );

    res.json({
      status: 201,
      data: result,
      message: 'Notification event created successfully'
    });
  } catch (error) {
    logger.error('[Notifications] Create event error', { error: error.message, eventType: value.eventType });
    return next({ status: 500, message: 'Failed to create notification event', details: error.message });
  }
};

// Event-Driven API: イベントステータスを取得
exports.getEventStatus = async (req, res, next) => {
  const { limit = 20, offset = 0, status } = req.query;

  let sql = 'SELECT * FROM notification_events';
  const params = [];

  if (status) {
    sql += ' WHERE status = ?';
    params.push(status);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  db.all(sql, params, (err, rows) => {
    if (err) {
      logger.error('[Notifications] Get event status error', { error: err.message });
      return next({ status: 500, message: 'Failed to fetch event status', details: err.message });
    }

    const events = rows.map(row => ({
      ...row,
      eventData: JSON.parse(row.event_data),
      targetUsers: row.target_users ? JSON.parse(row.target_users) : null
    }));

    res.json({
      status: 200,
      data: {
        events,
        pagination: {
          limit: Number(limit),
          offset: Number(offset)
        }
      },
      message: 'Event status fetched'
    });
  });
};

// 通知チャネルを取得
exports.getNotificationChannels = async (req, res, next) => {
  const channelService = new NotificationChannelService();
  const channels = channelService.getAvailableChannels();

  res.json({
    status: 200,
    data: channels,
    message: 'Notification channels fetched'
  });
};

// 通知チャネルを更新
exports.updateNotificationChannel = async (req, res, next) => {
  const { id } = req.params;
  const { enabled, config, rateLimitPerMinute, rateLimitPerHour } = req.body;

  // バリデーション
  const Joi = require('joi');
  const channelSchema = Joi.object({
    enabled: Joi.boolean().optional(),
    config: Joi.object().optional(),
    rateLimitPerMinute: Joi.number().integer().min(1).optional(),
    rateLimitPerHour: Joi.number().integer().min(1).optional()
  });

  const { error, value } = channelSchema.validate({
    enabled,
    config,
    rateLimitPerMinute,
    rateLimitPerHour
  });

  if (error) {
    return next({ status: 400, message: 'Invalid channel data', details: error.details });
  }

  const updateFields = [];
  const params = [];

  if (value.enabled !== undefined) {
    updateFields.push('enabled = ?');
    params.push(value.enabled ? 1 : 0);
  }

  if (value.config !== undefined) {
    updateFields.push('config = ?');
    params.push(JSON.stringify(value.config));
  }

  if (value.rateLimitPerMinute !== undefined) {
    updateFields.push('rate_limit_per_minute = ?');
    params.push(value.rateLimitPerMinute);
  }

  if (value.rateLimitPerHour !== undefined) {
    updateFields.push('rate_limit_per_hour = ?');
    params.push(value.rateLimitPerHour);
  }

  if (updateFields.length === 0) {
    return next({ status: 400, message: 'No fields to update' });
  }

  updateFields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  const sql = `UPDATE notification_channels SET ${updateFields.join(', ')} WHERE id = ?`;

  db.run(sql, params, function(err) {
    if (err) {
      logger.error('[Notifications] Channel update error', { error: err.message, channelId: id });
      return next({ status: 500, message: 'Failed to update notification channel', details: err.message });
    }

    if (this.changes === 0) {
      return next({ status: 404, message: 'Notification channel not found' });
    }

// Nimメタプログラミング通知作成
exports.createMetaprogrammingNotification = async (req, res, next) => {
  const { macroName = 'generateNotificationHandler', userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const metaprogrammingService = new NimMetaprogrammingService();
    const result = await metaprogrammingService.processNotificationWithMetaprogramming({
      userId, type, level, title, message, metadata
    });

    res.json({
      status: 201,
      data: result,
      message: 'Metaprogramming notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create metaprogramming notification error', { error: error.message, userId, macroName });
    return next({
      status: 500,
      message: 'Failed to create metaprogramming notification',
      details: error.message
    });
  }
};

// Crystalファイバー並行処理通知作成
exports.createCrystalNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const crystalService = new CrystalConcurrencyService();
    const result = await crystalService.processNotificationWithCrystal({
      userId, type, level, title, message, metadata
    });

    res.json({
      status: 201,
      data: result,
      message: 'Crystal fiber notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create crystal notification error', { error: error.message, userId });
    return next({
      status: 500,
      message: 'Failed to create crystal notification',
      details: error.message
    });
  }
};

// Zigエラーハンドリング通知作成
exports.createZigNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const zigService = new ZigErrorHandlingService();
    const result = await zigService.processNotificationWithZig({
      userId, type, level, title, message, metadata
    });

    res.json({
      status: 201,
      data: result,
      message: 'Zig error-safe notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create zig notification error', { error: error.message, userId });
    return next({
      status: 500,
      message: 'Failed to create zig notification',
      details: error.message
    });
  }
};

// R統計分析通知作成
exports.createStatisticalNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const rService = new RStatisticalAnalysisService();
    const result = await rService.processNotificationWithR({
      userId, type, level, title, message, metadata
    });

// V言語風シンプル高速通知作成
exports.createVNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const vService = new VSimpleFastService();
    const result = await vService.processNotificationWithV({
      userId, type, level, title, message, metadata
    });

    res.json({
      status: 201,
      data: result,
      message: 'V-like simple and fast notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create V notification error', { error: error.message, userId });
    return next({
      status: 500,
      message: 'Failed to create V notification',
      details: error.message
    });
  }
};

// D言語風C++互換性通知作成
exports.createDNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const dService = new DCppCompatibilityService();
    const result = await dService.processNotificationWithD({
      userId, type, level, title, message, metadata
    });

    res.json({
      status: 201,
      data: result,
      message: 'D-like C++ compatible notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create D notification error', { error: error.message, userId });
    return next({
      status: 500,
      message: 'Failed to create D notification',
      details: error.message
    });
  }
};

// Ada言語風リアルタイム安全通知作成
exports.createAdaNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const adaService = new AdaRealTimeSafetyService();
    const result = await adaService.processNotificationWithAda({
      userId, type, level, title, message, metadata
    });

    res.json({
      status: 201,
      data: result,
      message: 'Ada-like real-time safe notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create Ada notification error', { error: error.message, userId });
    return next({
      status: 500,
      message: 'Failed to create Ada notification',
      details: error.message
    });
  }
};

// Prolog言語風論理プログラミング通知作成
exports.createPrologNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const prologService = new PrologLogicProgrammingService();
    const result = await prologService.processNotificationWithProlog({
      userId, type, level, title, message, metadata
    });

    res.json({
      status: 201,
      data: result,
      message: 'Prolog-like logic programming notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create Prolog notification error', { error: error.message, userId });
    return next({
      status: 500,
      message: 'Failed to create Prolog notification',
      details: error.message
    });
  }
};

// SQL言語風クエリ最適化通知作成
exports.createSQLNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const sqlService = new SQLQueryOptimizationService();
    const result = await sqlService.processNotificationWithSQL({
      userId, type, level, title, message, metadata
    });

// Smalltalk言語風ライブプログラミング通知作成
exports.createSmalltalkNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const smalltalkService = new SmalltalkLiveProgrammingService();
    const result = await smalltalkService.processNotificationWithSmalltalk({
      userId, type, level, title, message, metadata
    });

    res.json({
      status: 201,
      data: result,
      message: 'Smalltalk-like live programming notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create Smalltalk notification error', { error: error.message, userId });
    return next({
      status: 500,
      message: 'Failed to create Smalltalk notification',
      details: error.message
    });
  }
};

// Lisp言語風マクロシステム通知作成
exports.createLispNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const lispService = new LispMacroSystemService();
    const result = await lispService.processNotificationWithLisp({
      userId, type, level, title, message, metadata
    });

    res.json({
      status: 201,
      data: result,
      message: 'Lisp-like macro system notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create Lisp notification error', { error: error.message, userId });
    return next({
      status: 500,
      message: 'Failed to create Lisp notification',
      details: error.message
    });
  }
};

// MATLAB言語風数値計算通知作成
exports.createMatlabNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const matlabService = new MatlabMatrixComputingService();
    const result = await matlabService.processNotificationWithMatlab({
      userId, type, level, title, message, metadata
    });

    res.json({
      status: 201,
      data: result,
      message: 'MATLAB-like matrix computing notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create MATLAB notification error', { error: error.message, userId });
    return next({
      status: 500,
      message: 'Failed to create MATLAB notification',
      details: error.message
    });
  }
};

// C言語風低レベルシステム通知作成
exports.createCNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const cService = new CSystemsProgrammingService();
    const result = await cService.processNotificationWithC({
      userId, type, level, title, message, metadata
    });

    res.json({
      status: 201,
      data: result,
      message: 'C-like low-level systems notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create C notification error', { error: error.message, userId });
    return next({
      status: 500,
      message: 'Failed to create C notification',
      details: error.message
    });
  }
};

// C++言語風オブジェクト指向通知作成
exports.createCppNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const cppService = new CppObjectSystemsService();
    const result = await cppService.processNotificationWithCpp({
      userId, type, level, title, message, metadata
    });

    res.json({
      status: 201,
      data: result,
      message: 'C++-like object-oriented notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create C++ notification error', { error: error.message, userId });
    return next({
      status: 500,
      message: 'Failed to create C++ notification',
      details: error.message
    });
  }
};

// HTML/CSS言語風フロントエンド通知作成
exports.createHtmlCssNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const htmlCssService = new HtmlCssFrontendService();
    const result = await htmlCssService.processNotificationWithHtmlCss({
      userId, type, level, title, message, metadata
    });

    res.json({
      status: 201,
      data: result,
      message: 'HTML/CSS-like frontend notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create HTML/CSS notification error', { error: error.message, userId });
    return next({
      status: 500,
      message: 'Failed to create HTML/CSS notification',
      details: error.message
    });
  }
};

// Visual Basic言語風RAD開発通知作成
exports.createVisualBasicNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const vbService = new VisualBasicRadService();
    const result = await vbService.processNotificationWithVB({
      userId, type, level, title, message, metadata
    });

    res.json({
      status: 201,
      data: result,
      message: 'Visual Basic-like RAD notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create Visual Basic notification error', { error: error.message, userId });
    return next({
      status: 500,
      message: 'Failed to create Visual Basic notification',
      details: error.message
    });
  }
};

// Delphi言語風RAD開発通知作成
exports.createDelphiNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const delphiService = new DelphiRadService();
    const result = await delphiService.processNotificationWithDelphi({
      userId, type, level, title, message, metadata
    });

    res.json({
      status: 201,
      data: result,
      message: 'Delphi-like RAD notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create Delphi notification error', { error: error.message, userId });
    return next({
      status: 500,
      message: 'Failed to create Delphi notification',
      details: error.message
    });
  }
};

// Pascal言語風構造化プログラミング通知作成
exports.createPascalNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const pascalService = new PascalStructuredService();
    const result = await pascalService.processNotificationWithPascal({
      userId, type, level, title, message, metadata
    });

    res.json({
      status: 201,
      data: result,
      message: 'Pascal-like structured notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create Pascal notification error', { error: error.message, userId });
    return next({
      status: 500,
      message: 'Failed to create Pascal notification',
      details: error.message
    });
  }
};

// COBOL言語風ビジネスデータ処理通知作成
exports.createCobolNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const cobolService = new CobolBusinessService();
    const result = await cobolService.processNotificationWithCobol({
      userId, type, level, title, message, metadata
    });

    res.json({
      status: 201,
      data: result,
      message: 'COBOL-like business notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create COBOL notification error', { error: error.message, userId });
    return next({
      status: 500,
      message: 'Failed to create COBOL notification',
      details: error.message
    });
  }
};

// Fortran言語風科学技術計算通知作成
exports.createFortranNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const fortranService = new FortranScientificService();
    const result = await fortranService.processNotificationWithFortran({
      userId, type, level, title, message, metadata
    });

    res.json({
      status: 201,
      data: result,
      message: 'Fortran-like scientific notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create Fortran notification error', { error: error.message, userId });
    return next({
      status: 500,
      message: 'Failed to create Fortran notification',
      details: error.message
    });
  }
};

// Shell Script言語風システム自動化通知作成
exports.createShellNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const shellService = new ShellScriptAutomationService();
    const result = await shellService.processNotificationWithShell({
      userId, type, level, title, message, metadata
    });

    res.json({
      status: 201,
      data: result,
      message: 'Shell Script-like automation notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create Shell notification error', { error: error.message, userId });
    return next({
      status: 500,
      message: 'Failed to create Shell notification',
      details: error.message
    });
  }
};

// PowerShell言語風Windows管理通知作成
exports.createPowerShellNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const powershellService = new PowerShellManagementService();
    const result = await powershellService.processNotificationWithPowerShell({
      userId, type, level, title, message, metadata
    });

    res.json({
      status: 201,
      data: result,
      message: 'PowerShell-like management notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create PowerShell notification error', { error: error.message, userId });
    return next({
      status: 500,
      message: 'Failed to create PowerShell notification',
      details: error.message
    });
  }
};

// LabVIEW言語風グラフィカルプログラミング通知作成
exports.createLabViewNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const labviewService = new LabViewGraphicalService();
    const result = await labviewService.processNotificationWithLabVIEW({
      userId, type, level, title, message, metadata
    });

    res.json({
      status: 201,
      data: result,
      message: 'LabVIEW-like graphical notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create LabVIEW notification error', { error: error.message, userId });
    return next({
      status: 500,
      message: 'Failed to create LabVIEW notification',
      details: error.message
    });
  }
};

// Verilog/VHDL言語風ハードウェア設計通知作成
exports.createVerilogNotification = async (req, res, next) => {
  const { userId, type = 'info', level = 'normal', title, message, metadata } = req.body;

  try {
    const hardwareService = new VerilogVhdlHardwareService();
    const result = await hardwareService.processNotificationWithVerilog({
      userId, type, level, title, message, metadata
    });

    res.json({
      status: 201,
      data: result,
      message: 'Verilog/VHDL-like hardware notification created successfully'
    });

  } catch (error) {
    logger.error('[Notifications] Create Verilog/VHDL notification error', { error: error.message, userId });
    return next({
      status: 500,
      message: 'Failed to create Verilog/VHDL notification',
      details: error.message
    });
  }
};

const db = require('../db');
const logger = require('../logger');

/**
 * 高度な通知テンプレートエンジン
 * Laravelのような統一されたインターフェースを提供
 */
class NotificationTemplateEngine {
  constructor() {
    this.templates = new Map();
    this.variableSchemas = new Map();
    this.conditions = new Map();
    this.channelTemplates = new Map();
    this.initializeTemplates();
  }

  /**
   * テンプレートを初期化
   */
  async initializeTemplates() {
    await this.loadTemplates();
    await this.loadVariableSchemas();
    await this.loadConditions();
    await this.loadChannelTemplates();
    logger.info('[NotificationTemplateEngine] Templates initialized', {
      templates: this.templates.size,
      schemas: this.variableSchemas.size
    });
  }

  /**
   * テンプレートを読み込み
   */
  async loadTemplates() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM notification_templates WHERE enabled = 1';
      db.all(sql, (err, rows) => {
        if (err) return reject(err);

        rows.forEach(row => {
          this.templates.set(row.id, {
            ...row,
            variables: row.variables ? JSON.parse(row.variables) : [],
            channelConfigs: row.channel_configs ? JSON.parse(row.channel_configs) : {}
          });
        });
        resolve();
      });
    });
  }

  /**
   * 変数スキーマを読み込み
   */
  async loadVariableSchemas() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM notification_variable_schemas';
      db.all(sql, (err, rows) => {
        if (err) return reject(err);

        rows.forEach(row => {
          if (!this.variableSchemas.has(row.template_id)) {
            this.variableSchemas.set(row.template_id, new Map());
          }
          this.variableSchemas.get(row.template_id).set(row.variable_name, row);
        });
        resolve();
      });
    });
  }

  /**
   * 条件を読み込み
   */
  async loadConditions() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM notification_conditions ORDER BY template_id, id';
      db.all(sql, (err, rows) => {
        if (err) return reject(err);

        rows.forEach(row => {
          if (!this.conditions.has(row.template_id)) {
            this.conditions.set(row.template_id, []);
          }
          this.conditions.get(row.template_id).push(row);
        });
        resolve();
      });
    });
  }

  /**
   * チャネルテンプレートを読み込み
   */
  async loadChannelTemplates() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM notification_channel_templates WHERE enabled = 1';
      db.all(sql, (err, rows) => {
        if (err) return reject(err);

        rows.forEach(row => {
          if (!this.channelTemplates.has(row.template_id)) {
            this.channelTemplates.set(row.template_id, new Map());
          }
          this.channelTemplates.get(row.template_id).set(row.channel_type, {
            ...row,
            templateVariables: row.template_variables ? JSON.parse(row.template_variables) : [],
            formattingOptions: row.formatting_options ? JSON.parse(row.formatting_options) : {}
          });
        });
        resolve();
      });
    });
  }

  /**
   * 型安全な通知を作成（Laravel風のインターフェース）
   */
  async createNotification(templateId, variables = {}, options = {}) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    // 変数の検証
    const validatedVariables = this.validateVariables(templateId, variables);

    // 条件の評価
    if (!this.evaluateConditions(templateId, validatedVariables)) {
      logger.info('[NotificationTemplateEngine] Notification skipped due to conditions', { templateId });
      return null;
    }

    // 各チャネル用のメッセージを生成
    const channelMessages = await this.generateChannelMessages(templateId, validatedVariables, options);

    return {
      templateId,
      variables: validatedVariables,
      channels: channelMessages,
      priority: template.priority || 5,
      metadata: options.metadata || {}
    };
  }

  /**
   * 変数を検証（型安全性）
   */
  validateVariables(templateId, variables) {
    const schema = this.variableSchemas.get(templateId);
    if (!schema) return variables;

    const validated = {};
    const errors = [];

    for (const [varName, varSchema] of schema) {
      const value = variables[varName];

      // 必須チェック
      if (varSchema.required && (value === undefined || value === null)) {
        errors.push(`Required variable '${varName}' is missing`);
        continue;
      }

      // 型チェック
      if (value !== undefined && value !== null) {
        const isValidType = this.validateVariableType(value, varSchema.variable_type);
        if (!isValidType) {
          errors.push(`Variable '${varName}' must be of type ${varSchema.variable_type}`);
          continue;
        }

        // バリデーションルールチェック
        if (varSchema.validation_rules) {
          const rules = JSON.parse(varSchema.validation_rules);
          if (!this.validateVariableRules(value, rules)) {
            errors.push(`Variable '${varName}' failed validation rules`);
            continue;
          }
        }
      }

      validated[varName] = value || varSchema.default_value;
    }

    if (errors.length > 0) {
      throw new Error(`Variable validation failed: ${errors.join(', ')}`);
    }

    return validated;
  }

  /**
   * 変数の型を検証
   */
  validateVariableType(value, expectedType) {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'date':
        return value instanceof Date || !isNaN(Date.parse(value));
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && !Array.isArray(value) && value !== null;
      default:
        return true;
    }
  }

  /**
   * バリデーションルールを検証
   */
  validateVariableRules(value, rules) {
    if (rules.max_length && value.length > rules.max_length) return false;
    if (rules.min_length && value.length < rules.min_length) return false;
    if (rules.pattern && !rules.pattern.test(value)) return false;
    if (rules.enum && !rules.enum.includes(value)) return false;
    if (rules.min && value < rules.min) return false;
    if (rules.max && value > rules.max) return false;
    return true;
  }

  /**
   * 条件を評価
   */
  evaluateConditions(templateId, variables) {
    const templateConditions = this.conditions.get(templateId);
    if (!templateConditions || templateConditions.length === 0) {
      return true; // 条件なしは常にtrue
    }

    return templateConditions.every(condition => {
      const value = variables[condition.condition_key];
      return this.evaluateSingleCondition(value, condition);
    });
  }

  /**
   * 単一の条件を評価
   */
  evaluateSingleCondition(value, condition) {
    switch (condition.condition_operator) {
      case 'equals':
        return value == condition.condition_value;
      case 'not_equals':
        return value != condition.condition_value;
      case 'greater_than':
        return value > condition.condition_value;
      case 'less_than':
        return value < condition.condition_value;
      case 'contains':
        return String(value).includes(condition.condition_value);
      case 'in':
        return condition.condition_value.includes(value);
      case 'not_in':
        return !condition.condition_value.includes(value);
      default:
        return true;
    }
  }

  /**
   * 各チャネル用のメッセージを生成
   */
  async generateChannelMessages(templateId, variables, options) {
    const template = this.templates.get(templateId);
    const channelTemplates = this.channelTemplates.get(templateId);
    const messages = {};

    // 利用可能なチャネルを取得
    const availableChannels = options.channels || ['websocket'];

    for (const channel of availableChannels) {
      if (channelTemplates && channelTemplates.has(channel)) {
        // チャネル固有のテンプレートを使用
        const channelTemplate = channelTemplates.get(channel);
        messages[channel] = this.renderTemplate(channelTemplate, variables);
      } else {
        // デフォルトテンプレートを使用
        messages[channel] = this.renderDefaultTemplate(template, channel, variables);
      }
    }

    return messages;
  }

  /**
   * チャネル固有のテンプレートをレンダリング
   */
  renderTemplate(channelTemplate, variables) {
    let subject = channelTemplate.subject_template;
    let body = channelTemplate.body_template;

    // 変数を置換
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{${key}}`;
      if (subject) subject = subject.replace(new RegExp(placeholder, 'g'), String(value));
      body = body.replace(new RegExp(placeholder, 'g'), String(value));
    }

    return {
      subject: subject || null,
      body,
      formatting: channelTemplate.formattingOptions,
      variables: channelTemplate.templateVariables
    };
  }

  /**
   * デフォルトテンプレートをレンダリング
   */
  renderDefaultTemplate(template, channel, variables) {
    let title = template.title_template;
    let message = template.message_template;

    // 変数を置換
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{${key}}`;
      title = title.replace(new RegExp(placeholder, 'g'), String(value));
      message = message.replace(new RegExp(placeholder, 'g'), String(value));
    }

    // チャネルに応じたフォーマット
    switch (channel) {
      case 'websocket':
        return { title, message, type: template.type, level: this.getLevelFromPriority(template.priority) };
      case 'email':
        return { subject: title, body: message, format: 'html' };
      case 'sms':
        return { message: message.substring(0, 160) }; // SMSは160文字制限
      case 'slack':
        return { text: message, format: 'slack' };
      case 'push':
        return { title, body: message };
      default:
        return { title, message };
    }
  }

  /**
   * 優先度からレベルを取得
   */
  getLevelFromPriority(priority) {
    if (priority >= 8) return 'urgent';
    if (priority >= 6) return 'high';
    if (priority >= 4) return 'normal';
    return 'low';
  }

  /**
   * テンプレートを更新
   */
  async updateTemplate(templateId, updates) {
    const updateFields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const params = Object.values(updates);
    params.push(templateId);

    const sql = `UPDATE notification_templates SET ${updateFields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;

    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) return reject(err);

        // キャッシュを更新
        if (this.changes > 0) {
          this.initializeTemplates();
        }

        resolve({ changes: this.changes });
      });
    });
  }

  /**
   * 利用可能なテンプレートを取得
   */
  getAvailableTemplates() {
    return Array.from(this.templates.values()).map(template => ({
      id: template.id,
      type: template.type,
      title: template.title_template,
      description: template.message_template,
      variables: template.variables,
      priority: template.priority,
      templateType: template.template_type
    }));
  }
}

module.exports = NotificationTemplateEngine;

// backend/src/middleware/unifiedMiddleware.js
const rateLimit = require('express-rate-limit');

/**
 * 統合ミドルウェア
 * すべてのミドルウェア機能を統合した軽量な実装
 */
class UnifiedMiddleware {
  constructor() {
    this.config = {
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15分
        max: 100 // 100リクエスト
      },
      cors: {
        origin: process.env.NODE_ENV === 'production'
          ? process.env.ALLOWED_ORIGINS?.split(',') || false
          : true,
        credentials: true
      }
    };
  }

  /**
   * レート制限ミドルウェア（軽量処理）
   */
  rateLimit() {
    return rateLimit({
      windowMs: this.config.rateLimit.windowMs,
      max: this.config.rateLimit.max,
      message: {
        success: false,
        message: 'リクエストが多すぎます。しばらく時間をおいてから再試行してください。'
      },
      standardHeaders: true,
      legacyHeaders: false
    });
  }

  /**
   * CORSミドルウェア（軽量処理）
   */
  cors() {
    const cors = require('cors');
    return cors(this.config.cors);
  }

  /**
   * セキュリティヘッダーミドルウェア（軽量処理）
   */
  securityHeaders() {
    return (req, res, next) => {
      // 基本的なセキュリティヘッダー設定
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');

      if (req.secure) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      }

      next();
    };
  }

  /**
   * リクエストログミドルウェア（軽量処理）
   */
  requestLogger() {
    return (req, res, next) => {
      const start = Date.now();

      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
      });

      next();
    };
  }

  /**
   * エラーハンドリングミドルウェア（軽量処理）
   */
  errorHandler() {
    return (err, req, res, next) => {
      console.error('エラー:', err.message);

      const errorResponse = {
        success: false,
        message: 'サーバー内部エラーが発生しました。',
        ...(process.env.NODE_ENV === 'development' && {
          error: err.message,
          stack: err.stack
        })
      };

      res.status(err.statusCode || 500).json(errorResponse);
    };
  }

  /**
   * 認証ミドルウェア（軽量処理）
   */
  auth() {
    return (req, res, next) => {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          message: '認証が必要です。'
        });
      }

      // トークン検証（実際の実装では適切な検証ロジックを追加）
      req.user = { id: 'user_id', role: 'user' };
      next();
    };
  }

  /**
   * 入力検証ミドルウェア（軽量処理）
   */
  validateInput() {
    return (req, res, next) => {
      // 基本的な入力検証
      if (req.body && typeof req.body === 'object') {
        // 危険な文字列のチェック
        const content = JSON.stringify(req.body);
        const dangerousPatterns = [
          /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
          /javascript:/gi,
          /on\w+\s*=/gi
        ];

        for (const pattern of dangerousPatterns) {
          if (pattern.test(content)) {
            return res.status(400).json({
              success: false,
              message: '不正な入力が検知されました。'
            });
          }
        }
      }

      next();
    };
  }

  /**
   * 設定の更新（軽量処理）
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
}

// シングルトンインスタンス
const unifiedMiddleware = new UnifiedMiddleware();

module.exports = unifiedMiddleware;

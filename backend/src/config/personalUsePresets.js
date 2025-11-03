const logger = require('../logger');

/**
 * Personal Use Optimization Presets
 * Optimized configuration for single-user or small team deployments
 * Focus on maximum security and functionality with minimal external dependencies
 */

const personalUsePresets = {
  // High Security Personal Use
  highSecurity: {
    name: 'High Security Personal Use',
    description: 'Maximum security settings for personal deployment',
    config: {
      // Authentication & Security
      security: {
        enable2FA: true,
        requireStrongPasswords: true,
        passwordMinLength: 16,
        sessionTimeout: 30 * 60 * 1000, // 30 minutes
        maxLoginAttempts: 3,
        lockoutDuration: 15 * 60 * 1000, // 15 minutes
        tokenRotation: true,
        csrfProtection: true,
        sessionHijackDetection: true,
        ipWhitelist: true, // Recommended for personal use
        requireIPWhitelist: false // Optional based on network setup
      },

      // Data Protection
      data: {
        encryptionEnabled: true,
        backupEnabled: true,
        autoBackupInterval: '0 2 * * *', // Daily at 2 AM
        backupEncryption: true,
        maxBackups: 30,
        gdprCompliance: true,
        auditLogging: true,
        dataRetentionDays: 365
      },

      // Performance
      performance: {
        cacheEnabled: true,
        queryCacheEnabled: true,
        responseCacheEnabled: true,
        connectionPoolSize: 3, // Smaller pool for personal use
        circuitBreakerEnabled: true
      },

      // Monitoring
      monitoring: {
        alertingEnabled: true,
        metricsCollectionEnabled: true,
        healthCheckInterval: 60000,
        alertThresholds: {
          errorRate: 0.03, // More sensitive for personal use
          responseTime: 800,
          memoryUsage: 0.85,
          cpuUsage: 0.75
        }
      }
    }
  },

  // Balanced Personal Use
  balanced: {
    name: 'Balanced Personal Use',
    description: 'Balance between security and convenience',
    config: {
      security: {
        enable2FA: true,
        requireStrongPasswords: true,
        passwordMinLength: 12,
        sessionTimeout: 60 * 60 * 1000, // 1 hour
        maxLoginAttempts: 5,
        lockoutDuration: 10 * 60 * 1000,
        tokenRotation: true,
        csrfProtection: true,
        sessionHijackDetection: true,
        ipWhitelist: false
      },

      data: {
        encryptionEnabled: true,
        backupEnabled: true,
        autoBackupInterval: '0 3 * * 0', // Weekly on Sunday at 3 AM
        backupEncryption: true,
        maxBackups: 14,
        gdprCompliance: true,
        auditLogging: true,
        dataRetentionDays: 180
      },

      performance: {
        cacheEnabled: true,
        queryCacheEnabled: true,
        responseCacheEnabled: true,
        connectionPoolSize: 5,
        circuitBreakerEnabled: true
      },

      monitoring: {
        alertingEnabled: true,
        metricsCollectionEnabled: true,
        healthCheckInterval: 120000,
        alertThresholds: {
          errorRate: 0.05,
          responseTime: 1000,
          memoryUsage: 0.9,
          cpuUsage: 0.8
        }
      }
    }
  },

  // Development/Testing
  development: {
    name: 'Development Mode',
    description: 'Optimized for development and testing',
    config: {
      security: {
        enable2FA: false,
        requireStrongPasswords: false,
        passwordMinLength: 6,
        sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
        maxLoginAttempts: 10,
        lockoutDuration: 5 * 60 * 1000,
        tokenRotation: false,
        csrfProtection: true,
        sessionHijackDetection: false,
        ipWhitelist: false
      },

      data: {
        encryptionEnabled: false,
        backupEnabled: false,
        autoBackupInterval: null,
        backupEncryption: false,
        maxBackups: 7,
        gdprCompliance: false,
        auditLogging: false,
        dataRetentionDays: 30
      },

      performance: {
        cacheEnabled: true,
        queryCacheEnabled: false, // Disable for fresh data
        responseCacheEnabled: false,
        connectionPoolSize: 2,
        circuitBreakerEnabled: false
      },

      monitoring: {
        alertingEnabled: false,
        metricsCollectionEnabled: true,
        healthCheckInterval: 300000,
        alertThresholds: {
          errorRate: 0.1,
          responseTime: 2000,
          memoryUsage: 0.95,
          cpuUsage: 0.9
        }
      }
    }
  },

  // Local-First (Offline Capable)
  localFirst: {
    name: 'Local-First Mode',
    description: 'Minimal external dependencies, maximum privacy',
    config: {
      security: {
        enable2FA: true,
        requireStrongPasswords: true,
        passwordMinLength: 14,
        sessionTimeout: 2 * 60 * 60 * 1000, // 2 hours
        maxLoginAttempts: 5,
        lockoutDuration: 15 * 60 * 1000,
        tokenRotation: true,
        csrfProtection: true,
        sessionHijackDetection: true,
        ipWhitelist: true
      },

      data: {
        encryptionEnabled: true,
        backupEnabled: true,
        autoBackupInterval: '0 */6 * * *', // Every 6 hours
        backupEncryption: true,
        maxBackups: 50,
        gdprCompliance: true,
        auditLogging: true,
        dataRetentionDays: 730, // 2 years local retention
        localStorageOnly: true
      },

      performance: {
        cacheEnabled: true,
        queryCacheEnabled: true,
        responseCacheEnabled: true,
        connectionPoolSize: 3,
        circuitBreakerEnabled: true,
        offlineMode: true
      },

      monitoring: {
        alertingEnabled: true,
        metricsCollectionEnabled: true,
        healthCheckInterval: 60000,
        alertThresholds: {
          errorRate: 0.02,
          responseTime: 500,
          memoryUsage: 0.8,
          cpuUsage: 0.7
        },
        disableExternalReporting: true
      },

      features: {
        disableExternalAPIs: false, // YouTube/Twitch APIs still needed
        disableAnalytics: true,
        disableTracking: true,
        offlineSupport: true,
        localAIModeration: true // Use local models when available
      }
    }
  }
};

/**
 * Apply preset configuration
 */
function applyPreset(presetName, customOverrides = {}) {
  const preset = personalUsePresets[presetName];

  if (!preset) {
    logger.error('[PersonalUsePresets] Invalid preset name', { presetName });
    throw new Error(`Invalid preset: ${presetName}`);
  }

  logger.info('[PersonalUsePresets] Applying preset', {
    preset: preset.name,
    hasOverrides: Object.keys(customOverrides).length > 0
  });

  // Deep merge preset config with custom overrides
  const config = deepMerge(preset.config, customOverrides);

  return {
    presetName: preset.name,
    description: preset.description,
    config
  };
}

/**
 * Get recommended preset based on environment
 */
function getRecommendedPreset() {
  const env = process.env.NODE_ENV;

  if (env === 'development') {
    return 'development';
  }

  // Check if this is a personal deployment
  const isPersonal = process.env.DEPLOYMENT_TYPE === 'personal';
  const requiresHighSecurity = process.env.HIGH_SECURITY_MODE === 'true';
  const localOnly = process.env.LOCAL_MODE === 'true';

  if (localOnly) {
    return 'localFirst';
  }

  if (isPersonal && requiresHighSecurity) {
    return 'highSecurity';
  }

  if (isPersonal) {
    return 'balanced';
  }

  return 'balanced'; // Default fallback
}

/**
 * Deep merge utility
 */
function deepMerge(target, source) {
  const output = { ...target };

  for (const key in source) {
    if (source[key] instanceof Object && key in target) {
      output[key] = deepMerge(target[key], source[key]);
    } else {
      output[key] = source[key];
    }
  }

  return output;
}

/**
 * Validate preset configuration
 */
function validatePresetConfig(config) {
  const errors = [];

  // Security validation
  if (config.security.enable2FA && !config.security.tokenRotation) {
    errors.push('2FA requires token rotation to be enabled');
  }

  if (config.security.sessionTimeout < 5 * 60 * 1000) {
    errors.push('Session timeout must be at least 5 minutes');
  }

  if (config.security.passwordMinLength < 8) {
    errors.push('Password minimum length must be at least 8 characters');
  }

  // Data validation
  if (config.data.backupEnabled && !config.data.autoBackupInterval) {
    errors.push('Backup enabled but no schedule configured');
  }

  if (config.data.backupEncryption && !config.data.encryptionEnabled) {
    errors.push('Backup encryption requires general encryption to be enabled');
  }

  // Performance validation
  if (config.performance.connectionPoolSize < 1) {
    errors.push('Connection pool size must be at least 1');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Export preset as environment variables
 */
function exportAsEnv(presetName) {
  const { config } = applyPreset(presetName);
  const envVars = {};

  // Security
  envVars.ENABLE_2FA = config.security.enable2FA;
  envVars.PASSWORD_MIN_LENGTH = config.security.passwordMinLength;
  envVars.SESSION_MAX_AGE = config.security.sessionTimeout;
  envVars.MAX_LOGIN_ATTEMPTS = config.security.maxLoginAttempts;
  envVars.TOKEN_ROTATION_ENABLED = config.security.tokenRotation;
  envVars.CSRF_ENABLED = config.security.csrfProtection;
  envVars.ENABLE_IP_WHITELIST = config.security.ipWhitelist;

  // Data
  envVars.ENCRYPTION_ENABLED = config.data.encryptionEnabled;
  envVars.AUTO_BACKUP = config.data.backupEnabled;
  envVars.BACKUP_SCHEDULE = config.data.autoBackupInterval;
  envVars.ENCRYPT_BACKUPS = config.data.backupEncryption;
  envVars.MAX_BACKUPS = config.data.maxBackups;
  envVars.GDPR_ENABLED = config.data.gdprCompliance;
  envVars.AUDIT_LOGGING = config.data.auditLogging;

  // Performance
  envVars.CACHE_ENABLED = config.performance.cacheEnabled;
  envVars.QUERY_CACHE_ENABLED = config.performance.queryCacheEnabled;
  envVars.RESPONSE_CACHE_ENABLED = config.performance.responseCacheEnabled;
  envVars.DB_POOL_SIZE = config.performance.connectionPoolSize;
  envVars.CIRCUIT_BREAKER_ENABLED = config.performance.circuitBreakerEnabled;

  // Monitoring
  envVars.ALERTING_ENABLED = config.monitoring.alertingEnabled;
  envVars.HEALTH_CHECK_INTERVAL = config.monitoring.healthCheckInterval;

  return envVars;
}

module.exports = {
  personalUsePresets,
  applyPreset,
  getRecommendedPreset,
  validatePresetConfig,
  exportAsEnv
};

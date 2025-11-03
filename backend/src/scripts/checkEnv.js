#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../../..');

const placeholderPatterns = [/your-/i, /changeme/i, /replace-?me/i, /example/i, /sample/i];

const targets = [
  {
    name: 'backend',
    file: path.join(projectRoot, 'backend', '.env'),
    required: ['JWT_SECRET', 'YOUTUBE_API_KEY', 'TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET'],
    optional: [
      'OPENAI_API_KEY',
      'SESSION_SECRET',
      'ENCRYPTION_KEY',
      'SESSION_STORE',
      'SESSION_REDIS_URL',
      'SESSION_REDIS_PREFIX',
      'SESSION_COOKIE_DOMAIN',
      'SESSION_ROLLING'
    ],
    validations: {
      JWT_SECRET: {
        message: 'JWT_SECRET は32文字以上でプレースホルダー文字列を含まない必要があります。',
        validate: (value) => typeof value === 'string' && value.length >= 32 && !placeholderPatterns.some((pattern) => pattern.test(value))
      },
      YOUTUBE_API_KEY: {
        message: 'YOUTUBE_API_KEY のプレースホルダーを本番の値に置き換えてください。',
        validate: (value) => typeof value === 'string' && !placeholderPatterns.some((pattern) => pattern.test(value)) && value.length >= 20
      },
      TWITCH_CLIENT_ID: {
        message: 'TWITCH_CLIENT_ID のプレースホルダーを本番の値に置き換えてください。',
        validate: (value) => typeof value === 'string' && !placeholderPatterns.some((pattern) => pattern.test(value)) && value.length >= 10
      },
      TWITCH_CLIENT_SECRET: {
        message: 'TWITCH_CLIENT_SECRET のプレースホルダーを本番の値に置き換えてください。',
        validate: (value) => typeof value === 'string' && !placeholderPatterns.some((pattern) => pattern.test(value))
      },
      OPENAI_API_KEY: {
        message: 'OPENAI_API_KEY を設定する場合は実際のAPIキーを指定してください。',
        optional: true,
        validate: (value) => !value || (typeof value === 'string' && !placeholderPatterns.some((pattern) => pattern.test(value)))
      },
      SESSION_SECRET: {
        message: 'SESSION_SECRET は32文字以上でプレースホルダー文字列を含まない必要があります。',
        optional: true,
        validate: (value) => !value || (typeof value === 'string' && value.length >= 32 && !placeholderPatterns.some((pattern) => pattern.test(value)))
      },
      ENCRYPTION_KEY: {
        message: 'ENCRYPTION_KEY は32文字以上でプレースホルダー文字列を含まない必要があります。',
        optional: true,
        validate: (value) => !value || (typeof value === 'string' && value.length >= 32 && !placeholderPatterns.some((pattern) => pattern.test(value)))
      },
      SESSION_STORE: {
        message: 'SESSION_STORE は "memory" または "redis" を指定してください。',
        optional: true,
        validate: (value) => !value || ['memory', 'redis'].includes(value.toLowerCase())
      },
      SESSION_REDIS_URL: {
        message: 'SESSION_REDIS_URL を指定する場合は有効な redis:// URL を設定してください。',
        optional: true,
        validate: (value) => !value || (/^redis:\/\//i.test(value) && !placeholderPatterns.some((pattern) => pattern.test(value)))
      },
      SESSION_REDIS_PREFIX: {
        message: 'SESSION_REDIS_PREFIX を指定する場合は256文字以内の接頭辞を設定してください。',
        optional: true,
        validate: (value) => !value || (typeof value === 'string' && value.length > 0 && value.length <= 256)
      },
      SESSION_COOKIE_DOMAIN: {
        message: 'SESSION_COOKIE_DOMAIN を指定する場合は有効なドメイン名を設定してください。',
        optional: true,
        validate: (value) =>
          !value ||
          (/^[a-z0-9.-]+$/i.test(value) && value.includes('.') && !placeholderPatterns.some((pattern) => pattern.test(value)))
      },
      SESSION_ROLLING: {
        message: 'SESSION_ROLLING は true か false のいずれかを指定してください。',
        optional: true,
        validate: (value) => !value || ['true', 'false'].includes(value.toLowerCase())
      }
    }
  },
  {
    name: 'frontend',
    file: path.join(projectRoot, 'frontend', '.env'),
    required: ['VITE_API_BASE_URL', 'VITE_WS_URL'],
    optional: ['VITE_THEME_DEFAULT'],
    validations: {
      VITE_API_BASE_URL: {
        message: 'VITE_API_BASE_URL は有効なURLで指定してください。',
        validate: (value) => typeof value === 'string' && /^https?:\/\//.test(value)
      },
      VITE_WS_URL: {
        message: 'VITE_WS_URL は ws:// または wss:// で始まる必要があります。',
        validate: (value) => typeof value === 'string' && /^wss?:\/\//.test(value)
      }
    }
  },
];

const parseEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return { exists: false, values: {} };
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const values = {};

  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }
    const idx = trimmed.indexOf('=');
    if (idx === -1) {
      return;
    }
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    values[key] = value;
  });

  return { exists: true, values };
};

const results = [];
let hasErrors = false;

console.log('🔍 Checking environment configuration...\n');

targets.forEach((target) => {
  const { name, file, required, optional, validations = {} } = target;
  const parsed = parseEnvFile(file);

  if (!parsed.exists) {
    hasErrors = true;
    results.push({
      name,
      status: 'missing',
      message: `${file} が見つかりません。コピー元: ${path.basename(file)}.example`,
      missingRequired: required,
      missingOptional: optional,
    });
    return;
  }

  const missingRequired = required.filter((key) => {
    const value = parsed.values[key];
    return value == null || value === '';
  });

  const missingOptional = optional.filter((key) => {
    const value = parsed.values[key];
    return value == null || value === '';
  });

  const invalidValues = [];
  Object.entries(validations).forEach(([key, rule]) => {
    const value = parsed.values[key];
    if (value == null || value === '') {
      return;
    }
    if (!rule.validate(value)) {
      invalidValues.push({ key, message: rule.message });
    }
  });

  const sessionStoreValue = (parsed.values.SESSION_STORE || 'memory').toLowerCase();
  if (!['memory', 'redis'].includes(sessionStoreValue)) {
    invalidValues.push({ key: 'SESSION_STORE', message: 'SESSION_STORE は "memory" または "redis" を指定してください。' });
  }

  if (sessionStoreValue === 'redis') {
    const redisUrl = parsed.values.SESSION_REDIS_URL;
    if (!redisUrl || redisUrl.trim() === '') {
      invalidValues.push({ key: 'SESSION_REDIS_URL', message: 'SESSION_STORE=redis の場合は SESSION_REDIS_URL を設定してください。' });
    }
  }

  if (missingRequired.length > 0) {
    hasErrors = true;
  }

  if (invalidValues.length > 0) {
    hasErrors = true;
  }

  results.push({
    name,
    status:
      missingRequired.length === 0 && invalidValues.length === 0 ? 'ok' : 'needs-attention',
    message: `${file} を検査しました`,
    missingRequired,
    missingOptional,
    invalidValues,
    checkedKeys: {
      required,
      optional,
      hasValidations: Object.keys(validations).length > 0
    }
  });
});

results.forEach((result) => {
  const headerIcon = result.status === 'ok' ? '✅' : '⚠️';
  console.log(`${headerIcon} ${result.name}`);
  console.log(`   ${result.message}`);
  if (result.missingRequired.length > 0) {
    console.log(`   必須キーが未設定: ${result.missingRequired.join(', ')}`);
  }
  if (result.missingOptional.length > 0) {
    console.log(`   任意キーが未設定 (機能低下の可能性あり): ${result.missingOptional.join(', ')}`);
  }
  if (result.invalidValues && result.invalidValues.length > 0) {
    result.invalidValues.forEach(({ key, message }) => {
      console.log(`   ${key}: ${message}`);
    });
  }
  if (result.checkedKeys.hasValidations) {
    console.log(`   チェック対象: 必須 ${result.checkedKeys.required.join(', ')} / 任意 ${result.checkedKeys.optional.join(', ')}`);
  }
  console.log('');
});

const summary = results.reduce(
  (acc, result) => {
    acc.total += 1;
    if (result.status === 'ok') acc.ok += 1;
    else if (result.status === 'missing') acc.missing += 1;
    else acc.attention += 1;
    return acc;
  },
  { total: 0, ok: 0, attention: 0, missing: 0 }
);

console.log(
  `📌 サマリー: OK ${summary.ok}/${summary.total}, 要対応 ${summary.attention}, 未作成 ${summary.missing}`
);

if (hasErrors) {
  console.log('❌ 一部の環境変数が未設定です。`.env.example` を参照して補完してください。');
  process.exit(1);
}

console.log('🎉 すべての必須環境変数が設定されています。');
process.exit(0);

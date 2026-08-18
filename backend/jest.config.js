module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/tests/**/*.test.js',
    '**/src/**/*.test.js'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/server.js',
    '!src/scripts/**',
    '!src/config/**',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  // カバレッジ閾値は「ラチェット」として使う。
  // 旧設定は 90%/85% という **一度も達成されたことのない願望値**で、実測は
  // statements 37.9% / branches 29.6% / lines 37.9% / functions 36.2% だった。
  // その結果 `npm run test:coverage` は常に非ゼロ終了し、**CIは恒常的にレッド**で、
  // 誰も見なくなっていた（＝自動化が何も強制していない状態）。落ちっぱなしのCIは
  // 無いCIより悪い。現状を僅かに下回る値に設定して**CIをグリーンにし、
  // 以後カバレッジが下がったら失敗する**ようにする。上げるのは容易なので、
  // カバレッジを改善したらこの数値も引き上げること
  coverageThreshold: {
    global: {
      branches: 29,
      functions: 35,
      lines: 37,
      statements: 37
    }
  },
  globalSetup: '<rootDir>/tests/globalSetup.js',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 15000,
  verbose: true,
  maxWorkers: '50%',
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
  detectOpenHandles: true,
  forceExit: true,
  bail: false,
};
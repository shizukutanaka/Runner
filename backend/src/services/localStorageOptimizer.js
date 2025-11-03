const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');
const logger = require('../logger');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Local Storage Optimizer
 * Optimized for personal use with maximum data retention and performance
 */

class LocalStorageOptimizer {
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(process.cwd(), 'data');
    this.cacheDir = options.cacheDir || path.join(this.dataDir, 'cache');
    this.archiveDir = options.archiveDir || path.join(this.dataDir, 'archive');
    this.tempDir = options.tempDir || path.join(this.dataDir, 'temp');

    this.compressionEnabled = options.compressionEnabled !== false;
    this.encryptionEnabled = options.encryptionEnabled || false;
    this.encryptionKey = options.encryptionKey || process.env.ENCRYPTION_KEY;

    this.maxCacheSize = options.maxCacheSize || 500 * 1024 * 1024; // 500MB
    this.maxArchiveSize = options.maxArchiveSize || 5 * 1024 * 1024 * 1024; // 5GB

    this.cacheStats = {
      hits: 0,
      misses: 0,
      size: 0
    };
  }

  /**
   * Initialize storage directories
   */
  async initialize() {
    const dirs = [this.dataDir, this.cacheDir, this.archiveDir, this.tempDir];

    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
        logger.info('[LocalStorage] Directory created', { dir });
      } catch (error) {
        logger.error('[LocalStorage] Failed to create directory', {
          dir,
          error: error.message
        });
      }
    }

    // Calculate initial cache size
    await this.calculateCacheSize();

    logger.info('[LocalStorage] Initialized', {
      dataDir: this.dataDir,
      compression: this.compressionEnabled,
      encryption: this.encryptionEnabled
    });
  }

  /**
   * Store data with optimization
   */
  async store(key, data, options = {}) {
    const filePath = this.getFilePath(key, options.type);
    let content = typeof data === 'string' ? data : JSON.stringify(data);

    // Compress if enabled
    if (this.compressionEnabled) {
      content = await gzip(Buffer.from(content));
    }

    // Encrypt if enabled
    if (this.encryptionEnabled && this.encryptionKey) {
      content = this.encrypt(content);
    }

    // Write to file
    await fs.writeFile(filePath, content);

    // Update cache stats
    const stats = await fs.stat(filePath);
    this.cacheStats.size += stats.size;

    logger.debug('[LocalStorage] Data stored', {
      key,
      size: stats.size,
      compressed: this.compressionEnabled,
      encrypted: this.encryptionEnabled
    });

    // Check cache size limits
    await this.enforceCacheLimits();

    return filePath;
  }

  /**
   * Retrieve data
   */
  async retrieve(key, options = {}) {
    const filePath = this.getFilePath(key, options.type);

    try {
      let content = await fs.readFile(filePath);

      // Decrypt if needed
      if (this.encryptionEnabled && this.encryptionKey) {
        content = this.decrypt(content);
      }

      // Decompress if needed
      if (this.compressionEnabled) {
        content = await gunzip(content);
      }

      // Parse JSON if not raw
      const data = options.raw
        ? content.toString()
        : JSON.parse(content.toString());

      this.cacheStats.hits++;

      return data;
    } catch (error) {
      this.cacheStats.misses++;

      if (error.code === 'ENOENT') {
        return null;
      }

      throw error;
    }
  }

  /**
   * Delete data
   */
  async delete(key, options = {}) {
    const filePath = this.getFilePath(key, options.type);

    try {
      const stats = await fs.stat(filePath);
      await fs.unlink(filePath);

      this.cacheStats.size -= stats.size;

      logger.debug('[LocalStorage] Data deleted', { key, size: stats.size });
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Archive old data
   */
  async archiveData(key, data, metadata = {}) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveKey = `${timestamp}_${key}`;
    const archivePath = path.join(this.archiveDir, `${archiveKey}.archive`);

    const archiveData = {
      key,
      data,
      metadata,
      archivedAt: new Date().toISOString()
    };

    let content = JSON.stringify(archiveData);

    // Always compress archives
    content = await gzip(Buffer.from(content));

    // Encrypt if enabled
    if (this.encryptionEnabled && this.encryptionKey) {
      content = this.encrypt(content);
    }

    await fs.writeFile(archivePath, content);

    logger.info('[LocalStorage] Data archived', {
      key,
      archiveKey,
      path: archivePath
    });

    return archivePath;
  }

  /**
   * Restore from archive
   */
  async restoreFromArchive(archiveKey) {
    const archivePath = path.join(this.archiveDir, `${archiveKey}.archive`);

    let content = await fs.readFile(archivePath);

    // Decrypt if needed
    if (this.encryptionEnabled && this.encryptionKey) {
      content = this.decrypt(content);
    }

    // Decompress
    content = await gunzip(content);

    const archiveData = JSON.parse(content.toString());

    logger.info('[LocalStorage] Data restored from archive', {
      key: archiveData.key,
      archiveKey
    });

    return archiveData;
  }

  /**
   * Encrypt data
   */
  encrypt(data) {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const encrypted = Buffer.concat([
      cipher.update(data),
      cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, encrypted]);
  }

  /**
   * Decrypt data
   */
  decrypt(data) {
    const iv = data.slice(0, 16);
    const authTag = data.slice(16, 32);
    const encrypted = data.slice(32);

    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
  }

  /**
   * Get file path for key
   */
  getFilePath(key, type = 'cache') {
    const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    const hash = crypto.createHash('md5').update(key).digest('hex');
    const fileName = `${sanitizedKey}_${hash}`;

    const baseDir = type === 'archive' ? this.archiveDir : this.cacheDir;

    return path.join(baseDir, fileName);
  }

  /**
   * Calculate cache size
   */
  async calculateCacheSize() {
    let totalSize = 0;

    try {
      const files = await fs.readdir(this.cacheDir);

      for (const file of files) {
        const filePath = path.join(this.cacheDir, file);
        const stats = await fs.stat(filePath);
        totalSize += stats.size;
      }
    } catch (error) {
      logger.error('[LocalStorage] Failed to calculate cache size', {
        error: error.message
      });
    }

    this.cacheStats.size = totalSize;
    return totalSize;
  }

  /**
   * Enforce cache size limits
   */
  async enforceCacheLimits() {
    if (this.cacheStats.size <= this.maxCacheSize) {
      return;
    }

    logger.warn('[LocalStorage] Cache size limit exceeded', {
      current: this.cacheStats.size,
      max: this.maxCacheSize
    });

    // Get all cache files sorted by access time
    const files = await fs.readdir(this.cacheDir);
    const fileStats = [];

    for (const file of files) {
      const filePath = path.join(this.cacheDir, file);
      const stats = await fs.stat(filePath);

      fileStats.push({
        path: filePath,
        atime: stats.atime,
        size: stats.size
      });
    }

    // Sort by access time (oldest first)
    fileStats.sort((a, b) => a.atime - b.atime);

    // Remove files until under limit
    let removed = 0;
    let freedSpace = 0;

    for (const file of fileStats) {
      if (this.cacheStats.size - freedSpace <= this.maxCacheSize * 0.8) {
        break;
      }

      await fs.unlink(file.path);
      freedSpace += file.size;
      removed++;
    }

    this.cacheStats.size -= freedSpace;

    logger.info('[LocalStorage] Cache cleaned', {
      filesRemoved: removed,
      spaceFreed: freedSpace,
      newSize: this.cacheStats.size
    });
  }

  /**
   * Clean up old archives
   */
  async cleanOldArchives(maxAgeDays = 365) {
    const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const files = await fs.readdir(this.archiveDir);
    let removed = 0;
    let freedSpace = 0;

    for (const file of files) {
      const filePath = path.join(this.archiveDir, file);
      const stats = await fs.stat(filePath);
      const age = now - stats.mtime.getTime();

      if (age > maxAge) {
        await fs.unlink(filePath);
        freedSpace += stats.size;
        removed++;
      }
    }

    logger.info('[LocalStorage] Old archives cleaned', {
      filesRemoved: removed,
      spaceFreed: freedSpace
    });

    return { removed, freedSpace };
  }

  /**
   * Clean temp directory
   */
  async cleanTempDirectory() {
    const files = await fs.readdir(this.tempDir);
    let removed = 0;

    for (const file of files) {
      const filePath = path.join(this.tempDir, file);
      await fs.unlink(filePath);
      removed++;
    }

    logger.info('[LocalStorage] Temp directory cleaned', { filesRemoved: removed });
    return removed;
  }

  /**
   * Get storage statistics
   */
  async getStats() {
    const cacheFiles = await fs.readdir(this.cacheDir);
    const archiveFiles = await fs.readdir(this.archiveDir);

    let archiveSize = 0;
    for (const file of archiveFiles) {
      const stats = await fs.stat(path.join(this.archiveDir, file));
      archiveSize += stats.size;
    }

    return {
      cache: {
        files: cacheFiles.length,
        size: this.cacheStats.size,
        maxSize: this.maxCacheSize,
        hits: this.cacheStats.hits,
        misses: this.cacheStats.misses,
        hitRate: this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) * 100 || 0
      },
      archive: {
        files: archiveFiles.length,
        size: archiveSize,
        maxSize: this.maxArchiveSize
      },
      compression: this.compressionEnabled,
      encryption: this.encryptionEnabled
    };
  }

  /**
   * Optimize storage
   */
  async optimize() {
    logger.info('[LocalStorage] Starting optimization');

    // Clean old archives
    const archiveResult = await this.cleanOldArchives();

    // Clean temp files
    const tempCleaned = await this.cleanTempDirectory();

    // Enforce cache limits
    await this.enforceCacheLimits();

    // Recalculate cache size
    await this.calculateCacheSize();

    const stats = await this.getStats();

    logger.info('[LocalStorage] Optimization complete', {
      archivesRemoved: archiveResult.removed,
      tempFilesRemoved: tempCleaned,
      finalStats: stats
    });

    return stats;
  }
}

// Create singleton instance
const localStorageOptimizer = new LocalStorageOptimizer({
  compressionEnabled: process.env.COMPRESSION_ENABLED !== 'false',
  encryptionEnabled: process.env.ENCRYPTION_ENABLED === 'true',
  encryptionKey: process.env.ENCRYPTION_KEY
});

// Initialize on startup
localStorageOptimizer.initialize().catch(err => {
  logger.error('[LocalStorage] Initialization failed', { error: err.message });
});

// Run optimization daily
setInterval(() => {
  localStorageOptimizer.optimize().catch(err => {
    logger.error('[LocalStorage] Optimization failed', { error: err.message });
  });
}, 24 * 60 * 60 * 1000);

module.exports = {
  LocalStorageOptimizer,
  localStorageOptimizer
};

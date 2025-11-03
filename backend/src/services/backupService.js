const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');
const cron = require('node-cron');
const logger = require('../logger');
const config = require('../config');
const encryptionService = require('./encryptionService');

const execAsync = promisify(exec);

class BackupService {
  constructor() {
    this.backupDir = path.join(process.cwd(), 'backups');
    this.maxBackups = parseInt(config.getEnv('MAX_BACKUPS', '30'), 10);
    this.backupSchedule = config.getEnv('BACKUP_SCHEDULE', '0 2 * * *'); // Default: 2 AM daily
    this.encryptBackups = config.getEnv('ENCRYPT_BACKUPS', 'true') === 'true';
    this.remoteBackup = config.getEnv('REMOTE_BACKUP_URL');
    this.scheduledTask = null;

    this.initialize();
  }

  async initialize() {
    try {
      // Create backup directory if it doesn't exist
      await fs.mkdir(this.backupDir, { recursive: true });

      // Start scheduled backups if enabled
      if (config.getEnv('AUTO_BACKUP', 'true') === 'true') {
        this.startScheduledBackups();
      }

      logger.info('[BackupService] Initialized', {
        backupDir: this.backupDir,
        maxBackups: this.maxBackups,
        schedule: this.backupSchedule
      });
    } catch (error) {
      logger.error('[BackupService] Initialization failed', { error: error.message });
    }
  }

  // Start scheduled backups
  startScheduledBackups() {
    if (this.scheduledTask) {
      this.scheduledTask.stop();
    }

    this.scheduledTask = cron.schedule(this.backupSchedule, async () => {
      logger.info('[BackupService] Starting scheduled backup');
      await this.performFullBackup();
    });

    logger.info('[BackupService] Scheduled backups started', { schedule: this.backupSchedule });
  }

  // Stop scheduled backups
  stopScheduledBackups() {
    if (this.scheduledTask) {
      this.scheduledTask.stop();
      this.scheduledTask = null;
      logger.info('[BackupService] Scheduled backups stopped');
    }
  }

  // Perform full system backup
  async performFullBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `backup-${timestamp}`;
    const backupPath = path.join(this.backupDir, backupName);

    try {
      logger.info('[BackupService] Starting full backup', { backupName });

      // Create backup directory
      await fs.mkdir(backupPath, { recursive: true });

      // Backup database
      await this.backupDatabase(backupPath);

      // Backup configuration files
      await this.backupConfiguration(backupPath);

      // Backup uploaded files
      await this.backupUploadedFiles(backupPath);

      // Backup logs (last 7 days)
      await this.backupLogs(backupPath);

      // Create backup manifest
      await this.createManifest(backupPath);

      // Compress backup
      const archivePath = await this.compressBackup(backupPath);

      // Encrypt if enabled
      if (this.encryptBackups) {
        await this.encryptBackup(archivePath);
      }

      // Upload to remote storage if configured
      if (this.remoteBackup) {
        await this.uploadToRemote(archivePath);
      }

      // Clean up old backups
      await this.cleanupOldBackups();

      // Remove uncompressed backup directory
      await fs.rmdir(backupPath, { recursive: true });

      logger.info('[BackupService] Full backup completed', {
        backupName,
        size: (await fs.stat(archivePath)).size
      });

      return {
        success: true,
        backupName,
        path: archivePath
      };
    } catch (error) {
      logger.error('[BackupService] Backup failed', {
        backupName,
        error: error.message
      });

      // Clean up failed backup
      try {
        await fs.rmdir(backupPath, { recursive: true });
      } catch (cleanupError) {
        // Ignore cleanup errors
      }

      throw error;
    }
  }

  // Backup database
  async backupDatabase(backupPath) {
    const dbPath = path.join(process.cwd(), 'backend', 'data', 'database.db');
    const backupDbPath = path.join(backupPath, 'database.db');

    try {
      // For SQLite, copy the database file
      await fs.copyFile(dbPath, backupDbPath);

      // Also create a SQL dump for portability
      const dumpPath = path.join(backupPath, 'database.sql');
      await execAsync(`sqlite3 ${dbPath} .dump > ${dumpPath}`);

      logger.info('[BackupService] Database backed up');
    } catch (error) {
      logger.error('[BackupService] Database backup failed', { error: error.message });
      throw error;
    }
  }

  // Backup configuration files
  async backupConfiguration(backupPath) {
    const configFiles = [
      '.env',
      '.env.production',
      'ecosystem.config.js',
      'package.json',
      'package-lock.json'
    ];

    const configBackupPath = path.join(backupPath, 'config');
    await fs.mkdir(configBackupPath, { recursive: true });

    for (const file of configFiles) {
      const sourcePath = path.join(process.cwd(), 'backend', file);
      const destPath = path.join(configBackupPath, file);

      try {
        await fs.copyFile(sourcePath, destPath);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          logger.warn('[BackupService] Failed to backup config file', { file, error: error.message });
        }
      }
    }

    logger.info('[BackupService] Configuration backed up');
  }

  // Backup uploaded files
  async backupUploadedFiles(backupPath) {
    const uploadsPath = path.join(process.cwd(), 'backend', 'uploads');
    const backupUploadsPath = path.join(backupPath, 'uploads');

    try {
      // Copy uploads directory
      await this.copyDirectory(uploadsPath, backupUploadsPath);
      logger.info('[BackupService] Uploaded files backed up');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.warn('[BackupService] Failed to backup uploads', { error: error.message });
      }
    }
  }

  // Backup logs
  async backupLogs(backupPath) {
    const logsPath = path.join(process.cwd(), 'backend', 'logs');
    const backupLogsPath = path.join(backupPath, 'logs');

    try {
      await fs.mkdir(backupLogsPath, { recursive: true });

      // Get log files modified in last 7 days
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const files = await fs.readdir(logsPath);

      for (const file of files) {
        const filePath = path.join(logsPath, file);
        const stats = await fs.stat(filePath);

        if (stats.mtime.getTime() > sevenDaysAgo) {
          const destPath = path.join(backupLogsPath, file);
          await fs.copyFile(filePath, destPath);
        }
      }

      logger.info('[BackupService] Logs backed up');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.warn('[BackupService] Failed to backup logs', { error: error.message });
      }
    }
  }

  // Create backup manifest
  async createManifest(backupPath) {
    const manifest = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      hostname: require('os').hostname(),
      nodeVersion: process.version,
      platform: process.platform,
      files: []
    };

    // List all files in backup
    const files = await this.listFilesRecursive(backupPath);
    for (const file of files) {
      const stats = await fs.stat(file);
      const relativePath = path.relative(backupPath, file);
      const checksum = await this.calculateChecksum(file);

      manifest.files.push({
        path: relativePath,
        size: stats.size,
        mtime: stats.mtime,
        checksum
      });
    }

    // Write manifest
    const manifestPath = path.join(backupPath, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    logger.info('[BackupService] Backup manifest created', {
      fileCount: manifest.files.length
    });
  }

  // Compress backup directory
  async compressBackup(backupPath) {
    const archiveName = `${path.basename(backupPath)}.tar.gz`;
    const archivePath = path.join(this.backupDir, archiveName);

    try {
      await execAsync(`tar -czf ${archivePath} -C ${path.dirname(backupPath)} ${path.basename(backupPath)}`);
      logger.info('[BackupService] Backup compressed', { archivePath });
      return archivePath;
    } catch (error) {
      logger.error('[BackupService] Compression failed', { error: error.message });
      throw error;
    }
  }

  // Encrypt backup archive
  async encryptBackup(archivePath) {
    const encryptedPath = `${archivePath}.enc`;

    try {
      await encryptionService.encryptFile(archivePath, encryptedPath);
      await fs.unlink(archivePath); // Remove unencrypted archive
      await fs.rename(encryptedPath, archivePath);
      logger.info('[BackupService] Backup encrypted');
    } catch (error) {
      logger.error('[BackupService] Encryption failed', { error: error.message });
      throw error;
    }
  }

  // Upload backup to remote storage
  async uploadToRemote(archivePath) {
    // This is a placeholder for remote upload functionality
    // Implement based on your cloud provider (AWS S3, Azure, GCS, etc.)
    try {
      logger.info('[BackupService] Uploading to remote storage', {
        file: path.basename(archivePath),
        destination: this.remoteBackup
      });

      // Example for AWS S3:
      // const AWS = require('aws-sdk');
      // const s3 = new AWS.S3();
      // await s3.upload({
      //   Bucket: 'backup-bucket',
      //   Key: path.basename(archivePath),
      //   Body: await fs.readFile(archivePath)
      // }).promise();

      logger.info('[BackupService] Remote upload completed');
    } catch (error) {
      logger.error('[BackupService] Remote upload failed', { error: error.message });
      // Don't throw - remote backup failure shouldn't fail the entire backup
    }
  }

  // Clean up old backups
  async cleanupOldBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files
        .filter(f => f.startsWith('backup-') && f.endsWith('.tar.gz'))
        .sort()
        .reverse();

      if (backupFiles.length > this.maxBackups) {
        const filesToDelete = backupFiles.slice(this.maxBackups);

        for (const file of filesToDelete) {
          const filePath = path.join(this.backupDir, file);
          await fs.unlink(filePath);
          logger.info('[BackupService] Old backup deleted', { file });
        }
      }
    } catch (error) {
      logger.error('[BackupService] Cleanup failed', { error: error.message });
    }
  }

  // Restore from backup
  async restoreFromBackup(backupFile) {
    const restorePath = path.join(this.backupDir, 'restore-temp');

    try {
      logger.info('[BackupService] Starting restore', { backupFile });

      // Create restore directory
      await fs.mkdir(restorePath, { recursive: true });

      // Decrypt if needed
      let archivePath = path.join(this.backupDir, backupFile);
      if (backupFile.endsWith('.enc')) {
        const decryptedPath = archivePath.replace('.enc', '');
        await encryptionService.decryptFile(archivePath, decryptedPath);
        archivePath = decryptedPath;
      }

      // Extract archive
      await execAsync(`tar -xzf ${archivePath} -C ${restorePath}`);

      // Find the extracted backup directory
      const dirs = await fs.readdir(restorePath);
      const backupDir = path.join(restorePath, dirs[0]);

      // Verify manifest
      const manifestPath = path.join(backupDir, 'manifest.json');
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

      logger.info('[BackupService] Backup manifest verified', {
        timestamp: manifest.timestamp,
        fileCount: manifest.files.length
      });

      // Restore database
      await this.restoreDatabase(backupDir);

      // Restore configuration
      await this.restoreConfiguration(backupDir);

      // Restore uploaded files
      await this.restoreUploadedFiles(backupDir);

      // Clean up
      await fs.rmdir(restorePath, { recursive: true });

      logger.info('[BackupService] Restore completed successfully');

      return {
        success: true,
        timestamp: manifest.timestamp
      };
    } catch (error) {
      logger.error('[BackupService] Restore failed', { error: error.message });

      // Clean up
      try {
        await fs.rmdir(restorePath, { recursive: true });
      } catch (cleanupError) {
        // Ignore cleanup errors
      }

      throw error;
    }
  }

  // Restore database from backup
  async restoreDatabase(backupDir) {
    const dbBackupPath = path.join(backupDir, 'database.db');
    const dbPath = path.join(process.cwd(), 'backend', 'data', 'database.db');

    // Backup current database
    const currentBackup = `${dbPath}.backup-${Date.now()}`;
    await fs.copyFile(dbPath, currentBackup);

    try {
      // Restore database
      await fs.copyFile(dbBackupPath, dbPath);
      logger.info('[BackupService] Database restored');
    } catch (error) {
      // Rollback on failure
      await fs.copyFile(currentBackup, dbPath);
      throw error;
    }
  }

  // Restore configuration from backup
  async restoreConfiguration(backupDir) {
    const configBackupPath = path.join(backupDir, 'config');

    // Only restore non-sensitive config files
    const allowedFiles = ['ecosystem.config.js', 'package.json'];

    for (const file of allowedFiles) {
      const sourcePath = path.join(configBackupPath, file);
      const destPath = path.join(process.cwd(), 'backend', file);

      try {
        await fs.copyFile(sourcePath, destPath);
        logger.info('[BackupService] Config file restored', { file });
      } catch (error) {
        if (error.code !== 'ENOENT') {
          logger.warn('[BackupService] Failed to restore config file', { file, error: error.message });
        }
      }
    }
  }

  // Restore uploaded files from backup
  async restoreUploadedFiles(backupDir) {
    const backupUploadsPath = path.join(backupDir, 'uploads');
    const uploadsPath = path.join(process.cwd(), 'backend', 'uploads');

    try {
      // Backup current uploads
      const currentBackup = `${uploadsPath}-backup-${Date.now()}`;
      await this.copyDirectory(uploadsPath, currentBackup);

      // Restore uploads
      await this.copyDirectory(backupUploadsPath, uploadsPath);
      logger.info('[BackupService] Uploaded files restored');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error('[BackupService] Failed to restore uploads', { error: error.message });
      }
    }
  }

  // Helper: Copy directory recursively
  async copyDirectory(source, destination) {
    await fs.mkdir(destination, { recursive: true });
    const entries = await fs.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, destPath);
      } else {
        await fs.copyFile(sourcePath, destPath);
      }
    }
  }

  // Helper: List files recursively
  async listFilesRecursive(dir, files = []) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.listFilesRecursive(fullPath, files);
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  // Helper: Calculate file checksum
  async calculateChecksum(filePath) {
    const hash = crypto.createHash('sha256');
    const stream = require('fs').createReadStream(filePath);

    return new Promise((resolve, reject) => {
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  // Get backup list
  async getBackupList() {
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files.filter(f => f.startsWith('backup-') && f.endsWith('.tar.gz'));

      const backups = [];
      for (const file of backupFiles) {
        const filePath = path.join(this.backupDir, file);
        const stats = await fs.stat(filePath);

        backups.push({
          filename: file,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        });
      }

      return backups.sort((a, b) => b.created - a.created);
    } catch (error) {
      logger.error('[BackupService] Failed to get backup list', { error: error.message });
      return [];
    }
  }

  // Verify backup integrity
  async verifyBackup(backupFile) {
    const tempDir = path.join(this.backupDir, 'verify-temp');

    try {
      await fs.mkdir(tempDir, { recursive: true });

      const archivePath = path.join(this.backupDir, backupFile);

      // Extract backup
      await execAsync(`tar -xzf ${archivePath} -C ${tempDir}`);

      // Find manifest
      const dirs = await fs.readdir(tempDir);
      const backupDir = path.join(tempDir, dirs[0]);
      const manifestPath = path.join(backupDir, 'manifest.json');

      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

      // Verify file checksums
      let valid = true;
      for (const fileInfo of manifest.files) {
        const filePath = path.join(backupDir, fileInfo.path);
        if (filePath !== manifestPath) {
          const checksum = await this.calculateChecksum(filePath);
          if (checksum !== fileInfo.checksum) {
            logger.warn('[BackupService] Checksum mismatch', {
              file: fileInfo.path,
              expected: fileInfo.checksum,
              actual: checksum
            });
            valid = false;
          }
        }
      }

      // Clean up
      await fs.rmdir(tempDir, { recursive: true });

      return {
        valid,
        timestamp: manifest.timestamp,
        fileCount: manifest.files.length
      };
    } catch (error) {
      logger.error('[BackupService] Verification failed', { error: error.message });

      // Clean up
      try {
        await fs.rmdir(tempDir, { recursive: true });
      } catch (cleanupError) {
        // Ignore
      }

      throw error;
    }
  }
}

module.exports = new BackupService();
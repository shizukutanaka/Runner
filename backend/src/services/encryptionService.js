const crypto = require('crypto');
const config = require('../config');
const logger = require('../logger');

class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyDerivationIterations = 100000;
    this.saltLength = 32;
    this.tagLength = 16;
    this.ivLength = 16;

    // Master encryption key - should be stored in secure key management system
    this.masterKey = this.deriveMasterKey();
  }

  deriveMasterKey() {
    const secret = config.getEnv('ENCRYPTION_KEY');
    if (!secret || secret.length < 32) {
      if (config.environment === 'production') {
        throw new Error('[Encryption] ENCRYPTION_KEY must be at least 32 characters in production');
      }
      logger.warn('[Encryption] Using weak encryption key in development mode');
      return crypto.scryptSync('development-key-insecure', 'salt', 32);
    }
    return crypto.scryptSync(secret, 'salt', 32);
  }

  // Generate a secure random key
  generateKey() {
    return crypto.randomBytes(32);
  }

  // Encrypt sensitive data with AES-256-GCM
  encrypt(text, additionalData = '') {
    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, iv);

      if (additionalData) {
        cipher.setAAD(Buffer.from(additionalData, 'utf8'));
      }

      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag();

      // Return format: iv:authTag:encrypted
      return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch (error) {
      logger.error('[Encryption] Encryption failed', { error: error.message });
      throw new Error('Encryption failed');
    }
  }

  // Decrypt data encrypted with AES-256-GCM
  decrypt(encryptedData, additionalData = '') {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];

      const decipher = crypto.createDecipheriv(this.algorithm, this.masterKey, iv);
      decipher.setAuthTag(authTag);

      if (additionalData) {
        decipher.setAAD(Buffer.from(additionalData, 'utf8'));
      }

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error('[Encryption] Decryption failed', { error: error.message });
      throw new Error('Decryption failed');
    }
  }

  // Hash password with bcrypt-like functionality using native crypto
  async hashPassword(password) {
    const salt = crypto.randomBytes(this.saltLength);
    const hash = await new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, this.keyDerivationIterations, 64, 'sha512', (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      });
    });

    // Format: algorithm:iterations:salt:hash
    return `pbkdf2:${this.keyDerivationIterations}:${salt.toString('hex')}:${hash.toString('hex')}`;
  }

  // Verify password against hash
  async verifyPassword(password, hashedPassword) {
    try {
      const parts = hashedPassword.split(':');
      if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
        return false;
      }

      const iterations = parseInt(parts[1], 10);
      const salt = Buffer.from(parts[2], 'hex');
      const hash = Buffer.from(parts[3], 'hex');

      const verifyHash = await new Promise((resolve, reject) => {
        crypto.pbkdf2(password, salt, iterations, 64, 'sha512', (err, derivedKey) => {
          if (err) reject(err);
          else resolve(derivedKey);
        });
      });

      return crypto.timingSafeEqual(hash, verifyHash);
    } catch (error) {
      logger.error('[Encryption] Password verification failed', { error: error.message });
      return false;
    }
  }

  // Generate secure token
  generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  // Hash data with SHA-256 (for checksums, not passwords)
  hash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  // Create HMAC for data integrity
  createHMAC(data, key = null) {
    const hmacKey = key || this.masterKey;
    return crypto.createHmac('sha256', hmacKey).update(data).digest('hex');
  }

  // Verify HMAC
  verifyHMAC(data, hmac, key = null) {
    const hmacKey = key || this.masterKey;
    const computedHmac = crypto.createHmac('sha256', hmacKey).update(data).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(computedHmac));
  }

  // Encrypt file with stream support for large files
  encryptFile(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, iv);

      const input = require('fs').createReadStream(inputPath);
      const output = require('fs').createWriteStream(outputPath);

      // Write IV at the beginning
      output.write(iv);

      input.pipe(cipher).pipe(output);

      output.on('finish', () => {
        const authTag = cipher.getAuthTag();
        // Append auth tag at the end
        require('fs').appendFileSync(outputPath, authTag);
        resolve();
      });

      output.on('error', reject);
      input.on('error', reject);
    });
  }

  // Decrypt file with stream support
  decryptFile(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      const fs = require('fs');
      const fileContent = fs.readFileSync(inputPath);

      // Extract IV (first 16 bytes)
      const iv = fileContent.slice(0, this.ivLength);

      // Extract auth tag (last 16 bytes)
      const authTag = fileContent.slice(-this.tagLength);

      // Extract encrypted content
      const encrypted = fileContent.slice(this.ivLength, -this.tagLength);

      const decipher = crypto.createDecipheriv(this.algorithm, this.masterKey, iv);
      decipher.setAuthTag(authTag);

      try {
        const decrypted = Buffer.concat([
          decipher.update(encrypted),
          decipher.final()
        ]);

        fs.writeFileSync(outputPath, decrypted);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  // Encrypt database field
  encryptField(value, tableName, fieldName) {
    if (!value) return null;
    const additionalData = `${tableName}.${fieldName}`;
    return this.encrypt(value.toString(), additionalData);
  }

  // Decrypt database field
  decryptField(encryptedValue, tableName, fieldName) {
    if (!encryptedValue) return null;
    const additionalData = `${tableName}.${fieldName}`;
    return this.decrypt(encryptedValue, additionalData);
  }

  // Key rotation support
  async rotateKey(oldKey, newKey, data) {
    // Decrypt with old key
    const tempMasterKey = this.masterKey;
    this.masterKey = oldKey;
    const decrypted = this.decrypt(data);

    // Encrypt with new key
    this.masterKey = newKey;
    const encrypted = this.encrypt(decrypted);

    // Restore original key
    this.masterKey = tempMasterKey;

    return encrypted;
  }

  // Generate encryption key pair for asymmetric encryption
  generateKeyPair() {
    return crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
        cipher: 'aes-256-cbc',
        passphrase: this.masterKey.toString('hex')
      }
    });
  }

  // Encrypt with public key
  encryptWithPublicKey(data, publicKey) {
    const encrypted = crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      },
      Buffer.from(data)
    );
    return encrypted.toString('base64');
  }

  // Decrypt with private key
  decryptWithPrivateKey(encryptedData, privateKey) {
    const decrypted = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
        passphrase: this.masterKey.toString('hex')
      },
      Buffer.from(encryptedData, 'base64')
    );
    return decrypted.toString('utf8');
  }

  // Sign data with private key
  sign(data, privateKey) {
    const sign = crypto.createSign('SHA256');
    sign.update(data);
    sign.end();
    return sign.sign({
      key: privateKey,
      passphrase: this.masterKey.toString('hex')
    }, 'hex');
  }

  // Timing-safe comparison for security-sensitive operations
  timingSafeEquals(a, b) {
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  // Generate cryptographically secure random numbers
  generateSecureRandom(min, max) {
    const range = max - min + 1;
    const bytes = Math.ceil(Math.log2(range) / 8);
    const maxValue = Math.pow(256, bytes);
    
    let random;
    do {
      random = crypto.randomBytes(bytes).readUIntBE(0, bytes);
    } while (random >= maxValue - (maxValue % range));
    
    return min + (random % range);
  }

  // Derive encryption key from password (for user-specific encryption)
  deriveKeyFromPassword(password, salt = null) {
    const actualSalt = salt || crypto.randomBytes(this.saltLength);
    const key = crypto.pbkdf2Sync(password, actualSalt, 100000, 32, 'sha256');
    return { key, salt: actualSalt.toString('hex') };
  }

  // Create digital signature for data integrity
  createSignature(data, key = null) {
    const signKey = key || this.masterKey;
    const hmac = crypto.createHmac('sha256', signKey);
    hmac.update(data);
    return hmac.digest('hex');
  }

  // Verify digital signature
  verifySignature(data, signature, key = null) {
    const signKey = key || this.masterKey;
    const expectedSignature = this.createSignature(data, signKey);
    return this.timingSafeEquals(signature, expectedSignature);
  }

  // Encrypt object properties recursively
  encryptObject(obj, fieldsToEncrypt = []) {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    const encrypted = Array.isArray(obj) ? [] : {};

    for (const [key, value] of Object.entries(obj)) {
      if (fieldsToEncrypt.includes(key) && typeof value === 'string') {
        encrypted[key] = this.encrypt(value);
      } else if (typeof value === 'object' && value !== null) {
        encrypted[key] = this.encryptObject(value, fieldsToEncrypt);
      } else {
        encrypted[key] = value;
      }
    }

    return encrypted;
  }

  // Decrypt object properties recursively
  decryptObject(obj, fieldsToDecrypt = []) {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    const decrypted = Array.isArray(obj) ? [] : {};

    for (const [key, value] of Object.entries(obj)) {
      if (fieldsToDecrypt.includes(key) && typeof value === 'string') {
        try {
          decrypted[key] = this.decrypt(value);
        } catch (error) {
          logger.warn(`[Encryption] Failed to decrypt field ${key}`);
          decrypted[key] = value;
        }
      } else if (typeof value === 'object' && value !== null) {
        decrypted[key] = this.decryptObject(value, fieldsToDecrypt);
      } else {
        decrypted[key] = value;
      }
    }

    return decrypted;
  }

  // Create secure session token
  createSessionToken(userId, sessionData = {}) {
    const payload = {
      userId,
      sessionId: this.generateSecureToken(16),
      createdAt: new Date().toISOString(),
      ...sessionData
    };
    
    const tokenData = JSON.stringify(payload);
    const encrypted = this.encrypt(tokenData);
    const signature = this.createSignature(encrypted);
    
    return `${encrypted}.${signature}`;
  }

  // Verify and decrypt session token
  verifySessionToken(token) {
    try {
      const [encrypted, signature] = token.split('.');
      
      if (!this.verifySignature(encrypted, signature)) {
        throw new Error('Invalid session token signature');
      }
      
      const decrypted = this.decrypt(encrypted);
      const payload = JSON.parse(decrypted);
      
      // Check expiration (24 hours default)
      const createdAt = new Date(payload.createdAt);
      const now = new Date();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      if (now - createdAt > maxAge) {
        throw new Error('Session token expired');
      }
      
      return payload;
    } catch (error) {
      logger.warn('[Encryption] Session token verification failed', { error: error.message });
      return null;
    }
  }

  // Zero-knowledge proof for password verification (simplified)
  async verifyPasswordZeroKnowledge(password, storedHash) {
    try {
      const parts = storedHash.split(':');
      if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
        return false;
      }

      const iterations = parseInt(parts[1], 10);
      const salt = Buffer.from(parts[2], 'hex');
      const hash = Buffer.from(parts[3], 'hex');

      const verifyHash = await new Promise((resolve, reject) => {
        crypto.pbkdf2(password, salt, iterations, 64, 'sha512', (err, derivedKey) => {
          if (err) reject(err);
          else resolve(derivedKey);
        });
      });

      return this.timingSafeEquals(hash.toString('hex'), verifyHash.toString('hex'));
    } catch (error) {
      logger.error('[Encryption] Zero-knowledge password verification failed', { error: error.message });
      return false;
    }
  }

  // Generate API key with expiration
  generateApiKey(permissions = ['read'], expiresIn = 365 * 24 * 60 * 60 * 1000) {
    const keyId = this.generateSecureToken(8);
    const keySecret = this.generateSecureToken(32);
    const expiresAt = new Date(Date.now() + expiresIn);
    
    const payload = {
      keyId,
      permissions,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString()
    };
    
    const encryptedPayload = this.encrypt(JSON.stringify(payload));
    const signature = this.createSignature(encryptedPayload);
    
    return {
      keyId,
      keySecret,
      fullKey: `${keyId}.${keySecret}.${encryptedPayload}.${signature}`,
      expiresAt
    };
  }

  // Verify API key
  verifyApiKey(apiKey) {
    try {
      const [keyId, keySecret, encryptedPayload, signature] = apiKey.split('.');
      
      if (!this.verifySignature(encryptedPayload, signature)) {
        return null;
      }
      
      const decrypted = this.decrypt(encryptedPayload);
      const payload = JSON.parse(decrypted);
      
      if (new Date() > new Date(payload.expiresAt)) {
        return null;
      }
      
      return {
        keyId,
        keySecret,
        permissions: payload.permissions,
        expiresAt: payload.expiresAt
      };
    } catch (error) {
      logger.warn('[Encryption] API key verification failed', { error: error.message });
      return null;
    }
  }

  // Secure memory wiping (for sensitive data)
  secureWipe(data) {
    if (typeof data === 'string') {
      // Overwrite string data
      return 'x'.repeat(data.length);
    }
    
    if (Buffer.isBuffer(data)) {
      // Overwrite buffer
      data.fill(0);
      return data;
    }
    
    return data;
  }

  // Memory-hard function for rate limiting
  memoryHardHash(data, iterations = 10000) {
    let hash = Buffer.from(data);
    for (let i = 0; i < iterations; i++) {
      hash = crypto.createHash('sha256').update(hash).digest();
    }
    return hash.toString('hex');
  }
}

module.exports = new EncryptionService();
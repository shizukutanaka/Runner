process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test'.repeat(16);

const encryptionService = require('../../src/services/advancedEncryptionService');

const splitEncrypted = (payload) => payload.split(':');

describe('AdvancedEncryptionService', () => {
  describe('encrypt / decrypt', () => {
    it('encrypts and decrypts payloads with associated data', () => {
      const plaintext = 'Confidential payload for round trip test';
      const associatedData = 'context:v1';

      const encrypted = encryptionService.encrypt(plaintext, associatedData);
      expect(typeof encrypted).toBe('string');

      const decrypted = encryptionService.decrypt(encrypted, associatedData);
      expect(decrypted).toBe(plaintext);
    });

    it('rejects tampered ciphertext', () => {
      const payload = encryptionService.encrypt('should fail', 'ctx');
      const parts = splitEncrypted(payload);
      parts[2] = parts[2].replace(/^../, (match) => (match === 'ff' ? '00' : 'ff'));
      const tampered = parts.join(':');

      expect(() => encryptionService.decrypt(tampered, 'ctx')).toThrow();
    });

    it('rejects mismatched associated data', () => {
      const payload = encryptionService.encrypt('aad failure', 'ctx:original');
      expect(() => encryptionService.decrypt(payload, 'ctx:modified')).toThrow();
    });
  });

  describe('generateSessionKey', () => {
    it('returns base64-encoded key and IV with metadata', () => {
      const sessionKey = encryptionService.generateSessionKey();

      expect(sessionKey).toEqual({
        key: expect.any(String),
        iv: expect.any(String),
        algorithm: 'AES-256-GCM',
        createdAt: expect.any(String),
        expiresAt: expect.any(String)
      });

      const keyBuffer = Buffer.from(sessionKey.key, 'base64');
      const ivBuffer = Buffer.from(sessionKey.iv, 'base64');
      expect(keyBuffer).toHaveLength(32);
      expect(ivBuffer).toHaveLength(16);
    });
  });

  describe('getEncryptionStats', () => {
    it('exposes algorithm metadata without secrets', () => {
      const stats = encryptionService.getEncryptionStats();

      expect(stats).toMatchObject({
        algorithm: 'aes-256-gcm',
        masterKeyStrength: 'initialized'
      });
      expect(stats.keyDerivationIterations).toBeGreaterThan(0);
      expect(stats.supportedAlgorithms.symmetric).toContain('aes-256-gcm');
      expect(stats.supportedAlgorithms.hash).toContain('sha-256');
    });
  });
});

// このテストはもともと存在しない `advancedEncryptionService` を対象にしていた
// （実在するのは `encryptionService.js`）。encrypt/decryptはメソッドシグネチャ・
// 出力形式（iv:authTag:encrypted）とも実サービスと一致するため、そちらに向けて
// 修正した。generateSessionKey/getEncryptionStatsは実サービスに存在しない
// メソッドだったため、該当テストは削除した。
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test'.repeat(16);

const encryptionService = require('../../src/services/encryptionService');

const splitEncrypted = (payload) => payload.split(':');

describe('EncryptionService', () => {
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
});

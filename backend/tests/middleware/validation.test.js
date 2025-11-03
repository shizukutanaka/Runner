const { ValidationError, commentSchemas, validate } = require('../../src/utils/validation');

describe('Validation Middleware', () => {
  describe('ValidationError', () => {
    it('should create validation error with correct properties', () => {
      const details = [{ message: 'Test error', path: 'field' }];
      const error = new ValidationError('Validation failed', details);

      expect(error.name).toBe('ValidationError');
      expect(error.status).toBe(400);
      expect(error.message).toBe('Validation failed');
      expect(error.details).toEqual(details);
    });
  });

  describe('Comment Schema Validation', () => {
    it('should validate valid comment creation data', () => {
      const validData = {
        platform: 'youtube',
        user: 'user123',
        content: 'This is a test comment',
        timestamp: new Date().toISOString()
      };

      const { error, value } = commentSchemas.create.validate(validData);
      expect(error).toBeUndefined();
      expect(value).toMatchObject(validData);
    });

    it('should reject invalid platform', () => {
      const invalidData = {
        platform: 'invalid',
        user: 'user123',
        content: 'Test comment'
      };

      const { error } = commentSchemas.create.validate(invalidData);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('platform');
    });

    it('should reject empty content', () => {
      const invalidData = {
        platform: 'youtube',
        user: 'user123',
        content: ''
      };

      const { error } = commentSchemas.create.validate(invalidData);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('content');
    });

    it('should reject content that is too long', () => {
      const invalidData = {
        platform: 'youtube',
        user: 'user123',
        content: 'a'.repeat(2001)
      };

      const { error } = commentSchemas.create.validate(invalidData);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('content');
    });
  });

  describe('Validation Middleware Function', () => {
    it('should pass valid data through middleware', (done) => {
      const validData = {
        platform: 'youtube',
        user: 'user123',
        content: 'Test comment'
      };

      const req = { body: validData };
      const res = {};
      const next = (error) => {
        expect(error).toBeUndefined();
        expect(req.body).toMatchObject(validData);
        done();
      };

      const middleware = validate(commentSchemas.create);
      middleware(req, res, next);
    });

    it('should call next with ValidationError for invalid data', (done) => {
      const invalidData = {
        platform: 'invalid',
        user: 'user123',
        content: ''
      };

      const req = { body: invalidData, originalUrl: '/test' };
      const res = {};
      const next = (error) => {
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.details).toBeDefined();
        expect(error.details.length).toBeGreaterThan(0);
        done();
      };

      const middleware = validate(commentSchemas.create);
      middleware(req, res, next);
    });
  });
});
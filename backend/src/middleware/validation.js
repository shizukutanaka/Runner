const logger = require('../logger');

const parseSchemaInput = (schema) => {
  // Joiスキーマ自体が渡された場合（typeofは'object'だが.validate()を持つ）はbody用として扱う
  if (schema && typeof schema.validate === 'function') {
    return { body: schema };
  }

  if (typeof schema === 'object' && schema !== null) {
    const normalized = {};
    if (schema.body && typeof schema.body.validate === 'function') {
      normalized.body = schema.body;
    }
    if (schema.query && typeof schema.query.validate === 'function') {
      normalized.query = schema.query;
    }
    if (schema.params && typeof schema.params.validate === 'function') {
      normalized.params = schema.params;
    }
    return normalized;
  }

  return {};
};

function validate(schema) {
  const targets = parseSchemaInput(schema);

  return (req, res, next) => {
    const validationErrors = [];

    if (targets.params) {
      const { value, error } = targets.params.validate(req.params, { abortEarly: false, stripUnknown: true });
      if (error) validationErrors.push({ location: 'params', details: error.details });
      else req.params = value;
    }

    if (targets.query) {
      const { value, error } = targets.query.validate(req.query, { abortEarly: false, stripUnknown: true });
      if (error) validationErrors.push({ location: 'query', details: error.details });
      else req.query = value;
    }

    if (targets.body) {
      const { value, error } = targets.body.validate(req.body, { abortEarly: false, stripUnknown: true });
      if (error) validationErrors.push({ location: 'body', details: error.details });
      else req.body = value;
    }

    if (validationErrors.length > 0) {
      logger.warn('[ValidationError] Payload failed schema validation', { errors: validationErrors });
      return res.status(400).json({
        status: 400,
        message: 'Validation error',
        details: validationErrors
      });
    }

    next();
  };
}

module.exports = validate;

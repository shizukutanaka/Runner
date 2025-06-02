function validate(schema) {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      console.error('[ValidationError]', error.details);
      return res.status(400).json({
        status: 400,
        message: 'Validation error',
        details: error.details
      });
    }
    next();
  };
}

module.exports = validate;

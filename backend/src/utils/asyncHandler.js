/**
 * Async Handler Utility
 *
 * Eliminates try-catch boilerplate in Express async route handlers.
 * Simply wrap your async functions with asyncHandler() to automatically
 * catch errors and pass them to Express error middleware.
 *
 * Usage:
 * ```javascript
 * const asyncHandler = require('./utils/asyncHandler');
 *
 * router.get('/users', asyncHandler(async (req, res) => {
 *   const users = await User.findAll();
 *   res.json(users);
 * }));
 * ```
 *
 * Benefits:
 * - Reduces code by 20-30%
 * - Eliminates repetitive try-catch blocks
 * - Ensures consistent error handling
 * - Improves code readability
 *
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Express middleware function
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;

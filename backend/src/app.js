const express = require('express');
const cors = require('cors');
const commentsRouter = require('./routes/comments');
const usersRouter = require('./routes/users');
const moderationRouter = require('./routes/moderation');
const notificationsRouter = require('./routes/notifications');
const analyticsRouter = require('./routes/analytics');
const settingsRouter = require('./routes/settings');
const uiRouter = require('./routes/ui');
const errorHandler = require('./middleware/errorHandler');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/comments', commentsRouter);
app.use('/api/users', usersRouter);
app.use('/api/moderation', moderationRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/ui', uiRouter);

app.use(errorHandler);

module.exports = app;

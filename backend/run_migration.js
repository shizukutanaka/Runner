const path = require('path');
const fs = require('fs');
const { runMigration } = require('./src/db');

async function runSpecificMigration() {
  try {
    console.log('Running notification events migration...');
    await runMigration('20250126000000_add_notification_events_channels.js');
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runSpecificMigration();

const mongoose = require('mongoose');

const AdminLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ['approve', 'reject', 'ban', 'unban', 'login'],
      required: true,
    },
    targetUserId: {
      type: String,
      default: null, // telegramId of affected user
    },
    targetUsername: {
      type: String,
      default: null,
    },
    performedBy: {
      type: String,
      default: 'admin',
    },
    note: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AdminLog', AdminLogSchema);

const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    telegramId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    username: {
      type: String,
      default: null,
    },
    firstName: {
      type: String,
      default: '',
    },
    lastName: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['new', 'pending', 'approved', 'rejected', 'banned', 'awaiting_manual_proof'],
      default: 'new',
      index: true,
    },
    paymentMethod: {
      // Which flow the user chose: 'stripe' | 'manual' | null
      type: String,
      enum: ['stripe', 'manual', null],
      default: null,
    },
    paymentProof: {
      // Telegram file_id of the uploaded receipt photo (manual flow only)
      type: String,
      default: null,
    },
    stripeSessionId: {
      // Stripe Checkout session ID — used to verify payment server-side
      type: String,
      default: null,
    },
    inviteLink: {
      type: String,
      default: null,
    },
    requestedAt: {
      type: Date,
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

UserSchema.virtual('displayName').get(function () {
  const full = [this.firstName, this.lastName].filter(Boolean).join(' ');
  return full || this.username || `User ${this.telegramId}`;
});

UserSchema.set('toObject', { virtuals: true });
UserSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('User', UserSchema);

const mongoose = require('mongoose');

const donorSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: String,
  organization: String,
  donationType: {
    type: String,
    enum: ['Individual', 'Organization', 'Corporate'],
    default: 'Individual'
  },
  donations: [{
    amount: Number,
    date: Date,
    scholarship: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Scholarship'
    },
    transactionId: String,
    paymentMethod: String
  }],
  totalDonated: { type: Number, default: 0 },
  impactReports: [{
    date: Date,
    studentsSupported: Number,
    totalImpact: Number,
    report: String
  }],
  notifications: [{
    title: String,
    message: String,
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Donor', donorSchema);
const mongoose = require('mongoose');

const donationSchema = new mongoose.Schema({
  donor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Donor ID is required']
  },
  donorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Donor ID is required']
  },
  scholarship: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Scholarship',
    required: false // Optional for general fund donations
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [1, 'Amount must be at least 1']
  },
  currency: {
    type: String,
    default: 'USD',
    uppercase: true
  },
  paymentMethod: {
    type: String,
    enum: ['Credit Card', 'Debit Card', 'UPI', 'Net Banking', 'Other'],
    required: [true, 'Payment method is required']
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'],
    default: 'completed' // Default to completed for immediate donations
  },
  transactionId: {
    type: String,
    trim: true,
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  receiptUrl: {
    type: String,
    trim: true
  },
  isAnonymous: {
    type: Boolean,
    default: false
  },
  message: {
    type: String,
    trim: true,
    maxlength: [500, 'Message cannot be longer than 500 characters']
  },
  metadata: {
    ipAddress: String,
    userAgent: String,
    paymentGatewayResponse: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
donationSchema.index({ donor: 1 });
donationSchema.index({ scholarship: 1 });
donationSchema.index({ paymentStatus: 1 });
donationSchema.index({ createdAt: -1 });

// Virtual for formatted amount
donationSchema.virtual('formattedAmount').get(function() {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: this.currency || 'USD'
  }).format(this.amount);
});

// Static method to get donation stats for a scholarship
donationSchema.statics.getScholarshipStats = async function(scholarshipId) {
  const stats = await this.aggregate([
    { $match: { scholarship: mongoose.Types.ObjectId(scholarshipId) } },
    {
      $group: {
        _id: null,
        totalDonations: { $sum: '$amount' },
        count: { $sum: 1 },
        average: { $avg: '$amount' },
        min: { $min: '$amount' },
        max: { $max: '$amount' }
      }
    }
  ]);

  return stats[0] || {
    totalDonations: 0,
    count: 0,
    average: 0,
    min: 0,
    max: 0
  };
};

// Static method to get donor's total donations
donationSchema.statics.getDonorStats = async function(donorId) {
  const stats = await this.aggregate([
    { $match: { donor: mongoose.Types.ObjectId(donorId) } },
    {
      $group: {
        _id: null,
        totalDonated: { $sum: '$amount' },
        totalDonations: { $sum: 1 },
        lastDonation: { $max: '$createdAt' }
      }
    }
  ]);

  return stats[0] || {
    totalDonated: 0,
    totalDonations: 0,
    lastDonation: null
  };
};

// Pre-save hook to validate donation
donationSchema.pre('save', async function(next) {
  // Verify scholarship exists and is active (only if scholarship is specified)
  if (this.scholarship) {
    const scholarship = await mongoose.model('Scholarship').findOne({
      _id: this.scholarship,
      status: 'active'
    });

    if (!scholarship) {
      throw new Error('Invalid or inactive scholarship');
    }
  }

  // Verify donor exists and has donor role
  const donor = await mongoose.model('User').findOne({
    _id: this.donor,
    role: 'donor'
  });

  if (!donor) {
    throw new Error('Invalid donor');
  }

  next();
});

// Post-save hook to update scholarship's funded amount and donor tracking
donationSchema.post('save', async function(doc) {
  if (doc.paymentStatus === 'completed' && doc.scholarship) {
    const Scholarship = mongoose.model('Scholarship');
    
    // Get the scholarship to check if donor already exists
    const scholarship = await Scholarship.findById(doc.scholarship);
    
    if (scholarship) {
      const isNewDonor = !scholarship.donors.includes(doc.donor);
      
      // Update scholarship with donation amount and counters
      const updateData = {
        $inc: { 
          fundsRaised: doc.amount,
          amountFunded: doc.amount,
          donationCount: 1
        }
      };
      
      // Add donor to array if new and increment donor count
      if (isNewDonor) {
        updateData.$push = { donors: doc.donor };
        updateData.$inc.donorCount = 1;
      }
      
      await Scholarship.updateOne({ _id: doc.scholarship }, updateData);
    }
  }
});

const Donation = mongoose.model('Donation', donationSchema);

module.exports = Donation;

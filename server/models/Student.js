const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  
  // Personal Information
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  dateOfBirth: { type: Date, required: true },

  // Address Information
  address: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    zipCode: { type: String }, // Keep for backward compatibility
    country: { type: String, default: 'India', required: true }
  },

  // Academic Information
  college: { type: String, required: true },
  course: { type: String, required: true },
  department: { type: String, required: true },
  year: { type: String, required: true, enum: ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year', 'Graduate', 'Post Graduate'] },
  cgpa: { type: Number, min: 0, max: 10 }, // CGPA (optional if percentage is provided)
  percentage: { type: Number, min: 0, max: 100 }, // Alternative to CGPA

  // Financial Information
  familyIncome: { type: Number, required: true }, // Annual family income

  // Category Information
  casteCategory: {
    type: String,
    required: true,
    enum: ['General', 'OBC', 'SC', 'ST', 'EWS', 'Other']
  },

  // Bank Account Information (Optional)
  bankDetails: {
    accountNumber: { type: String, default: '' },
    bankName: { type: String, default: '' },
    ifscCode: { type: String, default: '' },
    upiId: { type: String, default: '' }
  },

  // Documents (for profile verification)
  documents: [{
    name: { type: String, required: true },
    fileType: { type: String, required: true },
    fileUrl: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now }
  }],

  // Applications reference
  applications: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Application'
  }],

  // Notifications
  notifications: [{
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    type: { type: String, enum: ['info', 'success', 'warning', 'error'], default: 'info' },
    createdAt: { type: Date, default: Date.now }
  }],

  // Profile completion status
  isProfileComplete: { type: Boolean, default: false },
  profileCompletionPercentage: { type: Number, default: 0, min: 0, max: 100 }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for full name
studentSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for application count
studentSchema.virtual('applicationCount').get(function() {
  return this.applications ? this.applications.length : 0;
});

// Method to calculate profile completion percentage
studentSchema.methods.calculateProfileCompletion = function() {
  const requiredFields = [
    'firstName', 'lastName', 'email', 'phone', 'dateOfBirth',
    'address.street', 'address.city', 'address.state', 'address.pincode',
    'college', 'course', 'department', 'year',
    'familyIncome', 'casteCategory'
  ];

  let completedFields = 0;
  
  requiredFields.forEach(field => {
    const value = field.split('.').reduce((obj, key) => {
      return obj && obj[key] !== undefined ? obj[key] : undefined;
    }, this);
    
    if (value !== undefined && value !== null && value !== '') {
      completedFields++;
    }
  });

  const percentage = Math.round((completedFields / requiredFields.length) * 100);
  return percentage;
};

// Method to check if profile is complete
studentSchema.methods.checkProfileCompletion = function() {
  const percentage = this.calculateProfileCompletion();
  this.profileCompletionPercentage = percentage;
  this.isProfileComplete = percentage >= 80; // 80% completion threshold
  return this.isProfileComplete;
};

// Method to add notification
studentSchema.methods.addNotification = function(title, message, type = 'info') {
  this.notifications.unshift({
    title,
    message,
    type,
    read: false,
    createdAt: new Date()
  });
  
  // Keep only last 50 notifications
  if (this.notifications.length > 50) {
    this.notifications = this.notifications.slice(0, 50);
  }
};

// Custom validation to ensure either CGPA or percentage is provided
studentSchema.pre('validate', function(next) {
  if (!this.cgpa && !this.percentage) {
    this.invalidate('cgpa', 'Either CGPA or percentage must be provided');
    this.invalidate('percentage', 'Either CGPA or percentage must be provided');
  }
  next();
});

// Pre-save hook to update profile completion
studentSchema.pre('save', function(next) {
  this.checkProfileCompletion();
  next();
});

// Index for better query performance
studentSchema.index({ user: 1 });
studentSchema.index({ email: 1 });
studentSchema.index({ isProfileComplete: 1 });

module.exports = mongoose.model('Student', studentSchema);
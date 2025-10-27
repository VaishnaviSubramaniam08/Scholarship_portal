const mongoose = require('mongoose');

// Status history sub-schema
const statusHistorySchema = new mongoose.Schema({
  status: {
    type: String,
    required: true,
    enum: ['pending', 'submitted', 'under_review', 'approved', 'rejected', 'shortlisted']
  },
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  changedAt: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    default: ''
  }
}, { _id: false });

// Document sub-schema
const documentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Document name is required'],
    trim: true
  },
  fileUrl: {
    type: String,
    required: [true, 'File URL is required']
  },
  fileType: {
    type: String,
    required: [true, 'File type is required']
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const applicationSchema = new mongoose.Schema({
  // Reference to the scholarship
  scholarship: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Scholarship', 
    required: [true, 'Scholarship ID is required'],
    index: true
  },
  
  // Reference to the student who applied
  student: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Student', 
    required: [true, 'Student ID is required'],
    index: true
  },
  
  // Application status
  status: { 
    type: String, 
    default: 'pending', 
    enum: {
      values: ['pending', 'submitted', 'under_review', 'approved', 'rejected', 'shortlisted'],
      message: 'Invalid application status. Must be one of: pending, submitted, under_review, approved, rejected, shortlisted'
    },
    index: true
  },
  
  // Review information
  reviewerNotes: { 
    type: String,
    default: '',
    trim: true
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: {
    type: Date
  },
  
  // Admin decision
  adminNotes: {
    type: String,
    default: '',
    trim: true
  },
  decidedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  decidedAt: {
    type: Date
  },
  
  // Application content
  essay: { 
    type: String,
    required: [true, 'Essay is required'],
    trim: true
  },
  additionalInfo: { 
    type: String,
    default: '',
    trim: true
  },
  gpa: { 
    type: Number,
    required: [true, 'GPA is required'],
    min: [0, 'GPA cannot be negative'],
    max: [4.0, 'GPA cannot be greater than 4.0']
  },
  major: {
    type: String,
    required: [true, 'Major is required'],
    trim: true
  },
  yearOfStudy: {
    type: String,
    required: [true, 'Year of study is required'],
    enum: {
      values: ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate'],
      message: 'Invalid year of study. Must be one of: Freshman, Sophomore, Junior, Senior, or Graduate'
    }
  },
  
  // Documents and files
  documents: {
    type: [documentSchema],
    default: []
  },
  
  // Status history for audit trail
  statusHistory: {
    type: [statusHistorySchema],
    default: [],
    select: false // Don't include in query results by default
  },
  
  // Submission and update timestamps
  submittedAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { 
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      // Remove sensitive/irrelevant fields when converting to JSON
      delete ret.__v;
      delete ret.statusHistory;
      return ret;
    }
  },
  toObject: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for better query performance
applicationSchema.index({ student: 1, scholarship: 1 }, { unique: true });
applicationSchema.index({ status: 1, submittedAt: 1 });
applicationSchema.index({ 'scholarship': 1, 'status': 1 });

// Middleware to update status history and timestamps
applicationSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    this.statusHistory = this.statusHistory || [];
    this.statusHistory.push({
      status: this.status,
      changedBy: this.reviewedBy || this.decidedBy || this.student,
      notes: this.reviewerNotes || this.adminNotes || 'Status updated',
      changedAt: new Date()
    });
    
    // Update timestamps
    if (this.status === 'submitted') {
      this.submittedAt = this.submittedAt || new Date();
    }
    this.updatedAt = new Date();
  }
  next();
});

// Virtual for application URL
applicationSchema.virtual('url').get(function() {
  return `/api/applications/${this._id}`;
});

// Static method to get application stats
applicationSchema.statics.getStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        status: '$_id',
        count: 1
      }
    },
    { $sort: { status: 1 } }
  ]);
  
  return stats;
};

// Method to get application status history
applicationSchema.methods.getStatusHistory = function() {
  return this.statusHistory.sort((a, b) => b.changedAt - a.changedAt);
};

const Application = mongoose.model('Application', applicationSchema);

module.exports = Application;
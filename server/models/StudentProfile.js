const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  fileUrl: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const educationSchema = new mongoose.Schema({
  school: {
    type: String,
    trim: true
  },
  degree: {
    type: String,
    trim: true
  },
  fieldOfStudy: {
    type: String,
    trim: true
  },
  startYear: {
    type: Number
  },
  endYear: {
    type: Number
  },
  gpa: {
    type: Number,
    min: 0,
    max: 4.0
  },
  isCurrent: {
    type: Boolean,
    default: false
  }
}, { _id: false });

const personalInfoSchema = new mongoose.Schema({
  dateOfBirth: {
    type: Date
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other', 'prefer-not-to-say']
  },
  phone: {
    type: String,
    trim: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    postalCode: String,
    country: String
  },
  profilePicture: {
    type: String
  },
  bio: {
    type: String,
    maxlength: 500
  },
  skills: [{
    type: String,
    trim: true
  }],
  socialLinks: {
    linkedin: String,
    github: String,
    twitter: String,
    portfolio: String
  }
}, { _id: false });

const studentProfileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  personalInfo: {
    type: personalInfoSchema,
    default: {}
  },
  education: {
    type: [educationSchema],
    default: []
  },
  documents: {
    type: [documentSchema],
    default: []
  },
  isProfileComplete: {
    type: Boolean,
    default: false
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for faster querying
studentProfileSchema.index({ user: 1 });

/**
 * Check if the profile is complete
 * @returns {boolean} True if all required fields are filled
 */
studentProfileSchema.methods.checkProfileCompletion = function() {
  // Required fields for profile completion
  const requiredFields = [
    'personalInfo.dateOfBirth',
    'personalInfo.phone',
    'personalInfo.address',
    'education.0.school',
    'education.0.degree',
    'education.0.fieldOfStudy',
    'education.0.startYear',
    'education.0.gpa'
  ];

  // Check if all required fields are present and not empty
  return requiredFields.every(field => {
    try {
      const value = field.split('.').reduce((obj, key) => {
        if (Array.isArray(obj)) {
          return obj[parseInt(key, 10)] || {};
        }
        return (obj && obj[key] !== undefined) ? obj[key] : undefined;
      }, this);
      
      // Check if the value exists and is not empty
      if (value === undefined || value === null || value === '') {
        return false;
      }
      
      // If it's an object, check if it has any properties
      if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
        return Object.keys(value).length > 0;
      }
      
      return true;
    } catch (error) {
      console.error(`Error checking field ${field}:`, error);
      return false;
    }
  });
};

// Pre-save hook to update isProfileComplete and lastUpdated
studentProfileSchema.pre('save', function(next) {
  this.isProfileComplete = this.checkProfileCompletion();
  this.lastUpdated = new Date();
  next();
});

// Add a static method to check profile completion
studentProfileSchema.statics.checkProfileComplete = async function(userId) {
  const profile = await this.findOne({ user: userId });
  if (!profile) return false;
  return profile.checkProfileCompletion();
};

const StudentProfile = mongoose.model('StudentProfile', studentProfileSchema);

module.exports = StudentProfile;

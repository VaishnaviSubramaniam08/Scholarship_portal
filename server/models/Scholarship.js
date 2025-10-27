const mongoose = require('mongoose');

const scholarshipSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  totalFunds: { type: Number, required: true },
  availableFunds: { type: Number, required: true },
  deadline: { type: Date, required: true },
  eligibility: {
    minGPA: { type: Number },
    majors: { type: [String] },  // Array of majors
    yearOfStudy: { type: String }
  },
  requirements: [{ type: String }], // Array of required documents
  status: { type: String, default: 'inactive' },  // e.g., 'active', 'inactive', 'draft', 'archived'
  isActive: { type: Boolean, default: false }, // For backward compatibility
  fundsRaised: { type: Number, default: 0 }, // Total funds raised through donations
  amountFunded: { type: Number, default: 0 }, // Total amount funded (may be same as fundsRaised)
  donorCount: { type: Number, default: 0 }, // Number of unique donors
  donationCount: { type: Number, default: 0 }, // Total number of donations
  donors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Array of donor IDs
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  image: { type: String }, // Optional image URL
  applications: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Application' }]  // References to applications
}, { timestamps: true });

// Text index for search
scholarshipSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('Scholarship', scholarshipSchema);
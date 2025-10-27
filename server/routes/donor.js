const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const Donation = require('../models/Donation');
const Scholarship = require('../models/Scholarship');
const User = require('../models/User');

// @desc    Get donor profile
// @route   GET /api/donor/profile
// @access  Private (Donor)
router.get('/profile', protect, authorize('donor'), async (req, res) => {
  try {
    const donor = await User.findById(req.user.id).select('-password');
    if (!donor) {
      return res.status(404).json({
        success: false,
        message: 'Donor not found'
      });
    }
    
    // Get donations with scholarship details
    const donations = await Donation.find({ 
      donor: req.user.id,
      paymentStatus: 'completed'
    })
      .populate('scholarship', 'name description')
      .sort({ createdAt: -1 })
      .lean();
    
    // Calculate total donated
    const totalDonated = donations.reduce((sum, donation) => sum + donation.amount, 0);
    
    res.json({
      success: true,
      ...donor._doc,
      totalDonated,
      donations,
      donationCount: donations.length
    });
  } catch (error) {
    console.error('Error fetching donor profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Get donor's donations
// @route   GET /api/donor/donations
// @access  Private (Donor)
router.get('/donations', protect, authorize('donor'), async (req, res) => {
  try {
    const donations = await Donation.find({ donor: req.user.id })
      .populate('scholarship', 'name')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      count: donations.length,
      data: donations
    });
  } catch (error) {
    console.error('Error fetching donations:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Create a donation
// @route   POST /api/donations
// @access  Private (Donor)
router.post('/', protect, authorize('donor'), async (req, res) => {
  try {
    const { amount, scholarshipId, paymentMethod } = req.body;
    
    // Basic validation
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid donation amount'
      });
    }
    
    // If scholarshipId is provided, verify it exists
    if (scholarshipId) {
      const scholarship = await Scholarship.findById(scholarshipId);
      if (!scholarship) {
        return res.status(404).json({
          success: false,
          message: 'Scholarship not found'
        });
      }
    }
    
    // Create donation record
    const donation = new Donation({
      donor: req.user.id,
      amount,
      scholarship: scholarshipId || null,
      paymentMethod: paymentMethod || 'Credit Card',
      transactionId: `TXN${Date.now()}`
    });
    
    await donation.save();
    
    // If donation is for a specific scholarship, update the scholarship's funds
    if (scholarshipId) {
      await Scholarship.findByIdAndUpdate(scholarshipId, {
        $inc: { availableFunds: amount }
      });
    }
    
    res.status(201).json({
      success: true,
      data: donation
    });
  } catch (error) {
    console.error('Error processing donation:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing donation',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Get donor impact report
// @route   GET /api/donor/impact
// @access  Private (Donor)
router.get('/impact', protect, authorize('donor'), async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const Application = require('../models/Application');
    
    // Get total donations count and amount
    const donationStats = await Donation.aggregate([
      { 
        $match: { 
          donor: new mongoose.Types.ObjectId(req.user.id),
          paymentStatus: 'completed'
        } 
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
          scholarshipsSupported: { $addToSet: '$scholarship' }
        }
      }
    ]);
    
    const result = donationStats[0] || { 
      totalAmount: 0, 
      count: 0, 
      scholarshipsSupported: [] 
    };
    
    // Filter out null scholarships (general fund donations)
    const scholarshipIds = result.scholarshipsSupported.filter(id => id !== null);
    
    // Get count of students who applied to scholarships this donor supported
    let studentsSupported = 0;
    if (scholarshipIds.length > 0) {
      const applications = await Application.distinct('student', {
        scholarship: { $in: scholarshipIds },
        status: { $in: ['approved', 'awarded'] }
      });
      studentsSupported = applications.length;
    }
    
    res.json({
      success: true,
      totalDonated: result.totalAmount,
      totalDonations: result.count,
      scholarshipsSupported: scholarshipIds.length,
      studentsSupported
    });
  } catch (error) {
    console.error('Error generating impact report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating impact report',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

module.exports = router;

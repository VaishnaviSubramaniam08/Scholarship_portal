const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const Donation = require('../models/Donation');
const PaymentService = require('../services/paymentService');

// @desc    Create a new donation with real-time payment processing
// @route   POST /api/donations
// @access  Private (Donor)
router.post('/', protect, authorize('donor'), async (req, res) => {
  try {
    console.log("Received donation data:", req.body);
    const { 
      scholarshipId, 
      amount, 
      paymentMethod, 
      message, 
      isAnonymous,
      // Payment details
      cardNumber,
      cardExpiry,
      cardCVV,
      cardHolder,
      upiId,
      bankName,
      accountNumber
    } = req.body;
    
    // Basic validation
    if (!amount || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: 'Please provide amount and paymentMethod'
      });
    }

    // Validate amount
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid donation amount'
      });
    }

    // If scholarship is specified, verify it exists and is active
    let scholarship = null;
    if (scholarshipId) {
      const Scholarship = require('../models/Scholarship');
      scholarship = await Scholarship.findById(scholarshipId);
      
      if (!scholarship) {
        return res.status(404).json({
          success: false,
          message: 'Scholarship not found'
        });
      }
      
      if (scholarship.status !== 'active') {
        return res.status(400).json({
          success: false,
          message: 'This scholarship is not currently accepting donations'
        });
      }
    }

    // Process payment through payment service
    const paymentData = {
      amount: parseFloat(amount),
      paymentMethod,
      currency: 'USD',
      description: scholarship ? `Donation to ${scholarship.name}` : 'General Scholarship Donation',
      cardNumber,
      cardExpiry,
      cardCVV,
      cardHolder,
      upiId,
      bankName,
      accountNumber
    };

    const paymentResult = await PaymentService.processPayment(paymentData);

    if (!paymentResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Payment processing failed',
        error: paymentResult.error
      });
    }

    // For PayPal, return approval URL for user to complete payment
    if (paymentMethod === 'PayPal' && paymentResult.approvalUrl) {
      // Create pending donation
      const donation = new Donation({
        donor: req.user.id,
        donorId: req.user.id,
        scholarship: scholarshipId || undefined,
        amount: parseFloat(amount),
        paymentMethod,
        paymentStatus: 'pending',
        transactionId: paymentResult.orderId,
        message: message || '',
        isAnonymous: isAnonymous || false,
        date: new Date(),
        metadata: {
          paypalOrderId: paymentResult.orderId
        }
      });

      await donation.save();

      return res.status(200).json({
        success: true,
        requiresAction: true,
        approvalUrl: paymentResult.approvalUrl,
        orderId: paymentResult.orderId,
        message: 'Please complete payment via PayPal',
        data: donation
      });
    }

    // For other payment methods, create completed donation
    const donation = new Donation({
      donor: req.user.id,
      donorId: req.user.id,
      scholarship: scholarshipId || undefined,
      amount: parseFloat(amount),
      paymentMethod,
      paymentStatus: 'completed',
      transactionId: paymentResult.transactionId,
      message: message || '',
      isAnonymous: isAnonymous || false,
      date: new Date(),
      metadata: {
        cardLast4: paymentResult.cardLast4,
        upiId: paymentResult.upiId,
        bankName: paymentResult.bankName
      }
    });

    await donation.save();

    // Populate scholarship details for response
    await donation.populate('scholarship', 'name description');

    res.status(201).json({
      success: true,
      message: paymentResult.message || 'Donation successful! Thank you for your generosity.',
      data: donation,
      paymentDetails: {
        transactionId: paymentResult.transactionId,
        status: paymentResult.status
      }
    });

  } catch (err) {
    console.error('Donation error:', err);
    res.status(400).json({ 
      success: false, 
      message: 'Donation failed',
      error: process.env.NODE_ENV === 'development' ? err.message : {}
    });
  }
});

// @desc    Create a new donation (alternative endpoint)
// @route   POST /api/donations/add
// @access  Private (Donor)
router.post('/add', protect, authorize('donor'), async (req, res) => {
  try {
    console.log("Received donation data:", req.body);
    const { scholarshipId, amount, paymentMethod, transactionId, message, isAnonymous } = req.body;
    
    // Basic validation
    if (!amount || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: 'Please provide amount and paymentMethod'
      });
    }

    // Validate amount
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid donation amount'
      });
    }

    // If scholarship is specified, verify it exists
    if (scholarshipId) {
      const Scholarship = require('../models/Scholarship');
      const scholarship = await Scholarship.findById(scholarshipId);
      
      if (!scholarship) {
        return res.status(404).json({
          success: false,
          message: 'Scholarship not found'
        });
      }
    }

    // Create new donation
    const donation = new Donation({
      donor: req.user.id,
      donorId: req.user.id,
      scholarship: scholarshipId || undefined,
      amount: parseFloat(amount),
      paymentMethod,
      paymentStatus: 'completed',
      transactionId: transactionId || `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      message: message || '',
      isAnonymous: isAnonymous || false,
      date: new Date()
    });

    await donation.save();

    // Populate scholarship details for response
    await donation.populate('scholarship', 'name description');

    res.status(201).json({ 
      success: true,
      message: "Donation successful! Thank you for your generosity.", 
      donation,
      data: donation
    });
  } catch (error) {
    console.error("Donation error:", error);
    res.status(400).json({ 
      success: false,
      message: "Donation failed", 
      error: error.message 
    });
  }
});

// @desc    Get donations by donor
// @route   GET /api/donations/donor/:id
// @access  Private (Donor, Admin)
router.get('/donor/:id', protect, authorize('donor', 'admin'), async (req, res) => {
  try {
    // Only allow admin or the actual donor to see the donations
    if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view these donations'
      });
    }

    const donations = await Donation.find({ donor: req.params.id })
      .populate('scholarship', 'name description')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: donations.length,
      data: donations
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? err.message : {}
    });
  }
});

// @desc    Get donations by scholarship
// @route   GET /api/donations/scholarship/:id
// @access  Public
router.get('/scholarship/:id', async (req, res) => {
  try {
    const donations = await Donation.find({ scholarship: req.params.id })
      .populate('donor', 'name email')
      .sort({ amount: -1 });

    // Calculate total donations
    const total = donations.reduce((sum, donation) => sum + donation.amount, 0);

    res.json({
      success: true,
      count: donations.length,
      total,
      data: donations
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? err.message : {}
    });
  }
});

// @desc    Get top donors
// @route   GET /api/donations/top-donors
// @access  Private (Admin)
router.get('/top-donors', protect, authorize('admin'), async (req, res) => {
  try {
    const topDonors = await Donation.aggregate([
      {
        $group: {
          _id: '$donor',
          totalDonated: { $sum: '$amount' },
          donationCount: { $sum: 1 }
        }
      },
      { $sort: { totalDonated: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'donorInfo'
        }
      },
      { $unwind: '$donorInfo' },
      {
        $project: {
          _id: 1,
          name: '$donorInfo.name',
          email: '$donorInfo.email',
          totalDonated: 1,
          donationCount: 1
        }
      }
    ]);

    res.json({
      success: true,
      count: topDonors.length,
      data: topDonors
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? err.message : {}
    });
  }
});

// @desc    Get all donations (Admin view)
// @route   GET /api/donations/all
// @access  Private (Admin)
router.get('/all', protect, authorize('admin'), async (req, res) => {
  try {
    const donations = await Donation.find()
      .populate('donor', 'name email')
      .populate('scholarship', 'name description')
      .sort({ createdAt: -1 })
      .limit(100); // Limit to recent 100 donations

    // Calculate statistics
    const stats = await Donation.aggregate([
      {
        $group: {
          _id: null,
          totalDonations: { $sum: '$amount' },
          count: { $sum: 1 },
          averageDonation: { $avg: '$amount' }
        }
      }
    ]);

    // Get donations by payment method
    const byPaymentMethod = await Donation.aggregate([
      {
        $group: {
          _id: '$paymentMethod',
          count: { $sum: 1 },
          total: { $sum: '$amount' }
        }
      },
      { $sort: { total: -1 } }
    ]);

    res.json({
      success: true,
      count: donations.length,
      data: donations,
      stats: stats[0] || { totalDonations: 0, count: 0, averageDonation: 0 },
      byPaymentMethod
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? err.message : {}
    });
  }
});

// @desc    Get donation statistics for admin
// @route   GET /api/donations/stats
// @access  Private (Admin)
router.get('/stats', protect, authorize('admin'), async (req, res) => {
  try {
    // Overall statistics
    const overallStats = await Donation.aggregate([
      {
        $group: {
          _id: null,
          totalDonations: { $sum: '$amount' },
          donationCount: { $sum: 1 },
          averageDonation: { $avg: '$amount' }
        }
      }
    ]);

    // Count unique donors
    const uniqueDonors = await Donation.distinct('donor');

    // Recent donations (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentStats = await Donation.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: null,
          recentDonations: { $sum: '$amount' },
          recentCount: { $sum: 1 }
        }
      }
    ]);

    // Donations by payment method
    const byPaymentMethod = await Donation.aggregate([
      {
        $group: {
          _id: '$paymentMethod',
          count: { $sum: 1 },
          total: { $sum: '$amount' }
        }
      },
      { $sort: { total: -1 } }
    ]);

    // Top scholarships by donations
    const topScholarships = await Donation.aggregate([
      { $match: { scholarship: { $ne: null } } },
      {
        $group: {
          _id: '$scholarship',
          totalDonated: { $sum: '$amount' },
          donationCount: { $sum: 1 }
        }
      },
      { $sort: { totalDonated: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'scholarships',
          localField: '_id',
          foreignField: '_id',
          as: 'scholarshipInfo'
        }
      },
      { $unwind: '$scholarshipInfo' },
      {
        $project: {
          _id: 1,
          name: '$scholarshipInfo.name',
          totalDonated: 1,
          donationCount: 1
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        overall: overallStats[0] || { totalDonations: 0, donationCount: 0, averageDonation: 0 },
        uniqueDonors: uniqueDonors.length,
        recent: recentStats[0] || { recentDonations: 0, recentCount: 0 },
        byPaymentMethod,
        topScholarships
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? err.message : {}
    });
  }
});

// @desc    Capture PayPal payment after user approval
// @route   POST /api/donations/paypal/capture
// @access  Private (Donor)
router.post('/paypal/capture', protect, authorize('donor'), async (req, res) => {
  try {
    const { orderId, donationId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'PayPal order ID is required'
      });
    }

    // Capture the payment
    const captureResult = await PaymentService.capturePayPalPayment(orderId);

    if (!captureResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to capture PayPal payment',
        error: captureResult.error
      });
    }

    // Update donation status
    if (donationId) {
      const donation = await Donation.findById(donationId);
      
      if (donation) {
        donation.paymentStatus = 'completed';
        donation.transactionId = captureResult.transactionId;
        donation.metadata = {
          ...donation.metadata,
          paypalCaptureId: captureResult.transactionId,
          payerEmail: captureResult.payerEmail
        };
        await donation.save();
        await donation.populate('scholarship', 'name description');

        return res.json({
          success: true,
          message: 'Payment captured successfully!',
          data: donation,
          paymentDetails: captureResult
        });
      }
    }

    res.json({
      success: true,
      message: 'Payment captured successfully!',
      paymentDetails: captureResult
    });

  } catch (err) {
    console.error('PayPal capture error:', err);
    res.status(400).json({
      success: false,
      message: 'Failed to capture payment',
      error: process.env.NODE_ENV === 'development' ? err.message : {}
    });
  }
});

// @desc    Refund a donation
// @route   POST /api/donations/:id/refund
// @access  Private (Admin)
router.post('/:id/refund', protect, authorize('admin'), async (req, res) => {
  try {
    const donation = await Donation.findById(req.params.id);

    if (!donation) {
      return res.status(404).json({
        success: false,
        message: 'Donation not found'
      });
    }

    if (donation.paymentStatus === 'refunded') {
      return res.status(400).json({
        success: false,
        message: 'Donation already refunded'
      });
    }

    if (donation.paymentStatus !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Only completed donations can be refunded'
      });
    }

    // Process refund
    const refundResult = await PaymentService.refundPayment(
      donation.transactionId,
      donation.amount,
      donation.paymentMethod
    );

    if (!refundResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Refund processing failed',
        error: refundResult.error
      });
    }

    // Update donation status
    donation.paymentStatus = 'refunded';
    donation.metadata = {
      ...donation.metadata,
      refundId: refundResult.refundId,
      refundedAt: new Date()
    };
    await donation.save();

    res.json({
      success: true,
      message: 'Donation refunded successfully',
      data: donation,
      refundDetails: refundResult
    });

  } catch (err) {
    console.error('Refund error:', err);
    res.status(400).json({
      success: false,
      message: 'Refund failed',
      error: process.env.NODE_ENV === 'development' ? err.message : {}
    });
  }
});

// @desc    Verify payment status
// @route   GET /api/donations/:id/verify
// @access  Private (Donor/Admin)
router.get('/:id/verify', protect, async (req, res) => {
  try {
    const donation = await Donation.findById(req.params.id);

    if (!donation) {
      return res.status(404).json({
        success: false,
        message: 'Donation not found'
      });
    }

    // Check if user has permission to view this donation
    if (req.user.role !== 'admin' && donation.donor.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this donation'
      });
    }

    // Verify payment with payment gateway
    const verifyResult = await PaymentService.verifyPayment(
      donation.transactionId,
      donation.paymentMethod
    );

    res.json({
      success: true,
      donation,
      verification: verifyResult
    });

  } catch (err) {
    console.error('Verification error:', err);
    res.status(400).json({
      success: false,
      message: 'Verification failed',
      error: process.env.NODE_ENV === 'development' ? err.message : {}
    });
  }
});

module.exports = router;

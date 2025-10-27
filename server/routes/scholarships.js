const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const Scholarship = require('../models/Scholarship');
const Application = require('../models/Application');
const { uploadSingle, getFileUrl } = require('../middleware/fileUpload');

// @desc    Get all scholarships with optional filters
// @route   GET /api/scholarships
// @access  Public
router.get('/', async (req, res) => {
  try {
    const { status, minAmount, maxAmount, deadlineAfter, deadlineBefore, search, sortBy, limit } = req.query;
    
    // Build query object
    const query = {};
    
    // Filter by status
    if (status) {
      query.status = status;
    } else {
      // Default to active scholarships for non-admins
      if (!req.user || req.user.role !== 'admin') {
        query.status = 'active';
        query.deadline = { $gt: new Date() }; // Only show scholarships that haven't passed deadline
      }
    }
    
    // Filter scholarships based on user role
    if (req.user) {
      // If user is a donor, only show scholarships they can donate to
      if (req.user.role === 'donor') {
        // You might want to add specific filters for donors here
        // For example, only show scholarships that accept donations
      }
      
      // If user is a student, only show scholarships they can apply to
      if (req.user.role === 'student') {
        // You might want to add specific filters for students here
        // For example, only show scholarships that match their profile
      }
      
      // If user is a reviewer, only show scholarships they need to review
      if (req.user.role === 'reviewer') {
        // You might want to add specific filters for reviewers here
        // For example, only show scholarships assigned to them
      }
      
      // Admin can see all scholarships (no additional filter needed)
    }
    
    // Filter by amount range
    if (minAmount || maxAmount) {
      query.amount = {};
      if (minAmount) query.amount.$gte = Number(minAmount);
      if (maxAmount) query.amount.$lte = Number(maxAmount);
    }
    
    // Filter by deadline
    if (deadlineAfter || deadlineBefore) {
      query.deadline = {};
      if (deadlineAfter) query.deadline.$gte = new Date(deadlineAfter);
      if (deadlineBefore) query.deadline.$lte = new Date(deadlineBefore);
    }
    
    // Text search
    if (search) {
      query.$text = { $search: search };
    }
    
    // Build sort object
    let sort = { createdAt: -1 }; // Default sort
    if (sortBy) {
      const sortFields = sortBy.split(',').map(field => {
        let [key, order] = field.split(':');
        return [key, order === 'desc' ? -1 : 1];
      });
      sort = Object.fromEntries(sortFields);
    }
    
    // Execute query
    let queryBuilder = Scholarship.find(query)
      .sort(sort)
      .select('-__v')
      .populate('createdBy', 'name email');
    
    // Apply limit if specified
    if (limit) {
      queryBuilder = queryBuilder.limit(Number(limit));
    }
    
    const scholarships = await queryBuilder;
    
    // Add application count for each scholarship
    const scholarshipsWithCounts = await Promise.all(
      scholarships.map(async scholarship => {
        const applicationCount = await Application.countDocuments({
          scholarship: scholarship._id
        });
        return {
          ...scholarship.toObject(),
          applicationCount
        };
      })
    );
    
    res.json({
      success: true,
      count: scholarshipsWithCounts.length,
      data: scholarshipsWithCounts
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

// @desc    Create new scholarship
// @route   POST /api/scholarships
// @access  Private/Admin
router.post(
  '/',
  protect,
  authorize('admin'),
  async (req, res) => {
    try {
      const {
        name,
        description,
        amount,
        totalFunds,
        deadline,
        eligibility,
        requirements,
        status = 'draft'
      } = req.body;
      
      // Basic validation
      if (!name || !description || !amount || !deadline) {
        return res.status(400).json({
          success: false,
          message: 'Please provide name, description, amount, and deadline'
        });
      }

      // Validate amount is a positive number
      const amountNum = Number(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Amount must be a positive number'
        });
      }

      // Validate deadline is a valid date
      const deadlineDate = new Date(deadline);
      if (isNaN(deadlineDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid deadline date'
        });
      }
      
      // Process image if uploaded
      let imageUrl = '';
      if (req.file) {
        imageUrl = getFileUrl(req.file.filename);
      }
      
      // Parse JSON fields if they're strings
      let eligibilityObj = {};
      let requirementsArr = [];
      
      try {
        eligibilityObj = typeof eligibility === 'string' ? JSON.parse(eligibility) : eligibility || {};
        requirementsArr = typeof requirements === 'string' ? JSON.parse(requirements) : requirements || [];
      } catch (parseErr) {
        return res.status(400).json({
          success: false,
          message: 'Invalid format for eligibility or requirements'
        });
      }
      
      // Create new scholarship
      const totalFundsValue = totalFunds ? Number(totalFunds) : Number(amount) * 10; // Default to amount * 10 if not provided
      const scholarship = new Scholarship({
        name,
        description,
        amount: Number(amount),
        totalFunds: totalFundsValue,
        availableFunds: totalFundsValue, // Initially set to same as totalFunds
        deadline: new Date(deadline),
        eligibility: eligibilityObj,
        requirements: requirementsArr,
        status,
        createdBy: req.user.id,
        ...(imageUrl && { image: imageUrl })
      });
      
      await scholarship.save();
      
      res.status(201).json({
        success: true,
        data: scholarship
      });
      
    } catch (err) {
      console.error(err);
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? err.message : {}
      });
    }
  }
);

// @desc    Get single scholarship by ID
// @route   GET /api/scholarships/:id
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const scholarship = await Scholarship.findById(req.params.id).populate('createdBy', 'name email');
    
    if (!scholarship) {
      return res.status(404).json({
        success: false,
        message: 'Scholarship not found'
      });
    }
    
    // Get application count
    const applicationCount = await Application.countDocuments({
      scholarship: scholarship._id
    });
    
    // Get total funds raised from donations (assuming Donation model exists)
    let fundsRaised = 0;
    try {
      const Donation = require('../models/Donation');
      const donations = await Donation.aggregate([
        { $match: { scholarship: scholarship._id } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      fundsRaised = donations[0]?.total || 0;
    } catch (donationErr) {
      console.warn('Donation model not found or error fetching donations:', donationErr);
    }
    
    // Check if the current user has already applied
    let userApplication = null;
    if (req.user && req.user.role === 'student') {
      userApplication = await Application.findOne({
        student: req.user.id,
        scholarship: scholarship._id
      }).select('status submittedAt');
    }
    
    res.json({
      success: true,
      data: {
        ...scholarship.toObject(),
        applicationCount,
        fundsRaised,
        userApplication: userApplication || null
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

// @desc    Update scholarship
// @route   PUT /api/scholarships/:id
// @access  Private/Admin
router.put(
  '/:id',
  protect,
  authorize('admin'),
  uploadSingle('image'),
  async (req, res) => {
    try {
      const {
        name,
        description,
        amount,
        totalFunds,
        deadline,
        eligibility,
        requirements,
        status
      } = req.body;
      
      // Find the scholarship
      let scholarship = await Scholarship.findById(req.params.id);
      
      if (!scholarship) {
        return res.status(404).json({
          success: false,
          message: 'Scholarship not found'
        });
      }
      
      // Check if updater is the creator or admin
      if (scholarship.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to update this scholarship'
        });
      }
      
      // Process image if uploaded
      if (req.file) {
        scholarship.image = getFileUrl(req.file.filename);
        // TODO: Delete old image file if it exists
      }
      
      // Update fields if provided
      if (name) scholarship.name = name;
      if (description) scholarship.description = description;
      if (amount) {
        const amountNum = Number(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
          return res.status(400).json({
            success: false,
            message: 'Amount must be a positive number'
          });
        }
        scholarship.amount = amountNum;
      }
      if (totalFunds) scholarship.totalFunds = Number(totalFunds);
      if (deadline) {
        const deadlineDate = new Date(deadline);
        if (isNaN(deadlineDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Please provide a valid deadline date'
          });
        }
        scholarship.deadline = deadlineDate;
      }
      if (status) scholarship.status = status;
      
      // Update eligibility and requirements if provided
      if (eligibility) {
        try {
          scholarship.eligibility = typeof eligibility === 'string' ? 
            JSON.parse(eligibility) : eligibility;
        } catch (err) {
          return res.status(400).json({
            success: false,
            message: 'Invalid format for eligibility'
          });
        }
      }
      
      if (requirements) {
        try {
          scholarship.requirements = typeof requirements === 'string' ? 
            JSON.parse(requirements) : requirements;
        } catch (err) {
          return res.status(400).json({
            success: false,
            message: 'Invalid format for requirements'
          });
        }
      }
      
      await scholarship.save();
      
      res.json({
        success: true,
        data: scholarship
      });
      
    } catch (err) {
      console.error(err);
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? err.message : {}
      });
    }
  }
);

// @desc    Delete scholarship
// @route   DELETE /api/scholarships/:id
// @access  Private/Admin
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const scholarship = await Scholarship.findById(req.params.id);
    
    if (!scholarship) {
      return res.status(404).json({
        success: false,
        message: 'Scholarship not found'
      });
    }
    
    // Check if there are any applications for this scholarship
    const applicationCount = await Application.countDocuments({
      scholarship: scholarship._id
    });
    
    if (applicationCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete scholarship with existing applications. Please archive it instead.'
      });
    }
    
    // TODO: Delete associated image file if it exists
    
    await scholarship.remove();
    
    res.json({
      success: true,
      data: {}
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

// @desc    Get applications for a scholarship
// @route   GET /api/scholarships/:id/applications
// @access  Private/Admin,Reviewer
router.get(
  '/:id/applications',
  protect,
  authorize('admin', 'reviewer'),
  async (req, res) => {
    try {
      const { status, sortBy, limit } = req.query;
      
      const query = { scholarship: req.params.id };
      
      // Filter by status if provided
      if (status) {
        query.status = status;
      }
      
      // Build sort object
      let sort = { submittedAt: -1 }; // Default sort
      if (sortBy) {
        const sortFields = sortBy.split(',').map(field => {
          let [key, order] = field.split(':');
          return [key, order === 'desc' ? -1 : 1];
        });
        sort = Object.fromEntries(sortFields);
      }
      
      // Execute query
      let queryBuilder = Application.find(query)
        .populate('student', 'name email gpa')
        .sort(sort);
      
      // Apply limit if specified
      if (limit) {
        queryBuilder = queryBuilder.limit(Number(limit));
      }
      
      const applications = await queryBuilder;
      
      res.json({
        success: true,
        count: applications.length,
        data: applications
      });
      
    } catch (err) {
      console.error(err);
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? err.message : {}
      });
    }
  }
);

// Debug route - remove in production
router.get('/debug/all', async (req, res) => {
  try {
    console.log('Debug: Fetching all scholarships');
    console.log('User:', req.user);
    
    const scholarships = await Scholarship.find({})
      .populate('createdBy', 'name email')
      .lean();
      
    console.log(`Found ${scholarships.length} scholarships in database`);
    
    res.json({
      success: true,
      count: scholarships.length,
      data: scholarships
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({
      success: false,
      message: 'Debug error: ' + error.message
    });
  }
});

module.exports = router;
const Scholarship = require('../models/Scholarship');
const Application = require('../models/Application');

// Create scholarship (admin)
exports.createScholarship = async (req, res) => {
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

    const scholarshipData = {
      name,
      description,
      amount: Number(amount),
      totalFunds: totalFunds ? Number(totalFunds) : Number(amount) * 10,
      availableFunds: totalFunds ? Number(totalFunds) : Number(amount) * 10,
      deadline: new Date(deadline),
      eligibility: eligibilityObj,
      requirements: requirementsArr,
      status,
      createdBy: req.user._id
    };

    const scholarship = new Scholarship(scholarshipData);
    await scholarship.save();

    res.status(201).json({ 
      success: true,
      message: 'Scholarship created successfully', 
      data: scholarship 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false,
      message: 'Error creating scholarship', 
      error: process.env.NODE_ENV === 'development' ? error.message : {} 
    });
  }
};

exports.getAllScholarships = async (req, res) => {
  try {
    const { status, search, minAmount, maxAmount, deadlineAfter, deadlineBefore, sortBy, limit } = req.query;
    let query = {};

    // Filter by status
    if (status && status.toLowerCase() !== 'all') {
      query.status = status;
    } else if (!req.user || req.user.role !== 'admin') {
      // Default to active scholarships for non-admins
      query.status = 'active';
      query.deadline = { $gt: new Date() };
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
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    let sort = { createdAt: -1 };
    if (sortBy) {
      const sortFields = sortBy.split(',').map(field => {
        let [key, order] = field.split(':');
        return [key, order === 'desc' ? -1 : 1];
      });
      sort = Object.fromEntries(sortFields);
    }

    let scholarships = await Scholarship.find(query)
      .sort(sort)
      .populate('createdBy', 'name email');

    if (limit) {
      scholarships = scholarships.slice(0, Number(limit));
    }

    // Add application count
    scholarships = await Promise.all(
      scholarships.map(async (scholarship) => {
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
      count: scholarships.length,
      data: scholarships
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching scholarships', 
      error: process.env.NODE_ENV === 'development' ? error.message : {} 
    });
  }
};

// Get scholarship by ID
exports.getScholarshipById = async (req, res) => {
  try {
    const scholarship = await Scholarship.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate({
        path: 'applications',
        populate: { path: 'student', select: 'name email gpa major yearOfStudy' }
      });

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

    // Get total funds raised from donations (if Donation model exists)
    let fundsRaised = 0;
    try {
      const Donation = require('../models/Donation');
      const donations = await Donation.aggregate([
        { $match: { scholarship: scholarship._id } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      fundsRaised = donations[0]?.total || 0;
    } catch (donationErr) {
      console.warn('Error fetching donations:', donationErr);
    }

    // Check if current user has applied (if student)
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
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching scholarship', 
      error: process.env.NODE_ENV === 'development' ? error.message : {} 
    });
  }
};

// Update scholarship (admin)
exports.updateScholarship = async (req, res) => {
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

    let scholarship = await Scholarship.findById(req.params.id);

    if (!scholarship) {
      return res.status(404).json({ 
        success: false,
        message: 'Scholarship not found' 
      });
    }

    // Authorization check
    if (scholarship.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this scholarship'
      });
    }

    // Update fields if provided
    if (name) scholarship.name = name;
    if (description) scholarship.description = description;
    if (amount) scholarship.amount = Number(amount);
    if (totalFunds) {
      scholarship.totalFunds = Number(totalFunds);
      scholarship.availableFunds = Number(totalFunds); // Reset available if total changes
    }
    if (deadline) scholarship.deadline = new Date(deadline);
    if (status) scholarship.status = status;

    // Update eligibility and requirements if provided
    if (eligibility) {
      try {
        scholarship.eligibility = typeof eligibility === 'string' ? JSON.parse(eligibility) : eligibility;
      } catch (err) {
        return res.status(400).json({
          success: false,
          message: 'Invalid format for eligibility'
        });
      }
    }

    if (requirements) {
      try {
        scholarship.requirements = typeof requirements === 'string' ? JSON.parse(requirements) : requirements;
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
      message: 'Scholarship updated successfully', 
      data: scholarship 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false,
      message: 'Error updating scholarship', 
      error: process.env.NODE_ENV === 'development' ? error.message : {} 
    });
  }
};

// Delete scholarship (admin)
exports.deleteScholarship = async (req, res) => {
  try {
    const scholarship = await Scholarship.findById(req.params.id);

    if (!scholarship) {
      return res.status(404).json({ 
        success: false,
        message: 'Scholarship not found' 
      });
    }

    // Authorization check
    if (scholarship.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this scholarship'
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

    await scholarship.remove();

    res.json({ 
      success: true,
      message: 'Scholarship deleted successfully' 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false,
      message: 'Error deleting scholarship', 
      error: process.env.NODE_ENV === 'development' ? error.message : {} 
    });
  }
};
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const Student = require('../models/Student');
const { uploadMultiple, getFileUrl } = require('../middleware/fileUpload');
const mongoose = require('mongoose');

// @desc    Get or create student profile
// @route   GET /api/students/profile
// @access  Private (Student)
router.get('/profile', protect, authorize('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ user: req.user.id });
    
    if (!student) {
      return res.json({
        success: true,
        data: null,
        message: 'Profile not found. Please complete your profile.'
      });
    }

    res.json({
      success: true,
      data: student,
      isProfileComplete: student.isProfileComplete,
      profileCompletionPercentage: student.profileCompletionPercentage
    });
  } catch (error) {
    console.error('Error fetching student profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch student profile',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Create or update student profile
// @route   PUT /api/students/profile
// @access  Private (Student)
router.put('/profile', protect, authorize('student'), async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      dateOfBirth,
      address,
      college,
      course,
      department,
      year,
      cgpa,
      percentage,
      familyIncome,
      casteCategory,
      bankDetails
    } = req.body;

    // Find existing student or create new one
    let student = await Student.findOne({ user: req.user.id }).session(session);
    
    // Prepare address data - handle both pincode and zipCode
    const addressData = address || {};
    if (addressData.pincode && !addressData.zipCode) {
      addressData.zipCode = addressData.pincode; // For backward compatibility
    }
    
    if (!student) {
      student = new Student({
        user: req.user.id,
        firstName,
        lastName,
        email,
        phone,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        address: addressData,
        college,
        course,
        department,
        year,
        cgpa: cgpa || null,
        percentage: percentage || null,
        familyIncome,
        casteCategory,
        bankDetails: bankDetails || {}
      });
    } else {
      // Update existing profile
      student.firstName = firstName || student.firstName;
      student.lastName = lastName || student.lastName;
      student.email = email || student.email;
      student.phone = phone || student.phone;
      student.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : student.dateOfBirth;
      student.address = { ...student.address, ...addressData };
      student.college = college || student.college;
      student.course = course || student.course;
      student.department = department || student.department;
      student.year = year || student.year;
      student.cgpa = cgpa !== undefined ? cgpa : student.cgpa;
      student.percentage = percentage !== undefined ? percentage : student.percentage;
      student.familyIncome = familyIncome || student.familyIncome;
      student.casteCategory = casteCategory || student.casteCategory;
      student.bankDetails = { ...student.bankDetails, ...(bankDetails || {}) };
    }

    await student.save({ session });
    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      data: student,
      message: 'Profile updated successfully',
      isProfileComplete: student.isProfileComplete,
      profileCompletionPercentage: student.profileCompletionPercentage
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error updating student profile:', error);
    
    // Handle specific validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to update student profile',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Get student profile by ID (for reviewers/admins)
// @route   GET /api/students/:id
// @access  Private (Reviewer, Admin)
router.get('/:id', protect, authorize('reviewer', 'admin'), async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('user', 'name email')
      .populate('applications', 'status scholarship');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    res.json({
      success: true,
      data: student
    });
  } catch (error) {
    console.error('Error fetching student:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch student',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Get all students (for admin)
// @route   GET /api/students
// @access  Private (Admin)
router.get('/', protect, authorize('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 10, search, isProfileComplete } = req.query;
    
    const query = {};
    
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { college: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (isProfileComplete !== undefined) {
      query.isProfileComplete = isProfileComplete === 'true';
    }

    const students = await Student.find(query)
      .populate('user', 'name email role')
      .populate('applications', 'status')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Student.countDocuments(query);

    res.json({
      success: true,
      data: students,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch students',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Get student statistics
// @route   GET /api/students/stats/overview
// @access  Private (Admin)
router.get('/stats/overview', protect, authorize('admin'), async (req, res) => {
  try {
    const totalStudents = await Student.countDocuments();
    const completedProfiles = await Student.countDocuments({ isProfileComplete: true });
    const pendingProfiles = totalStudents - completedProfiles;

    const applicationsStats = await Student.aggregate([
      {
        $lookup: {
          from: 'applications',
          localField: 'applications',
          foreignField: '_id',
          as: 'applicationDetails'
        }
      },
      {
        $unwind: { path: '$applicationDetails', preserveNullAndEmptyArrays: true }
      },
      {
        $group: {
          _id: '$applicationDetails.status',
          count: { $sum: 1 }
        }
      }
    ]);

    const stats = {
      totalStudents,
      completedProfiles,
      pendingProfiles,
      completionRate: totalStudents > 0 ? Math.round((completedProfiles / totalStudents) * 100) : 0,
      applicationsStats
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching student stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch student statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Upload documents for student profile
// @route   POST /api/students/profile/documents
// @access  Private (Student)
router.post('/profile/documents', 
  protect, 
  authorize('student'),
  uploadMultiple('documents'),
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No files uploaded'
        });
      }

      const student = await Student.findOne({ user: req.user.id });
      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Student profile not found'
        });
      }

      const newDocuments = req.files.map(file => ({
        name: file.originalname,
        fileType: file.mimetype,
        fileUrl: getFileUrl(file.filename)
      }));

      student.documents.push(...newDocuments);
      await student.save();

      res.json({
        success: true,
        message: 'Documents uploaded successfully',
        data: student.documents
      });
    } catch (error) {
      console.error('Error uploading documents:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to upload documents',
        error: process.env.NODE_ENV === 'development' ? error.message : {}
      });
    }
  }
);

// @desc    Get student notifications
// @route   GET /api/students/notifications
// @access  Private (Student)
router.get('/notifications', protect, authorize('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }

    const unreadCount = student.notifications.filter(n => !n.read).length;

    res.json({
      success: true,
      data: student.notifications,
      unreadCount
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Mark notifications as read
// @route   PUT /api/students/notifications/read
// @access  Private (Student)
router.put('/notifications/read', protect, authorize('student'), async (req, res) => {
  try {
    const { notificationIds } = req.body;
    
    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }

    if (notificationIds && notificationIds.length > 0) {
      // Mark specific notifications as read
      student.notifications.forEach(notification => {
        if (notificationIds.includes(notification._id.toString())) {
          notification.read = true;
        }
      });
    } else {
      // Mark all notifications as read
      student.notifications.forEach(notification => {
        notification.read = true;
      });
    }

    await student.save();

    res.json({
      success: true,
      message: 'Notifications marked as read'
    });
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notifications as read',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Get student's notifications
// @route   GET /api/students/notifications
// @access  Private (Student)
router.get('/notifications', protect, authorize('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ user: req.user.id });
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found'
      });
    }

    // Return notifications from the student model
    res.json({
      success: true,
      data: student.notifications || [],
      count: student.notifications?.length || 0
    });
  } catch (error) {
    console.error('Error fetching student notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Get donation history for scholarships student applied to
// @route   GET /api/students/donation-history
// @access  Private (Student)
router.get('/donation-history', protect, authorize('student'), async (req, res) => {
  try {
    const Application = require('../models/Application');
    const Donation = require('../models/Donation');
    
    // Get all applications by this student
    const applications = await Application.find({ student: req.user.id })
      .select('scholarship')
      .lean();
    
    if (!applications || applications.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: 'No applications found'
      });
    }
    
    // Get unique scholarship IDs
    const scholarshipIds = [...new Set(applications.map(app => app.scholarship))];
    
    // Get donations for these scholarships
    const donations = await Donation.find({
      scholarship: { $in: scholarshipIds },
      paymentStatus: 'completed'
    })
      .populate('scholarship', 'name description amount')
      .populate('donor', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    
    // Calculate total donations per scholarship
    const donationsByScholarship = {};
    donations.forEach(donation => {
      const scholarshipId = donation.scholarship._id.toString();
      if (!donationsByScholarship[scholarshipId]) {
        donationsByScholarship[scholarshipId] = {
          scholarshipId: scholarshipId,
          scholarshipName: donation.scholarship.name,
          scholarshipDescription: donation.scholarship.description,
          totalAmount: 0,
          donationCount: 0,
          donorCount: 0,
          uniqueDonors: new Set(),
          donations: []
        };
      }
      donationsByScholarship[scholarshipId].totalAmount += donation.amount;
      donationsByScholarship[scholarshipId].donationCount += 1;
      
      // Track unique donors
      if (donation.donor && donation.donor._id) {
        donationsByScholarship[scholarshipId].uniqueDonors.add(donation.donor._id.toString());
      }
      
      donationsByScholarship[scholarshipId].donations.push({
        amount: donation.amount,
        donorName: donation.isAnonymous ? 'Anonymous' : donation.donor?.name,
        isAnonymous: donation.isAnonymous,
        date: donation.date,
        transactionId: donation.transactionId
      });
    });
    
    // Convert Set to count and remove the Set object
    const result = Object.values(donationsByScholarship).map(item => {
      const donorCount = item.uniqueDonors.size;
      delete item.uniqueDonors;
      return {
        ...item,
        donorCount
      };
    });
    
    res.json({
      success: true,
      data: result,
      totalDonations: donations.reduce((sum, d) => sum + d.amount, 0)
    });
  } catch (error) {
    console.error('Error fetching donation history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch donation history',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

module.exports = router;
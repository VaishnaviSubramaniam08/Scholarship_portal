const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const Application = require('../models/Application');
const { uploadMultiple, getFileUrl } = require('../middleware/fileUpload');
const path = require('path');
const mongoose = require('mongoose');

// @desc    Get applications by scholarship IDs
// @route   GET /api/applications
// @access  Private
router.get('/', protect, authorize('admin', 'donor'), async (req, res) => {
  try {
    const { scholarships } = req.query;
    let query = {};

    if (scholarships) {
      const scholarshipIds = scholarships.split(',').map(id => id.trim());
      // Validate ObjectId format
      if (scholarshipIds.some(id => !mongoose.Types.ObjectId.isValid(id))) {
        return res.status(400).json({
          success: false,
          message: 'Invalid scholarship ID format'
        });
      }
      query.scholarship = { $in: scholarshipIds };
    }

    // For donors, only show applications for scholarships they've donated to
    if (req.user.role === 'donor') {
      const Donation = require('../models/Donation');
      const donations = await Donation.find({ donor: req.user.id }).distinct('scholarship');
      query.scholarship = { $in: donations };
    }

    const applications = await Application.find(query)
      .populate('student', 'name email')
      .populate('scholarship', 'name amount deadline');

    res.json({
      success: true,
      count: applications.length,
      data: applications
    });
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Create a new application
// @route   POST /api/applications
// @access  Private (Student)
router.post('/', 
  protect, 
  authorize('student'),
  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const { scholarshipId, gpa, essay, additionalInfo, major, yearOfStudy } = req.body;
      
      // Basic validation
      if (!scholarshipId || !essay) {
        return res.status(400).json({
          success: false,
          message: 'Please provide scholarshipId and essay'
        });
      }

      // Get student profile
      const Student = require('../models/Student');
      const student = await Student.findOne({ user: req.user.id }).session(session);
      
      if (!student) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: 'Student profile not found. Please complete your profile first.'
        });
      }

      if (!student.isProfileComplete) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Please complete your profile before applying for scholarships.'
        });
      }

      // Check if scholarship exists and is active
      const Scholarship = require('../models/Scholarship');
      const scholarship = await Scholarship.findOne({
        _id: scholarshipId,
        status: 'active',
        deadline: { $gt: Date.now() }
      }).session(session);

      if (!scholarship) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Scholarship not found, inactive, or deadline has passed'
        });
      }

      // Check if student has already applied
      const existingApplication = await Application.findOne({
        student: student._id,
        scholarship: scholarshipId
      }).session(session);

      if (existingApplication) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'You have already applied to this scholarship'
        });
      }

      // Create new application
      const application = new Application({
        student: student._id,
        scholarship: scholarshipId,
        gpa: gpa || student.cgpa,
        major: major || student.course,
        yearOfStudy: yearOfStudy || mapYearToStudyLevel(student.year),
        essay: essay,
        additionalInfo: additionalInfo || '',
        documents: student.documents || [],
        status: 'submitted',
        submittedAt: new Date()
      });

      await application.save({ session });

      // Update student applications array
      student.applications.push(application._id);
      await student.save({ session });

      // Update scholarship applications array
      scholarship.applications.push(application._id);
      await scholarship.save({ session });

      // Add notification to student
      student.addNotification(
        'Application Submitted',
        `Your application for ${scholarship.name} has been submitted successfully.`,
        'success'
      );
      await student.save({ session });

      // Send email notification for successful submission
      try {
        const notificationService = require('../services/notificationService');
        await notificationService.sendApplicationStatusNotification(
          student, 
          populatedApp, 
          'submitted'
        );
      } catch (emailError) {
        console.error('Failed to send email notification:', emailError);
        // Don't fail the entire operation if email fails
      }

      // Send WebSocket notification
      try {
        const websocketService = require('../services/websocketService');
        websocketService.notifyNewApplication(populatedApp);
      } catch (wsError) {
        console.error('Failed to send WebSocket notification:', wsError);
        // Don't fail the entire operation if WebSocket fails
      }

      await session.commitTransaction();
      session.endSession();

      // Populate the response with scholarship and student details
      const populatedApp = await Application.findById(application._id)
        .populate('scholarship', 'name amount deadline description')
        .populate('student', 'firstName lastName email college course');

      res.status(201).json({
        success: true,
        message: 'Application submitted successfully',
        data: populatedApp
      });

    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      
      console.error('Error creating application:', err);
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? err.message : {}
      });
    }
  }
);

// Helper function to map year to study level
function mapYearToStudyLevel(year) {
  const mapping = {
    '1st Year': 'Freshman',
    '2nd Year': 'Sophomore',
    '3rd Year': 'Junior',
    '4th Year': 'Senior',
    '5th Year': 'Graduate'
  };
  return mapping[year] || 'Freshman';
}

// @desc    Get applications for the logged-in student
// @route   GET /api/applications/my
// @access  Private (Student)
router.get('/my', protect, authorize('student'), async (req, res) => {
  try {
    console.log('Fetching applications for student:', req.user.id);
    
    // Get student profile first
    const Student = require('../models/Student');
    const student = await Student.findOne({ user: req.user.id });
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found. Please complete your profile first.'
      });
    }

    // Find applications using student ID
    const applications = await Application.find({ student: student._id })
      .populate({
        path: 'scholarship',
        select: 'name amount deadline status description requirements eligibility'
      })
      .populate('reviewedBy', 'name email')
      .populate('decidedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    // Add additional metadata to each application
    const enhancedApplications = applications.map(app => ({
      ...app,
      isEligible: true, // You can add eligibility check logic here
      daysRemaining: app.scholarship?.deadline 
        ? Math.ceil((new Date(app.scholarship.deadline) - new Date()) / (1000 * 60 * 60 * 24))
        : null,
      statusColor: getStatusColor(app.status)
    }));

    console.log(`Found ${enhancedApplications.length} applications for student ${req.user.id}`);
    
    res.json({
      success: true,
      count: enhancedApplications.length,
      data: enhancedApplications
    });
  } catch (err) {
    console.error('Error in /api/applications/my:', {
      error: err.message,
      stack: err.stack,
      user: req.user ? req.user.id : 'No user in request'
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch applications',
      error: process.env.NODE_ENV === 'development' ? {
        message: err.message,
        stack: err.stack
      } : {}
    });
  }
});

// Helper function to get status color
function getStatusColor(status) {
  const colors = {
    'pending': 'bg-yellow-100 text-yellow-800',
    'submitted': 'bg-blue-100 text-blue-800',
    'under_review': 'bg-purple-100 text-purple-800',
    'approved': 'bg-green-100 text-green-800',
    'rejected': 'bg-red-100 text-red-800',
    'shortlisted': 'bg-indigo-100 text-indigo-800'
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

// @desc    Get applications for review (reviewer)
// @route   GET /api/applications/review
// @access  Private (Reviewer, Admin)
router.get('/review', protect, authorize('reviewer', 'admin'), async (req, res) => {
  try {
    console.log(`Reviewer ${req.user.id} fetching applications for review`);
    
    // Get query parameters for filtering
    const { status, scholarship, sortBy = 'submittedAt', sortOrder = 'asc' } = req.query;
    
    // Build the query
    const query = {};
    
    // Filter by status if provided
    if (status) {
      query.status = { $in: status.split(',') };
    } else {
      // Default to showing submitted and under_review applications
      query.status = { $in: ['submitted', 'under_review'] };
    }
    
    // Filter by scholarship if provided
    if (scholarship) {
      query.scholarship = mongoose.Types.ObjectId(scholarship);
    }
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Get applications with detailed population
    const applications = await Application.find(query)
      .select('scholarship student essay additionalInfo gpa major yearOfStudy documents status reviewedBy reviewerNotes submittedAt')
      .populate({
        path: 'scholarship',
        select: 'name amount deadline category description requirements'
      })
      .populate({
        path: 'student',
        select: 'firstName lastName email college course department year cgpa familyIncome casteCategory address'
      })
      .populate('reviewedBy', 'name')
      .sort(sort)
      .lean();
    
    // Filter out applications with deleted scholarships
    const validApplications = applications.filter(app => app.scholarship !== null);
    
    console.log(`Found ${validApplications.length} applications for review`);
    
    res.json({
      success: true,
      count: validApplications.length,
      data: validApplications
    });
  } catch (err) {
    console.error('Error in /api/applications/review:', {
      error: err.message,
      stack: err.stack,
      user: req.user ? req.user.id : 'No user in request',
      query: req.query
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch applications for review',
      error: process.env.NODE_ENV === 'development' ? {
        message: err.message,
        stack: err.stack
      } : {}
    });
  }
});

// @desc    Update application status (reviewer)
// @route   PUT /api/applications/:id/review
// @access  Private (Reviewer, Admin)
router.put('/:id/review', protect, authorize('reviewer', 'admin'), async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { status, reviewerNotes } = req.body;
    const { id } = req.params;
    const reviewerId = req.user.id;
    
    console.log(`Reviewer ${reviewerId} updating application ${id} with status: ${status}`);
    
    // Validate status
    const validStatuses = ['shortlisted', 'approved', 'rejected', 'under_review'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Find the application with necessary population
    const application = await Application.findById(id)
      .populate({
        path: 'student',
        select: 'firstName lastName email user'
      })
      .populate('scholarship', 'name status')
      .session(session);

    if (!application) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Application not found or already processed'
      });
    }

    // Check if scholarship is still active
    if (application.scholarship.status !== 'active') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Cannot process application: Scholarship is no longer active'
      });
    }

    // Prevent status changes from certain states
    const noRevertStatuses = ['approved', 'rejected'];
    if (noRevertStatuses.includes(application.status)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Application has already been ${application.status} and cannot be modified`
      });
    }

    // Update application
    const updateData = {
      status,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      $push: {
        statusHistory: {
          status: status,
          changedBy: reviewerId,
          notes: reviewerNotes,
          changedAt: new Date()
        }
      }
    };

    // Only update reviewerNotes if provided
    if (reviewerNotes) {
      updateData.reviewerNotes = reviewerNotes;
    }

    const updatedApp = await Application.findByIdAndUpdate(
      id,
      updateData,
      { new: true, session }
    )
      .populate({
        path: 'student',
        select: 'firstName lastName email'
      })
      .populate('scholarship', 'name')
      .populate('reviewedBy', 'name');

    // Add notification to student and send email
    const Student = require('../models/Student');
    const student = await Student.findById(updatedApp.student._id).session(session);
    if (student) {
      const statusMessages = {
        'under_review': 'Your application is now under review',
        'shortlisted': 'Congratulations! Your application has been shortlisted',
        'approved': 'Congratulations! Your application has been approved',
        'rejected': 'Your application has been rejected'
      };
      
      student.addNotification(
        `Application ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        `${statusMessages[status]} for ${updatedApp.scholarship.name}. ${reviewerNotes ? 'Note: ' + reviewerNotes : ''}`,
        status === 'approved' || status === 'shortlisted' ? 'success' : 
        status === 'rejected' ? 'error' : 'info'
      );
      await student.save({ session });

      // Send email notification
      try {
        const notificationService = require('../services/notificationService');
        await notificationService.sendApplicationStatusNotification(
          student, 
          updatedApp, 
          status, 
          reviewerNotes
        );
      } catch (emailError) {
        console.error('Failed to send email notification:', emailError);
        // Don't fail the entire operation if email fails
      }

      // Send WebSocket notification
      try {
        const websocketService = require('../services/websocketService');
        websocketService.notifyApplicationStatusUpdate(
          updatedApp, 
          student.user.toString(), 
          status
        );
      } catch (wsError) {
        console.error('Failed to send WebSocket notification:', wsError);
        // Don't fail the entire operation if WebSocket fails
      }
    }

    await session.commitTransaction();
    session.endSession();

    console.log(`Application ${id} status updated to ${status} by reviewer ${reviewerId}`);
    
    res.json({
      success: true,
      message: `Application ${status} successfully`,
      data: updatedApp
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error updating application status:', {
      error: err.message,
      stack: err.stack,
      applicationId: req.params.id,
      reviewer: req.user?.id,
      body: req.body
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to update application status',
      error: process.env.NODE_ENV === 'development' ? {
        message: err.message,
        stack: err.stack
      } : {}
    });
  }
});

// @desc    Approve/Reject application (admin)
// @route   PUT /api/applications/:id/decision
// @access  Private (Admin)
router.put('/:id/decision', protect, authorize('admin'), async (req, res) => {
  try {
    const { decision, adminNotes } = req.body;
    
    if (!decision || !['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid decision (approved or rejected)'
      });
    }

    const application = await Application.findById(req.params.id)
      .populate('student', 'name email')
      .populate('scholarship', 'name amount');

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    // Check if scholarship has enough funds if approved
    if (decision === 'approved') {
      const Scholarship = require('../models/Scholarship');
      const scholarship = await Scholarship.findById(application.scholarship._id);
      
      if (scholarship.fundsRaised + scholarship.amount > scholarship.totalFunds) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient funds in the scholarship'
        });
      }
      
      // Update scholarship funds
      scholarship.fundsRaised += scholarship.amount;
      await scholarship.save();
    }

    // Update application
    application.status = decision === 'approved' ? 'approved' : 'rejected';
    application.adminNotes = adminNotes || application.adminNotes;
    application.decidedBy = req.user.id;
    application.decidedAt = Date.now();

    await application.save();

    // TODO: Send notification to student about decision

    res.json({
      success: true,
      data: application
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

// @desc    Get application by ID
// @route   GET /api/applications/:id
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    // Check if the ID is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid application ID format'
      });
    }

    const application = await Application.findById(req.params.id)
      .populate('scholarship', 'name description amount deadline')
      .populate('student', 'name email gpa institution major')
      .populate('reviewedBy', 'name')
      .populate('decidedBy', 'name');

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    // Check if the user has permission to view this application
    const isOwner = application.student._id.toString() === req.user.id;
    const isReviewer = req.user.role === 'reviewer' || req.user.role === 'admin';
    
    if (!isOwner && !isReviewer) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this application'
      });
    }

    res.json({
      success: true,
      data: application
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

module.exports = router;
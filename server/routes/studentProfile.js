const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { protect, authorize } = require('../middleware/auth');
const StudentProfile = require('../models/StudentProfile');
const { uploadSingle } = require('../middleware/fileUpload');

// @desc    Get or create student profile
// @route   GET /api/students/profile
// @access  Private (Student)
router.get('/profile', protect, authorize('student'), async (req, res) => {
  try {
    const profile = await StudentProfile.findOne({ user: req.user.id });
    
    res.json({
      success: true,
      data: profile || null,
      isProfileComplete: profile?.isProfileComplete || false
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

// @desc    Check if student profile is complete
// @route   GET /api/students/profile/status
// @access  Private (Student)
router.get('/profile/status', protect, authorize('student'), async (req, res) => {
  try {
    const profile = await StudentProfile.findOne({ user: req.user.id });
    
    if (!profile) {
      return res.json({
        success: true,
        isProfileComplete: false,
        message: 'Profile not found'
      });
    }

    res.json({
      success: true,
      isProfileComplete: profile.isProfileComplete || false,
      data: profile
    });
  } catch (error) {
    console.error('Error checking profile status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check profile status',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Update student profile
// @route   PUT /api/students/profile
// @access  Private (Student)
router.put(
  '/profile',
  protect,
  authorize('student'),
  uploadSingle('profilePicture'),
  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const { personalInfo, education, documents } = req.body;

      // Parse JSON strings if they were sent as strings
      const parsedPersonalInfo = typeof personalInfo === 'string' 
        ? JSON.parse(personalInfo) 
        : (personalInfo || {});
      
      const parsedEducation = typeof education === 'string' 
        ? JSON.parse(education) 
        : (education || {});
      
      const parsedDocuments = typeof documents === 'string' 
        ? JSON.parse(documents) 
        : (documents || []);

      // Handle file upload if present
      if (req.file) {
        parsedPersonalInfo.profilePicture = req.file.path;
      }

      // Find existing profile or create a new one
      let profile = await StudentProfile.findOne({ user: req.user.id }).session(session);
      
      if (!profile) {
        profile = new StudentProfile({
          user: req.user.id,
          personalInfo: {},
          education: {},
          documents: []
        });
      }

      // Update the profile fields
      profile.personalInfo = { ...profile.personalInfo, ...parsedPersonalInfo };
      profile.education = { ...profile.education, ...parsedEducation };
      
      // Only update documents if new ones are provided
      if (parsedDocuments.length > 0) {
        profile.documents = [...(profile.documents || []), ...parsedDocuments];
      }

      // Save the profile to trigger the pre-save hook
      await profile.save({ session });

      // Commit the transaction
      await session.commitTransaction();
      session.endSession();

      // Fetch the profile again to get the updated isProfileComplete value
      const updatedProfile = await StudentProfile.findById(profile._id);

      res.json({
        success: true,
        data: updatedProfile,
        isProfileComplete: updatedProfile.isProfileComplete,
        message: 'Profile updated successfully'
      });

    } catch (error) {
      // Abort the transaction in case of error
      await session.abortTransaction();
      session.endSession();
      
      console.error('Error updating student profile:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update student profile',
        error: process.env.NODE_ENV === 'development' ? error.message : {}
      });
    }
  }
);

module.exports = router;

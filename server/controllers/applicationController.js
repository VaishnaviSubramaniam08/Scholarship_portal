const Application = require('../models/Application');
const Scholarship = require('../models/Scholarship');
const Student = require('../models/Student');

// Submit application
exports.submitApplication = async (req, res) => {
  try {
    const { scholarshipId, essay, additionalInfo, gpa, major, yearOfStudy } = req.body;
    const studentId = req.user.profile;

    if (!studentId) {
      return res.status(400).json({ 
        success: false,
        message: 'Student profile not found. Please complete your profile first.' 
      });
    }

    const scholarship = await Scholarship.findById(scholarshipId);
    if (!scholarship) {
      return res.status(404).json({ message: 'Scholarship not found' });
    }

    if (new Date() > scholarship.deadline) {
      return res.status(400).json({ message: 'Application deadline has passed' });
    }

    const existingApplication = await Application.findOne({
      student: studentId,
      scholarship: scholarshipId
    });

    if (existingApplication) {
      return res.status(400).json({ message: 'You have already applied to this scholarship' });
    }

    const application = new Application({
      student: studentId,
      scholarship: scholarshipId,
      essay,
      additionalInfo,
      gpa,
      major,
      yearOfStudy,
      status: 'Submitted',
      submittedAt: new Date()
    });

    await application.save();

    // Update student and scholarship
    await Student.findByIdAndUpdate(studentId, {
      $push: { applications: application._id }
    });

    await Scholarship.findByIdAndUpdate(scholarshipId, {
      $push: { applications: application._id }
    });

    res.status(201).json({ 
      success: true,
      message: 'Application submitted successfully', 
      data: application 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false,
      message: 'Error submitting application', 
      error: error.message 
    });
  }
};

// Get student applications
exports.getStudentApplications = async (req, res) => {
  try {
    const studentId = req.user.profile;
    
    if (!studentId) {
      return res.status(400).json({ 
        success: false,
        message: 'Student profile not found. Please complete your profile first.' 
      });
    }
    
    const applications = await Application.find({ student: studentId })
      .populate('scholarship')
      .sort({ createdAt: -1 });

    res.json({ 
      success: true,
      data: applications 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching applications', 
      error: error.message 
    });
  }
};

// Upload application document
exports.uploadDocument = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const file = req.file; // Assuming multer is used for file upload
    const { name } = req.body;

    const application = await Application.findById(applicationId);
    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Assuming file.url is available from multer or cloud storage
    const url = file ? file.path : req.body.url;

    application.documents.push({
      name: name || file.originalname,
      url,
      uploadedAt: new Date()
    });

    await application.save();
    res.json({ 
      success: true,
      message: 'Document uploaded successfully', 
      data: application 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false,
      message: 'Error uploading document', 
      error: error.message 
    });
  }
};

// Get applications for review (reviewer/admin)
exports.getApplicationsForReview = async (req, res) => {
  try {
    const { status, scholarshipId } = req.query;
    let query = {};

    if (status) query.status = status;
    if (scholarshipId) query.scholarship = scholarshipId;

    const applications = await Application.find(query)
      .populate('student')
      .populate('scholarship')
      .sort({ submittedAt: -1 });

    res.json({ 
      success: true,
      data: applications 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching applications', 
      error: error.message 
    });
  }
};

// Submit review score
exports.submitReview = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { score, comments } = req.body;
    const reviewerId = req.user._id;

    const application = await Application.findById(applicationId);
    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Check if reviewer already reviewed
    const existingReview = application.reviews.find(
      r => r.reviewer.toString() === reviewerId.toString()
    );

    if (existingReview) {
      existingReview.score = score;
      existingReview.comments = comments;
      existingReview.reviewedAt = new Date();
    } else {
      application.reviews.push({
        reviewer: reviewerId,
        score,
        comments,
        reviewedAt: new Date()
      });
    }

    // Calculate average score
    const totalScore = application.reviews.reduce((sum, r) => sum + r.score, 0);
    application.averageScore = totalScore / application.reviews.length;
    application.status = 'Under Review';

    await application.save();
    res.json({ 
      success: true,
      message: 'Review submitted successfully', 
      data: application 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false,
      message: 'Error submitting review', 
      error: error.message 
    });
  }
};

// Update application status (admin)
exports.updateApplicationStatus = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { status, comments } = req.body;

    const application = await Application.findByIdAndUpdate(
      applicationId,
      { 
        status,
        'finalDecision.decision': status,
        'finalDecision.decidedBy': req.user._id,
        'finalDecision.decidedAt': new Date(),
        'finalDecision.comments': comments
      },
      { new: true }
    ).populate('student scholarship');

    if (!application) {
      return res.status(404).json({ 
        success: false,
        message: 'Application not found' 
      });
    }

    res.json({ 
      success: true,
      message: 'Application status updated', 
      data: application 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false,
      message: 'Error updating status', 
      error: error.message 
    });
  }
};
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const applicationController = require('../controllers/applicationController');
const scholarshipController = require('../controllers/scholarshipController');
const donorController = require('../controllers/donorController');

// Student routes
router.post('/applications', protect, authorize('student'), applicationController.submitApplication);
router.get('/applications/my', protect, authorize('student'), applicationController.getStudentApplications);
router.post('/applications/:applicationId/documents', protect, authorize('student'), applicationController.uploadDocument);

// Scholarship routes (public for viewing, admin for managing)
router.get('/scholarships', scholarshipController.getAllScholarships);
router.get('/scholarships/:id', scholarshipController.getScholarshipById);
router.post('/scholarships', protect, authorize('admin'), scholarshipController.createScholarship);
router.put('/scholarships/:id', protect, authorize('admin'), scholarshipController.updateScholarship);
router.delete('/scholarships/:id', protect, authorize('admin'), scholarshipController.deleteScholarship);

// Reviewer routes
router.get('/applications/review', protect, authorize('reviewer', 'admin'), applicationController.getApplicationsForReview);
router.post('/applications/:applicationId/review', protect, authorize('reviewer', 'admin'), applicationController.submitReview);

// Admin routes
router.put('/applications/:applicationId/status', protect, authorize('admin'), applicationController.updateApplicationStatus);

// Donor routes
router.post('/donations', protect, authorize('donor'), donorController.createDonation);
router.get('/donor/profile', protect, authorize('donor'), donorController.getDonorProfile);
router.get('/donor/impact', protect, authorize('donor'), donorController.getImpactReport);

module.exports = router;
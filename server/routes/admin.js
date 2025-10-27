const express = require('express');
const router = express.Router();
const Scholarship = require('../models/Scholarship');
const Application = require('../models/Application');

// GET admin stats
router.get('/stats', async (req, res) => {
  try {
    const totalScholarships = await Scholarship.countDocuments();
    const totalApplications = await Application.countDocuments();
    const totalFunds = await Scholarship.aggregate([{ $group: { _id: null, total: { $sum: '$totalFunds' } } }]);
    const approvedApps = await Application.countDocuments({ status: 'Approved' });
    const approvalRate = totalApplications > 0 ? Math.round((approvedApps / totalApplications) * 100) + '%' : '0%';

    res.json({
      totalScholarships,
      totalApplications,
      totalFunds: totalFunds[0]?.total || 0,
      approvalRate
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
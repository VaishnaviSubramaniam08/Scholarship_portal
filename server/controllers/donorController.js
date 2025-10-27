const Donor = require('../models/Donor');
const Scholarship = require('../models/Scholarship');

// Create donation
exports.createDonation = async (req, res) => {
  try {
    const { amount, scholarshipId, paymentMethod, transactionId } = req.body;
    const donorId = req.user.profile;

    const donor = await Donor.findById(donorId);
    if (!donor) {
      return res.status(404).json({ message: 'Donor not found' });
    }

    const donation = {
      amount,
      date: new Date(),
      scholarship: scholarshipId,
      paymentMethod,
      transactionId
    };

    donor.donations.push(donation);
    donor.totalDonated += amount;
    await donor.save();

    // Update scholarship funds
    if (scholarshipId) {
      await Scholarship.findByIdAndUpdate(scholarshipId, {
        $inc: { 
          totalFunds: amount,
          availableFunds: amount
        }
      });
    }

    res.json({ message: 'Donation successful', donor });
  } catch (error) {
    res.status(500).json({ message: 'Error processing donation', error: error.message });
  }
};

// Get donor profile and donations
exports.getDonorProfile = async (req, res) => {
  try {
    const donorId = req.user.profile;
    const donor = await Donor.findById(donorId)
      .populate('donations.scholarship');

    if (!donor) {
      return res.status(404).json({ message: 'Donor not found' });
    }

    res.json(donor);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching donor profile', error: error.message });
  }
};

// Get impact report
exports.getImpactReport = async (req, res) => {
  try {
    const donorId = req.user.profile;
    const donor = await Donor.findById(donorId);

    if (!donor) {
      return res.status(404).json({ message: 'Donor not found' });
    }

    // Calculate impact metrics
    const totalStudentsSupported = donor.donations.length;
    const impactReport = {
      totalDonated: donor.totalDonated,
      studentsSupported: totalStudentsSupported,
      donations: donor.donations,
      impactReports: donor.impactReports
    };

    res.json(impactReport);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching impact report', error: error.message });
  }
};
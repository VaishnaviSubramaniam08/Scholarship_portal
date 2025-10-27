/**
 * Payment Service
 * Handles multiple payment methods including PayPal, Cards, UPI, etc.
 */

const paypalConfig = require('../config/paypal');

class PaymentService {
  /**
   * Process payment based on payment method
   */
  static async processPayment(paymentData) {
    const { amount, paymentMethod, currency = 'USD', description } = paymentData;

    switch (paymentMethod) {
      case 'PayPal':
        return await this.processPayPalPayment(amount, currency, description);
      
      case 'Credit Card':
      case 'Debit Card':
        return await this.processCardPayment(paymentData);
      
      case 'UPI':
        return await this.processUPIPayment(paymentData);
      
      case 'Net Banking':
        return await this.processNetBankingPayment(paymentData);
      
      default:
        return await this.processDemoPayment(paymentData);
    }
  }

  /**
   * Process PayPal Payment
   */
  static async processPayPalPayment(amount, currency, description) {
    try {
      const order = await paypalConfig.createOrder(amount, currency, description);
      
      return {
        success: true,
        paymentMethod: 'PayPal',
        orderId: order.orderId,
        status: 'pending',
        approvalUrl: order.links.find(link => link.rel === 'approve')?.href,
        message: 'PayPal order created. Please complete payment.'
      };
    } catch (error) {
      console.error('PayPal payment error:', error);
      return {
        success: false,
        paymentMethod: 'PayPal',
        error: error.message
      };
    }
  }

  /**
   * Capture PayPal Payment (after user approval)
   */
  static async capturePayPalPayment(orderId) {
    try {
      const capture = await paypalConfig.captureOrder(orderId);
      
      return {
        success: true,
        paymentMethod: 'PayPal',
        status: 'completed',
        transactionId: capture.transactionId,
        orderId: capture.orderId,
        payerEmail: capture.payerEmail,
        amount: capture.amount,
        message: 'Payment captured successfully'
      };
    } catch (error) {
      console.error('PayPal capture error:', error);
      return {
        success: false,
        paymentMethod: 'PayPal',
        error: error.message
      };
    }
  }

  /**
   * Process Card Payment (Credit/Debit)
   * This is a demo implementation - integrate with Stripe/Razorpay for real processing
   */
  static async processCardPayment(paymentData) {
    const { amount, cardNumber, cardExpiry, cardCVV, cardHolder } = paymentData;

    // Demo validation
    if (!cardNumber || !cardExpiry || !cardCVV) {
      return {
        success: false,
        paymentMethod: paymentData.paymentMethod,
        error: 'Card details required'
      };
    }

    // Simulate payment processing delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Demo: Accept all cards except those starting with '0000'
    if (cardNumber.startsWith('0000')) {
      return {
        success: false,
        paymentMethod: paymentData.paymentMethod,
        status: 'failed',
        error: 'Card declined'
      };
    }

    // Generate demo transaction ID
    const transactionId = `CARD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    return {
      success: true,
      paymentMethod: paymentData.paymentMethod,
      status: 'completed',
      transactionId,
      message: 'Card payment processed successfully',
      cardLast4: cardNumber.slice(-4)
    };
  }

  /**
   * Process UPI Payment
   * This is a demo implementation - integrate with Razorpay/PhonePe for real processing
   */
  static async processUPIPayment(paymentData) {
    const { amount, upiId } = paymentData;

    if (!upiId) {
      return {
        success: false,
        paymentMethod: 'UPI',
        error: 'UPI ID required'
      };
    }

    // Validate UPI ID format (basic)
    const upiRegex = /^[\w.-]+@[\w.-]+$/;
    if (!upiRegex.test(upiId)) {
      return {
        success: false,
        paymentMethod: 'UPI',
        error: 'Invalid UPI ID format'
      };
    }

    // Simulate payment processing
    await new Promise(resolve => setTimeout(resolve, 1500));

    const transactionId = `UPI-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    return {
      success: true,
      paymentMethod: 'UPI',
      status: 'completed',
      transactionId,
      upiId,
      message: 'UPI payment processed successfully'
    };
  }

  /**
   * Process Net Banking Payment
   * This is a demo implementation
   */
  static async processNetBankingPayment(paymentData) {
    const { amount, bankName, accountNumber } = paymentData;

    if (!bankName) {
      return {
        success: false,
        paymentMethod: 'Net Banking',
        error: 'Bank name required'
      };
    }

    // Simulate payment processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    const transactionId = `NB-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    return {
      success: true,
      paymentMethod: 'Net Banking',
      status: 'completed',
      transactionId,
      bankName,
      message: 'Net Banking payment processed successfully'
    };
  }

  /**
   * Process Demo/Other Payment
   */
  static async processDemoPayment(paymentData) {
    const { amount, paymentMethod } = paymentData;

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    const transactionId = `DEMO-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    return {
      success: true,
      paymentMethod: paymentMethod || 'Other',
      status: 'completed',
      transactionId,
      message: 'Demo payment processed successfully'
    };
  }

  /**
   * Refund Payment
   */
  static async refundPayment(transactionId, amount, paymentMethod) {
    if (paymentMethod === 'PayPal' && transactionId.startsWith('PAYPAL-')) {
      try {
        const refund = await paypalConfig.refundPayment(transactionId, amount);
        return {
          success: true,
          refundId: refund.refundId,
          status: refund.status,
          message: 'Refund processed successfully'
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    }

    // Demo refund for other payment methods
    const refundId = `REFUND-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    
    return {
      success: true,
      refundId,
      status: 'completed',
      message: 'Refund processed successfully (Demo)'
    };
  }

  /**
   * Verify Payment Status
   */
  static async verifyPayment(transactionId, paymentMethod) {
    if (paymentMethod === 'PayPal') {
      try {
        const order = await paypalConfig.getOrderDetails(transactionId);
        return {
          success: true,
          status: order.order.status,
          details: order.order
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    }

    // Demo verification for other methods
    return {
      success: true,
      status: 'completed',
      message: 'Payment verified (Demo)'
    };
  }
}

module.exports = PaymentService;
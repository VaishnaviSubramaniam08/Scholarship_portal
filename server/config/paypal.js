/**
 * PayPal Configuration
 * Supports both Sandbox (testing) and Production modes
 */

const paypal = require('@paypal/paypal-server-sdk');

// Determine environment based on NODE_ENV
const environment = process.env.NODE_ENV === 'production' ? 'production' : 'sandbox';

// PayPal Client Configuration
const getPayPalClient = () => {
  const clientId = environment === 'production' 
    ? process.env.PAYPAL_CLIENT_ID 
    : process.env.PAYPAL_SANDBOX_CLIENT_ID;
    
  const clientSecret = environment === 'production'
    ? process.env.PAYPAL_CLIENT_SECRET
    : process.env.PAYPAL_SANDBOX_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn(`PayPal credentials not configured for ${environment} environment`);
    return null;
  }

  // Create PayPal client
  const client = new paypal.core.PayPalHttpClient(
    environment === 'production'
      ? new paypal.core.LiveEnvironment(clientId, clientSecret)
      : new paypal.core.SandboxEnvironment(clientId, clientSecret)
  );

  return client;
};

// Create Order
const createOrder = async (amount, currency = 'USD', description = 'Scholarship Donation') => {
  const client = getPayPalClient();
  
  if (!client) {
    throw new Error('PayPal client not configured');
  }

  const request = new paypal.orders.OrdersCreateRequest();
  request.prefer("return=representation");
  request.requestBody({
    intent: 'CAPTURE',
    purchase_units: [{
      amount: {
        currency_code: currency,
        value: amount.toFixed(2)
      },
      description: description
    }],
    application_context: {
      brand_name: 'ScholarMatch',
      landing_page: 'NO_PREFERENCE',
      user_action: 'PAY_NOW',
      return_url: `${process.env.CLIENT_URL}/donation/success`,
      cancel_url: `${process.env.CLIENT_URL}/donation/cancel`
    }
  });

  try {
    const order = await client.execute(request);
    return {
      success: true,
      orderId: order.result.id,
      status: order.result.status,
      links: order.result.links
    };
  } catch (error) {
    console.error('PayPal Create Order Error:', error);
    throw new Error('Failed to create PayPal order');
  }
};

// Capture Order (Complete Payment)
const captureOrder = async (orderId) => {
  const client = getPayPalClient();
  
  if (!client) {
    throw new Error('PayPal client not configured');
  }

  const request = new paypal.orders.OrdersCaptureRequest(orderId);
  request.requestBody({});

  try {
    const capture = await client.execute(request);
    return {
      success: true,
      orderId: capture.result.id,
      status: capture.result.status,
      payerId: capture.result.payer?.payer_id,
      payerEmail: capture.result.payer?.email_address,
      amount: capture.result.purchase_units[0]?.payments?.captures[0]?.amount,
      transactionId: capture.result.purchase_units[0]?.payments?.captures[0]?.id
    };
  } catch (error) {
    console.error('PayPal Capture Order Error:', error);
    throw new Error('Failed to capture PayPal payment');
  }
};

// Get Order Details
const getOrderDetails = async (orderId) => {
  const client = getPayPalClient();
  
  if (!client) {
    throw new Error('PayPal client not configured');
  }

  const request = new paypal.orders.OrdersGetRequest(orderId);

  try {
    const order = await client.execute(request);
    return {
      success: true,
      order: order.result
    };
  } catch (error) {
    console.error('PayPal Get Order Error:', error);
    throw new Error('Failed to get PayPal order details');
  }
};

// Refund Payment
const refundPayment = async (captureId, amount = null, currency = 'USD') => {
  const client = getPayPalClient();
  
  if (!client) {
    throw new Error('PayPal client not configured');
  }

  const request = new paypal.payments.CapturesRefundRequest(captureId);
  
  if (amount) {
    request.requestBody({
      amount: {
        currency_code: currency,
        value: amount.toFixed(2)
      }
    });
  }

  try {
    const refund = await client.execute(request);
    return {
      success: true,
      refundId: refund.result.id,
      status: refund.result.status,
      amount: refund.result.amount
    };
  } catch (error) {
    console.error('PayPal Refund Error:', error);
    throw new Error('Failed to process PayPal refund');
  }
};

module.exports = {
  getPayPalClient,
  createOrder,
  captureOrder,
  getOrderDetails,
  refundPayment,
  environment
};
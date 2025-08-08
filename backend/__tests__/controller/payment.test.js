const request = require('supertest');
const express = require('express');
const paymentRoutes = require('../../controller/payment');

// Mock stripe
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: jest.fn().mockImplementation((options) => {
        return Promise.resolve({
          id: 'test-payment-intent-id',
          amount: options.amount,
          currency: options.currency,
          client_secret: 'test-client-secret-123',
          metadata: options.metadata
        });
      })
    }
  }));
});

// Mock ErrorHandler
jest.mock('../../utils/ErrorHandler', () => {
  return class ErrorHandler extends Error {
    constructor(message, statusCode) {
      super(message);
      this.statusCode = statusCode;
    }
  };
});

// Mock environment variables
process.env.STRIPE_API_KEY = 'test-stripe-api-key';
process.env.STRIPE_SECRET_KEY = 'test-stripe-secret-key';

// Setup test app
const app = express();
app.use(express.json());
app.use('/api/payment', paymentRoutes);

describe('Payment Controller Tests', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('Process Payment Tests', () => {
    // Test case 1: Successfully process a payment
    it('should create a payment intent and return client secret', async () => {
      // Setup - Payment data
      const paymentData = {
        amount: 1000, // Amount in smallest currency unit (e.g., cents)
      };

      // Act - Send request to process payment
      const response = await request(app)
        .post('/api/payment/process')
        .send(paymentData);

      // Assert - Check response
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.client_secret).toBe('test-client-secret-123');
      
      // Verify stripe was called with correct parameters
      const stripeInstance = require('stripe')();
      expect(stripeInstance.paymentIntents.create).toHaveBeenCalledWith({
        amount: 1000,
        currency: 'inr',
        metadata: {
          company: 'Becodemy',
        },
      });

      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. Client secret returned from Stripe
      // 3. Stripe called with correct parameters
    });

    // Test case 2: Process payment with zero amount
    it('should handle payment with zero amount', async () => {
      // Setup - Payment data with zero amount
      const paymentData = {
        amount: 0,
      };

      // Act - Send request to process payment
      const response = await request(app)
        .post('/api/payment/process')
        .send(paymentData);

      // Assert - Check response
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Verify stripe was called with zero amount
      const stripeInstance = require('stripe')();
      expect(stripeInstance.paymentIntents.create).toHaveBeenCalledWith({
        amount: 0,
        currency: 'inr',
        metadata: {
          company: 'Becodemy',
        },
      });

      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. Client secret returned from Stripe
      // 3. Stripe called with zero amount
    });

    // Test case 3: Process payment with very large amount
    it('should handle payment with very large amount', async () => {
      // Setup - Payment data with large amount
      const paymentData = {
        amount: 9999999999,
      };

      // Act - Send request to process payment
      const response = await request(app)
        .post('/api/payment/process')
        .send(paymentData);

      // Assert - Check response
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Verify stripe was called with large amount
      const stripeInstance = require('stripe')();
      expect(stripeInstance.paymentIntents.create).toHaveBeenCalledWith({
        amount: 9999999999,
        currency: 'inr',
        metadata: {
          company: 'Becodemy',
        },
      });

      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. Client secret returned from Stripe
      // 3. Stripe called with very large amount
    });

    // Test case 4: Process payment with missing amount
    it('should handle payment with missing amount field', async () => {
      // Setup - Payment data without amount
      const paymentData = {};

      // Act - Send request to process payment
      const response = await request(app)
        .post('/api/payment/process')
        .send(paymentData);

      // Assert - Check response
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Verify stripe was called with undefined amount
      const stripeInstance = require('stripe')();
      expect(stripeInstance.paymentIntents.create).toHaveBeenCalledWith({
        amount: undefined,
        currency: 'inr',
        metadata: {
          company: 'Becodemy',
        },
      });

      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. Client secret returned from Stripe
      // 3. Stripe called with undefined amount
    });

    // Test case 5: Handle Stripe API errors
    it('should handle Stripe API errors', async () => {
      // Mock Stripe to throw an error
      const stripeInstance = require('stripe')();
      stripeInstance.paymentIntents.create.mockImplementationOnce(() => {
        throw new Error('Stripe API error');
      });

      // Setup - Payment data
      const paymentData = {
        amount: 1000,
      };

      // Act - Send request to process payment
      const response = await request(app)
        .post('/api/payment/process')
        .send(paymentData);

      // Assert - Check response
      expect(response.statusCode).toBe(500); // Error status
      expect(response.body.success).toBe(undefined);

      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. Error message from Stripe
    });
  });

  describe('Get Stripe API Key Tests', () => {
    // Test case 1: Successfully get Stripe API key
    it('should return the Stripe API key', async () => {
      // Act - Send request to get API key
      const response = await request(app)
        .get('/api/payment/stripeapikey');

      // Assert - Check response
      expect(response.statusCode).toBe(200);
      expect(response.body.stripeApikey).toBe('test-stripe-api-key');

      // Expected output:
      // 1. HTTP 200 response
      // 2. Stripe API key from environment variable
    });

    // Test case 2: Test when API key is not set
    it('should handle missing Stripe API key', async () => {
      // Temporarily remove API key
      const originalApiKey = process.env.STRIPE_API_KEY;
      delete process.env.STRIPE_API_KEY;

      // Act - Send request to get API key
      const response = await request(app)
        .get('/api/payment/stripeapikey');

      // Assert - Check response
      expect(response.statusCode).toBe(200);
      expect(response.body.stripeApikey).toBeUndefined();

      // Restore API key
      process.env.STRIPE_API_KEY = originalApiKey;

      // Expected output:
      // 1. HTTP 200 response
      // 2. undefined stripeApikey value
    });
  });

  describe('Error Handling Tests', () => {
    // Test case 1: Test handling of synchronous errors in route handlers
    it('should handle synchronous errors in route handlers', async () => {
      // Mock express response to throw error
      const originalJson = express.response.json;
      express.response.json = jest.fn().mockImplementationOnce(() => {
        throw new Error('Synchronous error');
      });

      // Act - Send request
      const response = await request(app)
        .get('/api/payment/stripeapikey');

      // Assert - Check response
      expect(response.statusCode).toBe(500);

      // Restore original method
      express.response.json = originalJson;

      // Expected output:
      // 1. HTTP 500 response with error message
    });

    // Test case 2: Test handling network errors
    it('should handle network errors', async () => {
      // Mock stripe to simulate network timeout
      const stripeInstance = require('stripe')();
      stripeInstance.paymentIntents.create.mockImplementationOnce(() => {
        return new Promise((_, reject) => {
          const error = new Error('Network error');
          error.code = 'ETIMEDOUT';
          reject(error);
        });
      });

      // Setup - Payment data
      const paymentData = {
        amount: 1000,
      };

      // Act - Send request to process payment
      const response = await request(app)
        .post('/api/payment/process')
        .send(paymentData);

      // Assert - Check response
      expect(response.statusCode).toBe(500);

      // Expected output:
      // 1. HTTP 500 response with error message
    });
  });
});
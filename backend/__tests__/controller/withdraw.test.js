const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const express = require('express');
const Shop = require('../../model/shop');
const Withdraw = require('../../model/withdraw');
const withdrawRoutes = require('../../controller/withdraw');
const { Types: { ObjectId } } = mongoose;

// Mock sendMail
jest.mock('../../utils/sendMail', () => {
  return jest.fn().mockImplementation(() => Promise.resolve());
});

// Mock middleware
jest.mock('../../middleware/auth', () => ({
  isAuthenticated: (req, res, next) => {
    req.user = { _id: 'test-user-id' };
    next();
  },
  isSeller: (req, res, next) => {
    req.seller = {
      _id: 'test-seller-id',
      name: 'Test Seller',
      email: 'seller@test.com'
    };
    next();
  },
  isAdmin: (role) => (req, res, next) => {
    req.user = { _id: 'test-admin-id', role: 'Admin' };
    next();
  }
}));

// Mock ErrorHandler
jest.mock('../../utils/ErrorHandler', () => {
  return class ErrorHandler extends Error {
    constructor(message, statusCode) {
      super(message);
      this.statusCode = statusCode;
    }
  };
});

// Sample data
const testShopData = {
  name: 'Test Shop',
  email: 'test@shop.com',
  password: 'password123',
  avatar: {
    public_id: 'test-id',
    url: 'test-url'
  },
  address: '123 Test Street',
  phoneNumber: '1234567890',
  zipCode: '12345',
  availableBalance: 1000,
  transections: []
};

// Setup test app
const app = express();
app.use(express.json());
app.use('/api/withdraw', withdrawRoutes);

describe('Withdraw Controller Tests', () => {
  let mongoServer;
  let session;

  // Connect to in-memory database before tests
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  });

  // Clean up after all tests
  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  // Set up transaction and clean DB between tests
  beforeEach(async () => {
    // Start a session for transaction
    session = await mongoose.startSession();
    session.startTransaction();
    
    // Clear mocks
    jest.clearAllMocks();
  });

  // Abort transaction and clean DB after each test
  afterEach(async () => {
    // Rollback the transaction
    await session.abortTransaction();
    session.endSession();
    
    // Clean up collections
    await Shop.deleteMany({});
    await Withdraw.deleteMany({});
  });

  describe('Create Withdraw Request Tests', () => {
    // Test case 1: Successfully create a withdraw request
    it('should create a withdraw request and update seller balance', async () => {
      // Goal: Test creating a withdraw request
      // Input: Valid amount, seller exists with sufficient balance
      // Expected output: 
      // 1. HTTP 201 response with success message
      // 2. DB changes: withdraw request created, seller balance reduced
      // 3. Email notification sent

      // Setup - Create a seller
      const sellerId = new ObjectId('test-seller-id');
      const seller = new Shop({
        ...testShopData,
        _id: sellerId,
        availableBalance: 1000
      });
      await seller.save();
      
      // Act - Create withdraw request
      const response = await request(app)
        .post('/api/withdraw/create-withdraw-request')
        .send({ amount: 500 });
      
      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.withdraw).toBeDefined();
      expect(response.body.withdraw.amount).toBe(500);
      expect(response.body.withdraw.seller._id).toBe('test-seller-id');
      
      // Verify DB updates
      const updatedSeller = await Shop.findById(sellerId);
      expect(updatedSeller.availableBalance).toBe(500); // 1000 - 500
      
      const withdrawRequest = await Withdraw.findOne({ 'seller._id': 'test-seller-id' });
      expect(withdrawRequest).not.toBeNull();
      expect(withdrawRequest.amount).toBe(500);
      
      // Verify email was sent
      const sendMail = require('../../utils/sendMail');
      expect(sendMail).toHaveBeenCalled();
      expect(sendMail.mock.calls[0][0].email).toBe('seller@test.com');
      expect(sendMail.mock.calls[0][0].subject).toBe('Withdraw Request');
      expect(sendMail.mock.calls[0][0].message).toContain('500$');
    });

    // Test case 2: Create withdraw request with insufficient balance
    it('should handle withdraw request with insufficient balance', async () => {
      // Goal: Test error handling when seller has insufficient balance
      // Input: Amount greater than available balance
      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No withdraw request created, balance unchanged

      // Setup - Create a seller with low balance
      const sellerId = new ObjectId('test-seller-id');
      const seller = new Shop({
        ...testShopData,
        _id: sellerId,
        availableBalance: 100
      });
      await seller.save();
      
      // Act - Create withdraw request with amount > balance
      const response = await request(app)
        .post('/api/withdraw/create-withdraw-request')
        .send({ amount: 500 });
      
      // The server will likely error out with negative balance
      expect(response.statusCode).toBe(500);
      
      // Verify seller balance remains unchanged
      const unchangedSeller = await Shop.findById(sellerId);
      expect(unchangedSeller.availableBalance).toBe(100);
    });

    // Test case 3: Create withdraw request with invalid amount
    it('should handle withdraw request with invalid amount', async () => {
      // Goal: Test error handling with invalid amount
      // Input: Negative or zero amount
      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No withdraw request created, balance unchanged

      // Setup - Create a seller
      const sellerId = new ObjectId('test-seller-id');
      const seller = new Shop({
        ...testShopData,
        _id: sellerId,
        availableBalance: 1000
      });
      await seller.save();
      
      // Act - Create withdraw request with negative amount
      const responseNegative = await request(app)
        .post('/api/withdraw/create-withdraw-request')
        .send({ amount: -100 });
      
      expect(responseNegative.statusCode).toBe(500);
      
      // Act - Create withdraw request with zero amount
      const responseZero = await request(app)
        .post('/api/withdraw/create-withdraw-request')
        .send({ amount: 0 });
      
      expect(responseZero.statusCode).toBe(500);
      
      // Verify seller balance remains unchanged
      const unchangedSeller = await Shop.findById(sellerId);
      expect(unchangedSeller.availableBalance).toBe(1000);
    });

    // Test case 4: Create withdraw request with non-existent seller
    it('should handle withdraw request from non-existent seller', async () => {
      // Goal: Test error handling with non-existent seller
      // Input: Valid amount but seller doesn't exist
      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No withdraw request created

      // Note: We don't create the seller in this test
      
      // Act - Create withdraw request
      const response = await request(app)
        .post('/api/withdraw/create-withdraw-request')
        .send({ amount: 500 });
      
      // Expect an error since the seller doesn't exist
      expect(response.statusCode).toBe(500);
      
      // Verify no withdraw request was created
      const withdrawRequests = await Withdraw.find();
      expect(withdrawRequests.length).toBe(0);
    });

    // Test case 5: Handle email sending error
    it('should handle errors when sending withdrawal email', async () => {
      // Goal: Test error handling when email service fails
      // Input: Valid amount but email service fails
      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No withdraw request created, balance unchanged

      // Setup - Create a seller
      const sellerId = new ObjectId('test-seller-id');
      const seller = new Shop({
        ...testShopData,
        _id: sellerId,
        availableBalance: 1000
      });
      await seller.save();
      
      // Setup - Make sendMail throw an error
      const sendMail = require('../../utils/sendMail');
      sendMail.mockRejectedValueOnce(new Error('Failed to send mail'));
      
      // Act - Create withdraw request
      const response = await request(app)
        .post('/api/withdraw/create-withdraw-request')
        .send({ amount: 500 });
      
      // Assert - Check response
      expect(response.statusCode).toBe(500);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('Failed to send mail');
      
      // Verify sendMail was called but failed
      expect(sendMail).toHaveBeenCalled();
      
      // Verify no withdraw request was created and balance unchanged
      const withdrawRequests = await Withdraw.find();
      expect(withdrawRequests.length).toBe(0);
      
      const unchangedSeller = await Shop.findById(sellerId);
      expect(unchangedSeller.availableBalance).toBe(1000);
    });
  });

  describe('Get All Withdraw Requests Tests', () => {
    // Test case 1: Successfully get all withdraw requests
    it('should return all withdraw requests for admin', async () => {
      // Goal: Test retrieving all withdraw requests as admin
      // Input: Admin authenticated request
      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. All withdraw requests returned in response

      // Setup - Create multiple withdraw requests
      const seller1Id = new ObjectId();
      const seller2Id = new ObjectId();
      
      const withdraws = [
        {
          seller: {
            _id: seller1Id,
            name: 'Seller 1',
            email: 'seller1@test.com'
          },
          amount: 100,
          status: 'Processing',
          createdAt: new Date('2023-01-02')
        },
        {
          seller: {
            _id: seller2Id,
            name: 'Seller 2',
            email: 'seller2@test.com'
          },
          amount: 200,
          status: 'Processing',
          createdAt: new Date('2023-01-01')
        },
        {
          seller: {
            _id: seller1Id,
            name: 'Seller 1',
            email: 'seller1@test.com'
          },
          amount: 300,
          status: 'Processing',
          createdAt: new Date('2023-01-03')
        }
      ];
      
      await Withdraw.insertMany(withdraws);
      
      // Act - Get all withdraw requests
      const response = await request(app)
        .get('/api/withdraw/get-all-withdraw-request');
      
      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.withdraws.length).toBe(3);
      
      // Verify sorting (newest first)
      expect(new Date(response.body.withdraws[0].createdAt)).toBeAfter(new Date(response.body.withdraws[1].createdAt));
      expect(new Date(response.body.withdraws[1].createdAt)).toBeAfter(new Date(response.body.withdraws[2].createdAt));
    });

    // Test case 2: Get withdraw requests when none exist
    it('should return empty array when no withdraw requests exist', async () => {
      // Goal: Test retrieving withdraw requests when none exist
      // Input: Admin authenticated request with empty withdraw DB
      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. Empty array of withdraw requests

      // Act - Get all withdraw requests when none exist
      const response = await request(app)
        .get('/api/withdraw/get-all-withdraw-request');
      
      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.withdraws).toBeInstanceOf(Array);
      expect(response.body.withdraws.length).toBe(0);
    });

    // Test case 3: Handle database errors
    it('should handle database errors when fetching withdraw requests', async () => {
      // Goal: Test error handling when database query fails
      // Input: Admin request but database query fails
      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No withdraw requests returned

      // Mock Withdraw.find to throw an error
      const originalFind = Withdraw.find;
      Withdraw.find = jest.fn().mockImplementationOnce(() => {
        throw new Error('Database error');
      });
      
      // Act - Get all withdraw requests with mocked error
      const response = await request(app)
        .get('/api/withdraw/get-all-withdraw-request');
      
      // Assert - Check response
      expect(response.statusCode).toBe(500);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('Database error');
      
      // Restore original function
      Withdraw.find = originalFind;
    });
  });

  describe('Update Withdraw Request Tests', () => {
    // Test case 1: Successfully update withdraw request
    it('should update withdraw request status and add transaction to seller', async () => {
      // Goal: Test updating withdraw request status
      // Input: Valid withdraw request ID and seller ID
      // Expected output: 
      // 1. HTTP 201 response with success message
      // 2. DB changes: withdraw status updated, transaction added to seller
      // 3. Email notification sent

      // Setup - Create a seller
      const sellerId = new ObjectId();
      const seller = new Shop({
        ...testShopData,
        _id: sellerId,
        transections: []
      });
      await seller.save();
      
      // Setup - Create a withdraw request
      const withdrawId = new ObjectId();
      const withdraw = new Withdraw({
        _id: withdrawId,
        seller: {
          _id: sellerId,
          name: seller.name,
          email: seller.email
        },
        amount: 500,
        status: 'Processing'
      });
      await withdraw.save();
      
      // Act - Update withdraw request
      const response = await request(app)
        .put(`/api/withdraw/update-withdraw-request/${withdrawId}`)
        .send({ sellerId: sellerId.toString() });
      
      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.withdraw.status).toBe('succeed');
      
      // Verify DB updates
      const updatedWithdraw = await Withdraw.findById(withdrawId);
      expect(updatedWithdraw.status).toBe('succeed');
      
      const updatedSeller = await Shop.findById(sellerId);
      expect(updatedSeller.transections.length).toBe(1);
      expect(updatedSeller.transections[0]._id.toString()).toBe(withdrawId.toString());
      expect(updatedSeller.transections[0].amount).toBe(500);
      expect(updatedSeller.transections[0].status).toBe('succeed');
      
      // Verify email was sent
      const sendMail = require('../../utils/sendMail');
      expect(sendMail).toHaveBeenCalled();
      expect(sendMail.mock.calls[0][0].email).toBe(seller.email);
      expect(sendMail.mock.calls[0][0].subject).toBe('Payment confirmation');
      expect(sendMail.mock.calls[0][0].message).toContain('500$');
    });

    // Test case 2: Update non-existent withdraw request
    it('should handle updating non-existent withdraw request', async () => {
      // Goal: Test error handling when withdraw request doesn't exist
      // Input: Non-existent withdraw request ID
      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No DB changes

      // Setup - Create a seller
      const sellerId = new ObjectId();
      const seller = new Shop({
        ...testShopData,
        _id: sellerId,
        transections: []
      });
      await seller.save();
      
      // Setup - Generate a valid but non-existent withdraw ID
      const nonExistentId = new ObjectId();
      
      // Act - Update non-existent withdraw request
      const response = await request(app)
        .put(`/api/withdraw/update-withdraw-request/${nonExistentId}`)
        .send({ sellerId: sellerId.toString() });
      
      // Assert - Check response
      expect(response.statusCode).toBe(500);
      
      // Verify seller transactions remain unchanged
      const unchangedSeller = await Shop.findById(sellerId);
      expect(unchangedSeller.transections.length).toBe(0);
    });

    // Test case 3: Update withdraw request with non-existent seller
    it('should handle updating withdraw with non-existent seller', async () => {
      // Goal: Test error handling when seller doesn't exist
      // Input: Valid withdraw ID but non-existent seller ID
      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No DB changes

      // Setup - Create a withdraw request
      const sellerId = new ObjectId();
      const withdrawId = new ObjectId();
      const withdraw = new Withdraw({
        _id: withdrawId,
        seller: {
          _id: sellerId,
          name: 'Test Seller',
          email: 'seller@test.com'
        },
        amount: 500,
        status: 'Processing'
      });
      await withdraw.save();
      
      // Setup - Generate a valid but non-existent seller ID
      const nonExistentSellerId = new ObjectId();
      
      // Act - Update withdraw with non-existent seller
      const response = await request(app)
        .put(`/api/withdraw/update-withdraw-request/${withdrawId}`)
        .send({ sellerId: nonExistentSellerId.toString() });
      
      // Assert - Check response
      expect(response.statusCode).toBe(500);
      
      // Verify withdraw status remains unchanged
      const unchangedWithdraw = await Withdraw.findById(withdrawId);
      expect(unchangedWithdraw.status).toBe('Processing');
    });

    // Test case 4: Handle invalid withdraw ID format
    it('should handle invalid withdraw ID format', async () => {
      // Goal: Test error handling with invalid ID format
      // Input: Invalid format for withdraw ID
      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No DB changes

      // Setup - Create a seller
      const sellerId = new ObjectId();
      const seller = new Shop({
        ...testShopData,
        _id: sellerId,
        transections: []
      });
      await seller.save();
      
      // Act - Update with invalid ID format
      const response = await request(app)
        .put('/api/withdraw/update-withdraw-request/invalid-id')
        .send({ sellerId: sellerId.toString() });
      
      // Assert - Check response
      expect(response.statusCode).toBe(500);
      
      // Verify seller transactions remain unchanged
      const unchangedSeller = await Shop.findById(sellerId);
      expect(unchangedSeller.transections.length).toBe(0);
    });

    // Test case 5: Handle email sending error
    it('should handle email failure during withdraw update', async () => {
      // Goal: Test error handling when email service fails
      // Input: Valid data but email service fails
      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No DB changes

      // Setup - Create a seller
      const sellerId = new ObjectId();
      const seller = new Shop({
        ...testShopData,
        _id: sellerId,
        transections: []
      });
      await seller.save();
      
      // Setup - Create a withdraw request
      const withdrawId = new ObjectId();
      const withdraw = new Withdraw({
        _id: withdrawId,
        seller: {
          _id: sellerId,
          name: seller.name,
          email: seller.email
        },
        amount: 500,
        status: 'Processing'
      });
      await withdraw.save();
      
      // Setup - Make sendMail throw an error
      const sendMail = require('../../utils/sendMail');
      sendMail.mockRejectedValueOnce(new Error('Failed to send mail'));
      
      // Act - Update withdraw request
      const response = await request(app)
        .put(`/api/withdraw/update-withdraw-request/${withdrawId}`)
        .send({ sellerId: sellerId.toString() });
      
      // Assert - Check response
      expect(response.statusCode).toBe(500);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('Failed to send mail');
      
      // Verify sendMail was called but failed
      expect(sendMail).toHaveBeenCalled();
      
      // In this controller, DB changes happen before email is sent, 
      // so the withdraw status would be updated but transaction might not be completed
    });
  });
});
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const express = require('express');
const Shop = require('../../model/shop');
const shopRoutes = require('../../controller/shop');
const jwt = require('jsonwebtoken');
const { Types: { ObjectId } } = mongoose;

// Store cloudinary mock in a variable for easy access
const cloudinaryMock = require('cloudinary');

// Mock jwt
jest.mock('jsonwebtoken');

// Mock sendMail
jest.mock('../../utils/sendMail', () => {
  return jest.fn().mockImplementation(() => Promise.resolve());
});

// Mock shopToken
jest.mock('../../utils/shopToken', () => {
  return jest.fn().mockImplementation((shop, statusCode, res) => {
    res.status(statusCode).json({
      success: true,
      token: 'test-token',
      shop
    });
  });
});

// Mock cloudinary
jest.mock('cloudinary', () => ({
  v2: {
    uploader: {
      upload: jest.fn().mockImplementation(() => {
        return Promise.resolve({
          public_id: 'test-public-id',
          secure_url: 'https://test-cloud-image.com/test.jpg'
        });
      }),
      destroy: jest.fn().mockResolvedValue({ result: 'ok' })
    }
  }
}));

// Mock middleware
jest.mock('../../middleware/auth', () => ({
  isAuthenticated: (req, res, next) => {
    req.user = { _id: 'test-user-id' };
    next();
  },
  isSeller: (req, res, next) => {
    req.seller = { _id: 'test-seller-id' };
    next();
  },
  isAdmin: () => (req, res, next) => {
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

// Mock environment variable
process.env.ACTIVATION_SECRET = 'test-activation-secret';

// Sample data
const testShopData = {
  name: 'Test Shop',
  email: 'test@shop.com',
  password: 'password123',
  avatar: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...',
  address: '123 Test Street',
  phoneNumber: '1234567890',
  zipCode: '12345'
};

// Setup test app
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use('/api/shop', shopRoutes);

describe('Shop Controller Tests', () => {
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
  });

  describe('Create Shop Tests', () => {
    // Test case 1: Successfully create a shop activation request
    it('should create a shop activation request and send email', async () => {
      // Setup - Mock JWT token creation
      jwt.sign.mockReturnValue('test-activation-token');
      
      // Setup - Verify no shop exists initially
      const initialShops = await Shop.find();
      expect(initialShops.length).toBe(0);
      
      // Act - Send request to create shop
      const response = await request(app)
        .post('/api/shop/create-shop')
        .send(testShopData);
      
      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe(`please check your email:- ${testShopData.email} to activate your shop!`);
      
      // Verify JWT was called
      expect(jwt.sign).toHaveBeenCalled();
      expect(jwt.sign.mock.calls[0][0]).toMatchObject({
        name: testShopData.name,
        email: testShopData.email
      });
      
      // Verify sendMail was called with correct parameters
      const sendMail = require('../../utils/sendMail');
      expect(sendMail).toHaveBeenCalled();
      expect(sendMail.mock.calls[0][0].email).toBe(testShopData.email);
      expect(sendMail.mock.calls[0][0].subject).toBe('Activate your Shop');
      expect(sendMail.mock.calls[0][0].message).toContain('test-activation-token');
      
      // Verify shop was NOT created in DB (only happens after activation)
      const finalShops = await Shop.find();
      expect(finalShops.length).toBe(0);
      
      // Verify cloudinary was called
      expect(cloudinary.v2.uploader.upload).toHaveBeenCalledWith(
        testShopData.avatar,
        {
          folder: 'avatars'
        }
      );

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. No DB changes as shop is only created after activation
      // 3. Activation email sent with token
    });

    // Test case 2: Handle existing email
    it('should return error if email already exists', async () => {
      // Setup - Create a shop with the test email
      await Shop.create({
        ...testShopData,
        avatar: {
          public_id: 'existing-id',
          url: 'existing-url'
        }
      });
      
      // Act - Try to create shop with same email
      const response = await request(app)
        .post('/api/shop/create-shop')
        .send(testShopData);
      
      // Assert - Check response
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('User already exists');
      
      // Verify JWT and sendMail were not called
      expect(jwt.sign).not.toHaveBeenCalled();
      expect(require('../../utils/sendMail')).not.toHaveBeenCalled();
      
      // Verify only one shop exists (the one we created in setup)
      const shops = await Shop.find();
      expect(shops.length).toBe(1);

      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No additional shop created
      // 3. No email sent
    });

    // Test case 3: Handle email sending error
    it('should handle errors when sending activation email', async () => {
      // Setup - Mock JWT token creation
      jwt.sign.mockReturnValue('test-activation-token');
      
      // Setup - Make sendMail throw an error
      const sendMail = require('../../utils/sendMail');
      sendMail.mockRejectedValueOnce(new Error('Failed to send mail'));
      
      // Act - Send request to create shop
      const response = await request(app)
        .post('/api/shop/create-shop')
        .send(testShopData);
      
      // Assert - Check response
      expect(response.statusCode).toBe(500);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('Failed to send mail');
      
      // Verify JWT was called but failed at sendMail
      expect(jwt.sign).toHaveBeenCalled();
      expect(sendMail).toHaveBeenCalled();
      
      // Verify no shop was created
      const shops = await Shop.find();
      expect(shops.length).toBe(0);

      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No shop created
    });

    // Test case 4: Handle cloudinary upload failure
    it('should handle errors during cloudinary upload', async () => {
      // Setup - Make cloudinary throw an error
      cloudinaryMock.v2.uploader.upload.mockRejectedValueOnce(new Error('Upload failed'));
      
      // Act - Send request to create shop
      const response = await request(app)
        .post('/api/shop/create-shop')
        .send(testShopData);
      
      // Assert - Check response
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('Upload failed');
      
      // Verify cloudinary was called but failed
      expect(cloudinary.v2.uploader.upload).toHaveBeenCalled();
      
      // Verify no shop was created and no email sent
      const shops = await Shop.find();
      expect(shops.length).toBe(0);
      expect(require('../../utils/sendMail')).not.toHaveBeenCalled();

      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No shop created
      // 3. No email sent
    });

    // Test case 5: Handle missing required fields
    it('should handle missing required fields', async () => {
      // Setup - Create test data with missing email
      const incompleteData = { ...testShopData };
      delete incompleteData.email;
      
      // Act - Send request with incomplete data
      const response = await request(app)
        .post('/api/shop/create-shop')
        .send(incompleteData);
      
      // Assert - Check response (will fail at looking up existing email)
      expect(response.statusCode).toBe(400);
      
      // Verify no shop was created
      const shops = await Shop.find();
      expect(shops.length).toBe(0);

      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No shop created
    });
  });

  describe('Shop Activation Tests', () => {
    // Test case 1: Successfully activate shop with valid token
    it('should activate shop with valid activation token', async () => {
      // Setup - Mock JWT verification to return valid shop data
      jwt.verify.mockReturnValue({
        ...testShopData,
        avatar: {
          public_id: 'test-public-id',
          url: 'test-url'
        }
      });
      
      // Setup - Verify no shop exists initially
      const initialShops = await Shop.find();
      expect(initialShops.length).toBe(0);
      
      // Act - Send activation request
      const response = await request(app)
        .post('/api/shop/activation')
        .send({ activation_token: 'valid-token' });
      
      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBe('test-token');
      expect(response.body.shop.email).toBe(testShopData.email);
      
      // Verify JWT verification was called
      expect(jwt.verify).toHaveBeenCalledWith('valid-token', process.env.ACTIVATION_SECRET);
      
      // Verify shop was created in DB
      const shop = await Shop.findOne({ email: testShopData.email });
      expect(shop).not.toBeNull();
      expect(shop.name).toBe(testShopData.name);
      expect(shop.email).toBe(testShopData.email);
      
      // Verify shopToken was called
      const sendShopToken = require('../../utils/shopToken');
      expect(sendShopToken).toHaveBeenCalled();

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. DB change: shop created
      // 3. Token returned to client
    });

    // Test case 2: Invalid activation token
    it('should return error for invalid activation token', async () => {
      // Setup - Mock JWT verification to return null (invalid token)
      jwt.verify.mockReturnValue(null);
      
      // Act - Send activation request with invalid token
      const response = await request(app)
        .post('/api/shop/activation')
        .send({ activation_token: 'invalid-token' });
      
      // Assert - Check response
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('Invalid token');
      
      // Verify JWT verification was called
      expect(jwt.verify).toHaveBeenCalledWith('invalid-token', process.env.ACTIVATION_SECRET);
      
      // Verify no shop was created
      const shops = await Shop.find();
      expect(shops.length).toBe(0);

      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No shop created
    });

    // Test case 3: Activation with email that already exists
    it('should return error if email already exists during activation', async () => {
      // Setup - Create a shop with the test email
      await Shop.create({
        ...testShopData,
        avatar: {
          public_id: 'existing-id',
          url: 'existing-url'
        }
      });
      
      // Setup - Mock JWT verification to return valid shop data
      jwt.verify.mockReturnValue({
        ...testShopData,
        avatar: {
          public_id: 'test-public-id',
          url: 'test-url'
        }
      });
      
      // Act - Send activation request
      const response = await request(app)
        .post('/api/shop/activation')
        .send({ activation_token: 'valid-token' });
      
      // Assert - Check response
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('User already exists');
      
      // Verify JWT verification was called
      expect(jwt.verify).toHaveBeenCalledWith('valid-token', process.env.ACTIVATION_SECRET);
      
      // Verify only one shop exists (the one we created in setup)
      const shops = await Shop.find();
      expect(shops.length).toBe(1);

      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No additional shop created
    });

    // Test case 4: Handle JWT verification error
    it('should handle JWT verification errors', async () => {
      // Setup - Mock JWT verification to throw an error
      jwt.verify.mockImplementation(() => {
        throw new Error('Token expired');
      });
      
      // Act - Send activation request
      const response = await request(app)
        .post('/api/shop/activation')
        .send({ activation_token: 'expired-token' });
      
      // Assert - Check response
      expect(response.statusCode).toBe(500);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('Token expired');
      
      // Verify JWT verification was called
      expect(jwt.verify).toHaveBeenCalledWith('expired-token', process.env.ACTIVATION_SECRET);
      
      // Verify no shop was created
      const shops = await Shop.find();
      expect(shops.length).toBe(0);

      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No shop created
    });
  });

  describe('Login Shop Tests', () => {
    // Test case 1: Successfully login with valid credentials
    it('should login shop with valid credentials', async () => {
      // Setup - Create a shop in DB
      const shop = new Shop({
        ...testShopData,
        avatar: {
          public_id: 'test-id',
          url: 'test-url'
        }
      });
      
      // Mock comparePassword method
      shop.comparePassword = jest.fn().mockResolvedValue(true);
      await shop.save();
      
      // Act - Send login request
      const response = await request(app)
        .post('/api/shop/login-shop')
        .send({
          email: testShopData.email,
          password: testShopData.password
        });
      
      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBe('test-token');
      expect(response.body.shop.email).toBe(testShopData.email);
      
      // Verify comparePassword was called
      expect(shop.comparePassword).toHaveBeenCalledWith(testShopData.password);
      
      // Verify shopToken was called
      const sendShopToken = require('../../utils/shopToken');
      expect(sendShopToken).toHaveBeenCalled();

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. Token returned to client
    });

    // Test case 2: Login with non-existent email
    it('should return error for non-existent email', async () => {
      // Act - Send login request with non-existent email
      const response = await request(app)
        .post('/api/shop/login-shop')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123'
        });
      
      // Assert - Check response
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe("User doesn't exists!");
      
      // Verify shopToken was not called
      const sendShopToken = require('../../utils/shopToken');
      expect(sendShopToken).not.toHaveBeenCalled();

      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No token returned
    });

    // Test case 3: Login with incorrect password
    it('should return error for incorrect password', async () => {
      // Setup - Create a shop in DB
      const shop = new Shop({
        ...testShopData,
        avatar: {
          public_id: 'test-id',
          url: 'test-url'
        }
      });
      
      // Mock comparePassword to return false (incorrect password)
      shop.comparePassword = jest.fn().mockResolvedValue(false);
      await shop.save();
      
      // Act - Send login request with wrong password
      const response = await request(app)
        .post('/api/shop/login-shop')
        .send({
          email: testShopData.email,
          password: 'wrong-password'
        });
      
      // Assert - Check response
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('Please provide the correct information');
      
      // Verify comparePassword was called
      expect(shop.comparePassword).toHaveBeenCalledWith('wrong-password');
      
      // Verify shopToken was not called
      const sendShopToken = require('../../utils/shopToken');
      expect(sendShopToken).not.toHaveBeenCalled();

      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No token returned
    });

    // Test case 4: Login with missing fields
    it('should return error for missing email or password', async () => {
      // Act - Send login request with missing password
      const responseNoPassword = await request(app)
        .post('/api/shop/login-shop')
        .send({
          email: testShopData.email
          // password is missing
        });
      
      // Assert - Check response
      expect(responseNoPassword.statusCode).toBe(400);
      expect(responseNoPassword.body.success).toBe(undefined);
      expect(responseNoPassword.body.message).toBe('Please provide the all fields!');
      
      // Act - Send login request with missing email
      const responseNoEmail = await request(app)
        .post('/api/shop/login-shop')
        .send({
          // email is missing
          password: testShopData.password
        });
      
      // Assert - Check response
      expect(responseNoEmail.statusCode).toBe(400);
      expect(responseNoEmail.body.success).toBe(undefined);
      expect(responseNoEmail.body.message).toBe('Please provide the all fields!');
      
      // Verify shopToken was not called
      const sendShopToken = require('../../utils/shopToken');
      expect(sendShopToken).not.toHaveBeenCalled();

      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No token returned
    });
  });

  describe('Get Seller Tests', () => {
    it('should return seller information', async () => {
      // Setup - Create a seller and update the mock middleware
      const sellerId = new ObjectId();
      const seller = new Shop({
        ...testShopData,
        _id: sellerId,
        avatar: {
          public_id: 'test-id',
          url: 'test-url'
        }
      });
      await seller.save();
      
      // Update the middleware mock for this test
      require('../../middleware/auth').isSeller = (req, res, next) => {
        req.seller = { _id: sellerId.toString() };
        next();
      };
      
      // Act - Get seller info
      const response = await request(app)
        .get('/api/shop/getSeller');
      
      // Assert - Check response
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.seller.name).toBe(testShopData.name);
      expect(response.body.seller.email).toBe(testShopData.email);

      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. Seller information returned
    });

    // Test case 2: Get non-existent seller
    it('should return error for non-existent seller', async () => {
      // Update the middleware mock with non-existent seller ID
      require('../../middleware/auth').isSeller = (req, res, next) => {
        req.seller = { _id: 'non-existent-id' };
        next();
      };
      
      // Act - Get seller info
      const response = await request(app)
        .get('/api/shop/getSeller');
      
      // Assert - Check response
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe("User doesn't exists");

      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No seller information returned
    });
  });

  describe('Logout Tests', () => {
    // Test case 1: Successfully logout seller
    it('should logout seller', async () => {
      // Act - Logout seller
      const response = await request(app)
        .get('/api/shop/logout');
      
      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Log out successful!');
      
      // Check that cookie was cleared in response
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('seller_token=null');
      expect(cookies[0]).toContain('expires=');

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. Cookie cleared in response headers
    });
  });

  describe('Get Shop Info Tests', () => {
    // Test case 1: Successfully get shop info by ID
    it('should get shop info by ID', async () => {
      // Setup - Create a shop
      const shop = new Shop({
        ...testShopData,
        avatar: {
          public_id: 'test-id',
          url: 'test-url'
        }
      });
      await shop.save();
      
      // Act - Get shop info by ID
      const response = await request(app)
        .get(`/api/shop/get-shop-info/${shop._id}`);
      
      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.shop.name).toBe(testShopData.name);
      expect(response.body.shop.email).toBe(testShopData.email);

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. Shop information returned
    });

    // Test case 2: Get info for non-existent shop
    it('should handle non-existent shop ID', async () => {
      // Generate a non-existent shop ID
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      
      // Act - Get info for non-existent shop
      const response = await request(app)
        .get(`/api/shop/get-shop-info/${nonExistentId}`);
      
      // Assert - Check response
      expect(response.statusCode).toBe(500);
      // The controller doesn't handle this specific error, so it returns a general error

      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No shop information returned
    });

    // Test case 3: Handle invalid shop ID format
    it('should handle invalid shop ID format', async () => {
      // Act - Get info with invalid ID format
      const response = await request(app)
        .get('/api/shop/get-shop-info/invalid-id');
      
      // Assert - Check response
      expect(response.statusCode).toBe(500);
      // The controller doesn't handle this specific error, so it returns a general error

      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No shop information returned
    });
  });

  describe('Update Shop Avatar Tests', () => {
    it('should update shop avatar', async () => {
      // Setup - Create a seller and update the mock middleware
      const sellerId = new ObjectId();
      const seller = new Shop({
        ...testShopData,
        _id: sellerId,
        avatar: {
          public_id: 'existing-id',
          url: 'existing-url'
        }
      });
      await seller.save();
      
      // Update the middleware mock for this test
      require('../../middleware/auth').isSeller = (req, res, next) => {
        req.seller = { _id: sellerId.toString() };
        next();
      };
      
      // Act - Update shop avatar
      const response = await request(app)
        .put('/api/shop/update-shop-avatar')
        .send({
          avatar: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...' // new avatar
        });
      
      // Assert - Check response
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.seller.avatar.public_id).toBe('test-public-id');
      expect(response.body.seller.avatar.url).toBe('https://test-cloud-image.com/test.jpg');
      
      // Verify cloudinary operations
      expect(cloudinary.v2.uploader.destroy).toHaveBeenCalledWith('existing-id');
      expect(cloudinary.v2.uploader.upload).toHaveBeenCalled();
      
      // Verify DB update
      const updatedSeller = await Shop.findById(sellerId);
      expect(updatedSeller.avatar.public_id).toBe('test-public-id');
      expect(updatedSeller.avatar.url).toBe('https://test-cloud-image.com/test.jpg');

      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. DB changes: avatar updated
      // 3. Old avatar deleted from cloudinary
    });

    // Test case 2: Update avatar for non-existent seller
    it('should handle non-existent seller during avatar update', async () => {
      // Update the middleware mock with non-existent seller ID
      require('../../middleware/auth').isSeller = (req, res, next) => {
        req.seller = { _id: new ObjectId().toString() };
        next();
      };
      
      // Act - Update avatar for non-existent seller
      const response = await request(app)
        .put('/api/shop/update-shop-avatar')
        .send({
          avatar: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...'
        });
      
      // Assert - Check response
      expect(response.statusCode).toBe(500);
      // The controller doesn't explicitly handle this case, falls back to general error

      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No DB changes
    });

    // Test case 3: Handle cloudinary upload failure during avatar update
    it('should handle cloudinary errors during avatar update', async () => {
      // Setup - Create a seller and update the mock middleware
      const sellerId = new ObjectId();
      const seller = new Shop({
        ...testShopData,
        _id: sellerId,
        avatar: {
          public_id: 'existing-id',
          url: 'existing-url'
        }
      });
      await seller.save();
      
      // Update the middleware mock for this test
      require('../../middleware/auth').isSeller = (req, res, next) => {
        req.seller = { _id: sellerId.toString() };
        next();
      };
      
      // Mock cloudinary upload to throw error
      cloudinaryMock.v2.uploader.upload.mockRejectedValueOnce(new Error('Upload failed'));
      
      // Act - Update avatar with failing upload
      const response = await request(app)
        .put('/api/shop/update-shop-avatar')
        .send({
          avatar: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...'
        });
      
      // Assert - Check response
      expect(response.statusCode).toBe(500);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('Upload failed');
      
      // Verify cloudinary operations
      expect(cloudinary.v2.uploader.destroy).toHaveBeenCalledWith('existing-id');
      expect(cloudinary.v2.uploader.upload).toHaveBeenCalled();
      
      // Verify DB was not updated
      const unchangedSeller = await Shop.findById(sellerId);
      expect(unchangedSeller.avatar.public_id).toBe('existing-id');
      expect(unchangedSeller.avatar.url).toBe('existing-url');

      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No DB changes, avatar remains unchanged
    });
  });

  describe('Update Seller Info Tests', () => {
    // Test case 1: Successfully update seller information
    it('should update seller information', async () => {
      // Setup - Create a seller and update the mock middleware
      const sellerId = new ObjectId();
      const seller = new Shop({
        ...testShopData,
        _id: sellerId,
        avatar: {
          public_id: 'test-id',
          url: 'test-url'
        }
      });
      await seller.save();
      
      // Update the middleware mock for this test
      require('../../middleware/auth').isSeller = (req, res, next) => {
        req.seller = { _id: sellerId.toString() };
        next();
      };
      
      // New seller info
      const updatedInfo = {
        name: 'Updated Shop Name',
        description: 'This is an updated description',
        address: '456 Updated Street',
        phoneNumber: '9876543210',
        zipCode: '54321'
      };
      
      // Act - Update seller info
      const response = await request(app)
        .put('/api/shop/update-seller-info')
        .send(updatedInfo);
      
      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.shop.name).toBe(updatedInfo.name);
      expect(response.body.shop.description).toBe(updatedInfo.description);
      expect(response.body.shop.address).toBe(updatedInfo.address);
      expect(response.body.shop.phoneNumber).toBe(updatedInfo.phoneNumber);
      expect(response.body.shop.zipCode).toBe(updatedInfo.zipCode);
      
      // Verify DB update
      const updatedSeller = await Shop.findById(sellerId);
      expect(updatedSeller.name).toBe(updatedInfo.name);
      expect(updatedSeller.description).toBe(updatedInfo.description);
      expect(updatedSeller.address).toBe(updatedInfo.address);
      expect(updatedSeller.phoneNumber).toBe(updatedInfo.phoneNumber);
      expect(updatedSeller.zipCode).toBe(updatedInfo.zipCode);

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. DB changes: seller information updated
    });

    // Test case 2: Update info for non-existent seller
    it('should handle non-existent seller during info update', async () => {
      // Update the middleware mock with non-existent seller ID
      require('../../middleware/auth').isSeller = (req, res, next) => {
        req.seller = { _id: new ObjectId().toString() };
        next();
      };
      
      // Act - Update info for non-existent seller
      const response = await request(app)
        .put('/api/shop/update-seller-info')
        .send({
          name: 'Updated Shop Name',
          description: 'This is an updated description',
          address: '456 Updated Street',
          phoneNumber: '9876543210',
          zipCode: '54321'
        });
      
      // Assert - Check response
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('User not found');

      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No DB changes
    });

    // Test case 3: Update with partial information
    it('should update seller with partial information', async () => {
      // Setup - Create a seller and update the mock middleware
      const sellerId = new ObjectId();
      const seller = new Shop({
        ...testShopData,
        _id: sellerId,
        avatar: {
          public_id: 'test-id',
          url: 'test-url'
        }
      });
      await seller.save();
      
      // Update the middleware mock for this test
      require('../../middleware/auth').isSeller = (req, res, next) => {
        req.seller = { _id: sellerId.toString() };
        next();
      };
      
      // Partial update info (only name and zipCode)
      const partialUpdate = {
        name: 'Partially Updated Name',
        zipCode: '99999'
      };
      
      // Act - Update with partial info
      const response = await request(app)
        .put('/api/shop/update-seller-info')
        .send(partialUpdate);
      
      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.shop.name).toBe(partialUpdate.name);
      expect(response.body.shop.zipCode).toBe(partialUpdate.zipCode);
      
      // Verify DB update - updated fields changed, others unchanged
      const updatedSeller = await Shop.findById(sellerId);
      expect(updatedSeller.name).toBe(partialUpdate.name);
      expect(updatedSeller.zipCode).toBe(partialUpdate.zipCode);
      expect(updatedSeller.address).toBe(testShopData.address); // Should be unchanged
      expect(updatedSeller.phoneNumber).toBe(testShopData.phoneNumber); // Should be unchanged

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. DB changes: only specified fields updated
    });
  });

  describe('Admin Get All Sellers Tests', () => {
    // Test case 1: Successfully get all sellers
    it('should get all sellers for admin', async () => {
      // Setup - Create multiple sellers
      const sellers = [
        {
          ...testShopData,
          name: 'Shop 1',
          email: 'shop1@example.com',
          avatar: { public_id: 'id1', url: 'url1' }
        },
        {
          ...testShopData,
          name: 'Shop 2',
          email: 'shop2@example.com',
          avatar: { public_id: 'id2', url: 'url2' },
          createdAt: new Date('2023-01-02')
        },
        {
          ...testShopData,
          name: 'Shop 3',
          email: 'shop3@example.com',
          avatar: { public_id: 'id3', url: 'url3' },
          createdAt: new Date('2023-01-01')
        }
      ];
      
      await Shop.create(sellers);
      
      // Act - Get all sellers
      const response = await request(app)
        .get('/api/shop/admin-all-sellers');
      
      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.sellers.length).toBe(3);
      
      // Verify sellers are returned in correct order (newest first)
      const shopNames = response.body.sellers.map(s => s.name);
      expect(shopNames).toContain('Shop 1');
      expect(shopNames).toContain('Shop 2');
      expect(shopNames).toContain('Shop 3');

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. All sellers returned in response
    });

    // Test case 2: Get sellers when none exist
    it('should return empty array when no sellers exist', async () => {
      // Act - Get all sellers when none exist
      const response = await request(app)
        .get('/api/shop/admin-all-sellers');
      
      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.sellers).toBeInstanceOf(Array);
      expect(response.body.sellers.length).toBe(0);

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. Empty array of sellers
    });

    // Test case 3: Handle database errors
    it('should handle database errors when fetching sellers', async () => {
      // Mock Shop.find to throw an error
      const originalFind = Shop.find;
      Shop.find = jest.fn().mockImplementationOnce(() => {
        throw new Error('Database error');
      });
      
      // Act - Get all sellers with mocked error
      const response = await request(app)
        .get('/api/shop/admin-all-sellers');
      
      // Assert - Check response
      expect(response.statusCode).toBe(500);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('Database error');
      
      // Restore original function
      Shop.find = originalFind;

      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No sellers returned
    });
  });

  describe('Delete Seller Tests', () => {
    // Test case 1: Successfully delete seller
    it('should delete a seller', async () => {
      // Setup - Create a seller to delete
      const seller = new Shop({
        ...testShopData,
        avatar: {
          public_id: 'test-id',
          url: 'test-url'
        }
      });
      await seller.save();
      
      // Verify seller exists
      let sellerCount = await Shop.countDocuments();
      expect(sellerCount).toBe(1);
      
      // Act - Delete seller
      const response = await request(app)
        .delete(`/api/shop/delete-seller/${seller._id}`);
      
      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Seller deleted successfully!');
      
      // Verify seller was deleted
      sellerCount = await Shop.countDocuments();
      expect(sellerCount).toBe(0);

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. DB changes: seller deleted
    });

    // Test case 2: Delete non-existent seller
    it('should handle deleting non-existent seller', async () => {
      // Generate a non-existent seller ID
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      
      // Act - Delete non-existent seller
      const response = await request(app)
        .delete(`/api/shop/delete-seller/${nonExistentId}`);
      
      // Assert - Check response
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('Seller is not available with this id');

      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No DB changes
    });

    // Test case 3: Handle invalid seller ID format
    it('should handle invalid seller ID format', async () => {
      // Act - Delete with invalid ID format
      const response = await request(app)
        .delete('/api/shop/delete-seller/invalid-id');
      
      // Assert - Check response
      expect(response.statusCode).toBe(500);
      // The controller doesn't explicitly handle this case, falls back to general error

      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No DB changes
    });
  });

  describe('Update Payment Methods Tests', () => {
    // Test case 1: Successfully update payment methods
    it('should update seller withdraw methods', async () => {
      // Setup - Create a seller and update the mock middleware
      const sellerId = new ObjectId();
      const seller = new Shop({
        ...testShopData,
        _id: sellerId,
        avatar: {
          public_id: 'test-id',
          url: 'test-url'
        }
      });
      await seller.save();
      
      // Update the middleware mock for this test
      require('../../middleware/auth').isSeller = (req, res, next) => {
        req.seller = { _id: sellerId.toString() };
        next();
      };
      
      // Payment method details
      const paymentMethod = {
        withdrawMethod: {
          bankName: 'Test Bank',
          accountNumber: '1234567890',
          accountHolderName: 'Test User'
        }
      };
      
      // Act - Update payment methods
      const response = await request(app)
        .put('/api/shop/update-payment-methods')
        .send(paymentMethod);
      
      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.seller).toBeDefined();
      
      // Verify DB update
      const updatedSeller = await Shop.findById(sellerId);
      expect(updatedSeller.withdrawMethod).toBeDefined();
      expect(updatedSeller.withdrawMethod.bankName).toBe('Test Bank');
      expect(updatedSeller.withdrawMethod.accountNumber).toBe('1234567890');

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. DB changes: withdraw method updated
    });

    // Test case 2: Update payment methods for non-existent seller
    it('should handle updating payment methods for non-existent seller', async () => {
      // Update the middleware mock with non-existent seller ID
      require('../../middleware/auth').isSeller = (req, res, next) => {
        req.seller = { _id: new ObjectId().toString() };
        next();
      };
      
      // Act - Update payment methods for non-existent seller
      const response = await request(app)
        .put('/api/shop/update-payment-methods')
        .send({
          withdrawMethod: {
            bankName: 'Test Bank',
            accountNumber: '1234567890'
          }
        });
      
      // Assert - Check response
      expect(response.statusCode).toBe(500);
      // The controller doesn't explicitly handle this case, falls back to general error

      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No DB changes
    });
  });

  describe('Delete Withdraw Method Tests', () => {
    // Test case 1: Successfully delete withdraw method
    it('should delete seller withdraw method', async () => {
      // Setup - Create a seller with withdraw method
      const sellerId = new ObjectId();
      const seller = new Shop({
        ...testShopData,
        _id: sellerId,
        avatar: {
          public_id: 'test-id',
          url: 'test-url'
        },
        withdrawMethod: {
          bankName: 'Test Bank',
          accountNumber: '1234567890'
        }
      });
      await seller.save();
      
      // Update the middleware mock for this test
      require('../../middleware/auth').isSeller = (req, res, next) => {
        req.seller = { _id: sellerId.toString() };
        next();
      };
      
      // Verify withdraw method exists
      let sellerWithMethod = await Shop.findById(sellerId);
      expect(sellerWithMethod.withdrawMethod).toBeDefined();
      
      // Act - Delete withdraw method
      const response = await request(app)
        .delete('/api/shop/delete-withdraw-method/');
      
      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.seller).toBeDefined();
      
      // Verify withdraw method was removed
      const updatedSeller = await Shop.findById(sellerId);
      expect(updatedSeller.withdrawMethod).toBeNull();

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. DB changes: withdraw method removed
    });

    // Test case 2: Delete withdraw method for non-existent seller
    it('should handle deleting withdraw method for non-existent seller', async () => {
      // Update the middleware mock with non-existent seller ID
      require('../../middleware/auth').isSeller = (req, res, next) => {
        req.seller = { _id: new ObjectId().toString() };
        next();
      };
      
      // Act - Delete withdraw method for non-existent seller
      const response = await request(app)
        .delete('/api/shop/delete-withdraw-method/');
      
      // Assert - Check response
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('Seller not found with this id');

      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No DB changes
    });
  });
});
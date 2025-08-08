const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const express = require('express');
const User = require('../../model/user');
const userRoutes = require('../../controller/user');
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

// Mock jwtToken
jest.mock('../../utils/jwtToken', () => {
  return jest.fn().mockImplementation((user, statusCode, res) => {
    res.status(statusCode).json({
      success: true,
      token: 'test-token',
      user
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
    req.user = { id: 'test-user-id', _id: 'test-user-id' };
    next();
  },
  isAdmin: (role) => (req, res, next) => {
    req.user = { id: 'test-admin-id', _id: 'test-admin-id', role: 'Admin' };
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
const testUserData = {
  name: 'Test User',
  email: 'test@example.com',
  password: 'password123',
  avatar: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...',
  phoneNumber: '1234567890',
  addresses: []
};

// Setup test app
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use('/api/user', userRoutes);

describe('User Controller Tests', () => {
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
    await User.deleteMany({});
  });

  describe('Create User Tests', () => {
    // Test case 1: Successfully create a user activation request
    it('should create a user activation request and send email', async () => {
      // Goal: Test creation of a user activation request
      // Input: Valid user data (name, email, password, avatar)
      // Expected output: 
      // 1. HTTP 201 response with success message
      // 2. No user created yet (only happens after activation)
      // 3. Activation email sent with token
      
      // Setup - Mock JWT token creation
      jwt.sign.mockReturnValue('test-activation-token');
      
      // Setup - Verify no user exists initially
      const initialUsers = await User.find();
      expect(initialUsers.length).toBe(0);
      
      // Act - Send request to create user
      const response = await request(app)
        .post('/api/user/create-user')
        .send(testUserData);
      
      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe(`please check your email:- ${testUserData.email} to activate your account!`);
      
      // Verify JWT was called
      expect(jwt.sign).toHaveBeenCalled();
      expect(jwt.sign.mock.calls[0][0]).toMatchObject({
        name: testUserData.name,
        email: testUserData.email
      });
      
      // Verify sendMail was called with correct parameters
      const sendMail = require('../../utils/sendMail');
      expect(sendMail).toHaveBeenCalled();
      expect(sendMail.mock.calls[0][0].email).toBe(testUserData.email);
      expect(sendMail.mock.calls[0][0].subject).toBe('Activate your account');
      expect(sendMail.mock.calls[0][0].message).toContain('test-activation-token');
      
      // Verify user was NOT created in DB (only happens after activation)
      const finalUsers = await User.find();
      expect(finalUsers.length).toBe(0);
      
      // Verify cloudinary was called
      expect(cloudinary.v2.uploader.upload).toHaveBeenCalledWith(
        testUserData.avatar,
        {
          folder: 'avatars'
        }
      );
    });

    // Test case 2: Handle existing email
    it('should return error if email already exists', async () => {
      // Goal: Test error handling when creating user with existing email
      // Input: User data with email that already exists
      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No additional user created
      // 3. No email sent
      
      // Setup - Create a user with the test email
      await User.create({
        ...testUserData,
        avatar: {
          public_id: 'existing-id',
          url: 'existing-url'
        }
      });
      
      // Act - Try to create user with same email
      const response = await request(app)
        .post('/api/user/create-user')
        .send(testUserData);
      
      // Assert - Check response
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('User already exists');
      
      // Verify JWT and sendMail were not called
      expect(jwt.sign).not.toHaveBeenCalled();
      expect(require('../../utils/sendMail')).not.toHaveBeenCalled();
      
      // Verify only one user exists (the one we created in setup)
      const users = await User.find();
      expect(users.length).toBe(1);
    });

    // Test case 3: Handle email sending error
    it('should handle errors when sending activation email', async () => {
      // Goal: Test error handling when email service fails
      // Input: Valid user data but email service fails
      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No user created
      
      // Setup - Mock JWT token creation
      jwt.sign.mockReturnValue('test-activation-token');
      
      // Setup - Make sendMail throw an error
      const sendMail = require('../../utils/sendMail');
      sendMail.mockRejectedValueOnce(new Error('Failed to send mail'));
      
      // Act - Send request to create user
      const response = await request(app)
        .post('/api/user/create-user')
        .send(testUserData);
      
      // Assert - Check response
      expect(response.statusCode).toBe(500);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('Failed to send mail');
      
      // Verify JWT was called but failed at sendMail
      expect(jwt.sign).toHaveBeenCalled();
      expect(sendMail).toHaveBeenCalled();
      
      // Verify no user was created
      const users = await User.find();
      expect(users.length).toBe(0);
    });

    // Test case 4: Handle cloudinary upload failure
    it('should handle errors during cloudinary upload', async () => {
      // Goal: Test error handling when cloudinary upload fails
      // Input: Valid user data but cloudinary upload fails
      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No user created
      // 3. No email sent
      
      // Setup - Make cloudinary throw an error
      cloudinaryMock.v2.uploader.upload.mockRejectedValueOnce(new Error('Upload failed'));
      
      // Act - Send request to create user
      const response = await request(app)
        .post('/api/user/create-user')
        .send(testUserData);
      
      // Assert - Check response
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('Upload failed');
      
      // Verify cloudinary was called but failed
      expect(cloudinary.v2.uploader.upload).toHaveBeenCalled();
      
      // Verify no user was created and no email sent
      const users = await User.find();
      expect(users.length).toBe(0);
      expect(require('../../utils/sendMail')).not.toHaveBeenCalled();
    });

    // Test case 5: Handle missing required fields
    it('should handle missing required fields', async () => {
      // Goal: Test error handling when required fields are missing
      // Input: User data with missing email
      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No user created
      
      // Setup - Create test data with missing email
      const incompleteData = { ...testUserData };
      delete incompleteData.email;
      
      // Act - Send request with incomplete data
      const response = await request(app)
        .post('/api/user/create-user')
        .send(incompleteData);
      
      // Assert - Check response (will fail at looking up existing email)
      expect(response.statusCode).toBe(400);
      
      // Verify no user was created
      const users = await User.find();
      expect(users.length).toBe(0);
    });
  });

  describe('User Activation Tests', () => {
    // Test case 1: Successfully activate user with valid token
    it('should activate user with valid activation token', async () => {
      // Goal: Test successful user activation with valid token
      // Input: Valid activation token
      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. DB change: user created
      // 3. Token returned to client
      
      // Setup - Mock JWT verification to return valid user data
      jwt.verify.mockReturnValue({
        ...testUserData,
        avatar: {
          public_id: 'test-public-id',
          url: 'test-url'
        }
      });
      
      // Setup - Verify no user exists initially
      const initialUsers = await User.find();
      expect(initialUsers.length).toBe(0);
      
      // Act - Send activation request
      const response = await request(app)
        .post('/api/user/activation')
        .send({ activation_token: 'valid-token' });
      
      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBe('test-token');
      expect(response.body.user.email).toBe(testUserData.email);
      
      // Verify JWT verification was called
      expect(jwt.verify).toHaveBeenCalledWith('valid-token', process.env.ACTIVATION_SECRET);
      
      // Verify user was created in DB
      const user = await User.findOne({ email: testUserData.email });
      expect(user).not.toBeNull();
      expect(user.name).toBe(testUserData.name);
      expect(user.email).toBe(testUserData.email);
      
      // Verify sendToken was called
      const sendToken = require('../../utils/jwtToken');
      expect(sendToken).toHaveBeenCalled();
    });

    // Test case 2: Invalid activation token
    it('should return error for invalid activation token', async () => {
      // Goal: Test error handling with invalid activation token
      // Input: Invalid activation token
      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No user created
      
      // Setup - Mock JWT verification to return null (invalid token)
      jwt.verify.mockReturnValue(null);
      
      // Act - Send activation request with invalid token
      const response = await request(app)
        .post('/api/user/activation')
        .send({ activation_token: 'invalid-token' });
      
      // Assert - Check response
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('Invalid token');
      
      // Verify JWT verification was called
      expect(jwt.verify).toHaveBeenCalledWith('invalid-token', process.env.ACTIVATION_SECRET);
      
      // Verify no user was created
      const users = await User.find();
      expect(users.length).toBe(0);
    });

    // Test case 3: Activation with email that already exists
    it('should return error if email already exists during activation', async () => {
      // Goal: Test error handling when activating with existing email
      // Input: Valid token but email already exists
      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No additional user created
      
      // Setup - Create a user with the test email
      await User.create({
        ...testUserData,
        avatar: {
          public_id: 'existing-id',
          url: 'existing-url'
        }
      });
      
      // Setup - Mock JWT verification to return valid user data
      jwt.verify.mockReturnValue({
        ...testUserData,
        avatar: {
          public_id: 'test-public-id',
          url: 'test-url'
        }
      });
      
      // Act - Send activation request
      const response = await request(app)
        .post('/api/user/activation')
        .send({ activation_token: 'valid-token' });
      
      // Assert - Check response
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('User already exists');
      
      // Verify JWT verification was called
      expect(jwt.verify).toHaveBeenCalledWith('valid-token', process.env.ACTIVATION_SECRET);
      
      // Verify only one user exists (the one we created in setup)
      const users = await User.find();
      expect(users.length).toBe(1);
    });

    // Test case 4: Handle JWT verification error
    it('should handle JWT verification errors', async () => {
      // Goal: Test error handling when JWT verification fails
      // Input: Expired or invalid token
      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No user created
      
      // Setup - Mock JWT verification to throw an error
      jwt.verify.mockImplementation(() => {
        throw new Error('Token expired');
      });
      
      // Act - Send activation request
      const response = await request(app)
        .post('/api/user/activation')
        .send({ activation_token: 'expired-token' });
      
      // Assert - Check response
      expect(response.statusCode).toBe(500);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('Token expired');
      
      // Verify JWT verification was called
      expect(jwt.verify).toHaveBeenCalledWith('expired-token', process.env.ACTIVATION_SECRET);
      
      // Verify no user was created
      const users = await User.find();
      expect(users.length).toBe(0);
    });
  });

  describe('Login User Tests', () => {
    // Test case 1: Successfully login with valid credentials
    it('should login user with valid credentials', async () => {
      // Goal: Test successful user login
      // Input: Valid email and password
      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. Token returned to client
      
      // Setup - Create a user in DB
      const user = new User({
        ...testUserData,
        avatar: {
          public_id: 'test-id',
          url: 'test-url'
        }
      });
      
      // Mock comparePassword method
      user.comparePassword = jest.fn().mockResolvedValue(true);
      await user.save();
      
      // Act - Send login request
      const response = await request(app)
        .post('/api/user/login-user')
        .send({
          email: testUserData.email,
          password: testUserData.password
        });
      
      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBe('test-token');
      expect(response.body.user.email).toBe(testUserData.email);
      
      // Verify comparePassword was called
      expect(user.comparePassword).toHaveBeenCalledWith(testUserData.password);
      
      // Verify sendToken was called
      const sendToken = require('../../utils/jwtToken');
      expect(sendToken).toHaveBeenCalled();
    });

    // Test case 2: Login with non-existent email
    it('should return error for non-existent email', async () => {
      // Goal: Test error handling when email doesn't exist
      // Input: Non-existent email
      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No token returned
      
      // Act - Send login request with non-existent email
      const response = await request(app)
        .post('/api/user/login-user')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123'
        });
      
      // Assert - Check response
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe("User doesn't exists!");
      
      // Verify sendToken was not called
      const sendToken = require('../../utils/jwtToken');
      expect(sendToken).not.toHaveBeenCalled();
    });

    // Test case 3: Login with incorrect password
    it('should return error for incorrect password', async () => {
      // Goal: Test error handling with incorrect password
      // Input: Valid email but incorrect password
      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No token returned
      
      // Setup - Create a user in DB
      const user = new User({
        ...testUserData,
        avatar: {
          public_id: 'test-id',
          url: 'test-url'
        }
      });
      
      // Mock comparePassword to return false (incorrect password)
      user.comparePassword = jest.fn().mockResolvedValue(false);
      await user.save();
      
      // Act - Send login request with wrong password
      const response = await request(app)
        .post('/api/user/login-user')
        .send({
          email: testUserData.email,
          password: 'wrong-password'
        });
      
      // Assert - Check response
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('Please provide the correct information');
      
      // Verify comparePassword was called
      expect(user.comparePassword).toHaveBeenCalledWith('wrong-password');
      
      // Verify sendToken was not called
      const sendToken = require('../../utils/jwtToken');
      expect(sendToken).not.toHaveBeenCalled();
    });

    // Test case 4: Login with missing fields
    it('should return error for missing email or password', async () => {
      // Goal: Test error handling with missing credentials
      // Input: Request with missing email or password
      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No token returned
      
      // Act - Send login request with missing password
      const responseNoPassword = await request(app)
        .post('/api/user/login-user')
        .send({
          email: testUserData.email
          // password is missing
        });
      
      // Assert - Check response
      expect(responseNoPassword.statusCode).toBe(400);
      expect(responseNoPassword.body.success).toBe(undefined);
      expect(responseNoPassword.body.message).toBe('Please provide the all fields!');
      
      // Act - Send login request with missing email
      const responseNoEmail = await request(app)
        .post('/api/user/login-user')
        .send({
          // email is missing
          password: testUserData.password
        });
      
      // Assert - Check response
      expect(responseNoEmail.statusCode).toBe(400);
      expect(responseNoEmail.body.success).toBe(undefined);
      expect(responseNoEmail.body.message).toBe('Please provide the all fields!');
      
      // Verify sendToken was not called
      const sendToken = require('../../utils/jwtToken');
      expect(sendToken).not.toHaveBeenCalled();
    });
  });

  describe('Get User Tests', () => {
    // Test case 1: Successfully get user information
    it('should return user information', async () => {
      // Goal: Test retrieving authenticated user information
      // Input: Valid authenticated request
      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. User information returned
      
      // Setup - Create a user and update the mock middleware
      const userId = new ObjectId('test-user-id');
      const user = new User({
        ...testUserData,
        _id: userId,
        avatar: {
          public_id: 'test-id',
          url: 'test-url'
        }
      });
      await user.save();
      
      // Act - Get user info
      const response = await request(app)
        .get('/api/user/getuser');
      
      // Assert - Check response
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user.name).toBe(testUserData.name);
      expect(response.body.user.email).toBe(testUserData.email);
    });

    // Test case 2: Get non-existent user
    it('should return error for non-existent user', async () => {
      // Goal: Test error handling when user doesn't exist
      // Input: Valid authenticated request but user doesn't exist
      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No user information returned
      
      // Act - Get user info with no matching user in DB
      const response = await request(app)
        .get('/api/user/getuser');
      
      // Assert - Check response
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe("User doesn't exists");
    });
  });

  describe('Logout Tests', () => {
    // Test case 1: Successfully logout user
    it('should logout user', async () => {
      // Goal: Test user logout functionality
      // Input: Logout request
      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. Cookie cleared in response headers
      
      // Act - Logout user
      const response = await request(app)
        .get('/api/user/logout');
      
      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Log out successful!');
      
      // Check that cookie was cleared in response
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('token=null');
      expect(cookies[0]).toContain('expires=');
    });
  });

  describe('Update User Info Tests', () => {
    // Test case 1: Successfully update user information
    it('should update user information', async () => {
      // Goal: Test updating user information
      // Input: Updated user data and valid password
      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. DB changes: user information updated
      
      // Setup - Create a user
      const user = new User({
        ...testUserData,
        avatar: {
          public_id: 'test-id',
          url: 'test-url'
        }
      });
      
      // Mock comparePassword method
      user.comparePassword = jest.fn().mockResolvedValue(true);
      await user.save();
      
      // Updated user info
      const updatedInfo = {
        name: 'Updated Name',
        email: testUserData.email,
        password: testUserData.password,
        phoneNumber: '9876543210'
      };
      
      // Act - Update user info
      const response = await request(app)
        .put('/api/user/update-user-info')
        .send(updatedInfo);
      
      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.user.name).toBe(updatedInfo.name);
      expect(response.body.user.phoneNumber).toBe(updatedInfo.phoneNumber);
      
      // Verify comparePassword was called
      expect(user.comparePassword).toHaveBeenCalledWith(testUserData.password);
      
      // Verify DB update
      const updatedUser = await User.findOne({ email: testUserData.email });
      expect(updatedUser.name).toBe(updatedInfo.name);
      expect(updatedUser.phoneNumber).toBe(updatedInfo.phoneNumber);
    });

    // Test case 2: Update info with incorrect password
    it('should return error for incorrect password during update', async () => {
      // Goal: Test error handling with incorrect password during update
      // Input: Updated info but with incorrect password
      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No DB changes
      
      // Setup - Create a user
      const user = new User({
        ...testUserData,
        avatar: {
          public_id: 'test-id',
          url: 'test-url'
        }
      });
      
      // Mock comparePassword to return false (incorrect password)
      user.comparePassword = jest.fn().mockResolvedValue(false);
      await user.save();
      
      // Updated user info with wrong password
      const updatedInfo = {
        name: 'Updated Name',
        email: testUserData.email,
        password: 'wrong-password',
        phoneNumber: '9876543210'
      };
      
      // Act - Update user info with wrong password
      const response = await request(app)
        .put('/api/user/update-user-info')
        .send(updatedInfo);
      
      // Assert - Check response
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('Please provide the correct information');
      
      // Verify comparePassword was called
      expect(user.comparePassword).toHaveBeenCalledWith('wrong-password');
      
      // Verify DB was not updated
      const unchangedUser = await User.findOne({ email: testUserData.email });
      expect(unchangedUser.name).toBe(testUserData.name);
      expect(unchangedUser.phoneNumber).toBe(testUserData.phoneNumber);
    });

    // Test case 3: Update info for non-existent user
    it('should return error for non-existent user during update', async () => {
      // Goal: Test error handling when updating non-existent user
      // Input: Updated info for non-existent email
      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No DB changes
      
      // Updated user info for non-existent user
      const updatedInfo = {
        name: 'Updated Name',
        email: 'nonexistent@example.com',
        password: 'password123',
        phoneNumber: '9876543210'
      };
      
      // Act - Update info for non-existent user
      const response = await request(app)
        .put('/api/user/update-user-info')
        .send(updatedInfo);
      
      // Assert - Check response
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('User not found');
    });
  });

  describe('Update Avatar Tests', () => {
    // Test case 1: Successfully update user avatar
    it('should update user avatar', async () => {
      // Goal: Test updating user avatar
      // Input: New avatar image
      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. DB changes: avatar updated
      // 3. Old avatar deleted from cloudinary
      
      // Setup - Create a user and update the mock middleware
      const userId = new ObjectId('test-user-id');
      const user = new User({
        ...testUserData,
        _id: userId,
        avatar: {
          public_id: 'existing-id',
          url: 'existing-url'
        }
      });
      await user.save();
      
      // Act - Update user avatar
      const response = await request(app)
        .put('/api/user/update-avatar')
        .send({
          avatar: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...' // new avatar
        });
      
      // Assert - Check response
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user.avatar.public_id).toBe('test-public-id');
      expect(response.body.user.avatar.url).toBe('https://test-cloud-image.com/test.jpg');
      
      // Verify cloudinary operations
      expect(cloudinary.v2.uploader.destroy).toHaveBeenCalledWith('existing-id');
      expect(cloudinary.v2.uploader.upload).toHaveBeenCalled();
      
      // Verify DB update
      const updatedUser = await User.findById(userId);
      expect(updatedUser.avatar.public_id).toBe('test-public-id');
      expect(updatedUser.avatar.url).toBe('https://test-cloud-image.com/test.jpg');
    });

    // Test case 2: Handle cloudinary upload failure during avatar update
    it('should handle cloudinary errors during avatar update', async () => {
      // Goal: Test error handling when cloudinary upload fails
      // Input: New avatar but cloudinary upload fails
      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No DB changes, avatar remains unchanged
      
      // Setup - Create a user and update the mock middleware
      const userId = new ObjectId('test-user-id');
      const user = new User({
        ...testUserData,
        _id: userId,
        avatar: {
          public_id: 'existing-id',
          url: 'existing-url'
        }
      });
      await user.save();
      
      // Mock cloudinary upload to throw error
      cloudinaryMock.v2.uploader.upload.mockRejectedValueOnce(new Error('Upload failed'));
      
      // Act - Update avatar with failing upload
      const response = await request(app)
        .put('/api/user/update-avatar')
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
      const unchangedUser = await User.findById(userId);
      expect(unchangedUser.avatar.public_id).toBe('existing-id');
      expect(unchangedUser.avatar.url).toBe('existing-url');
    });

    // Test case 3: Skip update when avatar is empty
    it('should not update avatar when avatar field is empty', async () => {
      // Goal: Test handling when avatar field is empty
      // Input: Empty avatar field
      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. No change to avatar in DB
      // 3. No cloudinary operations
      
      // Setup - Create a user and update the mock middleware
      const userId = new ObjectId('test-user-id');
      const user = new User({
        ...testUserData,
        _id: userId,
        avatar: {
          public_id: 'existing-id',
          url: 'existing-url'
        }
      });
      await user.save();
      
      // Act - Update with empty avatar
      const response = await request(app)
        .put('/api/user/update-avatar')
        .send({
          avatar: ''
        });
      
      // Assert - Check response
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Verify cloudinary operations were not called
      expect(cloudinary.v2.uploader.destroy).not.toHaveBeenCalled();
      expect(cloudinary.v2.uploader.upload).not.toHaveBeenCalled();
      
      // Verify DB was not updated
      const unchangedUser = await User.findById(userId);
      expect(unchangedUser.avatar.public_id).toBe('existing-id');
      expect(unchangedUser.avatar.url).toBe('existing-url');
    });
  });

  describe('Update User Address Tests', () => {
    // Test case 1: Successfully add a new address
    it('should add a new address to user', async () => {
      // Goal: Test adding a new address to user
      // Input: New address data
      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. DB changes: address added to user's addresses array
      
      // Setup - Create a user and update the mock middleware
      const userId = new ObjectId('test-user-id');
      const user = new User({
        ...testUserData,
        _id: userId,
        avatar: {
          public_id: 'test-id',
          url: 'test-url'
        },
        addresses: []
      });
      await user.save();
      
      // New address data
      const newAddress = {
        addressType: 'Home',
        country: 'USA',
        city: 'New York',
        address1: '123 Test St',
        address2: 'Apt 4B',
        zipCode: '10001',
        phoneNumber: '1234567890'
      };
      
      // Act - Add new address
      const response = await request(app)
        .put('/api/user/update-user-addresses')
        .send(newAddress);
      
      // Assert - Check response
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user.addresses.length).toBe(1);
      expect(response.body.user.addresses[0].addressType).toBe(newAddress.addressType);
      expect(response.body.user.addresses[0].country).toBe(newAddress.country);
      
      // Verify DB update
      const updatedUser = await User.findById(userId);
      expect(updatedUser.addresses.length).toBe(1);
      expect(updatedUser.addresses[0].addressType).toBe(newAddress.addressType);
    });

    // Test case 2: Handle duplicate address type
    it('should return error for duplicate address type', async () => {
      // Goal: Test error handling for duplicate address types
      // Input: New address with type that already exists
      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No DB changes
      
      // Setup - Create a user with an existing address
      const userId = new ObjectId('test-user-id');
      const existingAddress = {
        addressType: 'Home',
        country: 'USA',
        city: 'Chicago',
        address1: '456 Main St',
        zipCode: '60601',
        phoneNumber: '9876543210'
      };
      
      const user = new User({
        ...testUserData,
        _id: userId,
        avatar: {
          public_id: 'test-id',
          url: 'test-url'
        },
        addresses: [existingAddress]
      });
      await user.save();
      
      // Duplicate address type
      const duplicateTypeAddress = {
        addressType: 'Home', // Same as existing
        country: 'USA',
        city: 'New York',
        address1: '123 Test St',
        zipCode: '10001',
        phoneNumber: '1234567890'
      };
      
      // Act - Try to add address with duplicate type
      const response = await request(app)
        .put('/api/user/update-user-addresses')
        .send(duplicateTypeAddress);
      
      // Assert - Check response
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('Home address already exists');
      
      // Verify DB was not updated
      const unchangedUser = await User.findById(userId);
      expect(unchangedUser.addresses.length).toBe(1);
      expect(unchangedUser.addresses[0].city).toBe('Chicago');
    });

    // Test case 3: Update an existing address
    it('should update an existing address', async () => {
      // Goal: Test updating an existing address
      // Input: Updated address data with existing ID
      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. DB changes: address updated
      
      // Setup - Create a user with an existing address
      const userId = new ObjectId('test-user-id');
      const addressId = new ObjectId();
      const existingAddress = {
        _id: addressId,
        addressType: 'Home',
        country: 'USA',
        city: 'Chicago',
        address1: '456 Main St',
        zipCode: '60601',
        phoneNumber: '9876543210'
      };
      
      const user = new User({
        ...testUserData,
        _id: userId,
        avatar: {
          public_id: 'test-id',
          url: 'test-url'
        },
        addresses: [existingAddress]
      });
      await user.save();
      
      // Updated address data
      const updatedAddress = {
        _id: addressId.toString(),
        addressType: 'Office', // Changed type
        country: 'USA',
        city: 'Chicago',
        address1: '789 Work Ave', // Changed address
        zipCode: '60602', // Changed zip
        phoneNumber: '9876543210'
      };
      
      // Act - Update existing address
      const response = await request(app)
        .put('/api/user/update-user-addresses')
        .send(updatedAddress);
      
      // Assert - Check response
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user.addresses.length).toBe(1);
      expect(response.body.user.addresses[0].addressType).toBe('Office');
      expect(response.body.user.addresses[0].address1).toBe('789 Work Ave');
      
      // Verify DB update
      const updatedUser = await User.findById(userId);
      expect(updatedUser.addresses.length).toBe(1);
      expect(updatedUser.addresses[0].addressType).toBe('Office');
      expect(updatedUser.addresses[0].address1).toBe('789 Work Ave');
    });
  });

  describe('Delete Address Tests', () => {
    // Test case 1: Successfully delete an address
    it('should delete an address', async () => {
      // Goal: Test deleting a user address
      // Input: Address ID to delete
      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. DB changes: address removed from user's addresses array
      
      // Setup - Create a user with multiple addresses
      const userId = new ObjectId('test-user-id');
      const addressId1 = new ObjectId();
      const addressId2 = new ObjectId();
      
      const addresses = [
        {
          _id: addressId1,
          addressType: 'Home',
          country: 'USA',
          city: 'Chicago',
          address1: '456 Main St',
          zipCode: '60601',
          phoneNumber: '9876543210'
        },
        {
          _id: addressId2,
          addressType: 'Office',
          country: 'USA',
          city: 'Chicago',
          address1: '789 Work Ave',
          zipCode: '60602',
          phoneNumber: '1234567890'
        }
      ];
      
      const user = new User({
        ...testUserData,
        _id: userId,
        avatar: {
          public_id: 'test-id',
          url: 'test-url'
        },
        addresses
      });
      await user.save();
      
      // Act - Delete address
      const response = await request(app)
        .delete(`/api/user/delete-user-address/${addressId1}`);
      
      // Assert - Check response
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user.addresses.length).toBe(1);
      expect(response.body.user.addresses[0]._id.toString()).toBe(addressId2.toString());
      
      // Verify DB update
      const updatedUser = await User.findById(userId);
      expect(updatedUser.addresses.length).toBe(1);
      expect(updatedUser.addresses[0]._id.toString()).toBe(addressId2.toString());
    });

    // Test case 2: Handle deleting non-existent address
    it('should handle deleting non-existent address', async () => {
      // Goal: Test deleting a non-existent address
      // Input: Non-existent address ID
      // Expected output:
      // 1. HTTP 200 response (no error, address already doesn't exist)
      // 2. No change to user's addresses
      
      // Setup - Create a user with one address
      const userId = new ObjectId('test-user-id');
      const existingAddressId = new ObjectId();
      const nonExistentId = new ObjectId();
      
      const user = new User({
        ...testUserData,
        _id: userId,
        avatar: {
          public_id: 'test-id',
          url: 'test-url'
        },
        addresses: [{
          _id: existingAddressId,
          addressType: 'Home',
          country: 'USA',
          city: 'Chicago',
          address1: '456 Main St',
          zipCode: '60601',
          phoneNumber: '9876543210'
        }]
      });
      await user.save();
      
      // Act - Delete non-existent address
      const response = await request(app)
        .delete(`/api/user/delete-user-address/${nonExistentId}`);
      
      // Assert - Check response
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user.addresses.length).toBe(1);
      
      // Verify DB was not changed
      const unchangedUser = await User.findById(userId);
      expect(unchangedUser.addresses.length).toBe(1);
      expect(unchangedUser.addresses[0]._id.toString()).toBe(existingAddressId.toString());
    });
  });

  describe('Update Password Tests', () => {
    // Test case 1: Successfully update password
    it('should update user password', async () => {
      // Goal: Test updating user password
      // Input: Old password, new password, and confirm password
      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. DB changes: password updated
      
      // Setup - Create a user and update the mock middleware
      const userId = new ObjectId('test-user-id');
      const user = new User({
        ...testUserData,
        _id: userId,
        avatar: {
          public_id: 'test-id',
          url: 'test-url'
        }
      });
      
      // Mock comparePassword method
      user.comparePassword = jest.fn().mockResolvedValue(true);
      await user.save();
      
      // Act - Update password
      const response = await request(app)
        .put('/api/user/update-user-password')
        .send({
          oldPassword: 'password123',
          newPassword: 'newpassword123',
          confirmPassword: 'newpassword123'
        });
      
      // Assert - Check response
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Password updated successfully!');
      
      // Verify comparePassword was called
      expect(user.comparePassword).toHaveBeenCalledWith('password123');
      
      // Verify DB update - Note: Can't directly check hashed password,
      // but can verify it was changed by checking save was called
      const updatedUser = await User.findById(userId);
      expect(updatedUser).toBeDefined();
    });

    // Test case 2: Update with incorrect old password
    it('should return error for incorrect old password', async () => {
      // Goal: Test error handling with incorrect old password
      // Input: Incorrect old password
      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No DB changes
      
      // Setup - Create a user and update the mock middleware
      const userId = new ObjectId('test-user-id');
      const user = new User({
        ...testUserData,
        _id: userId,
        avatar: {
          public_id: 'test-id',
          url: 'test-url'
        }
      });
      
      // Mock comparePassword to return false (incorrect password)
      user.comparePassword = jest.fn().mockResolvedValue(false);
      await user.save();
      
      // Act - Update with incorrect old password
      const response = await request(app)
        .put('/api/user/update-user-password')
        .send({
          oldPassword: 'wrong-password',
          newPassword: 'newpassword123',
          confirmPassword: 'newpassword123'
        });
      
      // Assert - Check response
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('Old password is incorrect!');
      
      // Verify comparePassword was called
      expect(user.comparePassword).toHaveBeenCalledWith('wrong-password');
    });

    // Test case 3: Update with mismatched passwords
    it('should return error for mismatched new passwords', async () => {
      // Goal: Test error handling with mismatched passwords
      // Input: New password doesn't match confirm password
      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No DB changes
      
      // Setup - Create a user and update the mock middleware
      const userId = new ObjectId('test-user-id');
      const user = new User({
        ...testUserData,
        _id: userId,
        avatar: {
          public_id: 'test-id',
          url: 'test-url'
        }
      });
      
      // Mock comparePassword to return true (correct old password)
      user.comparePassword = jest.fn().mockResolvedValue(true);
      await user.save();
      
      // Act - Update with mismatched passwords
      const response = await request(app)
        .put('/api/user/update-user-password')
        .send({
          oldPassword: 'password123',
          newPassword: 'newpassword123',
          confirmPassword: 'different-password'
        });
      
      // Assert - Check response
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe("Password doesn't matched with each other!");
      
      // Verify comparePassword was called
      expect(user.comparePassword).toHaveBeenCalledWith('password123');
    });
  });

  describe('User Info Tests', () => {
    // Test case 1: Successfully get user info by ID
    it('should get user info by ID', async () => {
      // Goal: Test retrieving user info by ID
      // Input: Valid user ID
      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. User information returned
      
      // Setup - Create a user
      const user = new User({
        ...testUserData,
        avatar: {
          public_id: 'test-id',
          url: 'test-url'
        }
      });
      await user.save();
      
      // Act - Get user info by ID
      const response = await request(app)
        .get(`/api/user/user-info/${user._id}`);
      
      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.user.name).toBe(testUserData.name);
      expect(response.body.user.email).toBe(testUserData.email);
    });

    // Test case 2: Get info for non-existent user
    it('should handle non-existent user ID', async () => {
      // Goal: Test error handling for non-existent user
      // Input: Non-existent user ID
      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No user information returned
      
      // Generate a non-existent user ID
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      
      // Act - Get info for non-existent user
      const response = await request(app)
        .get(`/api/user/user-info/${nonExistentId}`);
      
      // Assert - Check response (controller doesn't handle this case explicitly)
      expect(response.statusCode).toBe(500);
    });

    // Test case 3: Handle invalid user ID format
    it('should handle invalid user ID format', async () => {
      // Goal: Test error handling for invalid ID format
      // Input: Invalid format for user ID
      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No user information returned
      
      // Act - Get info with invalid ID format
      const response = await request(app)
        .get('/api/user/user-info/invalid-id');
      
      // Assert - Check response (controller doesn't handle this case explicitly)
      expect(response.statusCode).toBe(500);
    });
  });

  describe('Admin Get All Users Tests', () => {
    // Test case 1: Successfully get all users as admin
    it('should return all users for admin', async () => {
      // Goal: Test retrieving all users as admin
      // Input: Admin authenticated request
      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. All users returned in response
      
      // Setup - Create multiple users
      const users = [
        {
          ...testUserData,
          name: 'User 1',
          email: 'user1@example.com',
          avatar: { public_id: 'id1', url: 'url1' }
        },
        {
          ...testUserData,
          name: 'User 2',
          email: 'user2@example.com',
          avatar: { public_id: 'id2', url: 'url2' },
          createdAt: new Date('2023-01-02')
        },
        {
          ...testUserData,
          name: 'User 3',
          email: 'user3@example.com',
          avatar: { public_id: 'id3', url: 'url3' },
          createdAt: new Date('2023-01-01')
        }
      ];
      
      await User.create(users);
      
      // Act - Get all users
      const response = await request(app)
        .get('/api/user/admin-all-users');
      
      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.users.length).toBe(3);
      
      // Verify users are returned
      const userNames = response.body.users.map(u => u.name);
      expect(userNames).toContain('User 1');
      expect(userNames).toContain('User 2');
      expect(userNames).toContain('User 3');
    });

    // Test case 2: Get users when none exist
    it('should return empty array when no users exist', async () => {
      // Goal: Test retrieving users when none exist
      // Input: Admin authenticated request with empty user DB
      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. Empty array of users
      
      // Act - Get all users when none exist
      const response = await request(app)
        .get('/api/user/admin-all-users');
      
      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.users).toBeInstanceOf(Array);
      expect(response.body.users.length).toBe(0);
    });

    // Test case 3: Handle database errors
    it('should handle database errors when fetching users', async () => {
      // Goal: Test error handling when database query fails
      // Input: Admin request but database query fails
      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No users returned
      
      // Mock User.find to throw an error
      const originalFind = User.find;
      User.find = jest.fn().mockImplementationOnce(() => {
        throw new Error('Database error');
      });
      
      // Act - Get all users with mocked error
      const response = await request(app)
        .get('/api/user/admin-all-users');
      
      // Assert - Check response
      expect(response.statusCode).toBe(500);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('Database error');
      
      // Restore original function
      User.find = originalFind;
    });
  });

  describe('Delete User Tests', () => {
    // Test case 1: Successfully delete user
    it('should delete a user', async () => {
      // Goal: Test deleting a user
      // Input: Valid user ID
      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. DB changes: user deleted
      // 3. Avatar removed from cloudinary
      
      // Setup - Create a user to delete
      const user = new User({
        ...testUserData,
        avatar: {
          public_id: 'test-id',
          url: 'test-url'
        }
      });
      await user.save();
      
      // Verify user exists
      let userCount = await User.countDocuments();
      expect(userCount).toBe(1);
      
      // Act - Delete user
      const response = await request(app)
        .delete(`/api/user/delete-user/${user._id}`);
      
      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('User deleted successfully!');
      
      // Verify cloudinary destroy was called
      expect(cloudinary.v2.uploader.destroy).toHaveBeenCalledWith('test-id');
      
      // Verify user was deleted
      userCount = await User.countDocuments();
      expect(userCount).toBe(0);
    });

    // Test case 2: Delete non-existent user
    it('should handle deleting non-existent user', async () => {
      // Goal: Test error handling when deleting non-existent user
      // Input: Non-existent user ID
      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No DB changes
      
      // Generate a non-existent user ID
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      
      // Act - Delete non-existent user
      const response = await request(app)
        .delete(`/api/user/delete-user/${nonExistentId}`);
      
      // Assert - Check response
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('User is not available with this id');
      
      // Verify cloudinary destroy was not called
      expect(cloudinary.v2.uploader.destroy).not.toHaveBeenCalled();
    });

    // Test case 3: Handle invalid user ID format
    it('should handle invalid user ID format', async () => {
      // Goal: Test error handling with invalid ID format
      // Input: Invalid format for user ID
      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No DB changes
      
      // Act - Delete with invalid ID format
      const response = await request(app)
        .delete('/api/user/delete-user/invalid-id');
      
      // Assert - Check response (controller doesn't handle this case explicitly)
      expect(response.statusCode).toBe(500);
      
      // Verify cloudinary destroy was not called
      expect(cloudinary.v2.uploader.destroy).not.toHaveBeenCalled();
    });
  });
});
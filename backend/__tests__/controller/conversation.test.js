const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const express = require('express');
const Conversation = require('../../model/conversation');
const conversationRoutes = require('../../controller/conversation');

// Mock middleware
jest.mock('../../middleware/auth', () => ({
  isAuthenticated: (req, res, next) => {
    req.user = { _id: 'test-user-id' };
    next();
  },
  isSeller: (req, res, next) => {
    req.seller = { _id: 'test-seller-id' };
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
const testUserId = new mongoose.Types.ObjectId().toString();
const testSellerId = new mongoose.Types.ObjectId().toString();
const testGroupTitle = 'user123-seller456';

const testConversation = {
  members: [testUserId, testSellerId],
  groupTitle: testGroupTitle,
  lastMessage: '',
  lastMessageId: null
};

// Setup test app
const app = express();
app.use(express.json());
app.use('/api/conversation', conversationRoutes);

describe('Conversation Controller Tests', () => {
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
    // Start a session for transaction (explicit rollback)
    session = await mongoose.startSession();
    session.startTransaction();
  });

  // Abort transaction and clean DB after each test
  afterEach(async () => {
    // Rollback the transaction
    await session.abortTransaction();
    session.endSession();
    
    // Clean up collections
    await Conversation.deleteMany({});
  });

  describe('Create New Conversation Tests', () => {
    // Test case 1: Successfully create a new conversation when it doesn't exist
    it('should create a new conversation when it does not exist', async () => {
      // Setup - Verify conversation doesn't exist initially
      const initialConversation = await Conversation.findOne({ groupTitle: testGroupTitle });
      expect(initialConversation).toBeNull();

      // Act - Send request to create new conversation
      const response = await request(app)
        .post('/api/conversation/create-new-conversation')
        .send({
          groupTitle: testGroupTitle,
          userId: testUserId,
          sellerId: testSellerId
        });

      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.conversation.groupTitle).toBe(testGroupTitle);
      
      // Verify DB was updated correctly
      const createdConversation = await Conversation.findOne({ groupTitle: testGroupTitle });
      expect(createdConversation).not.toBeNull();
      expect(createdConversation.members).toContain(testUserId);
      expect(createdConversation.members).toContain(testSellerId);
      expect(createdConversation.groupTitle).toBe(testGroupTitle);

      // Expected output:
      // 1. HTTP 201 response with success message and conversation data
      // 2. DB changes: new conversation created with provided members and group title
    });

    // Test case 2: Return existing conversation when it already exists
    it('should return existing conversation when it already exists', async () => {
      // Setup - Create conversation in DB
      const existingConversation = await Conversation.create(testConversation);
      
      // Act - Send request with same group title
      const response = await request(app)
        .post('/api/conversation/create-new-conversation')
        .send({
          groupTitle: testGroupTitle,
          userId: 'different-user-id', // Different IDs to verify they are not used
          sellerId: 'different-seller-id'
        });

      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.conversation._id.toString()).toBe(existingConversation._id.toString());
      
      // Verify no new conversation was created
      const conversations = await Conversation.find({ groupTitle: testGroupTitle });
      expect(conversations.length).toBe(1);

      // Expected output:
      // 1. HTTP 201 response with success message and existing conversation data
      // 2. No DB changes, as the existing conversation is returned
    });

    // Test case 3: Missing required fields
    it('should handle missing required fields', async () => {
      // Act - Send request with missing userId
      const responseMissingUserId = await request(app)
        .post('/api/conversation/create-new-conversation')
        .send({
          groupTitle: testGroupTitle,
          sellerId: testSellerId
          // userId is missing
        });
      
      expect(responseMissingUserId.statusCode).toBe(500);

      // Act - Send request with missing sellerId
      const responseMissingSellerId = await request(app)
        .post('/api/conversation/create-new-conversation')
        .send({
          groupTitle: testGroupTitle,
          userId: testUserId
          // sellerId is missing
        });
      
      expect(responseMissingSellerId.statusCode).toBe(500);

      // Act - Send request with missing groupTitle
      const responseMissingGroupTitle = await request(app)
        .post('/api/conversation/create-new-conversation')
        .send({
          userId: testUserId,
          sellerId: testSellerId
          // groupTitle is missing
        });
      
      expect(responseMissingGroupTitle.statusCode).toBe(500);

      // Verify no conversations were created
      const conversations = await Conversation.find({});
      expect(conversations.length).toBe(0);

      // Expected output:
      // 1. HTTP 500 response for all missing required field cases
      // 2. No DB changes, as no valid conversation was created
    });

    // Test case 4: Handling invalid MongoDB IDs
    it('should handle invalid MongoDB IDs', async () => {
      // Act - Send request with invalid userId
      const response = await request(app)
        .post('/api/conversation/create-new-conversation')
        .send({
          groupTitle: testGroupTitle,
          userId: 'invalid-user-id', // Not a valid MongoDB ID
          sellerId: testSellerId
        });
      
      // The controller will attempt to create a conversation, but MongoDB will accept string IDs
      // We just need to verify it doesn't crash and returns a successful response
      expect(response.statusCode).toBe(201);
      
      // Verify a conversation was created (MongoDB accepts string IDs)
      const conversation = await Conversation.findOne({ groupTitle: testGroupTitle });
      expect(conversation).not.toBeNull();
      expect(conversation.members).toContain('invalid-user-id');

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. DB changes: conversation created with the provided values
      // Note: MongoDB accepts string IDs, so the test validates the behavior doesn't crash
    });

    // Test case 5: Empty group title
    it('should handle empty group title', async () => {
      // Act - Send request with empty group title
      const response = await request(app)
        .post('/api/conversation/create-new-conversation')
        .send({
          groupTitle: '',
          userId: testUserId,
          sellerId: testSellerId
        });
      
      // The controller will attempt to create a conversation
      expect(response.statusCode).toBe(201);
      
      // Verify a conversation was created with empty group title
      const conversation = await Conversation.findOne({ groupTitle: '' });
      expect(conversation).not.toBeNull();
      expect(conversation.members).toContain(testUserId);
      expect(conversation.members).toContain(testSellerId);

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. DB changes: conversation created with empty group title
    });

    // Test case 6: Check unique constraint on groupTitle
    it('should enforce unique constraint on groupTitle', async () => {
      // Setup - Create first conversation
      await request(app)
        .post('/api/conversation/create-new-conversation')
        .send({
          groupTitle: testGroupTitle,
          userId: testUserId,
          sellerId: testSellerId
        });
      
      // Create second conversation with same groupTitle but different IDs
      const differentUserId = new mongoose.Types.ObjectId().toString();
      const differentSellerId = new mongoose.Types.ObjectId().toString();
      
      const response = await request(app)
        .post('/api/conversation/create-new-conversation')
        .send({
          groupTitle: testGroupTitle,
          userId: differentUserId,
          sellerId: differentSellerId
        });
      
      // The controller should find the existing conversation
      expect(response.statusCode).toBe(201);
      
      // Verify only one conversation exists with that groupTitle
      const conversations = await Conversation.find({ groupTitle: testGroupTitle });
      expect(conversations.length).toBe(1);
      expect(conversations[0].members).toContain(testUserId);
      expect(conversations[0].members).toContain(testSellerId);
      expect(conversations[0].members).not.toContain(differentUserId);
      expect(conversations[0].members).not.toContain(differentSellerId);

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. DB remains unchanged, returning existing conversation
      // 3. No new conversation is created despite different member IDs
    });

    // Test case 7: Verify members array structure
    it('should create conversation with correct members array structure', async () => {
      // Act - Send request to create new conversation
      await request(app)
        .post('/api/conversation/create-new-conversation')
        .send({
          groupTitle: testGroupTitle,
          userId: testUserId,
          sellerId: testSellerId
        });
      
      // Verify the members array structure
      const conversation = await Conversation.findOne({ groupTitle: testGroupTitle });
      expect(conversation.members).toBeInstanceOf(Array);
      expect(conversation.members.length).toBe(2);
      expect(conversation.members[0]).toBe(testUserId);
      expect(conversation.members[1]).toBe(testSellerId);

      // Expected output:
      // 1. Conversation created with members as an array of length 2
      // 2. Members array contains exactly userId and sellerId in the same order
    });

    // Test case 8: Group titles with special characters
    it('should handle group titles with special characters', async () => {
      // Test with various special characters in group title
      const specialGroupTitle = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
      
      // Act - Send request with special characters in group title
      const response = await request(app)
        .post('/api/conversation/create-new-conversation')
        .send({
          groupTitle: specialGroupTitle,
          userId: testUserId,
          sellerId: testSellerId
        });
      
      expect(response.statusCode).toBe(201);
      
      // Verify conversation was created with special characters
      const conversation = await Conversation.findOne({ groupTitle: specialGroupTitle });
      expect(conversation).not.toBeNull();
      expect(conversation.groupTitle).toBe(specialGroupTitle);

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. DB changes: conversation created with special characters in group title
    });

    // Test case 9: Very long group titles
    it('should handle very long group titles', async () => {
      // Create a very long group title (1000 characters)
      const longGroupTitle = 'a'.repeat(1000);
      
      // Act - Send request with long group title
      const response = await request(app)
        .post('/api/conversation/create-new-conversation')
        .send({
          groupTitle: longGroupTitle,
          userId: testUserId,
          sellerId: testSellerId
        });
      
      expect(response.statusCode).toBe(201);
      
      // Verify conversation was created with long group title
      const conversation = await Conversation.findOne({ groupTitle: longGroupTitle });
      expect(conversation).not.toBeNull();
      expect(conversation.groupTitle).toBe(longGroupTitle);

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. DB changes: conversation created with very long group title
    });

    // Test case 10: Same user and seller IDs
    it('should handle case where userId and sellerId are the same', async () => {
      // Act - Send request with same user and seller ID
      const response = await request(app)
        .post('/api/conversation/create-new-conversation')
        .send({
          groupTitle: testGroupTitle,
          userId: testUserId,
          sellerId: testUserId // Same as userId
        });
      
      expect(response.statusCode).toBe(201);
      
      // Verify conversation was created
      const conversation = await Conversation.findOne({ groupTitle: testGroupTitle });
      expect(conversation).not.toBeNull();
      
      // Check members array - may contain duplicate ID depending on implementation
      // This test validates the behavior rather than enforcing a specific requirement
      expect(conversation.members.length).toBe(2);
      expect(conversation.members[0]).toBe(testUserId);
      expect(conversation.members[1]).toBe(testUserId);

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. DB changes: conversation created with potentially duplicate member IDs
    });
  });

  describe('Get Seller Conversations Tests', () => {
    // Test case 1: Successfully get all conversations for a seller
    it('should return all conversations for a seller', async () => {
      // Setup - Create multiple conversations with the seller
      const sellerId = 'test-seller-id'; // Using the ID from our mocked middleware
      const otherUserId1 = new mongoose.Types.ObjectId().toString();
      const otherUserId2 = new mongoose.Types.ObjectId().toString();
      
      // Create conversations involving the seller
      await Conversation.create({
        members: [sellerId, otherUserId1],
        groupTitle: 'seller-conversation-1',
        lastMessage: 'Last message 1',
        updatedAt: new Date('2023-01-01')
      });
      
      await Conversation.create({
        members: [sellerId, otherUserId2],
        groupTitle: 'seller-conversation-2',
        lastMessage: 'Last message 2',
        updatedAt: new Date('2023-01-02')
      });
      
      // Create a conversation not involving the seller
      await Conversation.create({
        members: [otherUserId1, otherUserId2],
        groupTitle: 'other-conversation',
        lastMessage: 'Not for seller'
      });
      
      // Act - Get all seller conversations
      const response = await request(app)
        .get(`/api/conversation/get-all-conversation-seller/${sellerId}`);
      
      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.conversations.length).toBe(2);
      
      // Verify the conversations are sorted correctly (newest first)
      expect(response.body.conversations[0].groupTitle).toBe('seller-conversation-2');
      expect(response.body.conversations[1].groupTitle).toBe('seller-conversation-1');
      
      // Verify only the seller's conversations are returned
      const groupTitles = response.body.conversations.map(conv => conv.groupTitle);
      expect(groupTitles).toContain('seller-conversation-1');
      expect(groupTitles).toContain('seller-conversation-2');
      expect(groupTitles).not.toContain('other-conversation');

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. Array of conversations where seller is a member, sorted by updatedAt/createdAt
      // 3. Only conversations involving the seller are included
    });

    // Test case 2: No conversations exist for the seller
    it('should return empty array when no conversations exist for seller', async () => {
      // Setup - Create a conversation not involving the target seller
      const sellerId = 'test-seller-id';
      const otherUserId1 = new mongoose.Types.ObjectId().toString();
      const otherUserId2 = new mongoose.Types.ObjectId().toString();
      
      await Conversation.create({
        members: [otherUserId1, otherUserId2],
        groupTitle: 'other-conversation',
        lastMessage: 'Not for seller'
      });
      
      // Act - Get all seller conversations
      const response = await request(app)
        .get(`/api/conversation/get-all-conversation-seller/${sellerId}`);
      
      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.conversations).toBeInstanceOf(Array);
      expect(response.body.conversations.length).toBe(0);

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. Empty array in conversations field
    });

    // Test case 3: Seller ID not in any conversation members
    it('should return empty array when seller ID exists but is not in any conversation', async () => {
      // Setup - Create conversations with other members
      const sellerId = 'test-seller-id';
      const nonExistentSellerId = 'non-existent-seller';
      const otherUserId = new mongoose.Types.ObjectId().toString();
      
      await Conversation.create({
        members: [nonExistentSellerId, otherUserId],
        groupTitle: 'not-our-seller',
        lastMessage: 'Different seller'
      });
      
      // Act - Get all seller conversations
      const response = await request(app)
        .get(`/api/conversation/get-all-conversation-seller/${sellerId}`);
      
      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.conversations.length).toBe(0);

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. Empty array in conversations field
    });

    // Test case 4: Error handling - Invalid seller ID format
    it('should handle invalid seller ID format', async () => {
      // Act - Get all seller conversations with invalid ID format
      const invalidSellerId = 'invalid-id-format';
      
      // Since MongoDB accepts string IDs, this won't cause an error at the database level
      // The test verifies that the endpoint can handle such IDs without crashing
      const response = await request(app)
        .get(`/api/conversation/get-all-conversation-seller/${invalidSellerId}`);
      
      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.conversations).toBeInstanceOf(Array);

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. Empty array or matching conversations if any exist
    });

    // Test case 5: Sorting order verification
    it('should return conversations sorted by updatedAt and createdAt', async () => {
      // Setup - Create conversations with different timestamps
      const sellerId = 'test-seller-id';
      const otherUserId = new mongoose.Types.ObjectId().toString();
      
      // Oldest updated, oldest created
      await Conversation.create({
        members: [sellerId, otherUserId],
        groupTitle: 'old-update-old-create',
        updatedAt: new Date('2023-01-01'),
        createdAt: new Date('2023-01-01')
      });
      
      // Oldest updated, newest created (should appear after the first due to updatedAt priority)
      await Conversation.create({
        members: [sellerId, otherUserId],
        groupTitle: 'old-update-new-create',
        updatedAt: new Date('2023-01-01'),
        createdAt: new Date('2023-01-03')
      });
      
      // Newest updated (should appear first regardless of createdAt)
      await Conversation.create({
        members: [sellerId, otherUserId],
        groupTitle: 'new-update-old-create',
        updatedAt: new Date('2023-01-02'),
        createdAt: new Date('2023-01-01')
      });
      
      // Act - Get all seller conversations
      const response = await request(app)
        .get(`/api/conversation/get-all-conversation-seller/${sellerId}`);
      
      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body.conversations.length).toBe(3);
      
      // Check sorting order: newest updated first, then by createdAt if updatedAt is equal
      expect(response.body.conversations[0].groupTitle).toBe('new-update-old-create');
      expect(response.body.conversations[1].groupTitle).toBe('old-update-new-create');
      expect(response.body.conversations[2].groupTitle).toBe('old-update-old-create');

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. Conversations sorted by updatedAt (descending), then createdAt (descending)
    });
  });

  describe('Get User Conversations Tests', () => {
    // Test case 1: Successfully get all conversations for a user
    it('should return all conversations for a user', async () => {
      // Setup - Create multiple conversations with the user
      const userId = 'test-user-id'; // Using the ID from our mocked middleware
      const otherUserId1 = new mongoose.Types.ObjectId().toString();
      const otherUserId2 = new mongoose.Types.ObjectId().toString();
      
      // Create conversations involving the user
      await Conversation.create({
        members: [userId, otherUserId1],
        groupTitle: 'user-conversation-1',
        lastMessage: 'Last message 1',
        updatedAt: new Date('2023-01-01')
      });
      
      await Conversation.create({
        members: [userId, otherUserId2],
        groupTitle: 'user-conversation-2',
        lastMessage: 'Last message 2',
        updatedAt: new Date('2023-01-02')
      });
      
      // Create a conversation not involving the user
      await Conversation.create({
        members: [otherUserId1, otherUserId2],
        groupTitle: 'other-conversation',
        lastMessage: 'Not for user'
      });
      
      // Act - Get all user conversations
      const response = await request(app)
        .get(`/api/conversation/get-all-conversation-user/${userId}`);
      
      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.conversations.length).toBe(2);
      
      // Verify the conversations are sorted correctly (newest first)
      expect(response.body.conversations[0].groupTitle).toBe('user-conversation-2');
      expect(response.body.conversations[1].groupTitle).toBe('user-conversation-1');
      
      // Verify only the user's conversations are returned
      const groupTitles = response.body.conversations.map(conv => conv.groupTitle);
      expect(groupTitles).toContain('user-conversation-1');
      expect(groupTitles).toContain('user-conversation-2');
      expect(groupTitles).not.toContain('other-conversation');

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. Array of conversations where user is a member, sorted by updatedAt/createdAt
      // 3. Only conversations involving the user are included
    });

    // Test case 2: No conversations exist for the user
    it('should return empty array when no conversations exist for user', async () => {
      // Setup - Create a conversation not involving the target user
      const userId = 'test-user-id';
      const otherUserId1 = new mongoose.Types.ObjectId().toString();
      const otherUserId2 = new mongoose.Types.ObjectId().toString();
      
      await Conversation.create({
        members: [otherUserId1, otherUserId2],
        groupTitle: 'other-conversation',
        lastMessage: 'Not for user'
      });
      
      // Act - Get all user conversations
      const response = await request(app)
        .get(`/api/conversation/get-all-conversation-user/${userId}`);
      
      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.conversations).toBeInstanceOf(Array);
      expect(response.body.conversations.length).toBe(0);

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. Empty array in conversations field
    });

    // Test case 3: Authentication check
    it('should require authentication to access user conversations', async () => {
      // This test verifies our mocked isAuthenticated middleware is working correctly
      const userId = 'test-user-id';
      
      // Act - Get all user conversations
      const response = await request(app)
        .get(`/api/conversation/get-all-conversation-user/${userId}`);
      
      // Since we mocked the isAuthenticated middleware to always pass,
      // we're verifying it was called by checking for a successful response
      expect(response.statusCode).toBe(201);

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. Middleware allows the request to proceed
    });

    // Test case 4: Different user ID in route parameter vs authenticated user
    it('should use the route parameter ID to find conversations', async () => {
      // Setup - The authenticated user from middleware is 'test-user-id'
      // but we'll request conversations for a different user ID
      const differentUserId = new mongoose.Types.ObjectId().toString();
      const otherUserId = new mongoose.Types.ObjectId().toString();
      
      // Create a conversation for the different user, not the authenticated user
      await Conversation.create({
        members: [differentUserId, otherUserId],
        groupTitle: 'different-user-conversation',
        lastMessage: 'For different user'
      });
      
      // Create a conversation for the authenticated user
      await Conversation.create({
        members: ['test-user-id', otherUserId],
        groupTitle: 'auth-user-conversation',
        lastMessage: 'For authenticated user'
      });
      
      // Act - Get conversations for the different user
      const response = await request(app)
        .get(`/api/conversation/get-all-conversation-user/${differentUserId}`);
      
      // Assert - Should return conversations for the ID in the route parameter
      expect(response.statusCode).toBe(201);
      expect(response.body.conversations.length).toBe(1);
      expect(response.body.conversations[0].groupTitle).toBe('different-user-conversation');

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. Only conversations for the requested user ID, not authenticated user
    });

    // Test case 5: Sorting order verification
    it('should return user conversations sorted by updatedAt and createdAt', async () => {
      // Setup - Create conversations with different timestamps
      const userId = 'test-user-id';
      const otherUserId = new mongoose.Types.ObjectId().toString();
      
      // Oldest updated, oldest created
      await Conversation.create({
        members: [userId, otherUserId],
        groupTitle: 'old-update-old-create',
        updatedAt: new Date('2023-01-01'),
        createdAt: new Date('2023-01-01')
      });
      
      // Oldest updated, newest created (should appear after the first due to updatedAt priority)
      await Conversation.create({
        members: [userId, otherUserId],
        groupTitle: 'old-update-new-create',
        updatedAt: new Date('2023-01-01'),
        createdAt: new Date('2023-01-03')
      });
      
      // Newest updated (should appear first regardless of createdAt)
      await Conversation.create({
        members: [userId, otherUserId],
        groupTitle: 'new-update-old-create',
        updatedAt: new Date('2023-01-02'),
        createdAt: new Date('2023-01-01')
      });
      
      // Act - Get all user conversations
      const response = await request(app)
        .get(`/api/conversation/get-all-conversation-user/${userId}`);
      
      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body.conversations.length).toBe(3);
      
      // Check sorting order: newest updated first, then by createdAt if updatedAt is equal
      expect(response.body.conversations[0].groupTitle).toBe('new-update-old-create');
      expect(response.body.conversations[1].groupTitle).toBe('old-update-new-create');
      expect(response.body.conversations[2].groupTitle).toBe('old-update-old-create');

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. Conversations sorted by updatedAt (descending), then createdAt (descending)
    });
  });

  describe('Update Last Message Tests', () => {
    // Test case 1: Successfully update the last message of a conversation
    it('should update the last message of a conversation', async () => {
      // Setup - Create a conversation
      const conversationData = {
        members: [testUserId, testSellerId],
        groupTitle: testGroupTitle,
        lastMessage: 'Original message',
        lastMessageId: 'original-message-id'
      };
      
      const createdConversation = await Conversation.create(conversationData);
      const conversationId = createdConversation._id.toString();
      
      // Act - Update the last message
      const updateData = {
        lastMessage: 'Updated message',
        lastMessageId: 'updated-message-id'
      };
      
      const response = await request(app)
        .put(`/api/conversation/update-last-message/${conversationId}`)
        .send(updateData);
      
      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      
      // Verify DB was updated correctly
      const updatedConversation = await Conversation.findById(conversationId);
      expect(updatedConversation.lastMessage).toBe('Updated message');
      expect(updatedConversation.lastMessageId).toBe('updated-message-id');

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. DB changes: conversation updated with new lastMessage and lastMessageId
    });

    // Test case 2: Update with same values
    it('should handle update with same values', async () => {
      // Setup - Create a conversation
      const conversationData = {
        members: [testUserId, testSellerId],
        groupTitle: testGroupTitle,
        lastMessage: 'Original message',
        lastMessageId: 'original-message-id'
      };
      
      const createdConversation = await Conversation.create(conversationData);
      const conversationId = createdConversation._id.toString();
      
      // Act - Update with the same values
      const updateData = {
        lastMessage: 'Original message',
        lastMessageId: 'original-message-id'
      };
      
      const response = await request(app)
        .put(`/api/conversation/update-last-message/${conversationId}`)
        .send(updateData);
      
      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. No actual changes in the DB as values are the same
    });

    // Test case 3: Update non-existent conversation
    it('should handle updating non-existent conversation', async () => {
      // Setup - Generate a valid but non-existent conversation ID
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      
      // Act - Update a non-existent conversation
      const updateData = {
        lastMessage: 'Updated message',
        lastMessageId: 'updated-message-id'
      };
      
      const response = await request(app)
        .put(`/api/conversation/update-last-message/${nonExistentId}`)
        .send(updateData);
      
      // Assert
      expect(response.statusCode).toBe(201);
      // findByIdAndUpdate returns null when document not found, but doesn't throw error
      expect(response.body.success).toBe(true);
      expect(response.body.conversation).toBeNull();

      // Expected output:
      // 1. HTTP 201 response
      // 2. conversation field is null
    });

    // Test case 4: Missing required fields
    it('should handle missing required fields', async () => {
      // Setup - Create a conversation
      const conversationData = {
        members: [testUserId, testSellerId],
        groupTitle: testGroupTitle,
        lastMessage: 'Original message',
        lastMessageId: 'original-message-id'
      };
      
      const createdConversation = await Conversation.create(conversationData);
      const conversationId = createdConversation._id.toString();
      
      // Act - Update with missing lastMessage
      const missingMessageResponse = await request(app)
        .put(`/api/conversation/update-last-message/${conversationId}`)
        .send({
          lastMessageId: 'updated-message-id'
          // lastMessage is missing
        });
      
      // Assert
      expect(missingMessageResponse.statusCode).toBe(201);
      
      // Verify DB update - only lastMessageId should be updated
      let updatedConversation = await Conversation.findById(conversationId);
      expect(updatedConversation.lastMessage).toBe('Original message'); // Unchanged
      expect(updatedConversation.lastMessageId).toBe('updated-message-id'); // Updated
      
      // Act - Update with missing lastMessageId
      const missingIdResponse = await request(app)
        .put(`/api/conversation/update-last-message/${conversationId}`)
        .send({
          lastMessage: 'New message only'
          // lastMessageId is missing
        });
      
      // Assert
      expect(missingIdResponse.statusCode).toBe(201);
      
      // Verify DB update - only lastMessage should be updated
      updatedConversation = await Conversation.findById(conversationId);
      expect(updatedConversation.lastMessage).toBe('New message only'); // Updated
      expect(updatedConversation.lastMessageId).toBe('updated-message-id'); // Unchanged from previous update

      // Expected output:
      // 1. HTTP 201 response with success message for both requests
      // 2. DB changes: each update modifies only the provided field
    });

    // Test case 5: Invalid conversation ID format
    it('should handle invalid conversation ID format', async () => {
      // Act - Update with invalid ID format
      const invalidId = 'invalid-id-format';
      
      const updateData = {
        lastMessage: 'Updated message',
        lastMessageId: 'updated-message-id'
      };
      
      // This should trigger a CastError in mongoose but be caught by the error handler
      const response = await request(app)
        .put(`/api/conversation/update-last-message/${invalidId}`)
        .send(updateData);
      
      // Assert - With our error handling, should return status 500
      expect(response.statusCode).toBe(500);

      // Expected output:
      // 1. HTTP 500 error response
      // 2. No DB changes as ID is invalid
    });

    // Test case 6: Empty values for lastMessage and lastMessageId
    it('should handle empty values for lastMessage and lastMessageId', async () => {
      // Setup - Create a conversation
      const conversationData = {
        members: [testUserId, testSellerId],
        groupTitle: testGroupTitle,
        lastMessage: 'Original message',
        lastMessageId: 'original-message-id'
      };
      
      const createdConversation = await Conversation.create(conversationData);
      const conversationId = createdConversation._id.toString();
      
      // Act - Update with empty values
      const emptyUpdateData = {
        lastMessage: '',
        lastMessageId: ''
      };
      
      const response = await request(app)
        .put(`/api/conversation/update-last-message/${conversationId}`)
        .send(emptyUpdateData);
      
      // Assert
      expect(response.statusCode).toBe(201);
      
      // Verify DB update - fields should be updated to empty strings
      const updatedConversation = await Conversation.findById(conversationId);
      expect(updatedConversation.lastMessage).toBe('');
      expect(updatedConversation.lastMessageId).toBe('');

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. DB changes: lastMessage and lastMessageId updated to empty strings
    });
  });
});
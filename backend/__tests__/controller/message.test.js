const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const express = require('express');
const Messages = require('../../model/messages');
const messageRoutes = require('../../controller/message');

// Mock cloudinary
jest.mock('cloudinary', () => ({
  v2: {
    uploader: {
      upload: jest.fn().mockImplementation((image, options) => {
        return Promise.resolve({
          public_id: 'test-public-id',
          url: 'https://test-cloud-image.com/test.jpg'
        });
      })
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
const testConversationId = new mongoose.Types.ObjectId().toString();
const testSenderId = new mongoose.Types.ObjectId().toString();

const testMessage = {
  conversationId: testConversationId,
  sender: testSenderId,
  text: 'Hello, this is a test message',
  createdAt: new Date(),
  updatedAt: new Date()
};

const testMessageWithImage = {
  ...testMessage,
  images: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD' // Base64 image data stub
};

// Setup test app
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use('/api/message', messageRoutes);

describe('Message Controller Tests', () => {
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
    await Messages.deleteMany({});
  });

  describe('Create New Message Tests', () => {
    // Test case 1: Successfully create a new text message
    it('should create a new text message without image', async () => {
      // Setup - Verify no messages exist initially
      const initialMessages = await Messages.find({ conversationId: testConversationId });
      expect(initialMessages.length).toBe(0);

      // Act - Send request to create new message
      const response = await request(app)
        .post('/api/message/create-new-message')
        .send(testMessage);

      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message.text).toBe(testMessage.text);
      expect(response.body.message.sender).toBe(testSenderId);
      expect(response.body.message.conversationId).toBe(testConversationId);
      expect(response.body.message.images).toBeUndefined();
      
      // Verify DB was updated correctly
      const createdMessage = await Messages.findOne({ conversationId: testConversationId });
      expect(createdMessage).not.toBeNull();
      expect(createdMessage.text).toBe(testMessage.text);
      expect(createdMessage.sender).toBe(testSenderId);
      expect(createdMessage.conversationId).toBe(testConversationId);
      expect(createdMessage.images).toBeUndefined();

      // Expected output:
      // 1. HTTP 201 response with success message and message data
      // 2. DB changes: new message created with provided text, sender, conversationId
      // 3. Message saved without images
    });

    // Test case 2: Successfully create a new message with image
    it('should create a new message with image', async () => {
      // Act - Send request to create new message with image
      const response = await request(app)
        .post('/api/message/create-new-message')
        .send(testMessageWithImage);

      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message.text).toBe(testMessage.text);
      expect(response.body.message.images).toBeDefined();
      expect(response.body.message.images.public_id).toBe('test-public-id');
      expect(response.body.message.images.url).toBe('https://test-cloud-image.com/test.jpg');
      
      // Verify DB was updated correctly
      const createdMessage = await Messages.findOne({ conversationId: testConversationId });
      expect(createdMessage).not.toBeNull();
      expect(createdMessage.text).toBe(testMessage.text);
      expect(createdMessage.images).toBeDefined();
      expect(createdMessage.images.public_id).toBe('test-public-id');
      expect(createdMessage.images.url).toBe('https://test-cloud-image.com/test.jpg');

      // Expected output:
      // 1. HTTP 201 response with success message and message data
      // 2. DB changes: new message created with provided text and cloudinary image data
      // 3. Message saved with image public_id and url
    });

    // Test case 3: Missing required fields
    it('should handle missing required fields', async () => {
      // Act - Send request with missing conversationId
      const responseMissingConversationId = await request(app)
        .post('/api/message/create-new-message')
        .send({
          sender: testSenderId,
          text: 'Test message'
          // conversationId is missing
        });
      
      expect(responseMissingConversationId.statusCode).toBe(500);

      // Act - Send request with missing sender
      const responseMissingSender = await request(app)
        .post('/api/message/create-new-message')
        .send({
          conversationId: testConversationId,
          text: 'Test message'
          // sender is missing
        });
      
      expect(responseMissingSender.statusCode).toBe(500);

      // Verify no messages were created
      const messages = await Messages.find({});
      expect(messages.length).toBe(0);

      // Expected output:
      // 1. HTTP 500 response for all missing required field cases
      // 2. No DB changes, as no valid message was created
    });

    // Test case 4: Empty text field
    it('should handle message with empty text field', async () => {
      // Act - Send request with empty text
      const response = await request(app)
        .post('/api/message/create-new-message')
        .send({
          ...testMessage,
          text: ''
        });
      
      // Assert - Should still create the message with empty text
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message.text).toBe('');
      
      // Verify DB
      const createdMessage = await Messages.findOne({ conversationId: testConversationId });
      expect(createdMessage).not.toBeNull();
      expect(createdMessage.text).toBe('');

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. DB changes: message created with empty text field
    });

    // Test case 5: Image without text
    it('should create a message with image but no text', async () => {
      // Act - Send request with image but empty text
      const response = await request(app)
        .post('/api/message/create-new-message')
        .send({
          ...testMessageWithImage,
          text: ''
        });
      
      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message.text).toBe('');
      expect(response.body.message.images).toBeDefined();
      
      // Verify DB
      const createdMessage = await Messages.findOne({ conversationId: testConversationId });
      expect(createdMessage).not.toBeNull();
      expect(createdMessage.text).toBe('');
      expect(createdMessage.images).toBeDefined();

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. DB changes: message created with empty text but with image
    });

    // Test case 6: Long message text
    it('should handle messages with very long text', async () => {
      // Create a long text message (1000 characters)
      const longText = 'a'.repeat(1000);
      
      // Act - Send request with long text
      const response = await request(app)
        .post('/api/message/create-new-message')
        .send({
          ...testMessage,
          text: longText
        });
      
      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message.text).toBe(longText);
      expect(response.body.message.text.length).toBe(1000);
      
      // Verify DB
      const createdMessage = await Messages.findOne({ conversationId: testConversationId });
      expect(createdMessage).not.toBeNull();
      expect(createdMessage.text).toBe(longText);
      expect(createdMessage.text.length).toBe(1000);

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. DB changes: message created with very long text
    });

    // Test case 7: Handle cloudinary upload failure
    it('should handle cloudinary upload failure', async () => {
      // Mock cloudinary to throw an error
      const originalCloudinaryUpload = require('cloudinary').v2.uploader.upload;
      require('cloudinary').v2.uploader.upload = jest.fn().mockImplementationOnce(() => {
        throw new Error('Cloudinary upload failed');
      });
      
      // Act - Send request with image that will fail to upload
      const response = await request(app)
        .post('/api/message/create-new-message')
        .send(testMessageWithImage);
      
      // Assert - Should return an error
      expect(response.statusCode).toBe(500);
      
      // Verify no messages were created
      const messages = await Messages.find({});
      expect(messages.length).toBe(0);
      
      // Restore the original function
      require('cloudinary').v2.uploader.upload = originalCloudinaryUpload;

      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No DB changes as upload failed
    });
  });

  describe('Get All Messages Tests', () => {
    // Test case 1: Successfully get all messages for a conversation
    it('should return all messages for a conversation', async () => {
      // Setup - Create multiple messages for the conversation
      const message1 = new Messages({
        conversationId: testConversationId,
        sender: testSenderId,
        text: 'Message 1',
        createdAt: new Date('2023-01-01')
      });
      
      const message2 = new Messages({
        conversationId: testConversationId,
        sender: testSenderId,
        text: 'Message 2',
        createdAt: new Date('2023-01-02')
      });
      
      // Create a message for a different conversation
      const differentConversationId = new mongoose.Types.ObjectId().toString();
      const message3 = new Messages({
        conversationId: differentConversationId,
        sender: testSenderId,
        text: 'Different conversation',
        createdAt: new Date('2023-01-03')
      });
      
      await message1.save();
      await message2.save();
      await message3.save();
      
      // Act - Get all messages for the conversation
      const response = await request(app)
        .get(`/api/message/get-all-messages/${testConversationId}`);
      
      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.messages.length).toBe(2);
      
      // Verify only messages for the target conversation are returned
      const messageTexts = response.body.messages.map(msg => msg.text);
      expect(messageTexts).toContain('Message 1');
      expect(messageTexts).toContain('Message 2');
      expect(messageTexts).not.toContain('Different conversation');

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. Array of 2 messages for the conversation
      // 3. Only messages for the specified conversation ID are included
    });

    // Test case 2: No messages exist for the conversation
    it('should return empty array when no messages exist for conversation', async () => {
      // Setup - Create a message for a different conversation
      const differentConversationId = new mongoose.Types.ObjectId().toString();
      const message = new Messages({
        conversationId: differentConversationId,
        sender: testSenderId,
        text: 'Different conversation'
      });
      
      await message.save();
      
      // Act - Get all messages for a conversation with no messages
      const response = await request(app)
        .get(`/api/message/get-all-messages/${testConversationId}`);
      
      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.messages).toBeInstanceOf(Array);
      expect(response.body.messages.length).toBe(0);

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. Empty array in messages field
    });

    // Test case 3: Get messages for non-existent conversation ID
    it('should return empty array for non-existent conversation ID', async () => {
      // Setup - Create a message for an existing conversation
      const message = new Messages({
        conversationId: testConversationId,
        sender: testSenderId,
        text: 'Existing conversation'
      });
      
      await message.save();
      
      // Act - Get messages for non-existent conversation ID
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      const response = await request(app)
        .get(`/api/message/get-all-messages/${nonExistentId}`);
      
      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.messages).toBeInstanceOf(Array);
      expect(response.body.messages.length).toBe(0);

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. Empty array in messages field
    });

    // Test case 4: Invalid conversation ID format
    it('should handle invalid conversation ID format', async () => {
      // Act - Get messages with invalid ID format
      const invalidId = 'invalid-id-format';
      
      // This should trigger a CastError in mongoose but be caught by the error handler
      const response = await request(app)
        .get(`/api/message/get-all-messages/${invalidId}`);
      
      // Assert - With our error handling, should return status 500
      expect(response.statusCode).toBe(500);

      // Expected output:
      // 1. HTTP 500 error response
      // 2. Error message about invalid ID format
    });

    // Test case 5: Large number of messages
    it('should handle retrieving a large number of messages', async () => {
      // Setup - Create many messages for the conversation (50)
      const messagesPromises = [];
      for (let i = 0; i < 50; i++) {
        const message = new Messages({
          conversationId: testConversationId,
          sender: testSenderId,
          text: `Message ${i+1}`
        });
        messagesPromises.push(message.save());
      }
      
      await Promise.all(messagesPromises);
      
      // Act - Get all messages for the conversation
      const response = await request(app)
        .get(`/api/message/get-all-messages/${testConversationId}`);
      
      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.messages.length).toBe(50);

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. Array of 50 messages for the conversation
    });

    // Test case 6: Messages with and without images
    it('should correctly retrieve messages with and without images', async () => {
      // Setup - Create message with text only
      const textOnlyMessage = new Messages({
        conversationId: testConversationId,
        sender: testSenderId,
        text: 'Text only message'
      });
      
      // Setup - Create message with image
      const messageWithImage = new Messages({
        conversationId: testConversationId,
        sender: testSenderId,
        text: 'Message with image',
        images: {
          public_id: 'test-public-id',
          url: 'https://test-cloud-image.com/test.jpg'
        }
      });
      
      await textOnlyMessage.save();
      await messageWithImage.save();
      
      // Act - Get all messages
      const response = await request(app)
        .get(`/api/message/get-all-messages/${testConversationId}`);
      
      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body.messages.length).toBe(2);
      
      // Find the message with image in the response
      const imageMessage = response.body.messages.find(msg => msg.text === 'Message with image');
      expect(imageMessage).toBeDefined();
      expect(imageMessage.images).toBeDefined();
      expect(imageMessage.images.url).toBe('https://test-cloud-image.com/test.jpg');
      
      // Find the text-only message in the response
      const textMessage = response.body.messages.find(msg => msg.text === 'Text only message');
      expect(textMessage).toBeDefined();
      expect(textMessage.images).toBeUndefined();

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. Both messages retrieved with correct data
      // 3. Message with image includes the image data
    });

    // Test case 7: Error handling
    it('should handle database errors when fetching messages', async () => {
      // Mock Messages.find to throw an error
      const originalFind = Messages.find;
      Messages.find = jest.fn().mockImplementationOnce(() => {
        throw new Error('Database error');
      });
      
      // Act - Get messages, which should trigger the error
      const response = await request(app)
        .get(`/api/message/get-all-messages/${testConversationId}`);
      
      // Assert - Should return an error
      expect(response.statusCode).toBe(500);
      
      // Restore the original function
      Messages.find = originalFind;

      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No messages returned due to database error
    });
  });
});
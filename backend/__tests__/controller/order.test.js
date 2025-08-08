const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const express = require('express');
const Order = require('../../model/order');
const Shop = require('../../model/shop');
const Product = require('../../model/product');
const orderRoutes = require('../../controller/order');

// Mock middleware
jest.mock('../../middleware/auth', () => ({
  isAuthenticated: (req, res, next) => {
    req.user = { _id: 'test-user-id' };
    next();
  },
  isSeller: (req, res, next) => {
    req.seller = { _id: 'test-seller-id', id: 'test-seller-id' };
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
const testProductId1 = new mongoose.Types.ObjectId().toString();
const testProductId2 = new mongoose.Types.ObjectId().toString();
// Generate proper ObjectIds for shops instead of using string IDs
const testShopId1 = new mongoose.Types.ObjectId().toString();
const testShopId2 = new mongoose.Types.ObjectId().toString();
const testUserId = 'test-user-id';

const testProduct1 = {
    _id: testProductId1,
    name: 'Test Product 1',
    description: 'Test description 1',
    category: 'Electronics',
    originalPrice: 100,
    discountPrice: 80,
    stock: 10,
    images: [{ public_id: 'test-image-id', url: 'test-image-url' }],
    reviews: [],
    ratings: 0,
    shopId: testShopId1,
    shop: { name: 'Test Shop 1' },
    sold_out: 0
  };

const testProduct2 = {
  _id: testProductId2,
  name: 'Test Product 2',
  description: 'Test description 2',
  category: 'Clothing',
  originalPrice: 50,
  discountPrice: 40,
  stock: 20,
  images: [{ public_id: 'test-image-id-2', url: 'test-image-url-2' }],
  reviews: [],
  ratings: 0,
  shopId: testShopId2,
  shop: { name: 'Test Shop 2' },
  sold_out: 0
};

const testCart = [
  {
    _id: testProductId1,
    name: 'Test Product 1',
    description: 'Test description 1',
    category: 'Electronics',
    originalPrice: 100,
    discountPrice: 80,
    stock: 10,
    images: [{ public_id: 'test-image-id', url: 'test-image-url' }],
    shopId: testShopId1,
    shop: { name: 'Test Shop 1' },
    qty: 2,
    price: 160
  },
  {
    _id: testProductId2,
    name: 'Test Product 2',
    description: 'Test description 2',
    category: 'Clothing',
    originalPrice: 50,
    discountPrice: 40,
    stock: 20,
    images: [{ public_id: 'test-image-id-2', url: 'test-image-url-2' }],
    shopId: testShopId2,
    shop: { name: 'Test Shop 2' },
    qty: 1,
    price: 40
  }
];

const testShippingAddress = {
  country: 'USA',
  state: 'California',
  city: 'San Francisco',
  address1: '123 Test St',
  address2: 'Apt 456',
  zipCode: '94107',
  phoneNumber: '555-123-4567'
};

const testUser = {
  _id: testUserId,
  name: 'Test User',
  email: 'test@example.com'
};

const testPaymentInfo = {
  type: 'Credit Card',
  status: 'Processing'
};

const testOrderData = {
  cart: testCart,
  shippingAddress: testShippingAddress,
  user: testUser,
  totalPrice: 200,
  paymentInfo: testPaymentInfo
};

// Setup test app
const app = express();
app.use(express.json());
app.use('/api/order', orderRoutes);

describe('Order Controller Tests', () => {
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
    
    // Create test products
    await Product.create(testProduct1);
    await Product.create(testProduct2);
    
    // Create test shops with all required fields - using the ObjectIds directly
    await Shop.create({
      _id: new mongoose.Types.ObjectId(testShopId1), // This was causing the error
      name: 'Test Shop 1',
      email: 'testshop1@example.com',
      password: 'password123',
      address: '123 Shop Street, Test City',
      phoneNumber: '1234567890',
      zipCode: '12345',
      availableBalance: 0,
      avatar: {
        public_id: 'test-public-id',
        url: 'https://test-image-url.com'
      }
    });
    
    await Shop.create({
      _id: new mongoose.Types.ObjectId(testShopId2), // This was causing the error
      name: 'Test Shop 2',
      email: 'testshop2@example.com',
      password: 'password123',
      address: '456 Shop Avenue, Test City',
      phoneNumber: '0987654321',
      zipCode: '54321',
      availableBalance: 0,
      avatar: {
        public_id: 'test-public-id-2',
        url: 'https://test-image-url-2.com'
      }
    });
  });
  
  // Abort transaction and clean DB after each test
  afterEach(async () => {
    // Rollback the transaction
    await session.abortTransaction();
    session.endSession();
    
    // Clean up collections
    await Order.deleteMany({});
    await Product.deleteMany({});
    await Shop.deleteMany({});
  });

  describe('Create Order Tests', () => {
    // Test case 1: Successfully create orders for multiple shops
    it('should create separate orders for items from different shops', async () => {
      // Setup - Verify no orders exist initially
      const initialOrders = await Order.find();
      expect(initialOrders.length).toBe(0);

      // Act - Send request to create new order
      const response = await request(app)
        .post('/api/order/create-order')
        .send(testOrderData);

      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.orders.length).toBe(2); // One order per shop
      
      // Verify DB was updated correctly
      const createdOrders = await Order.find().sort({ createdAt: -1 });
      expect(createdOrders.length).toBe(2);
      
      // Check first order (Shop 1 items)
      const shop1Order = createdOrders.find(o => o.cart[0].shopId === testShopId1);
      expect(shop1Order).toBeDefined();
      expect(shop1Order.cart.length).toBe(1);
      expect(shop1Order.cart[0]._id.toString()).toBe(testProductId1);
      expect(shop1Order.cart[0].qty).toBe(2);
      
      // Check second order (Shop 2 items)
      const shop2Order = createdOrders.find(o => o.cart[0].shopId === testShopId2);
      expect(shop2Order).toBeDefined();
      expect(shop2Order.cart.length).toBe(1);
      expect(shop2Order.cart[0]._id.toString()).toBe(testProductId2);
      expect(shop2Order.cart[0].qty).toBe(1);

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. Two orders created, one for each shop
      // 3. Each order contains only the items from its respective shop
    });

    // Test case 2: Create order with items from a single shop
    it('should create a single order when all items are from the same shop', async () => {
      // Setup - Order data with items from only one shop
      const singleShopOrderData = {
        ...testOrderData,
        cart: [testCart[0]] // Only items from shop 1
      };

      // Act - Send request to create new order
      const response = await request(app)
        .post('/api/order/create-order')
        .send(singleShopOrderData);

      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.orders.length).toBe(1); // Single order
      
      // Verify DB was updated correctly
      const createdOrders = await Order.find();
      expect(createdOrders.length).toBe(1);
      expect(createdOrders[0].cart.length).toBe(1);
      expect(createdOrders[0].cart[0].shopId).toBe(testShopId1);

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. One order created for the single shop
    });

    // Test case 3: Create order with empty cart
    it('should handle an order with empty cart', async () => {
      // Setup - Order data with empty cart
      const emptyCartOrderData = {
        ...testOrderData,
        cart: []
      };

      // Act - Send request to create new order
      const response = await request(app)
        .post('/api/order/create-order')
        .send(emptyCartOrderData);

      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.orders.length).toBe(0); // No orders created
      
      // Verify no orders were created
      const createdOrders = await Order.find();
      expect(createdOrders.length).toBe(0);

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. No orders created as cart was empty
    });

    // Test case 4: Missing required fields
    it('should handle missing required fields', async () => {
      // Test with missing cart
      const missingCartData = { ...testOrderData };
      delete missingCartData.cart;
      
      const responseWithoutCart = await request(app)
        .post('/api/order/create-order')
        .send(missingCartData);
      
      expect(responseWithoutCart.statusCode).toBe(500);
      
      // Test with missing user
      const missingUserData = { ...testOrderData };
      delete missingUserData.user;
      
      const responseWithoutUser = await request(app)
        .post('/api/order/create-order')
        .send(missingUserData);
      
      expect(responseWithoutUser.statusCode).toBe(500);
      
      // Test with missing shipping address
      const missingShippingData = { ...testOrderData };
      delete missingShippingData.shippingAddress;
      
      const responseWithoutShipping = await request(app)
        .post('/api/order/create-order')
        .send(missingShippingData);
      
      expect(responseWithoutShipping.statusCode).toBe(500);

      // Verify no orders were created
      const createdOrders = await Order.find();
      expect(createdOrders.length).toBe(0);

      // Expected output:
      // 1. HTTP 500 response for all missing required field cases
      // 2. No orders created due to missing fields
    });

    // Test case 5: Large order with many items
    it('should handle a large order with many items', async () => {
      // Setup - Create a cart with many items from the same shop
      const manyItems = Array(20).fill().map((_, i) => ({
        ...testCart[0],
        _id: new mongoose.Types.ObjectId().toString(),
        name: `Test Product ${i+1}`,
        price: 10,
        qty: 1
      }));
      
      const largeOrderData = {
        ...testOrderData,
        cart: manyItems
      };

      // Act - Send request to create large order
      const response = await request(app)
        .post('/api/order/create-order')
        .send(largeOrderData);

      // Assert - Check response
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.orders.length).toBe(1);
      expect(response.body.orders[0].cart.length).toBe(20);

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. Single order created with 20 items
    });
  });

  describe('Get User Orders Tests', () => {
    // Test case 1: Successfully get all orders for a user
    it('should return all orders for a user', async () => {
      // Setup - Create multiple orders for the user
      const order1 = new Order({
        cart: [testCart[0]],
        shippingAddress: testShippingAddress,
        user: testUser,
        totalPrice: 100,
        paymentInfo: testPaymentInfo,
        createdAt: new Date('2023-01-01')
      });
      
      const order2 = new Order({
        cart: [testCart[1]],
        shippingAddress: testShippingAddress,
        user: testUser,
        totalPrice: 50,
        paymentInfo: testPaymentInfo,
        createdAt: new Date('2023-01-02')
      });
      
      // Create an order for a different user
      const differentUser = { ...testUser, _id: 'different-user-id' };
      const order3 = new Order({
        cart: [testCart[0]],
        shippingAddress: testShippingAddress,
        user: differentUser,
        totalPrice: 75,
        paymentInfo: testPaymentInfo
      });
      
      await order1.save();
      await order2.save();
      await order3.save();
      
      // Act - Get all orders for the user
      const response = await request(app)
        .get(`/api/order/get-all-orders/${testUserId}`);
      
      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.orders.length).toBe(2);
      
      // Verify sorting (newest first)
      expect(new Date(response.body.orders[0].createdAt)).toBeAfter(new Date(response.body.orders[1].createdAt));
      
      // Verify only the user's orders are returned
      const orderUserIds = response.body.orders.map(order => order.user._id);
      expect(orderUserIds.every(id => id === testUserId)).toBe(true);
      expect(orderUserIds).not.toContain('different-user-id');

      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. Array of 2 orders for the specified user, sorted by createdAt (desc)
      // 3. Only orders for the requested user are included
    });

    // Test case 2: No orders exist for the user
    it('should return empty array when no orders exist for user', async () => {
      // Setup - Create an order for a different user
      const differentUser = { ...testUser, _id: 'different-user-id' };
      const order = new Order({
        cart: [testCart[0]],
        shippingAddress: testShippingAddress,
        user: differentUser,
        totalPrice: 100,
        paymentInfo: testPaymentInfo
      });
      
      await order.save();
      
      // Act - Get all orders for a user with no orders
      const response = await request(app)
        .get(`/api/order/get-all-orders/${testUserId}`);
      
      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.orders).toBeInstanceOf(Array);
      expect(response.body.orders.length).toBe(0);

      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. Empty array in orders field
    });

    // Test case 3: Invalid user ID format
    it('should handle invalid user ID format', async () => {
      // Act - Get orders with invalid ID format
      const invalidId = 'invalid-id-format';
      
      const response = await request(app)
        .get(`/api/order/get-all-orders/${invalidId}`);
      
      // Assert - With our error handling, the query will return an empty array
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.orders.length).toBe(0);

      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. Empty array as no orders match the invalid ID
    });

    // Test case 4: Error handling
    it('should handle database errors when fetching user orders', async () => {
      // Mock Order.find to throw an error
      const originalFind = Order.find;
      Order.find = jest.fn().mockImplementationOnce(() => {
        throw new Error('Database error');
      });
      
      // Act - Get orders, which should trigger the error
      const response = await request(app)
        .get(`/api/order/get-all-orders/${testUserId}`);
      
      // Assert - Should return an error
      expect(response.statusCode).toBe(500);
      
      // Restore the original function
      Order.find = originalFind;

      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No orders returned due to database error
    });
  });

  describe('Get Seller Orders Tests', () => {
    // Test case 1: Successfully get all orders for a seller
    it('should return all orders containing seller\'s products', async () => {
      // Setup - Create multiple orders with seller's products
      const order1 = new Order({
        cart: [{
          ...testCart[0],
          shopId: testShopId1
        }],
        shippingAddress: testShippingAddress,
        user: testUser,
        totalPrice: 100,
        paymentInfo: testPaymentInfo,
        createdAt: new Date('2023-01-01')
      });
      
      const order2 = new Order({
        cart: [{
          ...testCart[0],
          shopId: testShopId1
        }, {
          ...testCart[1],
          shopId: testShopId2
        }],
        shippingAddress: testShippingAddress,
        user: testUser,
        totalPrice: 150,
        paymentInfo: testPaymentInfo,
        createdAt: new Date('2023-01-02')
      });
      
      // Create an order without the seller's products
      const order3 = new Order({
        cart: [{
          ...testCart[1],
          shopId: testShopId2
        }],
        shippingAddress: testShippingAddress,
        user: testUser,
        totalPrice: 50,
        paymentInfo: testPaymentInfo
      });
      
      await order1.save();
      await order2.save();
      await order3.save();
      
      // Act - Get all orders for the seller
      const response = await request(app)
        .get(`/api/order/get-seller-all-orders/${testShopId1}`);
      
      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.orders.length).toBe(2);
      
      // Verify sorting (newest first)
      expect(new Date(response.body.orders[0].createdAt)).toBeAfter(new Date(response.body.orders[1].createdAt));

      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. Array of 2 orders that contain the seller's products
      // 3. Orders sorted by creation date (newest first)
    });

    // Test case 2: No orders exist for the seller
    it('should return empty array when no orders exist for seller', async () => {
      // Setup - Create an order without the seller's products
      const order = new Order({
        cart: [{
          ...testCart[1],
          shopId: testShopId2
        }],
        shippingAddress: testShippingAddress,
        user: testUser,
        totalPrice: 50,
        paymentInfo: testPaymentInfo
      });
      
      await order.save();
      
      // Act - Get all orders for a seller with no orders
      const response = await request(app)
        .get(`/api/order/get-seller-all-orders/${testShopId1}`);
      
      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.orders).toBeInstanceOf(Array);
      expect(response.body.orders.length).toBe(0);

      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. Empty array in orders field
    });

    // Test case 3: Invalid shop ID format
    it('should handle invalid shop ID format', async () => {
      // Act - Get orders with invalid ID format
      const invalidId = 'invalid-id-format';
      
      const response = await request(app)
        .get(`/api/order/get-seller-all-orders/${invalidId}`);
      
      // Assert - With our error handling, the query will return an empty array
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.orders.length).toBe(0);

      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. Empty array as no orders match the invalid ID
    });

    // Test case 4: Error handling
    it('should handle database errors when fetching seller orders', async () => {
      // Mock Order.find to throw an error
      const originalFind = Order.find;
      Order.find = jest.fn().mockImplementationOnce(() => {
        throw new Error('Database error');
      });
      
      // Act - Get orders, which should trigger the error
      const response = await request(app)
        .get(`/api/order/get-seller-all-orders/${testShopId1}`);
      
      // Assert - Should return an error
      expect(response.statusCode).toBe(500);
      
      // Restore the original function
      Order.find = originalFind;

      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No orders returned due to database error
    });
  });

  describe('Update Order Status Tests', () => {
    // Test case 1: Successfully update order status
    it('should update order status', async () => {
      // Setup - Create an order
      const order = new Order({
        cart: [testCart[0]],
        shippingAddress: testShippingAddress,
        user: testUser,
        totalPrice: 100,
        paymentInfo: testPaymentInfo,
        status: 'Processing'
      });
      
      await order.save();
      const orderId = order._id.toString();
      
      // Act - Update order status
      const response = await request(app)
        .put(`/api/order/update-order-status/${orderId}`)
        .send({ status: 'Shipped' });
      
      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.order.status).toBe('Shipped');
      
      // Verify DB update
      const updatedOrder = await Order.findById(orderId);
      expect(updatedOrder.status).toBe('Shipped');

      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. DB changes: order status updated to 'Shipped'
    });

    // Test case 2: Update order status to 'Transferred to delivery partner'
    it('should update product stock when status is Transferred to delivery partner', async () => {
      // Setup - Create an order with products
      const order = new Order({
        cart: [{
          _id: testProductId1,
          qty: 2,
          shopId: testShopId1
        }],
        shippingAddress: testShippingAddress,
        user: testUser,
        totalPrice: 100,
        paymentInfo: testPaymentInfo,
        status: 'Processing'
      });
      
      await order.save();
      const orderId = order._id.toString();
      
      // Verify initial product stock
      let product = await Product.findById(testProductId1);
      expect(product.stock).toBe(10);
      expect(product.sold_out).toBe(0);
      
      // Act - Update order status to 'Transferred to delivery partner'
      const response = await request(app)
        .put(`/api/order/update-order-status/${orderId}`)
        .send({ status: 'Transferred to delivery partner' });
      
      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Verify product stock was updated
      product = await Product.findById(testProductId1);
      expect(product.stock).toBe(8); // Initial 10 - 2 ordered
      expect(product.sold_out).toBe(2);

      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. DB changes: order status updated, product stock decreased, sold_out increased
    });

    // Test case 3: Update order status to 'Delivered'
    it('should update payment status and seller balance when status is Delivered', async () => {
      // Setup - Create an order with products
      const order = new Order({
        cart: [{
          _id: testProductId1,
          qty: 2,
          price: 160,
          shopId: testShopId1
        }],
        shippingAddress: testShippingAddress,
        user: testUser,
        totalPrice: 160,
        paymentInfo: {
          type: 'Credit Card',
          status: 'Processing'
        },
        status: 'Shipped'
      });
      
      await order.save();
      const orderId = order._id.toString();
      
      // Verify initial seller balance
      let seller = await Shop.findById(testShopId1);
      expect(seller.availableBalance).toBe(0);
      
      // Act - Update order status to 'Delivered'
      const response = await request(app)
        .put(`/api/order/update-order-status/${orderId}`)
        .send({ status: 'Delivered' });
      
      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.order.paymentInfo.status).toBe('Succeeded');
      expect(response.body.order.deliveredAt).toBeDefined();
      
      // Verify seller balance was updated
      seller = await Shop.findById(testShopId1);
      // 10% service charge: 160 * 0.9 = 144
      expect(seller.availableBalance).toBe(144);

      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. DB changes: order status updated, payment status updated, 
      //    seller balance increased, deliveredAt date set
    });

    // Test case 4: Update non-existent order
    it('should handle updating non-existent order', async () => {
      // Setup - Generate a valid but non-existent order ID
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      
      // Act - Update non-existent order
      const response = await request(app)
        .put(`/api/order/update-order-status/${nonExistentId}`)
        .send({ status: 'Shipped' });
      
      // Assert
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Order not found with this id');

      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No DB changes as order doesn't exist
    });

    // Test case 5: Invalid order ID format
    it('should handle invalid order ID format', async () => {
      // Act - Update with invalid ID format
      const invalidId = 'invalid-id-format';
      
      const response = await request(app)
        .put(`/api/order/update-order-status/${invalidId}`)
        .send({ status: 'Shipped' });
      
      // Assert
      expect(response.statusCode).toBe(500);

      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No DB changes as ID is invalid
    });
  });

  describe('Order Refund Tests', () => {
    // Test case 1: Successfully request a refund
    it('should update order status for refund request', async () => {
      // Setup - Create an order
      const order = new Order({
        cart: [testCart[0]],
        shippingAddress: testShippingAddress,
        user: testUser,
        totalPrice: 100,
        paymentInfo: testPaymentInfo,
        status: 'Delivered'
      });
      
      await order.save();
      const orderId = order._id.toString();
      
      // Act - Request refund
      const response = await request(app)
        .put(`/api/order/order-refund/${orderId}`)
        .send({ status: 'Processing Refund' });
      
      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.order.status).toBe('Processing Refund');
      expect(response.body.message).toBe('Order Refund Request successfully!');
      
      // Verify DB update
      const updatedOrder = await Order.findById(orderId);
      expect(updatedOrder.status).toBe('Processing Refund');

      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. DB changes: order status updated to 'Processing Refund'
    });

    // Test case 2: Request refund for non-existent order
    it('should handle refund request for non-existent order', async () => {
      // Setup - Generate a valid but non-existent order ID
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      
      // Act - Request refund for non-existent order
      const response = await request(app)
        .put(`/api/order/order-refund/${nonExistentId}`)
        .send({ status: 'Processing Refund' });
      
      // Assert
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Order not found with this id');

      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No DB changes as order doesn't exist
    });

    // Test case 3: Invalid order ID format for refund
    it('should handle invalid order ID format for refund', async () => {
      // Act - Request refund with invalid ID format
      const invalidId = 'invalid-id-format';
      
      const response = await request(app)
        .put(`/api/order/order-refund/${invalidId}`)
        .send({ status: 'Processing Refund' });
      
      // Assert
      expect(response.statusCode).toBe(500);

      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No DB changes as ID is invalid
    });
  });

  describe('Process Refund Tests', () => {
    // Test case 1: Successfully process a refund
    it('should process refund and update order status', async () => {
      // Setup - Create an order
      const order = new Order({
        cart: [testCart[0]],
        shippingAddress: testShippingAddress,
        user: testUser,
        totalPrice: 100,
        paymentInfo: testPaymentInfo,
        status: 'Processing Refund'
      });
      
      await order.save();
      const orderId = order._id.toString();
      
      // Act - Process refund
      const response = await request(app)
        .put(`/api/order/order-refund-success/${orderId}`)
        .send({ status: 'Refund Success' });
      
      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Order Refund successfull!');
      
      // Verify DB update
      const updatedOrder = await Order.findById(orderId);
      expect(updatedOrder.status).toBe('Refund Success');

      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. DB changes: order status updated to 'Refund Success'
    });

    // Test case 2: Process refund and update product stock
    it('should update product stock when refund is successful', async () => {
      // Setup - Create an order with products and reduce product stock
      const product = await Product.findById(testProductId1);
      product.stock = 8; // Reduced from original 10
      product.sold_out = 2;
      await product.save();
      
      const order = new Order({
        cart: [{
          _id: testProductId1,
          qty: 2,
          shopId: testShopId1
        }],
        shippingAddress: testShippingAddress,
        user: testUser,
        totalPrice: 100,
        paymentInfo: testPaymentInfo,
        status: 'Processing Refund'
      });
      
      await order.save();
      const orderId = order._id.toString();
      
      // Act - Process refund
      const response = await request(app)
        .put(`/api/order/order-refund-success/${orderId}`)
        .send({ status: 'Refund Success' });
      
      // Assert
      expect(response.statusCode).toBe(200);
      
      // Verify product stock was updated
      const updatedProduct = await Product.findById(testProductId1);
      expect(updatedProduct.stock).toBe(10); // Restored to original
      expect(updatedProduct.sold_out).toBe(0);

      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. DB changes: order status updated, product stock increased, sold_out decreased
    });

    // Test case 3: Process refund for non-existent order
    it('should handle refund processing for non-existent order', async () => {
      // Setup - Generate a valid but non-existent order ID
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      
      // Act - Process refund for non-existent order
      const response = await request(app)
        .put(`/api/order/order-refund-success/${nonExistentId}`)
        .send({ status: 'Refund Success' });
      
      // Assert
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Order not found with this id');

      // Expected output:
      // 1. HTTP 400 response with error message
      // 2. No DB changes as order doesn't exist
    });

    // Test case 4: Invalid order ID format for refund processing
    it('should handle invalid order ID format for refund processing', async () => {
      // Act - Process refund with invalid ID format
      const invalidId = 'invalid-id-format';
      
      const response = await request(app)
        .put(`/api/order/order-refund-success/${invalidId}`)
        .send({ status: 'Refund Success' });
      
      // Assert
      expect(response.statusCode).toBe(500);

      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No DB changes as ID is invalid
    });
  });

  describe('Admin Get All Orders Tests', () => {
    // Test case 1: Successfully get all orders as admin
    it('should return all orders for admin', async () => {
      // Setup - Create multiple orders
      const order1 = new Order({
        cart: [testCart[0]],
        shippingAddress: testShippingAddress,
        user: testUser,
        totalPrice: 100,
        paymentInfo: testPaymentInfo,
        createdAt: new Date('2023-01-01'),
        deliveredAt: null
      });
      
      const order2 = new Order({
        cart: [testCart[1]],
        shippingAddress: testShippingAddress,
        user: testUser,
        totalPrice: 50,
        paymentInfo: testPaymentInfo,
        createdAt: new Date('2023-01-02'),
        deliveredAt: new Date('2023-01-05')
      });
      
      const order3 = new Order({
        cart: [testCart[0]],
        shippingAddress: testShippingAddress,
        user: { ...testUser, _id: 'different-user-id' },
        totalPrice: 75,
        paymentInfo: testPaymentInfo,
        createdAt: new Date('2023-01-03'),
        deliveredAt: new Date('2023-01-04')
      });
      
      await order1.save();
      await order2.save();
      await order3.save();
      
      // Act - Get all orders as admin
      const response = await request(app)
        .get('/api/order/admin-all-orders');
      
      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.orders.length).toBe(3);
      
      // Verify sorting (delivered orders first, then by creation date)
      // Order2 was delivered on Jan 5, Order3 on Jan 4, Order1 not delivered
      expect(response.body.orders[0]._id.toString()).toBe(order2._id.toString());
      expect(response.body.orders[1]._id.toString()).toBe(order3._id.toString());
      expect(response.body.orders[2]._id.toString()).toBe(order1._id.toString());

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. All orders returned (3), sorted by deliveredAt and createdAt
    });

    // Test case 2: No orders exist
    it('should return empty array when no orders exist', async () => {
      // Act - Get all orders as admin when none exist
      const response = await request(app)
        .get('/api/order/admin-all-orders');
      
      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.orders).toBeInstanceOf(Array);
      expect(response.body.orders.length).toBe(0);

      // Expected output:
      // 1. HTTP 201 response with success message
      // 2. Empty array in orders field
    });

    // Test case 3: Error handling
    it('should handle database errors when fetching all orders', async () => {
      // Mock Order.find to throw an error
      const originalFind = Order.find;
      Order.find = jest.fn().mockImplementationOnce(() => {
        throw new Error('Database error');
      });
      
      // Act - Get all orders, which should trigger the error
      const response = await request(app)
        .get('/api/order/admin-all-orders');
      
      // Assert - Should return an error
      expect(response.statusCode).toBe(500);
      
      // Restore the original function
      Order.find = originalFind;

      // Expected output:
      // 1. HTTP 500 response with error message
      // 2. No orders returned due to database error
    });
  });
});
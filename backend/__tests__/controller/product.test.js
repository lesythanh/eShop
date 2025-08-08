const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const express = require('express');
const Product = require('../../model/product');
const productRoutes = require('../../controller/product');
const Shop = require('../../model/shop');

// Mock Order model
jest.mock('../../model/order', () => {
  return {
    findByIdAndUpdate: jest.fn().mockResolvedValue({
      _id: 'test-order-id',
      cart: [{ _id: 'test-product-id', isReviewed: true }]
    })
  };
});

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

jest.mock('cloudinary', () => ({
    v2: {
      uploader: {
        upload: jest.fn().mockImplementation(() => {
          return Promise.resolve({
            public_id: 'test-public-id',
            secure_url: 'https://test-image-url.com'
          });
        }),
        destroy: jest.fn().mockResolvedValue({ result: 'ok' })
      }
    }
}));

// Sample data
const testProduct = {
  _id: new mongoose.Types.ObjectId(),
  name: 'Test Product',
  description: 'Test description',
  category: 'Electronics',
  originalPrice: 100,
  discountPrice: 80,
  stock: 10,
  images: [{ public_id: 'test-image-id', url: 'test-image-url' }],
  reviews: [],
  ratings: 0,
  shopId: 'test-shop-id',
  shop: { name: 'Test Shop' },
  sold_out: 0
};

const reviewData = {
  user: { _id: 'test-user-id', name: 'Test User' },
  rating: 4,
  comment: 'Great product!',
  productId: testProduct._id.toString(),
  orderId: 'test-order-id'
};

// Setup test app
const app = express();
app.use(express.json());
app.use('/api/product', productRoutes);

describe('Product Controller Tests', () => {
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
    await Product.deleteMany({});
  });

  describe('Create Product Review Tests', () => {
    it('should add a new review to product and update order', async () => {
      // Setup - create test product in DB
      await Product.create(testProduct);

      // Verify initial state
      const initialProduct = await Product.findById(testProduct._id);
      expect(initialProduct.reviews.length).toBe(0);
      expect(initialProduct.ratings).toBe(0);

      // Act - send request to add review
      const response = await request(app)
        .put('/api/product/create-new-review')
        .send(reviewData);

      // Assert - Check response
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Reviwed succesfully!');

      // Verify DB was updated correctly
      const updatedProduct = await Product.findById(testProduct._id);
      expect(updatedProduct.reviews.length).toBe(1);
      expect(updatedProduct.reviews[0].rating).toBe(4);
      expect(updatedProduct.reviews[0].comment).toBe('Great product!');
      expect(updatedProduct.ratings).toBe(4); // Only one review, so avg = rating

      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. DB changes: product has 1 new review with rating 4
      // 3. Product rating is updated to 4
      // 4. Order's product is marked as reviewed
    });

    it('should update an existing review if user already reviewed the product', async () => {
      // Setup - create product with an existing review
      const productWithReview = {
        ...testProduct,
        reviews: [{
          user: { _id: 'test-user-id', name: 'Test User' },
          rating: 2,
          comment: 'Initially not great',
          productId: testProduct._id.toString()
        }],
        ratings: 2
      };
      
      await Product.create(productWithReview);

      // Verify initial state
      const initialProduct = await Product.findById(testProduct._id);
      expect(initialProduct.reviews.length).toBe(1);
      expect(initialProduct.reviews[0].rating).toBe(2);
      expect(initialProduct.ratings).toBe(2);

      // Act - send request to update review
      const response = await request(app)
        .put('/api/product/create-new-review')
        .send(reviewData);

      // Assert
      expect(response.statusCode).toBe(200);
      
      // Verify DB update - should still have 1 review but with updated rating/comment
      const updatedProduct = await Product.findById(testProduct._id);
      expect(updatedProduct.reviews.length).toBe(1);
      expect(updatedProduct.reviews[0].rating).toBe(4); // Updated from 2 to 4
      expect(updatedProduct.reviews[0].comment).toBe('Great product!');
      expect(updatedProduct.ratings).toBe(4);

      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. DB changes: existing review is updated with new rating and comment
      // 3. Product rating is updated from 2 to 4
      // 4. Review count remains 1
    });

    it('should correctly calculate average ratings with multiple reviews', async () => {
      // Setup - Create product with one existing review from another user
      const productWithReview = {
        ...testProduct,
        reviews: [{
          user: { _id: 'another-user-id', name: 'Another User' },
          rating: 2,
          comment: 'Not great',
          productId: testProduct._id.toString()
        }],
        ratings: 2
      };
      
      await Product.create(productWithReview);

      // Verify initial state
      const initialProduct = await Product.findById(testProduct._id);
      expect(initialProduct.reviews.length).toBe(1);
      expect(initialProduct.ratings).toBe(2);

      // Act - Add a new review (rating 4)
      const response = await request(app)
        .put('/api/product/create-new-review')
        .send(reviewData);

      // Assert
      expect(response.statusCode).toBe(200);
      
      // Verify DB update - should have 2 reviews with avg rating (2+4)/2 = 3
      const updatedProduct = await Product.findById(testProduct._id);
      expect(updatedProduct.reviews.length).toBe(2);
      expect(updatedProduct.ratings).toBe(3);

      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. DB changes: new review added, total reviews = 2
      // 3. Product rating is updated to 3 (average of 2 and 4)
    });

    // EDGE CASE 1: Invalid product ID
    it('should handle invalid product ID', async () => {
      // Create invalid review data with non-existent product ID
      const invalidReviewData = {
        ...reviewData,
        productId: new mongoose.Types.ObjectId().toString() // Random non-existent ID
      };

      // Act - Try to review non-existent product
      const response = await request(app)
        .put('/api/product/create-new-review')
        .send(invalidReviewData)
        .expect(400); // Expect error response

      // Expected output:
      // 1. HTTP 400 Bad Request response
      // 2. No DB changes, as product doesn't exist
    });

    // EDGE CASE 2: Very low and very high ratings
    it('should handle boundary rating values', async () => {
      await Product.create(testProduct);

      // Test with minimum rating (1)
      const minRatingReview = {
        ...reviewData,
        rating: 1
      };

      const minResponse = await request(app)
        .put('/api/product/create-new-review')
        .send(minRatingReview);

      expect(minResponse.statusCode).toBe(200);
      
      let updatedProduct = await Product.findById(testProduct._id);
      expect(updatedProduct.ratings).toBe(1);

      // Clean up for next test
      await Product.deleteMany({});
      await Product.create(testProduct);

      // Test with maximum rating (5)
      const maxRatingReview = {
        ...reviewData,
        rating: 5
      };

      const maxResponse = await request(app)
        .put('/api/product/create-new-review')
        .send(maxRatingReview);

      expect(maxResponse.statusCode).toBe(200);
      
      updatedProduct = await Product.findById(testProduct._id);
      expect(updatedProduct.ratings).toBe(5);

      // Expected output:
      // 1. Both min (1) and max (5) ratings should be accepted
      // 2. DB changes: product rating equals the review rating
    });

    // EDGE CASE 3: Multiple reviews from different users
    it('should calculate correct average with many reviews', async () => {
      // Create product with several existing reviews
      const productWithMultipleReviews = {
        ...testProduct,
        reviews: [
          {
            user: { _id: 'user-1', name: 'User 1' },
            rating: 1,
            comment: 'Terrible',
            productId: testProduct._id.toString()
          },
          {
            user: { _id: 'user-2', name: 'User 2' },
            rating: 2,
            comment: 'Bad',
            productId: testProduct._id.toString()
          },
          {
            user: { _id: 'user-3', name: 'User 3' },
            rating: 3,
            comment: 'Average',
            productId: testProduct._id.toString()
          },
          {
            user: { _id: 'user-4', name: 'User 4' },
            rating: 4,
            comment: 'Good',
            productId: testProduct._id.toString()
          }
        ],
        ratings: 2.5 // Initial average: (1+2+3+4)/4 = 2.5
      };
      
      await Product.create(productWithMultipleReviews);

      // Verify initial state
      const initialProduct = await Product.findById(testProduct._id);
      expect(initialProduct.reviews.length).toBe(4);
      expect(initialProduct.ratings).toBe(2.5);

      // Add a new 5-star review
      const fiveStarReview = {
        ...reviewData,
        rating: 5
      };

      const response = await request(app)
        .put('/api/product/create-new-review')
        .send(fiveStarReview);

      expect(response.statusCode).toBe(200);
      
      // Verify DB - should have 5 reviews with avg rating (1+2+3+4+5)/5 = 3
      const updatedProduct = await Product.findById(testProduct._id);
      expect(updatedProduct.reviews.length).toBe(5);
      expect(updatedProduct.ratings).toBe(3);

      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. DB changes: new review added, total reviews = 5
      // 3. Product rating updated to 3 (average of 1,2,3,4,5)
    });

    // EDGE CASE 4: Empty comment
    it('should handle review with empty comment', async () => {
      await Product.create(testProduct);

      // Create review with empty comment
      const emptyCommentReview = {
        ...reviewData,
        comment: ''
      };

      const response = await request(app)
        .put('/api/product/create-new-review')
        .send(emptyCommentReview);

      expect(response.statusCode).toBe(200);
      
      const updatedProduct = await Product.findById(testProduct._id);
      expect(updatedProduct.reviews[0].comment).toBe('');

      // Expected output:
      // 1. HTTP 200 response with success message
      // 2. DB changes: review added with empty comment
      // 3. Comment field should be empty string
    });

    // EDGE CASE 5: Review with duplicate user/review combo
    it('should handle multiple review submissions from same user', async () => {
      // Setup initial product with review
      const productWithReview = {
        ...testProduct,
        reviews: [{
          user: { _id: 'test-user-id', name: 'Test User' },
          rating: 3,
          comment: 'Original comment',
          productId: testProduct._id.toString()
        }],
        ratings: 3
      };
      
      await Product.create(productWithReview);

      // Submit first update to review
      await request(app)
        .put('/api/product/create-new-review')
        .send({
          ...reviewData,
          rating: 4,
          comment: 'First update'
        });

      // Submit second update to review
      const secondUpdateResponse = await request(app)
        .put('/api/product/create-new-review')
        .send({
          ...reviewData,
          rating: 5,
          comment: 'Second update'
        });

      expect(secondUpdateResponse.statusCode).toBe(200);
      
      // Verify only one review exists but it has the latest data
      const updatedProduct = await Product.findById(testProduct._id);
      expect(updatedProduct.reviews.length).toBe(1);
      expect(updatedProduct.reviews[0].rating).toBe(5);
      expect(updatedProduct.reviews[0].comment).toBe('Second update');

      // Expected output:
      // 1. HTTP 200 response for both updates
      // 2. DB changes: one review with latest data
      // 3. Rating = 5, comment = "Second update"
    });
  });

  describe('Create Product Tests', () => {
    it('should create a new product with single image', async () => {
      // Setup - Create a shop first
      const shop = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Test Shop',
        email: 'test@shop.com',
        password: 'password123',
        address: 'Test Address',
        phoneNumber: '1234567890',
        zipCode: '12345',
        availableBalance: 0,
        avatar: {
          public_id: 'test-public-id',
          url: 'https://test-image-url.com'
        }
      };
      
      await Shop.create(shop);
      
      // Product data with single image
      const productData = {
        name: 'New Test Product',
        description: 'New product description',
        category: 'Electronics',
        tags: 'gadget, electronic',
        originalPrice: 200,
        discountPrice: 180,
        stock: 20,
        shopId: shop._id.toString(),
        images: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...' // base64 image string
      };
      
      // Act - Create product
      const response = await request(app)
        .post('/api/product/create-product')
        .send(productData);
      
      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.product.name).toBe('New Test Product');
      expect(response.body.product.images.length).toBe(1);
      expect(response.body.product.images[0].public_id).toBe('test-public-id');
      
      // Verify product was saved to DB
      const savedProduct = await Product.findOne({ name: 'New Test Product' });
      expect(savedProduct).not.toBeNull();
      expect(savedProduct.shop.name).toBe('Test Shop');
      
      // Verify cloudinary was called
      expect(cloudinary.v2.uploader.upload).toHaveBeenCalled();
    });
    
    it('should create a product with multiple images', async () => {
      // Setup - Create a shop first
      const shop = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Test Shop',
        email: 'test@shop.com',
        password: 'password123',
        address: 'Test Address',
        phoneNumber: '1234567890',
        zipCode: '12345',
        availableBalance: 0,
        avatar: {
          public_id: 'test-public-id',
          url: 'https://test-image-url.com'
        }
      };
      
      await Shop.create(shop);
      
      // Product data with multiple images
      const productData = {
        name: 'Multi-Image Product',
        description: 'Product with multiple images',
        category: 'Electronics',
        tags: 'gadget, electronic',
        originalPrice: 200,
        discountPrice: 180,
        stock: 20,
        shopId: shop._id.toString(),
        images: [
          'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...', // image 1
          'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...'  // image 2
        ]
      };
      
      // Act - Create product
      const response = await request(app)
        .post('/api/product/create-product')
        .send(productData);
      
      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body.product.images.length).toBe(2);
      
      // Verify cloudinary was called twice
      expect(cloudinary.v2.uploader.upload).toHaveBeenCalledTimes(2);
    });
    
    it('should return error for invalid shop ID', async () => {
      // Product data with invalid shop ID
      const productData = {
        name: 'Invalid Shop Product',
        description: 'Product with invalid shop',
        category: 'Electronics',
        originalPrice: 200,
        discountPrice: 180,
        stock: 20,
        shopId: new mongoose.Types.ObjectId().toString(), // Non-existent shop ID
        images: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...'
      };
      
      // Act - Try to create product with invalid shop
      const response = await request(app)
        .post('/api/product/create-product')
        .send(productData);
      
      // Assert
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('Shop Id is invalid!');
      
      // Verify no product was created
      const productsCount = await Product.countDocuments();
      expect(productsCount).toBe(0);
    });
  });
  
  describe('Get Shop Products Tests', () => {
    it('should return all products of a shop', async () => {
      // Setup - Create multiple products for one shop
      const shopId = new mongoose.Types.ObjectId().toString();
      
      const products = [
        { ...testProduct, _id: new mongoose.Types.ObjectId(), name: 'Shop Product 1', shopId },
        { ...testProduct, _id: new mongoose.Types.ObjectId(), name: 'Shop Product 2', shopId },
        { ...testProduct, _id: new mongoose.Types.ObjectId(), name: 'Shop Product 3', shopId }
      ];
      
      // Create product for a different shop
      const differentShopId = new mongoose.Types.ObjectId().toString();
      const otherShopProduct = { ...testProduct, shopId: differentShopId, name: 'Other Shop Product' };
      
      await Product.create(products);
      await Product.create(otherShopProduct);
      
      // Act - Get products for the shop
      const response = await request(app)
        .get(`/api/product/get-all-products-shop/${shopId}`);
      
      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.products.length).toBe(3);
      
      // Verify only the shop's products are returned
      const productNames = response.body.products.map(p => p.name);
      expect(productNames).toContain('Shop Product 1');
      expect(productNames).toContain('Shop Product 2');
      expect(productNames).toContain('Shop Product 3');
      expect(productNames).not.toContain('Other Shop Product');
    });
    
    it('should return empty array if shop has no products', async () => {
      // Setup - Create a shop ID with no products
      const emptyShopId = new mongoose.Types.ObjectId().toString();
      
      // Create product for a different shop
      const differentShopId = new mongoose.Types.ObjectId().toString();
      const otherShopProduct = { ...testProduct, shopId: differentShopId };
      await Product.create(otherShopProduct);
      
      // Act - Get products for empty shop
      const response = await request(app)
        .get(`/api/product/get-all-products-shop/${emptyShopId}`);
      
      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.products).toBeInstanceOf(Array);
      expect(response.body.products.length).toBe(0);
    });
  });
  
  describe('Delete Shop Product Tests', () => {
    it('should delete a product and its images', async () => {
      // Setup - Create a product to delete
      const product = await Product.create({
        ...testProduct,
        _id: new mongoose.Types.ObjectId(),
        images: [
          { public_id: 'test-public-id-1', url: 'https://test-image-url-1.com' },
          { public_id: 'test-public-id-2', url: 'https://test-image-url-2.com' }
        ]
      });
      
      // Monkey patch the remove method since it's deprecated
      product.remove = jest.fn().mockResolvedValue(true);
      await product.save();
      
      // Act - Delete the product
      const response = await request(app)
        .delete(`/api/product/delete-shop-product/${product._id}`);
      
      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Product Deleted successfully!');
      
      // Verify cloudinary.destroy was called for each image
      expect(cloudinary.v2.uploader.destroy).toHaveBeenCalled();
      
      // Verify product.remove was called
      expect(product.remove).toHaveBeenCalled();
    });
    
    it('should return error when deleting non-existent product', async () => {
      // Setup - Generate a non-existent product ID
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      
      // Act - Try to delete non-existent product
      const response = await request(app)
        .delete(`/api/product/delete-shop-product/${nonExistentId}`);
      
      // Assert
      expect(response.statusCode).toBe(404);
      expect(response.body.success).toBe(undefined);
      expect(response.body.message).toBe('Product is not found with this id');
    });
  });
  
  describe('Get All Products Tests', () => {
    it('should return all products sorted by creation date', async () => {
      // Setup - Create multiple products with different creation dates
      const products = [
        { ...testProduct, _id: new mongoose.Types.ObjectId(), name: 'Old Product', createdAt: new Date('2023-01-01') },
        { ...testProduct, _id: new mongoose.Types.ObjectId(), name: 'New Product', createdAt: new Date('2023-01-10') },
        { ...testProduct, _id: new mongoose.Types.ObjectId(), name: 'Medium Product', createdAt: new Date('2023-01-05') }
      ];
      
      await Product.create(products);
      
      // Act - Get all products
      const response = await request(app)
        .get('/api/product/get-all-products');
      
      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.products.length).toBe(3);
      
      // Verify products are sorted by newest first
      expect(response.body.products[0].name).toBe('New Product');
      expect(response.body.products[1].name).toBe('Medium Product');
      expect(response.body.products[2].name).toBe('Old Product');
    });
    
    it('should return empty array when no products exist', async () => {
      // Act - Get all products when none exist
      const response = await request(app)
        .get('/api/product/get-all-products');
      
      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.products).toBeInstanceOf(Array);
      expect(response.body.products.length).toBe(0);
    });
  });
  
  describe('Admin Get All Products Tests', () => {
    it('should return all products for admin', async () => {
      // Setup - Create multiple products
      const products = [
        { ...testProduct, _id: new mongoose.Types.ObjectId(), name: 'Product 1' },
        { ...testProduct, _id: new mongoose.Types.ObjectId(), name: 'Product 2' },
        { ...testProduct, _id: new mongoose.Types.ObjectId(), name: 'Product 3' }
      ];
      
      await Product.create(products);
      
      // Act - Get all products as admin
      const response = await request(app)
        .get('/api/product/admin-all-products');
      
      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.products.length).toBe(3);
      
      // Verify all products are returned
      const productNames = response.body.products.map(p => p.name);
      expect(productNames).toContain('Product 1');
      expect(productNames).toContain('Product 2');
      expect(productNames).toContain('Product 3');
    });
    
    it('should return products sorted by creation date', async () => {
      // Setup - Create products with different creation dates
      const products = [
        { ...testProduct, _id: new mongoose.Types.ObjectId(), name: 'Old Product', createdAt: new Date('2023-01-01') },
        { ...testProduct, _id: new mongoose.Types.ObjectId(), name: 'New Product', createdAt: new Date('2023-01-10') }
      ];
      
      await Product.create(products);
      
      // Act - Get all products as admin
      const response = await request(app)
        .get('/api/product/admin-all-products');
      
      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body.products.length).toBe(2);
      
      // Verify products are sorted by newest first
      expect(response.body.products[0].name).toBe('New Product');
      expect(response.body.products[1].name).toBe('Old Product');
    });
  });
});
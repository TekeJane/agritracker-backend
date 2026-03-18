const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const User = require('../models/User');
const Ebook = require('../models/Ebook');
const EbookCategory = require('../models/EbookCategory');
const EbookOrder = require('../models/EbookOrder');
const emailService = require('../services/emailService');

class OrderController {
    // Create a new order (purchase ebook)
    async createOrder(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation errors',
                    errors: errors.array()
                });
            }

            const {
                ebook_id,
                payment_method,
                customer_email,
                customer_phone,
                customer_address,
                note
            } = req.body;

            const userId = req.user ? req.user.id : null;

            // Validate ebook exists and is approved
            const ebook = await Ebook.findOne({
                where: {
                    id: ebook_id,
                    is_approved: true
                },
                include: [
                    {
                        model: EbookCategory,
                        as: 'category',
                        attributes: ['id', 'name']
                    }
                ]
            });

            if (!ebook) {
                return res.status(404).json({
                    success: false,
                    message: 'Ebook not found or not approved'
                });
            }

            // Check if user already purchased this ebook
            if (userId) {
                const existingOrder = await EbookOrder.findOne({
                    where: {
                        user_id: userId,
                        ebook_id: ebook_id,
                        payment_status: 'completed'
                    }
                });

                if (existingOrder) {
                    return res.status(400).json({
                        success: false,
                        message: 'You have already purchased this ebook'
                    });
                }
            }

            // Generate unique order ID
            const orderId = `ORD${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

            // Create order
            const order = await EbookOrder.create({
                order_id: orderId,
                user_id: userId,
                ebook_id: ebook_id,
                price_paid: ebook.price,
                payment_method,
                customer_email,
                customer_phone,
                customer_address,
                note,
                payment_status: 'pending',
                purchased_at: new Date(),
                metadata: {
                    user_agent: req.headers['user-agent'],
                    ip_address: req.ip,
                    created_from: 'mobile_app'
                }
            });

            // Simulate payment processing (in real app, integrate with payment gateway)
            setTimeout(async () => {
                try {
                    await this.processPayment(order.id);
                } catch (error) {
                    console.error('Payment processing error:', error);
                }
            }, 2000);

            // Fetch complete order details
            const completeOrder = await EbookOrder.findByPk(order.id, {
                include: [
                    {
                        model: Ebook,
                        as: 'ebook',
                        include: [
                            {
                                model: EbookCategory,
                                as: 'category',
                                attributes: ['id', 'name']
                            }
                        ]
                    },
                    {
                        model: User,
                        as: 'user',
                        attributes: ['id', 'name', 'email']
                    }
                ]
            });

            res.status(201).json({
                success: true,
                message: 'Order created successfully',
                data: {
                    order: completeOrder,
                    order_id: orderId,
                    payment_status: 'pending'
                }
            });

        } catch (error) {
            console.error('Create order error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }

    // Process payment (simulate payment gateway)
    async processPayment(orderId) {
        try {
            const order = await EbookOrder.findByPk(orderId, {
                include: [
                    {
                        model: Ebook,
                        as: 'ebook',
                        include: [
                            {
                                model: EbookCategory,
                                as: 'category'
                            }
                        ]
                    }
                ]
            });

            if (!order) {
                throw new Error('Order not found');
            }

            // Simulate payment processing
            const paymentSuccess = Math.random() > 0.1; // 90% success rate

            if (paymentSuccess) {
                // Update order status
                await order.update({
                    payment_status: 'completed',
                    paid_at: new Date(),
                    transaction_id: `TXN${Date.now()}`
                });

                // Send confirmation email
                await emailService.sendOrderConfirmation(order);

                console.log(`✅ Payment successful for order ${order.order_id}`);
            } else {
                // Payment failed
                await order.update({
                    payment_status: 'failed'
                });

                console.log(`❌ Payment failed for order ${order.order_id}`);
            }

        } catch (error) {
            console.error('Process payment error:', error);
        }
    }

    // Get order by ID
    async getOrderById(req, res) {
        try {
            const { orderId } = req.params;

            const order = await EbookOrder.findOne({
                where: { order_id: orderId },
                include: [
                    {
                        model: Ebook,
                        as: 'ebook',
                        include: [
                            {
                                model: EbookCategory,
                                as: 'category',
                                attributes: ['id', 'name']
                            }
                        ]
                    },
                    {
                        model: User,
                        as: 'user',
                        attributes: ['id', 'name', 'email']
                    }
                ]
            });

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }

            // Check if user owns this order or is admin
            if (req.user && order.user_id !== req.user.id && req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied'
                });
            }

            res.json({
                success: true,
                data: { order }
            });

        } catch (error) {
            console.error('Get order error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }

    // Get user's orders
    async getUserOrders(req, res) {
        try {
            const {
                page = 1,
                limit = 10,
                status,
                payment_method
            } = req.query;

            const offset = (page - 1) * limit;
            const whereClause = { user_id: req.user.id };

            if (status) {
                whereClause.payment_status = status;
            }

            if (payment_method) {
                whereClause.payment_method = payment_method;
            }

            const { count, rows: orders } = await EbookOrder.findAndCountAll({
                where: whereClause,
                include: [
                    {
                        model: Ebook,
                        as: 'ebook',
                        include: [
                            {
                                model: EbookCategory,
                                as: 'category',
                                attributes: ['id', 'name']
                            }
                        ]
                    }
                ],
                order: [['createdAt', 'DESC']],
                limit: parseInt(limit),
                offset: parseInt(offset)
            });

            res.json({
                success: true,
                data: orders,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(count / limit),
                    totalItems: count,
                    itemsPerPage: parseInt(limit)
                }
            });

        } catch (error) {
            console.error('Get user orders error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }

    // Download ebook (for purchased items)
    async downloadEbook(req, res) {
        try {
            const { orderId } = req.params;

            const order = await EbookOrder.findOne({
                where: {
                    order_id: orderId,
                    payment_status: 'completed'
                },
                include: [
                    {
                        model: Ebook,
                        as: 'ebook'
                    }
                ]
            });

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found or payment not completed'
                });
            }

            // Check if user owns this order
            if (req.user && order.user_id !== req.user.id) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied'
                });
            }

            if (!order.ebook.file_url) {
                return res.status(404).json({
                    success: false,
                    message: 'Ebook file not available'
                });
            }

            // Update download count
            await order.update({
                download_count: order.download_count + 1,
                last_download_at: new Date()
            });

            // In a real implementation, you would serve the file securely
            res.json({
                success: true,
                message: 'Download link generated',
                data: {
                    download_url: order.ebook.file_url,
                    download_count: order.download_count + 1,
                    expires_in: '24 hours'
                }
            });

        } catch (error) {
            console.error('Download ebook error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }

    // Admin: Get all orders
    async getAllOrders(req, res) {
        try {
            const {
                page = 1,
                limit = 20,
                status,
                payment_method,
                user_id,
                ebook_id
            } = req.query;

            const offset = (page - 1) * limit;
            const whereClause = {};

            if (status) whereClause.payment_status = status;
            if (payment_method) whereClause.payment_method = payment_method;
            if (user_id) whereClause.user_id = user_id;
            if (ebook_id) whereClause.ebook_id = ebook_id;

            const { count, rows: orders } = await EbookOrder.findAndCountAll({
                where: whereClause,
                include: [
                    {
                        model: Ebook,
                        as: 'ebook',
                        include: [
                            {
                                model: EbookCategory,
                                as: 'category',
                                attributes: ['id', 'name']
                            }
                        ]
                    },
                    {
                        model: User,
                        as: 'user',
                        attributes: ['id', 'name', 'email']
                    }
                ],
                order: [['createdAt', 'DESC']],
                limit: parseInt(limit),
                offset: parseInt(offset)
            });

            res.json({
                success: true,
                data: orders,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(count / limit),
                    totalItems: count,
                    itemsPerPage: parseInt(limit)
                }
            });

        } catch (error) {
            console.error('Get all orders error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }

    // Update order status (admin only)
    async updateOrderStatus(req, res) {
        try {
            const { orderId } = req.params;
            const { payment_status, transaction_id, refund_reason } = req.body;

            const order = await EbookOrder.findOne({
                where: { order_id: orderId }
            });

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }

            const updateData = { payment_status };

            if (transaction_id) {
                updateData.transaction_id = transaction_id;
            }

            if (payment_status === 'completed' && !order.paid_at) {
                updateData.paid_at = new Date();
            }

            if (payment_status === 'refunded') {
                updateData.refunded_at = new Date();
                updateData.refund_reason = refund_reason;
            }

            await order.update(updateData);

            res.json({
                success: true,
                message: 'Order status updated successfully',
                data: { order }
            });

        } catch (error) {
            console.error('Update order status error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
}

module.exports = new OrderController();
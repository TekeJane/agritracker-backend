const {
    Order,
    OrderItem,
    Cart,
    Product,
    User,
    Category,
    SubCategory,
    sequelize
} = require('../models');
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const notifyUser = require('../services/notifyUser');


const VALID_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
const VALID_PAYMENT_STATUSES = ['unpaid', 'paid', 'refunded'];

const OrderController = {

    // controllers/OrderController.js

    async getOrdersForMyProducts(req, res) {
        try {
            const orders = await Order.findAll({
                include: [
                    {
                        model: OrderItem,
                        include: [
                            {
                                model: Product,
                                where: { seller_id: req.user.id },
                                // ✅ Only products owned by the seller
                                required: true, // ✅ Ensures we only include orders with seller's products
                            },
                        ],
                    },
                    {
                        model: User, // 🧾 Buyer details
                        attributes: ['id', 'full_name', 'phone', 'email'],
                    },
                ],
                order: [['createdAt', 'DESC']],
            });

            return res.status(200).json(orders);
        } catch (error) {
            console.error('❌ Error fetching seller product orders:', error.message);
            return res.status(500).json({ error: error.message });
        }
    },

    // ADMIN: Get all orders
    async getAllOrders(req, res) {
        try {
            const orders = await Order.findAll({
                include: [
                    {
                        model: OrderItem,
                        include: [{ model: Product }],
                    },
                    {
                        model: User,
                        attributes: ['id', 'full_name', 'phone', 'email'],
                    },
                ],
                order: [['createdAt', 'DESC']],
            });

            return res.status(200).json(orders);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    },

    // USER: Get their orders
    async getUserOrders(req, res) {
        try {
            const orders = await Order.findAll({
                where: { UserId: req.user.id },
                include: [
                    {
                        model: OrderItem,
                        include: [
                            {
                                model: Product,
                                include: [Category, SubCategory],
                            },
                        ],
                    },
                ],
                order: [['createdAt', 'DESC']],
            });
            return res.status(200).json(orders);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    },

    // USER: Get one order
    async getOrderById(req, res) {
        try {
            const order = await Order.findOne({
                where: {
                    id: req.params.id,
                    UserId: req.user.id,
                },
                include: [
                    {
                        model: OrderItem,
                        include: [
                            {
                                model: Product,
                                include: [Category, SubCategory],
                            },
                        ],
                    },
                ],
            });

            if (!order) {
                return res.status(404).json({ message: 'Order not found' });
            }

            return res.status(200).json(order);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    },

    // USER: Place new order
    async createOrder(req, res) {
        const t = await sequelize.transaction();

        try {
            const { shipping_address, shipping_method, payment_method, notes } = req.body;

            const cartItems = await Cart.findAll({
                where: { UserId: req.user.id },
                include: [
                    {
                        model: Product,
                        include: [Category, SubCategory],
                    },
                ],
                transaction: t,
            });

            if (cartItems.length === 0) {
                await t.rollback();
                return res.status(400).json({ message: 'Cart is empty' });
            }

            // Total calculation and stock check
            let total_amount = 0;
            for (const item of cartItems) {
                if (item.Product.stock_quantity < item.quantity) {
                    await t.rollback();
                    return res.status(400).json({ message: `Insufficient stock for ${item.Product.name}` });
                }
                total_amount += item.Product.price * item.quantity;
            }

            // Create order
            const order = await Order.create({
                order_number: `ORD-${uuidv4().substring(0, 8)}`,
                UserId: req.user.id,
                total_amount,
                shipping_address,
                shipping_method,
                payment_method,
                notes,
            }, { transaction: t });

            // Create order items + update stock
            for (const item of cartItems) {
                await OrderItem.create({
                    OrderId: order.id,
                    ProductId: item.ProductId,
                    quantity: item.quantity,
                    price: item.Product.price,
                    subtotal: item.Product.price * item.quantity,
                }, { transaction: t });

                const product = await Product.findByPk(item.ProductId, { transaction: t });
                product.stock_quantity -= item.quantity;
                await product.save({ transaction: t });
            }

            // Clear cart
            await Cart.destroy({ where: { UserId: req.user.id }, transaction: t });

            await t.commit();

// Re-fetch full order
            const completeOrder = await Order.findByPk(order.id, {
                include: [
                    {
                        model: OrderItem,
                        include: [
                            {
                                model: Product,
                                include: [Category, SubCategory],
                            },
                        ],
                    },
                ],
            });

// 🔔 Notify buyer
            await notifyUser(req.user.id, "Order Placed", "Your order has been placed successfully!", "order");

// 🔔 Notify sellers (handle multiple vendors)
            const notifiedSellers = new Set();
            for (const item of completeOrder.OrderItems) {
                const product = item.Product;
                if (product.seller_id && !notifiedSellers.has(product.seller_id)) {
                    await notifyUser(
                        product.seller_id,
                        "New Sale",
                        `Your product "${product.name}" has been ordered.`,
                        "sale"
                    );
                    notifiedSellers.add(product.seller_id);
                }
            }

            return res.status(201).json(completeOrder);

        } catch (error) {
            await t.rollback();
            return res.status(500).json({ error: error.message });
        }
    },

    // ADMIN: Update order status/payment status
    async updateOrderStatus(req, res) {
        try {
            const { status, payment_status } = req.body;

            const order = await Order.findByPk(req.params.id);
            if (!order) {
                return res.status(404).json({ message: 'Order not found' });
            }

            if (order.status === 'cancelled') {
                return res.status(400).json({ message: 'Cancelled orders cannot be modified' });
            }

            if (status && !VALID_STATUSES.includes(status)) {
                return res.status(400).json({ message: 'Invalid status' });
            }

            if (payment_status && !VALID_PAYMENT_STATUSES.includes(payment_status)) {
                return res.status(400).json({ message: 'Invalid payment status' });
            }

            if (status) order.status = status;
            if (payment_status) order.payment_status = payment_status;

            await order.save();

            const updatedOrder = await Order.findByPk(order.id, {
                include: [
                    {
                        model: OrderItem,
                        include: [Product],
                    },
                    User,
                ],
            });

            return res.status(200).json(updatedOrder);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    },

    // USER: Cancel order (if pending or processing only)
    async cancelOrder(req, res) {
        const t = await sequelize.transaction();

        try {
            const order = await Order.findOne({
                where: {
                    id: req.params.id,
                    UserId: req.user.id,
                    status: { [Op.in]: ['pending', 'processing'] }
                },
                include: [OrderItem],
                transaction: t,
            });

            if (!order) {
                await t.rollback();
                return res.status(404).json({ message: 'Order not found or cannot be cancelled' });
            }

            order.status = 'cancelled';
            await order.save({ transaction: t });

            // Restore stock
            for (const item of order.OrderItems) {
                const product = await Product.findByPk(item.ProductId, { transaction: t });
                product.stock_quantity += item.quantity;
                await product.save({ transaction: t });
            }

            await t.commit();

            const updatedOrder = await Order.findByPk(order.id, {
                include: [
                    {
                        model: OrderItem,
                        include: [Product],
                    },
                ],
            });

            return res.status(200).json(updatedOrder);
        } catch (error) {
            await t.rollback();
            return res.status(500).json({ error: error.message });
        }
    }
};

// controllers/OrderController.js



module.exports = OrderController;

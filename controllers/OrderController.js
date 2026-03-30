const {
    Order,
    OrderItem,
    Cart,
    Product,
    Ebook,
    EbookCategory,
    EbookOrder,
    User,
    Category,
    SubCategory,
    sequelize
} = require('../models');
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const notifyUser = require('../services/notifyUser');


const VALID_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
const VALID_PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];
const MOBILE_MONEY_NOTE_MARKER = '[MOBILE_MONEY_META]';

const SHIPPING_COSTS = {
    farmer_delivers: 0,
    buyer_pickup: 0,
    standard: 1000,
    express: 2000,
};

function buildOrderNotes(notes, mobileMoneyPayment) {
    const visibleNotes = typeof notes === 'string' ? notes.trim() : '';
    if (!mobileMoneyPayment) {
        return visibleNotes || null;
    }

    const metadata = {
        provider: mobileMoneyPayment.provider,
        payer_phone_number: mobileMoneyPayment.payer_phone_number,
        transaction_id: mobileMoneyPayment.transaction_id,
        recipient_number: mobileMoneyPayment.recipient_number,
        recipient_name: mobileMoneyPayment.recipient_name,
        company_name: mobileMoneyPayment.company_name,
        verification_status: mobileMoneyPayment.verification_status || 'submitted',
        submitted_at: mobileMoneyPayment.submitted_at || new Date().toISOString(),
    };

    const serialized = `${MOBILE_MONEY_NOTE_MARKER}${JSON.stringify(metadata)}`;
    return visibleNotes ? `${visibleNotes}\n\n${serialized}` : serialized;
}

function getMobileMoneyProviderLabel(paymentMethod) {
    switch (paymentMethod) {
        case 'mtn_mobile_money':
            return 'MTN Mobile Money';
        case 'orange_money':
            return 'Orange Money';
        default:
            return 'Mobile Money';
    }
}

async function notifyAdminsOfMobileMoneySubmission(order, buyerId) {
    const admins = await User.findAll({
        where: { role: 'admin' },
        attributes: ['id'],
    });

    if (!admins.length) {
        return;
    }

    await Promise.all(
        admins.map((admin) =>
            notifyUser(
                admin.id,
                'Payment Submitted',
                `Order ${order.order_number} has a new mobile money payment confirmation from user ${buyerId}.`,
                'order'
            )
        )
    );
}

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

    async getOrdersForMyEbooks(req, res) {
        try {
            const ebookOrders = await EbookOrder.findAll({
                include: [
                    {
                        model: Ebook,
                        where: { author_id: req.user.id },
                        required: true,
                        include: [EbookCategory],
                    },
                    {
                        model: User,
                        attributes: ['id', 'full_name', 'phone', 'email'],
                    },
                ],
                order: [['createdAt', 'DESC']],
            });

            return res.status(200).json(
                ebookOrders.map((order) => {
                    const item = order.toJSON();
                    const metadata = item.metadata && typeof item.metadata === 'object'
                        ? item.metadata
                        : {};
                    return {
                        ...item,
                        order_number: item.order_id || `EBOOK-${item.id}`,
                        status: item.payment_status || 'paid',
                        createdAt: item.createdAt || item.purchased_at || item.paid_at,
                        total_amount: item.total_amount || item.price_paid || 0,
                        shipping_address:
                            item.customer_address ||
                            metadata.shipping_address ||
                            null,
                        shipping_method:
                            item.delivery_method ||
                            metadata.shipping_method ||
                            'digital_delivery',
                        notes: item.note ?? item.notes ?? null,
                        Ebook: item.Ebook
                            ? {
                                ...item.Ebook,
                                category_name:
                                    item.Ebook.category_name ||
                                    item.Ebook.EbookCategory?.name ||
                                    null,
                            }
                            : item.Ebook,
                    };
                })
            );
        } catch (error) {
            console.error('Error fetching author ebook orders:', error.message);
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
            const {
                shipping_address,
                shipping_method,
                payment_method,
                notes,
                mobile_money_payment,
            } = req.body;

            const isMobileMoneyPayment = ['mtn_mobile_money', 'orange_money'].includes(payment_method);

            if (isMobileMoneyPayment) {
                const requiredFields = [
                    mobile_money_payment?.provider,
                    mobile_money_payment?.payer_phone_number,
                    mobile_money_payment?.transaction_id,
                ];

                if (requiredFields.some((field) => !field || !field.toString().trim())) {
                    await t.rollback();
                    return res.status(400).json({
                        message: 'Mobile money payment details are required before order confirmation',
                    });
                }
            }

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

            const shippingCost = SHIPPING_COSTS[shipping_method] ?? 0;
            total_amount += shippingCost;

            // Create order
            const order = await Order.create({
                order_number: `ORD-${uuidv4().substring(0, 8)}`,
                UserId: req.user.id,
                total_amount,
                shipping_address,
                shipping_method,
                payment_method,
                notes: buildOrderNotes(notes, isMobileMoneyPayment ? {
                    provider: mobile_money_payment.provider || getMobileMoneyProviderLabel(payment_method),
                    payer_phone_number: mobile_money_payment.payer_phone_number,
                    transaction_id: mobile_money_payment.transaction_id,
                    recipient_number: mobile_money_payment.recipient_number || '+237 6 54 89 70 41',
                    recipient_name: mobile_money_payment.recipient_name || 'Official Agritracker',
                    company_name: mobile_money_payment.company_name || 'Agri_Tracker',
                    verification_status: mobile_money_payment.verification_status || 'submitted',
                    submitted_at: mobile_money_payment.submitted_at,
                } : null),
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
            if (isMobileMoneyPayment) {
                await notifyUser(
                    req.user.id,
                    'Payment Submitted',
                    `Your ${getMobileMoneyProviderLabel(payment_method)} payment for order ${completeOrder.order_number} has been submitted for review.`,
                    'order'
                );
                await notifyAdminsOfMobileMoneySubmission(completeOrder, req.user.id);
            } else {
                await notifyUser(req.user.id, "Order Placed", "Your order has been placed successfully!", "order");
            }

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

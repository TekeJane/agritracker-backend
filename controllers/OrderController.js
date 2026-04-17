const {
    Order,
    OrderItem,
    Cart,
    Product,
    Ebook,
    EbookCategory,
    EbookSubCategory,
    EbookOrder,
    User,
    Category,
    SubCategory,
    sequelize
} = require('../models');
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const notifyUser = require('../services/notifyUser');
const emailService = require('../services/emailServices');
const fs = require('fs');
const { resolveUploadFilePath } = require('../config/uploadPaths');


const VALID_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
const VALID_PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];
const MOBILE_MONEY_NOTE_MARKER = '[MOBILE_MONEY_META]';

const SHIPPING_COSTS = {
    farmer_delivers: 0,
    buyer_pickup: 0,
    standard: 1000,
    express: 2000,
};

function generateDownloadToken() {
    return uuidv4().replace(/-/g, '');
}

function queueBackgroundTask(label, task) {
    setImmediate(async () => {
        try {
            await task();
        } catch (error) {
            console.error(`${label} failed:`, error.message);
        }
    });
}

function normalizeCouponCode(value) {
    return String(value || '').trim().toUpperCase();
}

function getProductDiscountPricing(product, couponCode) {
    const originalPrice = Number(product.price || 0);
    const discountPrice = Number(product.discount_price || 0);
    const normalizedCoupon = normalizeCouponCode(couponCode);
    const productCoupon = normalizeCouponCode(product.coupon_code);
    const isApplied =
        normalizedCoupon.length > 0 &&
        productCoupon.length > 0 &&
        normalizedCoupon === productCoupon &&
        discountPrice > 0 &&
        discountPrice < originalPrice;

    return {
        unitPrice: isApplied ? discountPrice : originalPrice,
        discountPerUnit: isApplied ? originalPrice - discountPrice : 0,
        appliedCouponCode: isApplied ? productCoupon : null,
    };
}

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
                'order',
                {
                    deep_link: 'agritracker://notifications',
                    entity_type: 'order',
                    entity_id: String(order.id || ''),
                }
            )
        )
    );
}

function sanitizeDownloadFilename(title, sourcePath) {
    const extension = sourcePath
        ? (String(sourcePath).match(/\.[A-Za-z0-9]+(?=$|[?#])/i)?.[0] || '.pdf')
        : '.pdf';
    const safeTitle = String(title || 'agritracker-ebook')
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1F]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/ /g, '_');

    return `${safeTitle || 'agritracker-ebook'}${extension}`;
}

function resolveOrderDownloadAccess(orderRecord) {
    const order = orderRecord?.toJSON ? orderRecord.toJSON() : orderRecord;
    const ebook = order?.Ebook || {};
    const metadata =
        order?.metadata && typeof order.metadata === 'object'
            ? order.metadata
            : {};
    const selectedFormat = String(metadata.selected_format || '').trim();
    const variants =
        ebook?.format_variants && typeof ebook.format_variants === 'object'
            ? ebook.format_variants
            : {};
    const selectedVariant = selectedFormat ? variants[selectedFormat] : null;
    const candidateUrl =
        selectedVariant?.manuscript_url ||
        ebook?.file_url ||
        null;

    if (!candidateUrl) {
        return null;
    }

    if (/^https?:\/\//i.test(String(candidateUrl).trim())) {
        return {
            externalUrl: String(candidateUrl).trim(),
            filename: sanitizeDownloadFilename(ebook?.title, candidateUrl),
        };
    }

    const filePath = resolveUploadFilePath(candidateUrl);
    if (!filePath || !fs.existsSync(filePath)) {
        return null;
    }

    return {
        filePath,
        filename: sanitizeDownloadFilename(ebook?.title, filePath),
    };
}

function mapEbookOrderStatus(orderRecord) {
    const item = orderRecord?.toJSON ? orderRecord.toJSON() : orderRecord;
    const paymentStatus = String(item?.payment_status || '').trim().toLowerCase();

    switch (paymentStatus) {
        case 'failed':
        case 'refunded':
            return 'cancelled';
        case 'completed': {
            const metadata =
                item?.metadata && typeof item.metadata === 'object'
                    ? item.metadata
                    : {};
            const deliveryState = resolveEbookDeliveryState(item);
            const emailDeliveryStatus = String(
                metadata.email_delivery_status || ''
            ).trim().toLowerCase();
            const hasDownloadToken = Boolean(metadata.download_token);
            const downloadAccess = resolveOrderDownloadAccess(item);

            if (!deliveryState.isDigitalEbook) {
                return 'delivered';
            }
            if (deliveryState.isEmailDelivery) {
                return emailDeliveryStatus === 'sent' ? 'delivered' : 'processing';
            }
            if (deliveryState.isOnlineDownload) {
                return hasDownloadToken && downloadAccess ? 'delivered' : 'processing';
            }
            return 'processing';
        }
        default:
            return 'pending';
    }
}

function mapEbookPaymentStatus(paymentStatus) {
    switch (String(paymentStatus || '').trim().toLowerCase()) {
        case 'completed':
            return 'paid';
        case 'failed':
            return 'failed';
        case 'refunded':
            return 'refunded';
        default:
            return 'pending';
    }
}

function buildEbookDownloadUrl(order) {
    const token = order?.metadata?.download_token;
    if (!order?.order_id || !token) {
        return '';
    }

    const host = (
        process.env.BACKEND_PUBLIC_URL ||
        process.env.APP_BASE_URL ||
        'https://agritracker-backend-production-1636.up.railway.app'
    ).replace(/\/+$/, '');

    return `${host}/api/Ebooks/orders/${encodeURIComponent(order.order_id)}/download?token=${encodeURIComponent(token)}`;
}

function normalizeDigitalDeliveryMethod(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'email_delivery' ? 'email_delivery' : 'download_online';
}

function parseNullableInteger(value) {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

function resolveProductPreorderState(product) {
    const item = product?.toJSON ? product.toJSON() : product;
    const storedIsPreorder = Boolean(item?.is_preorder);
    const preorderDays = parseNullableInteger(item?.preorder_days);
    const createdAt = item?.createdAt ? new Date(item.createdAt) : new Date();
    let availableDate = item?.preorder_available_date
        ? new Date(item.preorder_available_date)
        : null;

    if ((!availableDate || Number.isNaN(availableDate.getTime())) && storedIsPreorder && preorderDays && preorderDays > 0) {
        availableDate = new Date(createdAt.getTime() + preorderDays * 24 * 60 * 60 * 1000);
    }

    if (availableDate && Number.isNaN(availableDate.getTime())) {
        availableDate = null;
    }

    const isActivePreorder =
        storedIsPreorder &&
        (!availableDate || availableDate.getTime() > Date.now());

    return {
        isActivePreorder,
        preorderAvailableDate: availableDate,
    };
}

function resolveEbookPreorderState(ebook) {
    const item = ebook?.toJSON ? ebook.toJSON() : ebook;
    const isPreorder = Boolean(item?.is_preorder);
    const preorderDays = parseNullableInteger(item?.preorder_days);
    const baseDateValue = item?.posted_at || item?.createdAt || item?.updatedAt || null;
    const baseDate = baseDateValue ? new Date(baseDateValue) : new Date();
    const preorderAvailableDate =
        isPreorder && preorderDays && preorderDays > 0
            ? new Date(baseDate.getTime() + preorderDays * 24 * 60 * 60 * 1000)
            : null;
    const isActivePreorder =
        isPreorder &&
        (!preorderAvailableDate || preorderAvailableDate.getTime() > Date.now());

    return {
        isActivePreorder,
        preorderAvailableDate,
    };
}

function resolveEbookDeliveryState(orderRecord) {
    const item = orderRecord?.toJSON ? orderRecord.toJSON() : orderRecord;
    const metadata =
        item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
    const selectedFormat = String(
        metadata.selected_format || item?.Ebook?.format || 'ebook'
    )
        .trim()
        .toLowerCase();
    const digitalDelivery = normalizeDigitalDeliveryMethod(
        metadata.digital_delivery || item?.delivery_method
    );
    const isCompleted =
        String(item?.payment_status || '').trim().toLowerCase() === 'completed';
    const isDigitalEbook = selectedFormat === 'ebook';
    const isOnlineDownload = isDigitalEbook && digitalDelivery === 'download_online';
    const isEmailDelivery = isDigitalEbook && digitalDelivery === 'email_delivery';

    return {
        selectedFormat,
        digitalDelivery,
        isCompleted,
        isDigitalEbook,
        isOnlineDownload,
        isEmailDelivery,
    };
}

function normalizeEbookOrder(orderRecord) {
    const item = orderRecord.toJSON ? orderRecord.toJSON() : orderRecord;
    const metadata = item.metadata && typeof item.metadata === 'object'
        ? item.metadata
        : {};
    const deliveryState = resolveEbookDeliveryState(item);
    const downloadAccess = resolveOrderDownloadAccess(item);
    const emailDeliveryStatus = String(
        metadata.email_delivery_status || ''
    ).trim().toLowerCase();
    const downloadLinkEmailStatus = String(
        metadata.download_link_email_status || ''
    ).trim().toLowerCase();
    const hasDownloadToken = Boolean(metadata.download_token);
    const downloadIsReady = deliveryState.isCompleted &&
        deliveryState.isOnlineDownload &&
        hasDownloadToken &&
        Boolean(downloadAccess);

    return {
        ...item,
        order_type: 'ebook',
        order_number: item.order_id || `EBOOK-${item.id}`,
        status: mapEbookOrderStatus(item),
        payment_status: mapEbookPaymentStatus(item.payment_status),
        total_amount: item.total_amount || item.price_paid || 0,
        shipping_address: item.customer_address || null,
        shipping_method:
            deliveryState.isDigitalEbook
                ? deliveryState.digitalDelivery
                : (
                    metadata.shipping_method ||
                    item.delivery_method ||
                    'shipping'
                ),
        notes: item.note ?? item.notes ?? null,
        createdAt: item.createdAt || item.purchased_at || item.paid_at,
        payment_method: item.payment_method || 'N/A',
        download_url:
            deliveryState.isOnlineDownload && downloadIsReady
                ? buildEbookDownloadUrl(item)
                : '',
        download_ready: downloadIsReady,
        auto_download: downloadIsReady,
        email_delivery_ready:
            deliveryState.isCompleted &&
            deliveryState.isEmailDelivery &&
            emailDeliveryStatus === 'sent',
        email_delivery_failed:
            deliveryState.isCompleted &&
            deliveryState.isEmailDelivery &&
            emailDeliveryStatus === 'failed',
        download_link_email_sent:
            deliveryState.isCompleted &&
            deliveryState.isOnlineDownload &&
            downloadLinkEmailStatus === 'sent',
        delivery_issue:
            deliveryState.isCompleted &&
            (
                (deliveryState.isEmailDelivery && emailDeliveryStatus === 'failed') ||
                (deliveryState.isOnlineDownload && !downloadIsReady)
            ),
        digital_delivery_method: deliveryState.isDigitalEbook
            ? deliveryState.digitalDelivery
            : null,
        delivery_target: deliveryState.isEmailDelivery
            ? item.customer_email || null
            : item.customer_address || null,
        User: item.User || null,
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
}

async function sendEbookApprovalNotifications(orderRecord) {
    const order = orderRecord.toJSON ? orderRecord.toJSON() : orderRecord;
    const ebook = order.Ebook || {};
    const buyer = order.User || {};
    const metadata =
        order.metadata && typeof order.metadata === 'object'
            ? order.metadata
            : {};
    const deliveryState = resolveEbookDeliveryState({
        ...order,
        Ebook: ebook,
        metadata,
    });
    const buyerMessage =
        deliveryState.isDigitalEbook
            ? deliveryState.isEmailDelivery
                ? `Your ebook order ${order.order_id} has been confirmed. Your ebook will be delivered by email shortly.`
                : `Your ebook order ${order.order_id} has been confirmed. Your download is now ready.`
            : `Your ${deliveryState.selectedFormat} order ${order.order_id} has been confirmed and is now being prepared for delivery.`;

    if (buyer.id) {
        await notifyUser(
            buyer.id,
            'Ebook Order Confirmed',
            buyerMessage,
            'order',
            {
                deep_link: `agritracker://orders/${order.id}`,
                entity_type: 'ebook_order',
                entity_id: String(order.id),
                order_type: 'ebook',
            }
        );
    }

    if (ebook.author_id) {
        await notifyUser(
            ebook.author_id,
            'Ebook Purchase Confirmed',
            `Order ${order.order_id} for "${ebook.title || 'your ebook'}" has been confirmed.`,
            'sale',
            {
                deep_link: `agritracker://orders/${order.id}`,
                entity_type: 'ebook_order',
                entity_id: String(order.id),
                order_type: 'ebook',
            }
        );
    }

    const emailOrder = {
        ...order,
        customer_email: order.customer_email || buyer.email || '',
        _downloadUrl: buildEbookDownloadUrl(order),
    };

    if (
        orderRecord?.update &&
        (
            (deliveryState.isEmailDelivery && !emailOrder.customer_email) ||
            !emailService.isConfigured()
        )
    ) {
        const failedMetadata =
            orderRecord?.metadata && typeof orderRecord.metadata === 'object'
                ? { ...orderRecord.metadata }
                : {};
        const failureReason = !emailService.isConfigured()
            ? 'Email service is not configured on the server'
            : 'Missing recipient email address';

        if (deliveryState.isEmailDelivery) {
            failedMetadata.email_delivery_status = 'failed';
            failedMetadata.email_delivery_error = failureReason;
            failedMetadata.email_delivery_failed_at = new Date().toISOString();
        } else if (deliveryState.isOnlineDownload) {
            failedMetadata.download_link_email_status = 'failed';
            failedMetadata.download_link_email_error = failureReason;
            failedMetadata.download_link_email_failed_at = new Date().toISOString();
        }

        await orderRecord.update({ metadata: failedMetadata });
    }

    if (emailOrder.customer_email && emailService.isConfigured()) {
        try {
            await emailService.sendOrderConfirmation(emailOrder);
            const nextMetadata =
                orderRecord?.metadata && typeof orderRecord.metadata === 'object'
                    ? { ...orderRecord.metadata }
                    : {};
            if (deliveryState.isEmailDelivery) {
                await emailService.sendEbookDeliveryEmail(emailOrder);
                nextMetadata.email_delivery_status = 'sent';
                nextMetadata.email_delivery_sent_at = new Date().toISOString();
                nextMetadata.email_delivery_error = null;
            } else if (deliveryState.isOnlineDownload) {
                await emailService.sendDownloadLink(emailOrder);
                nextMetadata.download_link_email_status = 'sent';
                nextMetadata.download_link_email_sent_at = new Date().toISOString();
                nextMetadata.download_link_email_error = null;
            }
            if (orderRecord?.update) {
                await orderRecord.update({ metadata: nextMetadata });
            }
        } catch (error) {
            if (orderRecord?.update) {
                const failedMetadata =
                    orderRecord?.metadata && typeof orderRecord.metadata === 'object'
                        ? { ...orderRecord.metadata }
                        : {};
                if (deliveryState.isEmailDelivery) {
                    failedMetadata.email_delivery_status = 'failed';
                    failedMetadata.email_delivery_error = error.message;
                    failedMetadata.email_delivery_failed_at = new Date().toISOString();
                } else if (deliveryState.isOnlineDownload) {
                    failedMetadata.download_link_email_status = 'failed';
                    failedMetadata.download_link_email_error = error.message;
                    failedMetadata.download_link_email_failed_at = new Date().toISOString();
                }
                await orderRecord.update({ metadata: failedMetadata });
            }
            console.error('Failed to send ebook approval email:', error.message);
        }
    }
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

            return res.status(200).json(ebookOrders.map((order) => normalizeEbookOrder(order)));
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

            const ebookOrders = await EbookOrder.findAll({
                include: [
                    {
                        model: Ebook,
                        include: [EbookCategory],
                    },
                    {
                        model: User,
                        attributes: ['id', 'full_name', 'phone', 'email'],
                    },
                ],
                order: [['createdAt', 'DESC']],
            });

            const normalizedProductOrders = orders.map((order) => ({
                ...(order.toJSON ? order.toJSON() : order),
                order_type: 'product',
            }));
            const normalizedEbookOrders = ebookOrders.map((order) => normalizeEbookOrder(order));

            const combinedOrders = [...normalizedProductOrders, ...normalizedEbookOrders].sort(
                (left, right) =>
                    new Date(right.createdAt || 0).getTime() -
                    new Date(left.createdAt || 0).getTime(),
            );

            return res.status(200).json(combinedOrders);
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

            const ebookOrders = await EbookOrder.findAll({
                where: { user_id: req.user.id },
                include: [
                    {
                        model: Ebook,
                        include: [EbookCategory, EbookSubCategory],
                    },
                ],
                order: [['createdAt', 'DESC']],
            });

            const normalizedProductOrders = orders.map((order) => ({
                ...(order.toJSON ? order.toJSON() : order),
                order_type: 'product',
            }));
            const normalizedEbookOrders = ebookOrders.map((order) => normalizeEbookOrder(order));

            const combinedOrders = [...normalizedProductOrders, ...normalizedEbookOrders].sort(
                (left, right) =>
                    new Date(right.createdAt || 0).getTime() -
                    new Date(left.createdAt || 0).getTime(),
            );

            return res.status(200).json(combinedOrders);
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
                coupon_code,
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

            if (
                ['standard', 'express'].includes(String(shipping_method || '').trim()) &&
                !String(shipping_address || '').trim()
            ) {
                await t.rollback();
                return res.status(400).json({
                    message: 'Shipping address is required for delivery orders',
                });
            }

            // Total calculation and stock check
              let total_amount = 0;
              let discount_amount = 0;
              const normalizedCouponCode = normalizeCouponCode(coupon_code);
              for (const item of cartItems) {
                  const preorderState = resolveProductPreorderState(item.Product);
                  if (preorderState.isActivePreorder) {
                      await t.rollback();
                      return res.status(400).json({
                          message: `${item.Product.name} is on preorder and cannot be purchased until ${preorderState.preorderAvailableDate?.toISOString() || 'it becomes available'}`,
                      });
                  }
                  if (item.Product.stock_quantity < item.quantity) {
                      await t.rollback();
                      return res.status(400).json({ message: `Insufficient stock for ${item.Product.name}` });
                  }
                  const pricing = getProductDiscountPricing(item.Product, normalizedCouponCode);
                  total_amount += pricing.unitPrice * item.quantity;
                  discount_amount += pricing.discountPerUnit * item.quantity;
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
                  const pricing = getProductDiscountPricing(item.Product, normalizedCouponCode);
                  await OrderItem.create({
                      OrderId: order.id,
                      ProductId: item.ProductId,
                      quantity: item.quantity,
                      price: pricing.unitPrice,
                      subtotal: pricing.unitPrice * item.quantity,
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
                    'Order Received',
                    `Your order ${completeOrder.order_number} has been received successfully. ${getMobileMoneyProviderLabel(payment_method)} payment is now waiting for admin confirmation.`,
                    'order',
                    {
                        deep_link: `agritracker://orders/${completeOrder.id}`,
                        entity_type: 'order',
                        entity_id: String(completeOrder.id),
                          order_type: 'product',
                          coupon_code: normalizedCouponCode,
                          discount_amount: discount_amount.toFixed(2),
                      }
                  );
                await notifyAdminsOfMobileMoneySubmission(completeOrder, req.user.id);
            } else {
                await notifyUser(
                    req.user.id,
                    'Order Placed',
                    `Your order ${completeOrder.order_number} has been placed successfully and is now awaiting approval.`,
                    'order',
                    {
                        deep_link: `agritracker://orders/${completeOrder.id}`,
                        entity_type: 'order',
                        entity_id: String(completeOrder.id),
                        order_type: 'product',
                        coupon_code: normalizedCouponCode,
                        discount_amount: discount_amount.toFixed(2),
                    }
                );
            }

// 🔔 Notify sellers (handle multiple vendors)
            const notifiedSellers = new Set();
            for (const item of completeOrder.OrderItems) {
                const product = item.Product;
                if (product.seller_id && !notifiedSellers.has(product.seller_id)) {
                    await notifyUser(
                        product.seller_id,
                        "New Sale",
                        `Your product "${product.name}" has been ordered and is awaiting fulfillment.`,
                        "sale",
                        {
                            deep_link: `agritracker://orders/${completeOrder.id}`,
                            entity_type: 'order',
                            entity_id: String(completeOrder.id),
                            order_type: 'product',
                            coupon_code: normalizedCouponCode,
                        }
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
            const { status, payment_status, order_type } = req.body;

            if (order_type === 'ebook') {
                const ebookOrder = await EbookOrder.findByPk(req.params.id, {
                    include: [
                        {
                            model: Ebook,
                            include: [EbookCategory, EbookSubCategory],
                        },
                        {
                            model: User,
                            attributes: ['id', 'full_name', 'phone', 'email'],
                        },
                    ],
                });

                if (!ebookOrder) {
                    return res.status(404).json({ message: 'Order not found' });
                }

                let normalizedPaymentStatus = String(payment_status || '').trim().toLowerCase();
                if (normalizedPaymentStatus === 'paid') {
                    normalizedPaymentStatus = 'completed';
                }
                if (payment_status && !['pending', 'completed', 'failed', 'refunded'].includes(normalizedPaymentStatus)) {
                    return res.status(400).json({ message: 'Invalid payment status' });
                }

                if (payment_status) {
                    ebookOrder.payment_status = normalizedPaymentStatus;
                }

                const ebookMetadata =
                    ebookOrder.metadata && typeof ebookOrder.metadata === 'object'
                        ? { ...ebookOrder.metadata }
                        : {};

                if (normalizedPaymentStatus === 'completed') {
                    const preorderState = resolveEbookPreorderState(ebookOrder.Ebook);
                    if (preorderState.isActivePreorder) {
                        return res.status(400).json({
                            message: `This ebook is still on preorder and cannot be completed until ${preorderState.preorderAvailableDate?.toISOString() || 'it becomes available'}`,
                        });
                    }

                    if (!ebookMetadata.download_token) {
                        ebookMetadata.download_token = generateDownloadToken();
                    }

                    const ebookFormat = String(
                        ebookMetadata.selected_format ||
                        ebookOrder.Ebook?.format ||
                        'ebook'
                    )
                        .trim()
                        .toLowerCase();

                    if (ebookFormat === 'ebook') {
                        ebookMetadata.digital_delivery = normalizeDigitalDeliveryMethod(
                            ebookMetadata.digital_delivery || ebookOrder.delivery_method
                        );
                        ebookOrder.delivery_method = ebookMetadata.digital_delivery;
                    }
                }

                ebookOrder.metadata = ebookMetadata;

                if (normalizedPaymentStatus === 'completed' && !ebookOrder.paid_at) {
                    ebookOrder.paid_at = new Date();
                }

                await ebookOrder.save();

                const updatedEbookOrder = await EbookOrder.findByPk(ebookOrder.id, {
                    include: [
                        {
                            model: Ebook,
                            include: [EbookCategory, EbookSubCategory],
                        },
                        {
                            model: User,
                            attributes: ['id', 'full_name', 'phone', 'email'],
                        },
                    ],
                });

                if (normalizedPaymentStatus === 'completed') {
                    await sendEbookApprovalNotifications(updatedEbookOrder);
                }

                return res.status(200).json(normalizeEbookOrder(updatedEbookOrder));
            }

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

            const shouldNotifyBuyer =
                !!payment_status || !!status;

            if (shouldNotifyBuyer) {
                const effectiveStatus = status || updatedOrder?.status || order.status;
                const effectivePaymentStatus =
                    payment_status || updatedOrder?.payment_status || order.payment_status;
                let buyerTitle = 'Order Updated';
                let buyerMessage = `Your order ${updatedOrder.order_number} has been updated to ${effectiveStatus}.`;

                if (effectiveStatus === 'processing') {
                    buyerTitle = 'Order Approved';
                    buyerMessage = `Your order ${updatedOrder.order_number} has been approved. You are now waiting for your products.`;
                } else if (effectiveStatus === 'shipped') {
                    buyerTitle = 'Order Shipped';
                    buyerMessage = `Your order ${updatedOrder.order_number} has been shipped and is on the way.`;
                } else if (effectiveStatus === 'delivered') {
                    buyerTitle = 'Order Delivered';
                    buyerMessage = `Your order ${updatedOrder.order_number} has been delivered successfully.`;
                } else if (effectiveStatus === 'cancelled') {
                    buyerTitle = 'Order Cancelled';
                    buyerMessage = `Your order ${updatedOrder.order_number} has been cancelled.`;
                } else if (effectivePaymentStatus === 'paid' || effectivePaymentStatus === 'completed') {
                    buyerTitle = 'Payment Confirmed';
                    buyerMessage = `Payment for order ${updatedOrder.order_number} has been confirmed successfully.`;
                } else if (effectivePaymentStatus === 'failed') {
                    buyerTitle = 'Payment Failed';
                    buyerMessage = `Payment for order ${updatedOrder.order_number} could not be confirmed.`;
                }

                if (updatedOrder?.UserId) {
                    await notifyUser(
                        updatedOrder.UserId,
                        buyerTitle,
                        buyerMessage,
                        'order',
                        {
                            deep_link: `agritracker://orders/${updatedOrder.id}`,
                            entity_type: 'order',
                            entity_id: String(updatedOrder.id),
                            order_type: 'product',
                        }
                    );
                }
                const sellerIds = new Set(
                    (updatedOrder?.OrderItems || [])
                        .map((item) => item?.Product?.seller_id)
                        .filter(Boolean),
                );
                await Promise.all(
                    [...sellerIds].map((sellerId) =>
                        notifyUser(
                            sellerId,
                            effectiveStatus === 'processing'
                                ? 'Order Approved'
                                : 'Order Updated',
                            effectiveStatus === 'processing'
                                ? `Order ${updatedOrder.order_number} has been approved and is ready for fulfillment.`
                                : `Order ${updatedOrder.order_number} for your product has been updated.`,
                            'sale',
                            {
                                deep_link: `agritracker://orders/${updatedOrder.id}`,
                                entity_type: 'order',
                                entity_id: String(updatedOrder.id),
                                order_type: 'product',
                            }
                        )
                    )
                );
            }

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

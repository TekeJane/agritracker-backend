const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Ebook, EbookCategory, EbookSubCategory, EbookOrder, User, Review, sequelize } = require('../models');
const { Op } = require('sequelize');
const { toUploadDbPath, resolveUploadFilePath } = require('../config/uploadPaths');
const notifyUser = require('../services/notifyUser');
const emailService = require('../services/emailServices');
const TOP_MARKETPLACE_THRESHOLD = 50;

const EDITION_KEYS = ['ebook', 'paperback', 'hardcover'];

function buildPublicUrl(value, host) {
    if (!value) return null;
    if (value.startsWith('http://') || value.startsWith('https://')) {
        return value;
    }

    const normalized = toUploadDbPath(value).replace(/^\/+/, '');
    return `${host}/${normalized}`;
}

function parseJsonField(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch (_) {
        return fallback;
    }
}

function normalizeKeywords(keywords) {
    if (Array.isArray(keywords)) {
        return keywords.map((item) => String(item).trim()).filter(Boolean);
    }

    return String(keywords || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
}

function parseNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    return ['true', '1', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function resolveEbookPreorderState(ebook) {
    const item = ebook?.toJSON ? ebook.toJSON() : ebook;
    const isPreorder = Boolean(item?.is_preorder);
    const preorderDays = Number.isFinite(Number(item?.preorder_days))
        ? Number(item.preorder_days)
        : null;
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
        preorderDays,
        preorderAvailableDate,
        isAvailableForPurchase: !isActivePreorder,
    };
}

function normalizeCouponCode(value) {
    return String(value || '').trim().toUpperCase();
}

function getEditionDefaults(key) {
    switch (key) {
        case 'paperback':
            return { printingCost: 1000, royaltyPercentage: 20 };
        case 'hardcover':
            return { printingCost: 2000, royaltyPercentage: 30 };
        case 'ebook':
        default:
            return { printingCost: 0, royaltyPercentage: 10 };
    }
}

function getEnabledVariants(variants) {
    return EDITION_KEYS
        .map((key) => variants[key])
        .filter((variant) => variant?.enabled);
}

function syncSharedVariantFields(variants) {
    const enabledVariants = getEnabledVariants(variants);
    const sharedPageCount = enabledVariants.find((variant) => Number(variant.page_count || 0) > 0)?.page_count || 0;
    const sharedStock = enabledVariants.find((variant) => Number(variant.stock_quantity || 0) > 0)?.stock_quantity || 0;

    for (const key of EDITION_KEYS) {
        const variant = variants[key];
        if (!variant || !variant.enabled) continue;
        if (sharedPageCount > 0) {
            variant.page_count = sharedPageCount;
        }
        if (sharedStock > 0) {
            variant.stock_quantity = sharedStock;
        }
    }

    return variants;
}

function applyEditionBusinessRules(key, variant) {
    const defaults = getEditionDefaults(key);
    const normalizedPrice = parseNumber(variant.price, 0);
    const rawDiscountPrice = parseNumber(variant.discount_price, 0);
    const normalizedCouponCode = normalizeCouponCode(variant.coupon_code);
    const hasValidDiscount =
        rawDiscountPrice > 0 &&
        rawDiscountPrice < normalizedPrice &&
        normalizedCouponCode.length >= 3;

    return {
        ...variant,
        printing_cost: key === 'ebook' ? 0 : defaults.printingCost,
        royalty_percentage: defaults.royaltyPercentage,
        stock_quantity: Math.max(parseInt(variant.stock_quantity, 10) || 0, 0),
        page_count: Math.max(parseInt(variant.page_count, 10) || 0, 0),
        discount_price: hasValidDiscount ? rawDiscountPrice : null,
        coupon_code: hasValidDiscount ? normalizedCouponCode : null,
        discount_percentage:
            hasValidDiscount && normalizedPrice > 0
                ? Math.round(((normalizedPrice - rawDiscountPrice) / normalizedPrice) * 100)
                : 0,
    };
}

function getVariantDiscountDetails(variant, fallbackPrice = 0, couponCode = null) {
    const basePrice = parseNumber(variant?.price, fallbackPrice);
    const discountPrice = parseNumber(variant?.discount_price, 0);
    const normalizedCouponCode = normalizeCouponCode(couponCode);
    const variantCouponCode = normalizeCouponCode(variant?.coupon_code);
    const isApplied =
        normalizedCouponCode.length > 0 &&
        variantCouponCode.length > 0 &&
        normalizedCouponCode === variantCouponCode &&
        discountPrice > 0 &&
        discountPrice < basePrice;

    const discountPercentage =
        discountPrice > 0 && discountPrice < basePrice
            ? Math.round(((basePrice - discountPrice) / basePrice) * 100)
            : 0;

    return {
        basePrice,
        discountPrice: discountPrice > 0 && discountPrice < basePrice ? discountPrice : null,
        couponCode: variantCouponCode || null,
        discountPercentage,
        isApplied,
        effectivePrice: isApplied ? discountPrice : basePrice,
        discountAmount: isApplied ? basePrice - discountPrice : 0,
    };
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildEbookShareUrl(host, ebookId) {
    return `${host}/api/ebooks/share/${ebookId}`;
}

function buildAppDeepLinkUrl(type, id) {
    return `agritracker://${type}/${id}`;
}

function generateDownloadToken() {
    return crypto.randomBytes(24).toString('hex');
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

function sanitizeDownloadFilename(title, filePath) {
    const extension = path.extname(filePath) || '.pdf';
    const safeTitle = String(title || 'agritracker-ebook')
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1F]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/ /g, '_');

    return `${safeTitle || 'agritracker-ebook'}${extension}`;
}

function resolveOrderDownloadFileUrl(orderRecord, host) {
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

    return buildPublicUrl(candidateUrl, host);
}

function resolveOrderDownloadFilePath(orderRecord) {
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

    const filePath = resolveUploadFilePath(candidateUrl);
    if (!filePath || !fs.existsSync(filePath)) {
        return null;
    }

    return {
        filePath,
        filename: sanitizeDownloadFilename(ebook?.title, filePath),
    };
}

function mapEbookOrderStatus(paymentStatus) {
    switch (String(paymentStatus || '').trim().toLowerCase()) {
        case 'completed':
            return 'delivered';
        case 'failed':
            return 'cancelled';
        case 'refunded':
            return 'cancelled';
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

function normalizeEbookOrder(orderRecord) {
    const item = orderRecord.toJSON ? orderRecord.toJSON() : orderRecord;
    const metadata = item.metadata && typeof item.metadata === 'object'
        ? item.metadata
        : {};
    const deliveryState = resolveEbookDeliveryState(item);
    const emailDeliveryStatus = String(
        metadata.email_delivery_status || ''
    ).trim().toLowerCase();
    const downloadLinkEmailStatus = String(
        metadata.download_link_email_status || ''
    ).trim().toLowerCase();
    const hasDownloadToken = Boolean(metadata.download_token);

    return {
        ...item,
        order_type: 'ebook',
        order_number: item.order_id || `EBOOK-${item.id}`,
        status: mapEbookOrderStatus(item.payment_status),
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
        download_url: deliveryState.isOnlineDownload ? buildEbookDownloadUrl(item) : '',
        download_ready:
            deliveryState.isCompleted &&
            deliveryState.isOnlineDownload &&
            hasDownloadToken,
        auto_download:
            deliveryState.isCompleted &&
            deliveryState.isOnlineDownload &&
            hasDownloadToken,
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

async function notifyAdminsOfEbookOrder(order) {
    const admins = await User.findAll({
        where: { role: 'admin' },
        attributes: ['id'],
    });

    await Promise.all(
        admins.map((admin) =>
            notifyUser(
                admin.id,
                'New Ebook Order',
                `Order ${order.order_id} for an ebook needs admin attention.`,
                'order',
                {
                    deep_link: 'agritracker://notifications',
                    entity_type: 'ebook_order',
                    entity_id: String(order.id || ''),
                    order_type: 'ebook',
                }
            )
        )
    );
}

async function sendEbookOrderNotifications(orderRecord, ebookRecord, buyerRecord, eventLabel = 'confirmed') {
    const order = orderRecord.toJSON ? orderRecord.toJSON() : orderRecord;
    const ebook = ebookRecord?.toJSON ? ebookRecord.toJSON() : ebookRecord;
    const buyer = buyerRecord?.toJSON ? buyerRecord.toJSON() : buyerRecord;
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
        eventLabel === 'confirmed'
            ? deliveryState.isDigitalEbook
                ? deliveryState.isEmailDelivery
                    ? `Your ebook order ${order.order_id} has been confirmed. Your ebook will be sent to your email shortly.`
                    : `Your ebook order ${order.order_id} has been confirmed. Your download is now ready.`
                : `Your ${deliveryState.selectedFormat} order ${order.order_id} has been confirmed and is now being prepared for delivery.`
            : `Your order ${order.order_id} has been received successfully and is awaiting admin confirmation.`;

    const orderForEmail = {
        ...order,
        Ebook: ebook,
        User: buyer,
        customer_email: order.customer_email || buyer?.email || '',
        _downloadUrl: buildEbookDownloadUrl(order),
    };

    if (buyer?.id) {
        await notifyUser(
            buyer.id,
            eventLabel === 'confirmed' ? 'Ebook Order Confirmed' : 'Ebook Order Received',
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

    if (ebook?.author_id) {
        await notifyUser(
            ebook.author_id,
            eventLabel === 'confirmed' ? 'Ebook Purchase Confirmed' : 'New Ebook Purchase',
            `Order ${order.order_id} for "${ebook.title || 'your ebook'}" ${eventLabel === 'confirmed' ? 'has been confirmed' : 'was created'}.`,
            'sale',
            {
                deep_link: `agritracker://orders/${order.id}`,
                entity_type: 'ebook_order',
                entity_id: String(order.id),
                order_type: 'ebook',
            }
        );
    }

    if (
        eventLabel === 'confirmed' &&
        orderRecord?.update &&
        (
            (deliveryState.isEmailDelivery && !orderForEmail.customer_email) ||
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

    if (eventLabel === 'confirmed' && orderForEmail.customer_email && emailService.isConfigured()) {
        try {
            await emailService.sendOrderConfirmation(orderForEmail);
            const nextMetadata =
                orderRecord?.metadata && typeof orderRecord.metadata === 'object'
                    ? { ...orderRecord.metadata }
                    : {};
            if (deliveryState.isEmailDelivery) {
                await emailService.sendEbookDeliveryEmail(orderForEmail);
                nextMetadata.email_delivery_status = 'sent';
                nextMetadata.email_delivery_sent_at = new Date().toISOString();
                nextMetadata.email_delivery_error = null;
            } else if (deliveryState.isOnlineDownload) {
                await emailService.sendDownloadLink(orderForEmail);
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
            console.error('Failed to send ebook confirmation email:', error.message);
        }
    }
}

function getFirstFile(req, fieldName) {
    return req.files?.[fieldName]?.[0] || null;
}

function getArrayFiles(req, fieldName) {
    return Array.isArray(req.files?.[fieldName]) ? req.files[fieldName] : [];
}

function defaultVariant(key) {
    const defaults = getEditionDefaults(key);
    return {
        key,
        label: key[0].toUpperCase() + key.slice(1),
        enabled: false,
        manuscript_url: null,
        cover_image: null,
        print_ready_cover_url: null,
        price: 0,
        printing_cost: defaults.printingCost,
        stock_quantity: 0,
        royalty_percentage: defaults.royaltyPercentage,
        page_count: 0,
        isbn_mode: 'free',
        isbn_value: null,
        interior_type: null,
        trim_size: null,
        paper_type: null,
        discount_price: null,
        coupon_code: null,
        discount_percentage: 0,
        currency: 'XAF',
        upload_status: 'pending',
    };
}

function normalizeEditionVariant(key, input, req) {
    const base = defaultVariant(key);
    const raw = input || {};
    const manuscript = getFirstFile(req, `${key}_file`);
    const cover = getFirstFile(req, `${key}_cover_image`);
    const printReadyCover = getFirstFile(req, `${key}_print_ready_cover`);
    const enabled =
        parseBoolean(raw.enabled) ||
        !!manuscript ||
        !!cover ||
        !!printReadyCover;

    return applyEditionBusinessRules(key, {
        ...base,
        label: raw.label || base.label,
        enabled,
        manuscript_url: toUploadDbPath(manuscript?.path) || raw.manuscript_url || null,
        cover_image: toUploadDbPath(cover?.path) || raw.cover_image || null,
        print_ready_cover_url: toUploadDbPath(printReadyCover?.path) || raw.print_ready_cover_url || null,
        price: parseNumber(raw.price, 0),
        stock_quantity: Math.max(parseInt(raw.stock_quantity, 10) || 0, 0),
        page_count: Math.max(parseInt(raw.page_count, 10) || 0, 0),
        isbn_mode: raw.isbn_mode || 'free',
        isbn_value: raw.isbn_value || null,
        interior_type: raw.interior_type || null,
        trim_size: raw.trim_size || null,
        paper_type: raw.paper_type || null,
        discount_price: raw.discount_price,
        coupon_code: raw.coupon_code,
        currency: raw.currency || 'XAF',
        upload_status: enabled ? 'uploaded' : 'pending',
    });
}

function normalizeDraftVariant(key, input) {
    const base = defaultVariant(key);
    const raw = input || {};

    return applyEditionBusinessRules(key, {
        ...base,
        ...raw,
        key,
        label: raw.label || base.label,
        enabled: parseBoolean(raw.enabled),
        price: parseNumber(raw.price, 0),
        stock_quantity: Math.max(parseInt(raw.stock_quantity, 10) || 0, 0),
        page_count: Math.max(parseInt(raw.page_count, 10) || 0, 0),
        currency: raw.currency || 'XAF',
        upload_status: raw.upload_status || (parseBoolean(raw.enabled) ? 'draft' : 'pending'),
        discount_price: raw.discount_price,
        coupon_code: raw.coupon_code,
    });
}

function buildFormatVariants(req) {
    const submitted = parseJsonField(req.body.format_variants, {});
    const variants = {};

    for (const key of EDITION_KEYS) {
        variants[key] = normalizeEditionVariant(key, submitted[key], req);
    }

    return syncSharedVariantFields(variants);
}

function buildDraftFormatVariants(rawVariants) {
    const variants = {};

    for (const key of EDITION_KEYS) {
        variants[key] = normalizeDraftVariant(key, rawVariants[key]);
    }

    return syncSharedVariantFields(variants);
}

function buildBookMetadata(req) {
    const raw = parseJsonField(req.body.book_metadata, {});
    const contributors = Array.isArray(raw.contributors)
        ? raw.contributors
            .map((item) => ({
                role: String(item?.role || '').trim(),
                name: String(item?.name || '').trim(),
            }))
            .filter((item) => item.name)
        : [];

    return {
        language: raw.language || req.body.language || 'English',
        subtitle: raw.subtitle || req.body.subtitle || null,
        series_name: raw.series_name || req.body.series_name || null,
        series_volume: raw.series_volume || req.body.series_volume || null,
        primary_author: raw.primary_author || req.body.primary_author || null,
        contributors,
        rich_description: raw.rich_description || null,
        keywords: normalizeKeywords(raw.keywords || req.body.keywords),
        territories_mode: raw.territories_mode || req.body.territories_mode || 'worldwide',
        individual_territories: Array.isArray(raw.individual_territories) ? raw.individual_territories : [],
        primary_marketplace: raw.primary_marketplace || req.body.primary_marketplace || 'XAF',
        buyer_format_selection: parseBoolean(raw.buyer_format_selection ?? req.body.buyer_format_selection ?? true),
        use_free_isbn: parseBoolean(raw.use_free_isbn ?? req.body.use_free_isbn ?? true),
        page_count:
            Math.max(
                parseInt(raw.page_count ?? req.body.page_count, 10) || 0,
                0
            ) || null,
    };
}

function choosePrimaryVariant(preferredKey, variants) {
    if (preferredKey && variants[preferredKey]?.enabled) {
        return { key: preferredKey, variant: variants[preferredKey] };
    }

    for (const key of EDITION_KEYS) {
        if (variants[key]?.enabled) {
            return { key, variant: variants[key] };
        }
    }

    return { key: 'ebook', variant: variants.ebook || defaultVariant('ebook') };
}

function runAutomatedChecks({ title, description, galleryImages, variants }) {
    const errors = [];
    const warnings = [];
    const checks = [];

    if (!title || title.trim().length < 3) {
        errors.push('Book title is too short.');
    }

    if (!description || description.trim().length < 30) {
        warnings.push('Description is shorter than recommended for store quality.');
    }

    if ((galleryImages || []).length < 2) {
        warnings.push('Add at least two gallery images for a stronger store presentation.');
    }

    const enabledVariants = EDITION_KEYS.filter((key) => variants[key]?.enabled);
    if (enabledVariants.length === 0) {
        errors.push('Enable at least one format before publishing.');
    }

    for (const key of enabledVariants) {
        const variant = variants[key];
        checks.push(`${variant.label} edition detected`);

        if (!variant.cover_image) {
            errors.push(`${variant.label} cover is missing.`);
        }
        if (!variant.manuscript_url) {
            errors.push(`${variant.label} manuscript file is missing.`);
        }
        if (variant.price <= 0) {
            errors.push(`${variant.label} price must be greater than zero.`);
        }
        if ((variant.page_count || 0) <= 0) {
            errors.push(`${variant.label} page count is required.`);
        }
        if (key !== 'ebook' && !variant.trim_size) {
            warnings.push(`${variant.label} trim size has not been selected yet.`);
        }
        if (key !== 'ebook' && !variant.print_ready_cover_url) {
            warnings.push(`${variant.label} print-ready cover PDF is still missing.`);
        }
        if (
            variant.discount_price &&
            (!variant.coupon_code || variant.discount_percentage <= 0)
        ) {
            errors.push(`${variant.label} discount needs both a valid coupon code and a lower discount price.`);
        }
    }

    return {
        status: errors.length > 0 ? 'failed' : warnings.length > 0 ? 'warning' : 'passed',
        summary:
            errors.length > 0
                ? 'Fix the required publishing issues before going live.'
                : warnings.length > 0
                    ? 'Publishing checks completed with a few recommendations.'
                    : 'All automated publishing checks passed.',
        errors,
        warnings,
        checks,
        checked_at: new Date().toISOString(),
    };
}

function resolveVariantForOrder(ebook, selectedFormat) {
    const variants = ebook.format_variants || {};
    const preferred = selectedFormat && variants[selectedFormat]?.enabled
        ? { key: selectedFormat, variant: variants[selectedFormat] }
        : choosePrimaryVariant(ebook.format, variants);

    return preferred;
}

function getOrderPricing(ebook, selectedFormat, couponCode = null) {
    const chosenVariant = resolveVariantForOrder(ebook, selectedFormat);
    const discountDetails = getVariantDiscountDetails(
        chosenVariant.variant,
        parseNumber(ebook.price, 0),
        couponCode
    );
    const basePrice = discountDetails.effectivePrice;
    const printingCost = chosenVariant.key === 'ebook'
        ? 0
        : parseNumber(chosenVariant.variant.printing_cost, 0);

    return {
        chosenVariant,
        basePrice,
        printingCost,
        discountAmount: discountDetails.discountAmount,
        discountPercentage: discountDetails.discountPercentage,
        appliedCouponCode: discountDetails.isApplied ? discountDetails.couponCode : null,
        totalPrice: basePrice + printingCost,
    };
}

function formatEbook(ebook, host) {
    const item = ebook.toJSON ? ebook.toJSON() : ebook;
    const galleryImages = Array.isArray(item.gallery_images) ? item.gallery_images : [];
    const rawVariants = item.format_variants && typeof item.format_variants === 'object'
        ? item.format_variants
        : {};

    const formatVariants = Object.entries(rawVariants).reduce((acc, [key, value]) => {
        const variant = value || {};
        const discountDetails = getVariantDiscountDetails(
            variant,
            parseNumber(variant.price || item.price, 0)
        );
        acc[key] = {
            ...variant,
            manuscript_url: buildPublicUrl(variant.manuscript_url, host),
            cover_image: buildPublicUrl(variant.cover_image, host),
            print_ready_cover_url: buildPublicUrl(variant.print_ready_cover_url, host),
            discount_price: discountDetails.discountPrice,
            coupon_code: discountDetails.couponCode,
            discount_percentage: discountDetails.discountPercentage,
        };
        return acc;
    }, {});

    const enabledVariants = Object.values(formatVariants).filter((variant) => variant?.enabled);
    const highestDiscount = enabledVariants.reduce((max, variant) => {
        const percentage = Number(variant.discount_percentage || 0);
        return percentage > max ? percentage : max;
    }, 0);
    const preorderState = resolveEbookPreorderState(item);

    return {
        ...item,
        cover_image: buildPublicUrl(item.cover_image, host),
        file_url: buildPublicUrl(item.file_url, host),
        gallery_images: galleryImages.map((image) => buildPublicUrl(image, host)),
        keywords: normalizeKeywords(item.keywords),
        author_name: item.User?.full_name || item.author_name || 'Author',
        author_id: item.User?.id || item.author_id || null,
        author_profile_image: buildPublicUrl(item.User?.profile_image || item.author_profile_image, host),
        category_name: item.EbookCategory?.name || item.category_name || null,
        sub_category_id: item.sub_category_id || item.EbookSubCategory?.id || null,
        sub_category_name: item.EbookSubCategory?.name || item.sub_category_name || null,
        ratings_count: item.ratings_count || 0,
        ratings_average: item.ratings_average || 0,
        isPurchased: item.isPurchased || false,
        posted_at: item.posted_at || item.createdAt,
        book_metadata: item.book_metadata || {},
        format_variants: formatVariants,
        validation_report: item.validation_report || null,
        publication_status: item.publication_status || 'published',
        last_draft_saved_at: item.last_draft_saved_at || null,
        order_count: Number(item.order_count || 0),
        orderCount: Number(item.order_count || 0),
        is_top_author_item: Number(item.order_count || 0) >= TOP_MARKETPLACE_THRESHOLD,
        isTopAuthorItem: Number(item.order_count || 0) >= TOP_MARKETPLACE_THRESHOLD,
        is_preorder: preorderState.isActivePreorder,
        isPreorder: preorderState.isActivePreorder,
        preorder_days: preorderState.preorderDays,
        preorderDays: preorderState.preorderDays,
        preorder_available_date: preorderState.preorderAvailableDate,
        preorderAvailableDate: preorderState.preorderAvailableDate,
        is_available_for_purchase: preorderState.isAvailableForPurchase,
        isAvailableForPurchase: preorderState.isAvailableForPurchase,
        discount_percentage: highestDiscount,
        discountPercentage: highestDiscount,
        has_discount: highestDiscount > 0,
        hasDiscount: highestDiscount > 0,
        share_url: buildEbookShareUrl(host, item.id),
    };
}

async function attachEbookOrderCounts(ebooks) {
    if (!Array.isArray(ebooks) || ebooks.length === 0) {
        return ebooks;
    }

    const ebookIds = ebooks.map((ebook) => Number(ebook.id)).filter(Boolean);
    if (ebookIds.length === 0) {
        return ebooks;
    }

    const orderCounts = await EbookOrder.findAll({
        attributes: [
            'Ebook_id',
            [sequelize.fn('COUNT', sequelize.col('id')), 'order_count'],
        ],
        where: {
            Ebook_id: ebookIds,
            payment_status: {
                [Op.in]: ['paid', 'completed'],
            },
        },
        group: ['Ebook_id'],
        raw: true,
    });

    const countsByEbookId = new Map(
        orderCounts.map((row) => [Number(row.Ebook_id), Number(row.order_count || 0)]),
    );

    for (const ebook of ebooks) {
        ebook.setDataValue('order_count', countsByEbookId.get(Number(ebook.id)) || 0);
    }

    return ebooks;
}

function sortEbooksByMarketplacePriority(ebooks) {
    return [...ebooks].sort((a, b) => {
        const aCount = Number(a.get?.('order_count') ?? a.order_count ?? 0);
        const bCount = Number(b.get?.('order_count') ?? b.order_count ?? 0);
        const aTop = aCount >= TOP_MARKETPLACE_THRESHOLD ? 1 : 0;
        const bTop = bCount >= TOP_MARKETPLACE_THRESHOLD ? 1 : 0;

        if (aTop != bTop) return bTop - aTop;
        if (aCount != bCount) return bCount - aCount;
        return new Date(b.updatedAt || b.createdAt).getTime() -
            new Date(a.updatedAt || a.createdAt).getTime();
    });
}

async function enrichEbookMetrics(ebookOrEbooks, userId = null) {
    const ebooks = Array.isArray(ebookOrEbooks) ? ebookOrEbooks : [ebookOrEbooks];
    const ebookIds = ebooks.map((ebook) => ebook.id);
    if (ebookIds.length === 0) return Array.isArray(ebookOrEbooks) ? [] : ebookOrEbooks;

    const reviews = await Review.findAll({
        where: { ebookId: ebookIds },
        attributes: ['ebookId', 'rating'],
    });

    const purchases = userId
        ? await EbookOrder.findAll({
            where: {
                user_id: userId,
                Ebook_id: ebookIds,
                payment_status: 'completed',
            },
            attributes: ['Ebook_id'],
        })
        : [];

    const ratingsByEbook = new Map();
    for (const review of reviews) {
        const key = Number(review.ebookId);
        const current = ratingsByEbook.get(key) || { count: 0, total: 0 };
        current.count += 1;
        current.total += Number(review.rating || 0);
        ratingsByEbook.set(key, current);
    }

    const purchasedIds = new Set(purchases.map((item) => Number(item.Ebook_id)));

    for (const ebook of ebooks) {
        const metrics = ratingsByEbook.get(Number(ebook.id)) || { count: 0, total: 0 };
        ebook.setDataValue('ratings_count', metrics.count);
        ebook.setDataValue(
            'ratings_average',
            metrics.count > 0 ? Number((metrics.total / metrics.count).toFixed(1)) : 0
        );
        ebook.setDataValue('isPurchased', purchasedIds.has(Number(ebook.id)));
    }

    return Array.isArray(ebookOrEbooks) ? ebooks : ebooks[0];
}

const EbookController = {
    async uploadEbook(req, res) {
        try {
            const {
                title,
                description,
                category_id,
                sub_category_id,
                format,
                origin_region,
                origin_town,
                posted_at,
                is_preorder,
                preorder_days,
            } = req.body;

            if (!title || !description || !category_id) {
                return res.status(400).json({ error: 'Missing required fields.' });
            }

            const bookMetadata = buildBookMetadata(req);
            const formatVariants = buildFormatVariants(req);
            const primary = choosePrimaryVariant(format, formatVariants);
            const galleryImages = getArrayFiles(req, 'gallery_images').map((file) => toUploadDbPath(file.path));
            const validationReport = runAutomatedChecks({
                title,
                description,
                galleryImages,
                variants: formatVariants,
            });

            if (validationReport.errors.length > 0) {
                return res.status(400).json({
                    error: 'Publishing validation failed.',
                    validation_report: validationReport,
                });
            }

            const coverImage =
                toUploadDbPath(getFirstFile(req, 'cover_image')?.path) ||
                primary.variant.cover_image ||
                null;
            const fileUrl =
                toUploadDbPath(getFirstFile(req, 'file')?.path) ||
                primary.variant.manuscript_url ||
                null;

            const createdEbook = await Ebook.create({
                title,
                description,
                price: String(primary.variant.price || req.body.price || 0),
                format: primary.key,
                printing_cost: primary.variant.printing_cost || parseNumber(req.body.printing_cost, 0),
                keywords: bookMetadata.keywords,
                file_url: fileUrl,
                cover_image: coverImage,
                gallery_images: galleryImages,
                book_metadata: bookMetadata,
                format_variants: formatVariants,
                validation_report: validationReport,
                publication_status: 'published',
                last_draft_saved_at: null,
                author_id: req.user.id,
                category_id,
                sub_category_id: sub_category_id || null,
                origin_region: origin_region || null,
                origin_town: origin_town || null,
                posted_at: posted_at || new Date(),
                is_preorder: parseBoolean(is_preorder),
                preorder_days: preorder_days ? parseInt(preorder_days, 10) : null,
                is_approved: true,
                is_featured: false,
            });

            const fullEbook = await Ebook.findByPk(createdEbook.id, {
                include: [EbookCategory, EbookSubCategory, User],
            });
            await enrichEbookMetrics(fullEbook, req.user?.id);
            const host = `${req.protocol}://${req.get('host')}`;

            return res.status(201).json({
                message: 'Ebook uploaded successfully.',
                Ebook: formatEbook(fullEbook, host),
            });
        } catch (err) {
            console.error('Error uploading Ebook:', err);
            return res.status(500).json({ error: 'Server error while uploading Ebook.' });
        }
    },

    async saveDraft(req, res) {
        try {
            const {
                draft_id,
                title,
                description,
                category_id,
                sub_category_id,
                format,
                origin_region,
                origin_town,
                posted_at,
                is_preorder,
                preorder_days,
            } = req.body;

            const bookMetadata = buildBookMetadata(req);
            const formatVariants = buildDraftFormatVariants(
                parseJsonField(req.body.format_variants, {})
            );
            const primary = choosePrimaryVariant(format, formatVariants);
            const validationReport = runAutomatedChecks({
                title,
                description,
                galleryImages: [],
                variants: formatVariants,
            });

            let draft = null;

            if (draft_id) {
                draft = await Ebook.findByPk(draft_id);
                if (!draft || (draft.author_id !== req.user.id && req.user.role !== 'admin')) {
                    return res.status(404).json({ error: 'Draft not found' });
                }

                await draft.update({
                    title: title || draft.title || 'Untitled draft',
                    description: description || draft.description || '',
                    price: String(primary.variant.price || draft.price || 0),
                    format: primary.key || draft.format || 'ebook',
                    printing_cost: primary.variant.printing_cost || draft.printing_cost || 0,
                    keywords: bookMetadata.keywords,
                    category_id: category_id || draft.category_id,
                    sub_category_id: sub_category_id || null,
                    origin_region: origin_region || null,
                    origin_town: origin_town || null,
                    posted_at: posted_at || draft.posted_at || new Date(),
                    is_preorder: parseBoolean(is_preorder),
                    preorder_days: preorder_days ? parseInt(preorder_days, 10) : null,
                    book_metadata: bookMetadata,
                    format_variants: formatVariants,
                    validation_report: validationReport,
                    publication_status: 'draft',
                    last_draft_saved_at: new Date(),
                    is_approved: false,
                });
            } else {
                draft = await Ebook.create({
                    title: title || 'Untitled draft',
                    description: description || '',
                    price: String(primary.variant.price || 0),
                    format: primary.key || 'ebook',
                    printing_cost: primary.variant.printing_cost || 0,
                    keywords: bookMetadata.keywords,
                    file_url: null,
                    cover_image: null,
                    gallery_images: [],
                    book_metadata: bookMetadata,
                    format_variants: formatVariants,
                    validation_report: validationReport,
                    publication_status: 'draft',
                    last_draft_saved_at: new Date(),
                    author_id: req.user.id,
                    category_id: category_id || null,
                    sub_category_id: sub_category_id || null,
                    origin_region: origin_region || null,
                    origin_town: origin_town || null,
                    posted_at: posted_at || new Date(),
                    is_preorder: parseBoolean(is_preorder),
                    preorder_days: preorder_days ? parseInt(preorder_days, 10) : null,
                    is_approved: false,
                    is_featured: false,
                });
            }

            const fullDraft = await Ebook.findByPk(draft.id, {
                include: [EbookCategory, EbookSubCategory, User],
            });
            const host = `${req.protocol}://${req.get('host')}`;

            return res.status(200).json({
                message: 'Draft synced successfully.',
                Ebook: formatEbook(fullDraft, host),
            });
        } catch (err) {
            console.error('Error saving ebook draft:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async listApprovedEbooks(req, res) {
        try {
            const approved = req.query.approved;
            const adminView = String(req.query.admin_view || '').toLowerCase() === 'true';
            const whereClause = {};

            if (approved === 'false') {
                whereClause.is_approved = false;
                if (req.query.publication_status) {
                    whereClause.publication_status = req.query.publication_status;
                } else if (!adminView) {
                    whereClause.publication_status = 'draft';
                }
            } else {
                whereClause.is_approved = true;
                if (req.query.publication_status) {
                    whereClause.publication_status = req.query.publication_status;
                } else if (!adminView) {
                    whereClause.publication_status = 'published';
                }
            }

            if (req.query.featured === 'true') {
                whereClause.is_featured = true;
            } else if (req.query.featured === 'false') {
                whereClause.is_featured = false;
            }

            if (req.query.category_id) {
                whereClause.category_id = req.query.category_id;
            }
            if (req.query.sub_category_id) {
                whereClause.sub_category_id = req.query.sub_category_id;
            }
            if (req.query.author_id) {
                whereClause.author_id = req.query.author_id;
            }

            const ebooks = await Ebook.findAll({
                where: whereClause,
                include: [EbookCategory, EbookSubCategory, User],
                order: [['updatedAt', 'DESC']],
            });

            await enrichEbookMetrics(ebooks, req.user?.id);
            await attachEbookOrderCounts(ebooks);
            const rankedEbooks = sortEbooksByMarketplacePriority(ebooks);
            const host = `${req.protocol}://${req.get('host')}`;
            return res.json(rankedEbooks.map((ebook) => formatEbook(ebook, host)));
        } catch (err) {
            console.error('Error listing Ebooks:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async approveEbook(req, res) {
        try {
            const ebook = await Ebook.findByPk(req.params.id);
            if (!ebook) return res.status(404).json({ error: 'Ebook not found' });

            ebook.is_approved = true;
            ebook.publication_status = 'published';
            await ebook.save();

            return res.json({ message: 'Ebook approved.' });
        } catch (err) {
            console.error('Error approving Ebook:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async createEbookCategory(req, res) {
        try {
            const { name, description } = req.body;
            const category = await EbookCategory.create({ name, description });
            return res.status(201).json(category);
        } catch (err) {
            console.error('Error creating category:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async getEbookById(req, res) {
        try {
            const ebook = await Ebook.findByPk(req.params.id, {
                include: [EbookCategory, EbookSubCategory, User],
            });

            if (!ebook) {
                return res.status(404).json({ error: 'Ebook not found' });
            }

            await enrichEbookMetrics(ebook, req.user?.id);
            await attachEbookOrderCounts([ebook]);
            const host = `${req.protocol}://${req.get('host')}`;
            return res.json(formatEbook(ebook, host));
        } catch (err) {
            console.error('Error fetching ebook by id:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async getEbookSharePage(req, res) {
        try {
            const ebook = await Ebook.findByPk(req.params.id, {
                include: [EbookCategory, EbookSubCategory, User],
            });

            if (!ebook) {
                return res.status(404).send('<h1>Ebook not found</h1>');
            }

            await attachEbookOrderCounts([ebook]);
            const host = `${req.protocol}://${req.get('host')}`;
            const payload = formatEbook(ebook, host);
            const title = escapeHtml(payload.title || 'Shared ebook');
            const description = escapeHtml(
                payload.description || 'Read this ebook on AgriTracker.',
            );
            const author = escapeHtml(payload.author_name || 'Author');
            const category = escapeHtml(payload.category_name || 'eBook');
            const coverImage = payload.cover_image || payload.gallery_images?.[0] || '';
            const shareUrl = buildEbookShareUrl(host, payload.id);
            const appUrl = buildAppDeepLinkUrl('ebook', payload.id);

            return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} | AgriTracker</title>
    <meta name="description" content="${description}" />
    <meta property="og:site_name" content="AgriTracker" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${escapeHtml(shareUrl)}" />
    <meta property="al:android:url" content="${escapeHtml(appUrl)}" />
    <meta property="al:ios:url" content="${escapeHtml(appUrl)}" />
    ${coverImage ? `<meta property="og:image" content="${escapeHtml(coverImage)}" />` : ''}
    <meta name="twitter:card" content="${coverImage ? 'summary_large_image' : 'summary'}" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    ${coverImage ? `<meta name="twitter:image" content="${escapeHtml(coverImage)}" />` : ''}
    <script>
      window.addEventListener('load', function () {
        setTimeout(function () {
          window.location.href = ${JSON.stringify(appUrl)};
        }, 180);
      });
    </script>
  </head>
  <body style="margin:0;font-family:Arial,sans-serif;background:linear-gradient(180deg,#eff6ff 0%,#ffffff 58%);color:#102a43;">
    <main style="max-width:760px;margin:0 auto;padding:40px 20px 56px;">
      <div style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-weight:700;font-size:13px;">AgriTracker eBook</div>
      <h1 style="margin:18px 0 12px;font-size:38px;line-height:1.1;color:#1e3a8a;">${title}</h1>
      <p style="margin:0 0 24px;font-size:17px;line-height:1.7;color:#475569;">${description}</p>
      ${coverImage ? `<a href="${escapeHtml(appUrl)}" style="display:block;text-decoration:none;"><img src="${escapeHtml(coverImage)}" alt="${title}" style="width:100%;max-width:520px;height:300px;object-fit:cover;border-radius:24px;box-shadow:0 18px 40px rgba(15,23,42,0.16);" /></a>` : '<div style="width:100%;max-width:520px;height:300px;border-radius:24px;background:#dbeafe;display:flex;align-items:center;justify-content:center;color:#1d4ed8;font-size:20px;font-weight:700;">AgriTracker eBook</div>'}
      <section style="margin-top:28px;padding:24px;border-radius:24px;background:#ffffff;box-shadow:0 16px 40px rgba(15,23,42,0.08);">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:18px;">
          <div><div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">Author</div><div style="margin-top:6px;font-size:18px;font-weight:700;">${author}</div></div>
          <div><div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">Category</div><div style="margin-top:6px;font-size:18px;font-weight:700;">${category}</div></div>
          <div><div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">Company</div><div style="margin-top:6px;font-size:18px;font-weight:700;">AgriTracker</div></div>
        </div>
      </section>
      <section style="margin-top:20px;padding:24px;border-radius:24px;background:#1e3a8a;color:#eff6ff;">
        <div style="font-size:18px;font-weight:700;">Open this ebook in AgriTracker</div>
        <p style="margin:10px 0 18px;font-size:15px;line-height:1.6;color:#dbeafe;">This shared ebook now opens directly inside the app instead of sharing the raw file link.</p>
        <a href="${escapeHtml(appUrl)}" style="display:inline-flex;align-items:center;justify-content:center;padding:12px 18px;border-radius:14px;background:#eff6ff;color:#1e3a8a;text-decoration:none;font-weight:700;">Open In App</a>
      </section>
    </main>
  </body>
</html>`);
        } catch (err) {
            console.error('Error loading ebook share page:', err);
            return res.status(500).send('<h1>Unable to load ebook</h1>');
        }
    },

    async featureEbook(req, res) {
        try {
            const ebook = await Ebook.findByPk(req.params.id);
            if (!ebook) return res.status(404).json({ error: 'Ebook not found' });

            ebook.is_featured = true;
            await ebook.save();

            return res.json({ message: 'Ebook marked as featured.' });
        } catch (err) {
            console.error('Error featuring Ebook:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async unfeatureEbook(req, res) {
        try {
            const ebook = await Ebook.findByPk(req.params.id);
            if (!ebook) return res.status(404).json({ error: 'Ebook not found' });

            ebook.is_featured = false;
            await ebook.save();

            return res.json({ message: 'Ebook removed from featured.' });
        } catch (err) {
            console.error('Error unfeaturing Ebook:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async updateEbookCategory(req, res) {
        try {
            const category = await EbookCategory.findByPk(req.params.id);
            if (!category) {
                return res.status(404).json({ error: 'Category not found' });
            }

            const { name, description, is_active } = req.body;
            if (name !== undefined) category.name = name;
            if (description !== undefined) category.description = description;
            if (is_active !== undefined) category.is_active = is_active;

            await category.save();
            return res.json(category);
        } catch (err) {
            console.error('Error updating category:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async deleteEbookCategory(req, res) {
        try {
            const category = await EbookCategory.findByPk(req.params.id);
            if (!category) {
                return res.status(404).json({ error: 'Category not found' });
            }

            await category.destroy();
            return res.json({ message: 'Category deleted successfully' });
        } catch (err) {
            console.error('Error deleting category:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async getEbookCategories(req, res) {
        try {
            const categories = await EbookCategory.findAll({
                where: { is_active: true },
                include: [{
                    model: EbookSubCategory,
                    where: { is_active: true },
                    required: false,
                }],
            });
            return res.json(categories);
        } catch (err) {
            console.error('Error fetching categories:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async createEbookSubCategory(req, res) {
        try {
            const { name, description, category_id } = req.body;
            if (!name || !category_id) {
                return res.status(400).json({ error: 'name and category_id are required' });
            }

            const subCategory = await EbookSubCategory.create({
                name,
                description,
                category_id,
            });

            return res.status(201).json(subCategory);
        } catch (err) {
            console.error('Error creating ebook subcategory:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async getEbookSubCategories(req, res) {
        try {
            const whereClause = { is_active: true };
            if (req.params.categoryId) {
                whereClause.category_id = req.params.categoryId;
            }

            const subCategories = await EbookSubCategory.findAll({
                where: whereClause,
                order: [['name', 'ASC']],
            });

            return res.json(subCategories);
        } catch (err) {
            console.error('Error fetching ebook subcategories:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async updateEbookSubCategory(req, res) {
        try {
            const subCategory = await EbookSubCategory.findByPk(req.params.id);
            if (!subCategory) {
                return res.status(404).json({ error: 'Subcategory not found' });
            }

            const { name, description, category_id, is_active } = req.body;
            if (name !== undefined) subCategory.name = name;
            if (description !== undefined) subCategory.description = description;
            if (category_id !== undefined) subCategory.category_id = category_id;
            if (is_active !== undefined) subCategory.is_active = is_active;

            await subCategory.save();
            return res.json(subCategory);
        } catch (err) {
            console.error('Error updating ebook subcategory:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async deleteEbookSubCategory(req, res) {
        try {
            const subCategory = await EbookSubCategory.findByPk(req.params.id);
            if (!subCategory) {
                return res.status(404).json({ error: 'Subcategory not found' });
            }

            await subCategory.destroy();
            return res.json({ message: 'Subcategory deleted successfully' });
        } catch (err) {
            console.error('Error deleting ebook subcategory:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async purchaseEbook(req, res) {
        try {
            const ebookId = req.body.Ebook_id || req.body.ebook_id || req.body.ebookId;
            const selectedFormat = req.body.selected_format || req.body.selectedFormat;

            if (!ebookId) {
                return res.status(400).json({ error: 'ebook_id is required' });
            }

            const ebook = await Ebook.findByPk(ebookId);
            if (!ebook || !ebook.is_approved) {
                return res.status(400).json({ error: 'Ebook not available' });
            }

            const preorderState = resolveEbookPreorderState(ebook);
            if (preorderState.isActivePreorder) {
                return res.status(400).json({
                    error: `This ebook is on preorder and will be available from ${preorderState.preorderAvailableDate?.toISOString() || 'a future date'}`,
                });
            }

            const existing = await EbookOrder.findOne({
                where: { user_id: req.user.id, Ebook_id: ebookId, payment_status: 'completed' },
            });
            if (existing) return res.status(409).json({ error: 'Already purchased' });

            const pricing = getOrderPricing(ebook, selectedFormat);
            const order = await EbookOrder.create({
                order_id: `EBOOK-${Date.now()}`,
                user_id: req.user.id,
                Ebook_id: ebookId,
                price_paid: pricing.totalPrice,
                payment_status: 'completed',
                paid_at: new Date(),
                metadata: {
                    download_token: generateDownloadToken(),
                    selected_format: pricing.chosenVariant.key,
                    base_price: pricing.basePrice,
                    printing_cost: pricing.printingCost,
                    page_count: pricing.chosenVariant.variant.page_count || null,
                    digital_delivery: 'download_online',
                },
            });

            return res.status(201).json({ message: 'Purchase successful', order });
        } catch (err) {
            console.error('Error purchasing Ebook:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async createCheckoutOrder(req, res) {
        try {
            const {
                ebook_id,
                payment_method,
                customer_email,
                customer_phone,
                customer_address,
                note,
                delivery_method,
                selected_format,
                quantity,
                shipping_method,
                shipping_cost,
                digital_delivery,
                digital_delivery_method,
                mobile_money_payment,
                coupon_code,
            } = req.body;

            if (!ebook_id || !payment_method || !customer_email || !customer_phone) {
                return res.status(400).json({ error: 'Missing required checkout fields' });
            }

            const ebook = await Ebook.findByPk(ebook_id);
            if (!ebook || !ebook.is_approved) {
                return res.status(404).json({ error: 'Ebook not found or not approved' });
            }

            const preorderState = resolveEbookPreorderState(ebook);
            if (preorderState.isActivePreorder) {
                return res.status(400).json({
                    error: `This ebook is on preorder and cannot be purchased yet. It becomes available from ${preorderState.preorderAvailableDate?.toISOString() || 'a future date'}`,
                });
            }

            const pricing = getOrderPricing(ebook, selected_format, coupon_code);
            const orderQuantity = Math.max(parseInt(quantity, 10) || 1, 1);
            const shippingAmount = Math.max(parseNumber(shipping_cost, 0), 0);
            const totalPrice = (pricing.totalPrice * orderQuantity) + shippingAmount;
            const resolvedDigitalDelivery = pricing.chosenVariant.key === 'ebook'
                ? normalizeDigitalDeliveryMethod(digital_delivery_method || digital_delivery)
                : null;
            const isMobileMoneyPayment = ['mtn_mobile_money', 'orange_money'].includes(payment_method);

            if (isMobileMoneyPayment) {
                const hasRequiredMobileFields = [
                    mobile_money_payment?.provider,
                    mobile_money_payment?.payer_phone_number,
                    mobile_money_payment?.transaction_id,
                ].every((value) => value && value.toString().trim().length > 0);

                if (!hasRequiredMobileFields) {
                    return res.status(400).json({
                        error: 'Mobile money payment details are required before order confirmation',
                    });
                }
            }

            const requiresShipping =
                pricing.chosenVariant.key !== 'ebook' &&
                ['author_delivery', 'standard_shipping', 'express_shipping'].includes(
                    String(shipping_method || delivery_method || '').trim().toLowerCase()
                );

            if (requiresShipping && !String(customer_address || '').trim()) {
                return res.status(400).json({ error: 'Shipping address is required for printed book delivery' });
            }

            const order = await EbookOrder.create({
                order_id: `EBOOK-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                user_id: req.user.id,
                Ebook_id: ebook_id,
                price_paid: totalPrice,
                payment_method,
                customer_email,
                customer_phone,
                customer_address: customer_address || null,
                note: note || null,
                delivery_method:
                    pricing.chosenVariant.key === 'ebook'
                        ? resolvedDigitalDelivery
                        : (
                            delivery_method ||
                            shipping_method ||
                            'shipping'
                        ),
                payment_status: 'pending',
                paid_at: null,
                purchased_at: new Date(),
                transaction_id:
                    mobile_money_payment?.transaction_id || `TXN-${Date.now()}`,
                metadata: {
                    download_token: generateDownloadToken(),
                    checkout_source: 'mobile_app',
                    selected_format: pricing.chosenVariant.key,
                    quantity: orderQuantity,
                    base_price: pricing.basePrice,
                    printing_cost: pricing.printingCost,
                    page_count: pricing.chosenVariant.variant.page_count || null,
                    shipping_method: shipping_method || null,
                    shipping_cost: shippingAmount,
                    coupon_code: pricing.appliedCouponCode,
                    discount_amount: pricing.discountAmount * orderQuantity,
                    discount_percentage: pricing.discountPercentage,
                    digital_delivery: resolvedDigitalDelivery,
                    royalty_percentage: pricing.chosenVariant.variant.royalty_percentage || 0,
                    payment_provider:
                        mobile_money_payment?.provider || payment_method || null,
                    mobile_money_payment: isMobileMoneyPayment
                        ? {
                            provider: mobile_money_payment.provider,
                            payer_phone_number: mobile_money_payment.payer_phone_number,
                            transaction_id: mobile_money_payment.transaction_id,
                            recipient_number:
                                mobile_money_payment.recipient_number || '+237 6 54 89 70 41',
                            recipient_name:
                                mobile_money_payment.recipient_name || 'Official Agritracker',
                            company_name:
                                mobile_money_payment.company_name || 'Agri_Tracker',
                            verification_status:
                                mobile_money_payment.verification_status || 'submitted',
                            submitted_at:
                                mobile_money_payment.submitted_at || new Date().toISOString(),
                        }
                        : null,
                },
            });

            const buyer = await User.findByPk(req.user.id, {
                attributes: ['id', 'full_name', 'email', 'phone'],
            });

            const fullOrder = await EbookOrder.findByPk(order.id, {
                include: [
                    {
                        model: Ebook,
                        include: [EbookCategory, EbookSubCategory, User],
                    },
                    {
                        model: User,
                        attributes: ['id', 'full_name', 'email', 'phone'],
                    },
                ],
            });

            if (fullOrder) {
                queueBackgroundTask('Ebook received notifications', async () => {
                    await sendEbookOrderNotifications(fullOrder, fullOrder.Ebook, buyer, 'received');
                    await notifyAdminsOfEbookOrder(fullOrder);
                });
            } else {
                queueBackgroundTask('Ebook admin notifications', async () => {
                    await notifyAdminsOfEbookOrder(order);
                });
            }

            return res.status(201).json({
                message: isMobileMoneyPayment
                    ? 'Ebook mobile money payment submitted for review'
                    : 'Ebook order created successfully and is awaiting admin confirmation',
                payment_status: order.payment_status,
                order: fullOrder || order,
            });
        } catch (err) {
            console.error('Error creating ebook checkout order:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async getPurchaseStatus(req, res) {
        try {
            const order = await EbookOrder.findOne({
                where: {
                    user_id: req.user.id,
                    Ebook_id: req.params.id,
                    payment_status: 'completed',
                },
            });

            return res.json({ isPurchased: !!order, order: order || null });
        } catch (err) {
            console.error('Error checking ebook purchase status:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async downloadPurchasedEbook(req, res) {
        try {
            const order = await EbookOrder.findOne({
                where: { order_id: req.params.orderId },
                include: [Ebook, User],
            });

            if (!order) {
                return res.status(404).json({ error: 'Order not found' });
            }

            if (String(order.payment_status || '').toLowerCase() !== 'completed') {
                return res.status(403).json({ error: 'Ebook is not ready for download yet' });
            }

            const token = req.query.token?.toString().trim();
            const storedToken = order.metadata?.download_token?.toString().trim();
            const isAuthorizedUser = !!req.user?.id && Number(req.user.id) === Number(order.user_id);

            if (!isAuthorizedUser && (!token || !storedToken || token !== storedToken)) {
                return res.status(403).json({ error: 'Invalid download access' });
            }

            const downloadFile = resolveOrderDownloadFilePath(order);
            if (!downloadFile) {
                return res.status(404).json({ error: 'Ebook file not available' });
            }

            const metadata = order.metadata && typeof order.metadata === 'object'
                ? { ...order.metadata }
                : {};
            metadata.download_count = Number(metadata.download_count || 0) + 1;
            metadata.last_download_at = new Date().toISOString();
            order.metadata = metadata;
            await order.save();

            return res.download(downloadFile.filePath, downloadFile.filename);
        } catch (err) {
            console.error('Error downloading purchased ebook:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async updateEbook(req, res) {
        try {
            const ebook = await Ebook.findByPk(req.params.id);
            if (!ebook || (ebook.author_id !== req.user.id && req.user.role !== 'admin')) {
                return res.status(403).json({ error: 'Not allowed' });
            }

            const updates = { ...req.body };
            if (updates.book_metadata) {
                updates.book_metadata = parseJsonField(updates.book_metadata, {});
            }
            if (updates.format_variants) {
                updates.format_variants = parseJsonField(updates.format_variants, {});
            }
            if (updates.validation_report) {
                updates.validation_report = parseJsonField(updates.validation_report, null);
            }

            await ebook.update(updates);
            return res.json({ message: 'Ebook updated', Ebook: ebook });
        } catch (err) {
            console.error('Error updating Ebook:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async deleteEbook(req, res) {
        try {
            const ebook = await Ebook.findByPk(req.params.id);
            if (!ebook || (ebook.author_id !== req.user.id && req.user.role !== 'admin')) {
                return res.status(403).json({ error: 'Not allowed' });
            }

            await ebook.destroy();
            return res.json({ message: 'Ebook deleted' });
        } catch (err) {
            console.error('Error deleting Ebook:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async getRandomEbooks(req, res) {
        try {
            const count = await Ebook.count({
                where: { is_approved: true, publication_status: 'published' },
            });
            const limit = parseInt(req.query.limit, 10) || 4;
            const randomOffset = Math.max(0, Math.floor(Math.random() * Math.max(1, count - limit)));

            const ebooks = await Ebook.findAll({
                where: { is_approved: true, publication_status: 'published' },
                include: [EbookCategory, EbookSubCategory, User],
                offset: randomOffset,
                limit,
            });

            await attachEbookOrderCounts(ebooks);
            const host = `${req.protocol}://${req.get('host')}`;
            return res.json(ebooks.map((ebook) => formatEbook(ebook, host)));
        } catch (err) {
            console.error('Error fetching random Ebooks:', err);
            return res.status(500).json({ error: err.message });
        }
    },
};

module.exports = EbookController;

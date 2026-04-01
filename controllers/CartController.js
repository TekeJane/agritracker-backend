const { Cart, Product, User, Category, SubCategory } = require('../models');

function normalizeCouponCode(value) {
    return String(value || '').trim().toUpperCase();
}

function getProductDiscountDetails(product, couponCode) {
    const originalPrice = parseFloat(product.price) || 0;
    const discountPrice = parseFloat(product.discount_price) || 0;
    const normalizedCoupon = normalizeCouponCode(couponCode);
    const productCoupon = normalizeCouponCode(product.coupon_code);
    const isCouponMatch =
        normalizedCoupon.length > 0 &&
        productCoupon.length > 0 &&
        normalizedCoupon === productCoupon;
    const isValidDiscount =
        isCouponMatch &&
        discountPrice > 0 &&
        discountPrice < originalPrice;

    return {
        unitPrice: isValidDiscount ? discountPrice : originalPrice,
        discountPerUnit: isValidDiscount ? originalPrice - discountPrice : 0,
        isApplied: isValidDiscount,
        couponCode: isValidDiscount ? productCoupon : null,
    };
}

const CartController = {
    // Get user's cart
    async getUserCart(req, res) {
        try {
            console.log('📥 Fetching cart for user:', req.user.id);

            const cartItems = await Cart.findAll({
                where: { UserId: req.user.id },
                include: [
                    {
                        model: Product,
                        attributes: ['id', 'name', 'price', 'images', 'stock_quantity'],
                        include: [
                            { model: Category },
                            { model: SubCategory }
                        ]
                    }
                ]
            });

            const cartWithTotal = cartItems.map(item => ({
                ...item.toJSON(),
                total_price: parseFloat(item.Product.price) * item.quantity
            }));

            console.log('🛒 Cart items:', cartWithTotal);

            return res.status(200).json(cartWithTotal);
        } catch (error) {
            console.error('❌ Error getting cart:', error);
            return res.status(500).json({ error: error.message });
        }
    }
    ,

    // Apply coupon and return discounted total
    async applyCoupon(req, res) {
        try {
            const { code } = req.body;
            if (!code) return res.status(400).json({ message: 'Coupon code required' });

            const normalized = normalizeCouponCode(code);

            const cartItems = await Cart.findAll({
                where: { UserId: req.user.id },
                include: [{ model: Product, attributes: ['price', 'discount_price', 'coupon_code'] }],
            });

            let subtotal = 0;
            let discount = 0;
            let matchedItems = 0;

            for (const item of cartItems) {
                const product = item.Product;
                const originalPrice = parseFloat(product.price) || 0;
                const discountDetails = getProductDiscountDetails(product, normalized);
                subtotal += originalPrice * item.quantity;
                discount += discountDetails.discountPerUnit * item.quantity;
                if (discountDetails.isApplied) {
                    matchedItems += 1;
                }
            }

            if (matchedItems === 0 || discount <= 0) {
                return res.status(404).json({ message: 'Invalid coupon code' });
            }

            const total = subtotal - discount;

            return res.status(200).json({
                code: normalized,
                subtotal,
                discount,
                total,
                matched_items: matchedItems,
            });
        } catch (error) {
            console.error('Error applying coupon:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    // Add item to cart
    async addToCart(req, res) {
        try {
            const { productId, quantity } = req.body;
            console.log('📥 Add to cart:', { productId, quantity, userId: req.user.id });

            if (!Number.isInteger(quantity) || quantity < 1) {
                console.warn('⚠️ Invalid quantity provided.');
                return res.status(400).json({ message: 'Quantity must be a positive integer' });
            }

            const product = await Product.findByPk(productId);
            if (!product) {
                console.warn('⚠️ Product not found:', productId);
                return res.status(404).json({ message: 'Product not found' });
            }

            if (product.stock_quantity < quantity) {
                console.warn('⚠️ Not enough stock. Requested:', quantity, 'Available:', product.stock_quantity);
                return res.status(400).json({ message: 'Not enough stock available' });
            }

            let cartItem = await Cart.findOne({
                where: {
                    UserId: req.user.id,
                    ProductId: productId
                }
            });

            if (cartItem) {
                console.log('🔁 Updating quantity for existing cart item:', cartItem.id);
                cartItem.quantity += quantity;
                await cartItem.save();
            } else {
                console.log('➕ Creating new cart item');
                cartItem = await Cart.create({
                    UserId: req.user.id,
                    ProductId: productId,
                    quantity
                });
            }

            const updatedCart = await Cart.findOne({
                where: { id: cartItem.id },
                include: [
                    {
                        model: Product,
                        attributes: ['id', 'name', 'price', 'images', 'stock_quantity'],
                        include: [{ model: Category }, { model: SubCategory }]
                    }
                ]
            });

            const response = {
                ...updatedCart.toJSON(),
                total_price: parseFloat(updatedCart.Product.price) * updatedCart.quantity
            };

            console.log('✅ Cart item added/updated:', response);
            return res.status(200).json(response);
        } catch (error) {
            console.error('❌ Error adding to cart:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    // Update cart item quantity
    async updateCartItem(req, res) {
        try {
            const { quantity } = req.body;
            const cartItemId = req.params.id;

            console.log('🛠 Updating cart item:', { cartItemId, quantity, userId: req.user.id });

            if (!Number.isInteger(quantity) || quantity < 0) {
                console.warn('⚠️ Invalid quantity value.');
                return res.status(400).json({ message: 'Quantity must be 0 or a positive integer' });
            }

            const cartItem = await Cart.findOne({
                where: {
                    id: cartItemId,
                    UserId: req.user.id
                },
                include: [Product]
            });

            if (!cartItem) {
                console.warn('⚠️ Cart item not found:', cartItemId);
                return res.status(404).json({ message: 'Cart item not found' });
            }

            if (quantity === 0) {
                console.log('🗑 Removing cart item:', cartItemId);
                await cartItem.destroy();
                return res.status(204).send();
            }

            if (cartItem.Product.stock_quantity < quantity) {
                console.warn('⚠️ Insufficient stock for update');
                return res.status(400).json({ message: 'Not enough stock available' });
            }

            cartItem.quantity = quantity;
            await cartItem.save();

            const updatedCartItem = await Cart.findOne({
                where: { id: cartItem.id },
                include: [
                    {
                        model: Product,
                        attributes: ['id', 'name', 'price', 'images', 'stock_quantity'],
                        include: [{ model: Category }, { model: SubCategory }]
                    }
                ]
            });

            const response = {
                ...updatedCartItem.toJSON(),
                total_price: parseFloat(updatedCartItem.Product.price) * updatedCartItem.quantity
            };

            console.log('🔄 Cart item updated:', response);
            return res.status(200).json(response);
        } catch (error) {
            console.error('❌ Error updating cart item:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    // Remove item from cart
    async removeFromCart(req, res) {
        try {
            console.log('🗑 Attempting to remove cart item:', req.params.id);

            const deleted = await Cart.destroy({
                where: {
                    id: req.params.id,
                    UserId: req.user.id
                }
            });

            if (deleted) {
                console.log('✅ Cart item removed');
                return res.status(204).send();
            }

            console.warn('⚠️ Cart item not found to delete');
            return res.status(404).json({ message: 'Cart item not found' });
        } catch (error) {
            console.error('❌ Error removing cart item:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    // Clear entire cart
    async clearCart(req, res) {
        try {
            console.log('🧹 Clearing cart for user:', req.user.id);

            await Cart.destroy({
                where: { UserId: req.user.id }
            });

            console.log('🧼 Cart cleared successfully');
            return res.status(204).send();
        } catch (error) {
            console.error('❌ Error clearing cart:', error);
            return res.status(500).json({ error: error.message });
        }
    }
};

module.exports = CartController;

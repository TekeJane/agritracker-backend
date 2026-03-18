const nodemailer = require('nodemailer');

class EmailService {
    constructor() {
        this.transporter = nodemailer.createTransporter({
            host: process.env.EMAIL_HOST,
            port: process.env.EMAIL_PORT,
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            }
        });
    }

    // Send order confirmation email
    async sendOrderConfirmation(order) {
        try {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: order.customer_email,
                subject: `Order Confirmation - ${order.order_id}`,
                html: this.getOrderConfirmationTemplate(order)
            };

            const result = await this.transporter.sendMail(mailOptions);
            console.log('✅ Order confirmation email sent:', result.messageId);
            return result;
        } catch (error) {
            console.error('❌ Failed to send order confirmation email:', error);
            throw error;
        }
    }

    // Order confirmation email template
    getOrderConfirmationTemplate(order) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Order Confirmation</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
                .order-details { background: white; padding: 15px; margin: 15px 0; border-radius: 4px; border-left: 4px solid #4CAF50; }
                .download-button { display: inline-block; background: #2196F3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 10px 0; }
                .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎉 Order Successful!</h1>
                    <p>Thank you for your purchase from AgriTech Ebooks</p>
                </div>
                
                <div class="content">
                    <h2>Order Details</h2>
                    <div class="order-details">
                        <p><strong>Order ID:</strong> ${order.order_id}</p>
                        <p><strong>Ebook:</strong> ${order.ebook?.title || 'N/A'}</p>
                        <p><strong>Amount Paid:</strong> XAF ${order.price_paid}</p>
                        <p><strong>Payment Method:</strong> ${this.formatPaymentMethod(order.payment_method)}</p>
                        <p><strong>Purchase Date:</strong> ${new Date(order.purchased_at).toLocaleDateString()}</p>
                        <p><strong>Transaction ID:</strong> ${order.transaction_id || 'Pending'}</p>
                    </div>

                    <h3>Download Your Ebook</h3>
                    <p>Your ebook is now available for download. Click the button below to access your purchase:</p>
                    
                    ${order.ebook?.file_url ? `
                        <a href="${process.env.FRONTEND_URL}/download/${order.order_id}" class="download-button">
                            📱 Download Ebook
                        </a>
                    ` : '<p>Download link will be available shortly.</p>'}

                    <h3>What's Next?</h3>
                    <ul>
                        <li>📧 Save this email for your records</li>
                        <li>📱 Download your ebook using the link above</li>
                        <li>💬 Contact support if you need any assistance</li>
                    </ul>

                    <h3>Customer Information</h3>
                    <div class="order-details">
                        <p><strong>Email:</strong> ${order.customer_email}</p>
                        <p><strong>Phone:</strong> ${order.customer_phone}</p>
                        <p><strong>Address:</strong> ${order.customer_address}</p>
                        ${order.note ? `<p><strong>Note:</strong> ${order.note}</p>` : ''}
                    </div>

                    <p>If you have any questions about your order, please contact our support team with your order ID: <strong>${order.order_id}</strong></p>
                </div>

                <div class="footer">
                    <p>© 2024 AgriTech Ebooks. All rights reserved.</p>
                    <p>This is an automated email. Please do not reply to this message.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    // Send download link email
    async sendDownloadLink(order) {
        try {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: order.customer_email,
                subject: `Download Link - ${order.ebook?.title}`,
                html: this.getDownloadLinkTemplate(order)
            };

            const result = await this.transporter.sendMail(mailOptions);
            console.log('✅ Download link email sent:', result.messageId);
            return result;
        } catch (error) {
            console.error('❌ Failed to send download link email:', error);
            throw error;
        }
    }

    // Download link email template
    getDownloadLinkTemplate(order) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Download Your Ebook</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #2196F3; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
                .download-button { display: inline-block; background: #4CAF50; color: white; padding: 15px 30px; text-decoration: none; border-radius: 4px; margin: 15px 0; font-size: 16px; }
                .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>📚 Your Ebook is Ready!</h1>
                    <p>Download your purchased ebook</p>
                </div>
                
                <div class="content">
                    <h2>${order.ebook?.title}</h2>
                    <p>Your ebook download is now available. Click the button below to download:</p>
                    
                    <div style="text-align: center;">
                        <a href="${process.env.FRONTEND_URL}/download/${order.order_id}" class="download-button">
                            📱 Download Now
                        </a>
                    </div>

                    <p><strong>Order ID:</strong> ${order.order_id}</p>
                    <p><strong>Download Count:</strong> ${order.download_count} of unlimited</p>

                    <h3>Important Notes:</h3>
                    <ul>
                        <li>🔒 This download link is secure and personalized for you</li>
                        <li>♾️ You can download this ebook unlimited times</li>
                        <li>📧 Keep this email for future downloads</li>
                        <li>💬 Contact support if you have any issues</li>
                    </ul>
                </div>

                <div class="footer">
                    <p>© 2024 AgriTech Ebooks. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    // Format payment method for display
    formatPaymentMethod(method) {
        const methods = {
            'mobile_money': 'Mobile Money',
            'bank_transfer': 'Bank Transfer',
            'card': 'Credit/Debit Card'
        };
        return methods[method] || method;
    }

    // Send payment failure notification
    async sendPaymentFailureNotification(order) {
        try {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: order.customer_email,
                subject: `Payment Failed - Order ${order.order_id}`,
                html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: #f44336; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                        <h1>⚠️ Payment Failed</h1>
                    </div>
                    <div style="background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px;">
                        <p>We're sorry, but your payment for order <strong>${order.order_id}</strong> could not be processed.</p>
                        <p><strong>Ebook:</strong> ${order.ebook?.title}</p>
                        <p><strong>Amount:</strong> XAF ${order.price_paid}</p>
                        <p>Please try again or contact our support team for assistance.</p>
                    </div>
                </div>
                `
            };

            const result = await this.transporter.sendMail(mailOptions);
            console.log('✅ Payment failure email sent:', result.messageId);
            return result;
        } catch (error) {
            console.error('❌ Failed to send payment failure email:', error);
            throw error;
        }
    }
}

module.exports = new EmailService();
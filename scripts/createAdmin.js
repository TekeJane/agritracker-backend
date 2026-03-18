// One-off script to create an admin user using the project's Sequelize models
// Run: node scripts/createAdmin.js

require('dotenv').config({ path: __dirname + '/../.env' });
const { User, sequelize } = require('../models');

(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ DB connection OK');

    const email = 'admin@agritech.com';
    const [user, created] = await User.findOrCreate({
      where: { email },
      defaults: {
        full_name: 'Administrator',
        email,
        phone: '237677999900',
        // Using the bcrypt hash provided by the user so the admin can login with that password
        password: '$2b$10$EDzS4hHuDnC7PO3uqX0SrOCqNa5te0SAthbpUH60HJSX8CPcCZGwO',
        role: 'admin',
      },
    });

    if (created) {
      console.log('🟢 Admin user created:', user.email);
    } else {
      console.log('ℹ️ Admin user already exists:', user.email);
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to create admin:', err);
    process.exit(1);
  }
})();

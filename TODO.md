# Sequelize Migration Fix & Backend Reset TODO

## [ ] Step 1: Create base Products table migration
Create `migrations/20260101000000-create-products.js`

## [ ] Step 2: Fix Product model tableName casing (model edit failed - whitespace, will recreate)
Update `models/Product.js` tableName to 'Products'

## [ ] Step 3: Run migrations
`npx sequelize-cli db:migrate`

## [ ] Step 4: Seed categories
`node scripts/seedCategories.js`

## [ ] Step 5: Create admin user
Generate hash + MySQL insert

## [ ] Step 6: Start server & verify
`npm start` + curl login test

**Current: Steps 1-2 ✓ | Step 3: Run `npx sequelize-cli db:migrate` manually (PS policy issue)**

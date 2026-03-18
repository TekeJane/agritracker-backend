const { sequelize, Category, SubCategory } = require('../models');

const seedCategories = async () => {
    await sequelize.sync({ alter: true });

    // Main categories with sub-categories
    const categories = [
        {
            name: 'Food Crops',
            description: 'Crops grown for food consumption',
            subCategories: ['Fruits', 'Vegetables', 'Grains', 'Tubers']
        },
        {
            name: 'Cash Crops',
            description: 'Commercial crops grown for profit',
            subCategories: ['Coffee', 'Cocoa', 'Cotton', 'Tea']
        },
        {
            name: 'Livestock',
            description: 'Farm animals raised for products',
            subCategories: ['Poultry', 'Cattle', 'Goats', 'Fish']
        },
        {
            name: 'Farm Tools',
            description: 'Tools and equipment used in farming',
            subCategories: ['Hand Tools', 'Power Tools', 'Irrigation', 'Storage']
        }
    ];

    for (const cat of categories) {
        const [category, created] = await Category.findOrCreate({
            where: { name: cat.name },
            defaults: { description: cat.description }
        });

        for (const sub of cat.subCategories) {
            await SubCategory.findOrCreate({
                where: { name: sub, category_id: category.id }
            });
        }
    }

    console.log('✅ Categories and subcategories seeded.');
    process.exit();
};

seedCategories();

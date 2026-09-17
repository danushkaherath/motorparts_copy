const fs = require('fs');
const path = require('path');

const target1 = path.join(__dirname, '..', 'data', 'sample_products.csv');
const target2 = path.join(__dirname, '..', '..', 'frontend', 'public', 'sample_grocery_products.csv');

const header = 'Product Name,Category,Brand,Product Code\n';
fs.writeFileSync(target1, header);

console.log('Initialized CSV headers');

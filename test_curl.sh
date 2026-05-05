curl -X POST http://localhost:3000/supplier/products \
-H "Content-Type: application/json" \
-H "Authorization: Bearer $(node -e "const jwt = require('jsonwebtoken'); console.log(jwt.sign({ id: '69b7a707f13c0641e786fa52', email: 'test@supplier.com', role: 'supplier' }, 'rumbling'));")" \
-d '{
  "name": "Test curl product",
  "description": "Test API product",
  "quantity": "10",
  "price": "100",
  "proCategoryId": "69a01325b73d9a56fdc3e483",
  "proSubCategoryId": "69a03f5dea4c2c0ae862ce2c",
  "skus": [
    {
      "skuId": "TEST-SKU-1",
      "attributes": { "Color": "Red" },
      "stock": 10,
      "price": 100,
      "images": ["test-url"]
    }
  ],
  "proVariants": [
    {
      "variantTypeName": "Color",
      "items": ["Red"]
    }
  ]
}'

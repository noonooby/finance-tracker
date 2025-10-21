-- Clean up category names - remove emojis and duplicates
-- Run this ONCE to fix existing data

-- Coffee ☕ Coffee -> Coffee
UPDATE categories 
SET name = 'Coffee'
WHERE name LIKE '%Coffee%Coffee%' OR name LIKE 'Coffee%Coffee';

-- Pizza 🍕 Food Delivery -> Pizza Food Delivery
UPDATE categories 
SET name = 'Pizza Food Delivery'
WHERE name LIKE 'Pizza%Food Delivery';

-- Shopping Cart 🛒 Groceries -> Shopping Cart Groceries  
UPDATE categories 
SET name = 'Shopping Cart Groceries'
WHERE name LIKE 'Shopping%Cart%Groceries';

-- Package 📦 Other -> Package Other
UPDATE categories 
SET name = 'Package Other'
WHERE name LIKE 'Package%Other';

-- Flame 🔥 Foo -> Flame Foo
UPDATE categories 
SET name = 'Flame Foo'
WHERE name LIKE 'Flame%Foo';

-- Car 🚗 Transportation -> Car Transportation
UPDATE categories 
SET name = 'Car Transportation'
WHERE name LIKE 'Car%Transportation';

-- Generic cleanup for any remaining emoji patterns
-- This regex removes most common emoji ranges
UPDATE categories
SET name = regexp_replace(name, '[\x{1F300}-\x{1F9FF}\x{2600}-\x{26FF}\x{2700}-\x{27BF}]', '', 'g')
WHERE name ~ '[\x{1F300}-\x{1F9FF}\x{2600}-\x{26FF}\x{2700}-\x{27BF}]';

-- Clean up any double spaces left after emoji removal
UPDATE categories
SET name = regexp_replace(name, '\s+', ' ', 'g');

-- Trim leading/trailing whitespace
UPDATE categories
SET name = TRIM(name);

-- IMPORTANT: After running this, also update transaction category_name cache
UPDATE transactions t
SET category_name = c.name
FROM categories c
WHERE t.category_id = c.id;

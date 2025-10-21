-- Add last_payment_amount to credit_cards
ALTER TABLE credit_cards 
ADD COLUMN IF NOT EXISTS last_payment_amount DECIMAL(10, 2) DEFAULT NULL;

-- Add auto_deposit to income
ALTER TABLE income 
ADD COLUMN IF NOT EXISTS auto_deposit BOOLEAN DEFAULT TRUE;

-- Clear zeros to NULL for cleaner display
UPDATE credit_cards 
SET last_payment_amount = NULL 
WHERE last_payment_amount = 0;

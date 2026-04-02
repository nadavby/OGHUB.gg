-- Add CHECK constraint to prevent negative wallet balances at database level
ALTER TABLE "Wallet" ADD CONSTRAINT "wallet_balance_non_negative" CHECK ("balance" >= 0);
ALTER TABLE "Wallet" ADD CONSTRAINT "wallet_frozen_balance_non_negative" CHECK ("frozenBalance" >= 0);

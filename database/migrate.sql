-- Migration script to update database schema to the latest version
-- This migrates from the old schema to the new schema with added features
-- 
-- BACKUP YOUR DATABASE BEFORE RUNNING:
-- pg_dump your_database_name > backup_before_migration.sql
--
-- Usage: psql -d your_database_name -f migrate.sql

BEGIN;

-- Step 1: Add new columns to existing tables with default values
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS bankruptcy_bailout_used BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS bankruptcy_from_gambling BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS bankruptcy_bailout_count INTEGER DEFAULT 0;

ALTER TABLE roulette_games 
ADD COLUMN IF NOT EXISTS pity_applied BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS pity_bonus_percentage INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS losing_streak INTEGER DEFAULT 0;

-- Step 2: Create new transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    sender_id VARCHAR(20) NOT NULL,
    receiver_id VARCHAR(20) NOT NULL,
    sender_username VARCHAR(32),
    receiver_username VARCHAR(32),
    amount INTEGER NOT NULL,
    transaction_type VARCHAR(20) NOT NULL DEFAULT 'transfer', -- transfer, work, roulette_win, etc.
    description TEXT,
    sender_balance_before INTEGER NOT NULL,
    sender_balance_after INTEGER NOT NULL,
    receiver_balance_before INTEGER NOT NULL,
    receiver_balance_after INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 3: Create indexes for new table and ensure all indexes exist
CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id);
CREATE INDEX IF NOT EXISTS idx_podruns_podrun_key ON podruns(podrun_key);
CREATE INDEX IF NOT EXISTS idx_podruns_status ON podruns(status);
CREATE INDEX IF NOT EXISTS idx_podruns_guild_channel ON podruns(guild_id, channel_id);
CREATE INDEX IF NOT EXISTS idx_podrun_participants_podrun_id ON podrun_participants(podrun_id);
CREATE INDEX IF NOT EXISTS idx_podrun_participants_user_id ON podrun_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_roulette_games_user_id ON roulette_games(user_id);
CREATE INDEX IF NOT EXISTS idx_roulette_games_played_at ON roulette_games(played_at);
CREATE INDEX IF NOT EXISTS idx_work_sessions_user_id ON work_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_work_sessions_worked_at ON work_sessions(worked_at);
CREATE INDEX IF NOT EXISTS idx_transactions_sender_id ON transactions(sender_id);
CREATE INDEX IF NOT EXISTS idx_transactions_receiver_id ON transactions(receiver_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_cache_entries_cache_key ON cache_entries(cache_key);
CREATE INDEX IF NOT EXISTS idx_cache_entries_expires_at ON cache_entries(expires_at);

-- Step 4: Ensure functions exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE FUNCTION clean_expired_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM cache_entries WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ language 'plpgsql';

-- Step 5: Create top winners function for roulette leaderboard
CREATE OR REPLACE FUNCTION get_top_winners(winner_limit INTEGER DEFAULT 10)
RETURNS TABLE(
    user_id VARCHAR(20),
    username VARCHAR(32),
    total_winnings BIGINT,
    games_played BIGINT,
    win_rate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rg.user_id,
        rg.username,
        SUM(rg.win_amount)::BIGINT as total_winnings,
        COUNT(*)::BIGINT as games_played,
        ROUND((COUNT(CASE WHEN rg.won THEN 1 END)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2) as win_rate
    FROM roulette_games rg
    GROUP BY rg.user_id, rg.username
    HAVING COUNT(*) >= 5  -- Minimum games to appear on leaderboard
    ORDER BY total_winnings DESC
    LIMIT winner_limit;
END;
$$ language 'plpgsql';

-- Step 6: Ensure triggers exist
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_podruns_updated_at ON podruns;
CREATE TRIGGER update_podruns_updated_at 
    BEFORE UPDATE ON podruns 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 7: Update views (recreate to ensure they match current schema)
DROP VIEW IF EXISTS user_leaderboard;
CREATE VIEW user_leaderboard AS
SELECT 
    user_id,
    username,
    balance,
    last_work,
    bankruptcy_bailout_count,
    created_at,
    RANK() OVER (ORDER BY balance DESC) as rank
FROM users 
WHERE balance > 0
ORDER BY balance DESC;

DROP VIEW IF EXISTS active_podruns_summary;
CREATE VIEW active_podruns_summary AS
SELECT 
    p.id,
    p.podrun_key,
    p.creator_id,
    p.guild_id,
    p.channel_id,
    p.message_id,
    p.start_time,
    p.run_time,
    p.status,
    COUNT(CASE WHEN pp.participant_type = 'podrunner' THEN 1 END) as podrunner_count,
    COUNT(CASE WHEN pp.participant_type = 'hater' THEN 1 END) as hater_count,
    p.created_at,
    p.updated_at
FROM podruns p
LEFT JOIN podrun_participants pp ON p.id = pp.podrun_id
WHERE p.status = 'active'
GROUP BY p.id, p.podrun_key, p.creator_id, p.guild_id, p.channel_id, p.message_id, p.start_time, p.run_time, p.status, p.created_at, p.updated_at
ORDER BY p.created_at DESC;

-- Step 8: Add comments to new columns for documentation
COMMENT ON COLUMN users.bankruptcy_from_gambling IS 'True when user went broke specifically from gambling and is eligible for emergency work';
COMMENT ON COLUMN users.bankruptcy_bailout_count IS 'Count of bailouts used to prevent exploitation - max 1 per user';
COMMENT ON COLUMN roulette_games.pity_applied IS 'Whether pity system was applied to this game';
COMMENT ON COLUMN roulette_games.pity_bonus_percentage IS 'Bonus win chance percentage applied due to losing streak';
COMMENT ON COLUMN roulette_games.losing_streak IS 'Number of consecutive losses before this game';

COMMIT;

-- Migration completed successfully!
-- 
-- New features added:
-- - Enhanced bankruptcy bailout system (prevents exploitation)
-- - Pity system for roulette games
-- - Transactions table for payment tracking
-- - Top winners function for leaderboards
-- - Updated views with new columns
-- 
-- Run the following queries to verify data integrity:
-- SELECT COUNT(*) as user_count FROM users;
-- SELECT COUNT(*) as roulette_games_count FROM roulette_games;
-- SELECT COUNT(*) as podruns_count FROM podruns;
-- SELECT COUNT(*) as participants_count FROM podrun_participants;
-- SELECT COUNT(*) as work_sessions_count FROM work_sessions;
-- SELECT COUNT(*) as transactions_count FROM transactions;
-- SELECT COUNT(*) as cache_entries_count FROM cache_entries;
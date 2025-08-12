-- This script will drop ALL tables, functions, views, triggers, and sequences
-- Then recreate everything from scratch using the latest schema

-- ================================
-- DROP ALL EXISTING OBJECTS
-- ================================

-- Drop views first (they depend on tables)
DROP VIEW IF EXISTS user_leaderboard CASCADE;
DROP VIEW IF EXISTS active_podruns_summary CASCADE;

-- Drop triggers (they depend on functions)
DROP TRIGGER IF EXISTS update_users_updated_at ON users CASCADE;
DROP TRIGGER IF EXISTS update_podruns_updated_at ON podruns CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS clean_expired_cache() CASCADE;
DROP FUNCTION IF EXISTS get_top_winners(INTEGER) CASCADE;

-- Drop tables (in reverse dependency order)
DROP TABLE IF EXISTS podrun_participants CASCADE;
DROP TABLE IF EXISTS podruns CASCADE;
DROP TABLE IF EXISTS roulette_games CASCADE;
DROP TABLE IF EXISTS work_sessions CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS cache_entries CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop sequences if they exist
DROP SEQUENCE IF EXISTS users_id_seq CASCADE;
DROP SEQUENCE IF EXISTS podruns_id_seq CASCADE;
DROP SEQUENCE IF EXISTS podrun_participants_id_seq CASCADE;
DROP SEQUENCE IF EXISTS roulette_games_id_seq CASCADE;
DROP SEQUENCE IF EXISTS work_sessions_id_seq CASCADE;
DROP SEQUENCE IF EXISTS transactions_id_seq CASCADE;
DROP SEQUENCE IF EXISTS cache_entries_id_seq CASCADE;

-- ================================
-- RECREATE ALL TABLES
-- ================================

-- Users table to track user balances and stats
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(20) NOT NULL UNIQUE, -- Discord user ID
    username VARCHAR(32), -- Discord username for display
    balance INTEGER NOT NULL DEFAULT 0,
    last_work TIMESTAMPTZ,
    bankruptcy_bailout_used BOOLEAN DEFAULT FALSE, -- Whether user has used their one-time bailout work
    bankruptcy_from_gambling BOOLEAN DEFAULT FALSE, -- True when user went broke specifically from gambling
    bankruptcy_bailout_count INTEGER DEFAULT 0, -- Count of bailouts used to prevent exploitation
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Podruns table to track active and completed podruns
CREATE TABLE podruns (
    id SERIAL PRIMARY KEY,
    podrun_key VARCHAR(50) NOT NULL UNIQUE, -- guild_id-channel_id format
    creator_id VARCHAR(20) NOT NULL, -- Discord user ID
    guild_id VARCHAR(20) NOT NULL,
    channel_id VARCHAR(20) NOT NULL,
    message_id VARCHAR(20), -- Discord message ID
    start_time TIMESTAMPTZ NOT NULL,
    run_time TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, completed, cancelled
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Podrun participants table (many-to-many relationship)
CREATE TABLE podrun_participants (
    id SERIAL PRIMARY KEY,
    podrun_id INTEGER NOT NULL REFERENCES podruns(id) ON DELETE CASCADE,
    user_id VARCHAR(20) NOT NULL,
    username VARCHAR(32),
    participant_type VARCHAR(10) NOT NULL, -- 'podrunner' or 'hater'
    joined_at TIMESTAMPTZ DEFAULT NOW()
);

-- Roulette games table to track game history
CREATE TABLE roulette_games (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(20) NOT NULL,
    username VARCHAR(32),
    bet_type VARCHAR(20) NOT NULL,
    bet_value VARCHAR(10), -- For specific number bets
    bet_amount INTEGER NOT NULL,
    result_number INTEGER NOT NULL,
    result_color VARCHAR(10) NOT NULL,
    won BOOLEAN NOT NULL,
    win_amount INTEGER DEFAULT 0,
    payout_ratio DECIMAL(4,1) DEFAULT 0,
    balance_before INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    pity_applied BOOLEAN DEFAULT FALSE, -- Whether pity system was applied
    pity_bonus_percentage INTEGER DEFAULT 0, -- Bonus win chance percentage applied
    losing_streak INTEGER DEFAULT 0, -- Number of consecutive losses before this game
    played_at TIMESTAMPTZ DEFAULT NOW()
);

-- Work sessions table to track work command usage
CREATE TABLE work_sessions (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(20) NOT NULL,
    username VARCHAR(32),
    reward_amount INTEGER NOT NULL,
    balance_before INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    worked_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions table to track money transfers between users
CREATE TABLE transactions (
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

-- Cache table for menu data and other cached content
CREATE TABLE cache_entries (
    id SERIAL PRIMARY KEY,
    cache_key VARCHAR(255) NOT NULL UNIQUE,
    data JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================
-- CREATE INDEXES
-- ================================

CREATE INDEX idx_users_user_id ON users(user_id);
CREATE INDEX idx_podruns_podrun_key ON podruns(podrun_key);
CREATE INDEX idx_podruns_status ON podruns(status);
CREATE INDEX idx_podruns_guild_channel ON podruns(guild_id, channel_id);
CREATE INDEX idx_podrun_participants_podrun_id ON podrun_participants(podrun_id);
CREATE INDEX idx_podrun_participants_user_id ON podrun_participants(user_id);
CREATE INDEX idx_roulette_games_user_id ON roulette_games(user_id);
CREATE INDEX idx_roulette_games_played_at ON roulette_games(played_at);
CREATE INDEX idx_work_sessions_user_id ON work_sessions(user_id);
CREATE INDEX idx_work_sessions_worked_at ON work_sessions(worked_at);
CREATE INDEX idx_transactions_sender_id ON transactions(sender_id);
CREATE INDEX idx_transactions_receiver_id ON transactions(receiver_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);
CREATE INDEX idx_cache_entries_cache_key ON cache_entries(cache_key);
CREATE INDEX idx_cache_entries_expires_at ON cache_entries(expires_at);

-- ================================
-- CREATE FUNCTIONS
-- ================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to clean expired cache entries
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

-- Function to get top winners (for roulette leaderboard)
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

-- ================================
-- CREATE TRIGGERS
-- ================================

CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_podruns_updated_at 
    BEFORE UPDATE ON podruns 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================
-- CREATE VIEWS
-- ================================

-- View for user leaderboard
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

-- View for active podruns with participant counts
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

-- ================================
-- VERIFICATION QUERIES
-- ================================

-- Verify all tables are empty and sequences are reset
SELECT 'Database Reset Complete - All tables recreated with latest schema' as status;

-- Show table row counts and sequence values
SELECT 
    'users' as table_name, 
    COUNT(*) as row_count,
    (SELECT last_value FROM users_id_seq) as sequence_value
FROM users
UNION ALL
SELECT 
    'podruns', 
    COUNT(*),
    (SELECT last_value FROM podruns_id_seq)
FROM podruns
UNION ALL
SELECT 
    'podrun_participants', 
    COUNT(*),
    (SELECT last_value FROM podrun_participants_id_seq)
FROM podrun_participants
UNION ALL
SELECT 
    'roulette_games', 
    COUNT(*),
    (SELECT last_value FROM roulette_games_id_seq)
FROM roulette_games
UNION ALL
SELECT 
    'work_sessions', 
    COUNT(*),
    (SELECT last_value FROM work_sessions_id_seq)
FROM work_sessions
UNION ALL
SELECT 
    'transactions', 
    COUNT(*),
    (SELECT last_value FROM transactions_id_seq)
FROM transactions
UNION ALL
SELECT 
    'cache_entries', 
    COUNT(*),
    (SELECT last_value FROM cache_entries_id_seq)
FROM cache_entries;

-- Show all created objects summary
SELECT 
    schemaname,
    tablename,
    'TABLE' as object_type
FROM pg_tables 
WHERE schemaname = 'public' AND tablename IN ('users', 'podruns', 'podrun_participants', 'roulette_games', 'work_sessions', 'transactions', 'cache_entries')
UNION ALL
SELECT 
    schemaname,
    viewname as tablename,
    'VIEW' as object_type
FROM pg_views 
WHERE schemaname = 'public' AND viewname IN ('user_leaderboard', 'active_podruns_summary')
UNION ALL
SELECT 
    n.nspname as schemaname,
    p.proname as tablename,
    'FUNCTION' as object_type
FROM pg_proc p
LEFT JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname IN ('update_updated_at_column', 'clean_expired_cache', 'get_top_winners')
ORDER BY object_type, tablename;

-- Show column information for verification
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name IN ('users', 'podruns', 'podrun_participants', 'roulette_games', 'work_sessions', 'transactions', 'cache_entries')
ORDER BY table_name, ordinal_position;
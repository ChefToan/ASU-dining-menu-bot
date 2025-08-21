-- =======================================================================
-- ASU Dining Bot - Complete Database Schema
-- =======================================================================
-- This file contains the complete, up-to-date database schema for the
-- ASU Dining Bot including all tables, indexes, constraints, functions,
-- views, and performance optimizations.
--
-- Tables:
--   - users: User balances and work statistics
--   - podruns: Podrun events and management
--   - podrun_participants: Podrun participation tracking
--   - roulette_games: Gambling game history with pity system
--   - work_sessions: Work command usage tracking
--   - transactions: Money transfer history
--   - cache_entries: Application cache storage
--   - dining_events: Meal meetup events
--   - dining_event_participants: Meal event participation
--
-- Performance Features:
--   - Comprehensive indexes for all common queries
--   - Partial indexes for status-based filtered queries
--   - Materialized views for expensive aggregations
--   - Stored functions for complex statistics
--   - Automatic maintenance procedures
--
-- Version: Updated with increased character limits to fix varchar errors
-- =======================================================================

-- Users table to track user balances and stats
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(20) NOT NULL UNIQUE, -- Discord user ID
    username VARCHAR(64), -- Discord username for display (increased from 32)
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
    podrun_key VARCHAR(100) NOT NULL UNIQUE, -- guild_id-channel_id format (increased from 50)
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
    username VARCHAR(64), -- Increased from 32
    participant_type VARCHAR(10) NOT NULL, -- 'podrunner' or 'hater'
    joined_at TIMESTAMPTZ DEFAULT NOW()
);

-- Roulette games table to track game history
CREATE TABLE roulette_games (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(20) NOT NULL,
    username VARCHAR(64), -- Increased from 32
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
    username VARCHAR(64), -- Increased from 32
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
    sender_username VARCHAR(64), -- Increased from 32
    receiver_username VARCHAR(64), -- Increased from 32
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

-- Dining events table to track meal meetups
CREATE TABLE dining_events (
    id SERIAL PRIMARY KEY,
    event_key VARCHAR(200) NOT NULL UNIQUE, -- guild_id-channel_id-meal_type-date format (increased from 150)
    creator_id VARCHAR(20) NOT NULL, -- Discord user ID
    guild_id VARCHAR(20) NOT NULL,
    channel_id VARCHAR(20) NOT NULL,
    message_id VARCHAR(20), -- Discord message ID
    meal_type VARCHAR(15) NOT NULL, -- breakfast, lunch, light_lunch, dinner, brunch
    dining_hall VARCHAR(30) NOT NULL, -- barrett, manzi, hassay, tooker, mu, hida
    start_time TIMESTAMPTZ NOT NULL,
    meal_time TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, completed, cancelled
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dining event participants table (many-to-many relationship)
CREATE TABLE dining_event_participants (
    id SERIAL PRIMARY KEY,
    dining_event_id INTEGER NOT NULL REFERENCES dining_events(id) ON DELETE CASCADE,
    user_id VARCHAR(20) NOT NULL,
    username VARCHAR(64), -- Increased from 32
    participant_type VARCHAR(10) NOT NULL, -- 'attendee' or 'declined'
    joined_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX idx_users_user_id ON users(user_id);
CREATE INDEX idx_podruns_podrun_key ON podruns(podrun_key);
CREATE INDEX idx_podruns_status ON podruns(status);
CREATE INDEX idx_podruns_guild_channel ON podruns(guild_id, channel_id);
CREATE INDEX idx_podrun_participants_podrun_id ON podrun_participants(podrun_id);
CREATE INDEX idx_podrun_participants_user_id ON podrun_participants(user_id);
CREATE INDEX idx_dining_events_event_key ON dining_events(event_key);
CREATE INDEX idx_dining_events_status ON dining_events(status);
CREATE INDEX idx_dining_events_guild_channel ON dining_events(guild_id, channel_id);
CREATE INDEX idx_dining_events_meal_time ON dining_events(meal_time);
CREATE INDEX idx_dining_event_participants_event_id ON dining_event_participants(dining_event_id);
CREATE INDEX idx_dining_event_participants_user_id ON dining_event_participants(user_id);
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

-- Additional performance indexes
CREATE INDEX idx_roulette_games_bet_type ON roulette_games(bet_type);
CREATE INDEX idx_roulette_games_won ON roulette_games(won);
CREATE INDEX idx_roulette_games_pity_applied ON roulette_games(pity_applied);
CREATE INDEX idx_roulette_games_user_played_at ON roulette_games(user_id, played_at DESC);
CREATE INDEX idx_dining_events_guild_channel_status ON dining_events(guild_id, channel_id, status);
CREATE INDEX idx_podruns_guild_channel_status ON podruns(guild_id, channel_id, status);

-- Partial indexes for common filtered queries
CREATE INDEX idx_podruns_active ON podruns(podrun_key, guild_id, channel_id) WHERE status = 'active';
CREATE INDEX idx_dining_events_active ON dining_events(event_key, guild_id, channel_id) WHERE status = 'active';
-- Note: Cannot create partial index on expires_at > NOW() because NOW() is not immutable
-- The existing idx_cache_entries_expires_at index will be used for expiration queries

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_podruns_updated_at 
    BEFORE UPDATE ON podruns 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dining_events_updated_at 
    BEFORE UPDATE ON dining_events 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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

-- Data integrity constraints
ALTER TABLE users ADD CONSTRAINT check_balance_non_negative CHECK (balance >= 0);
ALTER TABLE roulette_games ADD CONSTRAINT check_bet_amount_positive CHECK (bet_amount > 0);
ALTER TABLE roulette_games ADD CONSTRAINT check_win_amount_non_negative CHECK (win_amount >= 0);
ALTER TABLE work_sessions ADD CONSTRAINT check_reward_amount_positive CHECK (reward_amount > 0);

-- View for user leaderboard
CREATE VIEW user_leaderboard AS
SELECT 
    user_id,
    username,
    balance,
    last_work,
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

-- View for active dining events with participant counts
CREATE VIEW active_dining_events_summary AS
SELECT 
    de.id,
    de.event_key,
    de.creator_id,
    de.guild_id,
    de.channel_id,
    de.message_id,
    de.meal_type,
    de.dining_hall,
    de.start_time,
    de.meal_time,
    de.status,
    COUNT(CASE WHEN dep.participant_type = 'attendee' THEN 1 END) as attendee_count,
    COUNT(CASE WHEN dep.participant_type = 'declined' THEN 1 END) as declined_count,
    de.created_at,
    de.updated_at
FROM dining_events de
LEFT JOIN dining_event_participants dep ON de.id = dep.dining_event_id
WHERE de.status = 'active'
GROUP BY de.id, de.event_key, de.creator_id, de.guild_id, de.channel_id, de.message_id, de.meal_type, de.dining_hall, de.start_time, de.meal_time, de.status, de.created_at, de.updated_at
ORDER BY de.created_at DESC;

-- Stored functions for roulette statistics
CREATE OR REPLACE FUNCTION get_top_winners(winner_limit INTEGER DEFAULT 10)
RETURNS TABLE(
    userId VARCHAR(20),
    username VARCHAR(64),
    totalWinnings BIGINT,
    gamesPlayed BIGINT,
    winRate NUMERIC(5,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rg.user_id as userId,
        rg.username as username,
        SUM(rg.win_amount) as totalWinnings,
        COUNT(*) as gamesPlayed,
        ROUND((COUNT(CASE WHEN rg.won THEN 1 END)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2) as winRate
    FROM roulette_games rg
    GROUP BY rg.user_id, rg.username
    HAVING COUNT(*) >= 5  -- Minimum 5 games to appear on leaderboard
    ORDER BY totalWinnings DESC
    LIMIT winner_limit;
END;
$$ LANGUAGE plpgsql;

-- Function for comprehensive user statistics
CREATE OR REPLACE FUNCTION get_user_roulette_stats(target_user_id VARCHAR(20))
RETURNS TABLE(
    totalGames BIGINT,
    totalWon BIGINT,
    totalLost BIGINT,
    totalAmountBet BIGINT,
    totalAmountWon BIGINT,
    winRate NUMERIC(5,2),
    netProfit BIGINT,
    currentStreak INTEGER,
    bestStreak INTEGER,
    worstStreak INTEGER
) AS $$
DECLARE
    current_streak INTEGER := 0;
    best_streak INTEGER := 0;
    worst_streak INTEGER := 0;
    temp_streak INTEGER := 0;
    game_record RECORD;
BEGIN
    -- Calculate basic stats
    SELECT 
        COUNT(*),
        COUNT(CASE WHEN won THEN 1 END),
        COUNT(CASE WHEN NOT won THEN 1 END),
        SUM(bet_amount),
        SUM(win_amount),
        ROUND((COUNT(CASE WHEN won THEN 1 END)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2),
        SUM(win_amount) - SUM(bet_amount)
    INTO totalGames, totalWon, totalLost, totalAmountBet, totalAmountWon, winRate, netProfit
    FROM roulette_games 
    WHERE user_id = target_user_id;
    
    -- Calculate streaks
    FOR game_record IN 
        SELECT won 
        FROM roulette_games 
        WHERE user_id = target_user_id 
        ORDER BY played_at ASC
    LOOP
        IF game_record.won THEN
            IF temp_streak < 0 THEN
                worst_streak := LEAST(worst_streak, temp_streak);
                temp_streak := 1;
            ELSE
                temp_streak := temp_streak + 1;
            END IF;
            best_streak := GREATEST(best_streak, temp_streak);
        ELSE
            IF temp_streak > 0 THEN
                best_streak := GREATEST(best_streak, temp_streak);
                temp_streak := -1;
            ELSE
                temp_streak := temp_streak - 1;
            END IF;
            worst_streak := LEAST(worst_streak, temp_streak);
        END IF;
    END LOOP;
    
    current_streak := temp_streak;
    
    RETURN QUERY SELECT 
        COALESCE(get_user_roulette_stats.totalGames, 0),
        COALESCE(get_user_roulette_stats.totalWon, 0),
        COALESCE(get_user_roulette_stats.totalLost, 0),
        COALESCE(get_user_roulette_stats.totalAmountBet, 0),
        COALESCE(get_user_roulette_stats.totalAmountWon, 0),
        COALESCE(get_user_roulette_stats.winRate, 0.00),
        COALESCE(get_user_roulette_stats.netProfit, 0),
        current_streak,
        best_streak,
        ABS(worst_streak);
END;
$$ LANGUAGE plpgsql;

-- Materialized view for leaderboard performance
CREATE MATERIALIZED VIEW user_stats_materialized AS
SELECT 
    u.user_id,
    u.username,
    u.balance,
    u.last_work,
    u.created_at,
    COALESCE(rs.total_games, 0) as roulette_games,
    COALESCE(rs.total_winnings, 0) as roulette_winnings,
    COALESCE(ws.work_sessions, 0) as work_sessions,
    RANK() OVER (ORDER BY u.balance DESC) as balance_rank
FROM users u
LEFT JOIN (
    SELECT 
        user_id,
        COUNT(*) as total_games,
        SUM(win_amount) as total_winnings
    FROM roulette_games 
    GROUP BY user_id
) rs ON u.user_id = rs.user_id
LEFT JOIN (
    SELECT 
        user_id,
        COUNT(*) as work_sessions
    FROM work_sessions 
    GROUP BY user_id
) ws ON u.user_id = ws.user_id;

-- Index for the materialized view
CREATE UNIQUE INDEX idx_user_stats_materialized_user_id ON user_stats_materialized(user_id);
CREATE INDEX idx_user_stats_materialized_balance_rank ON user_stats_materialized(balance_rank);

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_user_stats()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats_materialized;
END;
$$ LANGUAGE plpgsql;

-- Comprehensive maintenance function
CREATE OR REPLACE FUNCTION run_maintenance()
RETURNS TEXT AS $$
DECLARE
    cache_cleaned INTEGER;
    stats_refreshed BOOLEAN := FALSE;
    result_text TEXT;
BEGIN
    -- Clean expired cache
    SELECT clean_expired_cache() INTO cache_cleaned;
    
    -- Refresh materialized view if it exists
    BEGIN
        PERFORM refresh_user_stats();
        stats_refreshed := TRUE;
    EXCEPTION 
        WHEN OTHERS THEN
            stats_refreshed := FALSE;
    END;
    
    -- Update table statistics
    ANALYZE users, roulette_games, work_sessions, dining_events, podruns, cache_entries;
    
    -- Prepare result message
    result_text := format(
        'Maintenance completed: %s cache entries cleaned, stats refreshed: %s, table statistics updated',
        cache_cleaned,
        CASE WHEN stats_refreshed THEN 'yes' ELSE 'no' END
    );
    
    RETURN result_text;
END;
$$ LANGUAGE plpgsql;
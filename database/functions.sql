-- Additional SQL functions for advanced queries

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
-- Additional SQL functions for advanced queries

-- Function to get top winners (for roulette leaderboard)
CREATE OR REPLACE FUNCTION get_top_winners(winner_limit INTEGER DEFAULT 10)
RETURNS TABLE (
    userId VARCHAR(20),
    username VARCHAR(32),
    totalWinnings BIGINT,
    gamesPlayed BIGINT,
    winRate DECIMAL(5,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rg.user_id,
        rg.username,
        SUM(rg.win_amount)::BIGINT as totalWinnings,
        COUNT(*)::BIGINT as gamesPlayed,
        ROUND((COUNT(CASE WHEN rg.won THEN 1 END)::DECIMAL / COUNT(*) * 100), 2) as winRate
    FROM roulette_games rg
    GROUP BY rg.user_id, rg.username
    HAVING SUM(rg.win_amount) > 0
    ORDER BY SUM(rg.win_amount) DESC
    LIMIT winner_limit;
END;
$$ LANGUAGE plpgsql;
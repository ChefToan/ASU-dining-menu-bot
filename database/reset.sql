-- Clear all data (keeps table structure)
DELETE FROM podrun_participants;
DELETE FROM podruns;
DELETE FROM roulette_games;
DELETE FROM work_sessions;
DELETE FROM cache_entries;
DELETE FROM users;

-- Reset sequences (so IDs start from 1 again)
ALTER SEQUENCE users_id_seq RESTART WITH 1;
ALTER SEQUENCE podruns_id_seq RESTART WITH 1;
ALTER SEQUENCE podrun_participants_id_seq RESTART WITH
    1;
ALTER SEQUENCE roulette_games_id_seq RESTART WITH 1;
ALTER SEQUENCE work_sessions_id_seq RESTART WITH 1;
ALTER SEQUENCE cache_entries_id_seq RESTART WITH 1;

-- Verify everything is clean
SELECT 'users' as table_name, COUNT(*) as count FROM
    users
UNION ALL
SELECT 'podruns', COUNT(*) FROM podruns
UNION ALL
SELECT 'roulette_games', COUNT(*) FROM roulette_games
UNION ALL
SELECT 'work_sessions', COUNT(*) FROM work_sessions
UNION ALL
SELECT 'cache_entries', COUNT(*) FROM cache_entries;

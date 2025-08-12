-- ================================================
-- DROP ALL TABLES SCRIPT
-- ================================================
-- This script completely removes ALL database objects
-- WARNING: This will permanently delete all data!
-- Use this for a completely clean slate

-- ================================
-- INFORMATION QUERIES (BEFORE DROP)
-- ================================

-- Show what will be dropped
SELECT 'Objects that will be dropped:' as info;

-- Show all tables
SELECT 
    schemaname,
    tablename,
    'TABLE' as object_type
FROM pg_tables 
WHERE schemaname = 'public'
UNION ALL
-- Show all views
SELECT 
    schemaname,
    viewname as tablename,
    'VIEW' as object_type
FROM pg_views 
WHERE schemaname = 'public'
UNION ALL
-- Show all functions
SELECT 
    n.nspname as schemaname,
    p.proname as tablename,
    'FUNCTION' as object_type
FROM pg_proc p
LEFT JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.prokind = 'f'
ORDER BY object_type, tablename;

-- Show table sizes before deletion
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = schemaname AND table_name = tablename) as column_count
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- ================================
-- DROP ALL OBJECTS
-- ================================

-- Drop all views (they may depend on tables)
DO $$
DECLARE
    view_name TEXT;
BEGIN
    FOR view_name IN 
        SELECT viewname FROM pg_views WHERE schemaname = 'public'
    LOOP
        EXECUTE 'DROP VIEW IF EXISTS ' || view_name || ' CASCADE';
        RAISE NOTICE 'Dropped view: %', view_name;
    END LOOP;
END $$;

-- Drop all triggers
DO $$
DECLARE
    trigger_record RECORD;
BEGIN
    FOR trigger_record IN 
        SELECT 
            t.tgname as trigger_name,
            c.relname as table_name
        FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'public' AND t.tgisinternal = false
    LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || trigger_record.trigger_name || ' ON ' || trigger_record.table_name || ' CASCADE';
        RAISE NOTICE 'Dropped trigger: % on table %', trigger_record.trigger_name, trigger_record.table_name;
    END LOOP;
END $$;

-- Drop all functions
DO $$
DECLARE
    function_name TEXT;
    function_args TEXT;
BEGIN
    FOR function_name, function_args IN 
        SELECT 
            p.proname,
            pg_get_function_identity_arguments(p.oid)
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.prokind = 'f'
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || function_name || '(' || function_args || ') CASCADE';
        RAISE NOTICE 'Dropped function: %(%)', function_name, function_args;
    END LOOP;
END $$;

-- Drop all tables
DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOR table_name IN 
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || table_name || ' CASCADE';
        RAISE NOTICE 'Dropped table: %', table_name;
    END LOOP;
END $$;

-- Drop all sequences
DO $$
DECLARE
    sequence_name TEXT;
BEGIN
    FOR sequence_name IN 
        SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'
    LOOP
        EXECUTE 'DROP SEQUENCE IF EXISTS ' || sequence_name || ' CASCADE';
        RAISE NOTICE 'Dropped sequence: %', sequence_name;
    END LOOP;
END $$;

-- Drop all types (if any custom types exist)
DO $$
DECLARE
    type_name TEXT;
BEGIN
    FOR type_name IN 
        SELECT typname FROM pg_type t
        JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE n.nspname = 'public' AND t.typtype = 'c'
    LOOP
        EXECUTE 'DROP TYPE IF EXISTS ' || type_name || ' CASCADE';
        RAISE NOTICE 'Dropped type: %', type_name;
    END LOOP;
END $$;

-- ================================
-- VERIFICATION QUERIES (AFTER DROP)
-- ================================

-- Verify everything is gone
SELECT 'Drop operations completed. Verifying cleanup...' as status;

-- Check remaining tables
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN 'SUCCESS: No tables remaining'
        ELSE 'WARNING: ' || COUNT(*) || ' tables still exist'
    END as table_status
FROM pg_tables 
WHERE schemaname = 'public';

-- Check remaining views
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN 'SUCCESS: No views remaining'
        ELSE 'WARNING: ' || COUNT(*) || ' views still exist'
    END as view_status
FROM pg_views 
WHERE schemaname = 'public';

-- Check remaining functions
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN 'SUCCESS: No custom functions remaining'
        ELSE 'WARNING: ' || COUNT(*) || ' functions still exist'
    END as function_status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.prokind = 'f';

-- Check remaining sequences
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN 'SUCCESS: No sequences remaining'
        ELSE 'WARNING: ' || COUNT(*) || ' sequences still exist'
    END as sequence_status
FROM pg_sequences 
WHERE schemaname = 'public';

-- Final status
SELECT 
    'Database completely cleaned!' as final_status,
    'Ready for fresh schema.sql execution' as next_step;

-- Show any remaining objects (should be empty)
SELECT 'Remaining objects (should be empty):' as info;

SELECT 
    schemaname,
    tablename,
    'TABLE' as object_type
FROM pg_tables 
WHERE schemaname = 'public'
UNION ALL
SELECT 
    schemaname,
    viewname as tablename,
    'VIEW' as object_type
FROM pg_views 
WHERE schemaname = 'public'
UNION ALL
SELECT 
    n.nspname as schemaname,
    p.proname as tablename,
    'FUNCTION' as object_type
FROM pg_proc p
LEFT JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.prokind = 'f'
UNION ALL
SELECT 
    schemaname,
    sequencename as tablename,
    'SEQUENCE' as object_type
FROM pg_sequences 
WHERE schemaname = 'public'
ORDER BY object_type, tablename;
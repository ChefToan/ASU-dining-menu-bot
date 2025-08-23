# Database Management Scripts

This directory contains SQL scripts for managing the ASU Dining Bot database.

## Scripts Overview

### `schema.sql`
- **Purpose**: Creates the complete database schema from scratch (current version)
- **Use**: Run this on a brand new database or after dropping all tables
- **Contains**: Tables, indexes, functions, triggers, views
- **Safe to run**: ✅ Yes (creates only, no destructive operations)

### `db_migration.sql`
- **Purpose**: Migrates existing database from old schema to new schema
- **Use**: When updating existing database with new features while preserving data
- **Contains**: ADD COLUMN statements, new tables, updated indexes and views
- **Safe to run**: ✅ Yes (preserves existing data, only adds new features)

### `reset.sql`
- **Purpose**: Drops ALL existing objects and recreates everything with latest schema
- **Use**: When you want to clear all data but keep the database structure updated
- **Contains**: Complete drop + recreate cycle with verification queries
- **Safe to run**: ⚠️ **DESTRUCTIVE** - Will delete ALL data

### `drop_all_tables.sql`
- **Purpose**: Completely removes all database objects for a clean slate
- **Use**: When you want to completely wipe the database clean
- **Contains**: Intelligent dropping of all objects with verification
- **Safe to run**: ⚠️ **HIGHLY DESTRUCTIVE** - Will delete EVERYTHING

### `functions.sql`
- **Purpose**: Additional utility functions
- **Use**: Supplementary functions for database operations

### `performance_check.sql`
- **Purpose**: Database performance analysis
- **Use**: Check database health and performance metrics

## Usage Instructions

### 1. Setting up a new database:
```bash
psql -d your_database -f schema.sql
```

### 2. Migrating existing database to new schema:
```bash
# BACKUP FIRST!
pg_dump your_database > backup_before_migration.sql

# Run migration
psql -d your_database -f db_migration.sql

# Verify data integrity
psql -d your_database -c "SELECT COUNT(*) FROM users;"
```


### 3. Resetting existing database with new schema:
```bash
psql -d your_database -f reset.sql
```

### 4. Completely wiping database clean:
```bash
psql -d your_database -f drop_all_tables.sql
```

### 5. After using drop_all_tables.sql, run schema.sql:
```bash
psql -d your_database -f drop_all_tables.sql
psql -d your_database -f schema.sql
```

## Database Schema Overview

### Tables:
- **users**: User accounts, balances, and activity tracking
- **podruns**: Podrun events and scheduling
- **podrun_participants**: Many-to-many relationship for podrun participation
- **roulette_games**: Complete roulette game history with pity system
- **work_sessions**: Work command usage tracking
- **transactions**: Money transfer audit trail (for /pay command)
- **cache_entries**: Menu data caching

### Key Features:
- **Pity System**: Advanced roulette pity mechanics with configurable thresholds
- **Transaction Logging**: Complete audit trail for all money transfers
- **Rate Limiting**: Database-backed daily limits for transfers
- **Performance Optimized**: Comprehensive indexing strategy
- **Data Integrity**: Foreign keys and constraints
- **Automatic Timestamps**: Trigger-based updated_at fields

## Safety Notes

⚠️ **ALWAYS BACKUP YOUR DATABASE BEFORE RUNNING DESTRUCTIVE SCRIPTS**

- `schema.sql` - Safe to run anytime
- `reset.sql` - **WILL DELETE ALL DATA** - Backup first!
- `drop_all_tables.sql` - **WILL DELETE EVERYTHING** - Backup first!

## Verification

Each script includes verification queries that will show:
- What objects were created/dropped
- Row counts and data verification
- Schema structure confirmation
- Performance metrics

## Common Workflows

### Development Reset:
1. `reset.sql` - Quick reset with latest schema

### Fresh Installation:
1. `schema.sql` - Clean installation

### Complete Cleanup:
1. `drop_all_tables.sql` - Nuclear option
2. `schema.sql` - Rebuild from scratch

### Production Updates:
1. Backup database first
2. Test scripts on staging environment
3. Run appropriate script based on changes needed
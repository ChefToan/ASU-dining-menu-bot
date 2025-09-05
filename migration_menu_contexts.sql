-- Migration: Add menu_command_contexts table for persistent refresh functionality
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS menu_command_contexts (
    id SERIAL PRIMARY KEY,
    message_id TEXT UNIQUE NOT NULL,
    dining_hall TEXT NOT NULL,
    original_date TEXT NOT NULL, -- Format: YYYY-MM-DD
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Create index for faster lookups by message_id
CREATE INDEX IF NOT EXISTS idx_menu_contexts_message_id ON menu_command_contexts(message_id);

-- Create index for faster cleanup queries
CREATE INDEX IF NOT EXISTS idx_menu_contexts_expires_at ON menu_command_contexts(expires_at);

-- Add some useful comments
COMMENT ON TABLE menu_command_contexts IS 'Stores context for menu commands to enable persistent refresh functionality';
COMMENT ON COLUMN menu_command_contexts.message_id IS 'Discord message ID for the menu response';
COMMENT ON COLUMN menu_command_contexts.dining_hall IS 'Dining hall key (e.g. barrett, manzi)';
COMMENT ON COLUMN menu_command_contexts.original_date IS 'Original date requested in YYYY-MM-DD format';
COMMENT ON COLUMN menu_command_contexts.expires_at IS 'Context expires after 1 week';
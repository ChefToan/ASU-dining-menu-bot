import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: number;
          user_id: string;
          username: string | null;
          balance: number;
          last_work: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          username?: string;
          balance?: number;
          last_work?: string;
        };
        Update: {
          username?: string;
          balance?: number;
          last_work?: string;
        };
      };
      podruns: {
        Row: {
          id: number;
          podrun_key: string;
          creator_id: string;
          guild_id: string;
          channel_id: string;
          message_id: string | null;
          start_time: string;
          run_time: string;
          status: 'active' | 'completed' | 'cancelled';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          podrun_key: string;
          creator_id: string;
          guild_id: string;
          channel_id: string;
          message_id?: string;
          start_time: string;
          run_time: string;
          status?: 'active' | 'completed' | 'cancelled';
        };
        Update: {
          message_id?: string;
          status?: 'active' | 'completed' | 'cancelled';
        };
      };
      podrun_participants: {
        Row: {
          id: number;
          podrun_id: number;
          user_id: string;
          username: string | null;
          participant_type: 'podrunner' | 'hater';
          joined_at: string;
        };
        Insert: {
          podrun_id: number;
          user_id: string;
          username?: string;
          participant_type: 'podrunner' | 'hater';
        };
        Update: {
          participant_type?: 'podrunner' | 'hater';
        };
      };
      roulette_games: {
        Row: {
          id: number;
          user_id: string;
          username: string | null;
          bet_type: string;
          bet_value: string | null;
          bet_amount: number;
          result_number: number;
          result_color: string;
          won: boolean;
          win_amount: number;
          payout_ratio: number;
          balance_before: number;
          balance_after: number;
          played_at: string;
        };
        Insert: {
          user_id: string;
          username?: string;
          bet_type: string;
          bet_value?: string;
          bet_amount: number;
          result_number: number;
          result_color: string;
          won: boolean;
          win_amount?: number;
          payout_ratio?: number;
          balance_before: number;
          balance_after: number;
        };
        Update: never;
      };
      work_sessions: {
        Row: {
          id: number;
          user_id: string;
          username: string | null;
          reward_amount: number;
          balance_before: number;
          balance_after: number;
          worked_at: string;
        };
        Insert: {
          user_id: string;
          username?: string;
          reward_amount: number;
          balance_before: number;
          balance_after: number;
        };
        Update: never;
      };
      cache_entries: {
        Row: {
          id: number;
          cache_key: string;
          data: any;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          cache_key: string;
          data: any;
          expires_at: string;
        };
        Update: {
          data?: any;
          expires_at?: string;
        };
      };
    };
    Views: {
      user_leaderboard: {
        Row: {
          user_id: string;
          username: string | null;
          balance: number;
          last_work: string | null;
          created_at: string;
          rank: number;
        };
      };
      active_podruns_summary: {
        Row: {
          id: number;
          podrun_key: string;
          creator_id: string;
          guild_id: string;
          channel_id: string;
          message_id: string | null;
          start_time: string;
          run_time: string;
          status: string;
          podrunner_count: number;
          hater_count: number;
          created_at: string;
          updated_at: string;
        };
      };
    };
    Functions: {
      clean_expired_cache: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
    };
  };
}

class DatabaseService {
  private supabase: SupabaseClient<Database>;
  private static instance: DatabaseService;

  constructor() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      throw new Error('Missing Supabase environment variables (SUPABASE_URL, SUPABASE_ANON_KEY)');
    }

    this.supabase = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public getClient(): SupabaseClient<Database> {
    return this.supabase;
  }

  // Test database connection
  async testConnection(): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('users')
        .select('count')
        .limit(1);
      
      return !error;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
  }

  // Clean expired cache entries
  async cleanExpiredCache(): Promise<number> {
    try {
      const { data, error } = await this.supabase
        .rpc('clean_expired_cache');
      
      if (error) throw error;
      return data || 0;
    } catch (error) {
      console.error('Error cleaning expired cache:', error);
      return 0;
    }
  }
}

export default DatabaseService;
export const db = DatabaseService.getInstance();
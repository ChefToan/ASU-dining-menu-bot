import { config } from 'dotenv';

config();

interface RequiredEnvVars {
    DISCORD_TOKEN: string;
    APPLICATION_ID: string;
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
}

class EnvironmentValidator {
    private static instance: EnvironmentValidator;
    private envVars!: RequiredEnvVars;

    private constructor() {
        this.validateAndLoadEnv();
    }

    public static getInstance(): EnvironmentValidator {
        if (!EnvironmentValidator.instance) {
            EnvironmentValidator.instance = new EnvironmentValidator();
        }
        return EnvironmentValidator.instance;
    }

    private validateAndLoadEnv(): void {
        const requiredVars = ['DISCORD_TOKEN', 'APPLICATION_ID', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
        const missing: string[] = [];

        for (const varName of requiredVars) {
            if (!process.env[varName]) {
                missing.push(varName);
            }
        }

        if (missing.length > 0) {
            console.error('❌ Missing required environment variables:');
            missing.forEach(varName => console.error(`   - ${varName}`));
            console.error('\nCreate a .env file with the required variables and restart the bot.');
            process.exit(1);
        }

        this.envVars = {
            DISCORD_TOKEN: process.env.DISCORD_TOKEN!,
            APPLICATION_ID: process.env.APPLICATION_ID!,
            SUPABASE_URL: process.env.SUPABASE_URL!,
            SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!
        };

        console.log('✅ Environment variables validated successfully');
    }

    public get(key: keyof RequiredEnvVars): string {
        return this.envVars[key];
    }

    public getAll(): RequiredEnvVars {
        return { ...this.envVars };
    }
}

export const env = EnvironmentValidator.getInstance();
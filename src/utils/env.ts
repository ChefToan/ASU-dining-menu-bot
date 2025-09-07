import { config } from 'dotenv';

config();

interface RequiredEnvVars {
    DISCORD_TOKEN: string;
    APPLICATION_ID: string;
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
}

interface OptionalEnvVars {
    PRODUCTION_CA_ROLE_ID?: string;
    TEST_CA_ROLE_ID?: string;
    PRODUCTION_SERVER_ID?: string;
    PRODUCTION_CHANNEL_ID?: string;
    TEST_SERVER_ID?: string;
    TEST_CHANNEL_ID?: string;
    ASU_MENU_API_URL?: string;
    WEEKLY_REPORT_SURVEY_URL?: string;
}

class EnvironmentValidator {
    private static instance: EnvironmentValidator;
    private envVars!: RequiredEnvVars;
    private optionalVars!: OptionalEnvVars;

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

        this.optionalVars = {
            PRODUCTION_CA_ROLE_ID: process.env.PRODUCTION_CA_ROLE_ID,
            TEST_CA_ROLE_ID: process.env.TEST_CA_ROLE_ID,
            PRODUCTION_SERVER_ID: process.env.PRODUCTION_SERVER_ID,
            PRODUCTION_CHANNEL_ID: process.env.PRODUCTION_CHANNEL_ID,
            TEST_SERVER_ID: process.env.TEST_SERVER_ID,
            TEST_CHANNEL_ID: process.env.TEST_CHANNEL_ID,
            ASU_MENU_API_URL: process.env.ASU_MENU_API_URL,
            WEEKLY_REPORT_SURVEY_URL: process.env.WEEKLY_REPORT_SURVEY_URL
        };

        console.log('✅ Environment variables validated successfully');
    }

    public get(key: keyof RequiredEnvVars): string {
        return this.envVars[key];
    }

    public getOptional(key: keyof OptionalEnvVars): string | undefined {
        return this.optionalVars[key];
    }

    public getAll(): RequiredEnvVars {
        return { ...this.envVars };
    }
}

export const env = EnvironmentValidator.getInstance();
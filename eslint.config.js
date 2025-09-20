import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';

export default [
    js.configs.recommended,
    {
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: {
            parser: typescriptParser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                project: './tsconfig.json'
            },
            globals: {
                // Node.js globals
                process: 'readonly',
                Buffer: 'readonly',
                console: 'readonly',
                global: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                require: 'readonly',
                // TypeScript globals
                NodeJS: 'readonly'
            }
        },
        plugins: {
            '@typescript-eslint': typescript
        },
        rules: {
            // TypeScript specific rules
            '@typescript-eslint/no-unused-vars': ['warn', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_'
            }],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-inferrable-types': 'warn',

            // General rules - relaxed for existing codebase
            'no-console': 'off', // Allow console statements for logging
            'prefer-const': 'warn',
            'no-var': 'error',
            'eqeqeq': 'warn',
            'curly': 'off', // Allow single-line if statements
            'no-empty': 'warn', // Allow empty blocks as warnings

            // Style rules - relaxed to match existing code
            'indent': 'off', // Turn off strict indentation for now
            'quotes': 'off', // Allow both single and double quotes
            'semi': ['warn', 'always'],
            'comma-dangle': 'off',
            'object-curly-spacing': 'off',
            'array-bracket-spacing': 'off',
            'no-trailing-spaces': 'warn',
            'eol-last': 'warn',
            'no-unused-vars': 'off' // Use TypeScript version instead
        }
    },
    {
        // Ignore patterns
        ignores: [
            'dist/**',
            'node_modules/**',
            'build/**',
            '*.js' // Ignore JS files in root (like this config file)
        ]
    }
];
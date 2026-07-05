import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/**'],
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2015,
      sourceType: 'module',
      parser: tseslint.parser,
    },
    rules: {
      'semi': 'error',
      'indent': ['off', 2],
      'quotes': ['error', 'single'],
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/no-unused-vars': 'off',
      'arrow-body-style': 'error',
      'arrow-parens': 'off',
      'arrow-spacing': 'error',
      'generator-star-spacing': 'error',
      'no-duplicate-imports': 'error',
      'no-useless-computed-key': 'error',
      'no-useless-constructor': 'error',
      'no-useless-rename': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-const': 'error',
      'prefer-rest-params': 'error',
      'prefer-spread': 'error',
      'prefer-template': 'off',
      'rest-spread-spacing': 'error',
      'template-curly-spacing': 'error',
      'yield-star-spacing': 'error',
      'no-irregular-whitespace': 'off',
      'preserve-caught-error': 'off',
    },
  }
);

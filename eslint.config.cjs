module.exports = [
  {
    ignores: [
      '**/node_modules/**',
      '**/_metadata/**',
      '**/coverage/**',
      '**/dist/**',
      '**/*.min.js'
    ]
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        chrome: 'readonly',
        MutationObserver: 'readonly',
        NodeFilter: 'readonly',
        Node: 'readonly',
        CSS: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        FileReader: 'readonly',
        sessionStorage: 'readonly',
        requestIdleCallback: 'readonly',
        MouseEvent: 'readonly',
        PointerEvent: 'readonly',
        CustomEvent: 'readonly',
        Event: 'readonly'
      }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'after-used', ignoreRestSiblings: true }],
      'no-unreachable': 'error',
      'no-constant-binary-expression': 'error',
      eqeqeq: ['warn', 'always', { null: 'ignore' }],
      'no-var': 'warn',
      'prefer-const': ['warn', { destructuring: 'all' }],
      'no-useless-return': 'warn',
      'no-extra-boolean-cast': 'warn',
      'no-multi-assign': 'warn',
      'no-lonely-if': 'warn',
      'no-else-return': 'warn',
      curly: ['error', 'all'],
      'no-trailing-spaces': 'warn',
      'eol-last': ['warn', 'always'],
      semi: ['warn', 'always'],
      quotes: ['warn', 'single', { avoidEscape: true }],
      'keyword-spacing': ['warn', { before: true, after: true }],
      'space-before-blocks': ['warn', 'always'],
      'comma-spacing': ['warn', { before: false, after: true }],
      'object-curly-spacing': ['warn', 'always'],
      'arrow-spacing': ['warn', { before: true, after: true }],
      'no-multi-spaces': ['warn'],
      'brace-style': ['warn', '1tbs', { allowSingleLine: true }],
      'no-multiple-empty-lines': ['warn', { max: 1, maxEOF: 1 }]
    }
  },
  {
    files: ['**/*.test.js'],
    languageOptions: {
      globals: {
        require: 'readonly',
        module: 'readonly',
        global: 'readonly',
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        __dirname: 'readonly'
      }
    },
    rules: {
      'no-undef': 'error'
    }
  }
];

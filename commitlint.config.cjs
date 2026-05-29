module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      1,
      'always',
      [
        'auth',
        'c2b',
        'b2c',
        'b2b',
        'stk-push',
        'reversal',
        'balance',
        'status',
        'pull',
        'qr',
        'webhooks',
        'crypto',
        'http',
        'validation',
        'docs',
        'deps',
        'ci',
      ],
    ],
  },
};

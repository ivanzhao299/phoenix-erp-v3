// Jest config for V3 ERP API unit tests
// ts-jest reads .ts directly (no tsc needed)
// Tests live at: src/**/*.spec.ts

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/auth/permissions-resolver.ts',
    'src/auth/**/*.service.ts',
    'src/modules/permissions/**/*.service.ts',
    '!src/**/*.module.ts',
    '!src/**/*.dto.ts',
    '!src/**/*.entity.ts',
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
};

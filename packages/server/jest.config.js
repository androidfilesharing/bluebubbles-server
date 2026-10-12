module.exports = {
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/*.test.ts'],
    transform: {
        '^.+\\.(ts|tsx)$': ['babel-jest', {
            presets: [
                ['@babel/preset-env', { targets: { node: 'current' } }],
                '@babel/preset-typescript'
            ]
        }]
    },
    moduleNameMapper: {
        '^@server$': '<rootDir>/src/server',
        '^@server/(.*)$': '<rootDir>/src/server/$1'
    },
    collectCoverageFrom: [
        'src/server/api/http/security/**/*.ts',
        '!src/**/*.test.ts'
    ],
    coverageDirectory: 'coverage',
    verbose: true
};

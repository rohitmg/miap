module.exports = {
    moduleFileExtensions: ['js', 'json', 'vue'],
    transform: {
        '^.+\\.js$': 'babel-jest',
        '^.+\\.vue$': 'vue-jest',
    },
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/resources/js/$1',
    },
    testMatch: [
        '<rootDir>/tests/Javascript/**/*.spec.js',
    ],
    collectCoverage: true,
    collectCoverageFrom: [
        'resources/js/**/*.{js,vue}',
        '!**/node_modules/**',
    ],
};
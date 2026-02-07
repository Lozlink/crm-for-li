const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@realestate-crm/types',
    '@realestate-crm/config',
    '@realestate-crm/utils',
    '@realestate-crm/api',
    '@realestate-crm/hooks',
  ],
  webpack: (config) => {
    // Shim react-native imports for shared packages
    config.resolve.alias = {
      ...config.resolve.alias,
      'react-native$': path.resolve(__dirname, 'src/shims/react-native.ts'),
      '@react-native-async-storage/async-storage': path.resolve(
        __dirname,
        'src/shims/async-storage.ts'
      ),
      'expo-constants': path.resolve(__dirname, 'src/shims/expo-constants.ts'),
      'react-native-url-polyfill/auto': path.resolve(
        __dirname,
        'src/shims/url-polyfill.ts'
      ),
    };
    return config;
  },
};

module.exports = nextConfig;

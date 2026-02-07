/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@realestate-crm/types',
    '@realestate-crm/config',
    '@realestate-crm/utils',
    '@realestate-crm/api',
    '@realestate-crm/hooks',
  ],
  turbopack: {
    resolveAlias: {
      'react-native': './src/shims/react-native.ts',
      '@react-native-async-storage/async-storage': './src/shims/async-storage.ts',
      'expo-constants': './src/shims/expo-constants.ts',
      'react-native-url-polyfill/auto': './src/shims/url-polyfill.ts',
    },
  },
};

module.exports = nextConfig;

// Gerätespeicher für alle Tests nachbilden (einzelne Tests können ihn selbst ersetzen)
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

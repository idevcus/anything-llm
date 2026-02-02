const path = require('path');
const { PrismaClient } = require('@prisma/client');

// Set environment variables for tests
process.env.NODE_ENV = 'development';
process.env.STORAGE_DIR = path.join(__dirname, 'storage');

// Define __dirname and __filename for ESM compatibility in Jest
const resolvedDirname = typeof __dirname === 'undefined' ? path.resolve() : __dirname;
const resolvedFilename =
  typeof __filename === 'undefined' ? path.join(resolvedDirname, 'jest.setup.js') : __filename;
if (typeof global.__dirname === 'undefined') {
  global.__dirname = resolvedDirname;
}
if (typeof global.__filename === 'undefined') {
  global.__filename = resolvedFilename;
}

// Mock console.error to avoid cluttering test output from expected error logs
const originalError = console.error;
beforeEach(() => {
  console.error = jest.fn().mockImplementation(() => {});
});
afterEach(() => {
  console.error = originalError;
});

// Mock the utils/files module to avoid path resolution issues
jest.mock('./utils/files', () => ({
  // Export necessary functions or empty mocks
  storeVectorResult: jest.fn(),
  cachedVectorInformation: jest.fn(),
}));

// Create a test-specific Prisma client that uses SQLite
const dbPath = path.join(__dirname, 'storage', 'test.db');
const mockPrisma = new PrismaClient({
  datasources: {
    db: {
      url: `file:${dbPath}`,
    },
  },
});

// Set the global prisma instance
global.prisma = mockPrisma;

// Mock the utils/prisma module to use the test client
jest.mock('./utils/prisma', () => {
  const { PrismaClient } = require('@prisma/client');
  const path = require('path');
  const dbPath = path.join(__dirname, 'storage', 'test.db');
  return new PrismaClient({
    datasources: {
      db: {
        url: `file:${dbPath}`,
      },
    },
  });
});

// Cleanup after tests
afterAll(async () => {
  await mockPrisma.$disconnect();
});

// Setup and teardown for each test
beforeEach(async () => {
  // Clean up database before each test
  // Wrapped in try-catch to handle DB initialization errors in unit tests
  try {
    await mockPrisma.workspace_llm_message_logs.deleteMany({});
    await mockPrisma.workspace_chats.deleteMany({});
    await mockPrisma.workspaces.deleteMany({});
    await mockPrisma.users.deleteMany({});
  } catch (error) {
    // Skip DB cleanup for unit tests that don't need real DB
    if (!error.message.includes('Error validating datasource')) {
      throw error;
    }
  }
});

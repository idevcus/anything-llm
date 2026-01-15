const path = require('path');
const { PrismaClient } = require('@prisma/client');

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

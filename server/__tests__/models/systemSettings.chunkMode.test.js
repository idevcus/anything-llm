/**
 * SystemSettings - text_splitter_chunk_mode validation 테스트
 */

describe("SystemSettings - text_splitter_chunk_mode validation", () => {
  let SystemSettings;
  let mockPurgeEntireVectorCache;

  beforeEach(() => {
    jest.resetModules();

    // Mock purgeEntireVectorCache before loading SystemSettings
    mockPurgeEntireVectorCache = jest.fn();
    jest.doMock("../../utils/files", () => ({
      purgeEntireVectorCache: mockPurgeEntireVectorCache,
      storeVectorResult: jest.fn(),
      cachedVectorInformation: jest.fn(),
      hasVectorCachedFiles: jest.fn().mockReturnValue(false),
    }));

    // Mock prisma
    jest.doMock("../../utils/prisma", () => ({
      system_settings: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
    }));

    // Mock MetaGenerator
    jest.doMock("../../utils/boot/MetaGenerator", () => ({
      MetaGenerator: jest.fn().mockImplementation(() => ({
        clearConfig: jest.fn(),
      })),
    }));

    // Now require SystemSettings
    const systemSettingsModule = require("../../models/systemSettings");
    SystemSettings = systemSettingsModule.SystemSettings;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("text_splitter_chunk_mode validation function", () => {
    test("'character' 값은 유효함", () => {
      const result = SystemSettings.validations.text_splitter_chunk_mode("character");
      expect(result).toBe("character");
    });

    test("'paragraph' 값은 유효함", () => {
      const result = SystemSettings.validations.text_splitter_chunk_mode("paragraph");
      expect(result).toBe("paragraph");
    });

    test("유효하지 않은 값은 기본값 'character'로 폴백", () => {
      const result = SystemSettings.validations.text_splitter_chunk_mode("invalid_mode");
      expect(result).toBe("character");
    });

    test("빈 문자열은 기본값 'character'로 폴백", () => {
      const result = SystemSettings.validations.text_splitter_chunk_mode("");
      expect(result).toBe("character");
    });

    test("null 값은 기본값 'character'로 폴백", () => {
      const result = SystemSettings.validations.text_splitter_chunk_mode(null);
      expect(result).toBe("character");
    });

    test("undefined 값은 기본값 'character'로 폴백", () => {
      const result = SystemSettings.validations.text_splitter_chunk_mode(undefined);
      expect(result).toBe("character");
    });

    test("숫자 값은 기본값 'character'로 폴백", () => {
      const result = SystemSettings.validations.text_splitter_chunk_mode(123);
      expect(result).toBe("character");
    });

    test("대소문자가 다른 값은 기본값으로 폴백 (Character vs character)", () => {
      const result = SystemSettings.validations.text_splitter_chunk_mode("Character");
      expect(result).toBe("character");
    });

    test("모드 변경 시 purgeEntireVectorCache가 호출되어야 함", () => {
      SystemSettings.validations.text_splitter_chunk_mode("paragraph");
      expect(mockPurgeEntireVectorCache).toHaveBeenCalled();
    });

    test("character 모드에서도 purgeEntireVectorCache가 호출되어야 함", () => {
      SystemSettings.validations.text_splitter_chunk_mode("character");
      expect(mockPurgeEntireVectorCache).toHaveBeenCalled();
    });
  });

  describe("text_splitter_chunk_mode field configuration", () => {
    test("text_splitter_chunk_mode는 publicFields에 포함되어 있어야 함", () => {
      expect(SystemSettings.publicFields).toContain("text_splitter_chunk_mode");
    });

    test("text_splitter_chunk_mode는 supportedFields에 포함되어 있어야 함", () => {
      expect(SystemSettings.supportedFields).toContain("text_splitter_chunk_mode");
    });

    test("text_splitter_chunk_mode는 protectedFields에 포함되지 않아야 함", () => {
      expect(SystemSettings.protectedFields).not.toContain("text_splitter_chunk_mode");
    });
  });

  describe("text_splitter_chunk_size validation (관련 테스트)", () => {
    test("유효한 chunk_size 값", () => {
      const result = SystemSettings.validations.text_splitter_chunk_size(1000);
      expect(result).toBe(1000);
      expect(mockPurgeEntireVectorCache).toHaveBeenCalled();
    });

    test("문자열 숫자도 유효함", () => {
      const result = SystemSettings.validations.text_splitter_chunk_size("500");
      expect(result).toBe(500);
    });

    test("0 이하의 값은 기본값 1000으로 폴백", () => {
      const result = SystemSettings.validations.text_splitter_chunk_size(0);
      expect(result).toBe(1000);
    });

    test("null 값은 기본값 1000으로 폴백", () => {
      const result = SystemSettings.validations.text_splitter_chunk_size(null);
      expect(result).toBe(1000);
    });
  });

  describe("text_splitter_chunk_overlap validation (관련 테스트)", () => {
    test("유효한 chunk_overlap 값", () => {
      const result = SystemSettings.validations.text_splitter_chunk_overlap(20);
      expect(result).toBe(20);
      expect(mockPurgeEntireVectorCache).toHaveBeenCalled();
    });

    test("0 값은 유효함", () => {
      const result = SystemSettings.validations.text_splitter_chunk_overlap(0);
      expect(result).toBe(0);
    });

    test("음수 값은 기본값 20으로 폴백", () => {
      const result = SystemSettings.validations.text_splitter_chunk_overlap(-5);
      expect(result).toBe(20);
    });

    test("null 값은 기본값 20으로 폴백", () => {
      const result = SystemSettings.validations.text_splitter_chunk_overlap(null);
      expect(result).toBe(20);
    });
  });
});

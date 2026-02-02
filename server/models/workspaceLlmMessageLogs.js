const prisma = require("../utils/prisma");
const { safeJSONStringify } = require("../utils/helpers/chat/responses");

const WorkspaceLlmMessageLogs = {
  new: async function ({
    chatId,
    systemPrompt = null,
    userPrompt = null,
    llmResponse = null,
    ragContext = [],
    chatHistory = [],
    compressedMessages = [],
  }) {
    try {
      const log = await prisma.workspace_llm_message_logs.create({
        data: {
          chat_id: chatId,
          system_prompt: systemPrompt,
          user_prompt: userPrompt,
          llm_response: llmResponse,
          rag_context: ragContext?.length > 0 ? safeJSONStringify(ragContext) : null,
          chat_history: chatHistory?.length > 0 ? safeJSONStringify(chatHistory) : null,
          compressed_messages:
            compressedMessages?.length > 0 ? safeJSONStringify(compressedMessages) : null,
        },
      });
      console.log(
        `\x1b[32m[LLM Message Log Created]\x1b[0m - Chat ID: ${chatId}`
      );
      return { log, message: null };
    } catch (error) {
      console.error(
        `\x1b[31m[LLM Message Log Creation Failed]\x1b[0m - Chat ID: ${chatId}`,
        error.message
      );
      return { log: null, message: error.message };
    }
  },

  get: async function (clause = {}, limit = null, orderBy = null) {
    try {
      const log = await prisma.workspace_llm_message_logs.findFirst({
        where: clause,
        ...(limit !== null ? { take: limit } : {}),
        ...(orderBy !== null ? { orderBy } : {}),
      });
      return log || null;
    } catch (error) {
      console.error(error.message);
      return null;
    }
  },

  getByChatId: async function (chatId) {
    try {
      const log = await prisma.workspace_llm_message_logs.findUnique({
        where: { chat_id: Number(chatId) },
      });
      return log;
    } catch (error) {
      console.error(error.message);
      return null;
    }
  },

  where: async function (
    clause = {},
    limit = null,
    orderBy = null,
    offset = null
  ) {
    try {
      const logs = await prisma.workspace_llm_message_logs.findMany({
        where: clause,
        ...(limit !== null ? { take: limit } : {}),
        ...(offset !== null ? { skip: offset } : {}),
        ...(orderBy !== null ? { orderBy } : { orderBy: { createdAt: "desc" } }),
      });
      return logs;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  count: async function (clause = {}) {
    try {
      const count = await prisma.workspace_llm_message_logs.count({
        where: clause,
      });
      return count;
    } catch (error) {
      console.error(error.message);
      return 0;
    }
  },

  delete: async function (clause = {}) {
    try {
      await prisma.workspace_llm_message_logs.deleteMany({
        where: clause,
      });
      return true;
    } catch (error) {
      console.error(error.message);
      return false;
    }
  },
};

module.exports = { WorkspaceLlmMessageLogs };

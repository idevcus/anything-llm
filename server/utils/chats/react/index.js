const { v4: uuidv4 } = require("uuid");
const { WorkspaceChats } = require("../../../models/workspaceChats");
const { getVectorDbClass, getLLMProvider } = require("../../helpers");
const { writeResponseChunk } = require("../../helpers/chat/responses");
const { chatPrompt, recentChatHistory } = require("../index");
const { parseReactOutput } = require("./outputParser");

const MAX_ITERATIONS = 5;
// Maximum characters per search observation to prevent LLM context window overflow.
// Tune based on model context limits.
const OBSERVATION_MAX_CHARS = 2000;

/**
 * Builds the ReAct system prompt by appending tool descriptions and ReAct format
 * instructions to the existing workspace system prompt.
 * @param {string} basePrompt - The workspace's base system prompt. If empty, the ReAct instructions are still appended.
 * @returns {string} The combined system prompt containing basePrompt followed by tool definitions and ReAct format instructions.
 */
function buildReactSystemPrompt(basePrompt) {
  return `${basePrompt}

You have access to the following tool to help answer the user's question:

Tool: search_documents
Description: Search workspace documents for relevant information. Use this when you need to find specific information from the available documents.
Parameters: {"query": "search query string"}

You must use the following format for EVERY response:

Thought: Think about what information you need and why
Action: search_documents
Action Input: {"query": "your search query"}

After receiving an Observation (search results), you can either search again or provide your final answer:

Thought: Analyze the search results and decide if you have enough information
Final Answer: Your comprehensive answer based on the information gathered

Important rules:
- Always start with a Thought
- You may search multiple times if needed to gather sufficient information
- When you have enough information, provide a Final Answer
- If no relevant documents are found, provide a Final Answer based on your general knowledge and note that no relevant documents were found
- Keep your search queries focused and specific`;
}

/**
 * Sends a status/thought message to the client via SSE.
 * If the response stream has already been closed (writableEnded), this function is a no-op.
 * @param {import("express").Response} response
 * @param {string} uuid
 * @param {string} text
 */
function sendStatusMessage(response, uuid, text) {
  if (response.writableEnded) return;
  writeResponseChunk(response, {
    uuid,
    type: "statusResponse",
    textResponse: text,
    sources: [],
    close: false,
    error: null,
  });
}

/**
 * Main ReAct chat handler for streaming responses.
 * Implements a Thought → Action → Observation loop using non-streaming LLM calls,
 * then sends the complete final answer as a single SSE chunk (non-streaming;
 * the ReAct loop uses non-streaming LLM calls for intermediate steps).
 *
 * @param {import("express").Response} response - Express response object (SSE stream)
 * @param {Object} workspace - Workspace model object
 * @param {string} message - User's message
 * @param {Object|null} user - User model object
 * @param {Object|null} thread - Thread model object
 * @param {Object[]} attachments - Attachments array. Stored in the chat record for retrieval
 *   but NOT passed to the LLM or used during document search.
 */
async function streamReactChat(
  response,
  workspace,
  message,
  user = null,
  thread = null,
  attachments = []
) {
  const uuid = uuidv4();

  const LLMConnector = getLLMProvider({
    provider: workspace?.chatProvider,
    model: workspace?.chatModel,
  });
  const VectorDb = getVectorDbClass();

  const hasVectorizedSpace = await VectorDb.hasNamespace(workspace.slug);
  const embeddingsCount = await VectorDb.namespaceCount(workspace.slug);

  const messageLimit = workspace?.openAiHistory || 20;
  // rawHistory is fetched but not used in the ReAct loop; only the formatted chatHistory is passed to the LLM.
  const { chatHistory } = await recentChatHistory({
    user,
    workspace,
    thread,
    messageLimit,
  });

  const basePrompt = await chatPrompt(workspace, user);
  const systemPrompt = buildReactSystemPrompt(basePrompt);

  // Build initial messages array with system prompt, chat history, and user message
  const messages = [
    { role: "system", content: systemPrompt },
    ...chatHistory,
    { role: "user", content: message },
  ];

  const reactTrace = [];
  let allSources = [];
  let finalAnswer = null;

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      if (response.writableEnded) break;

      // Non-streaming LLM call for intermediate steps
      const { textResponse } = await LLMConnector.getChatCompletion(messages, {
        temperature: workspace?.openAiTemp ?? LLMConnector.defaultTemp,
      });

      // Check if client disconnected during the async LLM call to avoid wasted work
      if (response.writableEnded) return;

      if (!textResponse) {
        if (!response.writableEnded) {
          writeResponseChunk(response, {
            uuid,
            type: "abort",
            textResponse: null,
            sources: [],
            close: true,
            error: "LLM returned an empty response during ReAct reasoning.",
          });
        }
        return;
      }

      const parsed = parseReactOutput(textResponse);
      reactTrace.push({ iteration: i + 1, llmOutput: textResponse, parsed });

      if (parsed.type === "final_answer") {
        finalAnswer = parsed.answer;

        if (parsed.thought) {
          sendStatusMessage(
            response,
            uuid,
            `**Thought:** ${parsed.thought}`
          );
        }
        break;
      }

      if (parsed.type === "action") {
        // Send thought to client
        if (parsed.thought) {
          sendStatusMessage(
            response,
            uuid,
            `**Thought:** ${parsed.thought}`
          );
        }

        if (parsed.action !== "search_documents") {
          // Unknown action — tell LLM and continue
          messages.push({ role: "assistant", content: textResponse });
          messages.push({
            role: "user",
            content: `Observation: Unknown action "${parsed.action}". The only available action is "search_documents". Please try again.`,
          });
          reactTrace.push({
            iteration: i + 1,
            observation: `Unknown action: ${parsed.action}`,
          });
          continue;
        }

        const searchQuery = parsed.actionInput;
        sendStatusMessage(
          response,
          uuid,
          `**Searching documents:** "${searchQuery}"`
        );

        // Perform similarity search
        let observation = "";
        let currentSearchSourceCount = 0;
        if (!hasVectorizedSpace || embeddingsCount === 0) {
          observation =
            "No documents are embedded in this workspace. No search results found.";
        } else {
          const searchResults = await VectorDb.performSimilaritySearch({
            namespace: workspace.slug,
            input: searchQuery,
            LLMConnector,
            similarityThreshold: workspace?.similarityThreshold,
            topN: workspace?.topN,
            rerank: workspace?.vectorSearchMode === "rerank",
            adjacentChunks: workspace?.adjacentChunks ?? 0,
          });

          if (searchResults.message) {
            console.error("[ReAct Chat] Vector search returned an error", {
              workspaceId: workspace.id,
              searchQuery,
              vectorDbError: searchResults.message,
            });
            observation = `Search failed: ${searchResults.message}`;
          } else if (searchResults.contextTexts.length === 0) {
            observation =
              "No relevant documents found for this search query.";
          } else {
            allSources.push(...searchResults.sources);
            currentSearchSourceCount = searchResults.sources.length;

            const contextParts = searchResults.contextTexts.map(
              (text, idx) => `[${idx + 1}] ${text}`
            );
            observation = contextParts.join("\n\n");
          }
        }

        // Truncate observation to prevent context overflow
        if (observation.length > OBSERVATION_MAX_CHARS) {
          observation =
            observation.substring(0, OBSERVATION_MAX_CHARS) +
            "\n...(truncated)";
        }

        sendStatusMessage(
          response,
          uuid,
          `**Search results:** ${currentSearchSourceCount} document(s) found`
        );

        reactTrace.push({
          iteration: i + 1,
          searchQuery,
          observationLength: observation.length,
        });

        // Append assistant response and observation to messages for next iteration
        messages.push({ role: "assistant", content: textResponse });
        messages.push({
          role: "user",
          content: `Observation: ${observation}`,
        });
        continue;
      }

      // parsed.type === "incomplete" — LLM did not follow ReAct format.
      // Use the raw text as the final answer (fallback).
      // Note: sources will be empty in this fallback path since no search was completed.
      console.error("[ReAct Chat] LLM produced incomplete ReAct format", {
        iteration: i + 1,
        workspaceId: workspace.id,
        rawOutput: textResponse.slice(0, 200),
      });
      finalAnswer = parsed.text || null;
      break;
    }

    // If we exhausted iterations without a final answer, summarize
    if (finalAnswer === null) {
      sendStatusMessage(
        response,
        uuid,
        "**Reached maximum reasoning steps.** Summarizing collected information..."
      );
      // One final LLM call to summarize
      messages.push({
        role: "user",
        content:
          "You have reached the maximum number of search iterations. Based on all the information gathered so far, please provide your Final Answer now.",
      });
      const { textResponse: summaryResponse } =
        await LLMConnector.getChatCompletion(messages, {
          temperature: workspace?.openAiTemp ?? LLMConnector.defaultTemp,
        });

      if (!summaryResponse) {
        console.error(
          "[ReAct Chat] Summary LLM call returned empty response after exhausting iterations.",
          { workspaceId: workspace.id }
        );
      }

      const summaryParsed = parseReactOutput(summaryResponse || "");
      if (summaryParsed.type === "final_answer") {
        finalAnswer = summaryParsed.answer;
      } else {
        finalAnswer =
          summaryParsed.text ||
          summaryResponse ||
          "Unable to generate a response after multiple reasoning steps.";
      }
    }

    // Guard against empty finalAnswer to avoid storing and streaming blank messages
    if (!finalAnswer || !finalAnswer.trim()) {
      console.error("[ReAct Chat] finalAnswer is empty, cannot stream", {
        workspaceId: workspace.id,
      });
      if (!response.writableEnded) {
        writeResponseChunk(response, {
          uuid,
          type: "abort",
          textResponse: null,
          sources: [],
          close: true,
          error: "Unable to generate a response.",
        });
      }
      return;
    }

    // Send the complete final answer as a single SSE chunk
    if (!response.writableEnded) {
      writeResponseChunk(response, {
        uuid,
        sources: allSources,
        type: "textResponseChunk",
        textResponse: finalAnswer,
        close: true,
        error: false,
      });
    }

    // NOTE: allSources (with duplicates) is sent to the client above.
    // Deduplication is applied only to the database record.
    const uniqueSources = deduplicateSources(allSources);

    // Save to database in a separate try-catch so a DB failure does not send
    // a second abort chunk to the client (the stream is already closed above).
    try {
      const { chat } = await WorkspaceChats.new({
        workspaceId: workspace.id,
        prompt: message,
        response: {
          text: finalAnswer,
          sources: uniqueSources,
          type: "react",
          attachments,
          reactTrace,
        },
        threadId: thread?.id || null,
        user,
      });

      if (!response.writableEnded) {
        writeResponseChunk(response, {
          uuid,
          type: "finalizeResponseStream",
          close: true,
          error: false,
          chatId: chat?.id,
        });
      }
    } catch (dbError) {
      console.error("[ReAct Chat] Failed to persist chat to database", {
        workspaceId: workspace.id,
        error: dbError.message,
      });
      // Stream is already closed to the client — log only, cannot send error chunk
    }
  } catch (error) {
    console.error("[ReAct Chat Error]", {
      message: error.message,
      workspaceId: workspace.id,
      stack: error.stack,
    });
    if (!response.writableEnded) {
      writeResponseChunk(response, {
        uuid,
        type: "abort",
        textResponse: null,
        sources: [],
        close: true,
        error: "An error occurred while processing your request. Please try again.",
      });
    }
  }
}

/**
 * Removes duplicate sources based on their title and published fields.
 * @param {Object[]} sources
 * @returns {Object[]}
 */
function deduplicateSources(sources) {
  const seen = new Set();
  return sources.filter((source) => {
    if (!source || typeof source !== "object") {
      console.error("[ReAct deduplicateSources] Unexpected source shape", {
        source,
      });
      return false;
    }
    const key = `${source.title || ""}::${source.published || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { streamReactChat };

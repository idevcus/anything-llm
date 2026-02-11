const { v4: uuidv4 } = require("uuid");
const { WorkspaceChats } = require("../../../models/workspaceChats");
const { getVectorDbClass, getLLMProvider } = require("../../helpers");
const { writeResponseChunk } = require("../../helpers/chat/responses");
const { chatPrompt, recentChatHistory } = require("../index");
const { parseReactOutput } = require("./outputParser");

const MAX_ITERATIONS = 5;
const OBSERVATION_MAX_CHARS = 2000;

/**
 * Builds the ReAct system prompt by appending tool descriptions and ReAct format
 * instructions to the existing workspace system prompt.
 * @param {string} basePrompt - The workspace's base system prompt
 * @returns {string}
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
 * @param {import("express").Response} response
 * @param {string} uuid
 * @param {string} text
 */
function sendStatusMessage(response, uuid, text) {
  if (response.writableEnded) return;
  writeResponseChunk(response, {
    id: uuid,
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
 * then streams the final answer to the client.
 *
 * @param {import("express").Response} response - Express response object (SSE stream)
 * @param {Object} workspace - Workspace model object
 * @param {string} message - User's message
 * @param {Object|null} user - User model object
 * @param {Object|null} thread - Thread model object
 * @param {Object[]} attachments - Attachments array
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
  const { rawHistory, chatHistory } = await recentChatHistory({
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

      if (!textResponse) {
        writeResponseChunk(response, {
          id: uuid,
          type: "abort",
          textResponse: null,
          sources: [],
          close: true,
          error: "LLM returned an empty response during ReAct reasoning.",
        });
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
            observation = `Search failed: ${searchResults.message}`;
          } else if (searchResults.contextTexts.length === 0) {
            observation =
              "No relevant documents found for this search query.";
          } else {
            // Collect sources for citation
            allSources.push(...searchResults.sources);

            // Build observation from context texts
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
          `**Search results:** ${allSources.length} document(s) found`
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

      // parsed.type === "incomplete" — LLM did not follow ReAct format
      // Use the raw text as the final answer (fallback)
      finalAnswer = parsed.text;
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

    // Stream the final answer to the client
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

    // Deduplicate sources
    const uniqueSources = deduplicateSources(allSources);

    // Save to database
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
  } catch (error) {
    console.error("[ReAct Chat Error]", error);
    if (!response.writableEnded) {
      writeResponseChunk(response, {
        id: uuid,
        type: "abort",
        textResponse: null,
        sources: [],
        close: true,
        error: `ReAct chat error: ${error.message}`,
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
    const key = `${source.title || ""}::${source.published || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { streamReactChat };

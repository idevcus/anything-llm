/**
 * Parses LLM output in the ReAct format.
 * Extracts Thought, Action, Action Input, and Final Answer from the response.
 *
 * Expected format:
 *   Thought: <reasoning>
 *   Action: search_documents
 *   Action Input: {"query": "search query"}
 *
 * Or:
 *   Thought: <reasoning>
 *   Final Answer: <response>
 *
 * @param {string} text - Raw LLM output text
 * @returns {{ type: "action", thought: string, action: string, actionInput: string }
 *          | { type: "final_answer", thought: string, answer: string }
 *          | { type: "incomplete", text: string }}
 */
function parseReactOutput(text) {
  if (!text || typeof text !== "string") {
    return { type: "incomplete", text: text || "" };
  }

  const trimmed = text.trim();

  // Extract Final Answer — check this first since it terminates the loop
  const finalAnswerMatch = trimmed.match(
    /Final\s*Answer\s*:\s*([\s\S]*?)$/i
  );
  if (finalAnswerMatch) {
    const thought = extractThought(trimmed);
    return {
      type: "final_answer",
      thought,
      answer: finalAnswerMatch[1].trim(),
    };
  }

  // Extract Action and Action Input
  const actionMatch = trimmed.match(
    /Action\s*:\s*(\S+)\s*\n\s*Action\s*Input\s*:\s*([\s\S]*?)$/i
  );
  if (actionMatch) {
    const thought = extractThought(trimmed);
    const action = actionMatch[1].trim();
    let actionInput = actionMatch[2].trim();

    // Try to parse JSON action input for the query
    try {
      const parsed = JSON.parse(actionInput);
      actionInput = parsed.query || actionInput;
    } catch (jsonError) {
      // Non-JSON action input is expected when LLM skips JSON formatting.
      // Log only if it looks like it was intended to be JSON (to catch format regressions).
      if (actionInput.trim().startsWith("{")) {
        console.error("[ReAct outputParser] Malformed JSON in Action Input", {
          raw: actionInput.slice(0, 200),
          error: jsonError.message,
        });
      }
    }

    return {
      type: "action",
      thought,
      action,
      actionInput,
    };
  }

  // If neither pattern matches, return incomplete
  return { type: "incomplete", text: trimmed };
}

/**
 * Extracts the Thought portion from the ReAct output.
 * @private
 * @param {string} text - Full ReAct output text
 * @returns {string} The thought text, or empty string if not found
 */
function extractThought(text) {
  const thoughtMatch = text.match(
    /Thought\s*:\s*([\s\S]*?)(?=\n\s*(?:Action|Final\s*Answer)\s*:)/i
  );
  return thoughtMatch ? thoughtMatch[1].trim() : "";
}

module.exports = { parseReactOutput };

import { FoundryLocalManager } from "foundry-local-sdk";

const alias = "qwen2.5-0.5b";
const appName = "ToolCallingDemo";

let activeManager: any = null;
let activeModel: any = null;

/**
 * Kept for compatibility with existing startup flow.
 * This simplified version loads on-demand per request.
 */
export async function preloadFoundryModels(): Promise<void> {
  return;
}

/**
 * Ask the local Foundry model a question using the provided context.
 */
async function askWithContext(userPrompt: string, context: string): Promise<string> {
  FoundryLocalManager.create({ appName });
  const manager = (FoundryLocalManager as any).instance;
  activeManager = manager;

  await manager.startWebService();

  const model = await manager.catalog.getModel(alias);
  if (!model) {
    throw new Error(`Foundry model not found: ${alias}`);
  }
  activeModel = model;

  if (!model.isCached) {
    console.log(`Downloading ${alias}...`);
    await model.download();
  }

  await model.load();

  const chatClient = model.createChatClient();
  chatClient.settings.temperature = 0;

  const messages = [
    {
      role: "system",
      content: `You are a helpful assistant. Use the following context to answer the user's question.\n\nContext:\n${context}`,
    },
    { role: "user", content: userPrompt },
  ];

  const response = await chatClient.completeChat(messages);
  const answer = response?.choices?.[0]?.message?.content;

  await model.unload();
  await manager.stopWebService();
  activeModel = null;
  activeManager = null;

  if (!answer) {
    throw new Error("No response content from Foundry model");
  }

  return answer;
}

export async function generateResponse(userPrompt: string, context: string): Promise<string> {
  return askWithContext(userPrompt, context);
}

/**
 * Best-effort cleanup hook for server shutdown lifecycle.
 */
export async function cleanupFoundryLocal(): Promise<void> {
  try {
    if (activeModel) {
      await activeModel.unload();
    }
  } finally {
    activeModel = null;
    if (activeManager) {
      await Promise.resolve(activeManager.stopWebService());
      activeManager = null;
    }
  }
}



import { AzureOpenAI } from "openai";

// Ensure required environment variables are set
const requiredEnvVars = ["azureOpenAiGpt4oKey", "azureOpenAiDalleUrl"];

requiredEnvVars.forEach((envVar) => {
  if (!process.env[envVar])
    throw new Error(`Missing environment variable: ${envVar}`);
});

// Get environment variables
const azureOpenAIKey = process.env.azureOpenAiGpt4oKey!;
const azureOpenAIEndpoint = process.env.azureOpenAiDalleUrl!;
const azureOpenAIDeployment = "gpt-4o";
const openAIVersion = "2025-01-01-preview";

// Initialize OpenAI client
const openAIClient = new AzureOpenAI({
  endpoint: azureOpenAIEndpoint,
  apiKey: azureOpenAIKey,
  apiVersion: openAIVersion,
});

export async function getGpt4oResponse(prompt: string, data: any) {
  try {
    const response = await openAIClient.chat.completions.create({
      model: azureOpenAIDeployment, // Must match deployment name in Azure
      response_format: {
        type: "json_object", // Specify the response format
      }, // Specify the response format
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: JSON.stringify(data) },
      ],
    });

    return JSON.parse(response.choices[0].message.content); // or response.choices[0].message.content if you want just the reply
  } catch (error: any) {
    console.error(
      "Azure OpenAI GPT-4o Error:",
      error?.response?.data || error.message
    );
    throw new Error("Failed to get GPT-4o response");
  }
}
// lib/gemini-client.js
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function queryGemini(userQuery, products) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    
    const prompt = `
    You are a helpful sales assistant for ReliableParts, an appliance parts distributor.
    
    Customer Query: ${userQuery}
    
    Available Products (first 10):
    ${JSON.stringify(products.slice(0, 10), null, 2)}
    
    Please provide:
    1. A helpful response to the customer's query
    2. Recommend specific products if relevant
    3. Suggest related searches
    
    Format your response as JSON with fields: answer, recommendedProducts, suggestions
    `;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Parse the JSON response
    try {
      return JSON.parse(text);
    } catch {
      // Fallback if Gemini doesn't return valid JSON
      return {
        answer: text,
        recommendedProducts: [],
        suggestions: []
      };
    }
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw error;
  }
}
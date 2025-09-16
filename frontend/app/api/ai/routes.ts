// app/api/ai/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query } = body;
    
    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    // Fetch products from your API
    let products = [];
    try {
      const productsResponse = await fetch('http://35.226.177.85/api/products');
      products = await productsResponse.json();
    } catch (error) {
      console.error('Error fetching products:', error);
    }

    // If Gemini API key exists, use AI
    if (process.env.GEMINI_API_KEY) {
      try {
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        
        const prompt = `
        You are a helpful sales assistant for ReliableParts, an appliance parts distributor.
        
        Customer Query: "${query}"
        
        Available Products (showing sample):
        ${JSON.stringify(products.slice(0, 10).map(p => ({
          sku: p.sku,
          name: p.name,
          category: p.category,
          price: p.price,
          in_stock: p.in_stock
        })), null, 2)}
        
        Total products available: ${products.length}
        
        Instructions:
        1. Understand what the customer is looking for
        2. Recommend the most relevant products from the list
        3. Provide helpful suggestions
        
        Respond in a friendly, professional manner. Keep the response concise.
        
        Format your response as valid JSON with these exact fields:
        {
          "answer": "your helpful response here",
          "productSkus": ["SKU1", "SKU2"],
          "suggestions": ["suggestion1", "suggestion2", "suggestion3"]
        }
        `;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        // Try to parse Gemini's response as JSON
        let aiResponse;
        try {
          // Extract JSON from the response
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            aiResponse = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('No JSON found in response');
          }
        } catch (parseError) {
          console.log('Could not parse Gemini response as JSON, using text');
          aiResponse = {
            answer: text.substring(0, 500), // Limit response length
            productSkus: [],
            suggestions: []
          };
        }
        
        // Map SKUs back to full product objects
        const recommendedProducts = aiResponse.productSkus ? 
          products.filter((p: any) => aiResponse.productSkus.includes(p.sku)).slice(0, 5) :
          [];
        
        // If no products were recommended by AI, do basic filtering
        if (recommendedProducts.length === 0) {
          const queryLower = query.toLowerCase();
          const filtered = products.filter((p: any) => 
            p.name?.toLowerCase().includes(queryLower) ||
            p.category?.toLowerCase().includes(queryLower) ||
            p.sku?.toLowerCase().includes(queryLower)
          ).slice(0, 5);
          
          recommendedProducts.push(...filtered);
        }
        
        return NextResponse.json({
          answer: aiResponse.answer || `I found ${recommendedProducts.length} products that might interest you.`,
          recommendedProducts: recommendedProducts,
          relatedSuggestions: aiResponse.suggestions || [
            'Try filtering by brand',
            'Check product compatibility',
            'View similar items'
          ]
        });
        
      } catch (geminiError) {
        console.error('Gemini API Error:', geminiError);
        // Fall back to basic search if Gemini fails
        const queryLower = query.toLowerCase();
        const filteredProducts = products.filter((p: any) => 
          p.name?.toLowerCase().includes(queryLower) ||
          p.category?.toLowerCase().includes(queryLower) ||
          p.sku?.toLowerCase().includes(queryLower)
        ).slice(0, 5);
        
        return NextResponse.json({
          answer: `I found ${filteredProducts.length} products matching "${query}". ${
            filteredProducts.length > 0 
              ? `The top result is ${filteredProducts[0].name}.`
              : 'Try searching for specific brands or product types.'
          }`,
          recommendedProducts: filteredProducts,
          relatedSuggestions: [
            'Check product availability',
            'View specifications',
            'Compare prices'
          ]
        });
      }
    } else {
      // No Gemini API key - use basic search
      const queryLower = query.toLowerCase();
      const filteredProducts = products.filter((p: any) => 
        p.name?.toLowerCase().includes(queryLower) ||
        p.category?.toLowerCase().includes(queryLower) ||
        p.sku?.toLowerCase().includes(queryLower) ||
        p.manufacturer?.toLowerCase().includes(queryLower)
      ).slice(0, 5);
      
      return NextResponse.json({
        answer: `Found ${filteredProducts.length} products matching "${query}". ${
          filteredProducts.length > 0 
            ? `Top result: ${filteredProducts[0].name} (${filteredProducts[0].sku}) - $${filteredProducts[0].price}`
            : 'Try searching for brands like Whirlpool, GE, or product types like pump, filter.'
        }`,
        recommendedProducts: filteredProducts,
        relatedSuggestions: [
          'Try searching by brand',
          'Look for specific part types',
          'Check compatibility'
        ]
      });
    }
    
  } catch (error) {
    console.error('API Route Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process query', 
        answer: 'Sorry, I encountered an error. Please try again.',
        recommendedProducts: [],
        relatedSuggestions: ['Try a simpler search', 'Contact support', 'Browse categories']
      },
      { status: 500 }
    );
  }
}
// lib/ai-assistant.js (JavaScript to avoid TypeScript issues)

export async function handleAIQuery(query) {
  try {
    // Fetch products from your API
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://35.226.177.85'}/api/products`);
    const products = await response.json();
    
    // Filter products based on query
    const queryLower = query.toLowerCase();
    const filteredProducts = products.filter(product => 
      product.name?.toLowerCase().includes(queryLower) ||
      product.category?.toLowerCase().includes(queryLower) ||
      product.manufacturer?.toLowerCase().includes(queryLower) ||
      product.sku?.toLowerCase().includes(queryLower)
    ).slice(0, 5);
    
    // Generate response
    return {
      answer: `Found ${filteredProducts.length} products matching "${query}"`,
      products: filteredProducts,
      suggestions: generateSuggestions(query)
    };
  } catch (error) {
    console.error('AI Assistant Error:', error);
    return {
      answer: 'I can help you find parts. Try asking about specific brands or categories.',
      products: [],
      suggestions: ['Show Whirlpool parts', 'List dishwasher pumps', 'Find parts under $50']
    };
  }
}

function generateSuggestions(query) {
  const suggestions = [
    'Show compatible parts',
    'Compare prices',
    'Check availability',
    'View specifications',
    'Find alternatives'
  ];
  return suggestions.slice(0, 3);
}
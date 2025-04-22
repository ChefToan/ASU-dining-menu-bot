import axios from 'axios';

// Simple cache to avoid duplicate API calls for the same dish
const imageCache: Map<string, string> = new Map();

/**
 * Simplify a dish name to improve search results
 * @param dishName The original dish name
 * @returns A simplified version for better image search results
 */
function simplifyDishName(dishName: string): string {
    // Remove specific serving information, quantities, etc.
    let simplified = dishName
        .replace(/\([^)]*\)/g, '') // Remove content in parentheses
        .replace(/\d+ pieces?/gi, '')
        .replace(/\d+ oz/gi, '')
        .replace(/\d+ slices?/gi, '')
        .replace(/\d+ servings?/gi, '')
        .replace(/with.*$/i, '') // Remove "with..." descriptions
        .replace(/topped with.*$/i, '')
        .replace(/served with.*$/i, '');

    // Identify the main food item from complex names
    const foodTerms = [
        "chicken", "beef", "pork", "fish", "salmon", "tuna", "shrimp",
        "tofu", "rice", "pasta", "noodles", "pizza", "burger", "sandwich",
        "salad", "soup", "stew", "curry", "taco", "burrito", "wrap",
        "bread", "roll", "bagel", "muffin", "pastry", "cake", "pie",
        "cookie", "brownie", "ice cream", "yogurt", "fruit"
    ];

    // Check if the name contains any recognizable food terms
    const foundTerms = foodTerms.filter(term => simplified.toLowerCase().includes(term));

    if (foundTerms.length > 0) {
        // If we find specific food terms, we could optionally further simplify to just that term
        // For example: "Grilled Chicken with Herbs and Sauce" -> "Grilled Chicken"
        // But here we'll keep the full simplified name for better context
    }

    // Trim and clean up
    simplified = simplified.trim().replace(/\s+/g, ' ');

    // If the simplification removed too much, return original
    if (simplified.length < 3) {
        return dishName;
    }

    return simplified;
}

/**
 * Search for an image of a dish using search APIs
 * @param query The search query for the dish
 * @returns URL of the image or empty string if no image found
 */
export async function searchDishImage(query: string): Promise<string> {
    // Normalize query to create consistent cache keys
    const normalizedQuery = query.trim().toLowerCase();

    // Check if we already have this image in cache
    if (imageCache.has(normalizedQuery)) {
        return imageCache.get(normalizedQuery) || '';
    }

    try {
        // Initial attempt with original query
        let imageUrl = await tryFindDishImage(query);

        // If the original query doesn't work, try a simplified version
        if (!imageUrl) {
            const simplifiedQuery = simplifyDishName(query);
            console.log(`Simplified dish name from "${query}" to "${simplifiedQuery}"`);

            // Only try simplified version if it's different from original
            if (simplifiedQuery !== query) {
                imageUrl = await tryFindDishImage(simplifiedQuery);
            }
        }

        // If we found an image, cache and return it
        if (imageUrl) {
            imageCache.set(normalizedQuery, imageUrl);
            return imageUrl;
        }

        // If still no image, use a placeholder
        const encodedFoodName = encodeURIComponent(query.substring(0, 20)); // Limit length for URL
        const fallbackUrl = `https://via.placeholder.com/600x400/FFBB5C/000000?text=${encodedFoodName}`;

        console.log(`Using fallback placeholder image for: ${query}`);
        imageCache.set(normalizedQuery, fallbackUrl);
        return fallbackUrl;

    } catch (error) {
        console.error('Error searching for image:', error);
        return ''; // Return empty string if unexpected error occurs
    }
}

/**
 * Attempt to find an image using available API services
 * @param query The search query
 * @returns Image URL or empty string
 */
async function tryFindDishImage(query: string): Promise<string> {
    // First try SerpAPI if available (generally more comprehensive)
    if (process.env.SERPAPI_KEY) {
        try {
            console.log(`Trying SerpAPI for: ${query}`);
            const response = await axios.get('https://serpapi.com/search', {
                params: {
                    q: `${query} food dish photo`,  // Added "photo" for better results
                    engine: 'google_images',
                    api_key: process.env.SERPAPI_KEY,
                    tbm: 'isch', // Google images search
                    ijn: '0', // First page
                    num: '5', // Get more results to choose from
                    safe: 'active' // Safe search
                }
            });

            if (response.data && response.data.images_results && response.data.images_results.length > 0) {
                // Try to find an image that looks like food (square-ish aspect ratio often works better for food)
                const bestImages = response.data.images_results.filter((img: any) => {
                    // Check if image has reasonable dimensions for food
                    const aspectRatio = img.width / img.height;
                    return aspectRatio > 0.7 && aspectRatio < 1.5; // Somewhat square-ish
                });

                if (bestImages.length > 0) {
                    return bestImages[0].original;
                }
                return response.data.images_results[0].original;
            }
        } catch (error: any) {
            console.error('SerpAPI error:', error.message);
            // Continue to next method if SerpAPI fails
        }
    }

    // Alternative method if serpapi is not available or fails
    // Using free API like Pixabay (less accurate but free)
    if (process.env.PIXABAY_KEY) {
        try {
            const response = await axios.get('https://pixabay.com/api/', {
                params: {
                    key: process.env.PIXABAY_KEY,
                    q: query.replace(/\s+/g, '+'), // Replace spaces with plus signs
                    image_type: 'photo',
                    per_page: 3, // Pixabay requires minimum value of 3
                    safesearch: true
                }
            });

            if (response.data && response.data.hits && response.data.hits.length > 0) {
                return response.data.hits[0].webformatURL;
            }
        } catch (error: any) {
            // Log specific error message if available
            if (error.response && error.response.data) {
                console.error(`Pixabay API error: ${error.response.data}`);
            } else {
                console.error('Error with Pixabay API:', error.message);
            }
            // Continue to fallback options
        }
    }

    // No image found from APIs
    return '';
}

/**
 * Clear the image cache if it gets too large
 * This can be called periodically if needed
 */
export function clearImageCache() {
    imageCache.clear();
}